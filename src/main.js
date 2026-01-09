import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import { createPinia } from "pinia";
import { initAuth } from "./stores/auth";
import { useHouseStore } from "./stores/house"; // ✅ צריך בשביל hydrate של הבית
import "./assets/main.css";

async function bootstrap() {
    /**
     * 1️⃣ יוצרים Pinia *לפני* האפליקציה
     * חייבים Pinia מוקדם כדי ש-stores יהיו זמינים
     */
    const pinia = createPinia();

    /**
     * 2️⃣ אתחול Auth (Supabase session, profile וכו')
     * זה חייב לקרות לפני router כדי למנוע לופ / race
     */
    await initAuth();

    /**
     * 3️⃣ אתחול houseStore מוקדם
     * זה הפיקס הקריטי לרענון / כניסה ישירה לחדר
     */
    const house = useHouseStore(pinia);

    // ⬅️ מחזיר currentHouseId מ-localStorage אם קיים
    house.hydrateCurrentHouse();

    // ⬅️ טוען את רשימת הבתים של המשתמש
    await house.loadMyHouses();

    /**
     * 4️⃣ Fallback בטיחותי:
     * אם אין currentHouseId (רענון ראשון / משתמש חדש)
     * בוחרים אוטומטית את הבית הראשון
     */
    if (!house.currentHouseId && house.myHouses?.length) {
        house.setCurrentHouse(house.myHouses[0].id);
    }

    /**
     * 5️⃣ עכשיו בטוח לעלות את האפליקציה + router
     * בשלב הזה:
     * - auth מוכן
     * - currentHouseId קיים
     * - ChatPanel יכול לטעון rooms בלי race
     */
    const app = createApp(App).use(pinia).use(router);

    app.config.errorHandler = (err, instance, info) => {
        console.error("[VueError]", info, err);
    };

    app.config.warnHandler = (msg, instance, trace) => {
        console.warn("[VueWarn]", msg, trace);
    };

    app.mount("#app");

}

bootstrap();

/**
 * 📱 Eruda – דיבוג נייד (DEV בלבד)
 * מאפשר console.log בטלפון
 */
if (import.meta.env.DEV && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/eruda";
    s.onload = () => window.eruda && window.eruda.init();
    document.body.appendChild(s);
}
