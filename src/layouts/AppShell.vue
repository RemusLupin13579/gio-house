<template>

    <div class="h-screen w-screen bg-black text-white flex overflow-hidden">

        <!-- Left icon rail -->
        <aside class="w-16 bg-[#0b0f12] border-r border-white/5 flex flex-col items-center py-3 gap-3">

            <!-- Home -->
            <button class="w-11 h-11 rounded-2xl flex items-center justify-center border border-white/10 hover:border-green-500/50 transition"
                    :class="isHome ? 'bg-green-500/20 border-green-500/60' : 'bg-white/5'"
                    @click="goHome"
                    title="Home">
                🏠
            </button>

            <!-- Houses (+) -->
            <button class="w-11 h-11 rounded-2xl flex items-center justify-center border border-white/10 bg-white/5 hover:border-green-500/50 transition"
                    @click="openHouseModal = true"
                    title="Houses">
                ➕
            </button>

            <div class="flex-1"></div>

            <!-- Profile -->
            <button class="w-11 h-11 rounded-2xl flex items-center justify-center border border-white/10 bg-white/5 hover:border-green-500/50 transition"
                    title="Profile">
                👤
            </button>
        </aside>

        <!-- Left panel: house + rooms -->
        <section class="w-72 bg-[#0c1116] border-r border-white/5 flex flex-col">
            <!-- House header -->
            <div class="h-20 px-4 flex items-center justify-between border-b border-white/5">

                <div class="flex items-center gap-2">
                    <!-- GIO Top Status Bar -->
                    <div class="gio-topbar">
                        <div class="gio-topbar__left">
                            <div class="gio-house-badge">
                                <span class="gio-house-emoji">{{ isPublicHouse ? '🌍' : '🏠' }}</span>
                                <div class="gio-house-text">
                                    <div class="gio-house-title">
                                        {{ isPublicHouse ? 'GIO HOUSE' : (currentHouse?.name || 'My House') }}
                                    </div>
                                    <div class="gio-house-subtitle">
                                        {{ isPublicHouse ? 'איפה כולם עכשיו?' : 'מי בבית עכשיו?' }}
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

                        <!-- Tiny dropdown -->
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

                <!-- כרגע: החדרים עדיין מה-store שלך (hardcoded),
            בהמשך נחליף ל-rooms מה-DB לפי currentHouseId -->
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

            <!-- Bottom profile bar -->
            <div class="h-14 px-3 border-t border-white/5 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <div class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center">
                        <img v-if="avatarUrl" :src="avatarUrl" class="w-full h-full object-cover" alt="" />
                        <span v-else>🙂</span>
                    </div>
                    <div class="leading-tight">
                        <!-- שם משתמש -->
                        <div class="font-bold">{{ nickname }}</div>

                        <div class="gio-topbar__right">
                            <!-- Presence status -->
                            <div class="h-5 gio-presence-chip" :data-state="presence.status">
                                <span class="gio-dot" />
                                <span v-if="presence.status === 'ready'">Online</span>

                                <span v-else-if="presence.status === 'connecting'" class="gio-sync">
                                    Syncing
                                    <span class="gio-dots"><i></i><i></i><i></i></span>
                                </span>

                                <span v-else-if="presence.status === 'failed'">
                                    Offline
                                </span>

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

        <!-- Main content -->
        <main class="flex-1 bg-black overflow-hidden">
            <div class="gio-fade" :key="house.currentHouseId">
                <RouterView />
            </div>
        </main>


        <!-- house switcher model -->
        <HouseSwitcherModal v-if="openHouseModal" @close="openHouseModal=false" />

    </div>
</template>

<script setup>
/**
 * AppShell: ה-"Discord layout"
 * - עוטף את כל המסכים הפנימיים (Home/Room)
 * - Login/Onboarding נשארים מחוץ ל-shell (דרך router nesting)
 */
import HouseSwitcherModal from "../components/HouseSwitcherModal.vue";
import { computed, ref, watch, onMounted, onBeforeUnmount } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import { supabase } from "../services/supabase";
import { useHouseStore } from "../stores/house";
import { usePresenceStore } from "../stores/presence";
import { profile } from "../stores/auth";

const router = useRouter();
const route = useRoute();

const house = useHouseStore();
const presence = usePresenceStore();

const openHouseModal = ref(false);
const houseMenuOpen = ref(false);

// קליק מחוץ לתפריט הבית יסגור אותו
function onDocPointerDown(e) {
  if (!e.target?.closest?.("[data-house-menu]")) {
    houseMenuOpen.value = false;
  }
}

    onMounted(async () => {
        document.addEventListener("pointerdown", onDocPointerDown);

        house.hydrateCurrentHouse?.();

        // אם אין currentHouseId, דואגים לפחות לבית הציבורי
        if (!house.currentHouseId) {
            const { data, error } = await supabase.rpc("ensure_public_house_membership");
            if (!error && data) {
                house.setCurrentHouse?.(data);
            }
        }

        // ✅ טוען את רשימת הבתים כדי ש-headerTitle יציג שם אמיתי
        await house.loadMyHouses();

        // ✅ חיבור presence לבית הנוכחי
        if (house.currentHouseId) {
            // ✅ לא חוסמים boot, ולא נתקעים אם realtime בעייתי
            void (async () => {
                const ok = await presence.connect(house.currentHouseId);
                if (ok) await presence.setRoom("living");
            })();
        }

    });


onBeforeUnmount(() => document.removeEventListener("pointerdown", onDocPointerDown));

// כשהבית מתחלף → מחברים presence מחדש לערוץ הנכון
    watch(
        () => house.currentHouseId,
        (houseId) => {
            if (!houseId) return;

            // ✅ best-effort, בלי await (אין סיבה לחסום רנדר)
            void (async () => {
                const ok = await presence.connect(houseId);
                if (ok) await presence.setRoom("living");
            })();
        }
    );


const isHome = computed(() => route.name === "home");
function goHome() {
  router.push({ name: "home" });
}

// כותרת בית (בינתיים fallback אם אין myHouses)
const currentHouse = computed(() => {
  const list = house.myHouses ?? [];
  return list.find((h) => h.id === house.currentHouseId) ?? null;
});

const isPublicHouse = computed(() => !!currentHouse.value?.is_public)

const headerTitle = computed(() => {
  if (currentHouse.value?.is_public) return "GIO HOUSE";
  return currentHouse.value?.name || "My House";
});

const headerSubtitle = computed(() => (currentHouse.value?.is_public ? "איפה כולם עכשיו?" : "מי בבית עכשיו?"));

const nickname = computed(() => profile.value?.nickname ?? "User");
const avatarUrl = computed(() => profile.value?.avatar_url ?? null);

// חדרים (כרגע hardcoded מה-store)
const roomKeys = computed(() => Object.keys(house.rooms || {}));

function isActiveRoom(roomKey) {
  // אם אתה ב-room route, תסתכל על param
  if (route.name === "room") return String(route.params.id) === roomKey;
  // אם לא, לפי ה-store
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
  // presence חייב להיות מחובר לבית הנוכחי
    // ✅ AppShell כבר דואג לחיבור לבית הנוכחי.
    // כאן רק מעדכנים חדר.
    await presence.setRoom(roomKey);



  house.enterRoom?.(roomKey);
  router.push({ name: "room", params: { id: roomKey } });
    }

</script>

<style>
    :root {
        --gio-bg: #070a0d;
        --gio-panel: #0b0f12;
        --gio-panel2: #0c1116;
        --gio-border: rgba(255,255,255,.06);
        --gio-green: rgb(34,197,94);
        --gio-green2: rgba(34,197,94,.22);
        --gio-text-dim: rgba(255,255,255,.55);
        --gio-text-dimmer: rgba(255,255,255,.38);
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
        background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015));
        border-radius: 16px;
        box-shadow: 0 0 22px rgba(34,197,94,.08);
    }

    .gio-house-emoji {
        font-size: 20px;
        filter: drop-shadow(0 0 10px rgba(34,197,94,.20));
    }

    .gio-house-title {
        font-weight: 800;
        letter-spacing: .2px;
        color: rgba(180,255,210,.92);
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
        background: rgba(255,255,255,.03);
        font-size: 12px;
        color: rgba(255,255,255,.75);
        position: relative;
        overflow: hidden;
    }

        .gio-presence-chip[data-state="ready"] {
            border-color: rgba(34,197,94,.35);
            box-shadow: 0 0 18px rgba(34,197,94,.10);
        }

        .gio-presence-chip[data-state="connecting"] {
            border-color: rgba(34,197,94,.25);
        }

        .gio-presence-chip[data-state="failed"] {
            border-color: rgba(239,68,68,.35);
            color: rgba(255,200,200,.85);
        }

    .gio-dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: rgba(255,255,255,.25);
        box-shadow: 0 0 12px rgba(255,255,255,.12);
    }

    .gio-presence-chip[data-state="ready"] .gio-dot {
        background: rgb(34,197,94);
        box-shadow: 0 0 14px rgba(34,197,94,.35);
    }

    .gio-presence-chip[data-state="connecting"] .gio-dot {
        background: rgba(34,197,94,.55);
        animation: gioPulse 1.1s ease-in-out infinite;
    }

    .gio-presence-chip[data-state="failed"] .gio-dot {
        background: rgb(239,68,68);
        box-shadow: 0 0 14px rgba(239,68,68,.30);
    }

    @keyframes gioPulse {
        0%,100% {
            transform: scale(1);
            opacity: .75;
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
            background: rgba(34,197,94,.85);
            display: inline-block;
            animation: gioDots .95s infinite ease-in-out;
        }

            .gio-dots i:nth-child(2) {
                animation-delay: .15s;
                opacity: .8;
            }

            .gio-dots i:nth-child(3) {
                animation-delay: .30s;
                opacity: .65;
            }

    @keyframes gioDots {
        0%,100% {
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
        border: 1px solid rgba(239,68,68,.35);
        background: rgba(239,68,68,.10);
        color: rgba(255,220,220,.95);
        font-weight: 700;
        cursor: pointer;
        transition: transform .12s ease, border-color .12s ease;
    }

        .gio-retry-btn:hover {
            border-color: rgba(239,68,68,.55);
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
        background: linear-gradient(90deg, rgba(255,255,255,.06), rgba(255,255,255,.12), rgba(255,255,255,.06) );
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
        animation: gioFade .18s ease-out;
    }

    @keyframes gioFade {
        from {
            opacity: .0;
            transform: translateY(4px);
        }

        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

</style>