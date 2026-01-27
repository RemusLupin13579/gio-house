// /src/stores/dmMessages.js
import { defineStore } from "pinia";
import { supabase } from "../services/supabase";
import { useAuthStore } from "./auth";
import { isPaused } from "../lifecycle/resume";
import { useNotificationsStore } from "./notifications";
import { session } from "./auth";
import { useDMThreadsStore } from "./dmThreads";
import { useProfilesStore } from "./profiles";

const OUTBOX_KEY = "gio-dm-outbox-v1";
const WORKER_MS = 1200;
const MAX_ATTEMPTS = 6;

function uuid() { return crypto.randomUUID(); }
function nowIso() { return new Date().toISOString(); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function getPushApiUrl() {
    return "/api/send-push"; // תמיד same-origin
}


function previewText(s, n = 140) {
    const t = String(s || "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

export const useDMMessagesStore = defineStore("dmMessages", {
    state: () => ({
        byThread: {},
        subs: {},
        outbox: [],
        _worker: null,
        _guardsInstalled: false,
        _runLock: false,
        _inboxSub: null,
    }),

    getters: {
        messagesInThread: (s) => (threadId) => s.byThread?.[threadId] || [],
    },

    actions: {
        async loadThreadMessages(threadId) {
            return this.load(threadId);
        },

        _saveOutbox() {
            try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(this.outbox)); } catch { }
        },
        _loadOutbox() {
            try {
                const raw = localStorage.getItem(OUTBOX_KEY);
                this.outbox = raw ? JSON.parse(raw) : [];
            } catch { this.outbox = []; }
        },

        _ensureThread(threadId) {
            if (!this.byThread[threadId]) this.byThread[threadId] = [];
        },
        _sortThread(threadId) {
            this.byThread[threadId].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        },
        _upsert(threadId, msg) {
            this._ensureThread(threadId);
            const arr = this.byThread[threadId];

            if (msg.client_id) {
                const i = arr.findIndex((m) => m.client_id && m.client_id === msg.client_id);
                if (i >= 0) { arr[i] = { ...arr[i], ...msg }; this._sortThread(threadId); return; }
            }
            if (msg.id) {
                const j = arr.findIndex((m) => m.id && m.id === msg.id);
                if (j >= 0) { arr[j] = { ...arr[j], ...msg }; this._sortThread(threadId); return; }
            }
            arr.push(msg);
            this._sortThread(threadId);
        },
        _markClient(threadId, clientId, patch) {
            this._ensureThread(threadId);
            const arr = this.byThread[threadId];
            const i = arr.findIndex((m) => (m.client_id || m.id) === clientId);
            if (i >= 0) arr[i] = { ...arr[i], ...patch };
        },
        _ackOutbox(clientId, serverRow) {
            const ob = this.outbox.find((x) => x.clientId === clientId);
            if (!ob) return;
            ob.status = "sent";
            ob.serverId = serverRow?.id || ob.serverId || null;
            ob.error = null;
            this._saveOutbox();
        },

        subscribeInbox() {
            if (this._inboxSub) return;

            console.log("[dmInbox] subscribing...");

            const ch = supabase
                .channel("dm_inbox")
                .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages" }, (payload) => {
                    const r = payload?.new;
                    if (!r) return;

                    const myId = session.value?.user?.id ?? null;
                    if (myId && String(r.user_id) === String(myId)) return;

                    const notif = useNotificationsStore();
                    notif.onIncomingDM({
                        threadId: r.thread_id,
                        fromUserId: r.user_id,
                        myUserId: myId,
                        text: r.text ?? "",
                        createdAtMs: Date.parse(r.created_at) || Date.now(),
                    });
                    const dmThreads = useDMThreadsStore();
                    dmThreads.bumpLastMessage(String(r.thread_id), {
                        text: r.text ?? "",
                        created_at: r.created_at,
                        user_id: r.user_id,
                    });
                })
                .subscribe((status) => console.log("[dmInbox] status:", status));

            this._inboxSub = ch;
        },

        async unsubscribeInbox() {
            if (!this._inboxSub) return;
            try { await supabase.removeChannel(this._inboxSub); } catch { }
            this._inboxSub = null;
        },

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

        async load(threadId, limit = 200) {
            if (!threadId) return;
            this._ensureThread(threadId);

            const { data, error } = await supabase
                .from("dm_messages")
                .select("id,client_id,thread_id,user_id,text,created_at,reply_to_id")
                .eq("thread_id", threadId)
                .order("created_at", { ascending: true })
                .limit(limit);

            if (error) throw error;

            this.byThread[threadId] = (data || []).map((r) => ({
                id: r.id,
                client_id: r.client_id,
                thread_id: r.thread_id,
                user_id: r.user_id,
                text: r.text ?? "",
                created_at: r.created_at,
                reply_to_id: r.reply_to_id || null,
                _status: null,
                _error: null,
            }));

            this.hydrateOutboxToUI();
        },

        subscribe(threadId) {
            if (!threadId) return;
            if (this.subs[threadId]) return;

            const ch = supabase
                .channel(`dm_msgs_${threadId}`)
                .on("postgres_changes",
                    { event: "INSERT", schema: "public", table: "dm_messages", filter: `thread_id=eq.${threadId}` },
                    (payload) => {
                        const r = payload.new;
                        if (!r) return;

                        const msg = {
                            id: r.id,
                            client_id: r.client_id,
                            thread_id: r.thread_id,
                            user_id: r.user_id,
                            text: r.text ?? "",
                            created_at: r.created_at,
                            reply_to_id: r.reply_to_id || null,
                            _status: null,
                            _error: null,
                        };

                        this._upsert(threadId, msg);
                        // ✅ LIVE preview in DM list even when inside the thread
                        const dmThreads = useDMThreadsStore();
                        dmThreads.bumpLastMessage(String(threadId), {
                            text: msg.text ?? "",
                            created_at: msg.created_at,
                            user_id: msg.user_id,
                        });
                        if (r.client_id) this._ackOutbox(r.client_id, r);
                    }
                )
                .subscribe();

            this.subs[threadId] = ch;
        },

        async unsubscribe(threadId) {
            const ch = this.subs[threadId];
            if (!ch) return;
            try { await supabase.removeChannel(ch); } catch { }
            delete this.subs[threadId];
        },

        enqueueSend(threadId, text, replyToId = null) {
            if (!threadId) throw new Error("NO_THREAD");
            const content = String(text || "").trim();
            if (!content) throw new Error("EMPTY_MESSAGE");

            const clientId = uuid();
            const created_at = nowIso();

            this._upsert(threadId, {
                id: clientId,
                client_id: clientId,
                thread_id: threadId,
                user_id: null,
                text: content,
                created_at,
                reply_to_id: replyToId,
                _status: "pending",
                _error: null,
            });

            this.outbox.push({
                clientId,
                threadId,
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

        async runWorker() {
            if (this._runLock) return;
            if (isPaused()) return;

            this._runLock = true;
            try {
                const auth = useAuthStore();
                await auth.init();

                let userId = null;
                try { userId = await auth.waitUntilReady(5000); }
                catch { return; }

                const dmThreads = useDMThreadsStore();
                const profilesStore = useProfilesStore();

                // ensure my profile cached => stable nickname
                try { await profilesStore.ensureLoaded([userId]); } catch { }
                const me = profilesStore.getById(userId);

                const fromName = String(me?.nickname || "GIO");

                for (const item of this.outbox) {
                    if (item.status !== "queued") continue;
                    if (item.attempts >= MAX_ATTEMPTS) continue;

                    this._markClient(item.threadId, item.clientId, { _status: "pending", _error: null });

                    item.status = "sending";
                    item.attempts += 1;
                    item.lastAttemptAt = Date.now();
                    item.error = null;
                    this._saveOutbox();

                    try {
                        const { data, error } = await supabase
                            .from("dm_messages")
                            .insert({
                                client_id: item.clientId,
                                thread_id: item.threadId,
                                user_id: userId,
                                text: item.content,
                                reply_to_id: item.replyToId || null,
                            })
                            .select("id,client_id,thread_id,user_id,text,created_at,reply_to_id")
                            .single();

                        if (error) throw error;

                        this._upsert(item.threadId, {
                            id: data.id,
                            client_id: data.client_id,
                            thread_id: data.thread_id,
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

                        // ---- PUSH (best-effort) ----
                        try {
                            const t = dmThreads.byId(item.threadId);
                            const toUserId = t?.otherUserId || null;
                            if (!toUserId || String(toUserId) === String(userId)) continue;

                            const payload = {
                                // WhatsApp-ish: one notification per conversation
                                groupKey: `dm_${item.threadId}`,
                                title: fromName,
                                body: previewText(item.content, 180),
                                url: `/dm/${item.threadId}`,
                                msgId: String(data.id),

                                // IMPORTANT: server will resolve icon from bucket avatars/<fromUserId>/*
                                fromUserId: String(userId),

                                // logo as badge
                                badgeUrl: "/pwa-192.png?v=1",
                            };

                            console.log("[send-push] calling /api/send-push", {
                                toUserId,
                                groupKey: payload.groupKey,
                                msgId: payload.msgId,
                                fromUserId: payload.fromUserId,
                            });

                            const resp = await fetch(getPushApiUrl(), {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ toUserId, payload }),
                            });

                            const json = await resp.json().catch(() => ({}));
                            if (!resp.ok) console.warn("[send-push] failed:", resp.status, json);
                            else console.log("[send-push] ok:", json);
                        } catch (e) {
                            console.warn("[send-push] best-effort crashed:", e);
                        }
                    } catch (e) {
                        item.status = "queued";
                        item.error = e?.message || "SEND_FAILED";
                        this._saveOutbox();

                        if (item.attempts >= 3) {
                            this._markClient(item.threadId, item.clientId, { _status: "failed", _error: item.error });
                        } else {
                            this._markClient(item.threadId, item.clientId, { _status: "pending", _error: null });
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

        hydrateOutboxToUI() {
            for (const item of this.outbox) {
                if (!item.threadId) continue;

                if (item.status === "sent") {
                    this._markClient(item.threadId, item.clientId, { _status: null, _error: null });
                    continue;
                }

                const failed = item.attempts >= 3 && item.error;
                this._markClient(item.threadId, item.clientId, {
                    _status: failed ? "failed" : "pending",
                    _error: failed ? item.error : null,
                });
            }
        },

        retryClient(threadId, clientId) {
            const ob = this.outbox.find((x) => x.clientId === clientId && x.threadId === threadId);
            if (!ob) return false;

            ob.status = "queued";
            ob.error = null;
            ob.attempts = 0;
            ob.lastAttemptAt = 0;
            this._saveOutbox();

            this._markClient(threadId, clientId, { _status: "pending", _error: null });
            void this.runWorker("retryClient");
            return true;
        },
    },
});
