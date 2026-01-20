// /src/stores/presence.js
import { defineStore } from "pinia";
import { supabase } from "../services/supabase";
import { useAuthStore, profile } from "./auth";

const TYPING_TTL_MS = 4000;
const nowTs = () => Date.now();

export const usePresenceStore = defineStore("presence", {
    state: () => ({
        status: "idle", // idle | connecting | ready | failed
        houseId: null,
        roomName: "lobby",
        users: {},
        _channel: null,
        _guardsInstalled: false,
    }),

    getters: {
        ready: (s) => s.status === "ready",
    },

    actions: {
        usersInRoom(roomKey) {
            const arr = Object.values(this.users || {});
            return arr.filter((u) => (u.room_name || "lobby") === (roomKey || "lobby"));
        },

        typingUsersInRoom(roomKey) {
            const now = Date.now();
            const arr = this.usersInRoom(roomKey);
            return arr.filter((u) => {
                if (!u.typing) return false;
                const ts = Number(u.typing_ts || u.ts || 0);
                return ts && now - ts <= TYPING_TTL_MS;
            });
        },

        async _getUserId() {
            const auth = useAuthStore();
            await auth.init();
            return auth.userId || null;
        },

        _selfMeta(userId, overrides = {}) {
            const existing = this.users?.[userId] || {};
            const p = profile.value || null;

            return {
                user_id: userId,
                room_name: this.roomName || "lobby",
                user_status: "online",

                // ✅ profile -> existing -> defaults
                nickname: p?.nickname || existing.nickname || "User",
                avatar_url: p?.avatar_url || existing.avatar_url || null,
                avatar_full_url: p?.avatar_full_url || existing.avatar_full_url || null, // ✅ NEW
                color: p?.color || existing.color || "#22c55e",

                ts: nowTs(),
                ...overrides,
            };
        },

        async refreshSelf() {
            const userId = await this._getUserId();
            if (!userId || !this._channel) return false;

            try {
                const prevTyping = !!this.users?.[userId]?.typing;
                const prevTypingTs = this.users?.[userId]?.typing_ts || 0;

                await this._channel.track(
                    this._selfMeta(userId, {
                        room_name: this.roomName || "lobby",
                        user_status: this.users?.[userId]?.user_status || "online",
                        typing: prevTyping,
                        typing_ts: prevTyping ? (prevTypingTs || nowTs()) : prevTypingTs,
                    })
                );
                return true;
            } catch (e) {
                console.error("[presence.refreshSelf] failed:", e);
                return false;
            }
        },

        async connect({ houseId, initialRoom = "lobby" }) {
            const userId = await this._getUserId();
            if (!userId || !houseId) return false;

            if (this._channel && this.houseId === houseId) {
                this.houseId = houseId;
                this.roomName = initialRoom || this.roomName || "lobby";
                await this.setRoom(this.roomName);
                return true;
            }

            await this.disconnect();

            this.status = "connecting";
            this.houseId = houseId;
            this.roomName = initialRoom || "lobby";

            const ch = supabase.channel(`presence_house_${houseId}`, {
                config: { presence: { key: String(userId) } },
            });

            ch.on("presence", { event: "sync" }, () => {
                const state = ch.presenceState();
                const normalized = {};

                for (const [key, metas] of Object.entries(state || {})) {
                    const meta = Array.isArray(metas) ? metas[metas.length - 1] : metas;
                    const uid = meta?.user_id || key;
                    if (!uid) continue;

                    normalized[uid] = {
                        user_id: uid,
                        nickname: meta?.nickname || "User",
                        avatar_url: meta?.avatar_url || null,
                        avatar_full_url: meta?.avatar_full_url || null, // ✅ NEW
                        color: meta?.color || "#22c55e",
                        room_name: meta?.room_name || "lobby",
                        user_status: meta?.user_status || "online",
                        ts: meta?.ts || nowTs(),
                        typing: !!meta?.typing,
                        typing_ts: meta?.typing_ts || meta?.ts || 0,
                    };
                }

                this.users = normalized;
                this.status = "ready";
            });

            ch.on("presence", { event: "join" }, ({ key, newPresences }) => {
                const meta = Array.isArray(newPresences) ? newPresences[newPresences.length - 1] : newPresences;
                const uid = meta?.user_id || key;
                if (!uid) return;

                this.users[uid] = {
                    user_id: uid,
                    nickname: meta?.nickname || "User",
                    avatar_url: meta?.avatar_url || null,
                    avatar_full_url: meta?.avatar_full_url || null, // ✅ NEW
                    color: meta?.color || "#22c55e",
                    room_name: meta?.room_name || "lobby",
                    user_status: meta?.user_status || "online",
                    ts: meta?.ts || nowTs(),
                    typing: !!meta?.typing,
                    typing_ts: meta?.typing_ts || meta?.ts || 0,
                };
            });

            ch.on("presence", { event: "leave" }, ({ key, leftPresences }) => {
                const uid = leftPresences?.[0]?.user_id || key;
                if (!uid) return;
                const copy = { ...(this.users || {}) };
                delete copy[uid];
                this.users = copy;
            });

            await ch.subscribe(async (s) => {
                if (s === "SUBSCRIBED") {
                    try {
                        await ch.track(this._selfMeta(userId));
                        this.status = "ready";

                        // ✅ re-track to catch profile arriving after connect
                        setTimeout(() => void this.refreshSelf(), 250);
                        setTimeout(() => void this.refreshSelf(), 1200);
                    } catch (e) {
                        console.error("[presence.track] failed:", e);
                        this.status = "failed";
                    }
                } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
                    this.status = "failed";
                }
            });

            this._channel = ch;
            this.installGuards();
            return true;
        },

        async disconnect() {
            if (this._channel) {
                try {
                    await supabase.removeChannel(this._channel);
                } catch { }
            }
            this._channel = null;
            this.status = "idle";
            this.users = {};
            return true;
        },

        async setRoom(roomName) {
            const userId = await this._getUserId();
            if (!userId) return false;

            this.roomName = roomName || "living";

            if (!this._channel) {
                if (!this.houseId) return false;
                return await this.connect({ houseId: this.houseId, initialRoom: this.roomName });
            }

            try {
                const prevTyping = !!this.users?.[userId]?.typing;
                const prevTypingTs = this.users?.[userId]?.typing_ts || 0;

                await this._channel.track(
                    this._selfMeta(userId, {
                        room_name: this.roomName,
                        user_status: "online",
                        typing: prevTyping,
                        typing_ts: prevTyping ? (prevTypingTs || nowTs()) : prevTypingTs,
                    })
                );
                return true;
            } catch (e) {
                console.error("[presence.setRoom] failed:", e);
                this.status = "failed";
                return false;
            }
        },

        async setStatus(user_status) {
            const userId = await this._getUserId();
            if (!userId || !this._channel) return false;

            try {
                const prevTyping = !!this.users?.[userId]?.typing;
                const prevTypingTs = this.users?.[userId]?.typing_ts || 0;

                await this._channel.track(
                    this._selfMeta(userId, {
                        user_status: user_status || "online",
                        typing: prevTyping,
                        typing_ts: prevTyping ? (prevTypingTs || nowTs()) : prevTypingTs,
                    })
                );
                return true;
            } catch (e) {
                console.error("[presence.setStatus] failed:", e);
                this.status = "failed";
                return false;
            }
        },

        async setUserStatus(s) {
            return this.setStatus(s);
        },

        async setTyping(isTyping) {
            const userId = await this._getUserId();
            if (!userId) return false;

            if (!this._channel) {
                if (!this.houseId) return false;
                const ok = await this.connect({ houseId: this.houseId, initialRoom: this.roomName || "living" });
                if (!ok || !this._channel) return false;
            }

            try {
                await this._channel.track(
                    this._selfMeta(userId, {
                        typing: !!isTyping,
                        typing_ts: nowTs(),
                    })
                );
                return true;
            } catch (e) {
                console.error("[presence.setTyping] failed:", e);
                this.status = "failed";
                return false;
            }
        },

        installGuards() {
            if (this._guardsInstalled) return;
            this._guardsInstalled = true;

            const kick = async () => {
                if (!this.houseId) return;
                if (!this._channel || this.status === "failed") {
                    await this.connect({ houseId: this.houseId, initialRoom: this.roomName || "living" });
                } else {
                    await this.setRoom(this.roomName || "living");
                }
            };

            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible") void kick();
            });
            window.addEventListener("online", () => void kick());
            window.addEventListener("focus", () => void kick());
            window.addEventListener("pageshow", () => void kick());
        },
    },
});
