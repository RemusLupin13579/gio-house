import { defineStore } from "pinia";
import { supabase } from "../services/supabase";
import { session, profile } from "../stores/auth";
import { useProfilesStore } from "../stores/profiles";

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

function normalizeMessage(row) {
    const profColor = row?.profiles?.color;
    const userColor = profColor || colorFromUserId(row?.user_id);

    const userName =
        row?.profiles?.nickname ||
        row?.nickname ||
        (row?.user_id === session.value?.user?.id ? (profile.value?.nickname ?? "Me") : "User");

    return {
        id: row?.id ?? `${row?.user_id ?? "u"}:${row?.created_at ?? Date.now()}`,
        room_id: row?.room_id ?? null,
        user_id: row?.user_id ?? null,
        text: String(row?.text ?? ""),
        created_at: row?.created_at ?? null,
        userName,
        userInitial: initialFromName(userName),
        userColor,
        time: formatTime(row?.created_at),
        avatarUrl: row?.profiles?.avatar_url ?? null,
        reply_to_id: row?.reply_to_id ?? null,
    };
}

export const useMessagesStore = defineStore("messages", {
    state: () => ({
        byRoom: {},
        subs: {},
        lastReadTimestamps: JSON.parse(localStorage.getItem('chat_last_read') || '{}')
    }),

    getters: {
        messagesInRoom: (state) => (roomId) => state.byRoom[roomId] ?? [],
        hasUnread: (state) => (roomId) => {
            const msgs = state.byRoom[roomId] || [];
            if (msgs.length === 0) return false;
            const lastMsg = msgs[msgs.length - 1];
            const lastRead = state.lastReadTimestamps[roomId] || 0;
            return new Date(lastMsg.created_at).getTime() > lastRead;
        }
    },

    actions: {
        markAsRead(roomId) {
            if (!roomId) return;
            this.lastReadTimestamps[roomId] = Date.now();
            localStorage.setItem('chat_last_read', JSON.stringify(this.lastReadTimestamps));
        },

        async load(roomId, limit = 100) {
            if (!roomId) return;
            const { data, error } = await supabase
                .from("messages")
                .select("id, room_id, user_id, text, created_at, reply_to_id")
                .eq("room_id", roomId)
                .order("created_at", { ascending: true })
                .limit(limit);

            if (error) throw error;

            const profilesStore = useProfilesStore();
            const userIds = (data ?? []).map(r => r.user_id);
            await profilesStore.ensureLoaded(userIds);

            this.byRoom[roomId] = (data ?? []).map(row =>
                normalizeMessage({ ...row, profiles: profilesStore.byId[row.user_id] })
            );

            this.markAsRead(roomId);
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

        async send(roomId, text, replyToId = null) {
            const userId = session.value?.user?.id;
            if (!userId || !roomId) throw new Error("Missing auth or roomId");

            const clean = String(text ?? "").trim();
            if (!clean) return;

            const { data, error } = await supabase
                .from("messages")
                .insert({
                    room_id: roomId,
                    user_id: userId,
                    text: clean,
                    reply_to_id: replyToId
                })
                .select("id, room_id, user_id, text, created_at, reply_to_id")
                .single();

            if (error) throw error;

            const profilesStore = useProfilesStore();
            await profilesStore.ensureLoaded([userId]);

            const normalized = normalizeMessage({
                ...data,
                profiles: profilesStore.byId[userId],
            });

            if (!this.byRoom[roomId]) this.byRoom[roomId] = [];
            this.byRoom[roomId].push(normalized);

            this.markAsRead(roomId);
            return normalized;
        },
    },
});