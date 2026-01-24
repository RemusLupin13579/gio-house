// /src/stores/notifications.js
import { defineStore } from "pinia";

const LS_KEY = "gio:notifications:v1";

function safeParse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

export const useNotificationsStore = defineStore("notifications", {
    state: () => ({
        // DM unread per thread
        dmUnread: {}, // { [threadId]: number }
        dmLastAt: {}, // { [threadId]: number } // for ordering / cooldown decisions

        // optional: room unread
        roomUnread: {}, // { [roomKey]: number }

        // global cooldowns (ms timestamps)
        lastDmSignalAt: 0,
        lastRoomSignalAt: 0,

        // user context (set by hook)
        currentRouteName: "",
        currentDmThreadId: null,
        currentRoomKey: null,

        // behavior knobs
        DM_SIGNAL_COOLDOWN_MS: 12_000,     // “אל תחפור”
        ROOM_SIGNAL_COOLDOWN_MS: 20_000,
        TOAST_COOLDOWN_MS: 25_000,

        lastToastAt: 0,
    }),

    getters: {
        // totals
        dmTotalUnread: (s) => Object.values(s.dmUnread || {}).reduce((a, b) => a + (Number(b) || 0), 0),
        hasAnyDMUnread: (s) => Object.values(s.dmUnread || {}).some((n) => (Number(n) || 0) > 0),

        dmUnreadFor: (s) => (threadId) => Number(s.dmUnread?.[String(threadId)] || 0),

        // for sidebar ordering / “bold” logic
        dmHasUnread: (s) => (threadId) => (Number(s.dmUnread?.[String(threadId)] || 0) > 0),
    },

    actions: {
        load() {
            const raw = localStorage.getItem(LS_KEY);
            const data = safeParse(raw, null);
            if (!data) return;

            this.dmUnread = data.dmUnread || {};
            this.dmLastAt = data.dmLastAt || {};
            this.roomUnread = data.roomUnread || {};
            this.lastDmSignalAt = data.lastDmSignalAt || 0;
            this.lastRoomSignalAt = data.lastRoomSignalAt || 0;
            this.lastToastAt = data.lastToastAt || 0;
        },

        save() {
            try {
                localStorage.setItem(
                    LS_KEY,
                    JSON.stringify({
                        dmUnread: this.dmUnread,
                        dmLastAt: this.dmLastAt,
                        roomUnread: this.roomUnread,
                        lastDmSignalAt: this.lastDmSignalAt,
                        lastRoomSignalAt: this.lastRoomSignalAt,
                        lastToastAt: this.lastToastAt,
                    })
                );
            } catch { }
        },

        setContext({ routeName, dmThreadId, roomKey }) {
            this.currentRouteName = routeName || "";
            this.currentDmThreadId = dmThreadId ? String(dmThreadId) : null;
            this.currentRoomKey = roomKey ? String(roomKey) : null;
        },

        // ===== DM events =====
        onIncomingDM({ threadId, fromUserId, myUserId, text, createdAtMs }) {
            if (!threadId) return;
            const tid = String(threadId);

            // ignore own messages
            if (fromUserId && myUserId && String(fromUserId) === String(myUserId)) return;

            // if user is currently inside this DM chat => no unread
            const isOpenDm = (this.currentRouteName === "dm" && String(this.currentDmThreadId || "") === tid);
            if (isOpenDm) return;

            // increment unread
            this.dmUnread[tid] = Number(this.dmUnread[tid] || 0) + 1;
            this.dmLastAt[tid] = Number(createdAtMs || Date.now());
            this.save();
        },

        clearDM(threadId) {
            if (!threadId) return;
            const tid = String(threadId);
            if (this.dmUnread?.[tid]) {
                const next = { ...(this.dmUnread || {}) };
                delete next[tid];
                this.dmUnread = next;
                this.save();
            }
        },

        clearAllDM() {
            this.dmUnread = {};
            this.save();
        },

        // ===== Room events (optional later) =====
        onIncomingRoom({ roomKey, fromUserId, myUserId, createdAtMs }) {
            if (!roomKey) return;
            const rk = String(roomKey);

            if (fromUserId && myUserId && String(fromUserId) === String(myUserId)) return;

            // if you are inside this room => no unread
            const isOpenRoom = (this.currentRouteName === "room" && String(this.currentRoomKey || "") === rk);
            if (isOpenRoom) return;

            this.roomUnread[rk] = Number(this.roomUnread[rk] || 0) + 1;
            this.lastRoomSignalAt = Number(createdAtMs || Date.now());
            this.save();
        },

        clearRoom(roomKey) {
            if (!roomKey) return;
            const rk = String(roomKey);
            const next = { ...(this.roomUnread || {}) };
            delete next[rk];
            this.roomUnread = next;
            this.save();
        },

        // ===== “should we toast?” (optional) =====
        shouldToastNow() {
            const now = Date.now();
            if (now - (this.lastToastAt || 0) < this.TOAST_COOLDOWN_MS) return false;
            this.lastToastAt = now;
            this.save();
            return true;
        },
    },
});
