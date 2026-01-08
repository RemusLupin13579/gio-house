<template>
    <div class="fixed inset-0 z-[9999]">
        <div class="absolute inset-0 bg-black/60" @click="$emit('close')"></div>

        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                w-[520px] max-w-[94vw] bg-[#0b0f12] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            <!-- Header -->
            <div class="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <div class="font-bold text-green-300">Houses</div>
                <button class="w-9 h-9 rounded-xl bg-white/5 border border-white/10" @click="$emit('close')">✕</button>
            </div>

            <div class="p-4 space-y-4">
                <!-- Tabs -->
                <div class="flex gap-2">
                    <button class="flex-1 px-3 py-2 rounded-xl border transition"
                            :class="tab==='switch' ? 'bg-white/5 border-green-500/40' : 'bg-transparent border-white/10 hover:border-green-500/30'"
                            @click="tab='switch'">
                        הבתים שלי
                    </button>
                    <button class="flex-1 px-3 py-2 rounded-xl border transition"
                            :class="tab==='join' ? 'bg-white/5 border-green-500/40' : 'bg-transparent border-white/10 hover:border-green-500/30'"
                            @click="tab='join'">
                        הצטרפות עם קוד
                    </button>
                    <button class="flex-1 px-3 py-2 rounded-xl border transition"
                            :class="tab==='create' ? 'bg-white/5 border-green-500/40' : 'bg-transparent border-white/10 hover:border-green-500/30'"
                            @click="tab='create'">
                        יצירת בית
                    </button>
                </div>

                <!-- SWITCH -->
                <div v-if="tab==='switch'" class="space-y-2">
                    <div class="text-xs text-white/50 flex items-center justify-between">
                        <span>בחר בית פעיל</span>
                        <button class="text-green-300 hover:underline" @click="reload" :disabled="loading">
                            רענן
                        </button>
                    </div>

                    <div v-if="loading" class="text-white/60 text-sm">טוען…</div>

                    <div v-else class="space-y-2 max-h-[320px] overflow-auto pr-1">
                        <button v-for="h in houses"
                                :key="h.id"
                                class="w-full px-3 py-3 rounded-xl border text-right flex items-center justify-between transition"
                                :class="h.id===currentHouseId ? 'bg-green-500/10 border-green-500/40' : 'bg-white/5 border-white/10 hover:border-green-500/30'"
                                @click="selectHouse(h.id)">
                            <div class="flex items-center gap-2">
                                <span class="text-lg">{{ h.is_public ? '🌍' : '🏠' }}</span>
                                <div class="leading-tight">
                                    <div class="font-bold">{{ h.is_public ? 'GIO HOUSE' : h.name }}</div>
                                    <div class="text-xs text-white/50">
                                        {{ h.myRole || 'member' }}
                                    </div>
                                </div>
                            </div>

                            <div class="text-xs text-white/50">
                                {{ h.id === currentHouseId ? 'פעיל' : 'בחר' }}
                            </div>
                        </button>

                        <div v-if="houses.length === 0" class="text-white/60 text-sm">
                            אין לך בתים עדיין (מוזר 😅). לחץ על יצירה / הצטרפות.
                        </div>
                    </div>
                </div>

                <!-- JOIN -->
                <div v-else-if="tab==='join'" class="space-y-3">
                    <div class="text-sm text-white/70">
                        הכנס קוד בית כדי להצטרף.
                    </div>

                    <input v-model.trim="joinCode"
                           class="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 outline-none focus:border-green-500/40"
                           placeholder="קוד (למשל 1111)"
                           inputmode="numeric" />

                    <div v-if="errorMsg" class="text-sm text-red-400">{{ errorMsg }}</div>

                    <button class="w-full px-3 py-2 rounded-xl bg-green-500/20 border border-green-500/40 hover:border-green-500/70 transition disabled:opacity-50"
                            :disabled="loading || !joinCode"
                            @click="doJoin">
                        הצטרף
                    </button>
                </div>

                <!-- CREATE -->
                <div v-else class="space-y-3">
                    <div class="text-sm text-white/70">
                        תן שם לבית. קוד הצטרפות — אופציונלי (אפשר להשאיר ריק).
                    </div>

                    <input v-model.trim="createName"
                           class="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 outline-none focus:border-green-500/40"
                           placeholder="שם הבית" />

                    <input v-model.trim="createCode"
                           class="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 outline-none focus:border-green-500/40"
                           placeholder="קוד הצטרפות (אופציונלי)"
                           inputmode="numeric" />

                    <div v-if="errorMsg" class="text-sm text-red-400">{{ errorMsg }}</div>

                    <button class="w-full px-3 py-2 rounded-xl bg-green-500/20 border border-green-500/40 hover:border-green-500/70 transition disabled:opacity-50"
                            :disabled="loading || !createName"
                            @click="doCreate">
                        {{ loading ? 'יוצר…' : 'צור בית' }}
                    </button>


                    <div class="text-xs text-white/40">
                        טיפ: אם כתבת קוד והוא תפוס — תקבל הודעה ותוכל לבחור אחר.
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div class="px-4 py-3 border-t border-white/10 text-xs text-white/40">
                אחרי Create/Join אנחנו עוברים אוטומטית לבית החדש ומחברים Presence.
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref, onMounted } from "vue";
import { useHouseStore } from "../stores/house";
import { usePresenceStore } from "../stores/presence";

const emit = defineEmits(["close"]);

const house = useHouseStore();
const presence = usePresenceStore();

const tab = ref("switch");
const loading = ref(false);
const errorMsg = ref("");

const joinCode = ref("");
const createName = ref("");
const createCode = ref("");

const houses = computed(() => house.myHouses ?? []);
const currentHouseId = computed(() => house.currentHouseId ?? null);

async function reload() {
  loading.value = true;
  errorMsg.value = "";
  try {
    await house.loadMyHouses();
  } finally {
    loading.value = false;
  }
}

    async function selectHouse(houseId) {
        house.setCurrentHouse(houseId);
        emit("close");
    }

    async function doJoin() {
        loading.value = true;
        errorMsg.value = "";
        try {
            const houseId = await house.joinHouseByCode(joinCode.value);
            await house.loadMyHouses();
            house.setCurrentHouse(houseId);
            emit("close");
        } catch (e) {
            errorMsg.value = e?.message || "Join failed";
        } finally {
            loading.value = false;
        }
    }

    async function doCreate() {
        loading.value = true;
        errorMsg.value = "";
        try {
            const houseId = await house.createHouse(createName.value, createCode.value || null);
            await house.loadMyHouses();
            house.setCurrentHouse(houseId);
            emit("close");
        } catch (e) {
            const msg = e?.message || "Create failed";
            errorMsg.value = msg.includes("houses_join_code_unique")
                ? "הקוד תפוס. תבחר קוד אחר 🙂"
                : msg;
        } finally {
            loading.value = false;
        }
    }






onMounted(async () => {
  // טוענים בתים אם עדיין לא נטענו
  if (!houses.value.length) await reload();
});
</script>
