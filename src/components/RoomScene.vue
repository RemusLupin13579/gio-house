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

            <!-- Bottom stage -->
            <div class="absolute inset-x-0 bottom-0 h-[28%] pointer-events-none">
                <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent"></div>
                <div class="absolute left-1/2 bottom-6 -translate-x-1/2 w-[min(720px,92vw)]">
                    <div class="flex items-center justify-center gap-2 opacity-70">
                        <div class="h-1.5 w-1.5 rounded-full bg-white/60"></div>
                        <div class="h-[1px] w-16 bg-white/25"></div>
                        <div class="text-[11px] text-white/55">בקרוב: אוואטרים בסצנה + אינטראקציות</div>
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

    const route = useRoute();
    const roomsStore = useRoomsStore();

    // ✅ FIX: תומך גם ב /room/:id וגם ב /room/:roomKey / :key
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
</script>
