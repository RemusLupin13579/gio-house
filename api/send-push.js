import webpush from "web-push";

const VERSION = "send-push_2026-01-27_DEPLOY_FIX_senderId_only";

const ALLOW_ORIGINS = new Set([
    "https://gio-home.vercel.app",
    "http://localhost:5173",
    "http://localhost:4173",
]);

function setCors(req, res) {
    const origin = req.headers?.origin || "";
    const allow = ALLOW_ORIGINS.has(origin) ? origin : "https://gio-home.vercel.app";

    res.setHeader("Access-Control-Allow-Origin", allow);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, apikey, x-client-info"
    );
}

const SUPABASE_BASE = "https://khaezthvfznjqalhzitz.supabase.co";

function avatarCandidates(uid) {
    const base = `${SUPABASE_BASE}/storage/v1/object/public/avatars/${uid}`;
    return [
        `${base}/avatar.jpg`,
        `${base}/avatar.jpeg`,
        `${base}/avatar.png`,
        `${base}/head.png`,
        `${base}/head.jpg`,
        `${base}/head.jpeg`,
    ];
}

async function pickFirstExisting(urls) {
    for (const u of urls) {
        try {
            const h = await fetch(u, { method: "HEAD" });
            if (h.ok) return u;
            if (h.status === 405) {
                const g = await fetch(u, { method: "GET" });
                if (g.ok) return u;
            }
        } catch { }
    }
    return null;
}

async function supaGET(url, serviceKey) {
    const r = await fetch(url, {
        headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
    });

    const txt = await r.text().catch(() => "");
    let json = null;
    try { json = txt ? JSON.parse(txt) : null; } catch { }

    return { ok: r.ok, status: r.status, txt, json };
}

export default async function handler(req, res) {
    setCors(req, res);

    if (req.method === "OPTIONS") return res.status(200).send("ok");
    if (req.method === "GET") return res.status(200).json({ ok: true, route: "/api/send-push", version: VERSION });

    if (req.method !== "POST") {
        return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED", got: req.method });
    }

    try {
        let body = req.body;
        if (typeof body === "string") {
            try { body = JSON.parse(body); } catch { body = {}; }
        }
        body = body || {};

        const { toUserId, roomId, houseId, threadId, payload } = body;

        const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!SUPABASE_URL || !SERVICE_KEY) {
            return res.status(500).json({ ok: false, error: "MISSING_SUPABASE_ENV", version: VERSION });
        }

        const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
        const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
        const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
        if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
            return res.status(500).json({ ok: false, error: "MISSING_VAPID_KEYS", version: VERSION });
        }

        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

        const senderId = payload?.fromUserId ? String(payload.fromUserId) : null;

        const removeSenderAndDedupe = (arr) => {
            let out = (arr || []).filter(Boolean).map(String);
            if (senderId) out = out.filter((uid) => uid !== senderId);
            return [...new Set(out)];
        };

        let targets = [];

        if (toUserId) {
            targets = removeSenderAndDedupe([String(toUserId)]);
        } else if (houseId) {
            const hid = String(houseId);
            const memUrl = `${SUPABASE_URL}/rest/v1/house_members?house_id=eq.${encodeURIComponent(hid)}&select=user_id`;
            const mem = await supaGET(memUrl, SERVICE_KEY);
            if (!mem.ok) {
                return res.status(500).json({ ok: false, error: "HOUSE_MEMBERS_QUERY_FAILED", status: mem.status, body: mem.txt, version: VERSION });
            }
            const rows = Array.isArray(mem.json) ? mem.json : [];
            targets = removeSenderAndDedupe(rows.map((x) => x?.user_id));
        } else if (threadId) {
            const tid = String(threadId);
            const memUrl = `${SUPABASE_URL}/rest/v1/dm_thread_members?thread_id=eq.${encodeURIComponent(tid)}&select=user_id`;
            const mem = await supaGET(memUrl, SERVICE_KEY);
            if (!mem.ok) {
                return res.status(500).json({ ok: false, error: "DM_MEMBERS_QUERY_FAILED", status: mem.status, body: mem.txt, version: VERSION });
            }
            const rows = Array.isArray(mem.json) ? mem.json : [];
            targets = removeSenderAndDedupe(rows.map((x) => x?.user_id));
        } else if (roomId) {
            const rid = String(roomId);
            const memUrl = `${SUPABASE_URL}/rest/v1/room_members?room_id=eq.${encodeURIComponent(rid)}&select=user_id`;
            const mem = await supaGET(memUrl, SERVICE_KEY);
            if (!mem.ok) {
                return res.status(500).json({ ok: false, error: "ROOM_MEMBERS_QUERY_FAILED", status: mem.status, body: mem.txt, version: VERSION });
            }
            const rows = Array.isArray(mem.json) ? mem.json : [];
            targets = removeSenderAndDedupe(rows.map((x) => x?.user_id));
        } else {
            return res.status(400).json({ ok: false, error: "MISSING_TARGET", need: "toUserId OR houseId OR threadId OR roomId", version: VERSION });
        }

        if (targets.length === 0) {
            return res.status(200).json({ ok: true, sent: 0, note: "NO_TARGET_USERS", version: VERSION });
        }

        const msgId = String(payload?.msgId || `${Date.now()}_${Math.random().toString(16).slice(2)}`);
        const groupKey = String(payload?.groupKey || payload?.tag || "gio").trim() || "gio";
        const title = String(payload?.title || "GIO").trim() || "GIO";
        const bodyText = String(payload?.body || "New message");
        const url = String(payload?.url || "/");

        let iconUrl = null;
        if (senderId) {
            iconUrl = await pickFirstExisting(avatarCandidates(senderId));
            if (iconUrl) iconUrl = `${iconUrl}?v=${Date.now()}`;
        }
        if (!iconUrl && typeof payload?.iconUrl === "string" && payload.iconUrl.startsWith("http")) {
            iconUrl = payload.iconUrl;
        }

        const isDM = !!(payload?.threadId || threadId);

        const notifPayload = {
            groupKey,
            // DM: הכותרת היא ה-username (שנשלח ב-payload.title)
            // Rooms: כמו קודם
            title: isDM ? title : title,
            // DM: גוף = רק הטקסט
            // Rooms: כמו קודם
            body: bodyText,
            url,
            msgId,
            iconUrl: iconUrl || "https://gio-home.vercel.app/pwa-192.png?v=1",
            badgeUrl: payload?.badgeUrl || "/pwa-192.png?v=1",
            // ❌ DM: לא שולחים lineTitle בכלל
            // ✅ Rooms: כן
            lineTitle: isDM ? null : (payload?.lineTitle || null),
            roomKey: payload?.roomKey || null,
            threadId: payload?.threadId || (threadId ? String(threadId) : null),
            fromUserId: senderId,
        };

        let sent = 0;
        const details = [];

        for (const uid of targets) {
            const subsUrl = `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${encodeURIComponent(uid)}&select=endpoint,p256dh,auth`;
            const subsRes = await supaGET(subsUrl, SERVICE_KEY);
            if (!subsRes.ok) {
                details.push({ userId: uid, ok: false, error: "SUBS_QUERY_FAILED", status: subsRes.status, body: subsRes.txt });
                continue;
            }

            const subs = Array.isArray(subsRes.json) ? subsRes.json : [];
            if (!subs.length) {
                details.push({ userId: uid, ok: true, sent: 0, note: "NO_SUBSCRIPTIONS" });
                continue;
            }

            let userSent = 0;
            const results = [];

            for (const s of subs) {
                const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
                try {
                    await webpush.sendNotification(subscription, JSON.stringify(notifPayload));
                    userSent++;
                    results.push({ endpoint: s.endpoint, ok: true });
                } catch (e) {
                    results.push({ endpoint: s.endpoint, ok: false, statusCode: e?.statusCode ?? null, body: e?.body ?? null });
                }
            }

            sent += userSent;
            details.push({ userId: uid, ok: true, sent: userSent, total: subs.length, results });
        }

        return res.status(200).json({
            ok: true,
            version: VERSION,
            mode: toUserId ? "single" : houseId ? "house" : threadId ? "thread" : "room",
            targets: targets.length,
            sent,
            payload: notifPayload,
            details,
        });
    } catch (e) {
        console.error("[api/send-push] crashed:", e);
        return res.status(500).json({ ok: false, error: "PUSH_FAILED", message: e?.message || String(e), version: VERSION });
    }
}
