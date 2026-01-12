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
    import { session, authReady } from "../stores/auth"; // ✅ חשוב

    const router = useRouter();
    const errorMsg = ref("");

    const debugLine = computed(() => {
        if (typeof window === "undefined") return "no-window";
        return window.location.href;
    });

    function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    onMounted(async () => {
        try {
            const url = new URL(window.location.href);
            const code = url.searchParams.get("code");

            if (code) {
                const { error } = await supabase.auth.exchangeCodeForSession(code);
                if (error) throw error;
            }

            // ✅ אל תעשה initAuth() כאן.
            // נחכה שה-bootstrap/onAuthStateChange יעדכנו session.
            const start = Date.now();
            while (!authReady.value && Date.now() - start < 6000) await sleep(50);

            const start2 = Date.now();
            while (!session.value && Date.now() - start2 < 4000) await sleep(50);

            window.history.replaceState({}, "", "/auth/callback");
            await router.replace({ name: session.value ? "home" : "login" });
        } catch (e) {
            console.error("[AuthCallback] failed:", e);
            errorMsg.value =
                e?.name === "AuthPKCECodeVerifierMissingError"
                    ? "PKCE verifier חסר (נפתח במקום אחד וחזר במקום אחר / storage נמחק). תנסה להתחבר שוב מאותו מקום."
                    : (e?.message || "Auth callback failed");

            await router.replace({ name: "login", query: { returnUrl: "/" } });
        }
    });
</script>

