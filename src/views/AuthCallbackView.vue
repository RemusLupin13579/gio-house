<script setup>
import { onMounted } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();

onMounted(async () => {
  // Supabase ישלים את הסשן לבד
  await router.replace({ name: "home" });
});
</script>

<template>
    <div class="min-h-screen flex items-center justify-center">
        Signing you in...
    </div>
</template>
