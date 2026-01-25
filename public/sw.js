/* /public/sw.js */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
    event.waitUntil((async () => {
        let data = {};
        try { data = event.data ? event.data.json() : {}; } catch { }

        const title = data.title || "GIO";
        const body = data.body || "New message";
        const url = data.url || "/";

        const baseTag = data.baseTag || data.tag || "gio";
        const msgId = String(data.msgId || Date.now());
        const stack = data.stack !== false;

        // ✅ אם stack=true => tag ייחודי => לא ידרוס
        const tag = stack ? `${baseTag}_${msgId}` : baseTag;

        const icon = data.iconUrl || "/pwa-192.png?v=1";
        const badge = data.badgeUrl || "/pwa-192.png?v=1";
        const image = data.imageUrl || undefined;

        const options = {
            body,
            tag,
            renotify: false,
            silent: false,
            data: { url, msgId, threadId: data.threadId || null },
            icon,
            badge,
            ...(image ? { image } : {}),
            vibrate: [80, 40, 80],
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
