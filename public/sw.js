/* /public/sw.js */

const SW_VERSION = "2026-01-25_06";
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

function clip(s, n = 180) {
    const t = String(s || "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

async function readGroupState(groupKey) {
    try {
        const cache = await caches.open("gio-notif-groups-v1");
        const res = await cache.match(`group:${groupKey}`);
        if (!res) return { count: 0, lines: [] };
        const json = await res.json().catch(() => null);
        if (!json) return { count: 0, lines: [] };
        return {
            count: Number(json.count || 0),
            lines: Array.isArray(json.lines) ? json.lines : [],
        };
    } catch {
        return { count: 0, lines: [] };
    }
}

async function writeGroupState(groupKey, state) {
    try {
        const cache = await caches.open("gio-notif-groups-v1");
        await cache.put(
            `group:${groupKey}`,
            new Response(JSON.stringify(state), {
                headers: { "Content-Type": "application/json" },
            })
        );
    } catch { }
}

async function cacheIcon(iconUrl) {
    // Windows/Chrome לפעמים מתעלמים מ-icon מרוחק.
    // caching לא מבטיח 100%, אבל משפר יציבות בפועל.
    if (!iconUrl || typeof iconUrl !== "string") return;
    if (!iconUrl.startsWith("http")) return;

    try {
        const cache = await caches.open("gio-avatars-v1");
        const hit = await cache.match(iconUrl);
        if (hit) return;

        const resp = await fetch(iconUrl, { cache: "no-store" }).catch(() => null);
        // גם opaque יכול להיכנס לקאש
        if (resp) await cache.put(iconUrl, resp);
    } catch { }
}

self.addEventListener("push", (event) => {
    event.waitUntil((async () => {
        const data = safeJson(event);

        // ====== Payload expected ======
        // {
        //   groupKey: "dm_<threadId>" | "room_<roomKey>" | ...
        //   title: "nickname"
        //   body: "preview text"
        //   url: "/dm/<threadId>"
        //   iconUrl: "https://.../avatars/<id>/avatar.jpg"
        //   badgeUrl: "/pwa-192.png?v=1"
        //   msgId: "serverMessageId"
        // }
        // ==============================

        const groupKey = String(data.groupKey || "gio").trim() || "gio";
        const title = String(data.title || "GIO").trim() || "GIO";
        const preview = clip(data.body || "New message", 160);
        const url = String(data.url || "/");

        // icon/badge
        const iconUrl =
            typeof data.iconUrl === "string" && data.iconUrl.length
                ? data.iconUrl
                : "/pwa-192.png?v=1";

        const badgeUrl =
            typeof data.badgeUrl === "string" && data.badgeUrl.length
                ? data.badgeUrl
                : "/pwa-192.png?v=1";

        // cache remote icon (best-effort)
        await cacheIcon(iconUrl);

        // ===== WhatsApp-like grouping per groupKey =====
        const prev = await readGroupState(groupKey);
        const nextCount = (prev.count || 0) + 1;

        // שומרים כמה שורות אחרונות (כמו expand)
        const maxLines = 5;
        const nextLines = [...(prev.lines || []), preview].slice(-maxLines);

        await writeGroupState(groupKey, { count: nextCount, lines: nextLines });

        // body multiline -> Android/Chrome מראה expand יפה
        const more = nextCount > nextLines.length ? `\n+${nextCount - nextLines.length} more` : "";
        const body = nextLines.join("\n") + more;

        // ✅ זה “ווצאפ”: tag קבוע לקבוצה => לא מחליף קבוצות אחרות
        // אבל כן מעדכן את אותה קבוצה (DM thread) במקום לייצר 200 נוטיפיקציות מאותו צ'אט.
        const tag = groupKey;

        console.log("[SW] notify", SW_VERSION, { groupKey, tag, title, iconUrl, count: nextCount });

        const options = {
            body,
            tag,
            renotify: true,
            silent: false,
            data: { url, groupKey },
            icon: iconUrl,
            badge: badgeUrl,
            vibrate: [80, 40, 80],
            timestamp: Date.now(),
            // כפתורים (לא בכל פלטפורמה, אבל שווה)
            actions: [
                { action: "open", title: "Open" },
                { action: "mark_read", title: "Mark read" },
            ],
        };

        await self.registration.showNotification(title, options);
    })());
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
