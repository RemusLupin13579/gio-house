// supabase/functions/send-push/index.ts
import webpush from "npm:web-push@3.6.7";

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
        } catch {
            // ignore
        }
    }
    return null;
}

async function supaGET(url: string, serviceKey: string) {
    const r = await fetch(url, {
        headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
    });
    const txt = await r.text().catch(() => "");
    let json: any = null;
    try {
        json = txt ? JSON.parse(txt) : null;
    } catch {
        // ignore
    }
    return { ok: r.ok, status: r.status, txt, json };
}

export default async function handler(req: Request): Promise<Response> {
    const origin = req.headers.get("origin") || "";
    const headers = corsHeaders(origin);

    if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers });
    if (req.method === "GET") {
        return new Response(JSON.stringify({ ok: true, route: "/api/send-push", version: "supabase-function" }), {
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

        const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL") || "";
        const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        if (!SUPABASE_URL || !SERVICE_KEY) {
            return new Response(JSON.stringify({ ok: false, error: "MISSING_SUPABASE_ENV" }), {
                status: 500,
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || Deno.env.get("VITE_VAPID_PUBLIC_KEY") || "";
        const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || "";
        const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";
        if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
            return new Response(JSON.stringify({ ok: false, error: "MISSING_VAPID_KEYS" }), {
                status: 500,
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

        // ---- determine targets ----
        let targets: string[] = [];

        if (toUserId) {
            targets = [String(toUserId)];
        } else if (houseId) {
            const hid = String(houseId);
            const memUrl =
                `${SUPABASE_URL}/rest/v1/house_members?house_id=eq.${encodeURIComponent(hid)}&select=user_id`;

            const mem = await supaGET(memUrl, SERVICE_KEY);
            if (!mem.ok) {
                return new Response(JSON.stringify({
                    ok: false,
                    error: "HOUSE_MEMBERS_QUERY_FAILED",
                    status: mem.status,
                    body: mem.txt,
                }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
            }

            const rows = Array.isArray(mem.json) ? mem.json : [];
            targets = rows.map((x: any) => x?.user_id).filter(Boolean).map(String);

            const fromUserId = payload?.fromUserId ? String(payload.fromUserId) : null;
            if (fromUserId) targets = targets.filter((uid) => uid !== fromUserId);
            targets = [...new Set(targets)];
        } else if (threadId) {
            const tid = String(threadId);
            const DM_MEMBERS_TABLE = "dm_thread_members"; // ✅ לפי מה שהבאת

            const memUrl =
                `${SUPABASE_URL}/rest/v1/${DM_MEMBERS_TABLE}?thread_id=eq.${encodeURIComponent(tid)}&select=user_id`;

            const mem = await supaGET(memUrl, SERVICE_KEY);
            if (!mem.ok) {
                return new Response(JSON.stringify({
                    ok: false,
                    error: "DM_MEMBERS_QUERY_FAILED",
                    status: mem.status,
                    body: mem.txt,
                }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
            }

            const rows = Array.isArray(mem.json) ? mem.json : [];
            targets = rows.map((x: any) => x?.user_id).filter(Boolean).map(String);

            const fromUserId = payload?.fromUserId ? String(payload.fromUserId) : null;
            if (fromUserId) targets = targets.filter((uid) => uid !== fromUserId);
            targets = [...new Set(targets)];
        } else if (roomId) {
            const rid = String(roomId);
            const memUrl =
                `${SUPABASE_URL}/rest/v1/room_members?room_id=eq.${encodeURIComponent(rid)}&select=user_id`;

            const mem = await supaGET(memUrl, SERVICE_KEY);
            if (!mem.ok) {
                return new Response(JSON.stringify({
                    ok: false,
                    error: "ROOM_MEMBERS_QUERY_FAILED",
                    status: mem.status,
                    body: mem.txt,
                }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
            }

            const rows = Array.isArray(mem.json) ? mem.json : [];
            targets = rows.map((x: any) => x?.user_id).filter(Boolean).map(String);

            const fromUserId = payload?.fromUserId ? String(payload.fromUserId) : null;
            if (fromUserId) targets = targets.filter((uid) => uid !== fromUserId);
            targets = [...new Set(targets)];
        } else {
            return new Response(JSON.stringify({
                ok: false,
                error: "MISSING_TARGET",
                need: "toUserId OR houseId OR threadId OR roomId"
            }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
        }

        if (targets.length === 0) {
            return new Response(JSON.stringify({ ok: true, sent: 0, note: "NO_TARGET_USERS" }), {
                status: 200,
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        // ---- build notif payload ----
        const msgId = String(payload?.msgId || `${Date.now()}_${Math.random().toString(16).slice(2)}`);
        const groupKey = String(payload?.groupKey || payload?.tag || "gio").trim() || "gio";
        const title = String(payload?.title || "GIO").trim() || "GIO";
        const bodyText = String(payload?.body || "New message");
        const url = String(payload?.url || "/");

        let iconUrl: string | null = null;
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
            threadId: payload?.threadId || null,
            fromUserId: fromUserId || null,
        };

        // ---- send to each target user's subscriptions ----
        let sent = 0;
        const details: any[] = [];

        for (const uid of targets) {
            const subsUrl =
                `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${encodeURIComponent(uid)}&select=endpoint,p256dh,auth`;

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
            const results: any[] = [];

            for (const s of subs) {
                const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
                try {
                    await webpush.sendNotification(subscription, JSON.stringify(notifPayload));
                    userSent++;
                    results.push({ endpoint: s.endpoint, ok: true });
                } catch (e: any) {
                    const statusCode = e?.statusCode ?? null;
                    results.push({ endpoint: s.endpoint, ok: false, statusCode, body: e?.body ?? null });
                }
            }

            sent += userSent;
            details.push({ userId: uid, ok: true, sent: userSent, total: subs.length, results });
        }

        return new Response(JSON.stringify({
            ok: true,
            mode: toUserId ? "single" : houseId ? "house" : threadId ? "thread" : "room",
            targets: targets.length,
            sent,
            payload: notifPayload,
            details,
        }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
    } catch (e: any) {
        console.error("[send-push fn] crashed:", e);
        return new Response(JSON.stringify({ ok: false, error: "PUSH_FAILED", message: e?.message || String(e) }), {
            status: 500,
            headers: { ...headers, "Content-Type": "application/json" },
        });
    }
}
