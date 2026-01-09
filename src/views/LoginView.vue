<script setup>
    import { supabase } from "../services/supabase";

    async function signInWithGoogle() {
        const redirectTo = `${window.location.origin}/auth/callback`;

        await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo },
        });
    }
</script>


<template>
    <div class="min-h-screen flex items-center justify-center bg-black text-white">
        <div class="p-6 rounded-2xl border border-white/10 bg-white/5 w-[min(420px,92vw)]">
            <h1 class="text-xl mb-4 font-bold text-green-300">Sign in</h1>

            <button class="border border-white/10 bg-black/40 hover:bg-black/60 px-4 py-3 rounded-xl w-full transition"
                    @click="signInWithGoogle">
                Continue with Google
            </button>

        </div>
    </div>
</template>
