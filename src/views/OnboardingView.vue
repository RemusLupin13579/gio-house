<script setup>
    import { ref, computed, onMounted } from "vue";
    import { useRouter } from "vue-router";
    import { supabase } from "../services/supabase";
    import { session, profile, fetchMyProfile } from "../stores/auth";

    const router = useRouter();

    const nickname = ref("");
    const status = ref("");
    const saving = ref(false);

    const file = ref(null);
    const uploading = ref(false);

    const canContinue = computed(() => {
        return nickname.value.trim().length >= 2 && !saving.value && !uploading.value;
    });

    onMounted(async () => {
        await fetchMyProfile();

        if (profile.value?.nickname) nickname.value = profile.value.nickname;

        // אם כבר סיים onboarding (nickname קיים), אפשר להיכנס הביתה
        if (profile.value?.nickname && profile.value?.onboarded) {
            router.replace({ name: "home" });
        }
    });

    function onPickFile(e) {
        const f = e.target.files?.[0] ?? null;
        file.value = f;
    }

    async function uploadAvatarHead() {
        status.value = "";

        const userId = session.value?.user?.id;
        if (!userId) {
            status.value = "אין משתמש מחובר. נסה להתחבר מחדש.";
            return null;
        }
        if (!file.value) return null;

        // ננעל על סיומת בטוחה
        const ext = (file.value.name.split(".").pop() || "png").toLowerCase();
        const safeExt = ["png", "jpg", "jpeg", "webp"].includes(ext) ? ext : "png";

        const path = `${userId}/head.${safeExt}`;

        uploading.value = true;

        try {
            console.log("⬆️ Upload start", { bucket: "avatars", path, size: file.value.size, type: file.value.type });

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from("avatars")
                .upload(path, file.value, { upsert: true });

            console.log("⬆️ Upload response", { uploadData, uploadError });

            if (uploadError) {
                status.value = `שגיאה בהעלאה: ${uploadError.message}`;
                return null;
            }

            const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
            const publicUrl = urlData?.publicUrl ?? null;

            console.log("🔗 Public URL", publicUrl);

            if (!publicUrl) {
                status.value = "העלאה הצליחה אבל לא התקבל URL ציבורי.";
                return null;
            }

            return publicUrl;
        } catch (e) {
            console.error("⬆️ Upload threw exception:", e);
            status.value = `שגיאת רשת/חריגה בזמן העלאה: ${e?.message ?? e}`;
            return null;
        } finally {
            uploading.value = false;
            console.log("⬆️ Upload end (uploading=false)");
        }
    }

    async function saveAndContinue() {
        status.value = "";

        const value = nickname.value.trim();
        if (value.length < 2) {
            status.value = "Nickname קצר מדי (מינימום 2 תווים).";
            return;
        }

        const userId = session.value?.user?.id;
        if (!userId) {
            status.value = "אין משתמש מחובר. נסה להתחבר מחדש.";
            return;
        }

        saving.value = true;

        // אם המשתמש בחר תמונה — נעלה ונשמור URL
        let avatarUrl = null;
        if (file.value) {
            avatarUrl = await uploadAvatarHead();
            if (!avatarUrl) {
                saving.value = false;
                return;
            }
        }

        const payload = {
            nickname: value,
            onboarded: true,
        };
        if (avatarUrl) payload.avatar_url = avatarUrl;

        const { error } = await supabase.from("profiles").update(payload).eq("id", userId);

        saving.value = false;

        if (error) {
            console.error("Onboarding save error:", error);
            status.value = `שגיאה בשמירה: ${error.message}`;
            return;
        }

        await fetchMyProfile();
        router.replace({ name: "home" });
    }
</script>

<template>
    <div class="min-h-screen flex items-center justify-center p-6">
        <div class="w-full max-w-sm border rounded p-5 space-y-4">
            <div class="text-xl font-bold">Create your profile</div>

            <div class="space-y-2">
                <div class="text-sm opacity-70">Nickname</div>
                <input v-model="nickname" class="border p-2 w-full rounded" placeholder="Nickname" />
            </div>

            <div class="space-y-2">
                <div class="text-sm opacity-70">Avatar (for now: your photo)</div>
                <input type="file" accept="image/*" @change="onPickFile" />
                <div class="text-xs opacity-60">
                    עוד מעט נחליף את זה ל-Cartoon AI שמייצר אווטאר. כרגע זה רק כדי שהאפליקציה “תתלבש” על המשתמש.
                </div>
            </div>

            <button class="border px-4 py-2 rounded w-full" :disabled="!canContinue" @click="saveAndContinue">
                {{ uploading ? "Uploading..." : saving ? "Saving..." : "Continue" }}
            </button>

            <div v-if="status" class="text-sm opacity-80">{{ status }}</div>
        </div>
    </div>
</template>
