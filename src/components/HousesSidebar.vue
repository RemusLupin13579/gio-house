<template>
    <div class="flex h-full flex-col items-center gap-3 py-3 max-w-[60vw] mx-auto text-center">
        <div class="flex w-full flex-col items-center gap-3">
            <button v-for="houseItem in housesList"
                    :key="houseItem.id"
                    class="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 transition"
                    :class="houseItem.id === currentHouseId
                        ? 'bg-green-500/20 border-green-500/60 ring-2 ring-green-500/40'
                        : 'bg-white/5 hover:border-green-500/50'"
                    @click="$emit('select-house', houseItem.id)"
                    :title="houseItem.name || 'House'">
                <span v-if="houseItem.is_public">🌍</span>
                <span v-else>{{ houseInitial(houseItem) }}</span>
            </button>
        </div>

        <div class="flex-1"></div>

        <button class="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 transition hover:border-green-500/50"
                @click="$emit('open-add')"
                title="Create or join house">
            ➕
        </button>
    </div>
</template>

<script setup>
    import { computed } from "vue";

    const props = defineProps({
        houses: { type: Array, default: () => [] },
        currentHouseId: { type: [String, Number], default: null },
    });

    defineEmits(["select-house", "open-add"]);

    const housesList = computed(() => props.houses ?? []);

    function houseInitial(houseItem) {
        const name = houseItem?.name?.trim();
        return name ? name[0].toUpperCase() : "🏠";
    }
</script>
