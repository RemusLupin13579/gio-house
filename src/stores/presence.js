import { defineStore } from "pinia";
import { supabase } from "../services/supabase";
import { session, profile } from "../stores/auth";

export const usePresenceStore = defineStore("presence", {
    state: () => ({
        channel: null,
        channelHouseId: null,
        users: {},
        ready: false,

        // anti-race + retry
        connectSeq: 0,
        retryTimer: null,

        // ✅ connection status (socket)
        status: "idle", // "idle" | "connecting" | "ready" | "failed"

        // ✅ user status (what the user actually is)
        myUserStatus: "online", // "online" | "afk" | "offline"
    }),

    getters: {
        usersInRoom: (state) => (roomName) =>
            Object.values(state.users).filter((u) => (u.room_name ?? "living") === roomName),

        usersByRoom: (state) => {
            const grouped = {};
            for (const u of Object.values(state.users)) {
                const key = u.room_name ?? "unknown";
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(u);
            }
            return grouped;
        },
    },

    actions: {
        _clearRetry() {
            if (this.retryTimer) clearTimeout(this.retryTimer);
            this.retryTimer = null;
        },

        async _hardDisconnect() {
            this._clearRetry();

            if (!this.channel) {
                this.channel = null;
                this.channelHouseId = null;
                this.users = {};
                this.ready = false;
                return;
            }

            try {
                await this.channel.unsubscribe();
            } catch (_) { }

            try {
                await supabase.removeChannel(this.channel);
            } catch (_) { }

            this.channel = null;
            this.channelHouseId = null;
            this.users = {};
            this.ready = false;
        },

        async connect(houseId) {
            const userId = session.value?.user?.id;
            const token = session.value?.access_token;

            console.log("[presence.connect] start", { houseId, userId, hasToken: !!token });

            if (!userId || !houseId) {
                this.status = "failed";
                this.ready = false;
                return false;
            }

            this.connectSeq += 1;
            const seq = this.connectSeq;

            // already connected
            if (this.channel && this.channelHouseId === houseId) {
                this.status = "ready";
                this.ready = true;
                return true;
            }

            this.status = "connecting";
            this.ready = false;

            await this._hardDisconnect();
            if (seq !== this.connectSeq) return false;

            // realtime auth
            try {
                if (token && supabase.realtime?.setAuth) supabase.realtime.setAuth(token);
            } catch (e) {
                console.warn("[presence.connect] realtime setAuth failed", e);
            }

            const channelName = `presence:house:${houseId}`;

            const buildPayload = (overrides = {}) => {
                const me = this.users?.[userId];

                // ✅ last real room (never "afk" as a room)
                const lastRoom = overrides.last_room ?? me?.last_room ?? me?.room_name ?? "living";
                const roomName = overrides.room_name ?? lastRoom;

                return {
                    user_id: userId,
                    house_id: houseId,
                    nickname: profile.value?.nickname ?? "User",
                    avatar_url: profile.value?.avatar_url ?? null,

                    room_name: roomName,
                    last_room: lastRoom,

                    // ✅ real user status
                    user_status: overrides.user_status ?? this.myUserStatus ?? "online",

                    ts: Date.now(),
                };
            };

            const attemptOnce = async () => {
                const ch = supabase.channel(channelName, {
                    config: { presence: { key: userId } },
                });

                console.log("[presence.connect] channel created", { houseId, topic: ch?.topic });

                ch.on("presence", { event: "sync" }, () => {
                    try {
                        const state = ch.presenceState();
                        const next = {};
                        for (const [k, arr] of Object.entries(state)) {
                            next[k] = arr[arr.length - 1];
                        }
                        this.users = next;
                        this.ready = true;
                        this.status = "ready";

                        // ✅ keep myUserStatus in sync with server echo
                        const me = next?.[userId];
                        if (me?.user_status) this.myUserStatus = me.user_status;
                    } catch (e) {
                        console.warn("[presence] sync handler failed", e);
                    }
                });

                const ok = await new Promise((resolve) => {
                    let done = false;
                    const finish = (v) => {
                        if (done) return;
                        done = true;
                        resolve(v);
                    };

                    const timer = setTimeout(() => finish(false), 9000);

                    ch.subscribe(async (status) => {
                        console.log("[presence.connect] status", status);

                        if (status === "SUBSCRIBED") {
                            clearTimeout(timer);

                            try {
                                // ✅ on connect: online + living as last_room (safe default)
                                await ch.track(buildPayload({ user_status: "online", room_name: "living", last_room: "living" }));
                            } catch (e) {
                                console.warn("[presence.connect] track failed", e);
                            }

                            finish(true);
                            return;
                        }

                        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                            clearTimeout(timer);
                            finish(false);
                        }
                    });
                });

                // anti-race cleanup
                if (seq !== this.connectSeq) {
                    try {
                        await ch.unsubscribe();
                    } catch (_) { }
                    try {
                        await supabase.removeChannel(ch);
                    } catch (_) { }
                    return { ok: false, ch: null };
                }

                if (!ok) {
                    try {
                        await ch.unsubscribe();
                    } catch (_) { }
                    try {
                        await supabase.removeChannel(ch);
                    } catch (_) { }
                    return { ok: false, ch: null };
                }

                // commit
                this.channel = ch;
                this.channelHouseId = houseId;

                // optimistic self
                const payload = buildPayload({ user_status: "online", room_name: "living", last_room: "living" });
                this.users = { ...(this.users || {}), [userId]: payload };
                this.myUserStatus = payload.user_status;

                this.ready = true;
                this.status = "ready";
                return { ok: true, ch };
            };

            // retry
            const delays = [0, 500, 1200, 2500];
            for (let i = 0; i < delays.length; i++) {
                if (seq !== this.connectSeq) return false;
                if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));

                try {
                    const res = await attemptOnce();
                    if (res.ok) return true;
                } catch (e) {
                    console.warn("[presence.connect] attempt crashed", e);
                }
            }

            this.status = "failed";
            this.ready = false;
            this.users = {};
            console.warn("[presence.connect] failed after retries", { houseId, channelName });
            return false;
        },

        async setRoom(roomName) {
            if (!this.channel) return false;

            const userId = session.value?.user?.id;
            if (!userId) return false;

            // ✅ never allow "afk" as a room
            if (roomName === "afk") roomName = "living";

            const me = this.users?.[userId];
            const lastRoom = roomName || me?.last_room || me?.room_name || "living";

            // ✅ moving rooms implies active, unless user explicitly offline
            const nextStatus = this.myUserStatus === "offline" ? "offline" : "online";
            this.myUserStatus = nextStatus;

            console.log("[presence.setRoom]", { roomName, lastRoom, status: nextStatus });

            try {
                await this.channel.track({
                    user_id: userId,
                    house_id: this.channelHouseId,
                    nickname: profile.value?.nickname ?? "User",
                    avatar_url: profile.value?.avatar_url ?? null,
                    room_name: roomName,
                    last_room: lastRoom,
                    user_status: nextStatus,
                    ts: Date.now(),
                });
                return true;
            } catch (e) {
                console.warn("[presence.setRoom] failed", e);
                return false;
            }
        },

        async setUserStatus(user_status) {
            if (!this.channel) return false;

            const userId = session.value?.user?.id;
            if (!userId) return false;

            if (!["online", "afk", "offline"].includes(user_status)) {
                console.warn("[presence.setUserStatus] invalid status:", user_status);
                return false;
            }

            const me = this.users?.[userId];
            const lastRoom = me?.last_room || me?.room_name || "living";

            this.myUserStatus = user_status;

            console.log("[presence.setUserStatus]", { user_status, lastRoom, houseId: this.channelHouseId });

            try {
                await this.channel.track({
                    user_id: userId,
                    house_id: this.channelHouseId,
                    nickname: profile.value?.nickname ?? "User",
                    avatar_url: profile.value?.avatar_url ?? null,

                    // ✅ keep room real; status carries AFK
                    room_name: lastRoom,
                    last_room: lastRoom,

                    user_status,
                    ts: Date.now(),
                });
                return true;
            } catch (e) {
                console.warn("[presence.setUserStatus] failed", e);
                return false;
            }
        },

        async disconnect() {
            await this._hardDisconnect();
            this.status = "idle";
        },
    },
});
