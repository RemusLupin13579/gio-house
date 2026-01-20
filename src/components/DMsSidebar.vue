<!-- /src/components/DMsSidebar.vue -->
<template>
  <div class="p-3">
    <div class="flex items-center justify-between mb-3">
      <div class="text-sm font-extrabold text-white/80">Messages</div>
    </div>

    <!-- Add friends -->
    <button
      class="w-full h-10 rounded-2xl bg-white/5 border border-white/10 hover:border-green-500/30 transition
             flex items-center justify-center gap-2 mb-3"
      @click="emit('openAddFriends')"
    >
      <span class="text-white/70">👥</span>
      <span class="font-bold text-white/70">Add Friends</span>
    </button>

    <div class="h-px bg-white/10 my-2"></div>

    <!-- ✅ Self / Saved -->
    <button
      class="w-full px-3 py-2 rounded-xl flex items-center gap-3 hover:bg-white/5 transition border border-transparent"
      :class="isActiveThread(selfThreadId) ? 'bg-white/5 border border-green-500/30' : ''"
      :disabled="!selfThreadId"
      @click="openThread(selfThreadId)"
    >
      <div class="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center">
        <img v-if="myAvatar" :src="myAvatar" class="w-full h-full object-cover" alt="" />
        <span v-else class="text-lg">🙂</span>
      </div>

      <div class="min-w-0 text-left">
        <div class="font-bold truncate">{{ myName }}</div>
        <div class="text-[11px] text-white/45 truncate">הצ’אט הפרטי שלך</div>
      </div>
    </button>

    <div class="h-px bg-white/10 my-2"></div>

    <!-- Threads -->
    <div class="space-y-1">
      <button
        v-for="t in visibleThreads"
        :key="t.id"
        class="w-full px-3 py-2 rounded-xl flex items-center gap-3 hover:bg-white/5 transition border border-transparent"
        :class="isActiveThread(t.id) ? 'bg-white/5 border border-green-500/30' : ''"
        @click="openThread(t.id)"
      >
        <div class="w-10 h-10 rounded-2xl border border-white/10 overflow-hidden bg-white/5 flex items-center justify-center">
          <img v-if="t.otherProfile?.avatar_url" :src="t.otherProfile.avatar_url" class="w-full h-full object-cover" />
          <span v-else class="font-bold text-xs">
            {{ (t.otherProfile?.nickname?.[0] || t.title?.[0] || "D").toUpperCase() }}
          </span>
        </div>

        <div class="min-w-0 text-left flex-1">
          <div class="font-bold truncate">
            {{ displayTitle(t) }}
          </div>
          <div class="text-[11px] text-white/45 truncate">
            {{ t.lastText || "…" }}
          </div>
        </div>
      </button>

      <div v-if="loading" class="text-xs text-white/50 px-2 py-3">
        טוען שיחות…
      </div>

      <div v-else-if="!visibleThreads.length" class="text-xs text-white/50 px-2 py-3">
        אין עדיין שיחות. לחץ Add Friends כדי להתחיל.
      </div>

      <div v-if="error" class="text-[11px] text-red-300/80 px-2 py-2">
        {{ error }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDMThreadsStore } from "../stores/dmThreads";
import { useProfilesStore } from "../stores/profiles";
import { profile, session } from "../stores/auth";

const emit = defineEmits(["openThread", "openAddFriends"]);

const route = useRoute();
const router = useRouter();

const dmThreads = useDMThreadsStore();
const profilesStore = useProfilesStore();

const myId = computed(() => session.value?.user?.id ?? null);

// Prefer hydrated `profile` store, fallback to profilesStore by id if needed
const myProfile = computed(() => {
  if (profile.value) return profile.value;
  if (myId.value) return profilesStore.byId?.[myId.value] || null;
  return null;
});

const myName = computed(() => myProfile.value?.nickname || "You");
const myAvatar = computed(() => myProfile.value?.avatar_url || null);

const loading = computed(() => dmThreads.loading);
const error = computed(() => dmThreads.lastError);

const selfThreadId = computed(() => dmThreads.selfThreadId || null);
const threads = computed(() => dmThreads.threads || []);

const activeThreadId = computed(() => {
  // in /dm/:threadId route
  if (route.name === "dm") return String(route.params.threadId || "");
  // in /dms route no selected thread
  return "";
});

function isActiveThread(id) {
  if (!id) return false;
  return String(id) === String(activeThreadId.value);
}

function openThread(id) {
  if (!id) return;
  // emit so parent can decide (or just route here)
  emit("openThread", id);

  // also navigate (safe default)
  if (route.name !== "dm" || String(route.params.threadId) !== String(id)) {
    router.push({ name: "dm", params: { threadId: id } });
  }
}

function displayTitle(t) {
  // 1:1 thread
  if (t?.otherProfile?.nickname) return t.otherProfile.nickname;

  // group thread / titled thread
  if (t?.title) return t.title;

  // fallback (avoid "User" lying)
  return "DM";
}

const visibleThreads = computed(() => {
  const selfId = selfThreadId.value;
  return (threads.value || [])
    // remove self-thread from list (we already show it above)
    .filter(t => t?.id && String(t.id) !== String(selfId))
    // hide "unknown" placeholders (optional; keeps UI clean)
    .filter(t => t?.otherProfile?.nickname || t?.otherProfile?.avatar_url || t?.title || t?.is_group);
});

onMounted(async () => {
  // Ensure self thread exists and then load threads
  try {
    if (!dmThreads.selfThreadId) {
      await dmThreads.ensureSelfThread();
    }
    await dmThreads.loadMyThreads(80);
  } catch (e) {
    // store already logs, but keep UI stable
    console.error("[DMsSidebar] init failed:", e);
  }
});
</script>
