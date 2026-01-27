// /src/composables/useNotifications.js
import { watch, computed } from "vue";
import { useRoute } from "vue-router";
import { supabase } from "../services/supabase";
import { useNotificationsStore } from "../stores/notifications";
import { useDMThreadsStore } from "../stores/dmThreads";
import { session } from "../stores/auth";

export function useNotifications() {
    const route = useRoute();
    const notif = useNotificationsStore();
    const dmThreads = useDMThreadsStore();

    const myId = computed(() => session.value?.user?.id ?? null);

    // best-effort mark read (server is source of truth)
    async function markDmReadServer(threadId) {
        try {
            if (!threadId) return;
            await supabase.rpc("dm_mark_read", { p_thread_id: String(threadId) });
        } catch (e) {
            console.warn("[dm_mark_read] failed (non-blocking):", e?.message || e);
        }
    }

    watch(
        () => route.fullPath,
        () => {
            const routeName = String(route.name || "");
            const dmThreadId = routeName === "dm" ? String(route.params.threadId || "") : null;

            const roomKey =
                routeName === "room"
                    ? String(route.params.id ?? route.params.key ?? route.params.roomKey ?? "")
                    : null;

            notif.setContext({ routeName, dmThreadId, roomKey });

            // entering DM clears unread (local + SW + best-effort server)
            if (routeName === "dm" && dmThreadId) {
                notif.clearDM(dmThreadId);
                dmThreads.markThreadReadLocal(dmThreadId);

                try {
                    const groupKey = `dm_${dmThreadId}`;
                    navigator.serviceWorker?.controller?.postMessage?.({ type: "CLEAR_GROUP", groupKey });
                } catch { }

                void markDmReadServer(dmThreadId);
            }

            // entering room clears that room (optional)
            if (routeName === "room" && roomKey) {
                notif.clearRoom(roomKey);

                try {
                    const groupKey = `room_${roomKey}`;
                    navigator.serviceWorker?.controller?.postMessage?.({ type: "CLEAR_GROUP", groupKey });
                } catch { }
            }
        },
        { immediate: true }
    );

    function onIncomingDM(payload) {
        const threadId = payload?.threadId ? String(payload.threadId) : "";
        if (!threadId) return;

        // update notifications store (for SW grouping / persistence)
        notif.onIncomingDM({ ...payload, myUserId: myId.value });

        // keep dmThreads UI unread in sync (authoritative for UI)
        const isOpenDm =
            String(route.name || "") === "dm" && String(route.params.threadId || "") === threadId;

        // ignore if open (no unread)
        if (!isOpenDm) {
            // ignore own (just in case)
            if (
                payload?.fromUserId &&
                myId.value &&
                String(payload.fromUserId) === String(myId.value)
            ) {
                return;
            }
            dmThreads.incrementUnreadLocal(threadId, 1);
        } else {
            dmThreads.markThreadReadLocal(threadId);
            notif.clearDM(threadId);
        }
    }

    function onIncomingRoom(payload) {
        notif.onIncomingRoom({ ...payload, myUserId: myId.value });
    }

    return { notif, onIncomingDM, onIncomingRoom, myId };
}
