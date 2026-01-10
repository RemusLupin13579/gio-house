<template>
    <div class="h-full min-h-0 bg-black text-white overflow-x-hidden overflow-y-auto">
        <!-- Header -->
        <header class="pt-6 sm:pt-8 px-4 text-center">
            <h1 class="text-2xl sm:text-4xl font-extrabold text-green-400 mb-1 sm:mb-2 leading-tight">
                🏠 {{ isPublicHouse ? "GIO HOUSE" : (currentHouse?.name || "My House") }}
            </h1>
            <p class="text-sm sm:text-base text-green-600">
                {{ isPublicHouse ? "איפה כולם עכשיו?" : "מי בבית עכשיו?" }}
            </p>
        </header>

        <!-- Clock area -->
        <section class="flex justify-center py-6 sm:py-8 px-3">
            <div ref="clockWrapEl" class="relative w-[min(92vw,24rem)] aspect-square">
                <div class="absolute inset-0 rounded-full border-4 border-green-500 bg-gradient-to-br from-gray-900 to-black shadow-2xl shadow-green-500/30 overflow-hidden">
                    <div class="absolute inset-0 flex items-center justify-center">
                        <div class="rounded-full bg-gradient-to-br from-green-400 to-green-600 border-4 border-black shadow-xl"
                             :style="{ width: `${centerDot}px`, height: `${centerDot}px` }"></div>
                    </div>

                    <div v-for="room in roomPositions"
                         :key="room.id"
                         class="absolute z-10"
                         :style="getRoomLabelStyle(room.id)">
                        <div class="text-center bg-black/70 px-2 py-1 rounded-lg border border-green-500/50 backdrop-blur">
                            <span class="block" :style="{ fontSize: `${roomEmoji}px` }">
                                {{ room.icon }}
                            </span>
                        </div>
                    </div>

                    <div class="absolute inset-0 rounded-full pointer-events-none z-0"
                         style="background: radial-gradient(circle at 30% 20%, rgba(255,255,255,0.10), transparent 45%);"></div>

                    <div v-if="isPresenceLoading"
                         class="absolute top-3 left-1/2 -translate-x-1/2 z-40 px-3 py-1 rounded-full text-xs font-bold bg-black/70 border border-green-500/40 backdrop-blur">
                        🟢 Syncing…
                    </div>

                    <div v-else-if="isPresenceFailed"
                         class="absolute top-3 left-1/2 -translate-x-1/2 z-40 px-3 py-1 rounded-full text-xs font-bold bg-red-500/10 border border-red-500/40 text-red-200 backdrop-blur">
                        🔴 Realtime offline
                    </div>

                    <div v-if="isPresenceLoading" class="absolute inset-0 z-15 pointer-events-none">
                        <div v-for="u in skeletonUsers"
                             :key="u.id"
                             class="absolute inset-0"
                             :style="{ transform: `rotate(${(ROOM_ANGLE[u.roomKey] ?? ROOM_ANGLE.afk) - 90}deg)` }">
                            <div class="absolute left-1/2 top-1/2 origin-left animate-pulse"
                                 :style="{
                  width: `${baseHandLen}px`,
                  height: `${handThickness}px`,
                  transform: 'translateY(-50%)',
                  borderRadius: '999px',
                  background: 'rgba(34,197,94,0.20)',
                }"></div>

                            <div class="absolute left-1/2 top-1/2"
                                 :style="{ transform: `translate(-50%, -50%) translateX(${baseHandLen}px)` }">
                                <div class="rounded-full border-4 animate-pulse border-green-500/30 bg-green-500/10 shadow-[0_0_20px_rgba(34,197,94,0.25)]"
                                     :style="{ width: `${ghostAvatar}px`, height: `${ghostAvatar}px` }"></div>
                            </div>
                        </div>
                    </div>

                    <div v-for="user in clockUsers"
                         :key="user.id"
                         class="absolute inset-0 z-20 pointer-events-none"
                         :style="{ transform: `rotate(${getUserRotation(user)}deg)` }">
                        <div class="absolute left-1/2 top-1/2 origin-left"
                             :style="{
                width: `${getHandLen(user)}px`,
                height: `${handThickness}px`,
                transform: 'translateY(-50%)',
                backgroundColor: safeColor(user.color),
                boxShadow: `0 0 12px ${safeColor(user.color)}66`,
                borderRadius: '999px',
                opacity: user.status === 'offline' ? '0.25' : '0.85',
              }"></div>

                        <div class="absolute left-1/2 top-1/2"
                             :style="{ transform: `translate(-50%, -50%) translateX(${getHandLen(user)}px)` }">
                            <div :style="{ transform: `rotate(${-getUserRotation(user)}deg)` }">
                                <div data-avatar-btn="1"
                                     @click.stop="toggleTooltip(user.id)"
                                     class="relative z-30 cursor-pointer select-none pointer-events-auto group"
                                     :style="{ width: `${getAvatarSize(user)}px`, height: `${getAvatarSize(user)}px` }">
                                    <div class="w-full h-full rounded-full flex items-center justify-center border-4 transition-transform active:scale-95 hover:scale-110 overflow-hidden"
                                         :style="{
                      borderColor: safeColor(user.color),
                      background: `linear-gradient(135deg, ${safeColor(user.color)}22, ${safeColor(user.color)}44)`,
                      boxShadow: `0 0 20px ${safeColor(user.color)}88`,
                      opacity: user.status === 'offline' ? '0.35' : '1',
                    }">
                                        <img v-if="user.avatar && (String(user.avatar).startsWith('http') || String(user.avatar).startsWith('blob:'))"
                                             :src="user.avatar"
                                             alt="avatar"
                                             class="w-full h-full object-cover" />
                                        <span v-else :class="getAvatarFontClass(user)">
                                            {{ user.avatar || (user.name ? user.name[0] : "🙂") }}
                                        </span>
                                    </div>

                                    <div class="absolute -bottom-1 -right-1 rounded-full border-2 border-black"
                                         :class="getStatusColor(user.status)"
                                         :style="{ width: `${statusDot}px`, height: `${statusDot}px` }"></div>

                                    <div class="absolute -bottom-9 left-1/2 -translate-x-1/2 bg-black/90 px-3 py-1 rounded-lg border whitespace-nowrap text-xs font-bold pointer-events-none opacity-0 transition-opacity"
                                         :class="activeTooltipUserId === user.id ? 'opacity-100' : 'group-hover:opacity-100'"
                                         :style="{ borderColor: safeColor(user.color), color: safeColor(user.color) }">
                                        {{ user.name }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="absolute inset-0 rounded-full pointer-events-none z-0" style="box-shadow: inset 0 0 80px rgba(34,197,94,0.12);"></div>
                </div>
            </div>
        </section>

        <!-- Rooms list -->
        <section class="max-w-lg mx-auto px-4 pb-10">
            <h2 class="text-green-400 font-bold mb-4 text-lg sm:text-xl text-center">
                🚪 חדרים זמינים
            </h2>

            <div class="space-y-3">
                <button v-for="room in Object.entries(house.rooms)"
                        :key="room[0]"
                        @click="enterRoom(room[0])"
                        class="w-full bg-gradient-to-r from-gray-900 to-gray-800 border border-green-500/40 rounded-2xl p-4 hover:border-green-400/70 hover:shadow-xl hover:shadow-green-500/20 transition-all active:scale-[0.99]">
                    <div class="flex items-center justify-between gap-3">
                        <div class="flex items-center gap-3 sm:gap-4">
                            <span class="text-3xl sm:text-4xl">{{ getRoomIcon(room[0]) }}</span>

                            <div class="text-right">
                                <div class="text-white font-bold text-base sm:text-lg">
                                    {{ room[1].name }}
                                </div>

                                <div class="text-green-500 text-sm">
                                    <span v-if="presence.status === 'connecting'" class="gio-skel-count"></span>
                                    <span v-else>{{ `${presence.usersInRoom(room[0]).length} בפנים` }}</span>
                                </div>
                            </div>
                        </div>

                        <div class="text-green-400 text-xl sm:text-2xl">←</div>
                    </div>

                    <div v-if="presence.usersInRoom(room[0]).length > 0" class="mt-3 pt-3">
                        <div class="h-px w-full bg-gradient-to-r from-transparent via-green-500/40 to-transparent mb-3"></div>

                        <div class="flex flex-row flex-wrap gap-2 justify-end items-center">
                            <div v-for="u in presence.usersInRoom(room[0]).slice(0, 8)"
                                 :key="u.user_id"
                                 class="w-8 h-8 rounded-full border-2 border-green-400/50 overflow-hidden bg-black/50 flex-shrink-0"
                                 :title="u.nickname">
                                <img v-if="u.avatar_url" :src="u.avatar_url" class="w-full h-full object-cover" alt="" />
                                <div v-else class="w-full h-full flex items-center justify-center text-xs text-green-200">
                                    {{ (u.nickname?.[0] ?? "•") }}
                                </div>
                            </div>

                            <div v-if="presence.usersInRoom(room[0]).length > 8" class="text-green-400 text-xs font-bold">
                                +{{ presence.usersInRoom(room[0]).length - 8 }}
                            </div>
                        </div>
                    </div>
                </button>
            </div>
        </section>
    </div>
</template>

<script setup>
    import { computed, ref, onMounted, onBeforeUnmount, watch } from "vue";
    import { useHouseStore } from "../stores/house";
    import { useRouter } from "vue-router";
    import { usePresenceStore } from "../stores/presence";

    const warmup = ref(true);
    const router = useRouter();
    const house = useHouseStore();
    const presence = usePresenceStore();

    const activeTooltipUserId = ref(null);

    const isPresenceLoading = computed(() => presence.status === "connecting" || warmup.value);
    const isPresenceFailed = computed(() => presence.status === "failed");

    const skeletonUsers = computed(() => [
        { id: "s1", roomKey: "living" },
        { id: "s2", roomKey: "gaming" },
        { id: "s3", roomKey: "cinema" },
        { id: "s4", roomKey: "bathroom" },
        { id: "s5", roomKey: "study" },
        { id: "s6", roomKey: "afk" },
    ]);

    const currentHouse = computed(() => {
        const list = house.myHouses ?? [];
        const id = house.currentHouseId;
        return list.find((h) => h.id === id);
    });
    const isPublicHouse = computed(() => !!currentHouse.value?.is_public);

    const clockUsers = computed(() => {
        const list = Object.values(presence.users || {});
        return list
            .map((u) => ({
                id: u.user_id ?? u.id,
                name: u.nickname ?? "User",
                avatar: u.avatar_url ?? null,
                color: u.color ?? "#22c55e",
                status: "online",
                roomKey: u.room_name ?? "living",
            }))
            .filter((u) => !!u.id)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    });

    function toggleTooltip(userId) {
        activeTooltipUserId.value = activeTooltipUserId.value === userId ? null : userId;
    }
    function closeTooltip() {
        activeTooltipUserId.value = null;
    }
    function onDocPointerDown(e) {
        const insideAvatar = e.target?.closest?.('[data-avatar-btn="1"]');
        if (!insideAvatar) closeTooltip();
    }

    const clockWrapEl = ref(null);
    const clockSize = ref(0);
    let ro = null;

    function updateClockSize() {
        if (!clockWrapEl.value) return;
        clockSize.value = Math.round(clockWrapEl.value.getBoundingClientRect().width || 0);
    }

    onMounted(() => {
        const t = setTimeout(() => (warmup.value = false), 1200);
        watch(
            () => Object.keys(presence.users || {}).length,
            (n) => { if (n > 0) warmup.value = false; },
            { immediate: true }
        );

        document.addEventListener("pointerdown", onDocPointerDown);

        updateClockSize();
        ro = new ResizeObserver(() => updateClockSize());
        if (clockWrapEl.value) ro.observe(clockWrapEl.value);

        return () => clearTimeout(t);
    });

    onBeforeUnmount(() => {
        document.removeEventListener("pointerdown", onDocPointerDown);
        if (ro && clockWrapEl.value) ro.unobserve(clockWrapEl.value);
        ro = null;
    });

    const radius = computed(() => Math.max(110, Math.min(170, Math.floor(clockSize.value * 0.40))));
    const baseHandLen = computed(() => Math.max(100, Math.min(160, Math.floor(clockSize.value * 0.38))));
    const handThickness = computed(() => Math.max(3, Math.min(5, Math.floor(clockSize.value * 0.012))));
    const centerDot = computed(() => Math.max(9, Math.min(14, Math.floor(clockSize.value * 0.035))));
    const roomEmoji = computed(() => Math.max(18, Math.min(28, Math.floor(clockSize.value * 0.06))));
    const ghostAvatar = computed(() => Math.max(44, Math.min(54, Math.floor(clockSize.value * 0.14))));
    const statusDot = computed(() => Math.max(14, Math.min(20, Math.floor(clockSize.value * 0.05))));

    const roomPositions = computed(() => [
        { id: "living", name: "סלון", icon: "🛋️" },
        { id: "gaming", name: "גיימינג", icon: "🎮" },
        { id: "study", name: "לימוד", icon: "📚" },
        { id: "bathroom", name: "שירותים", icon: "🚿" },
        { id: "cinema", name: "קולנוע", icon: "🎬" },
        { id: "afk", name: "לא פה", icon: "😴" },
    ]);

    const ROOM_ANGLE = {
        living: 0,
        gaming: 60,
        cinema: 120,
        bathroom: 180,
        study: 240,
        afk: 300,
    };

    function safeColor(c) {
        return typeof c === "string" && c.startsWith("#") ? c : "#22c55e";
    }

    function getHandLen(user) {
        const sameRoom = clockUsers.value
            .filter((u) => u.roomKey === user.roomKey)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));

        const idx = sameRoom.findIndex((u) => u.id === user.id);
        return baseHandLen.value + idx * Math.max(6, Math.floor(clockSize.value * 0.02));
    }

    function getRoomLabelStyle(roomId) {
        const angleDeg = (ROOM_ANGLE[roomId] ?? ROOM_ANGLE.afk) - 90;
        const rad = (angleDeg * Math.PI) / 180;

        const x = Math.cos(rad) * radius.value;
        const y = Math.sin(rad) * radius.value;

        return {
            left: `calc(50% + ${x}px)`,
            top: `calc(50% + ${y}px)`,
            transform: "translate(-50%, -50%)",
        };
    }

    function getUserRotation(user) {
        const base = (ROOM_ANGLE[user.roomKey] ?? ROOM_ANGLE.afk) - 90;

        const sameRoom = clockUsers.value
            .filter((u) => u.roomKey === user.roomKey)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));

        const idx = sameRoom.findIndex((u) => u.id === user.id);

        const step = 10;
        const offset = (idx - (sameRoom.length - 1) / 2) * step;

        return base + offset;
    }

    function getAvatarSize(user) {
        const count = clockUsers.value.filter((u) => u.roomKey === user.roomKey).length;
        const base = Math.max(44, Math.min(60, Math.floor(clockSize.value * 0.15)));

        if (count >= 7) return Math.max(40, base - 12);
        if (count >= 5) return Math.max(44, base - 8);
        if (count >= 3) return Math.max(48, base - 4);
        return base;
    }

    function getAvatarFontClass(user) {
        const s = getAvatarSize(user);
        if (s <= 44) return "text-xl";
        if (s <= 50) return "text-2xl";
        return "text-3xl";
    }

    function getStatusColor(status) {
        return (
            {
                online: "bg-green-400",
                afk: "bg-yellow-400",
                offline: "bg-gray-600",
            }[status] || "bg-gray-600"
        );
    }

    function getRoomIcon(roomId) {
        const icons = {
            living: "🛋️",
            gaming: "🎮",
            bathroom: "🚿",
            study: "📚",
            cinema: "🎬",
        };
        return icons[roomId] || "🚪";
    }

    async function enterRoom(roomKey) {
        house.enterRoom(roomKey);
        await presence.setRoom(roomKey);
        router.push(`/room/${roomKey}`);
    }
</script>

<style scoped>
    .active\:scale-98:active {
        transform: scale(0.98);
    }
</style>
