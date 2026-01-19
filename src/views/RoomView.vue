<template>
    <div class="h-[100dvh] w-full bg-black text-white overflow-hidden flex flex-col">
        <div class="flex-1 min-h-0 grid" :style="gridStyle">
            <div class="min-h-0 overflow-hidden flex">
                <RoomScene class="flex-1 min-h-0 w-full" />
            </div>

            <div class="min-h-0 overflow-hidden border-t border-white/10 bg-black/40 backdrop-blur" :style="chatWrapStyle">
                <ChatPanel class="h-full" />
            </div>
        </div>
    </div>
</template>

<script setup>
    import { ref, onMounted, computed, provide, onBeforeUnmount, watch } from "vue";
    import { useRouter, useRoute } from "vue-router";

    import RoomScene from "../components/RoomScene.vue";
    import ChatPanel from "../components/ChatPanel.vue";

    import { useHouseStore } from "../stores/house";
    import { usePresenceStore } from "../stores/presence";
    import { useRoomsStore } from "../stores/rooms";

    const roomsStore = useRoomsStore();
    const presence = usePresenceStore();
    const router = useRouter();
    const route = useRoute();
    const house = useHouseStore();

    /* ✅ Keyboard using VisualViewport */
    const keyboardPx = ref(0);

    function updateKeyboard() {
        const vv = window.visualViewport;
        if (!vv) { keyboardPx.value = 0; return; }

        // ✅ אם יש zoom (scale != 1) – לא נוגעים בלייאאוט
        if (vv.scale && Math.abs(vv.scale - 1) > 0.01) {
            keyboardPx.value = 0;
            return;
        }

        const px = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        keyboardPx.value = px;
    }


    onMounted(() => {
        updateKeyboard();
        window.visualViewport?.addEventListener("resize", updateKeyboard);
        window.visualViewport?.addEventListener("scroll", updateKeyboard);
    });

    onBeforeUnmount(() => {
        window.visualViewport?.removeEventListener("resize", updateKeyboard);
        window.visualViewport?.removeEventListener("scroll", updateKeyboard);
    });

    /* Split layout controller */
    const chatExpanded = ref(false);

    provide("chatLayout", {
        chatExpanded,
        toggle: () => (chatExpanded.value = !chatExpanded.value),
        collapse: () => (chatExpanded.value = false),
        expandForTyping: () => (chatExpanded.value = true),
        collapseAfterTyping: () => {
            if (keyboardPx.value === 0) chatExpanded.value = false;
        },
    });

    const gridStyle = computed(() => {
        if (keyboardPx.value > 0) return { gridTemplateRows: "20fr 80fr" };
        return { gridTemplateRows: chatExpanded.value ? "35fr 65fr" : "55fr 45fr" };
    });

    const chatWrapStyle = computed(() => ({
        paddingBottom: `${keyboardPx.value}px`,
    }));

    const roomKeyFromRoute = computed(() => String(route.params.id || "living"));

    // debounce-ish: לא להריץ syncRoom במקביל
    let syncing = false;


    async function syncRoom(reason) {
        if (syncing) return;
        syncing = true;
        try {
            const houseId = house.currentHouseId;
            if (!houseId) return;

            await roomsStore.loadForHouse(houseId);

            const roomKey = roomKeyFromRoute.value || "living";

            // presence store יכול להיכשל אם session רגע נופל — אבל לא להפיל UI
            try {
                await presence.setRoom(roomKey);
            } catch (e) {
                console.warn("[RoomView] presence.setRoom failed", reason, e);
            }

            house.enterRoom?.(roomKey);
        } finally {
            syncing = false;
        }
    }

    watch(
        () => route.params.id,
        () => void syncRoom("route"),
        { immediate: true }
    );

    watch(
        () => house.currentHouseId,
        () => void syncRoom("house"),
        { immediate: true }
    );

    async function goBack() {
        await router.push({ name: "home" });
        await presence.setRoom("living");
    }
    async function goLobby() {
        await router.push({ name: "home" });
        await presence.setRoom("living");
    }
</script>
