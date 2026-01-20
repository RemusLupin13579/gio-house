<template>
    <div class="h-full min-h-0 w-full bg-black text-white overflow-hidden flex flex-col">
        <div class="flex-1 min-h-0 grid overflow-hidden" :style="gridStyle">
            <div class="min-h-0 overflow-hidden flex">
                <DMScene class="flex-1 min-h-0 w-full" :otherProfile="otherProfile" />
            </div>

            <div class="min-h-0 overflow-hidden border-t border-white/10 bg-black/40 backdrop-blur" :style="chatWrapStyle">
                <DMChatPanel class="h-full"
                             :threadId="threadId"
                             :typingLabel="typingLabel"
                             :sendTyping="sendTyping" />
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { supabase } from "../services/supabase";
import { session } from "../stores/auth";
import { useProfilesStore } from "../stores/profiles";
import { useDMThreadsStore } from "../stores/dmThreads";

import DMScene from "../components/DMScene.vue";
import DMChatPanel from "../components/DMChatPanel.vue";

const route = useRoute();
const profilesStore = useProfilesStore();
const threadsStore = useDMThreadsStore();

const threadId = computed(() => String(route.params.threadId || ""));

const otherUserId = ref(null);
const otherProfile = computed(() => (otherUserId.value ? profilesStore.byId?.[otherUserId.value] || null : null));

/* Split layout controller (same as RoomView) */
const keyboardPx = ref(0);
function updateKeyboard() {
  const vv = window.visualViewport;
  if (!vv) { keyboardPx.value = 0; return; }
  if (vv.scale && Math.abs(vv.scale - 1) > 0.01) { keyboardPx.value = 0; return; }
  keyboardPx.value = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
}

const chatExpanded = ref(false);
provide("chatLayout", {
  chatExpanded,
  toggle: () => (chatExpanded.value = !chatExpanded.value),
  collapse: () => (chatExpanded.value = false),
  expandForTyping: () => (chatExpanded.value = true),
  collapseAfterTyping: () => { if (keyboardPx.value === 0) chatExpanded.value = false; },
});

const gridStyle = computed(() => {
  if (keyboardPx.value > 0) return { gridTemplateRows: "20fr 80fr" };
  return { gridTemplateRows: chatExpanded.value ? "35fr 65fr" : "55fr 45fr" };
});
const chatWrapStyle = computed(() => ({ paddingBottom: `${keyboardPx.value}px` }));

/* ✅ Typing via broadcast */
const typingUsers = ref(new Map()); // userId -> { nickname, expiresAt }
let typingCh = null;
let sweepTimer = null;

const typingLabel = computed(() => {
  const me = session.value?.user?.id;
  const now = Date.now();
  const names = [...typingUsers.value.entries()]
    .filter(([uid, v]) => uid !== me && v.expiresAt > now)
    .map(([, v]) => v.nickname || "User");

  if (!names.length) return "";
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names[0]} and +${names.length - 1} are typing…`;
});

function sendTyping(isTyping) {
  if (!typingCh) return;
  const me = session.value?.user?.id;
  const nick = profilesStore.byId?.[me]?.nickname || "User";
  typingCh.send({
    type: "broadcast",
    event: "typing",
    payload: { user_id: me, nickname: nick, typing: !!isTyping, ttlMs: 1400 },
  });
}

async function ensureOtherProfile() {
  await threadsStore.loadMyThreads(80);
  const t = threadsStore.byId(threadId.value);
  otherUserId.value = t?.otherUserId || null;
  if (otherUserId.value) await profilesStore.ensureLoaded([otherUserId.value]);
}

onMounted(async () => {
  updateKeyboard();
  window.visualViewport?.addEventListener("resize", updateKeyboard);
  window.visualViewport?.addEventListener("scroll", updateKeyboard);

  await ensureOtherProfile();

  typingCh = supabase.channel(`dm_typing_${threadId.value}`)
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      const uid = payload?.user_id;
      if (!uid) return;
      const ttl = Number(payload?.ttlMs || 1200);
      const nick = payload?.nickname || "User";

      if (!payload?.typing) {
        typingUsers.value.delete(uid);
        typingUsers.value = new Map(typingUsers.value);
        return;
      }

      typingUsers.value.set(uid, { nickname: nick, expiresAt: Date.now() + ttl });
      typingUsers.value = new Map(typingUsers.value);
    })
    .subscribe();

  sweepTimer = setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [uid, v] of typingUsers.value.entries()) {
      if (v.expiresAt <= now) { typingUsers.value.delete(uid); changed = true; }
    }
    if (changed) typingUsers.value = new Map(typingUsers.value);
  }, 500);
});

onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener("resize", updateKeyboard);
  window.visualViewport?.removeEventListener("scroll", updateKeyboard);
  if (typingCh) supabase.removeChannel(typingCh);
  typingCh = null;
  if (sweepTimer) clearInterval(sweepTimer);
});

watch(() => threadId.value, async () => {
  typingUsers.value = new Map();
  await ensureOtherProfile();
});
</script>
