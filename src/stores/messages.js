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
        lastReadTimestamps: JSON.parse(localStorage.getItem("chat_last_read") || "{}"),

        // ✅ created_at based cursor
        lastSeenCreatedAt: {},
        catchupLocks: {},
    }),


    getters: {
        messagesInRoom: (state) => (roomId) => state.byRoom[roomId] ?? [],
        hasUnread: (state) => (roomId) => {
            const msgs = state.byRoom[roomId] || [];
            if (msgs.length === 0) return false;
            const lastMsg = msgs[msgs.length - 1];
            const lastRead = state.lastReadTimestamps[roomId] || 0;
            return new Date(lastMsg.created_at).getTime() > lastRead;
        },
    },

    actions: {
        markAsRead(roomId) {
            if (!roomId) return;
            this.lastReadTimestamps[roomId] = Date.now();
            localStorage.setItem("chat_last_read", JSON.stringify(this.lastReadTimestamps));
        },

        _upsert(roomId, normalized) {
            if (!roomId || !normalized) return;

            if (!this.byRoom[roomId]) this.byRoom[roomId] = [];
            const list = this.byRoom[roomId];

            const idx = list.findIndex((m) => m.id === normalized.id);
            if (idx === -1) list.push(normalized);
            else list[idx] = normalized;

            list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

            const last = list[list.length - 1];
            if (last?.created_at) this.lastSeenCreatedAt[roomId] = last.created_at;
        },


        async _catchUp(roomId) {
            if (!roomId) return;
            if (this.catchupLocks[roomId]) return;
            this.catchupLocks[roomId] = true;

            try {
                const since = this.lastSeenCreatedAt[roomId];
                if (!since) return;

                const { data, error } = await supabase
                    .from("messages")
                    .select("id, room_id, user_id, text, created_at, reply_to_id")
                    .eq("room_id", roomId)
                    .gte("created_at", since)
                    .order("created_at", { ascending: true })
                    .limit(200);

                if (error) {
                    console.warn("[messages.catchup] error", error);
                    return;
                }
                if (!data?.length) return;

                const profilesStore = useProfilesStore();
                const userIds = data.map((r) => r.user_id).filter(Boolean);
                await profilesStore.ensureLoaded(userIds);

                for (const row of data) {
                    const normalized = normalizeMessage({ ...row, profiles: profilesStore.byId[row.user_id] });
                    this._upsert(roomId, normalized);
                }

                const last = this.byRoom[roomId]?.[this.byRoom[roomId].length - 1];
                if (last?.created_at) this.lastSeenCreatedAt[roomId] = last.created_at;

                console.log("[messages.catchup] applied", { roomId, added: data.length, since });
            } finally {
                this.catchupLocks[roomId] = false;
            }
        },


        async load(roomId, limit = 100) {
            console.log("[messages.load] called", { roomId, limit });

            if (!roomId) {
                console.warn("[messages.load] aborted: no roomId");
                return;
            }

            const { data, error } = await supabase
                .from("messages")
                .select("id, room_id, user_id, text, created_at, reply_to_id")
                .eq("room_id", roomId)
                .order("created_at", { ascending: false }) // ✅ newest first (correct with UUID ids)
                .limit(limit);

            console.log("[messages.load] result", {
                roomId,
                count: data?.length ?? 0,
                error,
                sample: data?.[0],
            });

            if (error) {
                console.error("[messages.load] query error", error);
                throw error;
            }

            const rows = (data ?? []).slice().reverse(); // ✅ oldest -> newest

            const profilesStore = useProfilesStore();
            const userIds = rows.map((r) => r.user_id).filter(Boolean);
            await profilesStore.ensureLoaded(userIds);

            const normalizedList = rows.map((row) =>
                normalizeMessage({ ...row, profiles: profilesStore.byId[row.user_id] })
            );

            // ✅ upsert merge to avoid ghosts/duplications
            const prev = this.byRoom[roomId] ?? [];
            const map = new Map(prev.map((m) => [m.id, m]));
            for (const m of normalizedList) map.set(m.id, m);

            this.byRoom[roomId] = Array.from(map.values()).sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );

            const last = this.byRoom[roomId][this.byRoom[roomId].length - 1];
            if (last?.created_at) this.lastSeenCreatedAt[roomId] = last.created_at;

            console.log("[messages.load] stored", {
                roomId,
                storedCount: this.byRoom[roomId]?.length,
                lastSeenCreatedAt: this.lastSeenCreatedAt[roomId],
            });

            this.markAsRead(roomId);
        },



        subscribe(roomId) {
            if (!roomId) return;

            // אם קיים אבל סגור/נסגר — נזרוק ונבנה מחדש
            const existing = this.subs[roomId];
            if (existing) {
                const st = existing.state;
                if (st === "joined" || st === "joining") return;
                // closed / errored / leaving וכו'
                void this.unsubscribe(roomId);
            }

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

                        this._upsert(roomId, normalized);
                    }
                );

            // ✅ תמיד לשמור את ה-channel לפני subscribe כדי ש-retry יראה אותו
            this.subs[roomId] = ch;

            ch.subscribe((status) => {
                console.log("[messages.subscribe]", roomId, status, "state:", ch.state, new Date().toLocaleTimeString());

                if (status === "SUBSCRIBED") {
                    // ✅ catchup אחרי התחברות
                    void this._catchUp(roomId);
                    return;
                }

                // ✅ כל מצב בעייתי — resubscribe
                if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
                    setTimeout(() => {
                        // אם זה עדיין הערוץ הנוכחי
                        if (this.subs[roomId] === ch) {
                            this.unsubscribe(roomId).finally(() => this.subscribe(roomId));
                        }
                    }, 600);
                }
            });

            // ✅ watchdog: אם הערוץ נהיה closed בלי סטטוס, נרים מחדש
            setTimeout(() => {
                if (this.subs[roomId] === ch && ch.state === "closed") {
                    console.warn("[messages.subscribe] watchdog: channel is closed, resubscribing", roomId);
                    this.unsubscribe(roomId).finally(() => this.subscribe(roomId));
                }
            }, 1500);
        },


        async unsubscribe(roomId) {
            const ch = this.subs[roomId];
            if (!ch) return;

            try { await ch.unsubscribe(); } catch (_) { }
            try { await supabase.removeChannel(ch); } catch (_) { }

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
                    reply_to_id: replyToId,
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

            // ✅ upsert (prevents ghosts if realtime also arrives)
            this._upsert(roomId, normalized);

            this.markAsRead(roomId);

            console.log("[messages.send] identity", {
                sessionUserId: session.value?.user?.id,
                roomId,
                replyToId,
                textLen: clean.length,
            });

            return normalized;
        },
    },
});
