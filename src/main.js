import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import { createPinia } from "pinia";
import { initAuth, session } from "./stores/auth";
import { useHouseStore } from "./stores/house";
import "./assets/main.css";

const pinia = createPinia();
const app = createApp(App).use(pinia).use(router);

// חשוב: לתפוס גם קריסות “שקטות”
window.addEventListener("error", (e) => {
    console.error("[window.error]", e.error || e.message, e);
});
window.addEventListener("unhandledrejection", (e) => {
    console.error("[unhandledrejection]", e.reason);
});

app.config.errorHandler = (err, instance, info) => {
    console.error("[VueError]", info, err);
};

// ✅ קודם כל להרים UI (גם אם זה רק מסך טעינה)
app.mount("#app");

// ✅ עכשיו עושים את כל הדברים הכבדים
(async function bootstrap() {
    try {
        await initAuth();

        const house = useHouseStore(pinia);

        house.hydrateCurrentHouse();

        if (session.value?.user) {
            await house.ensurePublicHouseMembership();
        }

        await house.loadMyHouses();

        const exists = house.myHouses?.some(h => h.id === house.currentHouseId);
        if (!exists) {
            house.setCurrentHouse(house.myHouses?.length ? house.myHouses[0].id : null);
        }

        // אופציונלי: houseReady flag אם יש לך
        // house.ready = true;
    } catch (e) {
        console.error("[bootstrap] failed:", e);
        // כאן אפשר גם לשים fallback: router.replace({ name: "login" })
    }
})();
