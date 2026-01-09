<template>
    <div class="min-h-screen bg-black text-white flex items-center justify-center">
        <div class="text-center px-6">
            <div class="text-green-400 font-extrabold text-2xl mb-2">מתחברים…</div>
            <div class="text-green-600">עוד שנייה ואתה בבית 🏠</div>

            <div v-if="errorMsg" class="mt-4 text-sm text-red-300">
                {{ errorMsg }}
            </div>

            <div class="mt-4 text-xs text-white/50 break-all">
                {{ debugLine }}
            </div>
        </div>
    </div>
</template>

<script setup>
    import { computed, ref, onMounted } from "vue";
    import { useRouter } from "vue-router";
    import { supabase } from "../services/supabase";
    import { initAuth } from "../stores/auth";

    const router = useRouter();
    const errorMsg = ref("");

    const debugLine = computed(() => {
        if (typeof window === "undefined") return "no-window";
        return window.location.href;
    });

    onMounted(async () => {
        try {
            // ✅ זה חשוב: ב-OAuth PKCE, אם הזרימה התחילה בדפדפן הזה,
            // exchangeCodeForSession יעבוד. אם לא — נקבל PKCE missing.
            const url = new URL(window.location.href);
            const code = url.searchParams.get("code");

            // אם אין code, כנראה חזרת עם hash tokens או משהו אחר.
            // ננסה עדיין initAuth ונמשיך.
            if (code) {
                const { error } = await supabase.auth.exchangeCodeForSession(code);
                if (error) throw error;
            }

            await initAuth();

            // ניקוי URL (רק קוסמטי)
            window.history.replaceState({}, "", "/auth/callback");

            await router.replace({ name: "home" });
        } catch (e) {
            console.error("[AuthCallback] failed:", e);

            // ✅ אם PKCE חסר — זה אומר שה-redirect עבר לדומיין/דפדפן אחר
            // או שנמחק storage בדרך.
            errorMsg.value =
                e?.name === "AuthPKCECodeVerifierMissingError"
                    ? "PKCE verifier חסר (התחלת את הלוגין במקום אחד וחזרת למקום אחר). נחזיר אותך ללוגין כדי להתחיל מחדש באותו דומיין."
                    : (e?.message || "Auth callback failed");

            // חשוב: שולחים ללוגין עם returnUrl כדי שתוכל לחזור לאיפה שהיית
            await router.replace({ name: "login", query: { returnUrl: "/" } });
        }
    });
</script>
