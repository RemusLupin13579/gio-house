<template>
    <div class="h-full flex flex-col bg-[#0b0f12] text-white">
        <!-- Header -->
        <div class="shrink-0 border-b border-white/10 bg-black/30 backdrop-blur">
            <div class="h-14 px-3 sm:px-4 flex items-center justify-between">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <span class="text-xl">{{ currentRoomIcon }}</span>
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
                        @pointerdown.stop.prevent="onExpandPointerDown"
                        @click="toggleChatSize"
                        class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/40 transition
                 active:scale-[0.98] flex items-center justify-center"
                        :title="chatExpanded ? 'הקטן צ׳אט' : 'הגדל צ׳אט'">
                    <span class="text-lg">{{ chatExpanded ? "▾" : "▴" }}</span>
                </button>
            </div>
        </div>

        <!-- Messages -->
        <div ref="messagesContainer"
             class="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3 space-y-3"
             @scroll.passive="updateScrollPosition">
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
                    <!-- Avatar -->
                    <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden flex items-center justify-center
                   border border-white/10 flex-shrink-0 shadow-sm"
                         :style="{
              borderColor: msg.userColor,
              background: `linear-gradient(135deg, ${msg.userColor}22, ${msg.userColor}44)`,
            }">
                        <img v-if="msg.avatarUrl"
                             :src="msg.avatarUrl"
                             alt="avatar"
                             class="w-full h-full object-cover"
                             @load="onAvatarLoad" />
                        <span v-else class="text-base sm:text-lg font-extrabold">
                            {{ msg.userInitial }}
                        </span>
                    </div>

                    <!-- Bubble -->
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

                <!-- ✅ העוגן שמבטיח גלילה לתחתית -->
                <div ref="bottomEl" class="h-1"></div>
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
    const bottomEl = ref(null);
    const inputEl = ref(null);

    const chatLayout = inject("chatLayout", null);
    const chatExpanded = computed(() => chatLayout?.chatExpanded?.value ?? false);

    const safeBottomPad = computed(() => ({
        paddingBottom: "env(safe-area-inset-bottom)",
    }));

    const FALLBACK_ICONS = {
        living: "🛋️",
        gaming: "🎮",
        bathroom: "🚿",
        study: "📚",
        cinema: "🎬",
        afk: "😴",
    };

    const currentRoomMeta = computed(() => {
        const key = house.currentRoom;
        if (!key) return null;
        return roomsStore.byKey?.[key] ?? null;
    });

    const currentRoomIcon = computed(() => {
        const key = house.currentRoom;
        return currentRoomMeta.value?.icon || FALLBACK_ICONS[key] || "🚪";
    });

    const currentRoomName = computed(() => {
        const key = house.currentRoom;
        return currentRoomMeta.value?.name || key || "חדר";
    });

    /* Scroll state */
    const isNearBottom = ref(true);
    function updateScrollPosition() {
        const el = messagesContainer.value;
        if (!el) return;
        const threshold = 140;
        isNearBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    }

    function raf2() {
        return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }

    async function scrollToBottom(force = false) {
        await nextTick();
        await raf2();

        if (!force && !isNearBottom.value) return;

        // ✅ הכי יציב: scrollIntoView על עוגן
        bottomEl.value?.scrollIntoView?.({ block: "end" });
        isNearBottom.value = true;
    }

    function onAvatarLoad() {
        // אם תמונות משנות גובה אחרי paint – נשמור אותך בתחתית רק אם היית שם
        void scrollToBottom(false);
    }

    /* Keyboard (רק בשביל UX של blur) */
    const keyboardPx = ref(0);
    function updateKeyboard() {
        const vv = window.visualViewport;
        if (!vv) {
            keyboardPx.value = 0;
            return;
        }
        const px = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        keyboardPx.value = px;
    }
    const keyboardOpen = computed(() => keyboardPx.value > 0);

    function onExpandPointerDown() {
        if (!keyboardOpen.value && document.activeElement === inputEl.value) {
            inputEl.value?.blur?.();
        }
    }

    async function toggleChatSize() {
        const wasTyping = document.activeElement === inputEl.value;
        const kbWasOpen = keyboardOpen.value;

        chatLayout?.toggle?.();
        await nextTick();

        if (kbWasOpen && wasTyping) {
            inputEl.value?.focus?.({ preventScroll: true });
        }
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
    const onlineCount = computed(() => userStore.usersInRoom(house.currentRoom).length);
    const currentRoomMessages = computed(() => {
        if (!roomUuid.value) return [];
        return messagesStore.messagesInRoom(roomUuid.value);
    });

    /* Watchers */
    const chatLoading = ref(false);
    const chatError = ref(null);

    let activeUuid = null;
    let runToken = 0;

    async function ensureRoomsLoaded() {
        if (!house.currentHouseId) return false;
        await roomsStore.loadForHouse(house.currentHouseId);
        return true;
    }

    watch(
        [() => house.currentHouseId, () => house.currentRoom, () => roomUuid.value],
        async ([houseId, roomKey, uuid], [_, __, oldUuid]) => {
            if (!houseId) return;

            chatError.value = null;
            chatLoading.value = true;
            const token = ++runToken;

            try {
                await ensureRoomsLoaded();
                if (token !== runToken) return;

                if (!roomKey || !uuid) return;

                if (oldUuid && oldUuid !== uuid) {
                    await messagesStore.unsubscribe(oldUuid);
                }
                if (token !== runToken) return;

                await messagesStore.load(uuid);
                messagesStore.subscribe(uuid);
                activeUuid = uuid;

                // ✅ ברגע שהחדר נטען: ישר לתחתית (force)
                await scrollToBottom(true);
            } catch (e) {
                chatError.value = e;
                console.error("[ChatPanel] room watcher failed:", e);
            } finally {
                if (token === runToken) chatLoading.value = false;
            }
        },
        { immediate: true }
    );

    // ✅ הודעה חדשה נכנסת: אם המשתמש היה בתחתית → תמשיך לעקוב
    watch(
        () => currentRoomMessages.value.length,
        async () => {
            await scrollToBottom(false);
        }
    );

    async function sendMessage() {
        const text = (newMessage.value || "").trim();
        if (!text) return;
        if (!roomUuid.value) return;

        await messagesStore.send(roomUuid.value, text);
        newMessage.value = "";

        // ✅ אחרי שליחה – תמיד force לתחתית
        await scrollToBottom(true);
    }

    onMounted(() => {
        updateKeyboard();
        window.visualViewport?.addEventListener("resize", updateKeyboard);
        window.visualViewport?.addEventListener("scroll", updateKeyboard);

        // לפעמים מגיעים למסך וה-DOM כבר קיים
        void scrollToBottom(true);
    });

    onUnmounted(() => {
        window.visualViewport?.removeEventListener("resize", updateKeyboard);
        window.visualViewport?.removeEventListener("scroll", updateKeyboard);

        if (activeUuid) {
            try {
                messagesStore.unsubscribe(activeUuid);
            } catch (_) { }
            activeUuid = null;
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
