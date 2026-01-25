// supabase/functions/send-push/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import webpush from "https://esm.sh/web-push@3.6.7?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1?target=deno";

const ALLOW_ORIGINS = new Set([
    "http://localhost:5173",
    "http://localhost:4173",
    "https://gio-home.vercel.app",
]);

function corsHeaders(origin: string | null) {
    const o = origin && ALLOW_ORIGINS.has(origin) ? origin : "https://gio-home.vercel.app";
    return {
        "Access-Control-Allow-Origin": o,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        // חשוב: לכלול כל header שהדפדפן עלול לבקש ב-preflight
        "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
    };
}

type PushPayload = {
    toUserId?: string;        // נוח ללקוח
    user_id?: string;         // תאימות אחורה
    payload?: {
        groupKey?: string;      // dm_<threadId> / room_<roomKey>
        title?: string;
        body?: string;
        url?: string;
        iconUrl?: string;
        badgeUrl?: string;
        msgId?: string;
        threadId?: string;
    };
};

serve(async (req) => {
    const origin = req.headers.get("origin");
    const cors = corsHeaders(origin);

    // ✅ Preflight ראשון לפני הכל, בלי שום תלות במשתנים/ENV
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
    }

    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), {
            status: 405,
            headers: { ...cors, "Content-Type": "application/json" },
        });
    }

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
        const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || "";
        const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || "";
        const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

        if (!SUPABASE_URL || !SERVICE_ROLE) {
            return new Response(JSON.stringify({ error: "MISSING_SUPABASE_SECRETS" }), {
                status: 500,
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }
        if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
            return new Response(JSON.stringify({ error: "MISSING_VAPID_KEYS" }), {
                status: 500,
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }

        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

        const body: PushPayload = await req.json().catch(() => ({} as any));
        const toUserId = String(body?.toUserId || body?.user_id || "").trim();
        const p = body?.payload || {};

        if (!toUserId) {
            return new Response(JSON.stringify({ error: "NO_USER_ID" }), {
                status: 400,
                headers: { ...cors, "Content-Type": "application/json" },
            });
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
                headers: { ...cors, "Content-Type": "application/json" },
            });
        }

        const msgId =
            String(p.msgId || `${Date.now()}_${Math.random().toString(16).slice(2)}`);

        // זה מה שה-SW יקבל
        const notifPayload = {
            groupKey: p.groupKey || p.threadId || "gio",
            title: p.title || "GIO",
            body: p.body || "New message",
            url: p.url || "/",
            iconUrl: p.iconUrl || null,
            badgeUrl: p.badgeUrl || "https://gio-home.vercel.app/pwa-192.png?v=1",
            msgId,
            threadId: p.threadId || null,
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
                results.push({ endpoint: s.endpoint, ok: false, statusCode });

                if (statusCode === 404 || statusCode === 410) {
                    try { await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint); } catch { }
                }
            }
        }

        return new Response(JSON.stringify({ ok: true, sent, total: subs.length, msgId, results }), {
            status: 200,
            headers: { ...cors, "Content-Type": "application/json" },
        });
    } catch (e: any) {
        console.error("[send-push] crashed:", e);
        return new Response(JSON.stringify({ error: "PUSH_FAILED", message: e?.message || String(e) }), {
            status: 500,
            headers: { ...cors, "Content-Type": "application/json" },
        });
    }
});
