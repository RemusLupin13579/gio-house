/* /public/sw.js */
const SW_VERSION = "2026-01-25_wa_01";
console.log("[SW] boot", SW_VERSION);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
    if (event.data?.type === "PING_SW_VERSION") {
        event.source?.postMessage?.({ type: "SW_VERSION", version: SW_VERSION });
    }
});

function safeJson(event) {
    try { return event.data ? event.data.json() : {}; } catch { return {}; }
}

function clip(s, n = 160) {
    const t = String(s || "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

// שומר “הודעות אחרונות” לכל groupKey בתוך Cache Storage (פשוט ויציב)
async function readGroupLog(groupKey) {
    const cache = await caches.open("gio-notif-v1");
    const key = new Request(`https://gio.local/notif/${encodeURIComponent(groupKey)}`);
    const res = await cache.match(key);
    if (!res) return [];
    try { return await res.json(); } catch { return []; }
}

async function writeGroupLog(groupKey, arr) {
    const cache = await caches.open("gio-notif-v1");
    const key = new Request(`https://gio.local/notif/${encodeURIComponent(groupKey)}`);
    await cache.put(key, new Response(JSON.stringify(arr), { headers: { "Content-Type": "application/json" } }));
}

self.addEventListener("push", (event) => {
    event.waitUntil((async () => {
        const data = safeJson(event);

        const groupKey = String(data.groupKey || data.tag || "gio").trim() || "gio";
        const title = String(data.title || "GIO").trim() || "GIO";
        const url = data.url || "/";
        const msgId = String(data.msgId || Date.now());

        const line = clip(data.body || "New message", 120);

        // ✅ צבירת שורות אחרונות (עד 4)
        const log = await readGroupLog(groupKey);
        const next = [{ id: msgId, t: Date.now(), line }, ...log].slice(0, 4);
        await writeGroupLog(groupKey, next);

        // body “מרובה שורות”
        const body =
            next.length === 1
                ? next[0].line
                : next.map((x) => `• ${x.line}`).reverse().join("\n");

        const iconUrl =
            (typeof data.iconUrl === "string" && data.iconUrl.length)
                ? data.iconUrl
                : "/pwa-192.png?v=1";

        const badgeUrl =
            (typeof data.badgeUrl === "string" && data.badgeUrl.length)
                ? data.badgeUrl
                : "/pwa-192.png?v=1";

        const imageUrl =
            (typeof data.imageUrl === "string" && data.imageUrl.startsWith("http"))
                ? data.imageUrl
                : undefined;

        const options = {
            tag: groupKey,                // וואטסאפ: אחד לכל שיחה
            body,
            data: { url, groupKey },
            icon: iconUrl,                // לוגו (iOS יראה את הלוגו בכל מקרה)
            badge: badgeUrl,
            ...(imageUrl ? { image: imageUrl } : {}),   // ✅ האוואטר כתמונה “בפנים”
            renotify: true,
            silent: false,
            vibrate: [60, 30, 60],
            timestamp: Date.now(),
        };


        console.log("[SW] showNotification", { groupKey, title, iconUrl });
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
