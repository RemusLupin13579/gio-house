/* /public/sw.js */

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

async function resolveIconUrl(url, fallback) {
    if (!url) return fallback;

    try {
        // חשוב: אם ה-url הוא cross-origin בלי CORS תקין, זה ייפול — ואז נחזור ל-fallback
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error("icon fetch not ok: " + r.status);

        const ct = r.headers.get("content-type") || "";
        if (!ct.startsWith("image/")) throw new Error("icon not image: " + ct);

        const blob = await r.blob();
        // blob URL עובד טוב כאייקון מקומי
        return URL.createObjectURL(blob);
    } catch (e) {
        console.warn("[SW] iconUrl failed, fallback", url, e);
        return fallback;
    }
}

self.addEventListener("push", (event) => {
    event.waitUntil((async () => {
        console.log("[SW] PUSH RECEIVED", event);

        let data = {};
        try { data = event.data ? event.data.json() : {}; }
        catch (e) { console.warn("[SW] push data parse failed", e); }

        console.log("[SW] payload:", data);

        const title = data.title || "GIO";
        const body = data.body || "New message";
        const url = data.url || "/";
        const baseTag = data.tag || "gio";

        // ✅ Stack mode:
        // אם רוצים שהתראות לא ידרסו, תשלח data.stack=true
        // ואז tag נהיה ייחודי לכל הודעה
        const shouldStack = !!data.stack;
        const msgId = data.msgId || data.messageId || Date.now();
        const tag = shouldStack ? `${baseTag}_${msgId}` : baseTag;

        const fallbackIcon = "/pwa-192.png?v=1";
        const fallbackBadge = "/pwa-192.png?v=1";

        const icon = await resolveIconUrl(data.iconUrl, fallbackIcon);
        const badge = data.badgeUrl || fallbackBadge;
        const image = data.imageUrl || undefined;

        const options = {
            body,
            tag,
            renotify: !shouldStack, // אם stack=true אין סיבה "לנענע" אותה התראה
            silent: false,
            data: { url, threadId: data.threadId || null, msgId },
            icon,
            badge,
            ...(image ? { image } : {}),
            vibrate: [80, 40, 80],
        };

        await self.registration.showNotification(title, options);

        // אם יצרנו blob URL – אפשר לשחרר אחרי רגע (לא חובה, אבל נחמד)
        if (icon && icon.startsWith("blob:")) {
            setTimeout(() => {
                try { URL.revokeObjectURL(icon); } catch { }
            }, 10_000);
        }
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
