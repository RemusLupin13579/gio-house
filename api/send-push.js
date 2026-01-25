// /api/send-push.js
import webpush from "web-push";

function avatarCandidates(projectUrl, uid) {
    const base = `${projectUrl}/storage/v1/object/public/avatars/${uid}`;
    return [
        `${base}/avatar.jpg`,
        `${base}/avatar.jpeg`,
        `${base}/avatar.png`,
        `${base}/head.png`,
        `${base}/head.jpg`,
        `${base}/head.jpeg`,
    ];
}

// בדיקה קלה כדי לבחור קובץ שקיים באמת (HEAD)
async function pickFirstExisting(urls) {
    for (const u of urls) {
        try {
            const r = await fetch(u, { method: "HEAD" });
            if (r.ok) return u;
        } catch { }
    }
    return null;
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "https://gio-home.vercel.app");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") return res.status(200).send("ok");
    if (req.method === "GET") return res.status(200).json({ ok: true, route: "/api/send-push" });
    if (req.method !== "POST") return res.status(405).json({ error: "METHOD_NOT_ALLOWED", got: req.method });

    try {
        const { toUserId, payload } = req.body || {};
        if (!toUserId) return res.status(400).json({ error: "NO_TO_USER" });

        const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: "MISSING_SUPABASE_ENV" });

        const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
        const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
        const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
        if (!VAPID_PUBLIC || !VAPID_PRIVATE) return res.status(500).json({ error: "MISSING_VAPID_KEYS" });

        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

        // fetch subs with service role (REST)
        const r = await fetch(
            `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${encodeURIComponent(toUserId)}&select=endpoint,p256dh,auth`,
            { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` } }
        );

        if (!r.ok) {
            const txt = await r.text().catch(() => "");
            return res.status(500).json({ error: "SUBS_QUERY_FAILED", status: r.status, body: txt });
        }

        const subs = await r.json().catch(() => []);
        if (!Array.isArray(subs) || subs.length === 0) return res.status(200).json({ ok: true, sent: 0, note: "NO_SUBSCRIPTIONS" });

        // ✅ iconUrl מהבאקט הנכון בלבד
        let iconUrl = null;
        const fromUserId = String(payload?.fromUserId || "").trim();
        if (fromUserId) {
            iconUrl = await pickFirstExisting(avatarCandidates(SUPABASE_URL, fromUserId));
            if (iconUrl) {
                const glue = iconUrl.includes("?") ? "&" : "?";
                iconUrl = `${iconUrl}${glue}v=${Date.now()}`; // cache bust
            }
        }

        const notifPayload = {
            groupKey: payload?.groupKey || payload?.tag || "gio",
            threadId: payload?.threadId || null,
            msgId: String(payload?.msgId || `${Date.now()}`),

            title: payload?.title || "GIO",
            body: payload?.body || "New message",
            url: payload?.url || "/",

            // iOS לא יכבד icon פר-התראה => נשאיר לוגו כאן
            iconUrl: "/pwa-192.png?v=1",
            badgeUrl: payload?.badgeUrl || "/pwa-192.png?v=1",

            // ✅ פה נשים את האוואטר (מה שבאמת רצית)
            imageUrl: iconUrl || null, // iconUrl כאן הוא האוואטר שמצאת מ-avatars/<id>/...
        };


        let sent = 0;
        const results = [];

        for (const s of subs) {
            const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
            try {
                await webpush.sendNotification(subscription, JSON.stringify(notifPayload));
                sent++;
                results.push({ endpoint: s.endpoint, ok: true });
            } catch (e) {
                const statusCode = e?.statusCode ?? null;
                const body = e?.body ?? null;
                results.push({ endpoint: s.endpoint, ok: false, statusCode, body });

                if (statusCode === 404 || statusCode === 410) {
                    try {
                        await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, {
                            method: "DELETE",
                            headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
                        });
                    } catch { }
                }
            }
        }

        return res.status(200).json({ ok: true, sent, total: subs.length, payload: notifPayload, results });
    } catch (e) {
        console.error("[api/send-push] crashed:", e);
        return res.status(500).json({ error: "PUSH_FAILED", message: e?.message || String(e) });
    }
}
