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
    };
}

serve(async (req) => {
    const origin = req.headers.get("origin");
    const headers = cors(origin);

    // ✅ Preflight חייב תמיד לחזור 200, בלי לגעת בכלום אחר
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 200, headers });
    }

    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), {
            status: 405,
            headers: { ...headers, "Content-Type": "application/json" },
        });
    }

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
        const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
        const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
        const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

        if (!SUPABASE_URL || !SERVICE_ROLE) {
            return new Response(JSON.stringify({ error: "MISSING_SUPABASE_SECRETS" }), {
                status: 500,
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }
        if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
            return new Response(JSON.stringify({ error: "MISSING_VAPID_KEYS" }), {
                status: 500,
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

        const body = await req.json().catch(() => ({}));
        const toUserId = String(body?.user_id || "").trim();
        const payload = body?.payload || {};
        if (!toUserId) {
            return new Response(JSON.stringify({ error: "NO_USER_ID" }), {
                status: 400,
                headers: { ...headers, "Content-Type": "application/json" },
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
                headers: { ...headers, "Content-Type": "application/json" },
            });
        }

        const notifPayload = {
            title: payload.title || "GIO",
            body: payload.body || "New message",
            // שימוש בנתיב האווטאר שיצרת
            icon: payload.icon || "https://gio-home.vercel.app/pwa-192.png",
            badge: "https://gio-home.vercel.app/pwa-192.png", // לוגו קטן בשורת הסטטוס
            data: {
                url: payload.url || "/",
                senderName: payload.title,
                text: payload.body,
                threadId: payload.tag || "default" // מזהה לקיבוץ
            },
            // אם תשאיר tag קבוע, הדפדפן ידרוס. אם תוריד, יהיו עשרות התראות נפרדות.
            // לכן נשתמש ב-tag בתוך ה-Service Worker בצורה חכמה.
            tag: payload.tag || "gio-group",
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

                if (statusCode === 410 || statusCode === 404) {
                    try { await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint); } catch { }
                }
                results.push({ endpoint: s.endpoint, ok: false, statusCode, body: errBody });
            }
        }

        return new Response(JSON.stringify({ ok: true, sent, total: subs.length, results }), {
            status: 200,
            headers: { ...headers, "Content-Type": "application/json" },
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: "PUSH_FAILED", message: e?.message || String(e) }), {
            status: 500,
            headers: { ...headers, "Content-Type": "application/json" },
        });
    }
});
