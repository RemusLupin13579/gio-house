<template>
    <div class="h-[100dvh] w-screen bg-black text-white overflow-hidden flex flex-col md:flex-row">
        <div v-if="showMobileTopBar"
             class="md:hidden h-12 px-3 flex items-center justify-between border-b border-white/5">
            <button class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/50 transition active:scale-[0.98]"
                    @click="openMobileNav()"
                    title="Menu">
                ☰
            </button>

            <div class="font-bold text-green-300 truncate max-w-[60vw]">
                {{ headerTitle }}
            </div>

            
        </div>

        <aside class="hidden md:flex w-16 bg-[#0b0f12] border-r border-white/5 flex-col items-center py-3 gap-3">
            <div class="flex flex-col items-center gap-3 w-full">
                <div v-for="houseItem in houseRail"
                     :key="houseItem.id"
                     class="relative flex items-center justify-center w-full">
                    <button class="w-11 h-11 rounded-2xl flex items-center justify-center border border-white/10 transition"
                            :class="houseItem.id === house.currentHouseId
                                ? 'bg-green-500/20 border-green-500/60 ring-2 ring-green-500/40'
                                : 'bg-white/5 hover:border-green-500/50'"
                            @click="switchHouse(houseItem.id)"
                            @contextmenu.prevent="openHouseActions(houseItem.id)"
                            :title="houseItem.name || 'House'">
                        <span v-if="houseItem.is_public">🌍</span>
                        <span v-else>{{ houseInitial(houseItem) }}</span>
                    </button>

                    <button class="absolute -right-1 -top-1 w-5 h-5 rounded-full bg-black/80 border border-white/10 text-[10px] leading-none hover:border-green-500/50 transition"
                            title="House actions"
                            data-house-actions-btn="true"
                            @click.stop="toggleHouseActions(houseItem.id)">
                        ⋯
                    </button>

                    <div v-if="houseActionsOpenId === houseItem.id"
                         data-house-actions="true"
                         class="absolute left-14 top-1 z-50 w-40 bg-[#0b0f12] border border-white/10 rounded-xl shadow-xl overflow-hidden">
                        <button class="w-full px-3 py-2 text-right hover:bg-white/5"
                                @click="openInviteForHouse(houseItem.id)">
                            הזמן חברים
                        </button>
                        <button class="w-full px-3 py-2 text-right hover:bg-white/5"
                                @click="openSettingsForHouse(houseItem.id)">
                            הגדרות
                        </button>
                    </div>
                </div>
            </div>

            <div class="flex-1"></div>

            <button class="w-11 h-11 rounded-2xl flex items-center justify-center border border-white/10 bg-white/5 hover:border-green-500/50 transition"
                    @click="openHouseModal = true"
                    title="Add or Join house">
                ➕
            </button>
        </aside>

        <section class="hidden md:flex w-72 bg-[#0c1116] border-r border-white/5 flex-col">
            <div class="h-20 px-4 flex items-center justify-between border-b border-white/5">
                <div class="flex items-center gap-2">
                    <div class="gio-topbar">
                        <div class="gio-topbar__left">
                            <div class="gio-house-badge">
                                <span class="gio-house-emoji">{{ isPublicHouse ? "🌍" : "🏠" }}</span>
                                <div class="gio-house-text">
                                    <div class="gio-house-title">
                                        {{ isPublicHouse ? "GIO HOUSE" : (currentHouse?.name || "My House") }}
                                    </div>
                                    <div class="gio-house-subtitle">
                                        {{ isPublicHouse ? "איפה כולם עכשיו?" : "מי בבית עכשיו?" }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="relative inline-block shrink-0" data-house-menu="1">
                        <button class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/50 transition"
                                @click.stop="houseMenuOpen = !houseMenuOpen"
                                title="House menu">
                            ⋯
                        </button>

                        <div v-if="houseMenuOpen"
                             class="absolute right-0 mt-2 w-48 bg-[#0b0f12] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
                            <button class="w-full px-3 py-2 text-right hover:bg-white/5" @click="openInviteModal = true; houseMenuOpen=false">
                                הזמן חברים
                            </button>
                            <button class="w-full px-3 py-2 text-right hover:bg-white/5" @click="openHouseModal = true; houseMenuOpen=false">
                                עריכת בית
                            </button>
                            <button class="w-full px-3 py-2 text-right hover:bg-white/5" @click="openHouseModal = true; houseMenuOpen=false">
                                הגדרות
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="p-3">
                <div class="text-xs text-white/40 mb-2">חדרים</div>

                <div class="space-y-1">
                    <button v-for="roomKey in roomKeys"
                            :key="roomKey"
                            class="w-full px-3 py-2 rounded-xl flex items-center justify-between hover:bg-white/5 transition"
                            :class="isActiveRoom(roomKey) ? 'bg-white/5 border border-green-500/30' : 'border border-transparent'"
                            @click="enterRoom(roomKey)">
                        <div class="flex items-center gap-2">
                            <span class="text-lg">{{ roomIcon(roomKey) }}</span>
                            <span class="font-semibold">{{ roomName(roomKey) }}</span>
                        </div>

                        <span class="text-xs text-green-300">
                            <span v-if="presence.status==='connecting'" class="gio-skel-count"></span>
                            <span v-else>{{ presence.usersInRoom(roomKey).length }}</span>
                        </span>
                    </button>
                </div>
            </div>

            <div class="flex-1"></div>

            <div class="h-14 px-3 border-t border-white/5 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <div class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center">
                        <img v-if="avatarUrl" :src="avatarUrl" class="w-full h-full object-cover" alt="" />
                        <span v-else>🙂</span>
                    </div>

                    <div class="leading-tight">
                        <div class="font-bold">{{ nickname }}</div>

                        <!-- ✅ CLICKABLE STATUS CHIP (desktop) -->
                        <div class="gio-topbar__right">
                            <div class="h-5 gio-presence-chip cursor-pointer select-none"
                                 :data-state="presence.status"
                                 :data-user="myUserStatus"
                                 @click="presence.status === 'ready' ? cycleMyStatus() : null"
                                 title="Change status">
                                <span class="gio-dot" />

                                <span v-if="presence.status === 'connecting'" class="gio-sync">
                                    Syncing
                                    <span class="gio-dots"><i></i><i></i><i></i></span>
                                </span>

                                <span v-else-if="presence.status === 'failed'">Offline</span>

                                <span v-else-if="presence.status === 'ready'">
                                    {{ myStatusLabel }}
                                </span>

                                <span v-else>Idle</span>

                                <button v-if="presence.status === 'failed'"
                                        class="gio-retry-btn"
                                        @click.stop="retryPresence"
                                        title="Retry">
                                    Retry
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <button class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/50 transition" title="Settings">
                    ⚙️
                </button>
            </div>
        </section>

        <main class="flex-1 bg-black overflow-hidden min-h-0">
            <div class="gio-fade h-full min-h-0" :key="house.currentHouseId">
                <RouterView />
            </div>
        </main>

        <div v-if="mobileNavOpen" class="md:hidden fixed inset-0 z-[9999]">
            <div class="absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity"
                 :style="{ opacity: overlayOpacity }"
                 @click="closeMobileNav()"></div>

            <div class="absolute left-0 top-0 h-full w-[86vw] max-w-[360px]
               bg-[#0b0f12]/95 border-r border-white/10 shadow-2xl
               will-change-transform"
                 :style="{ transform: `translateX(${drawerTranslateX}px)` }"
                 @touchstart.passive="onDrawerTouchStart"
                 @touchmove.passive="onDrawerTouchMove"
                 @touchend="onDrawerTouchEnd">
                <div class="h-full flex flex-col">
                    <div class="h-14 px-4 flex items-center justify-between border-b border-white/10">
                        <div class="font-bold text-green-300 truncate">{{ headerTitle }}</div>
                        <button class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/50 transition active:scale-[0.98]"
                                @click="closeMobileNav()"
                                title="Close">
                            ✕
                        </button>
                    </div>

                    <div class="flex-1 overflow-auto">
                        <div class="p-3 border-b border-white/10">
                            <div class="text-xs text-white/40 mb-2">פעולות</div>
                            <div class="flex gap-2">
                                <button class="flex-1 h-11 rounded-2xl flex items-center justify-center border border-white/10 hover:border-green-500/50 transition"
                                        :class="isHome ? 'bg-green-500/20 border-green-500/60' : 'bg-white/5'"
                                        @click="goHome(); closeMobileNav()"
                                        title="Home">
                                    🏠
                                </button>

                                <button class="flex-1 h-11 rounded-2xl flex items-center justify-center border border-white/10 bg-white/5 hover:border-green-500/50 transition"
                                        @click="openHouseModal = true; closeMobileNav()"
                                        title="Houses">
                                    ➕
                                </button>

                                <button class="flex-1 h-11 rounded-2xl flex items-center justify-center border border-white/10 bg-white/5 hover:border-green-500/50 transition"
                                        :class="isMembers ? 'bg-green-500/20 border-green-500/60' : ''"
                                        title="Members"
                                        @click="goMembers(); closeMobileNav({ skipHistoryBack: true })">
                                    👥
                                </button>
                            </div>
                        </div>

                        <div class="p-3">
                            <div class="text-xs text-white/40 mb-2">חדרים</div>

                            <div class="space-y-1">
                                <button v-for="roomKey in roomKeys"
                                        :key="roomKey"
                                        class="w-full px-3 py-2 rounded-xl flex items-center justify-between hover:bg-white/5 transition"
                                        :class="isActiveRoom(roomKey) ? 'bg-white/5 border border-green-500/30' : 'border border-transparent'"
                                        @click="enterRoom(roomKey); closeMobileNav()">
                                    <div class="flex items-center gap-2">
                                        <span class="text-lg">{{ roomIcon(roomKey) }}</span>
                                        <span class="font-semibold">{{ roomName(roomKey) }}</span>
                                    </div>

                                    <span class="text-xs text-green-300">
                                        <span v-if="presence.status==='connecting'" class="gio-skel-count"></span>
                                        <span v-else>{{ presence.usersInRoom(roomKey).length }}</span>
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- ✅ mobile bottom profile (NOW WITH CLICKABLE CHIP) -->
                    <div class="h-14 px-3 border-t border-white/10 flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <div class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center">
                                <img v-if="avatarUrl" :src="avatarUrl" class="w-full h-full object-cover" alt="" />
                                <span v-else>🙂</span>
                            </div>

                            <div class="leading-tight">
                                <div class="font-bold">{{ nickname }}</div>

                                <div class="mt-1">
                                    <div class="h-5 gio-presence-chip cursor-pointer select-none inline-flex"
                                         :data-state="presence.status"
                                         :data-user="myUserStatus"
                                         @click="presence.status === 'ready' ? cycleMyStatus() : null"
                                         title="Change status">
                                        <span class="gio-dot" />
                                        <span v-if="presence.status === 'connecting'" class="gio-sync">
                                            Syncing
                                            <span class="gio-dots"><i></i><i></i><i></i></span>
                                        </span>
                                        <span v-else-if="presence.status === 'failed'">Offline</span>
                                        <span v-else-if="presence.status === 'ready'">{{ myStatusLabel }}</span>
                                        <span v-else>Idle</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/50 transition" title="Settings">
                            ⚙️
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- ✅ Toasts -->
        <div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10050] flex flex-col gap-2 pointer-events-none md:hidden">
            <div v-for="t in ui.toasts"
                 :key="t.id"
                 class="px-4 py-2 rounded-2xl border border-white/10 bg-black/80 backdrop-blur text-white/90 text-sm font-bold shadow-xl">
                {{ t.text }}
            </div>
        </div>

        <HouseSwitcherModal v-if="openHouseModal" @close="openHouseModal=false" />
        <HouseInviteModal v-if="openInviteModal && currentHouse"
                          :house="currentHouse"
                          @close="openInviteModal=false" />

    </div>
</template>

<script setup>
    import HouseInviteModal from "../components/HouseInviteModal.vue";
    import HouseSwitcherModal from "../components/HouseSwitcherModal.vue";
    import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
    import { RouterView, useRoute, useRouter } from "vue-router";
    import { useHouseStore } from "../stores/house";
    import { usePresenceStore } from "../stores/presence";
    import { session, profile } from "../stores/auth";
    import { useRoomsStore } from "../stores/rooms";
    import { useUIStore } from "../stores/ui";

    const ui = useUIStore();
    const openInviteModal = ref(false);

    const roomsStore = useRoomsStore();
    const router = useRouter();
    const route = useRoute();

    const house = useHouseStore();
    const presence = usePresenceStore();

    const openHouseModal = ref(false);
    const houseMenuOpen = ref(false);
    const houseActionsOpenId = ref(null);
    const showMobileTopBar = computed(() => route.name !== "room");

    /* =========================
       ✅ MOBILE DRAWER STATE
       ========================= */
    const mobileNavOpen = ref(false);
    const drawerTranslateX = ref(-400);
    const overlayOpacity = ref(0);

    function drawerWidth() {
        if (isMobile()) return window.innerWidth;
        return Math.min(window.innerWidth * 0.86, 360);
    }

    function animateDrawer(toX, toOpacity, ms = 220) {
        const fromX = drawerTranslateX.value;
        const fromO = overlayOpacity.value;
        const start = performance.now();
        const easeOut = (t) => 1 - Math.pow(1 - t, 3);

        function frame(now) {
            const p = Math.min(1, (now - start) / ms);
            const e = easeOut(p);
            drawerTranslateX.value = fromX + (toX - fromX) * e;
            overlayOpacity.value = fromO + (toOpacity - fromO) * e;
            if (p < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }

    /* =========================
       ✅ Android back closes drawer
       ========================= */
    const drawerHistoryPushed = ref(false);
    let suppressNextPop = false;

    async function openMobileNav() {
        if (mobileNavOpen.value) return;

        mobileNavOpen.value = true;
        await nextTick();

        const w = drawerWidth();
        drawerTranslateX.value = -w;
        overlayOpacity.value = 0;
        animateDrawer(0, 1, 160);

        if (!drawerHistoryPushed.value) {
            history.pushState({ gioDrawer: true }, "");
            drawerHistoryPushed.value = true;
        }
    }

    function closeMobileNav(options = {}) {
        if (!mobileNavOpen.value) return;

        const w = drawerWidth();
        animateDrawer(-w, 0, 140);

        window.setTimeout(() => {
            mobileNavOpen.value = false;
        }, 155);

        if (drawerHistoryPushed.value && !options.skipHistoryBack) {
            suppressNextPop = true;
            history.back();
            drawerHistoryPushed.value = false;
        }
    }

    function onPopState() {
        if (suppressNextPop) {
            suppressNextPop = false;
            return;
        }
        if (mobileNavOpen.value) {
            const w = drawerWidth();
            animateDrawer(-w, 0, 140);
            window.setTimeout(() => {
                mobileNavOpen.value = false;
            }, 155);
            drawerHistoryPushed.value = false;
        }
    }

    watch(mobileNavOpen, (open) => {
        if (open) {
            document.documentElement.style.overflow = "hidden";
            document.body.style.overflow = "hidden";
        } else {
            document.documentElement.style.overflow = "";
            document.body.style.overflow = "";
        }
    });

    /* =========================
       ✅ FULL-SCREEN SWIPE OPEN (Discord-like)
       ========================= */
    const swipeActive = ref(false);
    const swipeLockedHorizontal = ref(false);
    const startX = ref(0);
    const startY = ref(0);

    const SYS_EDGE_PX = 12;
    const INTENT_SLOP = 6;
    const OPEN_COMMIT_RATIO = 0.12;
    const SWIPE_GAIN = 1.9;

    function isMobile() {
        return window.matchMedia?.("(max-width: 767px)")?.matches ?? (window.innerWidth < 768);
    }

    function shouldIgnoreTarget(target) {
        const el = target?.closest?.("input, textarea, select, button, [contenteditable='true']");
        return !!el;
    }

    function onTouchStartGlobal(e) {
        if (!isMobile()) return;
        if (mobileNavOpen.value) return;
        const t = e.touches?.[0];
        if (!t) return;
        if (shouldIgnoreTarget(e.target)) return;
        if (t.clientX < SYS_EDGE_PX) return;

        swipeActive.value = true;
        swipeLockedHorizontal.value = false;
        startX.value = t.clientX;
        startY.value = t.clientY;
    }

    function onTouchMoveGlobal(e) {
        if (!swipeActive.value) return;
        const t = e.touches?.[0];
        if (!t) return;

        const dx = t.clientX - startX.value;
        const dy = t.clientY - startY.value;

        if (!swipeLockedHorizontal.value) {
            if (Math.abs(dx) < INTENT_SLOP && Math.abs(dy) < INTENT_SLOP) return;
            if (Math.abs(dy) > Math.abs(dx) * 1.15) {
                swipeActive.value = false;
                return;
            }
            swipeLockedHorizontal.value = true;
            mobileNavOpen.value = true;
            drawerTranslateX.value = -drawerWidth();
        }

        e.preventDefault();
        const w = drawerWidth();
        const openPx = Math.max(0, dx) * SWIPE_GAIN;
        const translate = Math.max(-w, Math.min(0, -w + openPx));
        drawerTranslateX.value = translate;
        overlayOpacity.value = 1 - Math.abs(translate) / w;
    }

    function onTouchEndGlobal() {
        if (!swipeActive.value) return;
        const w = drawerWidth();
        const openness = 1 - Math.abs(drawerTranslateX.value) / w;
        const shouldOpen = swipeLockedHorizontal.value && openness >= OPEN_COMMIT_RATIO;

        swipeActive.value = false;
        swipeLockedHorizontal.value = false;

        if (shouldOpen) {
            animateDrawer(0, 1, 120);
            if (!drawerHistoryPushed.value) {
                history.pushState({ gioDrawer: true }, "");
                drawerHistoryPushed.value = true;
            }
        } else {
            animateDrawer(-w, 0, 110);
            window.setTimeout(() => {
                mobileNavOpen.value = false;
            }, 130);
        }
    }

    /* =========================
       ✅ SWIPE CLOSE (drag drawer itself)
       ========================= */
    const touchStartX = ref(0);
    const touchDragging = ref(false);
    const touchStartTranslate = ref(0);

    function onDrawerTouchStart(e) {
        touchDragging.value = true;
        touchStartX.value = e.touches[0].clientX;
        touchStartTranslate.value = drawerTranslateX.value;
    }

    function onDrawerTouchMove(e) {
        if (!touchDragging.value) return;
        const dx = e.touches[0].clientX - touchStartX.value;
        const w = drawerWidth();
        const next = Math.max(-w, Math.min(0, touchStartTranslate.value + dx));
        drawerTranslateX.value = next;
        overlayOpacity.value = 1 - Math.abs(next) / w;
    }

    function onDrawerTouchEnd() {
        if (!touchDragging.value) return;
        touchDragging.value = false;
        if (Math.abs(drawerTranslateX.value) / drawerWidth() > 0.12) closeMobileNav();
        else animateDrawer(0, 1, 120);
    }

    function onGlobalPointerDown(e) {
        if (houseMenuOpen.value) {
            const insideHeaderMenu = e.target?.closest?.("[data-house-menu]");
            if (!insideHeaderMenu) houseMenuOpen.value = false;
        }
        if (!houseActionsOpenId.value) return;
        const insideMenu = e.target?.closest?.("[data-house-actions]");
        const insideButton = e.target?.closest?.("[data-house-actions-btn]");
        if (!insideMenu && !insideButton) houseActionsOpenId.value = null;
    }

    /* =========================
       ✅ Presence bootstrap
       ========================= */
    watch(
        () => house.currentHouseId,
        (houseId) => {
            if (!houseId) return;
            void roomsStore.loadForHouse(houseId).catch(console.error);
            void (async () => {
                const ok = await presence.connect(houseId);
                if (ok) await presence.setRoom("living");
            })();
        },
        { immediate: true }
    );

    /* =========================
       ✅ STATUS (Online / AFK / Offline)
       ========================= */
    const myId = computed(() => session.value?.user?.id ?? null);

    const myUserStatus = computed(() => {
        const id = myId.value;
        if (!id) return "offline";
        const fromServer = presence.users?.[id]?.user_status;
        return fromServer ?? presence.myUserStatus ?? "online";
    });

    const myStatusLabel = computed(() => {
        return (
            {
                online: "Online",
                afk: "AFK",
                offline: "Offline",
            }[myUserStatus.value] || "Online"
        );
    });

    async function cycleMyStatus() {
        if (presence.status !== "ready") return;

        const cur = myUserStatus.value;
        const next = cur === "online" ? "afk" : cur === "afk" ? "offline" : "online";

        await presence.setUserStatus(next);

        if (next === "afk") ui?.toast?.("💤 AFK");
        else if (next === "offline") ui?.toast?.("🔕 Offline");
        else ui?.toast?.("🟢 Online");

        scheduleAfk();
    }

    /* =========================
       ✅ AFK automation (status only — NOT a room)
       ========================= */
    // ✅:דיבוג 5000
    const AFK_MS = 10 * 60 * 1000; // 10 דקות  

    let afkTimer = null;
    let wakeDebounce = null;

    function clearAfkTimer() {
        if (afkTimer) clearTimeout(afkTimer);
        afkTimer = null;
    }

    function scheduleAfk() {
        clearAfkTimer();

        // Offline ידני = לא נוגעים
        if (myUserStatus.value === "offline") return;

        afkTimer = setTimeout(async () => {
            if (myUserStatus.value === "offline") return;
            await presence.setUserStatus("afk");
            ui?.toast?.("💤 עברת ל-AFK");
        }, AFK_MS);
    }

    function onUserActivity() {
        if (myUserStatus.value === "offline") return;

        scheduleAfk();

        if (myUserStatus.value === "afk") {
            if (wakeDebounce) clearTimeout(wakeDebounce);
            wakeDebounce = setTimeout(async () => {
                if (myUserStatus.value !== "offline") {
                    await presence.setUserStatus("online");
                    ui?.toast?.("👋 חזרת");
                }
            }, 600);
        }
    }

    function attachAfkListeners() {
        const opts = { passive: true };
        window.addEventListener("pointerdown", onUserActivity, opts);
        window.addEventListener("pointermove", onUserActivity, opts);
        window.addEventListener("keydown", onUserActivity, opts);
        window.addEventListener("scroll", onUserActivity, opts);
        window.addEventListener("touchstart", onUserActivity, opts);
    }

    function detachAfkListeners() {
        window.removeEventListener("pointerdown", onUserActivity);
        window.removeEventListener("pointermove", onUserActivity);
        window.removeEventListener("keydown", onUserActivity);
        window.removeEventListener("scroll", onUserActivity);
        window.removeEventListener("touchstart", onUserActivity);
    }

    /* =========================
       ✅ Navigation / header / rooms
       ========================= */
    const isHome = computed(() => route.name === "home");
    const isMembers = computed(() => route.name === "members");
    function goHome() {
        router.push({ name: "home" });
    }
    function goMembers() {
        router.push({ name: "members" });
    }

    const currentHouse = computed(() => {
        const list = house.myHouses ?? [];
        return list.find((h) => h.id === house.currentHouseId) ?? null;
    });

    const isPublicHouse = computed(() => !!currentHouse.value?.is_public);
    const headerTitle = computed(() =>
        currentHouse.value?.is_public ? "GIO HOUSE" : currentHouse.value?.name || "My House"
    );

    const houseRail = computed(() => {
        const list = house.myHouses ?? [];
        const sorted = [...list].sort((a, b) => {
            if (a.is_public && !b.is_public) return -1;
            if (!a.is_public && b.is_public) return 1;
            return (a.name || "").localeCompare(b.name || "");
        });
        return sorted;
    });

    const nickname = computed(() => profile.value?.nickname ?? "User");
    const avatarUrl = computed(() => profile.value?.avatar_url ?? null);

    const roomKeys = computed(() => Object.keys(house.rooms || {}));

    function isActiveRoom(roomKey) {
        return route.name === "room" ? String(route.params.id) === roomKey : house.currentRoom === roomKey;
    }

    function roomName(roomKey) {
        return house.rooms?.[roomKey]?.name ?? roomKey;
    }

    function roomIcon(roomKey) {
        const icons = { living: "🛋️", gaming: "🎮", study: "📚", bathroom: "🚿", cinema: "🎬" };
        return icons[roomKey] || "🚪";
    }

    async function enterRoom(roomKey) {
        await presence.setRoom(roomKey);
        house.enterRoom?.(roomKey);
        router.push({ name: "room", params: { id: roomKey } });
    }

    function houseInitial(houseItem) {
        const name = houseItem?.name?.trim();
        return name ? name[0].toUpperCase() : "🏠";
    }

    function switchHouse(houseId) {
        if (!houseId) return;
        house.setCurrentHouse(houseId);
        houseActionsOpenId.value = null;
        if (route.name !== "home" && route.name !== "members") {
            router.push({ name: "home" });
        }
    }

    function openHouseActions(houseId) {
        houseActionsOpenId.value = houseActionsOpenId.value === houseId ? null : houseId;
    }

    function toggleHouseActions(houseId) {
        openHouseActions(houseId);
    }

    function openInviteForHouse(houseId) {
        if (!houseId) return;
        house.setCurrentHouse(houseId);
        openInviteModal.value = true;
        houseActionsOpenId.value = null;
    }

    function openSettingsForHouse(houseId) {
        if (!houseId) return;
        house.setCurrentHouse(houseId);
        openHouseModal.value = true;
        houseActionsOpenId.value = null;
    }

    const retryPresence = () => house.currentHouseId && presence.connect(house.currentHouseId);

    onMounted(() => {
        attachAfkListeners();
        scheduleAfk();

        window.addEventListener("popstate", onPopState);
        window.addEventListener("touchstart", onTouchStartGlobal, { capture: true, passive: true });
        window.addEventListener("touchmove", onTouchMoveGlobal, { capture: true, passive: false });
        window.addEventListener("touchend", onTouchEndGlobal, { capture: true, passive: true });
        window.addEventListener("pointerdown", onGlobalPointerDown, { capture: true });
    });

    onBeforeUnmount(() => {
        detachAfkListeners();
        clearAfkTimer();

        window.removeEventListener("popstate", onPopState);
        window.removeEventListener("touchstart", onTouchStartGlobal, { capture: true });
        window.removeEventListener("touchmove", onTouchMoveGlobal, { capture: true });
        window.removeEventListener("touchend", onTouchEndGlobal, { capture: true });
        window.removeEventListener("pointerdown", onGlobalPointerDown, { capture: true });
    });
</script>

<style>
    :root {
        --gio-bg: #070a0d;
        --gio-panel: #0b0f12;
        --gio-panel2: #0c1116;
        --gio-border: rgba(255, 255, 255, 0.06);
        --gio-green: rgb(34, 197, 94);
        --gio-text-dim: rgba(255, 255, 255, 0.55);
        --gio-text-dimmer: rgba(255, 255, 255, 0.38);
        /* ✅ status colors */
        --gio-online: rgb(34, 197, 94); /* green */
        --gio-afk: rgb(250, 204, 21); /* yellow */
        --gio-offline: rgb(148, 163, 184); /* slate */
    }

    .gio-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 14px 6px;
    }

    .gio-house-badge {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border: 1px solid var(--gio-border);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.015));
        border-radius: 16px;
        box-shadow: 0 0 22px rgba(34, 197, 94, 0.08);
    }

    .gio-house-title {
        font-weight: 800;
        color: rgba(180, 255, 210, 0.92);
        line-height: 1.1;
    }

    .gio-presence-chip {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 999px;
        border: 1px solid var(--gio-border);
        font-size: 12px;
        color: rgba(255, 255, 255, 0.80);
        background: rgba(255,255,255,0.02);
        transition: border-color .18s ease, background .18s ease, transform .10s ease, color .18s ease;
    }

        .gio-presence-chip:active {
            transform: scale(0.98);
        }

    .gio-dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.25);
        transition: background .18s ease, box-shadow .18s ease;
    }

    /* connection ready -> we color by data-user */
    .gio-presence-chip[data-state="ready"][data-user="online"] {
        border-color: rgba(34,197,94,0.45);
        background: rgba(34,197,94,0.10);
        color: rgba(210,255,225,0.92);
    }

        .gio-presence-chip[data-state="ready"][data-user="online"] .gio-dot {
            background: var(--gio-online);
            box-shadow: 0 0 14px rgba(34, 197, 94, 0.35);
        }

    .gio-presence-chip[data-state="ready"][data-user="afk"] {
        border-color: rgba(250,204,21,0.45);
        background: rgba(250,204,21,0.10);
        color: rgba(255,245,200,0.92);
    }

        .gio-presence-chip[data-state="ready"][data-user="afk"] .gio-dot {
            background: var(--gio-afk);
            box-shadow: 0 0 14px rgba(250, 204, 21, 0.32);
        }

    .gio-presence-chip[data-state="ready"][data-user="offline"] {
        border-color: rgba(148,163,184,0.35);
        background: rgba(148,163,184,0.08);
        color: rgba(255,255,255,0.68);
    }

        .gio-presence-chip[data-state="ready"][data-user="offline"] .gio-dot {
            background: var(--gio-offline);
            box-shadow: 0 0 12px rgba(148, 163, 184, 0.22);
        }

    /* connecting / failed */
    .gio-presence-chip[data-state="connecting"] .gio-dot {
        background: rgba(255,255,255,0.18);
    }

    .gio-presence-chip[data-state="failed"] .gio-dot {
        background: rgba(239, 68, 68, 0.8);
        box-shadow: 0 0 14px rgba(239, 68, 68, 0.25);
    }

    .gio-skel-count {
        display: inline-block;
        width: 18px;
        height: 12px;
        border-radius: 6px;
        background: linear-gradient( 90deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.06) );
        background-size: 200% 100%;
        animation: gioShimmer 1.1s ease-in-out infinite;
    }

    @keyframes gioShimmer {
        0% {
            background-position: 0% 0;
        }

        100% {
            background-position: 200% 0;
        }
    }

    .gio-fade {
        animation: gioFade 0.18s ease-out;
    }

    @keyframes gioFade {
        from {
            opacity: 0;
            transform: translateY(4px);
        }

        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style>
