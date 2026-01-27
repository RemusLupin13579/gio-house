/* /public/sw.js */
const SW_VERSION = "2026-01-27_auto_02";
const STORE_CACHE = "gio:notif:groups:v1";

// כמה שורות לשמור בהיסטוריה בקאש (לפי קבוצה)
const MAX_LINES = 20;

// כמה שורות להציג מקסימום בהתראה (אוטומטי)
const DISPLAY_LINES_MAX = 3;

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

async function closeNotificationsByTag(tag) {
    try {
        const ns = await self.registration.getNotifications({ tag });
        ns.forEach((n) => n.close());
    } catch { }
}

async function clearGroup(groupKey) {
    const cache = await caches.open(STORE_CACHE);
    await cache.delete(`/__notif_group__/${encodeURIComponent(groupKey)}`);
    await closeNotificationsByTag(groupKey);
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

async function isUserAlreadyInDm(threadId) {
    if (!threadId) return false;
    const wantedPath = `/dm/${threadId}`;
    const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });
    return wins.some((c) => {
        try {
            const u = new URL(c.url);
            return u.pathname === wantedPath;
        } catch {
            return false;
        }
    });
}

async function isUserAlreadyInRoom(roomKey) {
    if (!roomKey) return false;
    const wantedPath = `/room/${roomKey}`;
    const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });
    return wins.some((c) => {
        try {
            const u = new URL(c.url);
            return u.pathname === wantedPath;
        } catch {
            return false;
        }
    });
}

function buildAutoBody(linesAll = []) {
    // linesAll: מערך שורות בסדר כרונולוגי (ישן->חדש)
    const total = linesAll.length;
    if (total <= 0) return "New message";

    if (total === 1) return linesAll[0];

    // 2-3: מציג הכל
    if (total <= DISPLAY_LINES_MAX) return linesAll.join("\n");

    // מעל 3: מציג רק 3 אחרונות + "... (+N more)"
    const slice = linesAll.slice(-DISPLAY_LINES_MAX);
    const more = total - DISPLAY_LINES_MAX;
    return `${slice.join("\n")}\n… (+${more} more)`;
}

// remove "name: " prefix at the start (used to normalize old DM cached lines)
function stripNamePrefix(line) {
    const s = String(line || "");
    // remove "something: " only at start (reasonable length guard)
    return s.replace(/^[^:\n]{1,40}:\s*/, "");
}

self.addEventListener("push", (event) => {
    event.waitUntil(
        (async () => {
            const data = safeJson(event);

            // payload
            const groupKey = String(data.groupKey || data.tag || "gio").trim() || "gio";
            const msgId = String(data.msgId || `${Date.now()}_${Math.random().toString(16).slice(2)}`);

            const title = String(data.title || "GIO").trim() || "GIO";
            const textRaw = String(data.body || "New message").trim();
            const url = String(data.url || "/");

            // absolute icon
            const iconUrl =
                typeof data.iconUrl === "string" && data.iconUrl.startsWith("http")
                    ? data.iconUrl
                    : "https://gio-home.vercel.app/pwa-192.png?v=1";

            const badgeUrl =
                typeof data.badgeUrl === "string" && data.badgeUrl.length
                    ? data.badgeUrl
                    : "https://gio-home.vercel.app/pwa-192.png?v=1";

            // ---- determine context ----
            const threadId =
                String(data.threadId || "").trim() ||
                (groupKey.startsWith("dm_") ? groupKey.slice(3) : "");

            const roomKey =
                String(data.roomKey || "").trim() ||
                (groupKey.startsWith("room_") ? groupKey.slice(5) : "");

            const isDM =
                String(groupKey || "").startsWith("dm_") ||
                !!String(data.threadId || "").trim();

            // ---- prevent notifications when user is already inside that DM/ROOM ----
            if (threadId) {
                const already = await isUserAlreadyInDm(threadId);
                if (already) return;
            }
            if (roomKey) {
                const already = await isUserAlreadyInRoom(roomKey);
                if (already) return;
            }

            // ---- line formatting (single source of truth) ----
            const msgText = clip(textRaw, 180);

            // DM: never prefix (even if someone forgot to send noPrefix)
            const noPrefix = isDM || !!data.noPrefix;

            const RLM = "\u200F"; // force RTL direction per line
            const lineTitle = String(data.lineTitle || "GIO").trim() || "GIO";

            // DM -> just the message text
            // Rooms/others -> "name: message" but forced RTL for consistent alignment
            const newLineText = noPrefix
                ? msgText
                : clip(`${RLM}${lineTitle}: ${msgText}`, 180);

            // ---- load group state ----
            let prev =
                (await loadGroup(groupKey)) || {
                    groupKey,
                    title,
                    url,
                    iconUrl,
                    badgeUrl,
                    lines: [], // array of strings (old->new)
                    unread: 0,
                    lastMsgId: null,
                    lastAt: 0,
                };

            // keep latest metadata
            prev.title = title || prev.title;
            prev.url = url || prev.url;
            prev.iconUrl = iconUrl || prev.iconUrl;
            prev.badgeUrl = badgeUrl || prev.badgeUrl;

            // ✅ normalize cached DM history (remove old "name: " prefixes)
            if (isDM && Array.isArray(prev.lines)) {
                prev.lines = prev.lines.map(stripNamePrefix);
            }

            // de-dupe by msgId
            if (prev.lastMsgId !== msgId) {
                const nextLines = [...(prev.lines || []), newLineText].slice(-MAX_LINES);
                prev.lines = nextLines;
                prev.unread = (Number(prev.unread) || 0) + 1;
                prev.lastMsgId = msgId;
                prev.lastAt = Date.now();
                await saveGroup(groupKey, prev);
            }

            // build body automatically (2-3 lines then ...)
            const body = buildAutoBody(prev.lines || []);
            const displayTitle = Number(prev.unread || 0) > 1 ? `${prev.title} (${prev.unread})` : prev.title;

            const options = {
                tag: groupKey,
                renotify: true,
                silent: false,
                icon: prev.iconUrl,
                badge: prev.badgeUrl,
                body,
                data: { url: prev.url, groupKey },
                vibrate: [60, 30, 60],
                timestamp: prev.lastAt || Date.now(),
                actions: [{ action: "mark_read", title: "נקרא" }],
            };

            console.log("[SW] notify", {
                v: SW_VERSION,
                groupKey,
                isDM,
                noPrefix: !!noPrefix,
                title: displayTitle,
                unread: prev.unread,
                savedLines: prev.lines?.length || 0,
            });

            return self.registration.showNotification(displayTitle, options);
        })()
    );
});

self.addEventListener("notificationclick", (event) => {
    const action = event.action || "";
    const url = event.notification?.data?.url || "/";
    const groupKey = event.notification?.data?.groupKey || null;

    event.notification.close();

    event.waitUntil(
        (async () => {
            if (groupKey && action === "mark_read") {
                // local clear only (per-device)
                await clearGroup(String(groupKey));

                // (optional) also broadcast to open clients to update UI immediately
                try {
                    const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });
                    wins.forEach((c) => c.postMessage?.({ type: "SW_GROUP_CLEARED", groupKey: String(groupKey) }));
                } catch { }

                return;
            }

            // default: focus existing window then navigate
            const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
            for (const c of allClients) {
                if ("focus" in c) {
                    await c.focus();
                    try {
                        await c.navigate(url);
                    } catch { }
                    if (groupKey) await clearGroup(String(groupKey));
                    return;
                }
            }

            if (clients.openWindow) {
                const w = await clients.openWindow(url);
                if (groupKey) await clearGroup(String(groupKey));
                return w;
            }
        })()
    );
});
