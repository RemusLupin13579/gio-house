// /src/stores/messages.js
import { defineStore } from "pinia";
import { supabase } from "../services/supabase";
import { useAuthStore } from "./auth";
import { isPaused } from "../lifecycle/resume";

const OUTBOX_KEY = "gio-outbox-v2";
const WORKER_MS = 1200;
const MAX_ATTEMPTS = 6;

function uuid() {
    return crypto.randomUUID();
}

function nowIso() {
    return new Date().toISOString();
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

export const useMessagesStore = defineStore("messages", {
    state: () => ({
        byRoom: {}, // { [roomId]: Message[] }
        subs: {}, // { [roomId]: RealtimeChannel }
        outbox: [], // OutboxItem[]
        _worker: null,
        _guardsInstalled: false,
        _runLock: false,
    }),

    getters: {
        messagesInRoom: (s) => (roomId) => s.byRoom?.[roomId] || [],
    },

    actions: {
        // ---------- outbox persistence ----------
        _saveOutbox() {
            try {
                localStorage.setItem(OUTBOX_KEY, JSON.stringify(this.outbox));
            } catch { }
        },

        _loadOutbox() {
            try {
                const raw = localStorage.getItem(OUTBOX_KEY);
                this.outbox = raw ? JSON.parse(raw) : [];
            } catch {
                this.outbox = [];
            }
        },

        // ---------- room helpers ----------
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

            // 1) client_id dedupe (best)
            if (msg.client_id) {
                const i = arr.findIndex((m) => m.client_id && m.client_id === msg.client_id);
                if (i >= 0) {
                    arr[i] = { ...arr[i], ...msg };
                    this._sortRoom(roomId);
                    return;
                }
            }

            // 2) id dedupe
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

        // ---------- public API ----------
        installGuards() {
            if (this._guardsInstalled) return;
            this._guardsInstalled = true;

            this._loadOutbox();
            this.hydrateOutboxToUI();
            this.startWorker();

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

            // ✅ fetch last N messages
            const { data, error } = await supabase
                .from("messages")
                .select("id,client_id,room_id,user_id,text,created_at,reply_to_id")
                .eq("room_id", roomId)
                .order("created_at", { ascending: false })
                .limit(limit);

            if (error) throw error;

            // ✅ reverse to display in chronological order
            const rows = (data || []).reverse().map((r) => ({
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

                        // ACK outbox if it's ours
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

        // deterministic worker (no parallel runs)
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
                    return; // no auth -> keep queued
                }

                // send only queued
                for (const item of this.outbox) {
                    if (item.status !== "queued") continue;
                    if (item.attempts >= MAX_ATTEMPTS) continue;

                    // optimistic UI should exist; ensure it stays visible
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

                        // immediate ACK (even if realtime is slow)
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

                        item.status = "sent";
                        item.serverId = data.id;
                        item.error = null;
                        this._saveOutbox();
                    } catch (e) {
                        // never stuck on "sending"
                        item.status = "queued";
                        item.error = e?.message || "SEND_FAILED";
                        this._saveOutbox();

                        // after a few attempts, show failed (tap to retry)
                        if (item.attempts >= 3) {
                            this._markClient(item.roomId, item.clientId, { _status: "failed", _error: item.error });
                        } else {
                            this._markClient(item.roomId, item.clientId, { _status: "pending", _error: null });
                        }

                        // tiny backoff so we don't hammer
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

        // ChatPanel: enqueueSend(roomId, text, replyToId)
        enqueueSend(roomId, text, replyToId = null) {
            if (!roomId) throw new Error("NO_ROOM");
            const content = String(text || "").trim();
            if (!content) throw new Error("EMPTY_MESSAGE");

            const clientId = uuid();
            const created_at = nowIso();

            // optimistic message (Discord style)
            this._upsertMessage(roomId, {
                id: clientId, // temp id
                client_id: clientId,
                room_id: roomId,
                user_id: null,
                text: content,
                created_at,
                reply_to_id: replyToId,
                _status: "pending",
                _error: null,
            });

            this.outbox.push({
                clientId,
                roomId,
                content,
                replyToId,
                createdAt: Date.now(),
                status: "queued", // queued | sending | sent
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
