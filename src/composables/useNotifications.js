// /src/composables/useNotifications.js
import { watch, computed } from "vue";
import { useRoute } from "vue-router";
import { useNotificationsStore } from "../stores/notifications";
import { session } from "../stores/auth";

export function useNotifications() {
    const route = useRoute();
    const notif = useNotificationsStore();

    const myId = computed(() => session.value?.user?.id ?? null);

    // keep context updated
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

            // entering DM clears that DM
            if (routeName === "dm" && dmThreadId) {
                notif.clearDM(dmThreadId);
            }

            // entering room clears that room (optional)
            if (routeName === "room" && roomKey) {
                notif.clearRoom(roomKey);
            }
        },
        { immediate: true }
    );

    // expose helpers to call from DM/Room realtime handlers
    function onIncomingDM(payload) {
        notif.onIncomingDM({ ...payload, myUserId: myId.value });
    }

    function onIncomingRoom(payload) {
        notif.onIncomingRoom({ ...payload, myUserId: myId.value });
    }

    return { notif, onIncomingDM, onIncomingRoom, myId };
}
