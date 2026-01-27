// /api/send-push.js
import webpush from "web-push";

/**
 * ✅ Unified Push API (single user OR fan-out)
 * ------------------------------------------
 * Supports:
 * 1) Single user:  { toUserId, payload }
 * 2) Fan-out by house: { houseId, payload }   ✅ YOUR REAL NEED
 * 3) Fan-out by room:  { roomId, payload }    (optional, kept for compatibility)
 *
 * Why house fan-out?
 * - Because RLS blocks client-side reads of house_members (as it should).
 * - Server uses SERVICE ROLE key, so it can safely build the target list.
 *
 * Payload is forwarded to SW with extra fields to:
 * - group notifications per room/dm
 * - suppress notification when user already inside the room/dm
 *
 * TL;DR: Tony Stark approved.
 */

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
    // include whatever your browser may send in preflight
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
        } catch {
            // ignore and try next
        }
    }
    return null;
}

/**
 * Small helper: call Supabase REST with service key, return both text + parsed json.
 * This makes debugging 10x easier when Supabase decides to be “helpful”.
 */
async function supaGET(url, serviceKey) {
    const r = await fetch(url, {
        headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
    });
    const txt = await r.text().catch(() => "");
    let json = null;
    try {
        json = txt ? JSON.parse(txt) : null;
    } catch {
        json = null;
    }
    return { ok: r.ok, status: r.status, txt, json };
}

/**
 * Fetch push subscriptions for a given userId (server-side).
 */
async function getUserSubscriptions({ supabaseUrl, serviceKey, userId }) {
    const subsUrl =
        `${supabaseUrl}/rest/v1/push_subscriptions` +
        `?user_id=eq.${encodeURIComponent(String(userId))}` +
        `&select=endpoint,p256dh,auth`;

    const subsRes = await supaGET(subsUrl, serviceKey);
    if (!subsRes.ok) {
        return { ok: false, error: "SUBS_QUERY_FAILED", status: subsRes.status, body: subsRes.txt };
    }
    const subs = Array.isArray(subsRes.json) ? subsRes.json : [];
    return { ok: true, subs };
}

/**
 * Build target userIds list.
 * Priority: toUserId > houseId > roomId
 */
async function buildTargets({ toUserId, houseId, roomId, payload, supabaseUrl, serviceKey }) {
    // 1) Single user
    if (toUserId) {
        return { ok: true, mode: "single", targets: [String(toUserId)] };
    }

    // Helper: drop sender + dedupe
    const fromUserId = payload?.fromUserId ? String(payload.fromUserId) : null;
    const postProcess = (arr) => {
        let out = (arr || []).filter(Boolean).map(String);
        if (fromUserId) out = out.filter((uid) => uid !== fromUserId);
        // dedupe
        out = [...new Set(out)];
        return out;
    };

    // 2) Fan-out by HOUSE ✅
    if (houseId) {
        const hid = String(houseId);
        const memUrl =
            `${supabaseUrl}/rest/v1/house_members` +
            `?house_id=eq.${encodeURIComponent(hid)}` +
            `&select=user_id`;

        const mem = await supaGET(memUrl, serviceKey);
        if (!mem.ok) {
            return {
                ok: false,
                error: "HOUSE_MEMBERS_QUERY_FAILED",
                status: mem.status,
                body: mem.txt,
            };
        }

        const rows = Array.isArray(mem.json) ? mem.json : [];
        const targets = postProcess(rows.map((x) => x?.user_id));
        return { ok: true, mode: "house", targets };
    }

    // 3) Fan-out by ROOM (optional / backward-compat)
    if (roomId) {
        const rid = String(roomId);
        const memUrl =
            `${supabaseUrl}/rest/v1/room_members` +
            `?room_id=eq.${encodeURIComponent(rid)}` +
            `&select=user_id`;

        const mem = await supaGET(memUrl, serviceKey);
        if (!mem.ok) {
            return {
                ok: false,
                error: "ROOM_MEMBERS_QUERY_FAILED",
                status: mem.status,
                body: mem.txt,
            };
        }

        const rows = Array.isArray(mem.json) ? mem.json : [];
        const targets = postProcess(rows.map((x) => x?.user_id));
        return { ok: true, mode: "room", targets };
    }

    return { ok: false, error: "MISSING_TARGET", need: "toUserId OR houseId OR roomId" };
}

/**
 * Build payload that Service Worker expects.
 */
async function buildNotifPayload(payload) {
    const msgId = String(payload?.msgId || `${Date.now()}_${Math.random().toString(16).slice(2)}`);
    const groupKey = String(payload?.groupKey || payload?.tag || "gio").trim() || "gio";
    const title = String(payload?.title || "GIO").trim() || "GIO";
    const body = String(payload?.body || "New message");
    const url = String(payload?.url || "/");

    // Try to fetch sender avatar if exists (nice touch ✨)
    let iconUrl = null;
    const fromUserId = payload?.fromUserId ? String(payload.fromUserId) : null;

    if (fromUserId) {
        iconUrl = await pickFirstExisting(avatarCandidates(fromUserId));
        if (iconUrl) iconUrl = `${iconUrl}?v=${Date.now()}`; // cache-bust (because browsers are liars)
    }

    if (!iconUrl && typeof payload?.iconUrl === "string" && payload.iconUrl.startsWith("http")) {
        iconUrl = payload.iconUrl;
    }

    const badgeUrl = payload?.badgeUrl || "/pwa-192.png?v=1";

    return {
        groupKey,
        title,
        body,
        url,
        msgId,
        iconUrl: iconUrl || "https://gio-home.vercel.app/pwa-192.png?v=1",
        badgeUrl,

        // extras for SW suppression + nice lines
        lineTitle: payload?.lineTitle || null,
        roomKey: payload?.roomKey || null,
        threadId: payload?.threadId || null,
        fromUserId: fromUserId || null,
    };
}

/**
 * Send notification to one subscription entry.
 */
async function sendToSubscription(subscriptionRow, notifPayload) {
    const subscription = {
        endpoint: subscriptionRow.endpoint,
        keys: { p256dh: subscriptionRow.p256dh, auth: subscriptionRow.auth },
    };

    await webpush.sendNotification(subscription, JSON.stringify(notifPayload));
}

export default async function handler(req, res) {
    setCors(req, res);

    // Preflight
    if (req.method === "OPTIONS") return res.status(200).send("ok");
    if (req.method === "GET") return res.status(200).json({ ok: true, route: "/api/send-push" });
    if (req.method !== "POST") {
        return res.status(405).json({ error: "METHOD_NOT_ALLOWED", got: req.method });
    }

    try {
        // Accept both styles:
        // A) { toUserId, payload }
        // B) { houseId, payload }  ✅ preferred for rooms
        // C) { roomId, payload }   (kept)
        const { toUserId, houseId, roomId, payload } = req.body || {};

        const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!SUPABASE_URL || !SERVICE_KEY) {
            return res.status(500).json({ error: "MISSING_SUPABASE_ENV" });
        }

        const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
        const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
        const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
        if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
            return res.status(500).json({ error: "MISSING_VAPID_KEYS" });
        }

        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

        // 1) Decide targets
        const targetRes = await buildTargets({
            toUserId,
            houseId,
            roomId,
            payload,
            supabaseUrl: SUPABASE_URL,
            serviceKey: SERVICE_KEY,
        });

        if (!targetRes.ok) {
            return res.status(400).json(targetRes);
        }

        const targets = targetRes.targets || [];
        if (!targets.length) {
            return res.status(200).json({ ok: true, mode: targetRes.mode, sent: 0, note: "NO_TARGET_USERS" });
        }

        // 2) Build SW payload (once)
        const notifPayload = await buildNotifPayload(payload);

        // 3) Send to each target user's subscriptions
        let sent = 0;
        const details = [];

        for (const uid of targets) {
            const subsRes = await getUserSubscriptions({
                supabaseUrl: SUPABASE_URL,
                serviceKey: SERVICE_KEY,
                userId: uid,
            });

            if (!subsRes.ok) {
                details.push({ userId: uid, ok: false, ...subsRes });
                continue;
            }

            const subs = subsRes.subs || [];
            if (!subs.length) {
                details.push({ userId: uid, ok: true, sent: 0, note: "NO_SUBSCRIPTIONS" });
                continue;
            }

            let userSent = 0;
            const results = [];

            for (const s of subs) {
                try {
                    await sendToSubscription(s, notifPayload);
                    userSent++;
                    results.push({ endpoint: s.endpoint, ok: true });
                } catch (e) {
                    const statusCode = e?.statusCode ?? null;
                    const body = e?.body ?? null;
                    results.push({ endpoint: s.endpoint, ok: false, statusCode, body });
                    // optional: prune expired endpoints (410/404) if you want later
                }
            }

            sent += userSent;
            details.push({ userId: uid, ok: true, sent: userSent, total: subs.length, results });
        }

        return res.status(200).json({
            ok: true,
            mode: targetRes.mode,          // "single" | "house" | "room"
            targets: targets.length,
            sent,
            payload: notifPayload,
            details,
        });
    } catch (e) {
        console.error("[api/send-push] crashed:", e);
        return res.status(500).json({ error: "PUSH_FAILED", message: e?.message || String(e) });
    }
}
