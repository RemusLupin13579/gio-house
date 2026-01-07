<template>
    <div class="min-h-screen bg-black text-white flex items-center justify-center">
        <div class="text-center">
            <div class="text-green-400 font-bold text-2xl mb-2">מתחברים…</div>
            <div class="text-green-600">עוד שנייה ואתה בבית 🏠</div>
        </div>
    </div>
</template>

<script setup>
    import { onMounted } from "vue";
    import { useRouter } from "vue-router";
    import { supabase } from "../services/supabase";
    import { initAuth } from "../stores/auth";

    const router = useRouter();

    onMounted(async () => {
        try {
            // אם חזרת מ-OAuth עם ?code=... צריך להחליף אותו ל-session
            const url = new URL(window.location.href);
            const code = url.searchParams.get("code");

            if (code) {
                const { error } = await supabase.auth.exchangeCodeForSession(code);
                if (error) console.error("exchangeCodeForSession error:", error);
            }

            // עכשיו נטען session+profile כמו שצריך
            await initAuth();

            // ניקוי פרמטרים מה-URL (אופציונלי, אבל נעים)
            window.history.replaceState({}, "", "/auth/callback");

            // קדימה לאפליקציה
            await router.replace({ name: "home" });
        } catch (e) {
            console.error("Auth callback failed:", e);
            await router.replace({ name: "login" });
        }
    });
</script>
