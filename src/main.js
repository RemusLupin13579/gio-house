// main.js
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import { createPinia } from "pinia";
import { initAuth, session } from "./stores/auth";
import { useHouseStore } from "./stores/house";
import "./assets/main.css";

async function bootstrap() {
    const pinia = createPinia();

    await initAuth();

    const house = useHouseStore(pinia);

    // 1) load current house from localStorage (אם קיים)
    house.hydrateCurrentHouse();

    // 2) אם יש משתמש מחובר — ודא שהוא חבר בבית הציבורי הדיפולטי
    if (session.value?.user) {
        const publicHouseId = await house.ensurePublicHouseMembership();
        // לא חייבים לעשות עם הערך, רק לוודא שנוצר membership
    }

    // 3) עכשיו נטען את רשימת הבתים
    await house.loadMyHouses();

    // 4) אם אין currentHouseId תקין — נקבע בית ראשון שיש לו
    const exists = house.myHouses?.some(h => h.id === house.currentHouseId);
    if (!exists) {
        if (house.myHouses?.length) {
            house.setCurrentHouse(house.myHouses[0].id);
        } else {
            house.setCurrentHouse(null);
        }
    }

    const app = createApp(App).use(pinia).use(router);

    app.config.errorHandler = (err, instance, info) => {
        console.error("[VueError]", info, err);
    };

    app.mount("#app");
}

bootstrap();
