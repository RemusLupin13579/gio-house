// /src/stores/notifications.js
import { defineStore } from "pinia";
import { supabase } from "../services/supabase";
import { session } from "./auth";
import { useHouseStore } from "./house";
import { useRoomsStore } from "./rooms";

const LS_KEY = "gio:notifications:v1";

function safeParse(raw, fallback) {
    try {
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function ts(v) {
    const n = Date.parse(String(v || ""));
    return Number.isFinite(n) ? n : 0;
}

export const useNotificationsStore = defineStore("notifications", {
    state: () => ({
        // ✅ DM unread per thread
        dmUnread: {}, // { [threadId]: number }
        dmLastAt: {}, // { [threadId]: number } (ms)

        // ✅ room unread (UI uses roomKey, not uuid)
        roomUnread: {}, // { [roomKey]: number }

        // cooldowns
        lastDmSignalAt: 0,
        lastRoomSignalAt: 0,

        // current context
        currentRouteName: "",
        currentDmThreadId: null,
        currentRoomKey: null,

        // behavior knobs
        DM_SIGNAL_COOLDOWN_MS: 12_000,
        ROOM_SIGNAL_COOLDOWN_MS: 20_000,
        TOAST_COOLDOWN_MS: 25_000,
        lastToastAt: 0,

        // ✅ NEW: server read timestamps
        dmLastReadAt: {},   // { [threadId]: isoString }
        roomLastReadAt: {}, // { [roomId]: isoString }

        _syncing: false,
        _lastSyncAt: 0,
    }),

    getters: {
        dmTotalUnread: (s) =>
            Object.values(s.dmUnread || {}).reduce((a, b) => a + (Number(b) || 0), 0),

        hasAnyDMUnread: (s) =>
            Object.values(s.dmUnread || {}).some((n) => (Number(n) || 0) > 0),

        dmUnreadFor: (s) => (threadId) =>
            Number(s.dmUnread?.[String(threadId)] || 0),

        dmHasUnread: (s) => (threadId) =>
            Number(s.dmUnread?.[String(threadId)] || 0) > 0,
    },

    actions: {
        load() {
            const raw = localStorage.getItem(LS_KEY);
            const data = safeParse(raw, null);
            if (data) {
                this.dmUnread = data.dmUnread || {};
                this.dmLastAt = data.dmLastAt || {};
                this.roomUnread = data.roomUnread || {};
                this.lastDmSignalAt = data.lastDmSignalAt || 0;
                this.lastRoomSignalAt = data.lastRoomSignalAt || 0;
                this.lastToastAt = data.lastToastAt || 0;

                this.dmLastReadAt = data.dmLastReadAt || {};
                this.roomLastReadAt = data.roomLastReadAt || {};
                this._lastSyncAt = data._lastSyncAt || 0;
            }

            // ✅ server sync (non-blocking)
            void this.syncFromServer("load");
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

                        dmLastReadAt: this.dmLastReadAt,
                        roomLastReadAt: this.roomLastReadAt,
                        _lastSyncAt: this._lastSyncAt,
                    })
                );
            } catch { }
        },

        setContext({ routeName, dmThreadId, roomKey }) {
            this.currentRouteName = routeName || "";
            this.currentDmThreadId = dmThreadId ? String(dmThreadId) : null;
            this.currentRoomKey = roomKey ? String(roomKey) : null;
        },

        // ===== DM events (local increments; cross-device handled by sync) =====
        onIncomingDM({ threadId, fromUserId, myUserId, createdAtMs }) {
            if (!threadId) return;
            const tid = String(threadId);

            // ignore own messages
            if (fromUserId && myUserId && String(fromUserId) === String(myUserId)) return;

            // if open => no unread
            const isOpenDm =
                this.currentRouteName === "dm" && String(this.currentDmThreadId || "") === tid;
            if (isOpenDm) return;

            this.dmUnread[tid] = Number(this.dmUnread[tid] || 0) + 1;
            this.dmLastAt[tid] = Number(createdAtMs || Date.now());
            this.save();
        },

        clearDM(threadId) {
            if (!threadId) return;
            const tid = String(threadId);

            if (this.dmUnread?.[tid] != null) {
                const next = { ...(this.dmUnread || {}) };
                delete next[tid];
                this.dmUnread = next;
                this.save();
            }
        },

        setDMUnread(threadId, count) {
            if (!threadId) return;
            const tid = String(threadId);
            const n = Math.max(0, Number(count) || 0);

            if (n === 0) {
                this.clearDM(tid);
                return;
            }

            this.dmUnread = { ...(this.dmUnread || {}), [tid]: n };
            this.save();
        },

        clearAllDM() {
            this.dmUnread = {};
            this.save();
        },

        // ===== Room events (local increments; cross-device handled by sync) =====
        onIncomingRoom({ roomKey, fromUserId, myUserId, createdAtMs }) {
            if (!roomKey) return;
            const rk = String(roomKey);

            if (fromUserId && myUserId && String(fromUserId) === String(myUserId)) return;

            const isOpenRoom =
                this.currentRouteName === "room" && String(this.currentRoomKey || "") === rk;
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

        // ===== “should we toast?” =====
        shouldToastNow() {
            const now = Date.now();
            if (now - (this.lastToastAt || 0) < this.TOAST_COOLDOWN_MS) return false;
            this.lastToastAt = now;
            this.save();
            return true;
        },

        // =========================================================
        // ✅ NEW: MARK READ (writes to server)
        // =========================================================
        async markThreadRead(threadId) {
            const userId = session.value?.user?.id;
            const tid = String(threadId || "");
            if (!userId || !tid) return;

            const iso = new Date().toISOString();

            // optimistic local
            this.dmLastReadAt = { ...(this.dmLastReadAt || {}), [tid]: iso };
            this.clearDM(tid);

            try {
                await supabase.from("dm_reads").upsert({
                    user_id: userId,
                    thread_id: tid,
                    last_read_at: iso,
                });
            } catch (e) {
                console.warn("[notifications] markThreadRead failed:", e?.message || e);
            } finally {
                this.save();
            }
        },

        async markRoomRead({ houseId, roomId, roomKey }) {
            const userId = session.value?.user?.id;
            const hid = String(houseId || "");
            const rid = String(roomId || "");
            const rk = String(roomKey || "");
            if (!userId || !hid || !rid) return;

            const iso = new Date().toISOString();

            // optimistic local
            this.roomLastReadAt = { ...(this.roomLastReadAt || {}), [rid]: iso };
            if (rk) this.clearRoom(rk);

            try {
                await supabase.from("room_reads").upsert({
                    user_id: userId,
                    house_id: hid,
                    room_id: rid,
                    last_read_at: iso,
                });
            } catch (e) {
                console.warn("[notifications] markRoomRead failed:", e?.message || e);
            } finally {
                this.save();
            }
        },

        // =========================================================
        // ✅ NEW: SYNC (pull reads + compute unread across devices)
        // =========================================================
        async syncFromServer(reason = "manual") {
            if (this._syncing) return;

            const userId = session.value?.user?.id;
            if (!userId) return;

            // throttle
            const now = Date.now();
            if (now - (this._lastSyncAt || 0) < 2500) return;

            this._syncing = true;
            try {
                const house = useHouseStore();
                const rooms = useRoomsStore();
                const houseId = house.currentHouseId;

                // reads
                const [dmReadsRes, roomReadsRes] = await Promise.all([
                    supabase.from("dm_reads").select("thread_id,last_read_at").eq("user_id", userId),
                    houseId
                        ? supabase
                            .from("room_reads")
                            .select("room_id,last_read_at")
                            .eq("user_id", userId)
                            .eq("house_id", houseId)
                        : Promise.resolve({ data: [] }),
                ]);

                if (dmReadsRes?.error) throw dmReadsRes.error;
                if (roomReadsRes?.error) throw roomReadsRes.error;

                const dmLastReadAt = {};
                for (const r of dmReadsRes.data || []) dmLastReadAt[String(r.thread_id)] = r.last_read_at;

                const roomLastReadAt = {};
                for (const r of roomReadsRes.data || []) roomLastReadAt[String(r.room_id)] = r.last_read_at;

                this.dmLastReadAt = dmLastReadAt;
                this.roomLastReadAt = roomLastReadAt;

                // latest message timestamps
                const [latestDm, latestRoomsById] = await Promise.all([
                    this._fetchLatestDmMessageAt(),
                    houseId ? this._fetchLatestRoomMessageAtByRoomId(houseId) : Promise.resolve({}),
                ]);

                // compute DM unread: 0/1 (simple & reliable)
                const dmUnread = {};
                const dmLastAt = { ...(this.dmLastAt || {}) };

                for (const [tid, lastMsgIso] of Object.entries(latestDm || {})) {
                    const lr = ts(dmLastReadAt[tid]);
                    const lm = ts(lastMsgIso);
                    dmUnread[tid] = lm > lr ? 1 : 0;
                    if (lm) dmLastAt[tid] = lm;
                }

                // compute ROOM unread: keyed by roomKey (UI), but compares by room_id (DB)
                const roomUnread = {};

                const list = rooms.activeRooms || [];
                for (const r of list) {
                    const roomId = String(r?.id || "");
                    const roomKey = String(r?.key || "");
                    if (!roomId || !roomKey) continue;

                    const lastMsgIso = latestRoomsById?.[roomId] || null;
                    const lr = ts(roomLastReadAt[roomId]);
                    const lm = ts(lastMsgIso);

                    roomUnread[roomKey] = lm > lr ? 1 : 0;
                }

                this.dmUnread = dmUnread;
                this.dmLastAt = dmLastAt;
                this.roomUnread = roomUnread;

                this._lastSyncAt = Date.now();
                this.save();
                // console.log("[notifications] synced", reason);
            } catch (e) {
                console.warn("[notifications.syncFromServer] failed:", e?.message || e);
            } finally {
                this._syncing = false;
            }
        },

        async _fetchLatestDmMessageAt() {
            const { data, error } = await supabase
                .from("dm_messages")
                .select("thread_id,created_at")
                .order("created_at", { ascending: false })
                .limit(800);

            if (error) throw error;

            const map = {};
            for (const r of data || []) {
                const tid = String(r.thread_id);
                if (!map[tid]) map[tid] = r.created_at;
            }
            return map;
        },

        async _fetchLatestRoomMessageAtByRoomId(houseId) {
            const { data, error } = await supabase
                .from("messages")
                .select("room_id,created_at,house_id")
                .eq("house_id", houseId)
                .order("created_at", { ascending: false })
                .limit(1200);

            if (error) throw error;

            const map = {};
            for (const r of data || []) {
                const rid = String(r.room_id || "");
                if (!rid) continue;
                if (!map[rid]) map[rid] = r.created_at;
            }
            return map;
        },
    },
});
