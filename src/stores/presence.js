import { defineStore } from "pinia";
import { supabase } from "../services/supabase";
import { session } from "./auth";

function asArrayPresenceState(stateObj) {
    // stateObj shape: { userId: [payload, payload, ...], ... }
    if (!stateObj || typeof stateObj !== "object") return [];
    const out = [];
    for (const [uid, arr] of Object.entries(stateObj)) {
        const payload = Array.isArray(arr) ? arr[0] : arr;
        if (payload) out.push({ uid, ...payload });
    }
    return out;
}

export const usePresenceStore = defineStore("presence", {
    state: () => ({
        houseId: null,
        userId: null,

        status: "offline",
        roomName: "living",
        lastRoom: "living",

        // Realtime channel
        channel: null,
        channelTopic: null,

        // Presence state snapshot (from realtime)
        presenceState: {},

        // guards
        _connectPromise: null,
        _connecting: false,
        _connected: false,
        _lastConnectAt: 0,
    }),

    getters: {
        // convenience: all users (flattened)
        users(state) {
            return asArrayPresenceState(state.presenceState);
        },
    },

    actions: {
        /**
         * Used by templates: presenceStore.usersInRoom('living')
         */
        usersInRoom(roomName) {
            const room = roomName || "living";
            return this.users.filter((u) => (u.room || "living") === room);
        },

        isConnected() {
            return !!this.channel && this._connected;
        },

        /**
         * Connect ONCE per houseId. Safe if called too early (houseId undefined): no-op + warn.
         */
        async connect({ houseId, initialRoom = "living" } = {}) {
            const userId = session.value?.user?.id;

            console.log("[presence.connect] start", { houseId, userId, hasToken: !!session.value });

            // ✅ IMPORTANT: do not throw -> avoids render crashes when callers race.
            if (!houseId) {
                console.warn("[presence.connect] missing houseId (ignored)");
                return;
            }
            if (!userId) {
                console.warn("[presence.connect] missing userId (ignored)");
                return;
            }

            // if already connected to same house, just ensure room tracked
            const sameHouse = this._connected && this.houseId === houseId && this.channel;
            if (sameHouse) {
                this.userId = userId;
                this.houseId = houseId;
                if (initialRoom) await this.setRoom(initialRoom);
                return;
            }

            // reuse in-flight connect
            if (this._connectPromise) return this._connectPromise;

            // throttle reconnect storms
            const now = Date.now();
            if (now - this._lastConnectAt < 800 && this._connecting) return this._connectPromise;
            this._lastConnectAt = now;

            this._connecting = true;

            this._connectPromise = (async () => {
                try {
                    // cleanup old channel
                    if (this.channel) {
                        try { await this.channel.unsubscribe(); } catch (_) { }
                        try { await supabase.removeChannel(this.channel); } catch (_) { }
                    }

                    this.channel = null;
                    this.channelTopic = null;
                    this.presenceState = {};
                    this._connected = false;

                    this.houseId = houseId;
                    this.userId = userId;
                    this.roomName = initialRoom || this.roomName || "living";
                    this.lastRoom = this.roomName;

                    const topic = `realtime:presence:house:${houseId}`;
                    this.channelTopic = topic;

                    const ch = supabase.channel(topic, {
                        config: { presence: { key: userId } },
                    });

                    this.channel = ch;
                    console.log("[presence.connect] channel created", { houseId, topic });

                    // presence event wiring
                    ch.on("presence", { event: "sync" }, () => {
                        try {
                            this.presenceState = ch.presenceState() || {};
                        } catch (e) {
                            console.warn("[presence] presenceState read failed", e?.message || e);
                        }
                    });

                    ch.on("presence", { event: "join" }, () => {
                        try {
                            this.presenceState = ch.presenceState() || {};
                        } catch (_) { }
                    });

                    ch.on("presence", { event: "leave" }, () => {
                        try {
                            this.presenceState = ch.presenceState() || {};
                        } catch (_) { }
                    });

                    const trackSelf = async () => {
                        if (!this.channel) return;
                        await this.channel.track({
                            user_id: userId,
                            status: this.status === "offline" ? "online" : (this.status || "online"),
                            room: this.roomName || "living",
                            t: Date.now(),
                        });
                    };

                    await new Promise((resolve, reject) => {
                        ch.subscribe(async (st) => {
                            console.log("[presence.connect] status", st);

                            if (st === "SUBSCRIBED") {
                                this._connected = true;
                                this.status = this.status === "offline" ? "online" : this.status;
                                try { await trackSelf(); } catch (_) { }
                                resolve();
                                return;
                            }

                            if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") {
                                this._connected = false;
                                reject(new Error(`presence subscribe failed: ${st}`));
                            }
                        });
                    });

                    await trackSelf();
                } finally {
                    this._connecting = false;
                    this._connectPromise = null;
                }
            })();

            // If it fails, we don't want unhandled rejections up the tree
            try {
                return await this._connectPromise;
            } catch (e) {
                console.warn("[presence.connect] failed", e?.message || e);
                return;
            }
        },

        /**
         * Update room without reconnecting
         */
        async setRoom(roomName) {
            const clean = roomName || "living";
            const prev = this.roomName;

            this.lastRoom = prev || this.lastRoom || "living";
            this.roomName = clean;

            console.log("[presence.setRoom]", { roomName: clean, lastRoom: this.lastRoom, status: this.status });

            if (!this.channel || !this._connected) return;

            try {
                await this.channel.track({
                    user_id: this.userId,
                    status: this.status || "online",
                    room: this.roomName,
                    t: Date.now(),
                });
            } catch (e) {
                console.warn("[presence.setRoom] track failed", e?.message || e);
            }
        },

        async setStatus(status) {
            this.status = status || "online";
            if (!this.channel || !this._connected) return;

            try {
                await this.channel.track({
                    user_id: this.userId,
                    status: this.status,
                    room: this.roomName || "living",
                    t: Date.now(),
                });
            } catch (e) {
                console.warn("[presence.setStatus] track failed", e?.message || e);
            }
        },

        async disconnect() {
            this._connected = false;
            this._connecting = false;
            this._connectPromise = null;
            this.presenceState = {};

            if (this.channel) {
                try { await this.channel.unsubscribe(); } catch (_) { }
                try { await supabase.removeChannel(this.channel); } catch (_) { }
            }

            this.channel = null;
            this.channelTopic = null;
            this.status = "offline";
        },
    },
});
