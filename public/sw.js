/* /public/sw.js */

const SW_VERSION = "2026-01-25_03";

console.log("[SW] boot", SW_VERSION);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
    if (event.data?.type === "PING_SW_VERSION") {
        event.source?.postMessage?.({ type: "SW_VERSION", version: SW_VERSION });
    }
});

function safeJson(event) {
    try {
        return event.data ? event.data.json() : {};
    } catch (e) {
        console.warn("[SW] push data parse failed", e);
        return {};
    }
}

function clip(s, n = 160) {
    const t = String(s || "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

// ---------- simple in-SW state for summary (no indexeddb, stable enough) ----------
const threadBuffers = new Map(); // threadId -> { title, icon, url, messages: string[], lastAt: number }

function pushToThread(threadId, title, icon, url, body) {
    const key = String(threadId || "unknown");
    const prev = threadBuffers.get(key) || { title, icon, url, messages: [], lastAt: 0 };
    const next = {
        title: title || prev.title || "GIO",
        icon: icon || prev.icon || "/pwa-192.png?v=1",
        url: url || prev.url || "/",
        messages: [clip(body, 120), ...(prev.messages || [])].slice(0, 5),
        lastAt: Date.now(),
    };
    threadBuffers.set(key, next);
    return next;
}

async function showSummary(threadId, summary) {
    const tid = String(threadId || "unknown");
    const tag = `dm_${tid}_summary`; // ✅ intentionally stable: updates summary instead of duplicating

    const lines = (summary.messages || []).slice(0, 5);
    const body =
        lines.length <= 1
            ? (lines[0] || "New message")
            : `${lines.length} new messages\n` + lines.map((x) => `• ${x}`).join("\n");

    const options = {
        body,
        tag,
        renotify: true,
        silent: false,
        data: { url: summary.url || "/", threadId: tid, kind: "summary" },
        icon: summary.icon || "/pwa-192.png?v=1",
        badge: "/pwa-192.png?v=1",
        vibrate: [80, 40, 80],
    };

    await self.registration.showNotification(summary.title || "GIO", options);
}

async function showPerMessage({ title, body, url, tagBase, msgId, iconUrl, badgeUrl, imageUrl, threadId }) {
    const baseTag = tagBase || `dm_${threadId || "unknown"}`;
    const mid = String(msgId || "");
    const unique =
        mid && mid.length > 0
            ? `${baseTag}_${mid}`
            : `${baseTag}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const icon = iconUrl || "/pwa-192.png?v=1";
    const badge = badgeUrl || "/pwa-192.png?v=1";

    const options = {
        body: clip(body, 160),
        tag: unique, // ✅ unique => stacks instead of overwriting
        renotify: false,
        silent: false,
        data: { url: url || "/", threadId: String(threadId || ""), msgId: mid || null, kind: "message" },
        icon,
        badge,
        ...(imageUrl ? { image: imageUrl } : {}),
        vibrate: [80, 40, 80],
    };

    await self.registration.showNotification(title || "GIO", options);
}

self.addEventListener("push", (event) => {
    event.waitUntil(
        (async () => {
            const data = safeJson(event);

            // expected payload fields (from your /api/send-push):
            // title, body, url, baseTag, msgId, stack, iconUrl, badgeUrl, imageUrl, threadId, showMessage

            const title = data.title || "GIO";
            const body = data.body || "New message";
            const url = data.url || "/";
            const threadId = String(data.threadId || data.baseTag?.replace(/^dm_/, "") || "unknown");

            // icon logic:
            // Prefer iconUrl (sender avatar). If not present => default.
            const iconUrl = data.iconUrl || "/pwa-192.png?v=1";
            const badgeUrl = data.badgeUrl || "/pwa-192.png?v=1";

            const baseTag = data.baseTag || data.tag || `dm_${threadId}`;
            const msgId = data.msgId || null;

            // By default: show per-message notification too (can turn off)
            const showMessage = data.showMessage !== false;

            // DEBUG
            console.log("[SW] push", SW_VERSION, {
                title,
                threadId,
                baseTag,
                msgId,
                showMessage,
                iconUrl,
            });

            // 1) Always update summary per thread (WhatsApp-like)
            const summary = pushToThread(threadId, title, iconUrl, url, body);
            await showSummary(threadId, summary);

            // 2) Optional per-message stacking
            if (showMessage) {
                await showPerMessage({
                    title,
                    body,
                    url,
                    tagBase: baseTag,
                    msgId,
                    iconUrl,
                    badgeUrl,
                    imageUrl: data.imageUrl || null,
                    threadId,
                });
            }
        })()
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = event.notification?.data?.url || "/";

    event.waitUntil(
        (async () => {
            const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });

            for (const c of allClients) {
                if ("focus" in c) {
                    await c.focus();
                    try {
                        await c.navigate(url);
                    } catch { }
                    return;
                }
            }
            if (clients.openWindow) return clients.openWindow(url);
        })()
    );
});
