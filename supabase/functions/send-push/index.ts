// supabase/functions/send-push/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import webpush from "https://esm.sh/web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const ALLOW_ORIGINS = new Set([
    "http://localhost:5173",
    "http://localhost:4173",
    "https://gio-home.vercel.app",
]);

function cors(origin: string | null) {
    const o = origin && ALLOW_ORIGINS.has(origin) ? origin : "https://gio-home.vercel.app";
    return {
        "Access-Control-Allow-Origin": o,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
        "Content-Type": "application/json",
    };
}

async function headOk(url: string): Promise<boolean> {
    try {
        const r = await fetch(url, { method: "HEAD" });
        return r.ok;
    } catch {
        return false;
    }
}

// ✅ תומך גם avatar וגם head, ובכמה סיומות
async function pickAvatarUrl(supabaseUrl: string, uid: string): Promise<string | null> {
    if (!supabaseUrl || !uid) return null;

    const base = `${supabaseUrl}/storage/v1/object/public/avatars/${uid}`;
    const candidates = [
        `${base}/avatar.jpg`,
        `${base}/avatar.jpeg`,
        `${base}/avatar.png`,
        `${base}/head.png`,
        `${base}/head.jpg`,
        `${base}/head.jpeg`,
    ];

    for (const u of candidates) {
        if (await headOk(u)) return u;
    }
    return null;
}

serve(async (req) => {
    const origin = req.headers.get("origin");
    const headers = cors(origin);

    // ✅ Preflight תמיד 200
    if (req.method === "OPTIONS") return new Response(null, { status: 200, headers });
    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), { status: 405, headers });
    }

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
        const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
        const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
        const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

        if (!SUPABASE_URL || !SERVICE_ROLE) {
            return new Response(JSON.stringify({ error: "MISSING_SUPABASE_SECRETS" }), { status: 500, headers });
        }
        if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
            return new Response(JSON.stringify({ error: "MISSING_VAPID_KEYS" }), { status: 500, headers });
        }

        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

        const body = await req.json().catch(() => ({}));

        // ✅ תאימות: מאפשר גם user_id וגם toUserId (כי שיניתם לאורך הדרך)
        const toUserId = String(body?.toUserId || body?.user_id || "").trim();
        const payload = body?.payload || {};
        if (!toUserId) {
            return new Response(JSON.stringify({ error: "NO_TO_USER" }), { status: 400, headers });
        }

        const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

        const { data: subs, error } = await admin
            .from("push_subscriptions")
            .select("endpoint,p256dh,auth")
            .eq("user_id", toUserId);

        if (error) throw error;

        if (!subs?.length) {
            return new Response(JSON.stringify({ ok: true, sent: 0, note: "NO_SUBSCRIPTIONS" }), {
                status: 200,
                headers,
            });
        }

        // ======== WhatsApp-style payload expected by /public/sw.js ========
        // groupKey: "dm_<threadId>" / "room_<roomKey>" / etc
        // title: nickname
        // body: preview
        // url: click target
        // iconUrl: profile image (left)
        // badgeUrl: app logo (small)
        // msgId: unique per message (optional)
        // ================================================================

        const msgId = String(payload?.msgId || payload?.id || `${Date.now()}_${crypto.randomUUID?.() || Math.random()}`);

        const groupKey =
            String(payload?.groupKey || "").trim() ||
            // תאימות: אם עדיין שולחים tag כמו פעם (dm_<threadId>)
            String(payload?.tag || "").trim() ||
            "gio";

        const title = String(payload?.title || "GIO").trim() || "GIO";
        const bodyText = String(payload?.body || "New message");

        const url = String(payload?.url || "/");

        // iconUrl:
        // 1) אם הלקוח שלח iconUrl מפורש — נשתמש בו
        // 2) אחרת אם שלח fromUserId — נביא מהבאקט avatars/<id>/avatar|head.*
        // 3) אחרת fallback ללוגו
        let iconUrl: string | null =
            typeof payload?.iconUrl === "string" && payload.iconUrl.length ? payload.iconUrl : null;

        if (!iconUrl && payload?.fromUserId) {
            iconUrl = await pickAvatarUrl(SUPABASE_URL, String(payload.fromUserId));
        }

        const badgeUrl =
            (typeof payload?.badgeUrl === "string" && payload.badgeUrl.length)
                ? payload.badgeUrl
                : "https://gio-home.vercel.app/pwa-192.png?v=1";

        const notifPayload = {
            groupKey,
            msgId,
            title,
            body: bodyText,
            url,
            iconUrl,     // ✅ SW מחפש iconUrl (לא icon)
            badgeUrl,    // ✅ SW מחפש badgeUrl (לא badge)
        };

        let sent = 0;
        const results: any[] = [];

        for (const s of subs) {
            const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };

            try {
                await webpush.sendNotification(subscription as any, JSON.stringify(notifPayload));
                sent++;
                results.push({ endpoint: s.endpoint, ok: true });
            } catch (e: any) {
                const statusCode = e?.statusCode ?? null;
                const errBody = e?.body ?? null;

                // cleanup dead subs
                if (statusCode === 410 || statusCode === 404) {
                    try {
                        await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
                    } catch { }
                }

                results.push({ endpoint: s.endpoint, ok: false, statusCode, body: errBody });
            }
        }

        return new Response(JSON.stringify({ ok: true, sent, total: subs.length, notifPayload, results }), {
            status: 200,
            headers,
        });
    } catch (e: any) {
        console.error("[send-push] failed:", e);
        return new Response(JSON.stringify({ error: "PUSH_FAILED", message: e?.message || String(e) }), {
            status: 500,
            headers,
        });
    }
});
