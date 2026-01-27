// /src/stores/messages.js
import { defineStore } from "pinia";
import { supabase } from "../services/supabase";
import { useAuthStore } from "./auth";
import { isPaused } from "../lifecycle/resume";
import { useRoomsStore } from "./rooms";
import { useNotificationsStore } from "./notifications";
import { session } from "./auth";
import { useHouseStore } from "./house";
import { useProfilesStore } from "./profiles";

const OUTBOX_KEY = "gio-outbox-v2";
const WORKER_MS = 1200;
const MAX_ATTEMPTS = 6;

// --- tiny helpers (because we like nice things) ---
function uuid() {
    return crypto.randomUUID();
}
function nowIso() {
    return new Date().toISOString();
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function withTimeout(promise, ms, label = "timeout") {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${label} (${ms}ms)`)), ms);
        Promise.resolve(promise)
            .then((val) => {
                clearTimeout(t);
                resolve(val);
            })
            .catch((err) => {
                clearTimeout(t);
                reject(err);
            });
    });
}

export const useMessagesStore = defineStore("messages", {
    state: () => ({
        byRoom: {}, // { [roomId]: Message[] }
        subs: {}, // { [roomId]: RealtimeChannel }
        outbox: [], // OutboxItem[]
        _worker: null,
        _guardsInstalled: false,
        _runLock: false,
        _roomInboxSub: null,
    }),

    getters: {
        messagesInRoom: (s) => (roomId) => s.byRoom?.[roomId] || [],
    },

    actions: {
        // ---------- room helpers ----------
        _resolveRoomKey(roomId) {
            const rooms = useRoomsStore();
            const rid = String(roomId || "");
            const r = (rooms.activeRooms || []).find((x) => String(x.id) === rid);
            return r?.key ? String(r.key) : null;
        },

        _resolveRoomName(roomId) {
            const rooms = useRoomsStore();
            const rid = String(roomId || "");
            const r = (rooms.activeRooms || []).find((x) => String(x.id) === rid);
            return String(r?.name || r?.key || "Room");
        },

        _ensureRoom(roomId) {
            if (!this.byRoom[roomId]) this.byRoom[roomId] = [];
        },

        _sortRoom(roomId) {
            this.byRoom[roomId].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
        },

        _upsertMessage(roomId, msg) {
            this._ensureRoom(roomId);
            const arr = this.byRoom[roomId];

            // best dedupe: client_id
            if (msg.client_id) {
                const i = arr.findIndex((m) => m.client_id && m.client_id === msg.client_id);
                if (i >= 0) {
                    arr[i] = { ...arr[i], ...msg };
                    this._sortRoom(roomId);
                    return;
                }
            }

            // fallback dedupe: id
            if (msg.id) {
                const j = arr.findIndex((m) => m.id && m.id === msg.id);
                if (j >= 0) {
                    arr[j] = { ...arr[j], ...msg };
                    this._sortRoom(roomId);
                    return;
                }
            }

            arr.push(msg);
            this._sortRoom(roomId);
        },

        _markClient(roomId, clientId, patch) {
            this._ensureRoom(roomId);
            const arr = this.byRoom[roomId];
            const i = arr.findIndex((m) => (m.client_id || m.id) === clientId);
            if (i >= 0) arr[i] = { ...arr[i], ...patch };
        },

        _ackOutbox(clientId, serverRow) {
            if (!clientId) return;
            const ob = this.outbox.find((x) => x.clientId === clientId);
            if (!ob) return;

            ob.status = "sent";
            ob.serverId = serverRow?.id || ob.serverId || null;
            ob.error = null;
            this._saveOutbox();
        },

        // ---------- outbox persistence ----------
        _saveOutbox() {
            try {
                localStorage.setItem(OUTBOX_KEY, JSON.stringify(this.outbox));
            } catch {
                // localStorage sometimes just says "no ❤️"
            }
        },

        _loadOutbox() {
            try {
                const raw = localStorage.getItem(OUTBOX_KEY);
                this.outbox = raw ? JSON.parse(raw) : [];
            } catch {
                this.outbox = [];
            }
        },

        // ---------- PUSH: server fan-out by HOUSE ----------
        async _pushRoomMessageToHouse({ houseId, roomId, fromUserId, fromName, text, createdAt, msgId }) {
            const roomKey = this._resolveRoomKey(roomId);
            const roomName = this._resolveRoomName(roomId);

            if (!houseId) {
                console.warn("[push][room->house] missing houseId (no house => no humans => no push)");
                return;
            }
            if (!roomKey) {
                console.warn("[push][room->house] no roomKey mapping for roomId:", roomId);
                return;
            }

            const payload = {
                groupKey: `room_${roomKey}`,
                title: roomName || "GIO",          // ✅ Title: room name
                body: String(text || ""),          // ✅ Body: message text
                url: `/room/${roomKey}`,
                msgId: String(msgId || `${roomId}_${Date.parse(createdAt) || Date.now()}`),

                // extras used by SW
                fromUserId: String(fromUserId),
                roomKey: String(roomKey),

                // ✅ WhatsApp-ish: "username: message"
                lineTitle: String(fromName || "GIO"),
            };

            console.log("[push][room->house] calling /api/send-push (server fan-out)", {
                houseId,
                roomKey,
                fromUserId,
                fromName,
            });

            const res = await withTimeout(
                fetch("/api/send-push", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ houseId: String(houseId), payload }),
                }),
                7000,
                "send-push house fetch timeout"
            );

            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(`send-push failed ${res.status} ${txt}`);
            }

            const json = await res.json().catch(() => ({}));
            console.log("[push][room->house] ok", json?.sent, "sent");
        },

        // ---------- realtime inbox (unread counters) ----------
        subscribeInbox() {
            if (this._roomInboxSub) return;

            console.log("[roomInbox] subscribing...");

            const ch = supabase
                .channel("room_inbox")
                .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
                    const r = payload?.new;
                    if (!r) return;

                    const myId = session.value?.user?.id ?? null;
                    if (myId && String(r.user_id) === String(myId)) return;

                    const roomKey = this._resolveRoomKey(r.room_id);
                    if (!roomKey) {
                        console.warn("[roomInbox] no roomKey mapping for room_id:", r.room_id);
                        return;
                    }

                    const rooms = useRoomsStore();
                    rooms.bumpLastMessage(roomKey, { text: r.text ?? "", created_at: r.created_at, user_id: r.user_id });

                    const notif = useNotificationsStore();
                    notif.onIncomingRoom({
                        roomKey,
                        fromUserId: r.user_id,
                        myUserId: myId,
                        createdAtMs: Date.parse(r.created_at) || Date.now(),
                    });
                })
                .subscribe((status) => console.log("[roomInbox] status:", status));

            this._roomInboxSub = ch;
        },

        async unsubscribeInbox() {
            if (!this._roomInboxSub) return;
            try {
                await supabase.removeChannel(this._roomInboxSub);
            } catch { }
            this._roomInboxSub = null;
        },

        // ---------- public API ----------
        installGuards() {
            if (this._guardsInstalled) return;
            this._guardsInstalled = true;

            this._loadOutbox();
            this.hydrateOutboxToUI();
            this.startWorker();
            this.subscribeInbox();

            const kick = () => {
                this.hydrateOutboxToUI();
                void this.runWorker("guard");
            };

            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible") kick();
            });
            window.addEventListener("online", kick);
            window.addEventListener("focus", kick);
            window.addEventListener("pageshow", kick);
        },

        async load(roomId, limit = 200) {
            if (!roomId) return;
            this._ensureRoom(roomId);

            const { data, error } = await supabase
                .from("messages")
                .select("id,client_id,room_id,user_id,text,created_at,reply_to_id")
                .eq("room_id", roomId)
                .order("created_at", { ascending: false })
                .limit(limit);

            if (error) throw error;

            const rows = (data || [])
                .reverse()
                .map((r) => ({
                    id: r.id,
                    client_id: r.client_id,
                    room_id: r.room_id,
                    user_id: r.user_id,
                    text: r.text ?? "",
                    created_at: r.created_at,
                    reply_to_id: r.reply_to_id || null,
                    _status: null,
                    _error: null,
                }));

            this.byRoom[roomId] = rows;
            this.hydrateOutboxToUI();
        },

        subscribe(roomId) {
            if (!roomId) return;
            if (this.subs[roomId]) return;

            const ch = supabase
                .channel(`room_msgs_${roomId}`)
                .on(
                    "postgres_changes",
                    { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
                    (payload) => {
                        const r = payload.new;
                        if (!r) return;

                        const msg = {
                            id: r.id,
                            client_id: r.client_id,
                            room_id: r.room_id,
                            user_id: r.user_id,
                            text: r.text ?? "",
                            created_at: r.created_at,
                            reply_to_id: r.reply_to_id || null,
                            _status: null,
                            _error: null,
                        };

                        this._upsertMessage(roomId, msg);
                        if (r.client_id) this._ackOutbox(r.client_id, r);
                    }
                )
                .subscribe();

            this.subs[roomId] = ch;
        },

        async unsubscribe(roomId) {
            const ch = this.subs[roomId];
            if (!ch) return;
            try {
                await supabase.removeChannel(ch);
            } catch { }
            delete this.subs[roomId];
        },

        // ---------- worker ----------
        async runWorker(reason = "manual") {
            if (this._runLock) return;
            if (isPaused()) return;

            this._runLock = true;
            try {
                const auth = useAuthStore();
                await auth.init();

                let userId = null;
                try {
                    userId = await auth.waitUntilReady(5000);
                } catch {
                    return;
                }

                // 🏠 Current house (source of truth for push fan-out)
                const house = useHouseStore();
                const houseId =
                    house.currentHouseId ||
                    house.houseId ||
                    house.activeHouseId ||
                    house.currentHouse?.id ||
                    null;

                // ✅ SENDER NAME (username)
                const profiles = useProfilesStore();
                try { await profiles.ensureLoaded([userId]); } catch { }
                const me = profiles.getById?.(userId) || profiles.byId?.[userId] || null;
                const fromName = String(me?.nickname || "GIO");

                for (const item of this.outbox) {
                    if (item.status !== "queued") continue;
                    if (item.attempts >= MAX_ATTEMPTS) continue;

                    this._markClient(item.roomId, item.clientId, { _status: "pending", _error: null });

                    item.status = "sending";
                    item.attempts += 1;
                    item.lastAttemptAt = Date.now();
                    item.error = null;
                    this._saveOutbox();

                    try {
                        const { data, error } = await supabase
                            .from("messages")
                            .insert({
                                client_id: item.clientId,
                                room_id: item.roomId,
                                user_id: userId,
                                text: item.content,
                                reply_to_id: item.replyToId || null,
                            })
                            .select("id,client_id,room_id,user_id,text,created_at,reply_to_id")
                            .single();

                        if (error) throw error;

                        console.log("[push][room] about to push", { roomId: item.roomId, userId, text: data.text });

                        // ✅ ACK UI immediately
                        this._upsertMessage(item.roomId, {
                            id: data.id,
                            client_id: data.client_id,
                            room_id: data.room_id,
                            user_id: data.user_id,
                            text: data.text ?? "",
                            created_at: data.created_at,
                            reply_to_id: data.reply_to_id || null,
                            _status: null,
                            _error: null,
                        });

                        // ✅ optimistic last-message preview
                        try {
                            const rooms = useRoomsStore();
                            const rk = this._resolveRoomKey(item.roomId);
                            if (rk) {
                                rooms.bumpLastMessage(rk, {
                                    text: data.text ?? item.content,
                                    created_at: data.created_at,
                                    user_id: data.user_id,
                                });
                            }
                        } catch { }

                        // ✅ PUSH (best-effort, server fan-out by house)
                        try {
                            await this._pushRoomMessageToHouse({
                                houseId,
                                roomId: item.roomId,
                                fromUserId: userId,
                                fromName,
                                text: data.text ?? item.content,
                                createdAt: data.created_at,
                                msgId: data.id,
                            });
                        } catch (e) {
                            console.warn("[push][room] failed (non-blocking):", e?.message || e);
                        }

                        item.status = "sent";
                        item.serverId = data.id;
                        item.error = null;
                        this._saveOutbox();
                    } catch (e) {
                        item.status = "queued";
                        item.error = e?.message || "SEND_FAILED";
                        this._saveOutbox();

                        if (item.attempts >= 3) {
                            this._markClient(item.roomId, item.clientId, { _status: "failed", _error: item.error });
                        } else {
                            this._markClient(item.roomId, item.clientId, { _status: "pending", _error: null });
                        }

                        await sleep(Math.min(250 * item.attempts, 900));
                    }
                }
            } finally {
                this._runLock = false;
            }
        },

        startWorker() {
            if (this._worker) return;
            this._worker = setInterval(() => {
                if (document.visibilityState !== "visible") return;
                if (!navigator.onLine) return;
                void this.runWorker("tick");
            }, WORKER_MS);
        },

        cancelWorker() {
            if (this._worker) clearInterval(this._worker);
            this._worker = null;
        },

        // ---------- send API ----------
        enqueueSend(roomId, text, replyToId = null) {
            if (!roomId) throw new Error("NO_ROOM");
            const content = String(text || "").trim();
            if (!content) throw new Error("EMPTY_MESSAGE");

            const clientId = uuid();
            const created_at = nowIso();

            // optimistic UI (Discord vibe)
            this._upsertMessage(roomId, {
                id: clientId,
                client_id: clientId,
                room_id: roomId,
                user_id: null,
                text: content,
                created_at,
                reply_to_id: replyToId,
                _status: "pending",
                _error: null,
            });

            // optimistic last message in rooms list
            try {
                const rooms = useRoomsStore();
                const rk = this._resolveRoomKey(roomId);
                if (rk) {
                    rooms.bumpLastMessage(rk, {
                        text: content,
                        at: Date.now(),
                        user_id: session.value?.user?.id ?? null,
                    });
                }
            } catch { }

            this.outbox.push({
                clientId,
                roomId,
                content,
                replyToId,
                createdAt: Date.now(),
                status: "queued",
                attempts: 0,
                lastAttemptAt: 0,
                error: null,
                serverId: null,
            });

            this._saveOutbox();
            void this.runWorker("enqueue");
            return clientId;
        },

        async send(roomId, text, replyToId = null) {
            return this.enqueueSend(roomId, text, replyToId);
        },

        hydrateOutboxToUI() {
            for (const item of this.outbox) {
                if (!item.roomId) continue;

                if (item.status === "sent") {
                    this._markClient(item.roomId, item.clientId, { _status: null, _error: null });
                    continue;
                }

                const isFailedUI = item.attempts >= 3 && item.error;
                this._markClient(item.roomId, item.clientId, {
                    _status: isFailedUI ? "failed" : "pending",
                    _error: isFailedUI ? item.error : null,
                });
            }
        },

        retryClient(roomId, clientId) {
            const ob = this.outbox.find((x) => x.clientId === clientId && x.roomId === roomId);
            if (!ob) return false;

            ob.status = "queued";
            ob.error = null;
            ob.attempts = 0;
            ob.lastAttemptAt = 0;
            this._saveOutbox();

            this._markClient(roomId, clientId, { _status: "pending", _error: null });
            void this.runWorker("retryClient");
            return true;
        },
    },
});
