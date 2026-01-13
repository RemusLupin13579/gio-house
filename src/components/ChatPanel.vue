<template>
    <div class="h-full flex flex-col bg-[#0b0f12] text-white overflow-hidden relative">
        <div class="shrink-0 border-b border-white/10 bg-black/30 backdrop-blur z-10">
            <div class="h-14 px-3 sm:px-4 flex items-center justify-between">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <span class="text-xl">{{ currentRoomIcon }}</span>
                    </div>
                    <div class="min-w-0">
                        <h3 class="font-extrabold text-sm sm:text-base text-green-200 truncate">{{ currentRoomName }}</h3>
                        <div class="text-[10px] text-white/40 uppercase tracking-wider">{{ onlineCount }} Online</div>
                    </div>
                </div>
                <button @click="toggleChatSize" class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <span class="text-lg">{{ chatExpanded ? "▾" : "▴" }}</span>
                </button>
            </div>
        </div>

        <div ref="messagesContainer"
             class="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 pt-3 overscroll-contain relative scroll-smooth"
             @scroll="handleScroll">

            <div class="flex flex-col gap-4 pb-4">
                <template v-for="msg in currentRoomMessages" :key="msg.id">
                    <div :id="msg.id"
                         class="group relative flex items-start gap-3 transition-all duration-700 rounded-xl p-1 -m-1"
                         :class="[
                            swipingId === msg.id ? 'transition-none' : '',
                            highlightedId === msg.id ? 'bg-green-500/15 ring-1 ring-green-500/30 shadow-[0_0_20px_rgba(34,197,94,0.15)]' : ''
                         ]"
                         :style="swipingId === msg.id ? { transform: `translateX(-${swipeOffset}px)` } : {}"
                         @touchstart="onTouchStart($event, msg)"
                         @touchmove="onTouchMove($event)"
                         @touchend="onTouchEnd"
                         @dblclick="setReply(msg)">

                        <div class="hidden md:flex absolute -top-3 right-2 bg-black/80 backdrop-blur-md border border-white/20 rounded-lg shadow-2xl p-0.5 z-20 opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100 origin-right">
                            <button @click="setReply(msg)" class="p-1.5 hover:bg-green-500/20 rounded-md text-white/60 hover:text-green-400 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></button>
                            <button @click="copyToClipboard(msg.text, msg.id)" class="p-1.5 hover:bg-blue-500/20 rounded-md text-white/60 hover:text-blue-400 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg></button>
                        </div>

                        <div v-if="copiedId === msg.id" class="absolute -top-6 left-1/2 -translate-x-1/2 bg-green-500 text-black text-[10px] font-bold px-2 py-0.5 rounded shadow-lg z-30">COPIED</div>

                        <div class="w-8 h-8 rounded-full border border-white/10 flex-shrink-0 flex items-center justify-center overflow-hidden bg-white/5">
                            <img v-if="msg.avatarUrl" :src="msg.avatarUrl" class="w-full h-full object-cover" />
                            <span v-else class="font-bold text-[10px]" :style="{ color: msg.userColor }">{{ msg.userInitial }}</span>
                        </div>

                        <div class="flex-1 min-w-0">
                            <div class="flex items-baseline gap-2 mb-0.5">
                                <span class="font-bold text-[12px]" :style="{ color: msg.userColor }">{{ msg.userName }}</span>
                                <span class="text-[9px] text-white/20">{{ msg.time }}</span>
                            </div>

                            <div v-if="msg.reply_to_id && getMessageById(msg.reply_to_id)"
                                 @click="scrollToAndHighlight(msg.reply_to_id)"
                                 class="flex items-center gap-2 mb-1 cursor-pointer group/reply max-w-full opacity-60 hover:opacity-100 transition-opacity">
                                <div class="w-0.5 h-3 bg-white/20 rounded-full group-hover/reply:bg-green-500/50 transition-colors"></div>
                                <div class="flex items-center gap-1.5 text-[10px] truncate">
                                    <span class="font-bold shrink-0" :style="{ color: getMessageById(msg.reply_to_id).userColor }">{{ getMessageById(msg.reply_to_id).userName }}</span>
                                    <span class="text-white/40 truncate italic">{{ getMessageById(msg.reply_to_id).text }}</span>
                                </div>
                            </div>

                            <div class="inline-block max-w-full bg-white/[0.03] border border-white/5 rounded-2xl rounded-tl-none px-3 py-1.5 text-sm"
                                 :dir="getTextDirection(msg.text)"
                                 @mousedown="startLongPress($event, msg)"
                                 @mouseup="cancelLongPress" @mouseleave="cancelLongPress">
                                {{ msg.text }}
                            </div>
                        </div>
                    </div>
                </template>
            </div>
            <div ref="bottomEl" class="h-px"></div>
        </div>

        <Transition name="slide-up">
            <button v-if="!isAtBottom"
                    @click="scrollToBottom(true)"
                    class="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center justify-center
                   w-8 h-8 rounded-full bg-white/10 backdrop-blur-md border border-white/10
                   text-white/70 hover:bg-white/20 hover:text-white transition-all z-20 shadow-lg">
                <span class="text-lg leading-none">⮟</span>
            </button>
        </Transition>

        <div class="shrink-0 border-t border-white/10 bg-black/40 backdrop-blur-md pb-safe">
            <div v-if="replyingTo" class="flex items-center justify-between px-4 py-1.5 bg-green-500/5 border-b border-white/5">
                <span class="text-[10px] text-green-400 font-medium truncate">Replying to {{ replyingTo.userName }}</span>
                <button @click="replyingTo = null" class="text-white/30 hover:text-white text-xs">✕</button>
            </div>

            <form @submit.prevent="handleFormSubmit" class="p-2 sm:p-3 flex gap-2 items-end">
                <textarea ref="inputEl" v-model="newMessage" rows="1"
                          @keydown.enter.exact.prevent="handleFormSubmit"
                          @input="autoGrow" placeholder="Write a message..."
                          class="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-sm outline-none focus:border-green-500/30 transition resize-none min-h-[38px] max-h-32"></textarea>

                <button type="submit" :disabled="!newMessage.trim()"
                        class="w-10 h-10 rounded-full bg-green-500 text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-20">
                    <span class="text-2xl leading-none select-none" :class="getTextDirection(newMessage) === 'rtl' ? 'scale-x-[-1]' : ''">➤</span>
                </button>
            </form>
        </div>
    </div>
</template>

<script setup>
    import { ref, computed, nextTick, watch, onMounted, inject } from "vue";
    import { useHouseStore } from "../stores/house";
    import { useMessagesStore } from "../stores/messages";
    import { useRoomsStore } from "../stores/rooms";
    import { usePresenceStore } from "../stores/presence";

    const house = useHouseStore();
    const messagesStore = useMessagesStore();
    const roomsStore = useRoomsStore();
    const presenceStore = usePresenceStore();

    const newMessage = ref("");
    const replyingTo = ref(null);
    const copiedId = ref(null);
    const highlightedId = ref(null);
    const isAtBottom = ref(true);
    const inputEl = ref(null);
    const messagesContainer = ref(null);
    const bottomEl = ref(null);

    const swipingId = ref(null);
    const swipeOffset = ref(0);
    let touchStartX = 0;
    let longPressTimer = null;

    const roomUuid = computed(() => house.currentRoom ? roomsStore.getRoomUuidByKey(house.currentRoom) : null);
    const currentRoomMeta = computed(() => house.currentRoom ? roomsStore.byKey[house.currentRoom] : null);
    const currentRoomIcon = computed(() => currentRoomMeta.value?.icon || "🚪");
    const currentRoomName = computed(() => currentRoomMeta.value?.name || house.currentRoom);
    const onlineCount = computed(() => presenceStore.usersInRoom(house.currentRoom).length);
    const currentRoomMessages = computed(() => roomUuid.value ? messagesStore.messagesInRoom(roomUuid.value) : []);
    const chatLayout = inject("chatLayout", null);
    const chatExpanded = computed(() => chatLayout?.chatExpanded?.value ?? false);

    // --- Functions ---

    function getMessageById(id) {
        return currentRoomMessages.value.find(m => m.id === id);
    }

    async function scrollToAndHighlight(id) {
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            highlightedId.value = id;
            setTimeout(() => { highlightedId.value = null; }, 2000);
        }
    }

    function handleScroll() {
        const el = messagesContainer.value;
        if (!el) return;

        // חישוב המרחק מהתחתית
        const bottomDist = el.scrollHeight - el.scrollTop - el.clientHeight;

        // הכפתור יופיע אם המשתמש גלל למעלה יותר מ-150 פיקסלים
        isAtBottom.value = bottomDist < 150;
    }

    function setReply(msg) {
        replyingTo.value = msg;
        nextTick(() => inputEl.value?.focus());
    }

    async function copyToClipboard(text, id) {
        try {
            await navigator.clipboard.writeText(text);
            copiedId.value = id;
            setTimeout(() => { copiedId.value = null; }, 1500);
        } catch (err) { console.error(err); }
    }

    function startLongPress(e, msg) {
        longPressTimer = setTimeout(() => {
            copyToClipboard(msg.text, msg.id);
            if (window.navigator.vibrate) window.navigator.vibrate(40);
        }, 700);
    }

    function cancelLongPress() { clearTimeout(longPressTimer); }

    function onTouchStart(e, msg) {
        touchStartX = e.touches[0].clientX;
        startLongPress(e, msg);
    }

    function onTouchMove(e) {
        const diff = touchStartX - e.touches[0].clientX;
        if (diff > 10) {
            cancelLongPress();
            swipingId.value = currentRoomMessages.value.find(m => e.currentTarget.contains(e.target))?.id;
            swipeOffset.value = Math.min(diff, 60);
        }
    }

    function onTouchEnd() {
        cancelLongPress();
        if (swipeOffset.value > 40 && swipingId.value) {
            const msg = currentRoomMessages.value.find(m => m.id === swipingId.value);
            if (msg) setReply(msg);
        }
        swipingId.value = null;
        swipeOffset.value = 0;
    }

    async function handleFormSubmit() {
        const text = newMessage.value.trim();
        if (!text || !roomUuid.value) return;
        const replyId = replyingTo.value?.id;
        newMessage.value = "";
        replyingTo.value = null;
        if (inputEl.value) {
            inputEl.value.style.height = 'auto';
            inputEl.value.focus();
        }
        await messagesStore.send(roomUuid.value, text, replyId);
        scrollToBottom(true);
    }

    function getTextDirection(text) {
        return /[\u0590-\u05FF]/.test(text) ? 'rtl' : 'ltr';
    }

    function autoGrow() {
        if (!inputEl.value) return;
        inputEl.value.style.height = "auto";
        inputEl.value.style.height = inputEl.value.scrollHeight + "px";
    }

    function toggleChatSize() { chatLayout?.toggle?.(); }

    async function scrollToBottom(force = false) {
        await nextTick();
        bottomEl.value?.scrollIntoView({ behavior: force ? 'smooth' : 'auto', block: 'end' });
    }

    watch(() => chatLayout?.isMobileNavOpen?.value, (isOpen) => {
        if (isOpen) document.activeElement.blur();
    });

    watch(roomUuid, (id) => { if (id) messagesStore.load(id); }, { immediate: true });
    watch(() => currentRoomMessages.value.length, () => scrollToBottom(false));
    onMounted(() => scrollToBottom(true));
</script>

<style scoped>

    .pb-safe {
        padding-bottom: env(safe-area-inset-bottom);
    }

    .fade-enter-active, .fade-leave-active {
        transition: all 0.3s ease;
    }

    .fade-enter-from, .fade-leave-to {
        opacity: 0;
        transform: translateY(10px) scale(0.9);
    }
    .slide-up-enter-active, .slide-up-leave-active {
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .slide-up-enter-from, .slide-up-leave-to {
        opacity: 0;
        transform: translate(-50%, 20px); /* שומר על המרכוז בזמן האנימציה */
    }

    /* ביטול ה-outline הכחול המעצבן בדפדפנים מסוימים */
    button:focus {
        outline: none;
    }

    /* אנימציית כניסה רכה להבהוב */
    .highlight-enter-active {
        transition: all 0.5s ease;
    }


    /* Custom scrollbar */

    ::-webkit-scrollbar {
        width: 4px;
    }

    ::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.1);
        border-radius: 10px;
    }
</style>