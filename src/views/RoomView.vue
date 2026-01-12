<template>
    <div class="h-full min-h-0 bg-black text-white flex flex-col overflow-hidden">
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

    async function syncRoom() {
        const houseId = house.currentHouseId;
        if (!houseId) return;

        // החדר מתוך ה-URL
        const roomKey = String(route.params.id || "living");

        // אל תעשה replace ל-router פה אם אתה כבר ב /room/:id
        // (זה יגרום ל-watchers לרוץ שוב ולדרוס)
        // אם יש אצלך router.replace(...) בתוך syncRoom — תמחוק/תנטרל אותו.

        // ✅ קריטי: connect עם roomKey, לא בלי
        const ok = await presence.connect(houseId, roomKey);

        // ✅ קריטי: סטטוס חדר תמיד לפי ה-URL
        if (ok) {
            house.enterRoom?.(roomKey);
            await presence.setRoom(roomKey);
        }
    }


    watch(
        [() => house.currentHouseId, () => roomParam.value],
        async ([houseId, newRoomKey]) => {
            if (!houseId) return;
            await syncRoom(newRoomKey);
        },
        { immediate: true }
    );

    async function goBack() {
        await router.push({ name: "home" });
        await presence.setRoom("living");
    }

</script>
