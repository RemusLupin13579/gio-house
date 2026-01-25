// /public/sw.js

self.addEventListener('push', function (event) {
    if (!event.data) return;

    const newData = event.data.json();
    const tag = newData.tag; // מזהה הקבוצה (למשל ID של הצאט)

    event.waitUntil(
        self.registration.getNotifications({ tag: tag }).then(notifications => {
            let currentNotification = notifications[0];
            let title = newData.title;
            let body = newData.body;
            let icon = newData.icon;

            if (currentNotification) {
                // אם כבר יש התראה פתוחה מאותו צ'אט/קבוצה
                const oldBody = currentNotification.body;
                // שרשור ההודעות (כמו בוואטסאפ)
                body = oldBody + '\n' + newData.title + ': ' + newData.body;
                title = "הודעות חדשות ב-" + newData.title;
            }

            return self.registration.showNotification(title, {
                body: body,
                icon: icon,
                badge: '/pwa-192.png',
                tag: tag, // חשוב לקיבוץ
                renotify: true, // מרעיד את המכשיר גם כשיש התראה קיימת
                data: newData.data,
                vibrate: [100, 50, 100],
                actions: [
                    { action: 'open', title: 'פתח צ'אט' }
                ]
            });
        })
    );
});

// טיפול בלחיצה על ההתראה
self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    const urlToOpen = event.notification.data.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (var i = 0; i < windowClients.length; i++) {
                var client = windowClients[i];
                if (client.url === urlToOpen && 'focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow(urlToOpen);
        })
    );
});

self.addEventListener("notificationclick", (event) => {
    const action = event.action;
    const groupKey = event.notification?.data?.groupKey;
    const url = event.notification?.data?.url || "/";

    event.notification.close();

    event.waitUntil((async () => {
        // "Mark read" רק מוחק state + סוגר
        if (action === "mark_read" && groupKey) {
            try {
                const cache = await caches.open("gio-notif-groups-v1");
                await cache.delete(`group:${groupKey}`);
            } catch { }
            return;
        }

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
