<template>
    <div class="min-h-screen bg-black text-white flex flex-col overflow-hidden"
         @touchstart="handleTouchStart"
         @touchmove="handleTouchMove"
         @touchend="handleTouchEnd">
        <div class="absolute top-3 left-3 z-30" :style="safeTopStyle">
            <button @click="goBack"
                    class="px-4 py-2 bg-black/50 backdrop-blur border border-white/10 rounded-xl
               text-green-300 hover:border-green-400/50 transition-all flex items-center gap-2
               shadow-lg active:scale-[0.99]">
                <span class="text-xl">←</span>
                <span class="font-bold">חזרה</span>
            </button>
        </div>

        <div class="flex-1 min-h-0 grid" :style="gridStyle">
            <div class="min-h-0 overflow-hidden">
                <RoomScene class="h-full w-full" />
            </div>

            <div class="min-h-0 overflow-hidden border-t border-white/10 bg-black/40 backdrop-blur" :style="safeBottomStyle">
                <ChatPanel class="h-full" />
            </div>
        </div>
    </div>
</template>

<script setup>
    import { ref, onMounted, computed, provide } from "vue";
    import { useRouter, useRoute } from "vue-router";

    import RoomScene from "../components/RoomScene.vue";
    import ChatPanel from "../components/ChatPanel.vue";

    import { useHouseStore } from "../stores/house";
    import { usePresenceStore } from "../stores/presence";
    import { watch } from "vue";

    const presence = usePresenceStore();
    const router = useRouter();
    const route = useRoute();
    const house = useHouseStore();

    /* Safe-area */
    const safeTopStyle = computed(() => ({ paddingTop: "env(safe-area-inset-top)" }));
    const safeBottomStyle = computed(() => ({ paddingBottom: "env(safe-area-inset-bottom)" }));

    /* Split layout controller (for ChatPanel expand/collapse) */
    const chatExpanded = ref(false);

    provide("chatLayout", {
        chatExpanded,
        toggle: () => (chatExpanded.value = !chatExpanded.value),
        collapse: () => (chatExpanded.value = false),
    });

    const gridStyle = computed(() => ({
        gridTemplateRows: chatExpanded.value ? "35fr 65fr" : "55fr 45fr",
    }));

    /**
     * ✅ CRITICAL:
     * RoomView לא עושה connect() בכלל.
     * AppShell אחראי לחיבור presence לבית הנוכחי.
     * כאן רק מעדכנים חדר.
     */
    async function syncRoom(roomKey) {
        if (roomKey && house.rooms[roomKey]) {
            house.enterRoom(roomKey);
        }
        await presence.setRoom(roomKey);
    }

    watch(
        () => route.params.id,
        async (newRoom) => {
            await syncRoom(newRoom);
        },
        { immediate: true }
    );

    async function goBack() {
        await presence.setRoom("living");
        router.push("/");
    }

    /* Swipe back */
    const touchStartX = ref(0);
    const touchStartY = ref(0);
    const touchEndX = ref(0);
    const touchEndY = ref(0);

    function handleTouchStart(e) {
        touchStartX.value = e.touches[0].clientX;
        touchStartY.value = e.touches[0].clientY;
    }
    function handleTouchMove(e) {
        touchEndX.value = e.touches[0].clientX;
        touchEndY.value = e.touches[0].clientY;
    }
    function handleTouchEnd() {
        const diffX = touchEndX.value - touchStartX.value;
        const diffY = touchEndY.value - touchStartY.value;
        if (Math.abs(diffX) > Math.abs(diffY) && diffX > 100) goBack();
    }

    onMounted(async () => {
        // direct entry support
        await syncRoom(route.params.id);
    });
</script>
