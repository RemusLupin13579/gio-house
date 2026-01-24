// /src/composables/usePush.js
import { supabase } from "../services/supabase";

function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    const out = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i);
    return out;
}

export async function ensurePushEnabled() {
    if (!("serviceWorker" in navigator)) throw new Error("NO_SW");
    if (!("PushManager" in window)) throw new Error("NO_PUSH");
    if (!("Notification" in window)) throw new Error("NO_NOTIFICATIONS");

    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("NOTIF_DENIED");

    const reg = await navigator.serviceWorker.ready;

    const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) throw new Error("MISSING_VAPID_PUBLIC_KEY");

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
        sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
    }

    const json = sub.toJSON();
    const endpoint = sub.endpoint;
    const p256dh = json?.keys?.p256dh;
    const auth = json?.keys?.auth;

    if (!endpoint || !p256dh || !auth) throw new Error("BAD_SUBSCRIPTION");

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;

    const userId = userRes?.user?.id;
    if (!userId) throw new Error("NO_USER");

    // ✅ נשען על unique(endpoint)
    const { error } = await supabase
        .from("push_subscriptions")
        .upsert(
            {
                user_id: userId,
                endpoint,
                p256dh,
                auth,
                user_agent: navigator.userAgent,
            },
            { onConflict: "endpoint" }
        );

    if (error) throw error;

    return { ok: true, endpoint };
}

export async function disablePush() {
    if (!("serviceWorker" in navigator)) return { ok: true };
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();

    // אופציונלי: למחוק מה-DB לפי endpoint
    // אבל צריך את endpoint לפני unsubscribe, אז:
    // (מיישם בזהירות)
    try {
        const endpoint = sub?.endpoint;
        if (endpoint) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
        }
    } catch (_) { }

    return { ok: true };
}
