<template>
    <div class="fixed inset-0 z-[10060]">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"
             @click="$emit('close')"></div>

        <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,420px)]
             bg-[#0b0f12] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            <div class="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <div class="font-extrabold text-green-200">הגדרות פרופיל</div>
                <button class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/50 transition"
                        @click="$emit('close')"
                        title="Close">
                    ✕
                </button>
            </div>

            <div class="p-4 space-y-4">
                <!-- Preview -->
                <div class="flex items-center gap-3">
                    <div class="relative w-12 h-12 rounded-2xl bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center">
                        <img v-if="draft.avatar_url"
                             :src="draft.avatar_url"
                             class="w-full h-full object-cover"
                             alt="" />
                        <span v-else class="text-lg">🙂</span>

                        <!-- tiny upload badge -->
                        <label class="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-[#0c1116] border border-white/10
                                      grid place-items-center cursor-pointer hover:border-green-500/40 transition"
                               title="העלה תמונת פרופיל">
                            <input class="hidden" type="file" accept="image/*" @change="onPickAvatar" />
                            📷
                        </label>
                    </div>

                    <div class="min-w-0">
                        <div class="font-bold truncate" :style="{ color: safeColor }">
                            {{ draft.nickname || "User" }}
                        </div>
                        <div class="text-xs text-white/40 truncate">ID: {{ myId || "-" }}</div>
                        <div class="text-[11px] text-white/35 mt-0.5">
                            רוצה דמות מלאה בעולם GIO? העלה תמונת פרופיל טובה ואנחנו נטפל בשאר 😉
                        </div>
                    </div>
                </div>

                <!-- Upload status -->
                <div v-if="uploading" class="text-xs text-white/60">
                    מעלה תמונה...
                </div>

                <!-- Nickname -->
                <div>
                    <div class="text-xs text-white/50 mb-1">שם משתמש</div>
                    <input v-model="draft.nickname"
                           class="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none
                                  focus:border-green-500/30"
                           placeholder="Nickname" />
                    <div v-if="err" class="mt-1 text-[11px] text-red-300/90">{{ err }}</div>
                </div>

                <!-- Color -->
                <div class="flex items-center justify-between gap-3">
                    <div>
                        <div class="text-xs text-white/50 mb-1">צבע</div>
                        <div class="text-[11px] text-white/35">בחירת צבע לשם בצ’אט</div>
                    </div>

                    <div class="flex items-center gap-2">
                        <input type="color"
                               v-model="draft.color"
                               class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 p-1"
                               title="Pick color" />
                        <button class="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/40 transition text-xs"
                                @click="randomizeColor"
                                title="Random color">
                            🎲
                        </button>
                    </div>
                </div>

                <!-- Actions -->
                <div class="flex items-center justify-between gap-2 pt-2">
                    <button class="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/15 transition text-red-200 text-xs"
                            @click="$emit('signout')"
                            title="Sign out">
                        התנתק
                    </button>

                    <div class="flex items-center gap-2">
                        <button class="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition text-xs"
                                @click="$emit('close')">
                            ביטול
                        </button>

                        <button class="px-4 py-2 rounded-xl bg-green-500 text-black font-bold text-xs hover:scale-[1.02] active:scale-[0.99] transition
                                       disabled:opacity-40 disabled:hover:scale-100"
                                :disabled="saving || uploading"
                                @click="save">
                            {{ saving ? "שומר..." : "שמור" }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { computed, reactive, ref, watch } from "vue";
    import { useProfilesStore } from "../stores/profiles";
    import { useAuthStore } from "../stores/auth";
    import { supabase } from "../services/supabase";

    defineEmits(["close", "signout"]);

    const profilesStore = useProfilesStore();
    const auth = useAuthStore();

    const saving = ref(false);
    const uploading = ref(false);
    const err = ref("");

    const myId = computed(() => auth.userId || null);
    const me = computed(() => (myId.value ? profilesStore.getById(myId.value) : null));

    const draft = reactive({
        nickname: "",
        color: "#22c55e",
        avatar_url: null,
    });

    /* =========================
       ✅ Avatar upload (bucket: avatars)
       ========================= */
    function extFromFile(file) {
        const name = String(file?.name || "").toLowerCase();
        const m = name.match(/\.(png|jpg|jpeg|webp)$/i);
        return m ? m[1].replace("jpeg", "jpg") : "png";
    }

    async function onPickAvatar(e) {
        const file = e?.target?.files?.[0];
        if (!file) return;

        err.value = "";
        uploading.value = true;

        try {
            const uid = myId.value;
            if (!uid) throw new Error("אין משתמש מחובר");

            // ✅ נשמור תמיד avatar.{ext} תחת תיקייה של המשתמש
            const ext = extFromFile(file);
            const path = `${uid}/avatar.${ext}`;

            const { error: upErr } = await supabase.storage
                .from("avatars")
                .upload(path, file, {
                    upsert: true,
                    contentType: file.type || "image/*",
                });

            if (upErr) throw upErr;

            // ✅ public URL (או signed אם אתה רוצה פרטיות)
            const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
            const avatar_url = pub?.publicUrl || null;

            // ✅ עדכון פרופיל (DB)
            await profilesStore.updateMyProfile({
                avatar_url,
            });

            // ✅ עדכון draft מיד
            draft.avatar_url = avatar_url;
        } catch (e2) {
            err.value = e2?.message || String(e2);
            console.error("[ProfileSettingsModal] avatar upload failed:", e2);
        } finally {
            uploading.value = false;
            // allow re-picking same file
            try { e.target.value = ""; } catch (_) { }
        }
    }

    /* =========================
       ✅ Color helpers (HEX-only for input[type=color])
       ========================= */
    function clamp01(x) {
        return Math.max(0, Math.min(1, x));
    }
    function rgbToHex(r, g, b) {
        const to = (n) => n.toString(16).padStart(2, "0");
        return `#${to(r)}${to(g)}${to(b)}`.toLowerCase();
    }
    function hslToRgb(h, s, l) {
        h = ((h % 360) + 360) % 360;
        s = clamp01(s);
        l = clamp01(l);

        const c = (1 - Math.abs(2 * l - 1)) * s;
        const hp = h / 60;
        const x = c * (1 - Math.abs((hp % 2) - 1));

        let r1 = 0, g1 = 0, b1 = 0;
        if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
        else if (hp < 2) [r1, g1, b1] = [x, c, 0];
        else if (hp < 3) [r1, g1, b1] = [0, c, x];
        else if (hp < 4) [r1, g1, b1] = [0, x, c];
        else if (hp < 5) [r1, g1, b1] = [x, 0, c];
        else[r1, g1, b1] = [c, 0, x];

        const m = l - c / 2;
        const r = Math.round((r1 + m) * 255);
        const g = Math.round((g1 + m) * 255);
        const b = Math.round((b1 + m) * 255);
        return [r, g, b];
    }
    function normalizeToHexColor(input) {
        const v = String(input || "").trim();
        if (!v) return "#22c55e";

        if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
        if (/^#[0-9a-fA-F]{3}$/.test(v)) {
            const r = v[1], g = v[2], b = v[3];
            return (`#${r}${r}${g}${g}${b}${b}`).toLowerCase();
        }

        const m = v.match(/^hsl\(\s*([0-9.]+)\s*,\s*([0-9.]+)%\s*,\s*([0-9.]+)%\s*\)$/i);
        if (m) {
            const h = Number(m[1]);
            const s = Number(m[2]) / 100;
            const l = Number(m[3]) / 100;
            const [r, g, b] = hslToRgb(h, s, l);
            return rgbToHex(r, g, b);
        }

        return "#22c55e";
    }

    const safeColor = computed(() => normalizeToHexColor(draft.color));

    watch(
        me,
        (p) => {
            draft.nickname = p?.nickname || "User";
            draft.color = normalizeToHexColor(p?.color || "#22c55e");
            draft.avatar_url = p?.avatar_url || null;
        },
        { immediate: true }
    );

    function randomizeColor() {
        const hue = Math.floor(Math.random() * 360);
        const [r, g, b] = hslToRgb(hue, 0.85, 0.70);
        draft.color = rgbToHex(r, g, b);
    }

    function isUniqueViolation(message = "") {
        return /duplicate key value violates unique constraint/i.test(message);
    }

    async function save() {
        err.value = "";
        saving.value = true;

        try {
            const nickname = String(draft.nickname || "").trim();
            if (!nickname) throw new Error("שם משתמש לא יכול להיות ריק");

            await profilesStore.updateMyProfile({
                nickname,
                color: normalizeToHexColor(draft.color),
                avatar_url: draft.avatar_url || null,
            });
        } catch (e) {
            const msg = e?.message || String(e);
            if (isUniqueViolation(msg)) err.value = "השם הזה תפוס 😅 נסה משהו אחר";
            else err.value = msg;
        } finally {
            saving.value = false;
        }
    }
</script>
