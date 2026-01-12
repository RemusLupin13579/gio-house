import { defineStore } from "pinia";
import { supabase } from "../services/supabase";
import { session, profile } from "../stores/auth";
import { useProfilesStore } from "../stores/profiles";

/**
 * יוצר צבע עקבי לפי user_id (כדי שלא תצטרך לשמור DB)
 */
function colorFromUserId(userId) {
    const s = String(userId || "anon");
    let hash = 0;
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    const hue = hash % 360;
    return `hsl(${hue} 85% 65%)`;
}

function initialFromName(name) {
    const n = String(name || "").trim();
    return n ? n[0].toUpperCase() : "🙂";
}

function formatTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

/**
 * ✅ normalize: תמיד מחזיר אובייקט “מוכן ל-UI”
 * גם אם profiles חסר, גם אם text null, גם אם created_at מוזר.
 */
function normalizeMessage(row) {
    const profColor = row?.profiles?.color;
    const userColor = profColor || colorFromUserId(row?.user_id);

    const userName =
        row?.profiles?.nickname ||
        row?.nickname ||
        (row?.user_id === session.value?.user?.id ? (profile.value?.nickname ?? "Me") : "User");

    return {
        id: row?.id ?? `${row?.user_id ?? "u"}:${row?.created_at ?? Date.now()}`,
        room_id: row?.room_id ?? row?.roomId ?? null,
        user_id: row?.user_id ?? null,
        text: String(row?.text ?? ""),
        created_at: row?.created_at ?? null,

        // ✅ fields שה-ChatPanel שלך מצפה להם
        userName,
        userInitial: initialFromName(userName),
        userColor: colorFromUserId(row?.user_id),
        time: formatTime(row?.created_at),
        avatarUrl: row?.profiles?.avatar_url ?? null,
    };
}

export const useMessagesStore = defineStore("messages", {
    state: () => ({
        byRoom: {}, // roomId -> normalized messages[]
        subs: {},   // roomId -> realtime channel
    }),

    getters: {
        messagesInRoom: (state) => (roomId) => state.byRoom[roomId] ?? [],
    },

    actions: {
        async load(roomId, limit = 100) {
            if (!roomId) return;

            // ✅ טוענים הודעות בלי join (יותר יציב ומהיר)
            const { data, error } = await supabase
                .from("messages")
                .select("id, room_id, user_id, text, created_at")
                .eq("room_id", roomId)
                .order("created_at", { ascending: true })
                .limit(limit);

            if (error) throw error;

            // ✅ מביאים את כל הפרופילים של המשתמשים שנמצאים בהודעות (batch)
            const profilesStore = useProfilesStore();
            const userIds = (data ?? []).map(r => r.user_id);
            await profilesStore.ensureLoaded(userIds);

            // ✅ מנרמלים עם profiles מה-cache
            this.byRoom[roomId] = (data ?? []).map(row =>
                normalizeMessage({ ...row, profiles: profilesStore.byId[row.user_id] })
            );
        },

        subscribe(roomId) {
            if (!roomId) return;
            if (this.subs[roomId]) return;

            const profilesStore = useProfilesStore();

            const ch = supabase
                .channel(`messages:${roomId}`)
                .on(
                    "postgres_changes",
                    { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
                    async (payload) => {
                        const raw = payload?.new;
                        if (!raw) return;

                        // ✅ טוענים פרופיל רק אם חסר (ללא query לכל הודעה אם כבר יש)
                        await profilesStore.ensureLoaded([raw.user_id]);

                        const normalized = normalizeMessage({
                            ...raw,
                            profiles: profilesStore.byId[raw.user_id],
                        });

                        if (!this.byRoom[roomId]) this.byRoom[roomId] = [];
                        const exists = this.byRoom[roomId].some((m) => m.id === normalized.id);
                        if (!exists) this.byRoom[roomId].push(normalized);
                    }
                )
                .subscribe();

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
            if (!roomId) throw new Error("Missing roomId");

            const clean = String(text ?? "").trim();
            if (!clean) return;

            // ✅ שולחים הודעה (בלי join)
            const { data, error } = await supabase
                .from("messages")
                .insert({ room_id: roomId, user_id: userId, text: clean })
                .select("id, room_id, user_id, text, created_at")
                .single();

            if (error) throw error;

            // ✅ נוודא שהפרופיל שלי קיים ב-cache לפני normalize
            const profilesStore = useProfilesStore();
            await profilesStore.ensureLoaded([userId]);

            const normalized = normalizeMessage({
                ...data,
                profiles: profilesStore.byId[userId],
            });

            if (!this.byRoom[roomId]) this.byRoom[roomId] = [];
            const exists = this.byRoom[roomId].some((m) => m.id === normalized.id);
            if (!exists) this.byRoom[roomId].push(normalized);
            return normalized;
        },
    },
});
