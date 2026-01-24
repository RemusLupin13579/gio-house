<!-- /src/components/ProfileSettingsModal.vue -->
<template>
    <div class="fixed inset-0 z-[10060]">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="$emit('close')"></div>

        <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,440px)]
             bg-[#0b0f12] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            <!-- Header -->
            <div class="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <div class="font-extrabold text-green-200">הגדרות פרופיל</div>

                <button class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/50 transition active:scale-[0.98]"
                        @click="$emit('close')"
                        title="Close">
                    ✕
                </button>
            </div>

            <!-- Body -->
            <div class="p-4 space-y-4">
                <!-- Preview -->
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center">
                        <img v-if="draft.avatar_url" :src="draft.avatar_url" class="w-full h-full object-cover" alt="" />
                        <span v-else class="text-lg">🙂</span>
                    </div>

                    <div class="min-w-0">
                        <div class="font-extrabold truncate" :style="{ color: safeColor }">
                            {{ draft.nickname || "User" }}
                        </div>
                        <div class="text-xs text-white/40 truncate">ID: {{ myId || "-" }}</div>
                    </div>
                </div>

                <!-- Notifications (Push) -->
                <section class="p-3 rounded-2xl border border-white/10 bg-white/5">
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                            <div class="font-extrabold text-white/85 leading-tight">Notifications</div>
                            

                            <div class="mt-2 text-[11px] leading-snug">
                                <template v-if="pushSupport === 'unsupported'">
                                    <span class="text-white/45">
                                        המכשיר/דפדפן לא תומך ב-Push (צריך PWA/דפדפן תומך + Service Worker).
                                    </span>
                                </template>

                                <template v-else-if="pushSupport === 'denied'">
                                    <span class="text-yellow-200/80">
                                        ההרשאה חסומה. פתח הגדרות אתר והפעל Notifications.
                                    </span>
                                </template>

                                <template v-else>
                                    <span class="text-white/45">
                                        סטטוס: <span class="text-white/70 font-bold">{{ pushEnabled ? "Enabled" : "Disabled" }}</span>
                                    </span>
                                </template>

                                <div v-if="pushError" class="mt-1 text-red-300/90">
                                    {{ pushError }}
                                </div>
                            </div>
                        </div>

                        <div class="shrink-0 pt-1">
                            <button class="relative w-14 h-8 rounded-full border transition
                       disabled:opacity-40 disabled:cursor-not-allowed"
                                    :class="pushEnabled ? 'bg-green-500/80 border-green-500/40' : 'bg-white/10 border-white/15'"
                                    :disabled="pushBusy || pushSupport !== 'supported'"
                                    @click="togglePush"
                                    :title="pushEnabled ? 'Disable notifications' : 'Enable notifications'">
                                <span class="absolute top-1 w-6 h-6 rounded-full bg-[#0b0f12] border border-white/15 shadow transition"
                                      :style="{ left: pushEnabled ? '30px' : '4px' }" />
                                <span v-if="pushBusy" class="absolute inset-0 flex items-center justify-center text-[10px] text-black/70 font-extrabold">
                                    …
                                </span>
                            </button>
                        </div>
                    </div>

                    <!-- tiny helper row -->
                    <div class="mt-3 flex items-center justify-between gap-2">
                        <div class="text-[11px] text-white/40" dir="rtl">
                            טיפ לאייפון: עובד הכי טוב כשמתקינים את האתר כאפליקציה
                            (Add to Home Screen).
                        </div>
                    </div>
                </section>

                <!-- Avatar upload -->
                <div>
                    <div class="text-xs text-white/50 mb-1">תמונת פרופיל</div>

                    <div class="flex items-center gap-2">
                        <input ref="fileEl" type="file" accept="image/*" class="hidden" @change="onPickAvatar" />

                        <button class="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/40 transition text-xs disabled:opacity-40"
                                :disabled="uploading"
                                @click="fileEl?.click()">
                            {{ uploading ? "מעלה..." : "העלה תמונה" }}
                        </button>

                        <button v-if="draft.avatar_url"
                                class="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition text-xs disabled:opacity-40"
                                :disabled="uploading"
                                @click="clearAvatar">
                            הסר
                        </button>
                    </div>

                    <div class="mt-1 text-[11px] text-white/40">
                        טיפ: סלפי/פלג גוף עליון עובד הכי טוב ל־ character בהמשך.
                    </div>
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

                <!-- DM scene background -->
                <div class="p-3 rounded-2xl bg-white/5 border border-white/10">
                    <div class="flex items-center justify-between gap-3 mb-2">
                        <div>
                            <div class="font-extrabold text-white/80">DM Scene</div>
                            <div class="text-[11px] text-white/40">רקע + כיתוב שיופיעו בסצנה</div>
                        </div>

                        <button class="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition text-[11px]
                     disabled:opacity-40"
                                :disabled="savingDMScene"
                                @click="saveDmCaption"
                                title="Save caption">
                            Save caption
                        </button>
                    </div>

                    <div class="flex items-center gap-3">
                        <div class="w-20 h-14 rounded-xl border border-white/10 overflow-hidden bg-black/40 flex items-center justify-center">
                            <img v-if="dmBgUrl" :src="dmBgUrl" class="w-full h-full object-cover" alt="" />
                            <span v-else class="text-white/30 text-xs">No BG</span>
                        </div>

                        <div class="flex items-center gap-2">
                            <input ref="dmFileEl" type="file" accept="image/*" class="hidden" :disabled="savingDMScene" @change="onPickDmBg" />

                            <button class="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/30 transition text-xs
                       disabled:opacity-40"
                                    :disabled="savingDMScene"
                                    @click="dmFileEl?.click()">
                                {{ savingDMScene ? "..." : "Upload" }}
                            </button>

                            <button class="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-red-400/30 transition text-xs
                       disabled:opacity-40"
                                    :disabled="savingDMScene || !dmBgUrl"
                                    @click="removeDmScene">
                                Remove
                            </button>
                        </div>
                    </div>

                    <div class="mt-3">
                        <input v-model="dmCaption"
                               placeholder="Caption קצר שיופיע בסצנה…"
                               class="w-full h-10 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm outline-none
                     focus:border-green-500/30" />
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

                        <button class="px-4 py-2 rounded-xl bg-green-500 text-black font-extrabold text-xs
                     hover:scale-[1.02] active:scale-[0.99] transition
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
    import { computed, reactive, ref, watch, onMounted } from "vue";
    import { useProfilesStore } from "../stores/profiles";
    import { useAuthStore } from "../stores/auth";
    import { supabase } from "../services/supabase";
    import { ensurePushEnabled } from "../composables/usePush";

    defineEmits(["close", "signout"]);

    const profilesStore = useProfilesStore();
    const auth = useAuthStore();

    const saving = ref(false);
    const uploading = ref(false);
    const err = ref("");

    const fileEl = ref(null);
    const dmFileEl = ref(null);

    const myId = computed(() => auth.userId || null);
    const me = computed(() => (myId.value ? profilesStore.getById(myId.value) : null));

    const draft = reactive({
        nickname: "",
        color: "#22c55e",
        avatar_url: null,
    });

    /* =========================
       ✅ Push UI state
       ========================= */
    const pushEnabled = ref(false);
    const pushBusy = ref(false);
    const pushError = ref("");

    const pushSupport = computed(() => {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
        if (typeof Notification !== "undefined" && Notification.permission === "denied") return "denied";
        return "supported";
    });

    async function refreshPushState() {
        pushError.value = "";
        try {
            if (pushSupport.value !== "supported") {
                pushEnabled.value = false;
                return;
            }
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            pushEnabled.value = !!sub && Notification.permission === "granted";
        } catch (e) {
            pushEnabled.value = false;
        }
    }

    async function togglePush() {
        pushError.value = "";
        pushBusy.value = true;
        try {
            if (pushSupport.value !== "supported") return;

            if (pushEnabled.value) {
                const reg = await navigator.serviceWorker.ready;
                const sub = await reg.pushManager.getSubscription();
                if (sub) await sub.unsubscribe();
                pushEnabled.value = false;
                return;
            }

            await ensurePushEnabled();
            await refreshPushState();
        } catch (e) {
            pushError.value = e?.message || String(e);
            pushEnabled.value = false;
        } finally {
            pushBusy.value = false;
        }
    }

    /* =========================
       ✅ DM SCENE (source of truth: profilesStore)
       ========================= */
    const savingDMScene = ref(false);
    const dmCaption = ref("");

    const dmBgUrl = computed(() => me.value?.dm_scene_background_url || null);

    watch(
        me,
        (p) => {
            draft.nickname = p?.nickname || "User";
            draft.color = normalizeToHexColor(p?.color || "#22c55e");
            draft.avatar_url = p?.avatar_url || null;
            dmCaption.value = p?.dm_scene_caption || "";
        },
        { immediate: true }
    );

    function resetDmFileInput() {
        if (dmFileEl.value) dmFileEl.value.value = "";
    }

    function onPickDmBg(e) {
        const file = e?.target?.files?.[0];
        resetDmFileInput();
        if (!file) return;
        void uploadDmScene(file);
    }

    async function uploadDmScene(file) {
        if (!file) return;
        const uid = myId.value;
        if (!uid) return;

        savingDMScene.value = true;
        err.value = "";

        try {
            const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
            const path = `dms/${uid}/bg.${ext}`;

            const { error: upErr } = await supabase.storage.from("room-scenes").upload(path, file, {
                upsert: true,
                contentType: file.type || "image/jpeg",
                cacheControl: "3600",
            });
            if (upErr) throw upErr;

            const { data } = supabase.storage.from("room-scenes").getPublicUrl(path);
            const publicUrl = data?.publicUrl || null;
            if (!publicUrl) throw new Error("לא הצלחתי לקבל URL לתמונה");

            await profilesStore.updateMyProfile({ dm_scene_background_url: publicUrl });
        } catch (e) {
            err.value = e?.message || String(e);
        } finally {
            savingDMScene.value = false;
        }
    }

    async function removeDmScene() {
        savingDMScene.value = true;
        err.value = "";
        try {
            await profilesStore.updateMyProfile({ dm_scene_background_url: null });
        } catch (e) {
            err.value = e?.message || String(e);
        } finally {
            savingDMScene.value = false;
        }
    }

    async function saveDmCaption() {
        savingDMScene.value = true;
        err.value = "";
        try {
            await profilesStore.updateMyProfile({ dm_scene_caption: String(dmCaption.value || "") });
        } catch (e) {
            err.value = e?.message || String(e);
        } finally {
            savingDMScene.value = false;
        }
    }

    /* =========================
       ✅ Color helpers (keep HEX)
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

        let r1 = 0,
            g1 = 0,
            b1 = 0;
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
            const r = v[1],
                g = v[2],
                b = v[3];
            return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
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

    function randomizeColor() {
        const hue = Math.floor(Math.random() * 360);
        const [r, g, b] = hslToRgb(hue, 0.85, 0.7);
        draft.color = rgbToHex(r, g, b);
    }

    /* =========================
       ✅ Avatar upload (bucket: avatars)
       ========================= */
    function extFromType(type = "") {
        if (type.includes("png")) return "png";
        if (type.includes("webp")) return "webp";
        if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
        return "png";
    }

    async function onPickAvatar(e) {
        const file = e?.target?.files?.[0];
        if (!file) return;

        err.value = "";
        uploading.value = true;

        try {
            const uid = myId.value;
            if (!uid) throw new Error("לא מחובר");

            const ext = extFromType(file.type);
            const path = `${uid}/avatar.${ext}`;

            const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
                upsert: true,
                contentType: file.type || "image/png",
                cacheControl: "3600",
            });
            if (upErr) throw upErr;

            const { data } = supabase.storage.from("avatars").getPublicUrl(path);
            const publicUrl = data?.publicUrl || null;
            if (!publicUrl) throw new Error("לא הצלחתי לקבל URL לתמונה");

            draft.avatar_url = publicUrl;
            await profilesStore.updateMyProfile({ avatar_url: publicUrl });

            if (fileEl.value) fileEl.value.value = "";
        } catch (e2) {
            err.value = e2?.message || String(e2);
        } finally {
            uploading.value = false;
        }
    }

    async function clearAvatar() {
        err.value = "";
        uploading.value = true;

        try {
            draft.avatar_url = null;
            await profilesStore.updateMyProfile({ avatar_url: null });
            if (fileEl.value) fileEl.value.value = "";
        } catch (e2) {
            err.value = e2?.message || String(e2);
        } finally {
            uploading.value = false;
        }
    }

    /* =========================
       ✅ Save
       ========================= */
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
                // ✅ do NOT touch dm_scene_* here
            });
        } catch (e2) {
            const msg = e2?.message || String(e2);
            err.value = isUniqueViolation(msg) ? "השם הזה תפוס 😅 נסה משהו אחר" : msg;
        } finally {
            saving.value = false;
        }
    }

    onMounted(() => {
        void refreshPushState();
    });
</script>
