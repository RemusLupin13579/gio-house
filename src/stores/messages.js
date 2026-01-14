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
        client_id: row?.client_id ?? null,
    };
}

function uuidish() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
}

function isAbortLike(e) {
    const msg = String(e?.message || "");
    return e?.name === "AbortError" || msg.includes("AbortError") || msg.includes("aborted");
}

/**
 * ✅ Direct REST call (PostgREST) with true AbortController timeout.
 */
async function restRequest(pathWithQuery, { method = "GET", body = null, signal, headers = {} } = {}) {
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const { data: sessData } = await supabase.auth.getSession();
    const accessToken = sessData?.session?.access_token;

    if (!baseUrl || !anonKey) throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
    if (!accessToken) throw new Error("No access token (not authenticated)");

    const url = `${baseUrl}/rest/v1/${pathWithQuery}`;

    const res = await fetch(url, {
        method,
        signal,
        headers: {
            apikey: anonKey,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            ...headers,
        },
        body: body ? JSON.stringify(body) : null,
    });

    const text = await res.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch (_) {
        // keep json null
    }

    if (!res.ok) {
        const msg = json?.message || json?.hint || text || `HTTP ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        err.payload = json;
        throw err;
    }

    return json;
}

export const useMessagesStore = defineStore("messages", {
    state: () => ({
        byRoom: {},
        subs: {},
        lastReadTimestamps: JSON.parse(localStorage.getItem("chat_last_read") || "{}"),
        lastSeenCreatedAt: {},
        _guardsInstalled: false,
        _reconnectLock: false,
    }),

    getters: {
        messagesInRoom: (state) => (roomId) => state.byRoom[roomId] ?? [],
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

        installRealtimeGuards() {
            if (this._guardsInstalled) return;
            this._guardsInstalled = true;

            const kick = (why) => setTimeout(() => void this.ensureRealtime(why), 120);

            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible") kick("visibility-visible");
            });
            window.addEventListener("focus", () => kick("window-focus"));
            window.addEventListener("online", () => kick("online"));
            window.addEventListener("pageshow", () => kick("pageshow"));
        },

        async ensureRealtime(reason = "manual") {
            if (this._reconnectLock) return;
            this._reconnectLock = true;

            try {
                try {
                    await supabase.auth.refreshSession();
                } catch (e) {
                    console.warn("[messages.ensureRealtime] refreshSession failed", e?.message || e);
                }

                // reconnect realtime (helps when tab was backgrounded / laptop sleep)
                try { supabase.realtime?.disconnect?.(); } catch (_) { }
                try { supabase.realtime?.connect?.(); } catch (_) { }

                // rebuild room channels
                const rooms = Object.keys(this.subs || {});
                for (const roomId of rooms) {
                    console.warn("[messages.ensureRealtime] rebuild channel", { reason, roomId });
                    await this.unsubscribe(roomId);
                    this.subscribe(roomId);
                }
            } finally {
                this._reconnectLock = false;
            }
        },

        async load(roomId, limit = 100) {
            console.log("[messages.load] called", { roomId, limit });

            const { data, error } = await supabase
                .from("messages")
                .select("id, room_id, user_id, text, created_at, reply_to_id, client_id")
                .eq("room_id", roomId)
                .order("created_at", { ascending: false })
                .limit(limit);

            console.log("[messages.load] result", { roomId, count: data?.length ?? 0, error: error ?? null });
            if (error) throw error;

            const rows = (data ?? []).slice().reverse();
            const profilesStore = useProfilesStore();
            const userIds = rows.map((r) => r.user_id).filter(Boolean);
            await profilesStore.ensureLoaded(userIds);

            const normalizedList = rows.map((row) =>
                normalizeMessage({ ...row, profiles: profilesStore.byId[row.user_id] })
            );

            this.byRoom[roomId] = normalizedList;

            const last = this.byRoom[roomId]?.[this.byRoom[roomId].length - 1];
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
            this.installRealtimeGuards();

            const existing = this.subs[roomId];
            if (existing && (existing.state === "joined" || existing.state === "joining")) return;

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
                        const normalized = normalizeMessage({ ...raw, profiles: profilesStore.byId[raw.user_id] });
                        this._upsert(roomId, normalized);
                    }
                );

            this.subs[roomId] = ch;

            ch.subscribe((status) => {
                console.log("[messages.subscribe]", roomId, status, "state:", ch.state);
                if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
                    setTimeout(() => {
                        if (this.subs[roomId] === ch) {
                            this.unsubscribe(roomId).finally(() => this.subscribe(roomId));
                        }
                    }, 700);
                }
            });
        },

        async unsubscribe(roomId) {
            const ch = this.subs[roomId];
            if (!ch) return;
            try { await ch.unsubscribe(); } catch (_) { }
            try { await supabase.removeChannel(ch); } catch (_) { }
            delete this.subs[roomId];
        },

        async _fetchByClientId(roomId, clientId) {
            // REST select by client_id (so we stay consistent with the send path)
            const q = `messages?select=id,room_id,user_id,text,created_at,reply_to_id,client_id&room_id=eq.${encodeURIComponent(
                roomId
            )}&client_id=eq.${encodeURIComponent(clientId)}&order=created_at.desc&limit=1`;

            const rows = await restRequest(q, { method: "GET" });
            return Array.isArray(rows) && rows.length ? rows[0] : null;
        },

        /**
         * ✅ Stable send (no supabase-js insert):
         * - attempt 1: REST insert with AbortController timeout
         * - recover: ensureRealtime + REST upsert (merge duplicates) + fetch by client_id
         *
         * Requires unique index on (room_id, client_id).
         */
        async send(roomId, text, replyToId = null) {
            console.log("[messages.send] start", {
                roomId,
                hasUser: !!session.value?.user?.id,
                vis: document.visibilityState,
                online: navigator.onLine,
                t: Date.now(),
            });

            const userId = session.value?.user?.id;
            if (!userId || !roomId) throw new Error("Missing auth or roomId");

            const clean = String(text ?? "").trim();
            if (!clean) return;

            const profilesStore = useProfilesStore();
            const clientId = uuidish();

            const timeoutMs = 7000;

            const insertOnce = async () => {
                const ac = new AbortController();
                const timer = setTimeout(() => {
                    console.warn("[messages.send] ABORT (timeout)", { timeoutMs });
                    ac.abort();
                }, timeoutMs);

                try {
                    const q = `messages?select=id,room_id,user_id,text,created_at,reply_to_id,client_id`;
                    const rows = await restRequest(q, {
                        method: "POST",
                        body: {
                            room_id: roomId,
                            user_id: userId,
                            text: clean,
                            reply_to_id: replyToId,
                            client_id: clientId,
                        },
                        signal: ac.signal,
                        headers: {
                            Prefer: "return=representation",
                        },
                    });

                    const row = Array.isArray(rows) ? rows[0] : rows;
                    console.log("[messages.send] insert returned", { attempt: "first", hasRow: !!row });
                    if (!row) throw new Error("Insert returned no row");
                    return row;
                } finally {
                    clearTimeout(timer);
                }
            };

            const upsertAndFetch = async (why) => {
                console.warn("[messages.send] recover => upsert+fetch", { why });
                await this.ensureRealtime(`send-recover-${why}`);

                // PostgREST upsert: use on_conflict and Prefer resolution=merge-duplicates
                // NOTE: requires unique index on (room_id, client_id)
                const qUpsert = `messages?on_conflict=room_id,client_id&select=id,room_id,user_id,text,created_at,reply_to_id,client_id`;

                try {
                    await restRequest(qUpsert, {
                        method: "POST",
                        body: {
                            room_id: roomId,
                            user_id: userId,
                            text: clean,
                            reply_to_id: replyToId,
                            client_id: clientId,
                        },
                        headers: {
                            Prefer: "resolution=merge-duplicates,return=representation",
                        },
                    });
                } catch (e) {
                    console.warn("[messages.send] upsert error (continue)", e?.message || e);
                }

                const row = await this._fetchByClientId(roomId, clientId);
                if (!row) throw new Error("Recover failed: message not found after upsert");
                return row;
            };

            try {
                const row = await insertOnce();

                await profilesStore.ensureLoaded([userId]);
                const normalized = normalizeMessage({ ...row, profiles: profilesStore.byId[userId] });
                this._upsert(roomId, normalized);
                this.markAsRead(roomId);

                console.log("[messages.send] ok", { attempt: "first", roomId, textLen: clean.length });
                return normalized;
            } catch (e1) {
                if (isAbortLike(e1)) {
                    const row = await upsertAndFetch("abort");
                    await profilesStore.ensureLoaded([userId]);
                    const normalized = normalizeMessage({ ...row, profiles: profilesStore.byId[userId] });
                    this._upsert(roomId, normalized);
                    this.markAsRead(roomId);

                    console.log("[messages.send] ok", { attempt: "recover", roomId, textLen: clean.length });
                    return normalized;
                }

                const row = await upsertAndFetch(e1?.message || "error");
                await profilesStore.ensureLoaded([userId]);
                const normalized = normalizeMessage({ ...row, profiles: profilesStore.byId[userId] });
                this._upsert(roomId, normalized);
                this.markAsRead(roomId);

                console.log("[messages.send] ok", { attempt: "recover", roomId, textLen: clean.length });
                return normalized;
            }
        },
    },
});
