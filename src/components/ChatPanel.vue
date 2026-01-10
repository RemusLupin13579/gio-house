<template>
    <div class="h-full flex flex-col bg-[#0b0f12] text-white">
        <!-- Header -->
        <div class="shrink-0 border-b border-white/10 bg-black/30 backdrop-blur">
            <div class="h-14 px-3 sm:px-4 flex items-center justify-between">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <span class="text-xl">{{ getRoomIcon(house.currentRoom) }}</span>
                    </div>

                    <div class="min-w-0">
                        <div class="flex items-center gap-2 min-w-0">
                            <h3 class="font-extrabold text-sm sm:text-base text-green-200 truncate">
                                {{ currentRoomName }}
                            </h3>

                            <span class="text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-white/70">
                                {{ onlineCount }} online
                            </span>
                        </div>

                        <div class="text-[11px] text-white/45 truncate">
                            {{ house.currentRoom }}
                            <span v-if="roomUuid" class="text-white/25">• {{ roomUuid.slice(0, 8) }}</span>
                        </div>
                    </div>
                </div>

                <button type="button"
                        @pointerdown.stop.prevent
                        @click="toggleChatSize"
                        class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/40 transition
                            active:scale-[0.98] flex items-center justify-center"
                        :title="chatExpanded ? 'הקטן צ׳אט' : 'הגדל צ׳אט'">
                    <span class="text-lg">{{ chatExpanded ? "▾" : "▴" }}</span>
                </button>

            </div>
        </div>

        <!-- Messages -->
        <div ref="messagesContainer" class="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3 space-y-3">
            <div v-if="chatLoading" class="text-center text-white/60 py-6">
                <div class="text-3xl mb-2">⏳</div>
                טוען את הצ׳אט…
            </div>

            <div v-else-if="chatError" class="text-center text-red-300 py-6">
                <div class="text-3xl mb-2">💥</div>
                שגיאה בצ׳אט: {{ chatError.message || chatError }}
            </div>

            <template v-else>
                <div v-for="msg in currentRoomMessages" :key="msg.id" class="flex items-start gap-3">
                    <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden flex items-center justify-center
                   border border-white/10 flex-shrink-0 shadow-sm"
                         :style="{
              borderColor: msg.userColor,
              background: `linear-gradient(135deg, ${msg.userColor}22, ${msg.userColor}44)`,
            }">
                        <span class="text-base sm:text-lg font-extrabold">
                            {{ msg.userInitial }}
                        </span>
                    </div>

                    <div class="flex-1 min-w-0">
                        <div class="flex items-baseline gap-2">
                            <span class="font-extrabold text-xs sm:text-sm truncate" :style="{ color: msg.userColor }">
                                {{ msg.userName }}
                            </span>
                            <span class="text-white/35 text-[11px]">
                                {{ msg.time }}
                            </span>
                        </div>

                        <div class="mt-1.5 bg-white/5 border border-white/10 rounded-2xl px-3 py-2 text-sm leading-relaxed"
                             :style="{ borderLeft: `3px solid ${msg.userColor}` }">
                            {{ msg.text }}
                        </div>
                    </div>
                </div>

                <div v-if="currentRoomMessages.length === 0" class="text-center text-white/55 py-14">
                    <div class="text-5xl mb-3">💬</div>
                    <p class="text-base font-bold text-green-200">אין הודעות בחדר הזה עדיין</p>
                    <p class="text-sm mt-1 text-white/45">תהיה הראשון לשלוח 🚀</p>
                </div>
            </template>
        </div>

        <!-- Input -->
        <div class="shrink-0 border-t border-white/10 bg-black/25 backdrop-blur" :style="safeBottomPad">
            <div v-if="!roomReady" class="px-4 pt-3 text-xs text-yellow-300">
                טוען זיהוי חדר… (roomUuid)
                <span v-if="roomsError" class="text-red-300"> — שגיאה: {{ roomsError.message || roomsError }}</span>
            </div>

            <form @submit.prevent="sendMessage" class="p-3 sm:p-4 flex gap-2">
                <input ref="inputEl"
                       :disabled="!roomReady"
                       id="chat-message"
                       name="chat-message"
                       v-model="newMessage"
                       type="text"
                       :placeholder="roomReady ? 'כתוב הודעה...' : 'טוען חדר…'"
                       class="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3
                 text-white placeholder-white/35 outline-none
                 focus:border-green-500/40 focus:ring-2 focus:ring-green-500/10 transition"
                       @keydown.enter.prevent="sendMessage" />

                <button type="submit"
                        :disabled="!roomReady || !newMessage.trim()"
                        class="px-5 sm:px-6 py-3 rounded-xl font-extrabold
                 bg-green-500 text-black
                 hover:bg-green-400 disabled:opacity-30 disabled:cursor-not-allowed
                 transition active:scale-[0.98]">
                    שלח
                </button>
            </form>
        </div>
    </div>
</template>

<script setup>
    import { ref, computed, nextTick, watch, onMounted, onUnmounted, inject, onErrorCaptured } from "vue";
    import { useHouseStore } from "../stores/house";
    import { useUserStore } from "../stores/users";
    import { useMessagesStore } from "../stores/messages";
    import { useRoomsStore } from "../stores/rooms";

    const house = useHouseStore();
    const userStore = useUserStore();
    const messagesStore = useMessagesStore();
    const roomsStore = useRoomsStore();

    const newMessage = ref("");
    const messagesContainer = ref(null);
    const inputEl = ref(null);

    /* ✅ Hook to RoomView layout controller */
    const chatLayout = inject("chatLayout", null);
    const chatExpanded = computed(() => chatLayout?.chatExpanded?.value ?? false);

    /* Safe bottom */
    const safeBottomPad = computed(() => ({
        paddingBottom: "env(safe-area-inset-bottom)",
    }));

    /* Icons */
    function getRoomIcon(roomId) {
        const icons = {
            living: "🛋️",
            gaming: "🎮",
            bathroom: "🚿",
            study: "📚",
            cinema: "🎬",
            afk: "😴",
        };
        return icons[roomId] || "🚪";
    }

    /* UUID */
    const roomUuid = computed(() => {
        const key = house.currentRoom;
        if (!key) return null;
        return roomsStore.getRoomUuidByKey(key);
    });
    const roomReady = computed(() => !!roomUuid.value);
    const roomsError = computed(() => roomsStore.error);

    /* Derived */
    const currentRoomName = computed(() => {
        return house.rooms?.[house.currentRoom]?.name || "חדר";
    });
    const onlineCount = computed(() => userStore.usersInRoom(house.currentRoom).length);
    const currentRoomMessages = computed(() => {
        if (!roomUuid.value) return [];
        return messagesStore.messagesInRoom(roomUuid.value);
    });

    /* ✅ Keep keyboard open on expand/shrink */
    async function toggleChatSize() {
        const wasTyping = document.activeElement === inputEl.value;

        if (chatLayout?.toggle) chatLayout.toggle();

        // אם המשתמש היה באמצע הקלדה — נחזיר פוקוס מיד (כדי שלא יסגור מקלדת)
        if (wasTyping) {
            await nextTick();
            inputEl.value?.focus?.({ preventScroll: true });
        }
    }

    /* Watchers (existing robust sync) */
    const chatLoading = ref(false);
    const chatError = ref(null);
    let activeUuid = null;
    let runToken = 0;

    async function ensureRoomsLoaded() {
        if (!house.currentHouseId) return false;
        await roomsStore.loadForHouse(house.currentHouseId);
        return true;
    }

    async function syncChat() {
        const token = ++runToken;
        chatError.value = null;
        chatLoading.value = true;

        try {
            const ok = await ensureRoomsLoaded();
            if (!ok) return;
            if (token !== runToken) return;

            const uuid = roomUuid.value;
            if (!uuid) return;

            if (activeUuid && activeUuid !== uuid) {
                try { await messagesStore.unsubscribe(activeUuid); } catch (e) { console.warn("[ChatPanel] unsubscribe failed:", e); }
            }
            if (token !== runToken) return;

            if (activeUuid !== uuid) {
                await messagesStore.load(uuid);
                messagesStore.subscribe(uuid);
                activeUuid = uuid;
            }

            scrollToBottom();
        } catch (e) {
            chatError.value = e;
            console.error("[ChatPanel] syncChat failed:", e);
        } finally {
            if (token === runToken) chatLoading.value = false;
        }
    }

    /* Watch */
    watch(
        [() => house.currentHouseId, () => house.currentRoom],
        async ([houseId, roomKey], [oldHouseId, oldRoomKey]) => {
            if (!houseId || !roomKey) return;

            await roomsStore.loadForHouse(houseId);

            const newUuid = roomsStore.getRoomUuidByKey(roomKey);
            const oldUuid = oldRoomKey ? roomsStore.getRoomUuidByKey(oldRoomKey) : null;

            if (oldUuid && oldUuid !== newUuid) {
                await messagesStore.unsubscribe(oldUuid);
            }

            if (!newUuid) return;

            await messagesStore.load(newUuid);
            messagesStore.subscribe(newUuid);
            activeUuid = newUuid;
            scrollToBottom();
        },
        { immediate: true }
    );

    /* Actions */
    async function sendMessage() {
        const text = newMessage.value.trim();
        if (!text) return;
        if (!roomUuid.value) return;

        await messagesStore.send(roomUuid.value, text);
        newMessage.value = "";
        scrollToBottom();
    }

    function scrollToBottom() {
        nextTick(() => {
            if (messagesContainer.value) {
                messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
            }
        });
    }

    onMounted(() => {
        // watcher handles sync
    });

    onUnmounted(async () => {
        if (activeUuid) {
            try { await messagesStore.unsubscribe(activeUuid); } catch (e) { console.warn("[ChatPanel] unsubscribe onUnmount failed:", e); }
        }
    });

    onErrorCaptured((err, instance, info) => {
        console.error("[ChatPanel] errorCaptured:", err, info);
        chatError.value = err;
        chatLoading.value = false;
        return false;
    });
</script>

<style scoped>
    .flex-1::-webkit-scrollbar {
        width: 10px;
    }

    .flex-1::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.03);
    }

    .flex-1::-webkit-scrollbar-thumb {
        background: rgba(34, 197, 94, 0.25);
        border: 2px solid rgba(0, 0, 0, 0.6);
        border-radius: 999px;
    }

        .flex-1::-webkit-scrollbar-thumb:hover {
            background: rgba(34, 197, 94, 0.35);
        }
</style>
