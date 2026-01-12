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

        let avatarUrl = null;
        if (file.value) {
            avatarUrl = await uploadAvatarHead();
            if (!avatarUrl) {
                saving.value = false;
                return;
            }
        }

        const payload = {
            id: userId,          // ✅ קריטי: כדי ליצור שורה אם לא קיימת
            nickname: value,
            onboarded: true,
            ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        };

        const { error } = await supabase
            .from("profiles")
            .upsert(payload, { onConflict: "id" }); // ✅ create-or-update

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
    <div class="min-h-[100dvh] bg-black text-white flex items-center justify-center p-4">
        <div class="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl p-6">
            <div class="text-2xl font-extrabold text-green-200">Create your profile</div>
            <div class="text-sm text-white/55 mt-1">רק רגע ומכניסים אותך לבית 🏠</div>

            <div class="mt-6 space-y-2">
                <div class="text-xs text-white/60">Nickname</div>
                <input v-model="nickname"
                       class="w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3
                 text-white placeholder-white/35 outline-none
                 focus:border-green-500/40 focus:ring-2 focus:ring-green-500/10 transition"
                       placeholder="Nickname" />
            </div>

            <div class="mt-5 space-y-2">
                <div class="text-xs text-white/60">Avatar (for now: your photo)</div>
                <input type="file"
                       accept="image/*"
                       @change="onPickFile"
                       class="block w-full text-xs text-white/70
                 file:mr-3 file:rounded-xl file:border-0
                 file:bg-white/10 file:px-4 file:py-2
                 file:text-white hover:file:bg-white/15 transition" />
                <div class="text-[11px] text-white/45 leading-relaxed">
                    עוד מעט נחליף את זה ל-Cartoon AI שמייצר אווטאר. כרגע זה רק כדי שהאפליקציה “תתלבש” על המשתמש.
                </div>
            </div>

            <button class="mt-6 w-full rounded-xl font-extrabold py-3
               bg-green-500 text-black hover:bg-green-400
               disabled:opacity-30 disabled:cursor-not-allowed
               transition active:scale-[0.99]"
                    :disabled="!canContinue"
                    @click="saveAndContinue">
                {{ uploading ? "Uploading..." : saving ? "Saving..." : "Continue" }}
            </button>

            <div v-if="status" class="mt-4 text-sm text-red-300">
                {{ status }}
            </div>
        </div>
    </div>
</template>

