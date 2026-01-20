<template>
    <div class="h-full min-h-0 bg-black text-white overflow-x-hidden overflow-y-auto">
        <!-- Header -->
        <header class="pt-6 sm:pt-8 px-4 text-center">
            <h1 class="text-2xl sm:text-4xl font-extrabold text-green-400 mb-1 sm:mb-2 leading-tight mx-auto">
                🏠 {{ isPublicHouse ? "GIO HOUSE" : (currentHouse?.name || "My House") }}
            </h1>
            <p class="text-sm sm:text-base text-green-600 mx-auto">
                {{ isPublicHouse ? "?איפה כולם עכשיו" : "?מי עכשיו בבית" }}
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

                    <!-- Skeleton -->
                    <div v-if="isPresenceLoading" class="absolute inset-0 z-15 pointer-events-none">
                        <div v-for="u in skeletonUsers"
                             :key="u.id"
                             class="absolute inset-0"
                             :style="{ transform: `rotate(${angleFor(u.roomKey) - 90}deg)` }">
                            <!-- ✅ keep skeleton hand consistent with real hand limits -->
                            <div class="absolute left-1/2 top-1/2 origin-left animate-pulse"
                                 :style="{
                                    width: `${Math.min(baseHandLen, maxHandLen)}px`,
                                    height: `${handThickness}px`,
                                    transform: 'translateY(-50%)',
                                    borderRadius: '999px',
                                    background: 'rgba(34,197,94,0.20)',
                                  }"></div>

                            <div class="absolute left-1/2 top-1/2"
                                 :style="{
                                    transform: `translate(-50%, -50%) translateX(${Math.min(baseHandLen, maxHandLen)}px)`,
                                  }">
                                <div class="rounded-full border-4 animate-pulse border-green-500/30 bg-green-500/10 shadow-[0_0_20px_rgba(34,197,94,0.25)]"
                                     :style="{ width: `${ghostAvatar}px`, height: `${ghostAvatar}px` }"></div>
                            </div>
                        </div>
                    </div>


                    <!-- Real users -->
                    <div v-for="user in clockUsers"
                         :key="user.id"
                         class="absolute inset-0 z-20 pointer-events-none"
                         :style="{ transform: `rotate(${getUserRotation(user)}deg)` }">
                        <!-- hand -->
                        <div class="absolute left-1/2 top-1/2 origin-left"
                             :style="handStyle(user)"></div>


                        <!-- avatar -->
                        <div class="absolute left-1/2 top-1/2"
                             :style="{ transform: `translate(-50%, -50%) translateX(${getHandLen(user)}px)` }">
                            <div :style="{ transform: `rotate(${-getUserRotation(user)}deg)` }">
                                <div data-avatar-btn="1"
                                     class="relative z-30 cursor-pointer select-none pointer-events-auto group"
                                     :style="{ width: `${getAvatarSize(user)}px`, height: `${getAvatarSize(user)}px` }"
                                     @click.stop="toggleTooltip(user, $event)">
                                    <div class="w-full h-full rounded-full flex items-center justify-center border-4 transition-transform active:scale-95 hover:scale-110 overflow-hidden"
                                         :style="{
                      borderColor: statusColor(user.status, user.color),
                      background: `linear-gradient(135deg, ${statusColor(user.status, user.color)}22, ${statusColor(user.status, user.color)}44)`,
                      boxShadow: `0 0 20px ${statusColor(user.status, user.color)}88`,
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
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="absolute inset-0 rounded-full pointer-events-none z-0"
                         style="box-shadow: inset 0 0 80px rgba(34,197,94,0.12);"></div>
                </div>
            </div>
        </section>

        <!-- Rooms list -->
        <section class="max-w-lg mx-auto px-4 pb-10">
            <h2 class="text-green-400 font-bold mb-4 text-lg sm:text-xl text-center">
                🚪 חדרים זמינים
            </h2>

            <div class="space-y-3">
                <button v-for="room in activeRooms"
                        :key="room.id"
                        @click="enterRoom(room.key)"
                        class="w-full bg-gradient-to-r from-gray-900 to-gray-800 border border-green-500/40 rounded-2xl p-4 hover:border-green-400/70 hover:shadow-xl hover:shadow-green-500/20 transition-all active:scale-[0.99]">
                    <div class="flex items-center justify-between gap-3">
                        <div class="flex items-center gap-3 sm:gap-4">
                            <span class="text-3xl sm:text-4xl">{{ room.icon || "🚪" }}</span>

                            <div class="text-right">
                                <div class="text-white font-bold text-base sm:text-lg">
                                    {{ room.name || room.key }}
                                </div>

                                <div class="text-green-500 text-sm">
                                    <span v-if="presence.status === 'connecting'" class="gio-skel-count"></span>
                                    <span v-else>{{ `${presence.usersInRoom(room.key).length} בפנים` }}</span>
                                </div>
                            </div>
                        </div>

                        <div class="text-green-400 text-xl sm:text-2xl">←</div>
                    </div>

                    <div v-if="presence.usersInRoom(room.key).length > 0" class="mt-3 pt-3">
                        <div class="h-px w-full bg-gradient-to-r from-transparent via-green-500/40 to-transparent mb-3"></div>

                        <div class="flex flex-row flex-wrap gap-2 justify-end items-center">
                            <div v-for="u in presence.usersInRoom(room.key).slice(0, 8)"
                                 :key="u.user_id"
                                 class="w-8 h-8 rounded-full border-2 border-green-400/50 overflow-hidden bg-black/50 flex-shrink-0"
                                 :title="u.nickname">
                                <img v-if="u.avatar_url" :src="u.avatar_url" class="w-full h-full object-cover" alt="" />
                                <div v-else class="w-full h-full flex items-center justify-center text-xs text-green-200">
                                    {{ (u.nickname?.[0] ?? "•") }}
                                </div>
                            </div>

                            <div v-if="presence.usersInRoom(room.key).length > 8" class="text-green-400 text-xs font-bold">
                                +{{ presence.usersInRoom(room.key).length - 8 }}
                            </div>
                        </div>
                    </div>
                </button>

                <div v-if="roomsStore.loading" class="text-center text-white/50 py-6">
                    טוען חדרים…
                </div>

                <div v-else-if="activeRooms.length === 0" class="text-center text-white/50 py-6">
                    אין חדרים פעילים בבית הזה
                </div>
            </div>
        </section>

        <!-- ✅ Tooltip (Teleport -> body so it never gets clipped by the clock) -->
        <Teleport to="body">
            <div v-if="tooltip.open" class="gio-tooltip-backdrop" @click="closeTooltip()"></div>

            <div v-if="tooltip.open"
                 data-tooltip="1"
                 class="gio-tooltip"
                 :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
                <div class="gio-tooltip__name">{{ tooltip.name }}</div>
                <div class="gio-tooltip__row">
                    <span class="gio-tooltip__pill" :data-status="tooltip.status">
                        {{ statusLabel(tooltip.status) }}
                    </span>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<script setup>
    import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
    import { useHouseStore } from "../stores/house";
    import { useRouter } from "vue-router";
    import { usePresenceStore } from "../stores/presence";
    import { useRoomsStore } from "../stores/rooms";

    const warmup = ref(true);
    const router = useRouter();
    const house = useHouseStore();
    const presence = usePresenceStore();
    const roomsStore = useRoomsStore();

    const activeTooltipUserId = ref(null);

    const tooltip = ref({
        open: false,
        x: 0,
        y: 0,
        name: "",
        status: "offline",
        color: "#22c55e",
    });

    const isPresenceLoading = computed(() => presence.status === "connecting" || warmup.value);
    const isPresenceFailed = computed(() => presence.status === "failed");

    const skeletonUsers = computed(() => {
        // משתמשים בפועל מה-roomPositions (שכבר כולל lobby/living/afk/…)
        const keys = (roomPositions.value || [])
            .map(r => r.id)
            .filter(Boolean);

        // אם אין עדיין (בזמן טעינה מוזרה) – fallback מינימלי
        const base = keys.length ? keys : ["lobby", "living", "bathroom", "afk"];

        // מייצר “רוחות” לפי כמה חדרים יש, בלי hardcode
        return base.map((rk, i) => ({ id: `s${i + 1}`, roomKey: rk }));
    });


    const currentHouse = computed(() => {
        const list = house.myHouses ?? [];
        const id = house.currentHouseId;
        return list.find((h) => h.id === id);
    });
    const isPublicHouse = computed(() => !!currentHouse.value?.is_public);

    // ✅ make sure rooms are loaded
    watch(
        () => house.currentHouseId,
        async (hid) => {
            if (!hid) return;
            await roomsStore.loadForHouse(hid);
        },
        { immediate: true }
    );

    const activeRooms = computed(() => roomsStore.activeRooms ?? []);

    // ✅ build clock users
    const clockUsers = computed(() => {
        const list = Object.values(presence.users || {});

        return list
            .map((u) => {
                const id = u.user_id ?? u.id;
                const baseRoom = u.room_name ?? u.last_room ?? "lobby";
                const st = u.user_status ?? "online";
                const ts = Number(u.ts || 0);
                const roomKeyForClock = (st === "afk" || st === "offline") ? "afk" : baseRoom;

                return {
                    id,
                    name: u.nickname ?? "User",
                    avatar: u.avatar_url ?? null,
                    color: u.color ?? "#22c55e",
                    status: st,
                    roomKey: roomKeyForClock,
                    ts,
                };
            })
            .filter((u) => u && u.id && u.roomKey)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    });

    function safeColor(c) {
        return typeof c === "string" && c.startsWith("#") ? c : "#22c55e";
    }

    function statusColor(status, base) {
        if (status === "afk") return "#facc15";
        if (status === "offline") return "#94a3b8";
        return safeColor(base);
    }

    function statusLabel(s) {
        return (
            {
                online: "Online",
                afk: "AFK",
                offline: "Offline",
            }[s] || "Offline"
        );
    }

    function clamp(n, min, max) {
        return Math.max(min, Math.min(max, n));
    }

    function openTooltipForUser(user, anchorEl) {
        if (!anchorEl) return;

        const r = anchorEl.getBoundingClientRect();

        const pad = 12;
        const tipW = 210;
        const tipH = 70;

        let x = r.left + r.width / 2;
        let y = r.top - 12;

        if (y < pad + tipH) y = r.bottom + 12;

        x = clamp(x, pad + tipW / 2, window.innerWidth - pad - tipW / 2);
        y = clamp(y, pad + tipH, window.innerHeight - pad);

        tooltip.value = {
            open: true,
            x,
            y,
            name: user.name ?? "User",
            status: user.status ?? "offline",
            color: statusColor(user.status, user.color),
        };
    }

    function toggleTooltip(user, e) {
        const el = e?.currentTarget;
        if (!el) return;

        if (activeTooltipUserId.value === user.id && tooltip.value.open) {
            closeTooltip();
            return;
        }

        activeTooltipUserId.value = user.id;
        nextTick(() => openTooltipForUser(user, el));
    }

    function closeTooltip() {
        activeTooltipUserId.value = null;
        tooltip.value.open = false;
    }

    function onDocPointerDown(e) {
        const insideAvatar = e.target?.closest?.('[data-avatar-btn="1"]');
        const insideTooltip = e.target?.closest?.('[data-tooltip="1"]');
        if (!insideAvatar && !insideTooltip) closeTooltip();
    }

    const clockWrapEl = ref(null);
    const clockSize = ref(0);
    let ro = null;

    function updateClockSize() {
        if (!clockWrapEl.value) return;
        clockSize.value = Math.round(clockWrapEl.value.getBoundingClientRect().width || 0);
    }

    onMounted(() => {
        if (presence.status === "ready") presence.setRoom("lobby");
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
    function getRoomLabelStyle(roomId) {
        const angleDeg = ((angleMap.value[roomId] ?? angleMap.value.afk ?? 180) - 90);
        const rad = (angleDeg * Math.PI) / 180;
        const x = Math.cos(rad) * radius.value;
        const y = Math.sin(rad) * radius.value;

        return {
            left: `calc(50% + ${x}px)`,
            top: `calc(50% + ${y}px)`,
            transform: "translate(-50%, -50%)",
        };
    }

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

    const roomPositions = computed(() => {
        const fromDb = (roomsStore.rooms ?? roomsStore.activeRooms ?? []).map(r => ({
            id: r.key,
            name: r.name || r.key,
            icon: r.icon || "🚪",
        }));

        // נוודא שיש living גם אם הוא DB, ונוסיף fixed במידה ואין
        const byId = new Map(fromDb.map(x => [x.id, x]));

        byId.set("lobby", { id: "lobby", name: "לובי", icon: "🏛️" });
        byId.set("living", { id: "living", name: "סלון", icon: "🛋️" });
        byId.set("bathroom", byId.get("bathroom") ?? { id: "bathroom", name: "שירותים", icon: "🚿" });
        byId.set("afk", { id: "afk", name: "AFK", icon: "😴" });

        // סדר תצוגה: לפי הזווית המחושבת (נראה “עגול”)
        return [...byId.values()]
            .filter(x => !!x?.id)
            .sort((a, b) => (angleMap.value[a.id] ?? 999) - (angleMap.value[b.id] ?? 999));
    });

    function hexToRgba(hex, a) {
        if (typeof hex !== "string" || !hex.startsWith("#")) return `rgba(34,197,94,${a})`;
        const h = hex.replace("#", "");
        const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
        const r = parseInt(full.slice(0, 2), 16);
        const g = parseInt(full.slice(2, 4), 16);
        const b = parseInt(full.slice(4, 6), 16);
        return `rgba(${r},${g},${b},${a})`;
    }

    const labelRadius = computed(() => radius.value); // איפה שהאייקונים יושבים

    // ✅ מרווח ביטחון מהאייקון: תלוי גודל אווטאר + עוד קצת
    const handSafetyGap = computed(() => {
        // שומר מרווח קבוע + מרווח שמושפע מגודל אווטאר טיפוסי
        const approxAvatar = Math.max(44, Math.min(60, Math.floor(clockSize.value * 0.15)));
        return Math.max(26, Math.round(approxAvatar / 2) + 10); // 26–40 בערך
    });

    const maxHandLen = computed(() => {
        // היד לא תגיע לאייקונים
        return Math.max(72, Math.floor(labelRadius.value - handSafetyGap.value));
    });
    function handStyle(user) {
        const len = getHandLen(user);
        const c = statusColor(user.status, user.color);
        const soft = hexToRgba(c, 0.20);
        const mid = hexToRgba(c, 0.55);
        const hard = hexToRgba(c, user.status === "offline" ? 0.35 : (user.status === "afk" ? 0.75 : 0.95));

        const opacity =
            user.status === "offline" ? 0.25 :
                user.status === "afk" ? 0.65 : 0.85;

        return {
            width: `${len}px`,
            height: `${handThickness.value}px`,
            transform: "translateY(-50%)",
            borderRadius: "999px",

            // ✅ שובל איכותי במקום פס
            background: `linear-gradient(90deg, rgba(0,0,0,0) 0%, ${soft} 35%, ${mid} 70%, ${hard} 100%)`,

            // ✅ עומק עדין (לא זוהר זול)
            boxShadow: `0 0 10px ${hexToRgba(c, 0.20)}`,

            // ✅ עושה את הקו “רך” יותר
            filter: "blur(0.2px)",

            opacity,
        };
    }

    const FIXED = [
        { key: "lobby", desired: 0 },       // top
        { key: "living", desired: 30 },     // high-ish
        { key: "afk", desired: 180 },       // bottom
        { key: "bathroom", desired: 240 },  // low-left-ish
    ];

    function wrapDeg(d) {
        d = d % 360;
        return d < 0 ? d + 360 : d;
    }

    function closestIndex(angles, desired, taken) {
        let best = -1;
        let bestDist = Infinity;
        for (let i = 0; i < angles.length; i++) {
            if (taken.has(i)) continue;
            const a = angles[i];
            let dist = Math.abs(a - desired);
            dist = Math.min(dist, 360 - dist);
            if (dist < bestDist) {
                bestDist = dist;
                best = i;
            }
        }
        return best;
    }

    const angleMap = computed(() => {
        // ✅ החדרים הדינאמיים (מה-DB)
        const dbKeys = (roomsStore.rooms ?? roomsStore.activeRooms ?? [])
            .map(r => r.key)
            .filter(Boolean);

        // ✅ תוודא שאין כפילויות ושלא נכפיל fixed
        const fixedKeys = new Set(FIXED.map(x => x.key));
        const otherKeys = [...new Set(dbKeys)].filter(k => !fixedKeys.has(k));

        // ✅ כמה סלוטים? fixed + אחרים
        const total = FIXED.length + otherKeys.length;
        const step = 360 / Math.max(1, total);
        const slots = Array.from({ length: total }, (_, i) => wrapDeg(i * step));

        // ✅ משבצים את העוגנים לסלוטים הכי קרובים ל-desired
        const taken = new Set();
        const map = {};

        for (const f of FIXED) {
            const idx = closestIndex(slots, f.desired, taken);
            if (idx !== -1) {
                taken.add(idx);
                map[f.key] = slots[idx];
            }
        }

        // ✅ שאר הסלוטים הפנויים לפי סדר יציב (אלפביתי כדי שלא יקפוץ)
        const freeIdx = slots
            .map((a, i) => ({ a, i }))
            .filter(x => !taken.has(x.i))
            .sort((x, y) => x.a - y.a);

        const stableOthers = otherKeys.slice().sort((a, b) => a.localeCompare(b));

        stableOthers.forEach((k, n) => {
            map[k] = freeIdx[n]?.a ?? wrapDeg((n + 1) * step);
        });

        return map;
    });


    function getHandLen(user) {
        if (!user || !user.roomKey) return baseHandLen.value;
        const sameRoom = clockUsers.value
            .filter((u) => u.roomKey === user.roomKey)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));

        const idx = sameRoom.findIndex((u) => u.id === user.id);

        // ✅ סטגר קטן (כמו שהיה), אבל לא נותנים לו לברוח
        const step = Math.max(6, Math.floor(clockSize.value * 0.018)); // קצת עדין יותר מ-0.02
        const proposed = baseHandLen.value + idx * step;

        // ✅ clamp כדי לא לעבור את קו האייקונים
        return Math.min(proposed, maxHandLen.value);
    }

    function angleFor(roomKey) {
        return (angleMap.value?.[roomKey] ?? angleMap.value?.afk ?? 180);
    }


    function getUserRotation(user) {
        if (!user || !user.roomKey) return ((angleMap.value.afk ?? 180) - 90);
        const base = (angleMap.value[user.roomKey] ?? angleMap.value.afk ?? 180) - 90;
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
                offline: "bg-slate-400",
            }[status] || "bg-slate-400"
        );
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

    .gio-tooltip-backdrop {
        position: fixed;
        inset: 0;
        z-index: 999998;
        background: transparent;
    }

    .gio-tooltip {
        position: fixed;
        z-index: 999999;
        transform: translate(-50%, -100%);
        min-width: 180px;
        max-width: 240px;
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(8, 10, 12, 0.92);
        backdrop-filter: blur(6px);
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.55);
    }

    .gio-tooltip__name {
        font-weight: 900;
        color: rgba(255, 255, 255, 0.92);
        font-size: 13px;
        line-height: 1.1;
        margin-bottom: 6px;
    }

    .gio-tooltip__row {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .gio-tooltip__pill {
        font-size: 11px;
        font-weight: 900;
        padding: 3px 8px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.80);
    }

        .gio-tooltip__pill[data-status="online"] {
            border-color: rgba(34, 197, 94, 0.35);
            background: rgba(34, 197, 94, 0.12);
            color: rgba(210, 255, 225, 0.92);
        }

        .gio-tooltip__pill[data-status="afk"] {
            border-color: rgba(250, 204, 21, 0.35);
            background: rgba(250, 204, 21, 0.12);
            color: rgba(255, 245, 200, 0.92);
        }

        .gio-tooltip__pill[data-status="offline"] {
            border-color: rgba(148, 163, 184, 0.30);
            background: rgba(148, 163, 184, 0.10);
            color: rgba(255, 255, 255, 0.70);
        }
</style>
