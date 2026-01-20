<template>
    <div class="h-full min-h-0 bg-black text-white overflow-hidden flex flex-col">
        <div class="shrink-0 border-b border-white/10 bg-black/30 backdrop-blur">
            <div class="h-14 px-4 flex items-center justify-between">
                <div class="font-extrabold text-green-200">💬 DMs</div>
                <button class="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/40 transition"
                        @click="refresh">
                    Refresh
                </button>
            </div>
            <div class="px-4 pb-3">
                <input v-model="q" @input="onSearch"
                       placeholder="Search users to start a DM…"
                       class="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-sm outline-none
                      focus:border-green-500/30 transition" />
            </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            <!-- Search results -->
            <div v-if="q.trim().length >= 2">
                <div class="text-xs text-white/40 mb-2">Start new</div>
                <div class="space-y-2">
                    <button v-for="u in results" :key="u.id"
                            class="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-green-500/30 transition"
                            @click="startDM(u.id)">
                        <div class="w-10 h-10 rounded-full border border-white/10 overflow-hidden bg-white/5 flex items-center justify-center">
                            <img v-if="u.avatar_url" :src="u.avatar_url" class="w-full h-full object-cover" />
                            <span v-else class="font-bold text-xs">{{ (u.nickname?.[0] || "U").toUpperCase() }}</span>
                        </div>
                        <div class="min-w-0 text-left flex-1">
                            <div class="font-bold truncate">{{ u.nickname || "User" }}</div>
                            <div class="text-[11px] text-white/45 truncate">{{ u.id }}</div>
                        </div>
                    </button>
                </div>
            </div>

            <div class="h-px bg-white/10 my-2"></div>

            <!-- Existing threads -->
            <div class="text-xs text-white/40">Conversations</div>

            <div v-if="threadsStore.loading" class="text-sm text-white/50 p-3">
                Loading…
            </div>

            <div v-else-if="!threads.length" class="text-sm text-white/50 p-3">
                אין עדיין שיחות. תחפש משתמש ותתחיל DM 🙂
            </div>

            <div class="space-y-2">
                <button v-for="t in threads" :key="t.id"
                        class="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-green-500/30 transition"
                        @click="goThread(t.id)">
                    <div class="w-10 h-10 rounded-full border border-white/10 overflow-hidden bg-white/5 flex items-center justify-center">
                        <img v-if="t.otherProfile?.avatar_url" :src="t.otherProfile.avatar_url" class="w-full h-full object-cover" />
                        <span v-else class="font-bold text-xs">{{ (t.otherProfile?.nickname?.[0] || "U").toUpperCase() }}</span>
                    </div>
                    <div class="min-w-0 text-left flex-1">
                        <div class="font-bold truncate">{{ t.otherProfile?.nickname || "User" }}</div>
                        <div class="text-[12px] text-white/55 truncate">
                            {{ t.lastText || "…" }}
                        </div>
                    </div>
                    <div class="text-[10px] text-white/35 shrink-0">
                        {{ fmt(t.lastAt) }}
                    </div>
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "../services/supabase";
import { session } from "../stores/auth";
import { useDMThreadsStore } from "../stores/dmThreads";

const router = useRouter();
const threadsStore = useDMThreadsStore();

const q = ref("");
const results = ref([]);
let searchTimer = null;

const threads = computed(() => threadsStore.threads);

function fmt(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

async function refresh() {
  await threadsStore.loadMyThreads(60);
}

async function onSearch() {
  const text = q.value.trim();
  if (searchTimer) clearTimeout(searchTimer);

  if (text.length < 2) {
    results.value = [];
    return;
  }

  searchTimer = setTimeout(async () => {
    const myId = session.value?.user?.id;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, nickname, avatar_url")
      .ilike("nickname", `%${text}%`)
      .limit(12);

    if (error) {
      console.error(error);
      results.value = [];
      return;
    }

    results.value = (data || []).filter((r) => r.id !== myId);
  }, 220);
}

async function startDM(otherId) {
  const threadId = await threadsStore.openOrCreateDM(otherId);
  await refresh();
  router.push({ name: "dm", params: { threadId } });
}

function goThread(threadId) {
  router.push({ name: "dm", params: { threadId } });
}

    onMounted(async () => {
        const id = await threadsStore.ensureSelfThread();
        await threadsStore.loadMyThreads();
        router.replace({ name: "dm", params: { threadId: id } });
    });

</script>
