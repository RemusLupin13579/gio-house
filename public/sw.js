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

self.addEventListener("push", (event) => {
    event.waitUntil((async () => {
        const data = safeJson(event);

        // ====== Payload expected ======
        // {
        //   groupKey: "dm_<threadId>" | "room_<roomKey>" | ...
        //   title: "nickname / thread title"
        //   body: "preview text"
        //   url: "/dm/<threadId>"
        //   iconUrl: "https://.../avatars/<id>/avatar.jpg"
        //   badgeUrl: "/pwa-192.png?v=1"
        //   msgId: "serverMessageId"
        // }
        // ==============================

        const groupKey = String(data.groupKey || data.tag || "gio").trim() || "gio";
        const msgId = String(data.msgId || `${Date.now()}_${Math.random().toString(16).slice(2)}`);

        const title = String(data.title || "GIO").trim() || "GIO";
        const url = String(data.url || "/");

        const iconUrl =
            (typeof data.iconUrl === "string" && data.iconUrl.startsWith("http"))
                ? data.iconUrl
                : "/pwa-192.png?v=1";

        const badgeUrl =
            (typeof data.badgeUrl === "string" && data.badgeUrl.length)
                ? data.badgeUrl
                : "/pwa-192.png?v=1";

        const line = clip(data.body || "New message", 180);

        // --- load previous lines for this groupKey ---
        const prev = (await loadGroup(groupKey)) || {
            groupKey,
            title,
            url,
            iconUrl,
            badgeUrl,
            lines: [],
            lastAt: 0,
            unread: 0,
            lastMsgId: null,
        };

        // keep latest metadata (title/icon/url can change)
        prev.title = title || prev.title;
        prev.url = url || prev.url;
        prev.iconUrl = iconUrl || prev.iconUrl;
        prev.badgeUrl = badgeUrl || prev.badgeUrl;

        // de-dupe by msgId
        if (prev.lastMsgId !== msgId) {
            prev.lines = [{ msgId, line, at: Date.now() }, ...(prev.lines || [])]
                .slice(0, MAX_LINES);
            prev.unread = Number(prev.unread || 0) + 1;
            prev.lastAt = Date.now();
            prev.lastMsgId = msgId;
        }

        await saveGroup(groupKey, prev);

        // WhatsApp-ish:
        // - One notification per conversation (tag = groupKey)
        // - Body becomes multi-line, so it expands nicely
        const lines = (prev.lines || []).map((x) => x.line);
        const summary =
            prev.unread > 1
                ? `${lines[0]}\n(${prev.unread} unread)`
                : lines[0] || "New message";

        // show multiple lines (Chrome Android expands)
        const body = lines.length > 1 ? lines.join("\n") : summary;

        const options = {
            tag: groupKey,                // ✅ one per group
            renotify: true,               // ✅ vibration/sound again on update
            silent: false,
            icon: prev.iconUrl,           // ✅ avatar (left image) if the platform honors it
            badge: prev.badgeUrl,         // ✅ small logo
            body,
            data: {
                url: prev.url,
                groupKey,
            },
            vibrate: [60, 30, 60],
            timestamp: prev.lastAt || Date.now(),
            actions: [
                { action: "open", title: "Open" },
                { action: "mark_read", title: "Mark read" },
            ],
        };

        console.log("[SW] notify", {
            v: SW_VERSION,
            groupKey,
            title: prev.title,
            icon: prev.iconUrl,
            unread: prev.unread,
            lines: prev.lines?.length,
        });

        await self.registration.showNotification(prev.title, options);
    })());
});

self.addEventListener("notificationclick", (event) => {
    const action = event.action || "";
    const url = event.notification?.data?.url || "/";
    const groupKey = event.notification?.data?.groupKey || null;

    event.notification.close();

    event.waitUntil((async () => {
        if (action === "mark_read" && groupKey) {
            await clearGroup(String(groupKey));
            return;
        }

        // default: open
        const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const c of allClients) {
            if ("focus" in c) {
                await c.focus();
                try { await c.navigate(url); } catch { }
                // clear unread for this conversation when user opened it
                if (groupKey) await clearGroup(String(groupKey));
                return;
            }
        }
        if (clients.openWindow) {
            const w = await clients.openWindow(url);
            if (groupKey) await clearGroup(String(groupKey));
            return w;
        }
    })());
});
