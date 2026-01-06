<template>
    <div class="h-[45vh] bg-black border-t-2 border-green-500 flex flex-col shadow-2xl">
        <!-- כותרת החדר -->
        <div class="bg-gradient-to-r from-gray-900 to-black px-4 py-3 border-b border-green-500/30">
            <div class="flex items-center justify-between">
                <div>
                    <h3 class="text-green-400 font-bold text-lg flex items-center gap-2">
                        <span class="text-2xl">{{ getRoomIcon(house.currentRoom) }}</span>
                        {{ currentRoomName }}
                    </h3>
                    <p class="text-green-600 text-xs mt-0.5">{{ onlineCount }} בחדר</p>
                </div>
                <button @click="toggleChatSize"
                        class="text-green-500 hover:text-green-400 text-xl px-2 transition-all">
                    {{ isExpanded ? '🔽' : '🔼' }}
                </button>
            </div>
        </div>

        <!-- רשימת הודעות -->
        <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 space-y-4">
            <!-- הודעות מסוננות לפי החדר הנוכחי -->
            <div v-for="msg in currentRoomMessages"
                 :key="msg.id"
                 class="flex items-start gap-3 animate-fadeIn">
                <!-- אווטר -->
                <div class="w-10 h-10 rounded-full flex items-center justify-center text-xl border-3 flex-shrink-0 shadow-lg"
                     :style="{
                         borderColor: msg.userColor,
                         background: `linear-gradient(135deg, ${msg.userColor}22, ${msg.userColor}44)`,
                         boxShadow: `0 0 15px ${msg.userColor}44`
                     }">
                    {{ msg.userInitial }}
                </div>

                <!-- תוכן ההודעה -->
                <div class="flex-1">
                    <div class="flex items-baseline gap-2">
                        <span class="font-bold text-sm"
                              :style="{ color: msg.userColor }">
                            {{ msg.userName }}
                        </span>
                        <span class="text-gray-500 text-xs">{{ msg.time }}</span>
                    </div>
                    <p class="text-white text-sm mt-1.5 leading-relaxed bg-gray-900/50 px-3 py-2 rounded-lg border-l-2"
                       :style="{ borderColor: msg.userColor }">
                        {{ msg.text }}
                    </p>
                </div>
            </div>

            <!-- הודעה כשאין הודעות בחדר -->
            <div v-if="currentRoomMessages.length === 0" class="text-center text-green-600 py-16">
                <div class="text-5xl mb-3">💬</div>
                <p class="text-lg">אין הודעות בחדר הזה עדיין...</p>
                <p class="text-sm mt-2 text-green-700">תהיה הראשון לשלוח! 🚀</p>
            </div>
        </div>

        <!-- שדה קלט -->
        <div class="p-4 bg-gradient-to-r from-gray-900 to-black border-t border-green-500/30">
            <form @submit.prevent="sendMessage" class="flex gap-3">
                <input v-model="newMessage"
                       type="text"
                       placeholder="כתוב הודעה..."
                       class="flex-1 bg-black border-2 border-green-500/50 rounded-xl px-4 py-3 text-white placeholder-green-700 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-green-400 transition-all"
                       @keydown.enter.prevent="sendMessage" />
                <button type="submit"
                        :disabled="!newMessage.trim()"
                        class="bg-gradient-to-r from-green-500 to-green-600 text-black px-8 py-3 rounded-xl font-bold hover:from-green-400 hover:to-green-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-green-500/50 active:scale-95">
                    שלח
                </button>
            </form>
        </div>
    </div>
</template>

<script setup>
    import { ref, computed, nextTick, watch } from 'vue'
    import { useHouseStore } from '../stores/house'
    import { useUserStore } from '../stores/users'
    import { useRoute } from "vue-router";
    import { useMessagesStore } from "../stores/messages";
    import { useRoomsStore } from "../stores/rooms";
    import { onMounted, onUnmounted } from "vue";



    const route = useRoute();
    const messagesStore = useMessagesStore();
    const roomsStore = useRoomsStore();
    const house = useHouseStore()
    const userStore = useUserStore()

    const newMessage = ref('')
    const messagesContainer = ref(null)
    const isExpanded = ref(false)

    const roomUuid = computed(() => roomsStore.getRoomUuidByName(house.currentRoom));
    watch(
        roomUuid,
        async (newUuid, oldUuid) => {
            if (oldUuid) {
                await messagesStore.unsubscribe(oldUuid);
            }

            if (!newUuid) return;

            try {
                await messagesStore.load(newUuid);
                messagesStore.subscribe(newUuid);
                scrollToBottom();
            } catch (e) {
                console.error("Failed to load/subscribe messages:", e);
            }
        },
        { immediate: true }
    );

    // שם החדר הנוכחי
    const currentRoomName = computed(() => {
        return house.rooms[house.currentRoom]?.name || 'חדר'
    })

    // כמה אנשים בחדר
    const onlineCount = computed(() => {
        return userStore.usersInRoom(house.currentRoom).length
    })

    

    const currentRoomMessages = computed(() => {
        if (!roomUuid.value) return [];
        return messagesStore.messagesInRoom(roomUuid.value);
    });




    // אייקון החדר
    function getRoomIcon(roomId) {
        const icons = {
            living: '🛋️',
            gaming: '🎮',
            bathroom: '🚿',
            study: '📚',
            cinema: '🎬'
        }
        return icons[roomId] || '🚪'
    }

    // שליחת הודעה
    async function sendMessage() {
        if (!newMessage.value.trim()) return;
        if (!roomUuid.value) return;

        try {
            await messagesStore.send(roomUuid.value, newMessage.value.trim());
            newMessage.value = "";
            scrollToBottom();
        } catch (e) {
            console.error(e);
            alert(e.message ?? "Failed to send");
        }
    }




    // הגדלה/הקטנה של הצ'אט
    function toggleChatSize() {
        isExpanded.value = !isExpanded.value
        // אפשר להוסיף לוגיקה לשינוי גובה בעתיד
    }

    // גלילה לתחתית
    function scrollToBottom() {
        nextTick(() => {
            if (messagesContainer.value) {
                messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
            }
        })
    }

    // גלילה אוטומטית כשמוסיפים הודעה או משנים חדר
    watch([currentRoomMessages, () => house.currentRoom], () => {
        scrollToBottom()
    }, { deep: true })

    
    onMounted(async () => {
        try {
            await roomsStore.load();
            console.log("rooms loaded:", roomsStore.rooms.map(r => ({ name: r.name, id: r.id })));
        } catch (e) {
            console.error("failed to load rooms:", e);
        }
        console.log("roomName:", house.currentRoom, "roomUuid:", roomUuid.value);

    });

    onUnmounted(async () => {
        if (roomUuid.value) {
            await messagesStore.unsubscribe(roomUuid.value);
        }
    });

</script>

<style scoped>
    /* אנימציה להודעות חדשות */
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }

        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .animate-fadeIn {
        animation: fadeIn 0.4s ease-out;
    }

    /* גלילה מעוצבת */
    .overflow-y-auto {
        scrollbar-width: thin;
        scrollbar-color: #10b981 #000;
    }

        .overflow-y-auto::-webkit-scrollbar {
            width: 8px;
        }

        .overflow-y-auto::-webkit-scrollbar-track {
            background: #000;
            border-radius: 4px;
        }

        .overflow-y-auto::-webkit-scrollbar-thumb {
            background: linear-gradient(to bottom, #10b981, #059669);
            border-radius: 4px;
        }

            .overflow-y-auto::-webkit-scrollbar-thumb:hover {
                background: linear-gradient(to bottom, #34d399, #10b981);
            }
</style>