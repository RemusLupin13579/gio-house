<script setup>
    import { onMounted, ref, computed } from "vue";
    import { useRouter } from "vue-router";
    import { authReady, session } from "../stores/auth";

    const router = useRouter();
    const errorMsg = ref("");

    const debugLine = computed(() =>
        typeof window === "undefined" ? "no-window" : window.location.href
    );

    function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    onMounted(async () => {
        try {
            // אין exchange פה בכלל. initAuth() + detectSessionInUrl יעשו את העבודה.
            const start = Date.now();
            while (!authReady.value && Date.now() - start < 8000) await sleep(50);

            // ניקוי URL (אסתטי)
            try { window.history.replaceState({}, "", "/auth/callback"); } catch (_) { }

            await router.replace({ name: session.value ? "home" : "login" });
        } catch (e) {
            console.error("[AuthCallback] failed:", e);
            errorMsg.value = e?.message || "Auth callback failed";
            await router.replace({ name: "login" });
        }
    });
</script>
