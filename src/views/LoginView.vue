<script setup>
import { supabase } from "../services/supabase";

async function signInWithGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
        redirectTo: `${import.meta.env.VITE_SITE_URL}/auth/callback`,
    },
  });
}
</script>

<template>
    <div class="min-h-screen flex items-center justify-center">
        <div class="p-6 rounded border">
            <h1 class="text-xl mb-4">Sign in</h1>
            <button class="border px-4 py-3 rounded w-full" @click="signInWithGoogle">
                Continue with Google
            </button>
        </div>
    </div>
</template>
