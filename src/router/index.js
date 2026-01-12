import { createRouter, createWebHistory } from "vue-router";

import AppShell from "../layouts/AppShell.vue";
import HomeView from "../views/HomeView.vue";
import RoomView from "../views/RoomView.vue";
import LoginView from "../views/LoginView.vue";
import AuthCallbackView from "../views/AuthCallbackView.vue";
import OnboardingView from "../views/OnboardingView.vue";
import MembersView from "../views/MembersView.vue";
import { authReady, session, profile } from "../stores/auth";

const routes = [
    { path: "/login", name: "login", component: LoginView, meta: { public: true } },
    { path: "/auth/callback", name: "auth-callback", component: AuthCallbackView, meta: { public: true } },
    { path: "/onboarding", name: "onboarding", component: OnboardingView },

    {
        path: "/",
        component: AppShell,
        children: [
            { path: "", name: "home", component: HomeView },
            { path: "members", name: "members", component: MembersView },
            { path: "room/:id", name: "room", component: RoomView, props: true },
        ],
    },
];

const router = createRouter({
    history: createWebHistory(),
    routes,
});

/**
 * ✅ FIX קריטי למובייל:
 * מחכים ל-authReady לפני שמחליטים אם יש session או לא.
 * בלי זה – במובייל יש לוגין לופ.
 */
router.beforeEach(async (to) => {
    // ✅ אם כבר יש סשן, אין סיבה להישאר ב-login/callback
    if ((to.name === "login" || to.name === "auth-callback") && session.value) {
        return { name: "home" };
    }
    const isPublic = Boolean(to.meta.public);

    // ✅ מסלולים public (login/callback) צריכים להיטען מיד – בלי לחכות
    if (isPublic) return true;

    // ✅ רק למסלולים מוגנים אנחנו מחכים ש-authReady יטען
    if (!authReady.value) {
        await waitForAuthReady();
    }

    const isAuthed = Boolean(session.value);

    if (!isAuthed) return { name: "login" };

    const needsOnboarding =
        isAuthed &&
        (!profile.value || !profile.value.nickname || profile.value.onboarded === false);

    if (needsOnboarding && to.name !== "onboarding" && to.name !== "auth-callback") {
        return { name: "onboarding" };
    }

    return true;
});

/**
 * helper קטן שמחכה ל-authReady
 * (JS טהור – בלי Promise<void>)
 */
function waitForAuthReady(timeoutMs = 6000) {
    return new Promise((resolve) => {
        const start = Date.now();

        const tick = () => {
            if (authReady.value) return resolve();
            if (Date.now() - start > timeoutMs) return resolve(); // fail-open
            setTimeout(tick, 25);
        };

        tick();
    });
}

export default router;
