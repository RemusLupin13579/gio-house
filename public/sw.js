/* /public/sw.js */

/**
 * Web Push handler
 * Note: iOS works ONLY for installed PWA (Add to Home Screen) + iOS 16.4+
 */

self.addEventListener("push", (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { }

    const title = data.title || "GIO";
    const body = data.body || "New message";
    const url = data.url || "/";
    const tag = data.tag || "gio";

    const options = {
        body,
        tag,
        renotify: true,
        data: { url },
        icon: "/pwa-192.png?v=1",
        badge: "/pwa-192.png?v=1",
        vibrate: [80, 40, 80], // Android mostly
    };

    event.waitUntil(self.registration.showNotification(title, options));
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
