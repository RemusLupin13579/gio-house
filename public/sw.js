/* /public/sw.js */

self.addEventListener("install", (event) => {
    // חשוב כדי שהגרסה החדשה תיכנס מיד
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        // חשוב כדי שה-SW ישלוט מיידית על טאבים קיימים
        await self.clients.claim();
    })());
});

self.addEventListener("push", (event) => {
    // ✅ לוג שחייב להופיע בקונסול של ה-Service Worker
    console.log("[SW] PUSH RECEIVED", event);

    let data = {};
    try { data = event.data ? event.data.json() : {}; }
    catch (e) { console.warn("[SW] push data parse failed", e); }

    console.log("[SW] payload:", data);

    const title = data.title || "GIO";
    const body = data.body || "New message";
    const url = data.url || "/";
    const tag = data.tag || "gio";

    const options = {
        body,
        tag,
        renotify: true,
        silent: false,
        data: { url },
        icon: "/pwa-192.png?v=1",
        badge: "/pwa-192.png?v=1",
        vibrate: [80, 40, 80],
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
