import webpush from "npm:web-push@3.6.7";

const VERSION = "supabase-send-push_2026-01-27_senderId_only";

const ALLOW_ORIGINS = new Set([
    "https://gio-home.vercel.app",
    "http://localhost:5173",
    "http://localhost:4173",
]);

function corsHeaders(origin: string) {
    const allow = ALLOW_ORIGINS.has(origin) ? origin : "https://gio-home.vercel.app";
    return {
        "Access-Control-Allow-Origin": allow,
        "Vary": "Origin",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
    };
}

const SUPABASE_BASE = "https://khaezthvfznjqalhzitz.supabase.co";

function avatarCandidates(uid: string) {
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

async function pickFirstExisting(urls: string[]) {
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

async function supaGET(url: string, serviceKey: string) {
    const r = await fetch(url, {
        headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
    });
    const txt = await r.text().catch(() => "");
    let json: any = null;
    try { json = txt ? JSON.parse(txt) : null; } catch { }
    return { ok: r.ok, status: r.status, txt, json };
}

export default async function handler(req: Request): Promise<Response> {
    const origin = req.headers.get("origin") || "";
    const headers = corsHeaders(origin);

    if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers });

    if (req.method === "GET") {
        return new Response(JSON.stringify({ ok: true, route: "/functions/v1/send-push", version: VERSION }), {
            status: 200,
            headers: { ...headers, "Content-Type": "application/json" },
        });
    }

    if (req.method !== "POST") {
        return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED", got: req.method }), {
            status: 405,
            headers: { ...headers, "Content-Type": "application/json" },
        });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const { toUserId, roomId, houseId, threadId, payload } = body || {};

        const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
        const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        if (!SUPABASE_URL || !SERVICE_KEY) {
            return new Response(JSON.stringify({ ok: false, error: "MISSING_SUPABASE_ENV", version: VERSION }), {
                status: 500,
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || "";
        const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || "";
        const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";
        if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
            return new Response(JSON.stringify({ ok: false, error: "MISSING_VAPID_KEYS", version: VERSION }), {
                status: 500,
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

        const senderId = payload?.fromUserId ? String(payload.fromUserId) : null;

        const removeSenderAndDedupe = (arr: any[]) => {
            let out = (arr || []).filter(Boolean).map(String);
            if (senderId) out = out.filter((uid) => uid !== senderId);
            return [...new Set(out)];
        };

        let targets: string[] = [];

        if (toUserId) {
            targets = removeSenderAndDedupe([String(toUserId)]);
        } else if (houseId) {
            const hid = String(houseId);
            const memUrl = `${SUPABASE_URL}/rest/v1/house_members?house_id=eq.${encodeURIComponent(hid)}&select=user_id`;
            const mem = await supaGET(memUrl, SERVICE_KEY);
            if (!mem.ok) return new Response(JSON.stringify({ ok: false, error: "HOUSE_MEMBERS_QUERY_FAILED", status: mem.status, body: mem.txt, version: VERSION }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
            const rows = Array.isArray(mem.json) ? mem.json : [];
            targets = removeSenderAndDedupe(rows.map((x: any) => x?.user_id));
        } else if (threadId) {
            const tid = String(threadId);
            const memUrl = `${SUPABASE_URL}/rest/v1/dm_thread_members?thread_id=eq.${encodeURIComponent(tid)}&select=user_id`;
            const mem = await supaGET(memUrl, SERVICE_KEY);
            if (!mem.ok) return new Response(JSON.stringify({ ok: false, error: "DM_MEMBERS_QUERY_FAILED", status: mem.status, body: mem.txt, version: VERSION }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
            const rows = Array.isArray(mem.json) ? mem.json : [];
            targets = removeSenderAndDedupe(rows.map((x: any) => x?.user_id));
        } else if (roomId) {
            const rid = String(roomId);
            const memUrl = `${SUPABASE_URL}/rest/v1/room_members?room_id=eq.${encodeURIComponent(rid)}&select=user_id`;
            const mem = await supaGET(memUrl, SERVICE_KEY);
            if (!mem.ok) return new Response(JSON.stringify({ ok: false, error: "ROOM_MEMBERS_QUERY_FAILED", status: mem.status, body: mem.txt, version: VERSION }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
            const rows = Array.isArray(mem.json) ? mem.json : [];
            targets = removeSenderAndDedupe(rows.map((x: any) => x?.user_id));
        } else {
            return new Response(JSON.stringify({ ok: false, error: "MISSING_TARGET", need: "toUserId OR houseId OR threadId OR roomId", version: VERSION }), {
                status: 400,
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        if (targets.length === 0) {
            return new Response(JSON.stringify({ ok: true, sent: 0, note: "NO_TARGET_USERS", version: VERSION }), {
                status: 200,
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        const msgId = String(payload?.msgId || `${Date.now()}_${Math.random().toString(16).slice(2)}`);
        const groupKey = String(payload?.groupKey || payload?.tag || "gio").trim() || "gio";
        const title = String(payload?.title || "GIO").trim() || "GIO";
        const bodyText = String(payload?.body || "New message");
        const url = String(payload?.url || "/");

        let iconUrl: string | null = null;
        if (senderId) {
            iconUrl = await pickFirstExisting(avatarCandidates(senderId));
            if (iconUrl) iconUrl = `${iconUrl}?v=${Date.now()}`;
        }

        const notifPayload = {
            groupKey,
            title,
            body: bodyText,
            url,
            msgId,
            iconUrl: iconUrl || "https://gio-home.vercel.app/pwa-192.png?v=1",
            badgeUrl: payload?.badgeUrl || "/pwa-192.png?v=1",
            lineTitle: payload?.lineTitle || null,
            roomKey: payload?.roomKey || null,
            threadId: payload?.threadId || (threadId ? String(threadId) : null),
            fromUserId: senderId,
        };

        let sent = 0;
        const details: any[] = [];

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
            const results: any[] = [];

            for (const s of subs) {
                const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
                try {
                    await webpush.sendNotification(subscription, JSON.stringify(notifPayload));
                    userSent++;
                    results.push({ endpoint: s.endpoint, ok: true });
                } catch (e: any) {
                    results.push({ endpoint: s.endpoint, ok: false, statusCode: e?.statusCode ?? null, body: e?.body ?? null });
                }
            }

            sent += userSent;
            details.push({ userId: uid, ok: true, sent: userSent, total: subs.length, results });
        }

        return new Response(JSON.stringify({ ok: true, version: VERSION, targets: targets.length, sent, payload: notifPayload, details }), {
            status: 200,
            headers: { ...headers, "Content-Type": "application/json" },
        });
    } catch (e: any) {
        console.error("[send-push fn] crashed:", e);
        return new Response(JSON.stringify({ ok: false, error: "PUSH_FAILED", message: e?.message || String(e), version: VERSION }), {
            status: 500,
            headers: { ...headers, "Content-Type": "application/json" },
        });
    }
}
