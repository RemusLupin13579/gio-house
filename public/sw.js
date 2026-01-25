/* /public/sw.js */

const SW_VERSION = "2026-01-25_05";

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

self.addEventListener("push", (event) => {
    event.waitUntil((async () => {
        const data = safeJson(event);

        // חובה - בלי זה אתה מקבל "fallback weird"
        const title = String(data.title || "GIO").trim() || "GIO";
        const body = clip(data.body || "New message", 180);
        const url = data.url || "/";

        const threadId = String(data.threadId || "");
        const msgId = String(data.msgId || `${Date.now()}_${Math.random().toString(16).slice(2)}`);

        // ✅ stack: tag ייחודי לכל הודעה
        const base = data.baseTag || data.tag || (threadId ? `dm_${threadId}` : "gio");
        const tag = `${base}_${msgId}`;

        // ✅ icon: אם אין iconUrl תקין -> דיפולט
        const iconUrl = (typeof data.iconUrl === "string" && data.iconUrl.startsWith("http"))
            ? data.iconUrl
            : "/pwa-192.png?v=1";

        const badgeUrl = (typeof data.badgeUrl === "string" && data.badgeUrl.length)
            ? data.badgeUrl
            : "/pwa-192.png?v=1";

        console.log("[SW] push", SW_VERSION, {
            title,
            threadId,
            msgId,
            tag,
            iconUrl,
        });

        const options = {
            body,
            tag,
            renotify: false,
            silent: false,
            data: { url, threadId, msgId },
            icon: iconUrl,   // זה ה-"תמונה בצד שמאל" ברוב הפלטפורמות
            badge: badgeUrl,
            vibrate: [80, 40, 80],
            // timestamp (כרום אנדרואיד מכבד לפעמים)
            timestamp: Date.now(),
        };

        await self.registration.showNotification(title, options);
    })());
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = event.notification?.data?.url || "/";

    event.waitUntil((async () => {
        const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });

        for (const c of allClients) {
            if ("focus" in c) {
                await c.focus();
                try { await c.navigate(url); } catch { }
                return;
            }
        }
        if (clients.openWindow) return clients.openWindow(url);
    })());
});
