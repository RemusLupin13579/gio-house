<template>
    <div class="h-full min-h-0 bg-black text-white overflow-y-auto">
        <header class="px-4 pt-5 pb-4 border-b border-white/10 flex items-center justify-between">
            <div>
                <div class="text-green-300 font-bold text-lg">Members</div>
                <div class="text-xs text-white/50">{{ houseTitle }}</div>
            </div>
            <button class="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/40 transition"
                    @click="goHome">
                חזרה
            </button>
        </header>

        <div class="p-4">
            <div class="flex flex-wrap gap-2 text-xs text-white/60 mb-4">
                <span class="px-2 py-1 rounded-full bg-white/5 border border-white/10">
                    Online: {{ counts.online }}
                </span>
                <span class="px-2 py-1 rounded-full bg-white/5 border border-white/10">
                    AFK: {{ counts.afk }}
                </span>
                <span class="px-2 py-1 rounded-full bg-white/5 border border-white/10">
                    Offline: {{ counts.offline }}
                </span>
            </div>

            <div v-if="sortedMembers.length === 0" class="text-sm text-white/60 text-center py-10">
                אין משתמשים כרגע
            </div>

            <div v-else class="space-y-2">
                <div v-for="member in sortedMembers"
                     :key="member.user_id"
                     class="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full border border-white/10 overflow-hidden bg-black/40 flex items-center justify-center">
                            <img v-if="member.avatar_url" :src="member.avatar_url" class="w-full h-full object-cover" alt="" />
                            <span v-else class="text-sm">{{ member.nickname?.[0] ?? "🙂" }}</span>
                        </div>

                        <div>
                            <div class="font-semibold">{{ member.nickname || "User" }}</div>
                            <div class="text-xs text-white/50">{{ statusLabel(member.user_status) }}</div>
                        </div>
                    </div>

                    <span class="text-xs px-2 py-1 rounded-full border"
                          :class="statusChipClass(member.user_status)">
                        {{ statusLabel(member.user_status) }}
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { computed } from "vue";
    import { useRouter } from "vue-router";
    import { usePresenceStore } from "../stores/presence";
    import { useHouseStore } from "../stores/house";

    const router = useRouter();
    const presence = usePresenceStore();
    const houseStore = useHouseStore();

    const currentHouse = computed(() => {
        const list = houseStore.myHouses ?? [];
        return list.find((h) => h.id === houseStore.currentHouseId) ?? null;
    });

    const houseTitle = computed(() =>
        currentHouse.value?.is_public ? "GIO HOUSE" : currentHouse.value?.name || "My House"
    );

    const members = computed(() => Object.values(presence.users || {}));

    const counts = computed(() => {
        const tally = { online: 0, afk: 0, offline: 0 };
        for (const member of members.value) {
            const status = member.user_status || "online";
            if (status in tally) tally[status] += 1;
        }
        return tally;
    });

    const statusOrder = { online: 0, afk: 1, offline: 2 };

    const sortedMembers = computed(() =>
        [...members.value].sort((a, b) => {
            const aStatus = statusOrder[a.user_status || "online"] ?? 99;
            const bStatus = statusOrder[b.user_status || "online"] ?? 99;
            if (aStatus !== bStatus) return aStatus - bStatus;
            return (a.nickname || "").localeCompare(b.nickname || "");
        })
    );

    function statusLabel(status) {
        return (
            {
                online: "Online",
                afk: "AFK",
                offline: "Offline",
            }[status] || "Online"
        );
    }

    function statusChipClass(status) {
        if (status === "afk") return "border-yellow-500/40 text-yellow-200 bg-yellow-500/10";
        if (status === "offline") return "border-slate-400/30 text-slate-200/70 bg-slate-400/10";
        return "border-green-500/40 text-green-200 bg-green-500/10";
    }

    function goHome() {
        router.push({ name: "home" });
    }
</script>
