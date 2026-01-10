<template>
    <div class="fixed inset-0 z-[9999]">
        <div class="absolute inset-0 bg-black/60" @click="closeSelf"></div>

        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                w-[520px] max-w-[94vw] bg-[#0b0f12] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            <div class="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <div class="font-bold text-green-300">Houses</div>
                <button class="w-9 h-9 rounded-xl bg-white/5 border border-white/10" @click="closeSelf">✕</button>
            </div>

            <div class="p-4 space-y-4">
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
                            אין לך בתים עדיין.
                        </div>
                    </div>
                </div>

                <div v-else-if="tab==='join'" class="space-y-3">
                    <input v-model.trim="joinCode" class="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 outline-none focus:border-green-500/40" placeholder="קוד בית" />
                    <button class="w-full px-3 py-2 rounded-xl bg-green-500/20 border border-green-500/40" :disabled="loading" @click="doJoin">הצטרף</button>
                </div>

                <div v-else class="space-y-3">
                    <input v-model.trim="createName" class="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 outline-none focus:border-green-500/40" placeholder="שם הבית" />
                    <button class="w-full px-3 py-2 rounded-xl bg-green-500/20 border border-green-500/40" :disabled="loading" @click="doCreate">צור בית</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { computed, ref, onMounted, onUnmounted } from "vue";
    import { useHouseStore } from "../stores/house";

    const emit = defineEmits(["close"]);
    const house = useHouseStore();

    const tab = ref("switch");
    const loading = ref(false);
    const errorMsg = ref("");
    const joinCode = ref("");
    const createName = ref("");
    const createCode = ref("");

    const houses = computed(() => house.myHouses ?? []);
    const currentHouseId = computed(() => house.currentHouseId ?? null);

    // פונקציה שנקראת כשמזהים חזרה אחורה בדפדפן
    function handlePopState() {
        emit("close");
    }

    // פונקציית סגירה אחידה
    function closeSelf() {
        // אם הסטייט הנוכחי הוא שלנו, נלך אחורה בהיסטוריה. זה יפעיל את handlePopState
        if (window.history.state?.modal === "houseSwitcher") {
            window.history.back();
        } else {
            // למקרה חירום שבו הסטייט לא נדחף כראוי
            emit("close");
        }
    }

    async function reload() {
        loading.value = true;
        try { await house.loadMyHouses(); } finally { loading.value = false; }
    }

    async function selectHouse(houseId) {
        house.setCurrentHouse(houseId);
        closeSelf();
    }

    async function doJoin() {
        loading.value = true;
        try {
            const id = await house.joinHouseByCode(joinCode.value);
            await house.loadMyHouses();
            house.setCurrentHouse(id);
            closeSelf();
        } catch (e) { errorMsg.value = "Join failed"; } finally { loading.value = false; }
    }

    async function doCreate() {
        loading.value = true;
        try {
            const id = await house.createHouse(createName.value, createCode.value);
            await house.loadMyHouses();
            house.setCurrentHouse(id);
            closeSelf();
        } catch (e) { errorMsg.value = "Create failed"; } finally { loading.value = false; }
    }

    onMounted(async () => {
        // דוחפים סטייט חדש להיסטוריה כדי ש-Back לא ייצא מהדף אלא רק יחזור לסטייט הקודם
        window.history.pushState({ modal: "houseSwitcher" }, "");
        window.addEventListener("popstate", handlePopState);

        if (!houses.value.length) await reload();
    });

    onUnmounted(() => {
        window.removeEventListener("popstate", handlePopState);
    });
</script>