<template>
    <div class="h-full min-h-0 flex flex-col bg-[#0b0f12] text-white overflow-hidden relative">
        <!-- Header -->
        <div class="shrink-0 border-b border-white/10 bg-black/30 backdrop-blur z-10">
            <div class="h-14 px-3 sm:px-4 flex items-center justify-between">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <span class="text-xl">💬</span>
                    </div>
                    <div class="min-w-0">
                        <h3 class="font-extrabold text-sm sm:text-base text-green-200 truncate">
                            DM
                        </h3>
                        <div class="text-[10px] text-white/40 uppercase tracking-wider">
                            {{ threadId }}
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
                <template v-for="msg in mapped" :key="msg.id">
                    <div :id="'msg-' + msg.id"
                         class="group relative flex items-start gap-3 transition-all p-1 rounded-xl"
                         :class="highlightedId === msg.id ? 'bg-green-500/20 ring-1 ring-green-500/40' : ''"
                         @dblclick.prevent.stop="setReply(msg)">
                        <div class="w-8 h-8 rounded-full border border-white/10 flex-shrink-0 flex items-center justify-center overflow-hidden bg-white/5">
                            <img v-if="msg.avatarUrl" :src="msg.avatarUrl" class="w-full h-full object-cover" />
                            <span v-else class="font-bold text-[10px]" :style="{ color: msg.userColor }">
                                {{ msg.userInitial }}
                            </span>
                        </div>

                        <div class="flex-1 min-w-0">
                            <div class="flex items-baseline gap-2 mb-0.5">
                                <span class="font-bold text-[12px]" :style="{ color: msg.userColor }">
                                    {{ msg.userName }}
                                </span>
                                <span class="text-[9px] text-white/20">{{ msg.time }}</span>
                            </div>

                            <!-- reply preview (same elegant one) -->
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
            <!-- Reply bar -->
            <div v-if="replyingTo"
                 class="flex items-center justify-between px-4 py-2 bg-green-500/5 border-b border-white/5 animate-in slide-in-from-bottom-1 duration-200">
                <div class="flex items-center gap-2 truncate">
                    <div class="w-0.5 h-3 bg-green-500 rounded-full"></div>
                    <span class="text-[10px] text-green-400 font-medium truncate">מגיב ל-{{ replyingTo.userName }}</span>
                    <span class="text-[10px] text-white/30 truncate italic">"{{ replyingTo.text }}"</span>
                </div>
                <button @click="clearReply" class="text-white/30 hover:text-white text-xs px-2">✕</button>
            </div>

            <!-- Typing bar -->
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
                        :disabled="sending || !newMessage.trim() || !threadId"
                        class="w-10 h-10 rounded-full bg-green-500 text-black flex items-center justify-center
                       hover:scale-105 active:scale-95 transition-all disabled:opacity-20 shrink-0">
                    <span class="text-2xl leading-none select-none">➢</span>
                </button>
            </form>
        </div>
    </div>
</template>

<script setup>
    import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
    import { useProfilesStore } from "../stores/profiles";
    import { session } from "../stores/auth";
    import { useDMMessagesStore } from "../stores/dmMessages";
    import { useDMThreadsStore } from "../stores/dmThreads";

    const threadsStore = useDMThreadsStore();
    const props = defineProps({
        threadId: { type: String, required: true },
        typingLabel: { type: String, default: "" },
        sendTyping: { type: Function, default: null },
    });

    const profilesStore = useProfilesStore();
    const dm = useDMMessagesStore();

    const newMessage = ref("");
    const replyingTo = ref(null);
    const highlightedId = ref(null);
    const isAtBottom = ref(true);
    const inputEl = ref(null);
    const messagesContainer = ref(null);
    const bottomEl = ref(null);
    const sending = ref(false);

    const myId = computed(() => session.value?.user?.id ?? null);

    const raw = computed(() => dm.messagesInThread(props.threadId) || []);
    const mapped = computed(() => {
        return raw.value.map((m) => {
            const p = profilesStore?.byId?.[m.user_id] || null;
            const nickname = m.userName || p?.nickname || "User";
            const color = m.userColor || p?.color || "rgba(255,255,255,0.75)";
            const avatar = m.avatarUrl || p?.avatar_url || null;

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

    const byId = computed(() => {
        const map = new Map();
        for (const m of mapped.value) map.set(m.id, m);
        return map;
    });
    function getReplyMsg(id) { return id ? byId.value.get(id) || null : null; }

    async function scrollToAndHighlight(id) {
        const el = document.getElementById("msg-" + id);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        highlightedId.value = id;
        setTimeout(() => (highlightedId.value = null), 2000);
    }

    function handleScroll() {
        const el = messagesContainer.value;
        if (!el) return;
        const bottomDist = el.scrollHeight - el.scrollTop - el.clientHeight;
        isAtBottom.value = bottomDist < 100;
    }

    function getTextDirection(text) {
        return /[\u0590-\u05FF]/.test(text) ? "rtl" : "ltr";
    }

    async function copyToClipboard(text) {
        try { await navigator.clipboard.writeText(text); } catch { }
    }
    function onContextMenu(e, msg) {
        e?.preventDefault?.(); e?.stopPropagation?.();
        if (msg?.text) void copyToClipboard(msg.text);
    }
    function onMessageClick(msg) {
        if (msg?._status === "failed") {
            dm.retryClient(props.threadId, msg.client_id || msg.id);
        }
    }

    function autoGrow() {
        if (!inputEl.value) return;
        inputEl.value.style.height = "40px";
        const scHeight = inputEl.value.scrollHeight;
        if (scHeight > 40) inputEl.value.style.height = Math.min(scHeight, 128) + "px";
    }

    let typingOn = false;
    let typingTimer = null;
    function clearTypingTimer() { if (typingTimer) clearTimeout(typingTimer); typingTimer = null; }

    function bumpTyping() {
        if (!props.sendTyping) return;
        const hasText = (newMessage.value || "").trim().length > 0;

        if (!hasText) {
            clearTypingTimer();
            if (typingOn) { typingOn = false; props.sendTyping(false); }
            return;
        }

        if (!typingOn) { typingOn = true; props.sendTyping(true); }

        clearTypingTimer();
        typingTimer = setTimeout(() => {
            typingOn = false;
            props.sendTyping(false);
        }, 1200);
    }

    function onComposerInput() {
        autoGrow();
        bumpTyping();
    }
    function isMobileLike() {
        // pointer coarse = רוב המכשירי מגע
        return window.matchMedia?.("(pointer: coarse)")?.matches;
    }
    function onComposerKeydown(e) {
        if (e.key !== "Enter") return;

        // ✅ מובייל: Enter = ירידת שורה (לא שולח)
        if (isMobileLike()) return;

        // ✅ דסקטופ: Shift+Enter = שורה, Enter = שליחה
        if (e.shiftKey) return;

        if (sending.value) return;
        e.preventDefault();
        handleFormSubmit();
    }

    function setReply(msg) { replyingTo.value = msg; nextTick(() => inputEl.value?.focus()); }
    function clearReply() { replyingTo.value = null; nextTick(() => inputEl.value?.focus()); }

    async function handleFormSubmit() {
        if (sending.value) return;

        const text = newMessage.value.trim();
        if (!text || !props.threadId) return;

        sending.value = true;
        setTimeout(() => (sending.value = false), 180);

        const replyId = replyingTo.value?.id || null;

        const draft = text;
        newMessage.value = "";
        replyingTo.value = null;
        if (inputEl.value) inputEl.value.style.height = "40px";

        clearTypingTimer();
        if (typingOn) { typingOn = false; props.sendTyping?.(false); }

        try {
            dm.enqueueSend(props.threadId, draft, replyId);
        } catch (e) {
            if (!newMessage.value) newMessage.value = draft;
            console.error("[dm send] failed", e);
        } finally {
            // ✅ keep keyboard open
            await nextTick();
            inputEl.value?.focus?.({ preventScroll: true });
        }
    }

    const chatLayout = inject("chatLayout", null);
    const chatExpanded = computed(() => chatLayout?.chatExpanded?.value ?? false);
    function toggleChatSize() { chatLayout?.toggle?.(); }

    async function scrollToBottom(force = false) {
        await nextTick();
        bottomEl.value?.scrollIntoView({ behavior: force ? "smooth" : "auto", block: "end" });
    }

    watch(
        () => props.threadId,
        async (id) => {
            if (!id) return;

            try {
                // Sidebar/threads meta
                await threadsStore.loadMyThreads(80);

                // ✅ load messages for this thread
                await dm.loadThreadMessages(id);
                dm.subscribe(id);

                // (אופציונלי) scroll
                await nextTick();
                if (isAtBottom.value) void scrollToBottom(false);
            } catch (e) {
                console.error("[DMChatPanel] watch(threadId) failed:", e);
                // אל תקרא ui אם אין לך ui
            }
        },
        { immediate: true }
    );


    watch(() => mapped.value.length, () => { if (isAtBottom.value) void scrollToBottom(false); });

    onMounted(() => { void scrollToBottom(true); });
    onBeforeUnmount(() => {
        console.log("[dm store keys]", Object.keys(dm));
        clearTypingTimer();
        if (typingOn) props.sendTyping?.(false);
    });
</script>

<style scoped>
    .pb-safe {
        padding-bottom: env(safe-area-inset-bottom);
    }

    .touch-callout-none {
        -webkit-touch-callout: none !important;
        -webkit-user-select: none !important;
        user-select: none !important;
    }

    .break-words {
        overflow-wrap: break-word;
        word-wrap: break-word;
        word-break: break-word;
    }

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
        0%,100% {
            transform: translateY(0);
            opacity: 0.45;
        }

        50% {
            transform: translateY(-3px);
            opacity: 1;
        }
    }
</style>
