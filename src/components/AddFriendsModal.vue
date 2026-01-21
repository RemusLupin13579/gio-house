<template>
    <div class="fixed inset-0 z-[10060]">
        <div class="absolute inset-0 bg-black/55 backdrop-blur-sm" @click="$emit('close')"></div>

        <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                w-[min(520px,92vw)] rounded-2xl border border-white/10 bg-[#0b0f12]/95 shadow-2xl overflow-hidden">
            <div class="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <div class="font-extrabold text-white/90">Add Friends</div>
                <button class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/40 transition"
                        @click="$emit('close')">
                    ✕
                </button>
            </div>

            <div class="p-4">
                <div class="flex items-center gap-2">
                    <input v-model="q"
                           @input="debouncedSearch"
                           placeholder="חפש משתמש לפי כינוי…"
                           class="flex-1 h-10 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm outline-none
                   focus:border-green-500/30" />
                    <button class="h-10 px-4 rounded-2xl bg-white/5 border border-white/10 hover:border-green-500/30 transition"
                            @click="searchNow">
                        Search
                    </button>
                </div>

                <div class="mt-3 text-[11px] text-white/45">
                    טיפ: חפש לפי nickname. (בהמשך נוסיף גם #tag או חיפוש מתקדם)
                </div>

                <div class="mt-4">
                    <div v-if="loading" class="text-sm text-white/60 py-4">טוען…</div>
                    <div v-else-if="!results.length && q.trim()" class="text-sm text-white/50 py-4">
                        לא מצאתי אף אחד. או שכולם מתחבאים ממך. (מובן.)
                    </div>

                    <div class="space-y-2">
                        <button v-for="u in results"
                                :key="u.id"
                                class="w-full px-3 py-2 rounded-2xl bg-white/5 border border-white/10 hover:border-green-500/30 transition
                     flex items-center gap-3 text-left"
                                @click="startDM(u.id)">
                            <div class="w-10 h-10 rounded-2xl border border-white/10 overflow-hidden bg-black/30 flex items-center justify-center">
                                <img v-if="u.avatar_url" :src="u.avatar_url" class="w-full h-full object-cover" />
                                <span v-else class="font-extrabold text-xs text-white/70">{{ (u.nickname?.[0] || "U").toUpperCase() }}</span>
                            </div>

                            <div class="min-w-0 flex-1">
                                <div class="font-bold truncate text-white/90">{{ u.nickname || "User" }}</div>
                                <div class="text-[11px] text-white/45 truncate">לחץ כדי לפתוח DM</div>
                            </div>

                            <div class="text-white/40">➜</div>
                        </button>
                    </div>

                    <div v-if="error" class="mt-3 text-[11px] text-red-300/80">
                        {{ error }}
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref } from "vue";
import { supabase } from "../services/supabase";
import { session } from "../stores/auth";
import { useDMThreadsStore } from "../stores/dmThreads";
import { useRouter } from "vue-router";

    const emit = defineEmits(["close"]);

const router = useRouter();
const dmThreads = useDMThreadsStore();

const q = ref("");
const results = ref([]);
const loading = ref(false);
const error = ref("");

let t = null;
function debouncedSearch() {
  clearTimeout(t);
  t = setTimeout(searchNow, 250);
}

async function searchNow() {
  const query = q.value.trim();
  error.value = "";
  results.value = [];
  if (!query) return;

  const myId = session.value?.user?.id;
  loading.value = true;

  try {
    // חיפוש פשוט לפי nickname
    // חשוב: דורש RLS שמאפשר SELECT על profiles (לפחות nickname/avatar_url)
    const { data, error: e } = await supabase
      .from("profiles")
      .select("id,nickname,avatar_url")
      .ilike("nickname", `%${query}%`)
      .limit(20);

    if (e) throw e;

    results.value = (data || []).filter(u => u.id !== myId);
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

async function startDM(otherUserId) {
  try {
    const threadId = await dmThreads.openOrCreateDM(otherUserId);
    await dmThreads.loadMyThreads(80);
    router.push({ name: "dm", params: { threadId } });
    // close modal
    // (emit)
    // eslint-disable-next-line no-undef
    emit("close");
  } catch (e) {
    error.value = e?.message || String(e);
  }
}
</script>
