<template>
    <div class="h-full flex flex-col bg-[#0b0f12] text-white">
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
                               active:scale-[0.98] flex items-center justify-center">
                    <span class="text-lg">{{ chatExpanded ? "▾" : "▴" }}</span>
                </button>
            </div>
        </div>

        <div ref="messagesContainer"
             class="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3 space-y-3"
             @scroll.passive="updateScrollPosition">

            <div v-if="chatLoading" class="text-center text-white/60 py-6">
                <div class="text-3xl mb-2">⏳</div>טוען את הצ׳אט…
            </div>

            <div v-else-if="chatError" class="text-center text-red-300 py-6">
                <div class="text-3xl mb-2">💥</div>שגיאה: {{ chatError.message || chatError }}
            </div>

            <template v-else>
                <div v-for="msg in currentRoomMessages" :key="msg.id" class="flex items-start gap-3">
                    <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden flex items-center justify-center
                                border border-white/10 flex-shrink-0 shadow-sm"
                         :style="{
                            borderColor: msg.userColor,
                            background: `linear-gradient(135deg, ${msg.userColor}22, ${msg.userColor}44)`,
                         }">
                        <img v-if="msg.avatarUrl" :src="msg.avatarUrl" class="w-full h-full object-cover" @load="onAvatarLoad" />
                        <span v-else class="text-base sm:text-lg font-extrabold">{{ msg.userInitial }}</span>
                    </div>

                    <div class="flex-1 min-w-0">
                        <div class="flex items-baseline gap-2">
                            <span class="font-extrabold text-xs sm:text-sm truncate" :style="{ color: msg.userColor }">
                                {{ msg.userName }}
                            </span>
                            <span class="text-white/35 text-[11px]">{{ msg.time }}</span>
                        </div>

                        <div class="mt-1.5 bg-white/5 border border-white/10 rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words"
                             :dir="getTextDirection(msg.text)"
                             :class="getTextDirection(msg.text) === 'rtl' ? 'text-right' : 'text-left'"
                             :style="{ borderLeft: `3px solid ${msg.userColor}` }">
                            {{ msg.text }}
                        </div>
                    </div>
                </div>

                <div v-if="currentRoomMessages.length === 0" class="text-center text-white/55 py-14">
                    <div class="text-5xl mb-3">💬</div>
                    <p class="text-base font-bold text-green-200">אין הודעות בחדר הזה עדיין</p>
                </div>
                <div ref="bottomEl" class="h-1"></div>
            </template>
        </div>

        <div class="shrink-0 border-t border-white/10 bg-black/25 backdrop-blur" :style="safeBottomPad">
            <div v-if="replyingTo" class="px-4 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between">
                <div class="text-xs truncate">
                    <span class="text-green-400 font-bold">מגיב ל-{{ replyingTo.userName }}:</span>
                    <span class="ml-1 text-white/60 italic">{{ replyingTo.text }}</span>
                </div>
                <button @click="replyingTo = null" class="text-white/40 hover:text-white">✕</button>
            </div>

            <form @submit.prevent="handleFormSubmit" class="p-3 sm:p-4 flex gap-2 items-end">
                <textarea ref="inputEl"
                          v-model="newMessage"
                          :disabled="!roomReady"
                          rows="1"
                          enterkeyhint="enter"
                          :dir="getTextDirection(newMessage)"
                          @keydown="onComposerKeydown"
                          @input="autoGrow"
                          :placeholder="roomReady ? 'write a message𓂃🖊' : '◌ …טוען חדר'"
                          class="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3
                                 text-white placeholder-white/35 outline-none resize-none
                                 focus:border-green-500/40 focus:ring-2 focus:ring-green-500/10 transition
                                 leading-relaxed min-h-[46px] max-h-[150px] overflow-y-auto" />

                <button type="submit"
                        :disabled="!roomReady || !newMessage.trim()"
                        class="shrink-0 w-12 h-12 rounded-xl font-extrabold bg-green-500 text-black
                               flex items-center justify-center hover:bg-green-400
                               disabled:opacity-30 disabled:cursor-not-allowed transition active:scale-[0.98]">
                    ➣
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
    const inputEl = ref(null);
    const messagesContainer = ref(null);
    const bottomEl = ref(null);
    const replyingTo = ref(null);

    const chatLayout = inject("chatLayout", null);
    const chatExpanded = computed(() => chatLayout?.chatExpanded?.value ?? false);
    const safeBottomPad = computed(() => ({ paddingBottom: "env(safe-area-inset-bottom)" }));

    const FALLBACK_ICONS = { living: "🛋️", gaming: "🎮", bathroom: "🚿", study: "📚", cinema: "🎬", afk: "😴" };

    const currentRoomMeta = computed(() => {
        const key = house.currentRoom;
        return key ? (roomsStore.byKey?.[key] ?? null) : null;
    });
    const currentRoomIcon = computed(() => currentRoomMeta.value?.icon || FALLBACK_ICONS[house.currentRoom] || "🚪");
    const currentRoomName = computed(() => currentRoomMeta.value?.name || house.currentRoom || "חדר");

    function getTextDirection(text) {
        if (!text) return 'ltr';
        const rtlChar = /[\u0590-\u05FF\u0600-\u06FF]/;
        const firstLetter = text.match(/[a-zA-Z\u0590-\u05FF\u0600-\u06FF]/);
        return (firstLetter && rtlChar.test(firstLetter[0])) ? 'rtl' : 'ltr';
    }

    const isNearBottom = ref(true);
    function updateScrollPosition() {
        const el = messagesContainer.value;
        if (!el) return;
        isNearBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    }

    async function scrollToBottom(force = false) {
        await nextTick();
        if (!force && !isNearBottom.value) return;
        bottomEl.value?.scrollIntoView?.({ block: "end" });
        isNearBottom.value = true;
    }

    const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    async function handleFormSubmit() {
        const text = newMessage.value.trim();
        if (!text || !roomUuid.value) return;

        const replyId = replyingTo.value?.id;
        newMessage.value = "";
        replyingTo.value = null;
        resetInputHeight();
        inputEl.value?.focus();

        try {
            await messagesStore.send(roomUuid.value, text, replyId);
            void scrollToBottom(true);
        } catch (err) {
            console.error("Send failed:", err);
            newMessage.value = text;
        }
    }

    function onComposerKeydown(e) {
        if (!e.isComposing && e.key === "Enter") {
            if (!isMobile() && !e.shiftKey) {
                e.preventDefault();
                handleFormSubmit();
            }
        }
    }

    function autoGrow() {
        const el = inputEl.value;
        if (el) {
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 150) + "px";
        }
    }

    function resetInputHeight() {
        if (inputEl.value) inputEl.value.style.height = "auto";
    }

    function onAvatarLoad() { void scrollToBottom(false); }

    const roomUuid = computed(() => house.currentRoom ? roomsStore.getRoomUuidByKey(house.currentRoom) : null);
    const roomReady = computed(() => !!roomUuid.value);
    const currentRoomMessages = computed(() => roomUuid.value ? messagesStore.messagesInRoom(roomUuid.value) : []);
    const onlineCount = computed(() => userStore.usersInRoom(house.currentRoom).length);

    const chatLoading = ref(false);
    const chatError = ref(null);
    let activeUuid = null;

    watch(roomUuid, async (newUuid, oldUuid) => {
        if (!newUuid) return;
        chatLoading.value = true;
        chatError.value = null;
        try {
            if (oldUuid) await messagesStore.unsubscribe(oldUuid);
            await messagesStore.load(newUuid);
            messagesStore.subscribe(newUuid);
            activeUuid = newUuid;
            void scrollToBottom(true);
        } catch (e) { chatError.value = e; } finally { chatLoading.value = false; }
    }, { immediate: true });

    watch(() => currentRoomMessages.value.length, () => {
        if (roomUuid.value) messagesStore.markAsRead(roomUuid.value);
        void scrollToBottom(false);
    });

    const keyboardPx = ref(0);
    function updateKeyboard() {
        const vv = window.visualViewport;
        keyboardPx.value = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
    }

    function onExpandPointerDown() { if (keyboardPx.value === 0 && document.activeElement === inputEl.value) inputEl.value?.blur(); }

    async function toggleChatSize() {
        chatLayout?.toggle?.();
        await nextTick();
        if (keyboardPx.value > 0) inputEl.value?.focus({ preventScroll: true });
    }

    onMounted(() => {
        window.visualViewport?.addEventListener("resize", updateKeyboard);
        void scrollToBottom(true);
    });

    onUnmounted(() => {
        window.visualViewport?.removeEventListener("resize", updateKeyboard);
        if (activeUuid) messagesStore.unsubscribe(activeUuid);
    });
</script>

<style scoped>
    .flex-1::-webkit-scrollbar {
        width: 8px;
    }

    .flex-1::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.02);
    }

    .flex-1::-webkit-scrollbar-thumb {
        background: rgba(34, 197, 94, 0.2);
        border-radius: 10px;
    }

        .flex-1::-webkit-scrollbar-thumb:hover {
            background: rgba(34, 197, 94, 0.3);
        }
</style>