import { defineStore } from "pinia";
import { supabase } from "../services/supabase";
import { session, profile } from "../stores/auth";

export const usePresenceStore = defineStore("presence", {
    state: () => ({
        channel: null,
        channelHouseId: null,
        users: {},
        ready: false,

        // ✅ anti-race + retry
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

            if (!this.channel) return;

            // unsubscribe לפני removeChannel מפחית TIMEOUT במעברים מהירים
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
            if (!userId || !houseId) return false;

            this.connectSeq += 1;
            const seq = this.connectSeq;

            // אם כבר מחובר לבית הזה
            if (this.channel && this.channelHouseId === houseId) return true;

            // ניתוק נקי מכל דבר קודם
            await this._hardDisconnect();

            // אם התחיל connect חדש בינתיים
            if (seq !== this.connectSeq) return false;

            // חשוב: עדכון auth לרילטיים
            try {
                if (token && supabase.realtime?.setAuth) supabase.realtime.setAuth(token);
            } catch (_) { }

            const channelName = `presence:house:${houseId}`;

            const attemptOnce = async () => {
                const ch = supabase.channel(channelName, { config: { presence: { key: userId } } });

                ch.on("presence", { event: "sync" }, () => {
                    const state = ch.presenceState();
                    const next = {};
                    for (const [k, arr] of Object.entries(state)) next[k] = arr[arr.length - 1];
                    this.users = next;
                    this.ready = true;
                    this.status = "ready";
                });

                const payload = {
                    user_id: userId,
                    house_id: houseId,
                    nickname: profile.value?.nickname ?? "User",
                    avatar_url: profile.value?.avatar_url ?? null,
                    room_name: "living",
                    ts: Date.now(),
                };

                const ok = await new Promise((resolve) => {
                    let done = false;
                    const finish = (v) => {
                        if (done) return;
                        done = true;
                        resolve(v);
                    };

                    const t = setTimeout(() => finish(false), 9000);

                    ch.subscribe(async (status) => {
                        if (status === "SUBSCRIBED") {
                            clearTimeout(t);
                            try { await ch.track(payload); } catch (_) { }
                            finish(true);
                        }
                        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                            clearTimeout(t);
                            finish(false);
                        }
                    });
                });

                // אם בזמן הזה התחלף connect
                if (seq !== this.connectSeq) {
                    try { await supabase.removeChannel(ch); } catch (_) { }
                    return { ok: false, ch: null };
                }

                if (!ok) {
                    // ⚠️ לא להשאיר ערוץ כושל חי
                    try { await ch.unsubscribe(); } catch (_) { }
                    try { await supabase.removeChannel(ch); } catch (_) { }
                    return { ok: false, ch: null };
                }

                // commit channel
                this.channel = ch;
                this.channelHouseId = houseId;

                // optimistic self
                this.users = { ...(this.users || {}), [userId]: payload };
                this.ready = true;
                this.status = "ready";

                return { ok: true, ch };
            };

            this.status = "connecting";
            this.ready = false;

            // ✅ Retry אמיתי עם backoff (4 נסיונות)
            const delays = [0, 500, 1200, 2500];
            for (let i = 0; i < delays.length; i++) {
                if (seq !== this.connectSeq) return false;
                if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));

                const res = await attemptOnce();
                if (res.ok) return true;
            }

            this.status = "failed";
            this.ready = false;
            console.warn("Presence subscribe failed after retries", { houseId, channelName });
            return false;
        },


        async setRoom(roomName) {
            if (!this.channel) return false;

            const userId = session.value?.user?.id;
            if (!userId) return false;

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
                console.warn("Presence setRoom failed:", e);
                return false;
            }
        },

        async disconnect() {
            await this._hardDisconnect();
            this.status = "idle";
        },
    },
});
