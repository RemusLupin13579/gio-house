<script setup>
    import { computed } from "vue";
    import { supabase } from "../services/supabase";
    import { session, profile } from "../stores/auth";

    const isLoggedIn = computed(() => !!session.value?.user);

    async function signInWithGoogle() {
        const redirectTo = `${window.location.origin}/auth/callback`;

        await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
                queryParams: { prompt: "select_account consent" },
            },
        });

    }


    async function signOut() {
        await supabase.auth.signOut();
        session.value = null;
        profile.value = null;
    }
</script>

<template>
    <div class="min-h-screen flex items-center justify-center bg-black text-white">
        <div class="p-6 rounded-2xl border border-white/10 bg-white/5 w-[min(420px,92vw)]">
            <h1 class="text-xl mb-4 font-bold text-green-300">Sign in</h1>

            <div v-if="isLoggedIn" class="mb-4 text-sm text-white/70">
                אתה כבר מחובר.
                <div class="mt-2">
                    <button class="w-full rounded-xl bg-red-500/15 border border-red-500/30 px-4 py-3 font-bold"
                            @click="signOut">
                        התנתק כדי להתחבר עם משתמש אחר
                    </button>
                </div>
            </div>

            <button class="border border-white/10 bg-black/40 hover:bg-black/60 px-4 py-3 rounded-xl w-full transition"
                    :disabled="isLoggedIn"
                    @click="signInWithGoogle">
                Continue with Google
            </button>
        </div>
    </div>
</template>
