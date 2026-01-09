import { defineStore } from "pinia";
import { supabase } from "../services/supabase";
import { session, profile } from "../stores/auth";

function colorFromId(id) {
    // צבע עקבי מאותו user_id (פשוט ויעיל)
    const s = String(id ?? "x");
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    return `hsl(${hue} 80% 65%)`;
}

function fmtTime(ts) {
    try {
        return new Date(ts).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
    } catch {
        return "";
    }
}
function normalizeMsg(row) {
    const nickname = row?.profiles?.nickname ?? "User";
    const initial = (nickname?.[0] ?? "U").toUpperCase();
    const time = row?.created_at
        ? new Date(row.created_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
        : "";

    // צבע יציב לפי user_id (fallback)
    const uid = row?.user_id ?? "";
    let hash = 0;
    for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) | 0;
    const hue = Math.abs(hash) % 360;
    const userColor = `hsl(${hue} 80% 60%)`;

    return {
        id: row.id,
        room_id: row.room_id,
        user_id: row.user_id,
        text: row.text ?? "",
        created_at: row.created_at,
        profiles: row.profiles ?? null,

        // fields your UI uses:
        userName: nickname,
        userInitial: initial,
        userColor,
        time,
    };
}

function normalizeRow(row) {
    const name = row?.profiles?.nickname ?? "User";
    return {
        id: row.id,
        room_id: row.room_id,
        user_id: row.user_id,
        text: String(row?.text ?? ""),
        created_at: row.created_at,
        // fields the ChatPanel expects:
        userName: name,
        userInitial: String(name).trim()[0] ?? "🙂",
        userColor: colorFromId(row.user_id),
        time: fmtTime(row.created_at),
    };
}

export const useMessagesStore = defineStore("messages", {
    state: () => ({
        byRoom: {}, // roomId -> uiMessages[]
        subs: {},   // roomId -> realtime channel
    }),

    getters: {
        messagesInRoom: (state) => (roomId) => state.byRoom[roomId] ?? [],
    },

    actions: {
        async load(roomId, limit = 100) {
            const { data, error } = await supabase
                .from("messages")
                .select("id, room_id, user_id, text, created_at, profiles(nickname, avatar_url)")
                .eq("room_id", roomId)
                .order("created_at", { ascending: true })
                .limit(limit);

            if (error) throw error;

            this.byRoom[roomId] = (data ?? []).map(normalizeMsg);

        },

        subscribe(roomId) {
            if (this.subs[roomId]) return;

            const ch = supabase
                .channel(`messages:${roomId}`)
                .on(
                    "postgres_changes",
                    { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
                    (payload) => {
                        if (!this.byRoom[roomId]) this.byRoom[roomId] = [];

                        const raw = payload.new;

                        // realtime מגיע בלי join של profiles → ננסה להשלים רק לעצמנו
                        const myId = session.value?.user?.id;
                        const enriched =
                            raw.user_id === myId
                                ? { ...raw, profiles: { nickname: profile.value?.nickname ?? "Me" } }
                                : raw;

                        const uiMsg = normalizeMsg(payload.new);

                        const exists = this.byRoom[roomId].some((m) => m.id === uiMsg.id);
                        if (!exists) this.byRoom[roomId].push(uiMsg);
                    }
                )
                .subscribe((status) => {
                    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                        console.warn("[messages] realtime status:", status, "roomId:", roomId);
                    }
                });

            this.subs[roomId] = ch;
        },

        async unsubscribe(roomId) {
            const ch = this.subs[roomId];
            if (!ch) return;
            await supabase.removeChannel(ch);
            delete this.subs[roomId];
        },

        async send(roomId, text) {
            const userId = session.value?.user?.id;
            if (!userId) throw new Error("Not authenticated");

            const clean = String(text ?? "").trim();
            if (!clean) return;

            const { data, error } = await supabase
                .from("messages")
                .insert({ room_id: roomId, user_id: userId, text: clean })
                .select("id, room_id, user_id, text, created_at, profiles(nickname, avatar_url)")
                .single();

            if (error) throw error;

            const uiMsg = normalizeRow(data);

            if (!this.byRoom[roomId]) this.byRoom[roomId] = [];
            const exists = this.byRoom[roomId].some((m) => m.id === uiMsg.id);
            if (!exists) this.byRoom[roomId].push(uiMsg);

            return uiMsg;
        },
    },
});
