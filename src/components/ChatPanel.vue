<template>
    <div class="h-full flex flex-col bg-[#0b0f12] text-white overflow-hidden relative">
        <!-- Toasts -->
        <Transition name="copied-pop">
            <div v-if="copiedToast.show"
                 class="absolute top-12 left-1/2 -translate-x-1/2 z-[80]
               px-3 py-1.5 rounded-xl border border-white/10
               bg-black/80 backdrop-blur-md shadow-2xl
               text-[12px] text-white/80">
                Copied
            </div>
        </Transition>

        <Transition name="copied-pop">
            <div v-if="sendErrorToast.show"
                 class="absolute top-12 left-1/2 -translate-x-1/2 z-[80]
               px-3 py-1.5 rounded-xl border border-white/10
               bg-black/80 backdrop-blur-md shadow-2xl
               text-[12px] text-white/80">
                {{ sendErrorToast.msg }}
            </div>
        </Transition>

        <!-- Header -->
        <div class="shrink-0 border-b border-white/10 bg-black/30 backdrop-blur z-10">
            <div class="h-14 px-3 sm:px-4 flex items-center justify-between">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <span class="text-xl">{{ currentRoomIcon }}</span>
                    </div>
                    <div class="min-w-0">
                        <h3 class="font-extrabold text-sm sm:text-base text-green-200 truncate">
                            {{ currentRoomName }}
                        </h3>
                        <div class="text-[10px] text-white/40 uppercase tracking-wider">
                            {{ onlineCount }} Online
                        </div>
                    </div>
                </div>

                <button @click="toggleChatSize"
                        class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <span class="text-lg">{{ chatExpanded ? "▾" : "▴" }}</span>
                </button>
            </div>
        </div>

        <!-- Messages -->
        <div ref="messagesContainer"
             class="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 pt-6 overscroll-contain relative"
             @scroll="handleScroll">
            <div class="flex flex-col gap-4" :class="typingLabel ? 'pb-8' : 'pb-4'">
                <template v-for="msg in currentRoomMessages" :key="msg.id">
                    <div class="relative overflow-visible">
                        <div class="absolute inset-y-0 right-0 w-16 flex items-center justify-center text-green-500 opacity-0 transition-opacity"
                             :style="{ opacity: swipingId === msg.id ? Math.min(swipeOffset / 40, 1) : 0 }">
                            <span class="text-xl">⤶</span>
                        </div>

                        <div :id="'msg-' + msg.id"
                             class="group relative flex items-start gap-3 transition-all p-1 rounded-xl"
                             :class="[
                                swipingId === msg.id ? 'transition-none' : 'duration-300',
                                highlightedId === msg.id ? 'bg-green-500/20 ring-1 ring-green-500/40' : '',
                                replyingTo?.id === msg.id ? 'bg-white/5 ring-1 ring-white/10' : ''
                              ]"
                             :style="swipingId === msg.id ? { transform: `translateX(-${swipeOffset}px)` } : { transform: 'translateX(0)' }"
                             @touchstart="onTouchStart($event, msg)"
                             @touchmove="onTouchMove($event)"
                             @touchend="onTouchEnd"
                             @dblclick.prevent.stop="setReply(msg)"
                             @pointerdown="onPointerDown($event, msg)"
                             @pointermove="onPointerMove($event)"
                             @pointerup="onPointerUp"
                             @pointercancel="onPointerUp"
                             @pointerleave="onPointerUp">
                            <!-- Hover actions -->
                            <div class="hidden md:flex absolute top-1 right-2 bg-black/90 backdrop-blur-md border border-white/20 rounded-lg shadow-2xl p-0.5 z-[50]
                       opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100 origin-right">
                                <button @click="setReply(msg)"
                                        class="p-1.5 hover:bg-green-500/20 rounded-md text-white/60 hover:text-green-400"
                                        title="Reply">
                                    ⤶
                                </button>

                                <button @click="copyToClipboard(msg.text, msg.id)"
                                        class="p-1.5 hover:bg-blue-500/20 rounded-md text-white/60 hover:text-blue-400"
                                        title="Copy">
                                    ⧉
                                </button>
                            </div>

                            <!-- Avatar -->
                            <div class="w-8 h-8 rounded-full border border-white/10 flex-shrink-0 flex items-center justify-center overflow-hidden bg-white/5">
                                <img v-if="msg.avatarUrl" :src="msg.avatarUrl" class="w-full h-full object-cover" />
                                <span v-else class="font-bold text-[10px]" :style="{ color: msg.userColor }">
                                    {{ msg.userInitial }}
                                </span>
                            </div>

                            <!-- Content -->
                            <div class="flex-1 min-w-0">
                                <div class="flex items-baseline gap-2 mb-0.5">
                                    <span class="font-bold text-[12px]" :style="{ color: msg.userColor }">
                                        {{ msg.userName }}
                                    </span>
                                    <span class="text-[9px] text-white/20">{{ msg.time }}</span>
                                </div>

                                <!-- ✅ Reply preview (OLD elegant style) -->
                                <div v-if="msg.reply_to_id && getReplyMsg(msg.reply_to_id)"
                                     @click.stop="scrollToAndHighlight(msg.reply_to_id)"
                                     class="flex items-center gap-2 mb-1 cursor-pointer opacity-60 hover:opacity-100 transition-opacity max-w-[90%]">
                                    <div class="w-0.5 h-3 bg-white/20 rounded-full shrink-0"></div>

                                    <div class="flex items-center gap-1.5 text-[10px] truncate">
                                        <span class="font-bold shrink-0"
                                              :style="{ color: getReplyMsg(msg.reply_to_id).userColor }">
                                            {{ getReplyMsg(msg.reply_to_id).userName }}
                                        </span>

                                        <span class="text-white/40 truncate italic">
                                            {{ getReplyMsg(msg.reply_to_id).text }}
                                        </span>
                                    </div>
                                </div>

                                <!-- Optional: אם ההודעה לא נטענה (במקום “כרטיסייה”) -->
                                <div v-else-if="msg.reply_to_id"
                                     class="flex items-center gap-2 mb-1 opacity-40 max-w-[90%]">
                                    <div class="w-0.5 h-3 bg-white/20 rounded-full shrink-0"></div>
                                    <div class="text-[10px] text-white/40 truncate italic">
                                        Message not loaded
                                    </div>
                                </div>


                                <div class="block max-w-[85%] sm:max-w-[75%] bg-white/[0.04] border border-white/5 rounded-2xl rounded-tl-none px-3 py-1.5 text-sm break-words whitespace-pre-wrap select-none touch-callout-none"
                                     :dir="getTextDirection(msg.text)"
                                     @contextmenu="onContextMenu($event, msg)"
                                     @click="onMessageClick(msg)">
                                    {{ msg.text }}
                                </div>

                                <div v-if="msg._status === 'pending'" class="mt-1 text-[10px] text-white/35">Sending…</div>
                                <div v-else-if="msg._status === 'failed'" class="mt-1 text-[10px] text-red-300/80 cursor-pointer">
                                    Failed • tap to retry
                                </div>
                                <div v-if="msg._status === 'failed' && msg._error" class="mt-1 text-[10px] text-white/35">
                                    {{ msg._error }}
                                </div>
                            </div>
                        </div>
                    </div>
                </template>
            </div>

            <div ref="bottomEl" class="h-px"></div>
        </div>

        <!-- Scroll to bottom -->
        <Transition name="slide-up">
            <button v-if="!isAtBottom"
                    @click="scrollToBottom(true)"
                    class="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center justify-center
               w-8 h-8 rounded-full bg-white/10 backdrop-blur-md border border-white/10
               text-white/70 hover:bg-white/20 hover:text-white transition-all z-20 shadow-lg">
                <span class="text-lg leading-none">☟</span>
            </button>
        </Transition>

        <!-- Composer -->
        <div class="shrink-0 border-t border-white/10 bg-black/40 backdrop-blur-md pb-safe">

            <!-- ✅ Reply bar (OLD elegant one) -->
            <div v-if="replyingTo"
                 class="flex items-center justify-between px-4 py-2 bg-green-500/5 border-b border-white/5 animate-in slide-in-from-bottom-1 duration-200">
                <div class="flex items-center gap-2 truncate">
                    <div class="w-0.5 h-3 bg-green-500 rounded-full"></div>
                    <span class="text-[10px] text-green-400 font-medium truncate">מגיב ל-{{ replyingTo.userName }}</span>
                    <span class="text-[10px] text-white/30 truncate italic">"{{ replyingTo.text }}"</span>
                </div>
                <button @click="clearReply" class="text-white/30 hover:text-white text-xs px-2">✕</button>
            </div>

            <!-- ✅ Typing bar (OLD cool dots wave) -->
            <Transition name="typing-pop">
                <div v-if="typingLabel"
                     class="px-3 sm:px-4 py-0.5 text-[11px] leading-4
                 bg-black/40 backdrop-blur border-t border-white/10
                 text-white/60 flex items-center">
                    <div class="typing-row">
                        <div class="typing-dots" aria-hidden="true">
                            <span></span><span></span><span></span>
                        </div>
                        <div class="text-[11px] text-white/60 truncate">
                            {{ typingLabel }}
                        </div>
                    </div>
                </div>
            </Transition>

            <form @submit.prevent="handleFormSubmit" class="p-2 sm:p-3 flex gap-2 items-end">
                <textarea ref="inputEl"
                          v-model="newMessage"
                          rows="1"
                          @input="onComposerInput"
                          @keydown="onComposerKeydown"
                          placeholder="Write a message..."
                          class="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-sm outline-none
                 focus:border-green-500/30 transition resize-none min-h-[40px] max-h-32"></textarea>

                <button type="submit"
                        :disabled="sending || !newMessage.trim() || !roomUuid"
                        class="w-10 h-10 rounded-full bg-green-500 text-black flex items-center justify-center
                 hover:scale-105 active:scale-95 transition-all disabled:opacity-20 shrink-0">
                    <span class="text-2xl leading-none select-none">➢</span>
                </button>
            </form>
        </div>
    </div>
</template>

<script setup>
    import { ref, computed, nextTick, watch, onMounted, inject, onBeforeUnmount } from "vue";
    import { useHouseStore } from "../stores/house";
    import { useMessagesStore } from "../stores/messages";
    import { useRoomsStore } from "../stores/rooms";
    import { usePresenceStore } from "../stores/presence";
    import { session } from "../stores/auth";
    import { useProfilesStore } from "../stores/profiles";

    const profilesStore = useProfilesStore();

    const house = useHouseStore();
    const messagesStore = useMessagesStore();
    const roomsStore = useRoomsStore();
    const presenceStore = usePresenceStore();

    const newMessage = ref("");
    const replyingTo = ref(null);
    const highlightedId = ref(null);
    const isAtBottom = ref(true);
    const inputEl = ref(null);
    const messagesContainer = ref(null);
    const bottomEl = ref(null);

    const sending = ref(false);

    const copiedToast = ref({ show: false });
    let copiedTimer = null;

    const sendErrorToast = ref({ show: false, msg: "" });
    let sendErrTimer = null;

    function showCopiedToast() {
        copiedToast.value.show = true;
        if (copiedTimer) clearTimeout(copiedTimer);
        copiedTimer = setTimeout(() => (copiedToast.value.show = false), 900);
    }
    function showSendError(msg) {
        sendErrorToast.value = { show: true, msg: msg || "Send failed" };
        if (sendErrTimer) clearTimeout(sendErrTimer);
        sendErrTimer = setTimeout(() => (sendErrorToast.value.show = false), 1600);
    }

    // room wiring
    const roomUuid = computed(() =>
        house.currentRoom ? roomsStore.getRoomUuidByKey(house.currentRoom) : null
    );
    const currentRoomMeta = computed(() => (house.currentRoom ? roomsStore.byKey?.[house.currentRoom] : null));
    const currentRoomIcon = computed(() => currentRoomMeta.value?.icon || "🚪");
    const currentRoomName = computed(() => currentRoomMeta.value?.name || house.currentRoom);

    // presence
    const onlineCount = computed(() => presenceStore.usersInRoom?.(house.currentRoom)?.length ?? 0);
    const myId = computed(() => session.value?.user?.id ?? null);

    // ✅ Typing users (exclude me)
    const typingUsers = computed(() => {
        const list = presenceStore.typingUsersInRoom?.(house.currentRoom) || [];
        return list.filter((u) => (u.user_id ?? u.id) !== myId.value);
    });

    const typingLabel = computed(() => {
        const list = typingUsers.value;
        if (!list.length) return "";
        const names = list.map((u) => u.nickname || "User");
        if (names.length === 1) return `${names[0]} is typing…`;
        if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
        return `${names[0]} and +${names.length - 1} are typing…`;
    });

    const currentRoomMessages = computed(() => {
        if (!roomUuid.value) return [];
        const raw = messagesStore.messagesInRoom?.(roomUuid.value) ?? [];

        return raw.map((m) => {
            const p = profilesStore?.byId?.[m.user_id] || null;
            const nickname = m.userName || p?.nickname || m.nickname || "User";
            const color = m.userColor || p?.color || "rgba(255,255,255,0.75)";
            const avatar = m.avatarUrl || p?.avatar_url || m.avatar_url || null;

            return {
                ...m,
                userName: nickname,
                userColor: color,
                avatarUrl: avatar,
                userInitial: (nickname?.[0]?.toUpperCase?.() || "U"),
                time: new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            };
        });
    });

    // ✅ reply lookup within loaded room
    const byIdInRoom = computed(() => {
        const map = new Map();
        for (const m of currentRoomMessages.value) map.set(m.id, m);
        return map;
    });

    function findMessageText(id) {
        if (!id) return "";
        return byIdInRoom.value.get(id)?.text || "";
    }

    function getReplyMsg(id) {
        if (!id) return null;
        return byIdInRoom.value.get(id) || null;
    }

    async function scrollToAndHighlight(id) {
        const el = document.getElementById("msg-" + id);
        if (!el) return;

        el.scrollIntoView({ behavior: "smooth", block: "center" });
        highlightedId.value = id;
        setTimeout(() => (highlightedId.value = null), 2000);
    }

    function handleScroll() {
        if (!messagesContainer.value) return;
        const el = messagesContainer.value;
        const bottomDist = el.scrollHeight - el.scrollTop - el.clientHeight;
        isAtBottom.value = bottomDist < 100;
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            if (window.navigator.vibrate) window.navigator.vibrate(50);
            showCopiedToast();
        } catch (err) {
            console.error(err);
            showSendError("Copy failed");
        }
    }

    function onContextMenu(e, msg) {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        if (msg?.text) void copyToClipboard(msg.text);
    }

    function onMessageClick(msg) {
        if (msg?._status === "failed" && roomUuid.value) {
            messagesStore.retryClient(roomUuid.value, msg.client_id || msg.id);
            showSendError("Retrying…");
        }
    }

    function getTextDirection(text) {
        return /[\u0590-\u05FF]/.test(text) ? "rtl" : "ltr";
    }

    function autoGrow() {
        if (!inputEl.value) return;
        inputEl.value.style.height = "40px";
        const scHeight = inputEl.value.scrollHeight;
        if (scHeight > 40) inputEl.value.style.height = Math.min(scHeight, 128) + "px";
    }

    function onComposerInput() {
        autoGrow();
        bumpTyping();
    }

    function onComposerKeydown(e) {
        if (e.key !== "Enter") return;
        if (e.shiftKey) return;
        if (sending.value) return;
        e.preventDefault();
        handleFormSubmit();
    }

    // ✅ Typing (Discord-ish): on when text exists, off after idle
    let typingOn = false;
    let typingTimer = null;
    function clearTypingTimer() {
        if (typingTimer) clearTimeout(typingTimer);
        typingTimer = null;
    }

    function bumpTyping() {
        if (!presenceStore?.setTyping) return;

        const hasText = (newMessage.value || "").trim().length > 0;
        if (!hasText) {
            clearTypingTimer();
            if (typingOn) {
                typingOn = false;
                void presenceStore.setTyping(false);
            }
            return;
        }

        if (!typingOn) {
            typingOn = true;
            void presenceStore.setTyping(true);
        }

        clearTypingTimer();
        typingTimer = setTimeout(() => {
            typingOn = false;
            void presenceStore.setTyping(false);
        }, 1200);
    }

    // ✅ Reply helpers
    function setReply(msg) {
        replyingTo.value = msg;
        nextTick(() => inputEl.value?.focus());
    }
    function clearReply() {
        replyingTo.value = null;
        nextTick(() => inputEl.value?.focus());
    }

    // ✅ single deterministic send
    async function sendViaStore(roomId, text, replyToId) {
        if (typeof messagesStore.enqueueSend === "function") {
            return messagesStore.enqueueSend(roomId, text, replyToId);
        }
        if (typeof messagesStore.send === "function") {
            return messagesStore.send(roomId, text, replyToId);
        }
        throw new Error("Messages store has no send()");
    }

    async function handleFormSubmit() {
        if (sending.value) return;

        const text = newMessage.value.trim();
        if (!text || !roomUuid.value) return;

        sending.value = true;
        setTimeout(() => (sending.value = false), 180);

        const replyId = replyingTo.value?.id || null;

        const draft = text;
        newMessage.value = "";
        replyingTo.value = null;
        if (inputEl.value) inputEl.value.style.height = "40px";

        clearTypingTimer();
        if (typingOn) {
            typingOn = false;
            void presenceStore.setTyping(false);
        }

        try {
            await sendViaStore(roomUuid.value, draft, replyId);
        } catch (e) {
            if (!newMessage.value) newMessage.value = draft;
            showSendError(e?.message || "Send failed");
            console.error("[send] failed", e);
        }
    }

    const chatLayout = inject("chatLayout", null);
    const chatExpanded = computed(() => chatLayout?.chatExpanded?.value ?? false);
    function toggleChatSize() {
        chatLayout?.toggle?.();
    }

    async function scrollToBottom(force = false) {
        await nextTick();
        if (!bottomEl.value) return;
        bottomEl.value.scrollIntoView({ behavior: force ? "smooth" : "auto", block: "end" });
    }

    // room subscription wiring
    async function ensureRoomsLoadedForHouse() {
        const hid = house.currentHouseId;
        if (!hid) return;
        if (typeof roomsStore.loadForHouse === "function") {
            await roomsStore.loadForHouse(hid);
        }
    }

    watch(
        roomUuid,
        async (id, prev) => {
            if (prev && prev !== id) await messagesStore.unsubscribe(prev);
            if (!id) return;

            await ensureRoomsLoadedForHouse();

            await messagesStore.load(id, 200);
            messagesStore.subscribe(id, 200);

            void messagesStore.runWorker?.("room-switch");

            if (profilesStore?.ensureLoaded) {
                const ids = [...new Set((messagesStore.messagesInRoom?.(id) ?? []).map((m) => m.user_id))].filter(Boolean);
                profilesStore.ensureLoaded(ids);
            }

            void scrollToBottom(true);
        },
        { immediate: true }
    );

    watch(
        () => currentRoomMessages.value.length,
        () => {
            if (isAtBottom.value) void scrollToBottom(false);
        }
    );

    onMounted(async () => {
        await ensureRoomsLoadedForHouse();
        messagesStore.installGuards?.();
        presenceStore.installGuards?.();
        void scrollToBottom(true);
    });

    onBeforeUnmount(() => {
        if (copiedTimer) clearTimeout(copiedTimer);
        if (sendErrTimer) clearTimeout(sendErrTimer);

        clearTypingTimer();
        if (typingOn) void presenceStore.setTyping(false);

        clearTimeout(longPressTimer);
        clearPointerTimers();
    });

    // (השארת handlers שלך למגע/פויטר — לא נגעתי כדי לא לשבור UX)
    const swipingId = ref(null);
    const swipeOffset = ref(0);
    let touchStartPos = { x: 0, y: 0 };
    let longPressTimer = null;

    let pointerStart = null;
    let pointerLongPressTimer = null;
    let pointerMoved = false;

    function clearPointerTimers() {
        if (pointerLongPressTimer) clearTimeout(pointerLongPressTimer);
        pointerLongPressTimer = null;
    }
    function onPointerDown(e, msg) {
        if (e.button !== 0) return;
        pointerMoved = false;
        pointerStart = { x: e.clientX, y: e.clientY, id: msg.id };
        clearPointerTimers();
        pointerLongPressTimer = setTimeout(() => {
            if (!pointerMoved && pointerStart?.id === msg.id) void copyToClipboard(msg.text);
        }, 520);
    }
    function onPointerMove(e) {
        if (!pointerStart) return;
        const dx = Math.abs(e.clientX - pointerStart.x);
        const dy = Math.abs(e.clientY - pointerStart.y);
        if (dx > 6 || dy > 6) {
            pointerMoved = true;
            clearPointerTimers();
        }
    }
    function onPointerUp() {
        clearPointerTimers();
        pointerStart = null;
        pointerMoved = false;
    }

    function onTouchStart(e, msg) {
        touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        swipingId.value = msg.id;
        swipeOffset.value = 0;

        clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
            void copyToClipboard(msg.text);
        }, 700);
    }

    function onTouchMove(e) {
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const deltaX = touchStartPos.x - currentX;
        const deltaY = touchStartPos.y - currentY;

        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
            clearTimeout(longPressTimer);
        }

        if (deltaX > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
            if (e.cancelable) e.preventDefault();
            swipeOffset.value = Math.min(deltaX, 70);
        } else {
            swipeOffset.value = 0;
        }
    }

    function onTouchEnd() {
        clearTimeout(longPressTimer);

        if (swipeOffset.value > 50 && swipingId.value) {
            const msg = currentRoomMessages.value.find((m) => m.id === swipingId.value);
            if (msg) setReply(msg);
        }

        swipingId.value = null;
        swipeOffset.value = 0;
    }
</script>

<style scoped>
    .touch-callout-none {
        -webkit-touch-callout: none !important;
        -webkit-user-select: none !important;
        user-select: none !important;
    }

    .pb-safe {
        padding-bottom: env(safe-area-inset-bottom);
    }

    ::-webkit-scrollbar {
        width: 4px;
    }

    ::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 10px;
    }

    .break-words {
        overflow-wrap: break-word;
        word-wrap: break-word;
        word-break: break-word;
    }

    .slide-up-enter-active,
    .slide-up-leave-active {
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .slide-up-enter-from,
    .slide-up-leave-to {
        opacity: 0;
        transform: translate(-50%, 20px);
    }

    .copied-pop-enter-active,
    .copied-pop-leave-active {
        transition: all 160ms ease;
    }

    .copied-pop-enter-from,
    .copied-pop-leave-to {
        opacity: 0;
        transform: translate(-50%, -6px);
    }

    /* ✅ typing bar (old wave dots) */
    .typing-row {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 16px;
    }

    .typing-dots {
        display: inline-flex;
        gap: 3px;
        align-items: center;
    }

        .typing-dots span {
            width: 5px;
            height: 5px;
            border-radius: 999px;
            background: rgba(34, 197, 94, 0.85);
            display: inline-block;
            animation: typingWave 1s infinite ease-in-out;
        }

            .typing-dots span:nth-child(2) {
                animation-delay: 0.12s;
                opacity: 0.85;
            }

            .typing-dots span:nth-child(3) {
                animation-delay: 0.24s;
                opacity: 0.7;
            }

    @keyframes typingWave {
        0%, 100% {
            transform: translateY(0);
            opacity: 0.45;
        }

        50% {
            transform: translateY(-3px);
            opacity: 1;
        }
    }

    .typing-pop-enter-active,
    .typing-pop-leave-active {
        transition: all 160ms ease;
    }

    .typing-pop-enter-from,
    .typing-pop-leave-to {
        opacity: 0;
        transform: translateY(6px);
    }

    textarea {
        font-size: 16px;
        -webkit-touch-callout: default !important;
        -webkit-user-select: text !important;
        user-select: text !important;
    }
</style>
