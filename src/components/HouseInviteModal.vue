<template>
    <div class="fixed inset-0 z-[10020]">
        <div class="absolute inset-0 bg-black/60" @click="close" />

        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
             w-[520px] max-w-[94vw] bg-[#0b0f12] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            <div class="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <div class="font-bold text-green-300">הזמנה לבית</div>
                <button class="w-9 h-9 rounded-xl bg-white/5 border border-white/10" @click="close">✕</button>
            </div>

            <div class="p-4 space-y-4">
                <div class="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div class="text-xs text-white/50 mb-1">בית</div>
                    <div class="flex items-center justify-between gap-3">
                        <div class="font-extrabold text-white truncate">
                            <span class="mr-1">{{ house?.is_public ? "🌍" : "🏠" }}</span>
                            {{ house?.is_public ? "GIO HOUSE" : (house?.name || "My House") }}
                        </div>
                        <div class="text-xs text-white/50 shrink-0">
                            Role: <span class="text-white/80 font-bold">{{ myRole || "member" }}</span>
                        </div>
                    </div>
                </div>

                <div v-if="house?.is_public" class="rounded-xl border border-green-500/20 bg-green-500/10 p-3">
                    <div class="font-bold text-green-200">זה בית ציבורי 🌍</div>
                    <div class="text-sm text-green-100/70 mt-1">לא צריך קוד הזמנה כדי להצטרף.</div>
                </div>

                <div v-else class="space-y-2">
                    <div class="text-xs text-white/50">קוד הזמנה</div>

                    <div class="flex items-stretch gap-2">
                        <div class="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-white/10
                     font-extrabold tracking-widest text-lg text-center select-all">
                            {{ joinCode || "—" }}
                        </div>

                        <button class="px-4 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/40 transition"
                                @click="copy"
                                :disabled="!joinCode"
                                title="Copy">
                            📋
                        </button>
                    </div>

                    <div class="flex items-center justify-between gap-3 pt-1">
                        <div class="text-xs text-white/40">
                            כל חבר בבית יכול לראות ולהעתיק את הקוד (כמו בית אמיתי 😄)
                        </div>

                        <button v-if="canRegenerate"
                                class="px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-400/30 text-yellow-200
                     hover:border-yellow-400/60 transition disabled:opacity-50"
                                @click="regen"
                                :disabled="loading"
                                title="Regenerate">
                            ♻️ רענן קוד
                        </button>
                    </div>

                    <div v-if="loading" class="text-xs text-white/50">מעדכן…</div>
                </div>

                <div class="pt-2 flex justify-end">
                    <button class="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/40 transition" @click="close">
                        סגור
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useUIStore } from "../stores/ui";
import { useHouseStore } from "../stores/house";

const props = defineProps({
  house: { type: Object, required: true },
});

const emit = defineEmits(["close"]);

const ui = useUIStore();
const houseStore = useHouseStore();

const loading = ref(false);

const myRole = computed(() => props.house?.myRole || "member");
const canRegenerate = computed(() => ["owner", "admin"].includes(myRole.value));

const joinCode = computed(() => props.house?.join_code || "");

function close() {
  emit("close");
}

async function copy() {
  if (!joinCode.value) return;
  try {
    await navigator.clipboard.writeText(joinCode.value);
    ui?.toast?.("📋 קוד הועתק");
  } catch (e) {
    console.error(e);
    ui?.toast?.("לא הצלחתי להעתיק 😅");
  }
}

async function regen() {
  if (!props.house?.id) return;

  loading.value = true;
  try {
    const code = await houseStore.regenerateJoinCode(props.house.id);
    if (code) {
      ui?.toast?.("♻️ קוד חדש נוצר");
      // אופציונלי: להעתיק אוטומטית
      try { await navigator.clipboard.writeText(code); ui?.toast?.("📋 הקוד החדש הועתק"); } catch (_) {}
    }
  } catch (e) {
    console.error(e);
    ui?.toast?.("שגיאה ברענון קוד");
  } finally {
    loading.value = false;
  }
}
</script>
