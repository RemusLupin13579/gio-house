<template>
    <div class="fixed inset-0 z-[9999]">
        <div class="absolute inset-0 bg-black/60" @click="closeModal"></div>

        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                w-[520px] max-w-[94vw] bg-[#0b0f12] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

            <div class="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <div class="font-bold text-green-300">Houses</div>
                <button class="w-9 h-9 rounded-xl bg-white/5 border border-white/10" @click="closeModal">✕</button>
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
                        הצטרפות
                    </button>
                    <button class="flex-1 px-3 py-2 rounded-xl border transition"
                            :class="tab==='create' ? 'bg-white/5 border-green-500/40' : 'bg-transparent border-white/10 hover:border-green-500/30'"
                            @click="tab='create'">
                        יצירה
                    </button>
                </div>

                <div v-if="tab==='switch'" class="space-y-2">
                    <div class="text-xs text-white/50 flex items-center justify-between">
                        <span>בחר בית פעיל</span>
                        <button class="text-green-300 hover:underline" @click="reload" :disabled="loading">רענן</button>
                    </div>

                    <div v-if="loading" class="text-white/60 text-sm">טוען…</div>
                    <div v-else class="space-y-2 max-h-[320px] overflow-auto pr-1">
                        <button v-for="h in houses" :key="h.id"
                                class="w-full px-3 py-3 rounded-xl border text-right flex items-center justify-between transition"
                                :class="h.id===currentHouseId ? 'bg-green-500/10 border-green-500/40' : 'bg-white/5 border-white/10'"
                                @click="selectHouse(h.id)">
                            <div class="flex items-center gap-2">
                                <span>{{ h.is_public ? '🌍' : '🏠' }}</span>
                                <div class="font-bold">{{ h.is_public ? 'GIO HOUSE' : h.name }}</div>
                            </div>
                            <div class="text-xs text-white/50">{{ h.id === currentHouseId ? 'פעיל' : 'בחר' }}</div>
                        </button>
                    </div>
                </div>

                <div v-else-if="tab==='join'" class="space-y-3">
                    <input v-model.trim="joinCode" class="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 outline-none focus:border-green-500/40" placeholder="קוד בית" />
                    <button class="w-full px-3 py-2 rounded-xl bg-green-500/20 border border-green-500/40" @click="doJoin" :disabled="loading">הצטרף</button>
                </div>

                <div v-else class="space-y-3">
                    <input v-model.trim="createName" class="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 outline-none focus:border-green-500/40" placeholder="שם הבית" />
                    <button class="w-full px-3 py-2 rounded-xl bg-green-500/20 border border-green-500/40" @click="doCreate" :disabled="loading">צור בית</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { ref, computed, onMounted, onUnmounted } from 'vue';
    import { useHouseStore } from '../stores/house';

    const emit = defineEmits(['close']);
    const houseStore = useHouseStore();

    const tab = ref('switch');
    const loading = ref(false);
    const joinCode = ref("");
    const createName = ref("");

    const houses = computed(() => houseStore.myHouses || []);
    const currentHouseId = computed(() => houseStore.currentHouseId);

    // הדגל שימנע סגירה כפולה או פתיחה וסגירה מיידית
    let pushedToHistory = false;

    function handlePopState(event) {
        // אם חזרנו אחורה והסטייט שלנו כבר לא שם - סוגרים
        emit('close');
    }

    function closeModal() {
        // אם אנחנו אלו שהוספנו סטייט להיסטוריה, נחזור אחורה
        if (pushedToHistory) {
            window.history.back();
        } else {
            emit('close');
        }
    }

    async function selectHouse(id) {
        houseStore.setCurrentHouse(id);
        closeModal();
    }

    async function doJoin() {
        loading.value = true;
        try {
            const id = await houseStore.joinHouseByCode(joinCode.value);
            await houseStore.loadMyHouses();
            houseStore.setCurrentHouse(id);
            closeModal();
        } catch (e) { alert("Error joining"); } finally { loading.value = false; }
    }

    async function doCreate() {
        loading.value = true;
        try {
            const id = await houseStore.createHouse(createName.value);
            await houseStore.loadMyHouses();
            houseStore.setCurrentHouse(id);
            closeModal();
        } catch (e) { alert("Error creating"); } finally { loading.value = false; }
    }

    async function reload() {
        loading.value = true;
        await houseStore.loadMyHouses();
        loading.value = false;
    }

    onMounted(() => {
        // הדיליי הקטן הזה (10ms) הוא קריטי!
        // הוא נותן לראוטר לסיים את ה-Navigation Guard שלו לפני שאנחנו מזריקים סטייט משלנו
        setTimeout(() => {
            window.history.pushState({ modal: 'houseSwitcher' }, '');
            window.addEventListener('popstate', handlePopState);
            pushedToHistory = true;
        }, 50);

        if (!houses.value.length) reload();
    });

    onUnmounted(() => {
        window.removeEventListener('popstate', handlePopState);
    });
</script>