// /src/main.js
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import { createPinia } from "pinia";
import { initAuth, session } from "./stores/auth";
import { installResumeGuards } from "./lifecycle/resume";

import { useHouseStore } from "./stores/house";
import { usePresenceStore } from "./stores/presence";
import { useMessagesStore } from "./stores/messages";
import "./assets/main.css";
import { useProfilesStore } from "./stores/profiles";
import { useNotificationsStore } from "./stores/notifications";
import { useDMMessagesStore } from "./stores/dmMessages";

const pinia = createPinia();
const app = createApp(App).use(pinia).use(router);
app.mount("#app");

// ✅ Service Worker
if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
        try {
            const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
            console.log("[SW] registered:", reg?.scope);
        } catch (e) {
            console.warn("[SW] register failed:", e);
        }
    });
}

const notif = useNotificationsStore(pinia);
notif.load();

(async function bootstrap() {
    await initAuth();
    installResumeGuards();

    const house = useHouseStore(pinia);
    const presence = usePresenceStore(pinia);
    const messages = useMessagesStore(pinia);
    const profiles = useProfilesStore(pinia);

    await profiles.fetchMyProfile();
    await presence.refreshSelf?.();

    house.hydrateCurrentHouse?.();

    if (session.value?.user) {
        await house.ensurePublicHouseMembership?.();
    }

    await house.loadMyHouses?.();

    const exists = house.myHouses?.some((h) => h.id === house.currentHouseId);
    if (!exists) {
        house.setCurrentHouse?.(house.myHouses?.length ? house.myHouses[0].id : null);
    }

    const dmMessages = useDMMessagesStore(pinia);
    dmMessages.installGuards?.();  // DM inbox subscribe + outbox worker
    messages.installGuards?.();
    presence.installGuards?.();

    const hid = house.currentHouseId;
    if (hid) {
        await presence.connect({ houseId: hid, initialRoom: presence.roomName || "lobby" });
        await presence.setRoom(presence.roomName || "lobby");
    }
})();
