// /api/send-push.js
import webpush from "web-push";
const VERSION = "send-push_2026-01-27_threadId_enabled";

const ALLOW_ORIGINS = new Set([
    "https://gio-home.vercel.app",
    "http://localhost:5173",
    "http://localhost:4173",
]);

function setCors(req, res) {
    const origin = req.headers.origin || "";
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
    try {
        json = txt ? JSON.parse(txt) : null;
    } catch { }
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
        // --- body parse safety (sometimes req.body is a string in some runtimes) ---
        let body = req.body;
        if (typeof body === "string") {
            try { body = JSON.parse(body); } catch { body = {}; }
        }
        body = body || {};

        const { toUserId, roomId, houseId, threadId, payload } = body;

        const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!SUPABASE_URL || !SERVICE_KEY) {
            return res.status(500).json({ ok: false, error: "MISSING_SUPABASE_ENV" });
        }

        const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
        const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
        const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
        if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
            return res.status(500).json({ ok: false, error: "MISSING_VAPID_KEYS" });
        }

        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

        // ---- determine targets ----
        let targets = [];

        if (toUserId) {
            targets = [String(toUserId)];
        } else if (houseId) {
            const hid = String(houseId);
            const memUrl = `${SUPABASE_URL}/rest/v1/house_members?house_id=eq.${encodeURIComponent(hid)}&select=user_id`;
            const mem = await supaGET(memUrl, SERVICE_KEY);
            if (!mem.ok) {
                return res.status(500).json({ ok: false, error: "HOUSE_MEMBERS_QUERY_FAILED", status: mem.status, body: mem.txt });
            }
            const rows = Array.isArray(mem.json) ? mem.json : [];
            targets = rows.map((x) => x?.user_id).filter(Boolean).map(String);

            const fromUserId = payload?.fromUserId ? String(payload.fromUserId) : null;
            if (fromUserId) targets = targets.filter((uid) => uid !== fromUserId);
            targets = [...new Set(targets)];
        } else if (threadId) {
            const tid = String(threadId);

            // ✅ your table: public.dm_thread_members (thread_id, user_id)
        } else if (threadId) {
            const tid = String(threadId);

            // ✅ this matches your DB table name:
            const memUrl =
                `${SUPABASE_URL}/rest/v1/dm_thread_members?thread_id=eq.${encodeURIComponent(tid)}&select=user_id`;

            const mem = await supaGET(memUrl, SERVICE_KEY);
            if (!mem.ok) {
                return res.status(500).json({
                    ok: false,
                    error: "DM_MEMBERS_QUERY_FAILED",
                    status: mem.status,
                    body: mem.txt,
                });
            }

            const rows = Array.isArray(mem.json) ? mem.json : [];
            targets = rows.map((x) => x?.user_id).filter(Boolean).map(String);

            const fromUserId = payload?.fromUserId ? String(payload.fromUserId) : null;
            if (fromUserId) targets = targets.filter((uid) => uid !== fromUserId);

            targets = [...new Set(targets)];


        // ---- build notif payload ----
        const msgId = String(payload?.msgId || `${Date.now()}_${Math.random().toString(16).slice(2)}`);
        const groupKey = String(payload?.groupKey || payload?.tag || "gio").trim() || "gio";
        const title = String(payload?.title || "GIO").trim() || "GIO";
        const bodyText = String(payload?.body || "New message");
        const url = String(payload?.url || "/");

        let iconUrl = null;
        const fromUserId = payload?.fromUserId ? String(payload.fromUserId) : null;
        if (fromUserId) {
            iconUrl = await pickFirstExisting(avatarCandidates(fromUserId));
            if (iconUrl) iconUrl = `${iconUrl}?v=${Date.now()}`;
        }
        if (!iconUrl && typeof payload?.iconUrl === "string" && payload.iconUrl.startsWith("http")) {
            iconUrl = payload.iconUrl;
        }

        const badgeUrl = payload?.badgeUrl || "/pwa-192.png?v=1";

        const notifPayload = {
            groupKey,
            title,
            body: bodyText,
            url,
            msgId,
            iconUrl: iconUrl || "https://gio-home.vercel.app/pwa-192.png?v=1",
            badgeUrl,
            lineTitle: payload?.lineTitle || null,
            roomKey: payload?.roomKey || null,
            threadId: payload?.threadId || threadId || null,
            fromUserId: fromUserId || null,
        };

        // ---- send to each target user's subscriptions ----
        let sent = 0;
        const details = [];

        for (const uid of targets) {
            const subsUrl = `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${encodeURIComponent(uid)}&select=endpoint,p256dh,auth`;
            const subsRes = await supaGET(subsUrl, SERVICE_KEY);
            if (!subsRes.ok) {
                details.push({ userId: uid, ok: false, error: "SUBS_QUERY_FAILED", status: subsRes.status });
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
                    const statusCode = e?.statusCode ?? null;
                    results.push({ endpoint: s.endpoint, ok: false, statusCode, body: e?.body ?? null });
                }
            }

            sent += userSent;
            details.push({ userId: uid, ok: true, sent: userSent, total: subs.length, results });
        }

        return res.status(200).json({
            ok: true,
            mode: toUserId ? "single" : houseId ? "house" : threadId ? "thread" : "room",
            targets: targets.length,
            sent,
            payload: notifPayload,
            details,
        });
    } catch (e) {
        console.error("[api/send-push] crashed:", e);
        return res.status(500).json({ ok: false, error: "PUSH_FAILED", message: e?.message || String(e) });
    }
}
