<template>
    <div class="h-screen flex flex-col bg-black text-white"
         @touchstart="handleTouchStart"
         @touchmove="handleTouchMove"
         @touchend="handleTouchEnd">

        <!-- כפתור חזרה -->
        <div class="absolute top-3 left-3 z-10">
            <button @click="goBack"
                    class="px-4 py-2 bg-gray-800/80 backdrop-blur border-2 border-green-500/50 rounded-lg text-green-400 hover:border-green-400 transition-all flex items-center gap-2 shadow-lg">
                <span class="text-xl">←</span>
                <span class="font-bold">חזרה</span>
            </button>
        </div>

        <!-- אזור האינטראקציה בחדר -->
        <div class="flex-1 flex flex-col">
            <RoomScene />
        </div>

        <!-- פאנל הצ'אט -->
        <ChatPanel />
    </div>
</template>

<script setup>
    import { ref, onMounted, onUnmounted, watchEffect } from 'vue'
    import { useRouter, useRoute } from 'vue-router'
    import RoomScene from '../components/RoomScene.vue'
    import ChatPanel from '../components/ChatPanel.vue'
    import { useHouseStore } from '../stores/house'
    import { useMessagesStore } from "../stores/messages";
    import { useRoomsStore } from "../stores/rooms";
    import { usePresenceStore } from "../stores/presence";
    import { watch } from "vue";

    const presence = usePresenceStore();
    const router = useRouter();
    const route = useRoute();
    const house = useHouseStore();

    const roomsStore = useRoomsStore();
    const messagesStore = useMessagesStore();

    async function enterAndListen(roomName) {
        // 1) UI שלך עדיין עובד לפי "living/gaming"
        if (roomName) house.enterRoom(roomName);
        presence.setRoom(roomName);
        // 2) טוענים rooms פעם אחת
        await roomsStore.load();

        // 3) ממירים ל-UUID בשביל DB/Realtime
        const roomUuid = roomsStore.getRoomUuidByName(roomName);
        if (!roomUuid) {
            console.error("Unknown room name:", roomName);
            return;
        }
        
    }

    function stopListening(roomName) {
        const roomUuid = roomsStore.getRoomUuidByName(roomName);
        if (roomUuid) messagesStore.unsubscribe(roomUuid);
    }

    const touchStartX = ref(0)
    const touchStartY = ref(0)
    const touchEndX = ref(0)
    const touchEndY = ref(0)

    watch(
        () => route.params.id,
        async (newRoom, oldRoom) => {
            if (oldRoom) stopListening(oldRoom);
            await presence.connect();
            await presence.setRoom(newRoom);
            await enterAndListen(newRoom);
        },
        { immediate: true }
    );

    async function goBack() {
        await presence.connect();
        await presence.setRoom("living"); // הבית = סלון
        router.push("/");
    }



    function handleTouchStart(e) {
        touchStartX.value = e.touches[0].clientX
        touchStartY.value = e.touches[0].clientY
    }

    function handleTouchMove(e) {
        touchEndX.value = e.touches[0].clientX
        touchEndY.value = e.touches[0].clientY
    }

    function handleTouchEnd() {
        const diffX = touchEndX.value - touchStartX.value
        const diffY = touchEndY.value - touchStartY.value

        if (Math.abs(diffX) > Math.abs(diffY) && diffX > 100) {
            goBack()
        }
    }

    async function handlePopState() {
        await presence.connect();
        await presence.setRoom("living");
        router.push("/");
    }


    onMounted(async () => {
        const roomName = route.params.id;

        if (roomName && house.rooms[roomName]) {
            house.enterRoom(roomName);
        }
        await presence.connect();
        await presence.setRoom(route.params.id);
    });

    

    onUnmounted(() => {
        const roomName = route.params.id;
        const roomUuid = roomsStore.getRoomUuidByName(roomName);
        if (roomUuid) messagesStore.unsubscribe(roomUuid);
    });


</script>

<style scoped>
    .h-screen {
        touch-action: pan-y;
        overscroll-behavior: none;
    }
</style>