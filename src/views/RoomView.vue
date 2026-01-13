<template>
    <div class="h-full min-h-0 bg-black text-white flex flex-col overflow-hidden">

        <div class="flex-1 min-h-0 grid" :style="gridStyle">
            <div class="min-h-0 overflow-hidden">
                <RoomScene class="h-full w-full" />
            </div>

            <div class="min-h-0 overflow-hidden border-t border-white/10 bg-black/40 backdrop-blur"
                 :style="chatWrapStyle">
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

    const safeTopStyle = computed(() => ({ paddingTop: "env(safe-area-inset-top)" }));

    /* ✅ Keyboard using VisualViewport */
    const keyboardPx = ref(0);

    function updateKeyboard() {
        const vv = window.visualViewport;
        if (!vv) { keyboardPx.value = 0; return; }
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
        paddingBottom: `calc(env(safe-area-inset-bottom) + ${keyboardPx.value}px)`,
    }));

    const roomParam = computed(() =>
        route.params.key ?? route.params.roomKey ?? route.params.id ?? null
    );

    const activeRoomKeys = computed(() => new Set((roomsStore.activeRooms ?? []).map(r => r.key)));

    const roomUuid = computed(() =>
        house.currentRoom ? roomsStore.getRoomUuidByKey(house.currentRoom) : null
    );

    async function syncRoom() {
        const houseId = house.currentHouseId;
        if (!houseId) return;

        // ✅ 1) תמיד לטעון rooms של הבית לפני שמנסים roomUuid/צ'אט
        await roomsStore.loadForHouse(houseId);

        const roomKey = String(route.params.id || "living");

        const ok = await presence.connect(houseId, roomKey);

        if (ok) {
            house.enterRoom?.(roomKey);
            await presence.setRoom(roomKey);
        }
    }



    watch(
        [() => house.currentHouseId, () => house.currentRoom, () => roomUuid.value, () => roomsStore.loadedForHouseId],
        ([hid, rkey, uuid, loaded]) => {
            console.log("[ChatPanel] room wiring", {
                houseId: hid,
                roomKey: rkey,
                roomUuid: uuid,
                roomsLoadedFor: loaded,
                roomsCount: roomsStore.rooms?.length ?? 0,
            });
        },
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
    watch(
        () => route.params.id,
        () => void syncRoom(),
        { immediate: true }
    );

    watch(
        () => house.currentHouseId,
        () => void syncRoom(),
        { immediate: true }
    );

</script>
