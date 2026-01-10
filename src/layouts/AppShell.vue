<template>
    <!-- ✅ AppShell (Mobile-first, Discord-like) -->
    <div class="h-[100dvh] w-screen bg-black text-white overflow-hidden flex flex-col md:flex-row">
        <!-- ========================= -->
        <!-- ✅ MOBILE TOP BAR (HIDE IN ROOM) -->
        <!-- ========================= -->
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

            <button class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/50 transition active:scale-[0.98]"
                    @click="openHouseModal = true"
                    title="Houses">
                ➕
            </button>
        </div>

        <!-- ========================= -->
        <!-- ✅ DESKTOP ICON RAIL       -->
        <!-- ========================= -->
        <aside class="hidden md:flex w-16 bg-[#0b0f12] border-r border-white/5 flex-col items-center py-3 gap-3">
            <button class="w-11 h-11 rounded-2xl flex items-center justify-center border border-white/10 hover:border-green-500/50 transition"
                    :class="isHome ? 'bg-green-500/20 border-green-500/60' : 'bg-white/5'"
                    @click="goHome"
                    title="Home">
                🏠
            </button>

            <button class="w-11 h-11 rounded-2xl flex items-center justify-center border border-white/10 bg-white/5 hover:border-green-500/50 transition"
                    @click="openHouseModal = true"
                    title="Houses">
                ➕
            </button>

            <div class="flex-1"></div>

            <button class="w-11 h-11 rounded-2xl flex items-center justify-center border border-white/10 bg-white/5 hover:border-green-500/50 transition"
                    title="Profile">
                👤
            </button>
        </aside>

        <!-- ========================= -->
        <!-- ✅ DESKTOP LEFT PANEL      -->
        <!-- ========================= -->
        <section class="hidden md:flex w-72 bg-[#0c1116] border-r border-white/5 flex-col">
            <!-- House header -->
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
                            <button class="w-full px-3 py-2 text-right hover:bg-white/5" @click="openHouseModal = true; houseMenuOpen=false">
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

            <!-- Rooms list -->
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

                        <div class="gio-topbar__right">
                            <div class="h-5 gio-presence-chip" :data-state="presence.status">
                                <span class="gio-dot" />
                                <span v-if="presence.status === 'ready'">Online</span>
                                <span v-else-if="presence.status === 'connecting'" class="gio-sync">
                                    Syncing
                                    <span class="gio-dots"><i></i><i></i><i></i></span>
                                </span>
                                <span v-else-if="presence.status === 'failed'">Offline</span>
                                <span v-else>Idle</span>

                                <button v-if="presence.status === 'failed'"
                                        class="gio-retry-btn"
                                        @click="retryPresence"
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

        <!-- ========================= -->
        <!-- ✅ MAIN CONTENT            -->
        <!-- ========================= -->
        <main class="flex-1 bg-black overflow-hidden min-h-0">
            <div class="gio-fade h-full min-h-0" :key="house.currentHouseId">
                <RouterView />
            </div>
        </main>

        <!-- ========================= -->
        <!-- ✅ MOBILE DRAWER OVERLAY   -->
        <!-- ========================= -->
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
                                        title="Profile">
                                    👤
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

                    <div class="h-14 px-3 border-t border-white/10 flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <div class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center">
                                <img v-if="avatarUrl" :src="avatarUrl" class="w-full h-full object-cover" alt="" />
                                <span v-else>🙂</span>
                            </div>
                            <div class="leading-tight">
                                <div class="font-bold">{{ nickname }}</div>
                                <div class="text-xs text-white/50">
                                    {{ presence.status === 'ready' ? 'Online' : presence.status }}
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

        <HouseSwitcherModal v-if="openHouseModal" @close="openHouseModal=false" />
    </div>
</template>

<script setup>
    import HouseSwitcherModal from "../components/HouseSwitcherModal.vue";
    import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
    import { RouterView, useRoute, useRouter } from "vue-router";
    import { useHouseStore } from "../stores/house";
    import { usePresenceStore } from "../stores/presence";
    import { profile } from "../stores/auth";
    import { useRoomsStore } from "../stores/rooms";

    const roomsStore = useRoomsStore();
    const router = useRouter();
    const route = useRoute();

    const house = useHouseStore();
    const presence = usePresenceStore();

    const openHouseModal = ref(false);
    const houseMenuOpen = ref(false);

    const showMobileTopBar = computed(() => route.name !== "room");

    /* =========================
       ✅ MOBILE DRAWER STATE
       ========================= */
    const mobileNavOpen = ref(false);
    const drawerTranslateX = ref(-400);
    const overlayOpacity = ref(0);

    function drawerWidth() {
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

        // ✅ Make Android back close the drawer first
        if (!drawerHistoryPushed.value) {
            history.pushState({ gioDrawer: true }, "");
            drawerHistoryPushed.value = true;
        }
    }

    function closeMobileNav() {
        if (!mobileNavOpen.value) return;

        const w = drawerWidth();
        animateDrawer(-w, 0, 140);

        window.setTimeout(() => {
            mobileNavOpen.value = false;
        }, 155);

        // ✅ remove the drawer history state without navigating away
        if (drawerHistoryPushed.value) {
            suppressNextPop = true;
            history.back(); // triggers popstate; we ignore once
            drawerHistoryPushed.value = false;
        }
    }

    /* ✅ Freeze background when drawer open */
    watch(mobileNavOpen, (open) => {
        if (open) {
            document.documentElement.style.overflow = "hidden";
            document.body.style.overflow = "hidden";
        } else {
            document.documentElement.style.overflow = "";
            document.body.style.overflow = "";
        }
    });

    function onPopState() {
        if (suppressNextPop) {
            suppressNextPop = false;
            return;
        }
        if (mobileNavOpen.value) closeMobileNav();
    }

    /* =========================
       ✅ FULL-SCREEN SWIPE OPEN (Discord-like)
       No overlay, no blocked taps.
       ========================= */
    const swipeActive = ref(false);
    const swipeLockedHorizontal = ref(false);
    const startX = ref(0);
    const startY = ref(0);

    const SYS_EDGE_PX = 12;          // avoid true system edge
    const INTENT_SLOP = 6;           // decide direction fast
    const OPEN_COMMIT_RATIO = 0.12;  // open with less movement
    const CLOSE_COMMIT_RATIO = 0.12; // close with less movement
    const SWIPE_GAIN = 1.9;          // less movement needed

    function isMobile() {
        return window.matchMedia?.("(max-width: 767px)")?.matches ?? (window.innerWidth < 768);
    }

    function shouldIgnoreTarget(target) {
        // don’t hijack typing/clicking on inputs/buttons
        const el = target?.closest?.("input, textarea, select, button, [contenteditable='true']");
        return !!el;
    }

    function onTouchStartGlobal(e) {
        if (!isMobile()) return;
        if (mobileNavOpen.value) return;

        const t = e.touches?.[0];
        if (!t) return;

        if (shouldIgnoreTarget(e.target)) return;

        // avoid very edge (Android gesture nav)
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

            // vertical => scroll
            if (Math.abs(dy) > Math.abs(dx) * 1.15) {
                swipeActive.value = false;
                return;
            }

            // lock horizontal
            swipeLockedHorizontal.value = true;

            // mount drawer DOM in "closed" state so we can drag it
            mobileNavOpen.value = true;
            const w = drawerWidth();
            drawerTranslateX.value = -w;
            overlayOpacity.value = 0;
        }

        // Only once locked as horizontal we prevent scroll
        e.preventDefault();

        const w = drawerWidth();
        const openPx = Math.max(0, dx) * SWIPE_GAIN;
        const translate = Math.max(-w, Math.min(0, -w + openPx));

        drawerTranslateX.value = translate;

        const openness = 1 - Math.abs(translate) / w;
        overlayOpacity.value = Math.max(0, Math.min(1, openness));
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

            // ensure back closes drawer
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

        const x = e.touches[0].clientX;
        const dx = x - touchStartX.value;

        const w = drawerWidth();
        const next = Math.max(-w, Math.min(0, touchStartTranslate.value + dx));

        drawerTranslateX.value = next;

        const openness = 1 - Math.abs(next) / w;
        overlayOpacity.value = Math.max(0, Math.min(1, openness));
    }

    function onDrawerTouchEnd() {
        if (!touchDragging.value) return;
        touchDragging.value = false;

        const w = drawerWidth();
        const closedAmount = Math.abs(drawerTranslateX.value) / w;

        if (closedAmount > CLOSE_COMMIT_RATIO) closeMobileNav();
        else animateDrawer(0, 1, 120);
    }

    /* =========================
       ✅ Presence bootstrap (critical)
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
        { immediate: true } // ✅ do it even if houseId already exists before mount
    );

    /* =========================
       ✅ Navigation / header / rooms
       ========================= */
    const isHome = computed(() => route.name === "home");
    function goHome() {
        router.push({ name: "home" });
    }

    const currentHouse = computed(() => {
        const list = house.myHouses ?? [];
        return list.find((h) => h.id === house.currentHouseId) ?? null;
    });

    const isPublicHouse = computed(() => !!currentHouse.value?.is_public);

    const headerTitle = computed(() => {
        if (currentHouse.value?.is_public) return "GIO HOUSE";
        return currentHouse.value?.name || "My House";
    });

    const nickname = computed(() => profile.value?.nickname ?? "User");
    const avatarUrl = computed(() => profile.value?.avatar_url ?? null);

    const roomKeys = computed(() => Object.keys(house.rooms || {}));

    function isActiveRoom(roomKey) {
        if (route.name === "room") return String(route.params.id) === roomKey;
        return house.currentRoom === roomKey;
    }

    function roomName(roomKey) {
        return house.rooms?.[roomKey]?.name ?? roomKey;
    }

    function roomIcon(roomKey) {
        const icons = {
            living: "🛋️",
            gaming: "🎮",
            study: "📚",
            bathroom: "🚿",
            cinema: "🎬",
            afk: "💤",
        };
        return icons[roomKey] || "🚪";
    }

    async function enterRoom(roomKey) {
        await presence.setRoom(roomKey);
        house.enterRoom?.(roomKey);
        router.push({ name: "room", params: { id: roomKey } });
    }

    const retryPresence = () => {
        if (!house.currentHouseId) return;
        void presence.connect(house.currentHouseId);
    };

    /* =========================
       ✅ Mount listeners
       ========================= */
    function onResize() {
        // no-op here (kept for future tuning if needed)
    }

    onMounted(() => {
        window.addEventListener("popstate", onPopState);
        window.addEventListener("resize", onResize);

        // ✅ Full screen swipe listeners:
        // touchmove must be passive:false for preventDefault to work
        window.addEventListener("touchstart", onTouchStartGlobal, { capture: true, passive: true });
        window.addEventListener("touchmove", onTouchMoveGlobal, { capture: true, passive: false });
        window.addEventListener("touchend", onTouchEndGlobal, { capture: true, passive: true });
    });

    onBeforeUnmount(() => {
        window.removeEventListener("popstate", onPopState);
        window.removeEventListener("resize", onResize);

        window.removeEventListener("touchstart", onTouchStartGlobal, { capture: true });
        window.removeEventListener("touchmove", onTouchMoveGlobal, { capture: true });
        window.removeEventListener("touchend", onTouchEndGlobal, { capture: true });
    });
</script>

<style>
    /* נשאר כמו שהיה אצלך */
    :root {
        --gio-bg: #070a0d;
        --gio-panel: #0b0f12;
        --gio-panel2: #0c1116;
        --gio-border: rgba(255, 255, 255, 0.06);
        --gio-green: rgb(34, 197, 94);
        --gio-green2: rgba(34, 197, 94, 0.22);
        --gio-text-dim: rgba(255, 255, 255, 0.55);
        --gio-text-dimmer: rgba(255, 255, 255, 0.38);
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

    .gio-house-emoji {
        font-size: 20px;
        filter: drop-shadow(0 0 10px rgba(34, 197, 94, 0.2));
    }

    .gio-house-title {
        font-weight: 800;
        letter-spacing: 0.2px;
        color: rgba(180, 255, 210, 0.92);
        line-height: 1.1;
    }

    .gio-house-subtitle {
        margin-top: 2px;
        font-size: 12px;
        color: var(--gio-text-dimmer);
    }

    .gio-presence-chip {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 999px;
        border: 1px solid var(--gio-border);
        background: rgba(255, 255, 255, 0.03);
        font-size: 12px;
        color: rgba(255, 255, 255, 0.75);
        position: relative;
        overflow: hidden;
    }

        .gio-presence-chip[data-state="ready"] {
            border-color: rgba(34, 197, 94, 0.35);
            box-shadow: 0 0 18px rgba(34, 197, 94, 0.1);
        }

        .gio-presence-chip[data-state="connecting"] {
            border-color: rgba(34, 197, 94, 0.25);
        }

        .gio-presence-chip[data-state="failed"] {
            border-color: rgba(239, 68, 68, 0.35);
            color: rgba(255, 200, 200, 0.85);
        }

    .gio-dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.25);
        box-shadow: 0 0 12px rgba(255, 255, 255, 0.12);
    }

    .gio-presence-chip[data-state="ready"] .gio-dot {
        background: rgb(34, 197, 94);
        box-shadow: 0 0 14px rgba(34, 197, 94, 0.35);
    }

    .gio-presence-chip[data-state="connecting"] .gio-dot {
        background: rgba(34, 197, 94, 0.55);
        animation: gioPulse 1.1s ease-in-out infinite;
    }

    .gio-presence-chip[data-state="failed"] .gio-dot {
        background: rgb(239, 68, 68);
        box-shadow: 0 0 14px rgba(239, 68, 68, 0.3);
    }

    @keyframes gioPulse {
        0%, 100% {
            transform: scale(1);
            opacity: 0.75;
        }

        50% {
            transform: scale(1.25);
            opacity: 1;
        }
    }

    .gio-dots {
        display: inline-flex;
        gap: 4px;
        margin-right: 6px;
    }

        .gio-dots i {
            width: 4px;
            height: 4px;
            border-radius: 999px;
            background: rgba(34, 197, 94, 0.85);
            display: inline-block;
            animation: gioDots 0.95s infinite ease-in-out;
        }

            .gio-dots i:nth-child(2) {
                animation-delay: 0.15s;
                opacity: 0.8;
            }

            .gio-dots i:nth-child(3) {
                animation-delay: 0.3s;
                opacity: 0.65;
            }

    @keyframes gioDots {
        0%, 100% {
            transform: translateY(0);
        }

        50% {
            transform: translateY(-4px);
        }
    }

    .gio-retry-btn {
        margin-right: 8px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid rgba(239, 68, 68, 0.35);
        background: rgba(239, 68, 68, 0.1);
        color: rgba(255, 220, 220, 0.95);
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.12s ease, border-color 0.12s ease;
    }

        .gio-retry-btn:hover {
            border-color: rgba(239, 68, 68, 0.55);
            transform: translateY(-1px);
        }

        .gio-retry-btn:active {
            transform: translateY(0);
        }

    .gio-skel-count {
        display: inline-block;
        width: 18px;
        height: 12px;
        border-radius: 6px;
        background: linear-gradient( 90deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.06) );
        background-size: 200% 100%;
        animation: gioShimmer 1.1s ease-in-out infinite;
        vertical-align: middle;
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
