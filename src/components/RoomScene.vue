<template>
    <div class="relative h-full w-full max-w-full box-border overflow-hidden rounded-2xl border border-white/10 bg-black">
        <!-- Background image -->
        <div class="absolute inset-0">
            <div class="absolute inset-0" :style="bgStyle"></div>

            <!-- Soft overlays for readability -->
            <div class="absolute inset-0 bg-gradient-to-b from-black/55 via-black/30 to-black/70"></div>
            <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(34,197,94,0.18),transparent_55%)]"></div>
            <div class="absolute inset-0 backdrop-blur-[1px]"></div>
        </div>

        <!-- Content layer -->
        <div class="relative z-10 h-full w-full">
            <!-- Top-left room badge -->
            <div class="absolute left-3 top-3 md:left-4 md:top-4 flex items-center gap-2">
                <div class="h-10 w-10 rounded-2xl bg-black/40 border border-white/10 shadow-xl flex items-center justify-center">
                    <span class="text-lg">{{ roomIcon }}</span>
                </div>

                <div class="min-w-0">
                    <div class="text-white font-extrabold tracking-tight leading-tight truncate max-w-[50vw]">
                        {{ roomName }}
                    </div>
                    <div class="text-[11px] text-white/50 truncate max-w-[55vw]">
                        {{ subtitle }}
                    </div>
                </div>
            </div>

            <!-- Right-top subtle action pill -->
            <div class="absolute right-3 top-3 md:right-4 md:top-4">
                <div class="px-3 py-2 rounded-2xl bg-black/35 border border-white/10 text-[12px] text-white/70 flex items-center gap-2">
                    <span class="inline-block h-2 w-2 rounded-full bg-green-400/80 shadow-[0_0_14px_rgba(34,197,94,0.6)]"></span>
                    <span class="hidden sm:inline">Room Scene</span>
                    <span class="sm:hidden">Scene</span>
                </div>
            </div>

            <!-- Empty state -->
            <div v-if="!bgUrl" class="absolute inset-0 flex items-center justify-center p-6">
                <div class="w-[min(620px,92vw)] rounded-3xl border border-white/10 bg-black/35 backdrop-blur-md shadow-2xl p-5 md:p-6">
                    <div class="flex items-start gap-3">
                        <div class="h-11 w-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-lg">
                            🖼️
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="text-white font-extrabold">אין רקע לחדר עדיין</div>
                            <div class="text-white/55 text-sm mt-1">
                                אדמין יכול להעלות תמונה ב־<span class="text-white/80 font-bold">Room Manager → Scene</span>.
                            </div>

                            <div class="mt-4 grid grid-cols-3 gap-2">
                                <div class="h-20 rounded-2xl bg-white/5 border border-white/10 animate-pulse"></div>
                                <div class="h-20 rounded-2xl bg-white/5 border border-white/10 animate-pulse"></div>
                                <div class="h-20 rounded-2xl bg-white/5 border border-white/10 animate-pulse"></div>
                            </div>

                            <div class="mt-4 text-[11px] text-white/40">
                                טיפ: תמונה 16:9 (או רחבה) נראית אש. אנחנו עושים cover, אז זה יתאים לכל מסך.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ✅ Characters layer (bottom stage) -->
            <div class="absolute inset-x-0 bottom-0 pointer-events-none"
                 style="height: clamp(140px, 34%, 240px);">
                <!-- stage gradient -->
                <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent"></div>

                <!-- characters row -->
                <div class="absolute left-1/2 bottom-5 -translate-x-1/2 w-[min(980px,96vw)]">
                    <div class="flex items-end justify-center gap-3 md:gap-4 flex-wrap">
                        <div v-for="u in usersHere"
                             :key="u.user_id"
                             class="gio-char"
                             :class="{ 'is-full': !!u?.avatar_full_url, 'is-profile': !u?.avatar_full_url }"
                             :style="{ '--gio-name': normalizeColor(u.color || '#22c55e') }"
                             :title="u.nickname || 'User'">
                            <div class="gio-char__imgwrap">
                                <img v-if="pickAvatar(u)"
                                     :src="pickAvatar(u)"
                                     class="gio-char__img"
                                     :class="{ 'img-full': !!u?.avatar_full_url, 'img-profile': !u?.avatar_full_url }"
                                     alt=""
                                     draggable="false" />
                                <div v-else class="gio-char__fallback">
                                    {{ (u.nickname?.[0] || "•").toUpperCase() }}
                                </div>
                            </div>

                            <!-- אם אתה עוד מתלבט לגבי השם: אפשר להחביא ולהראות רק בהובר / טאץ' -->
                            <div class="gio-char__name">
                                {{ u.nickname || "User" }}
                            </div>
                        </div>

                    </div>

                    <!-- hint -->
                    <div class="mt-3 flex items-center justify-center gap-2 opacity-70">
                        <div class="h-1.5 w-1.5 rounded-full bg-white/60"></div>
                        <div class="h-[1px] w-16 bg-white/25"></div>
                        <div class="text-[11px] text-white/55">
                            כרגע זה “שורה יפה”. אחר כך נזרוק אותם לסצנה אמיתית עם מיקומים.
                        </div>
                        <div class="h-[1px] w-16 bg-white/25"></div>
                        <div class="h-1.5 w-1.5 rounded-full bg-white/60"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { computed } from "vue";
    import { useRoute } from "vue-router";
    import { useRoomsStore } from "../stores/rooms";
    import { usePresenceStore } from "../stores/presence";

    const route = useRoute();
    const roomsStore = useRoomsStore();
    const presence = usePresenceStore();

    // ✅ supports /room/:id and /room/:roomKey / :key
    const roomKey = computed(() =>
        String(route.params.id || route.params.roomKey || route.params.key || "living")
    );

    const room = computed(() => {
        const byKey = roomsStore.byKey?.[roomKey.value];
        if (byKey) return byKey;
        return (roomsStore.rooms || []).find((r) => r?.key === roomKey.value) || null;
    });

    const bgUrl = computed(() => room.value?.scene_background_url || null);

    const bgStyle = computed(() => {
        if (!bgUrl.value) {
            return {
                background:
                    "radial-gradient(circle at 30% 20%, rgba(34,197,94,0.22), transparent 45%)," +
                    "radial-gradient(circle at 80% 30%, rgba(59,130,246,0.18), transparent 45%)," +
                    "linear-gradient(180deg, rgba(0,0,0,0.88), rgba(0,0,0,0.92))",
            };
        }

        return {
            backgroundImage: `url(${bgUrl.value})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            transform: "scale(1.02)",
        };
    });

    const roomName = computed(() => room.value?.name || room.value?.key || "Room");
    const roomIcon = computed(() => room.value?.icon || "🚪");

    const subtitle = computed(() => {
        if (!room.value) return "טוען חדר…";
        return bgUrl.value ? "רקע מותאם לחדר" : "רקע דיפולט עדין";
    });

    // ✅ users in this room (online only)
    const usersHere = computed(() => {
        const list = presence.usersInRoom(roomKey.value) || [];
        return list.filter((u) => (u.user_status ?? "online") === "online");
    });

    // ✅ pick avatar: full first, fallback to profile avatar
    function pickAvatar(u) {
        // אם מאוחר יותר תוסיף presence meta ל-avatar_full_url זה יתחיל לעבוד מיד
        return u?.avatar_full_url || u?.avatar_url || null;
    }

    // ✅ normalize color to HEX if needed (supports hsl(...) stored earlier)
    function normalizeColor(input) {
        const v = String(input || "").trim();
        if (!v) return "#22c55e";
        if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
        if (/^#[0-9a-fA-F]{3}$/.test(v)) {
            const r = v[1], g = v[2], b = v[3];
            return (`#${r}${r}${g}${g}${b}${b}`).toLowerCase();
        }
        const m = v.match(/^hsl\(\s*([0-9.]+)\s*,\s*([0-9.]+)%\s*,\s*([0-9.]+)%\s*\)$/i);
        if (m) return "#22c55e";
        return "#22c55e";
    }
</script>

<style scoped>
    .gio-char {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        user-select: none;
    }

    /* ====== BASE WRAP ====== */
    .gio-char__imgwrap {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        overflow: visible; /* חשוב כדי שהדמות "תנשום" בלי להיחתך */
    }

    /* ====== FULL AVATAR (PNG transparent) ====== */
    .gio-char.is-full .gio-char__imgwrap {
        width: clamp(78px, 8.5vw, 108px);
        height: clamp(92px, 10vw, 128px);
        border: none;
        background: transparent;
        box-shadow: none;
        border-radius: 0;
    }

    .gio-char.is-full .gio-char__img {
        width: 100%;
        height: 100%;
        object-fit: contain; /* לא לחתוך – זה דמות */
        filter: drop-shadow(0 14px 26px rgba(0,0,0,0.55)) saturate(1.02) contrast(1.02);
        transform: translateY(2px);
    }

    /* ====== PROFILE FALLBACK (tile) ====== */
    .gio-char.is-profile .gio-char__imgwrap {
        width: 66px;
        height: 66px;
        border-radius: 22px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(0,0,0,0.35);
        box-shadow: 0 14px 40px rgba(0,0,0,0.40);
        overflow: hidden;
    }

    .gio-char.is-profile .gio-char__img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        filter: saturate(1.05) contrast(1.02);
    }

    /* ====== fallback letter ====== */
    .gio-char__fallback {
        width: 66px;
        height: 66px;
        border-radius: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 900;
        color: rgba(255,255,255,0.85);
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.10);
    }

    /* ====== name pill (אופציונלי) ====== */
    .gio-char__name {
        font-size: 12px;
        font-weight: 900;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(0,0,0,0.35);
        color: rgba(255,255,255,0.85);
        box-shadow: 0 10px 30px rgba(0,0,0,0.35);
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        position: relative;
        padding-left: 24px;
        opacity: 0.95;
    }

        .gio-char__name::before {
            content: "";
            position: absolute;
            left: 10px;
            top: 50%;
            transform: translateY(-50%);
            width: 8px;
            height: 8px;
            border-radius: 999px;
            background: var(--gio-name, #22c55e);
            box-shadow: 0 0 14px rgba(34,197,94,0.35);
        }

    /* אם אתה רוצה “טבעי” יותר: השם יופיע רק בהובר/טאץ' */
    @media (hover: hover) {
        .gio-char.is-full .gio-char__name {
            opacity: 0;
            transform: translateY(-2px);
            transition: 160ms ease;
        }

        .gio-char.is-full:hover .gio-char__name {
            opacity: 0.95;
            transform: translateY(0);
        }
    }

</style>
