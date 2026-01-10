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
        status: "idle", // "idle" | "connecting" | "ready" | "failed"
    }),

    getters: {
        usersInRoom: (state) => (roomName) =>
            Object.values(state.users).filter((u) => u.room_name === roomName),

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

        /**
         * Connect presence to a specific house channel.
         * Returns true/false. Never throws.
         * Anti-race: only the latest connect call "wins".
         */
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

            // already connected to this house
            if (this.channel && this.channelHouseId === houseId) {
                this.status = "ready";
                this.ready = true;
                return true;
            }

            this.status = "connecting";
            this.ready = false;

            // clean disconnect
            await this._hardDisconnect();
            if (seq !== this.connectSeq) return false;

            // realtime auth
            try {
                if (token && supabase.realtime?.setAuth) supabase.realtime.setAuth(token);
            } catch (e) {
                console.warn("[presence.connect] realtime setAuth failed", e);
            }

            const channelName = `presence:house:${houseId}`;

            const buildPayload = () => ({
                user_id: userId,
                house_id: houseId,
                nickname: profile.value?.nickname ?? "User",
                avatar_url: profile.value?.avatar_url ?? null,
                room_name: "living",
                ts: Date.now(),
            });

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
                        // console.log("[presence] sync users", Object.keys(next).length);
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
                                await ch.track(buildPayload());
                            } catch (e) {
                                // track can fail but channel subscribed – we still consider ok
                                console.warn("[presence.connect] track failed", e);
                            }

                            finish(true);
                            return;
                        }

                        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                            clearTimeout(timer);
                            finish(false);
                            return;
                        }
                    });
                });

                // if another connect started – cleanup
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

                // optimistic self (so UI never shows 0)
                const payload = buildPayload();
                this.users = { ...(this.users || {}), [userId]: payload };

                this.ready = true;
                this.status = "ready";
                return { ok: true, ch };
            };

            // retry with backoff
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

            console.log("[presence.setRoom]", {
                roomName,
                houseId: this.channelHouseId,
                status: this.status,
            });

            try {
                await this.channel.track({
                    user_id: userId,
                    house_id: this.channelHouseId,
                    nickname: profile.value?.nickname ?? "User",
                    avatar_url: profile.value?.avatar_url ?? null,
                    room_name: roomName,
                    ts: Date.now(),
                });
                return true;
            } catch (e) {
                console.warn("[presence.setRoom] failed", e);
                return false;
            }
        },

        async disconnect() {
            await this._hardDisconnect();
            this.status = "idle";
        },
    },
});
