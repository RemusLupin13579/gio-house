/* /public/sw.js */
const SW_VERSION = "2026-01-25_wa_final_01";
const STORE_CACHE = "gio:notif:groups:v1";
const MAX_LINES = 5;

console.log("[SW] boot", SW_VERSION);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
    const msg = event.data || {};
    if (msg.type === "PING_SW_VERSION") {
        event.source?.postMessage?.({ type: "SW_VERSION", version: SW_VERSION });
        return;
    }
    if (msg.type === "CLEAR_GROUP" && msg.groupKey) {
        event.waitUntil(clearGroup(String(msg.groupKey)));
        return;
    }
    if (msg.type === "CLEAR_ALL_GROUPS") {
        event.waitUntil(clearAllGroups());
        return;
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

async function loadGroup(groupKey) {
    const cache = await caches.open(STORE_CACHE);
    const res = await cache.match(`/__notif_group__/${encodeURIComponent(groupKey)}`);
    if (!res) return null;
    try {
        return await res.json();
    } catch {
        return null;
    }
}

async function saveGroup(groupKey, data) {
    const cache = await caches.open(STORE_CACHE);
    await cache.put(
        `/__notif_group__/${encodeURIComponent(groupKey)}`,
        new Response(JSON.stringify(data), {
            headers: { "Content-Type": "application/json" },
        })
    );
}

async function clearGroup(groupKey) {
    const cache = await caches.open(STORE_CACHE);
    await cache.delete(`/__notif_group__/${encodeURIComponent(groupKey)}`);
    try {
        await self.registration.getNotifications({ tag: groupKey }).then((ns) => ns.forEach((n) => n.close()));
    } catch { }
    console.log("[SW] cleared group", groupKey);
}

async function clearAllGroups() {
    const cache = await caches.open(STORE_CACHE);
    const keys = await cache.keys();
    await Promise.all(keys.map((k) => cache.delete(k)));
    try {
        const ns = await self.registration.getNotifications();
        ns.forEach((n) => n.close());
    } catch { }
    console.log("[SW] cleared ALL groups");
}

/* /public/sw.js */

self.addEventListener("push", (event) => {
    event.waitUntil(
        (async () => {
            const data = safeJson(event);

            // חילוץ נתונים מה-Payload
            const groupKey = String(data.groupKey || data.tag || "gio").trim() || "gio";
            const msgId = String(data.msgId || `${Date.now()}`);
            const title = String(data.title || "GIO").trim(); // שם השולח/קבוצה
            const text = String(data.body || "New message").trim();
            const url = String(data.url || "/");

            // טיפול באייקון - חובה URL מוחלט
            const iconUrl = typeof data.iconUrl === "string" && data.iconUrl.startsWith("http")
                ? data.iconUrl
                : "https://gio-home.vercel.app/pwa-192.png";

            // יצירת שורה בסגנון וואטסאפ: "שם: תוכן"
            const newLineText = `${title}: ${text}`;
            const clippedLine = clip(newLineText, 180);

            // טעינת מצב קבוצה קיים
            let prev = (await loadGroup(groupKey)) || {
                groupKey,
                title, // כותרת ראשית (למשל שם הקבוצה)
                url,
                iconUrl,
                lines: [],
                unread: 0,
                lastMsgId: null,
                collapsed: true
            };

            // עדכון נתונים אם זו הודעה חדשה (De-duplication)
            if (prev.lastMsgId !== msgId) {
                prev.lines = [...(prev.lines || []), clippedLine].slice(-5); // שומרים 5 אחרונות
                prev.unread = (Number(prev.unread) || 0) + 1;
                prev.lastMsgId = msgId;
                prev.lastAt = Date.now();
                // מעדכנים מטא-דאטה מההודעה האחרונה
                prev.iconUrl = iconUrl;
                prev.url = url;
            }

            await saveGroup(groupKey, prev);

            // בניית תוכן ההתראה
            const lines = prev.lines || [];
            // בכותרת: אם יש כמה הודעות, נכתוב כמה. אם אחת, נכתוב את שם השולח.
            const displayTitle = prev.unread > 1 ? `${prev.unread} הודעות חדשות` : title;

            // ב-Body: אם מקופץ מראים רק את האחרונה, אם מורחב מראים הכל
            const body = prev.collapsed
                ? text
                : (lines.length > 0 ? lines.join("\n") : text);

            const options = {
                tag: groupKey,
                body: body,
                icon: prev.iconUrl,
                badge: "https://gio-home.vercel.app/pwa-192.png",
                renotify: true,
                data: { url: prev.url, groupKey },
                vibrate: [60, 30, 60],
                timestamp: prev.lastAt,
                actions: [
                    { action: "toggle", title: prev.collapsed ? "הצג הודעות (▾)" : "צמצם (▴)" },
                    { action: "mark_read", title: "נקרא" }
                ]
            };

            return self.registration.showNotification(displayTitle, options);
        })()
    );
});

self.addEventListener("notificationclick", (event) => {
    const action = event.action || "";
    const url = event.notification?.data?.url || "/";
    const groupKey = event.notification?.data?.groupKey || null;

    event.notification.close();

    event.waitUntil((async () => {
        if (!groupKey) {
            if (clients.openWindow) return clients.openWindow(url);
            return;
        }

        if (action === "mark_read") {
            await clearGroup(String(groupKey));
            return;
        }

        if (action === "toggle") {
            const prev = (await loadGroup(String(groupKey))) || null;
            if (prev) {
                prev.collapsed = !prev.collapsed;
                await saveGroup(String(groupKey), prev);

                // re-show same notification with new body state
                const lines = (prev.lines || []).map((x) => x.line);
                const lastLine = lines[lines.length - 1] || "New message";
                const body = prev.collapsed ? lastLine : (lines.length ? lines.join("\n") : lastLine);

                await self.registration.showNotification(prev.title || "GIO", {
                    tag: String(groupKey),
                    renotify: false,
                    silent: true,
                    icon: prev.iconUrl || "/pwa-192.png?v=1",
                    badge: prev.badgeUrl || "/pwa-192.png?v=1",
                    body,
                    data: { url: prev.url || "/", groupKey: String(groupKey) },
                    actions: [
                        { action: "toggle", title: prev.collapsed ? "▾" : "▴" },
                        { action: "open", title: "Open" },
                        { action: "mark_read", title: "Mark read" },
                    ],
                });
            }
            return;
        }

        // default: open
        const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const c of allClients) {
            if ("focus" in c) {
                await c.focus();
                try { await c.navigate(url); } catch { }
                await clearGroup(String(groupKey));
                return;
            }
        }
        if (clients.openWindow) {
            const w = await clients.openWindow(url);
            await clearGroup(String(groupKey));
            return w;
        }
    })());
});

