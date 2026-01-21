<template>
    <div class="relative h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
        <div class="absolute inset-0">
            <!-- ✅ real image layer (reliable) -->
            <img v-if="bgUrl"
                 :src="bgUrl"
                 class="absolute inset-0 w-full h-full object-cover scale-[1.02]"
                 alt=""
                 loading="eager"
                 decoding="async"
                 referrerpolicy="no-referrer" />

            <!-- ✅ fallback gradient when no bg -->
            <div v-else
                 class="absolute inset-0"
                 :style="fallbackStyle"></div>

            <!-- overlays -->
            <div class="absolute inset-0 bg-gradient-to-b from-black/35 via-black/15 to-black/55"></div>
            <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(34,197,94,0.16),transparent_55%)]"></div>
            <div class="absolute inset-0 backdrop-blur-[0.5px]"></div>
        </div>

        <div class="relative z-10 h-full w-full">
            <div class="absolute left-3 top-3 md:left-4 md:top-4 flex items-center gap-2">
                <div class="h-10 w-10 rounded-2xl bg-black/40 border border-white/10 shadow-xl flex items-center justify-center">
                    <span class="text-lg">💬</span>
                </div>
                <div class="min-w-0">
                    <div class="text-white font-extrabold tracking-tight leading-tight truncate max-w-[60vw]">
                        {{ otherName }}
                    </div>
                    <div class="text-[11px] text-white/50 truncate max-w-[70vw]">
                        {{ hasBg ? "DM Scene" : "ברירת מחדל" }}
                    </div>
                </div>
            </div>

            <div class="absolute inset-x-0 bottom-0 p-4">
                <div class="mx-auto w-[min(560px,92vw)] rounded-2xl border border-white/10 bg-black/35 backdrop-blur-md shadow-2xl px-4 py-2.5">
                    <div class="text-[12px] text-white/75 font-bold">
                        {{ otherCaption }}
                    </div>
                    <div class="text-[11px] text-white/45 mt-0.5">
                        טיפ: אפשר להעלות תמונה משלך ל-DM בהגדרות פרופיל.
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { computed } from "vue";

    const props = defineProps({
        otherProfile: { type: Object, default: null },
        isSelf: { type: Boolean, default: false },
    });

    const otherName = computed(() =>
        props.isSelf ? (props.otherProfile?.nickname || "You") : (props.otherProfile?.nickname || "User")
    );

    const otherCaption = computed(() =>
        props.isSelf
            ? (props.otherProfile?.dm_scene_caption || "החדר הפרטי שלך. כן, מותר לדבר עם עצמך 😄")
            : (props.otherProfile?.dm_scene_caption || "הסצנה הזו שייכת לצד השני 👀")
    );

    const bgUrl = computed(() => props.otherProfile?.dm_scene_background_url || null);
    const hasBg = computed(() => !!bgUrl.value);

    const fallbackStyle = computed(() => ({
        background:
            "radial-gradient(circle at 30% 20%, rgba(34,197,94,0.22), transparent 45%)," +
            "radial-gradient(circle at 80% 30%, rgba(59,130,246,0.16), transparent 45%)," +
            "linear-gradient(180deg, rgba(0,0,0,0.90), rgba(0,0,0,0.93))",
    }));
</script>
