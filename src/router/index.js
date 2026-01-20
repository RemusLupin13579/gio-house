import { createRouter, createWebHistory } from "vue-router";
import DMsView from "../views/DMsView.vue";
import DMChatView from "../views/DMChatView.vue";
import AppShell from "../layouts/AppShell.vue";
import HomeView from "../views/HomeView.vue";
import RoomView from "../views/RoomView.vue";
import LoginView from "../views/LoginView.vue";
import AuthCallbackView from "../views/AuthCallbackView.vue";
import OnboardingView from "../views/OnboardingView.vue";
import MembersView from "../views/MembersView.vue";
import { authReady, session, profile } from "../stores/auth";
import { supabase } from "../services/supabase";

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
            // ✅ DMs
            { path: "dms", name: "dms", component: DMsView },
            { path: "dm/:threadId", name: "dm", component: DMChatView, props: true },
        ]
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
    // ✅ Fix: אם חזרנו מה-OAuth עם bad_oauth_state על ה-root
    // (זה נתקע על /?error=... ומבלבל את האפליקציה)
    if (to.path === "/" && (to.query?.error_code === "bad_oauth_state" || to.query?.error === "invalid_request")) {
        return { name: "login", query: { reason: String(to.query?.error_code || to.query?.error || "oauth_error") } };
    }

    const isPublic = Boolean(to.meta.public);

    // ✅ מסלולים public נטענים מיד (login / auth-callback / וכו')
    if (isPublic) {
        if (!authReady.value) return true;

        const isAuthed = Boolean(session.value);
        const needsOnboarding =
            isAuthed && (!profile.value || !profile.value.nickname || profile.value.onboarded === false);

        if (isAuthed) {
            if (needsOnboarding && to.name !== "onboarding" && to.name !== "auth-callback") {
                return { name: "onboarding" };
            }
            if (to.name === "login") return { name: "home" };
        }

        return true;
    }

    if (!authReady.value) {
        await waitForAuthReady();
    }

    const isAuthed = Boolean(session.value);
    if (!isAuthed) return { name: "login" };

    const needsOnboarding =
        !profile.value || !profile.value.nickname || profile.value.onboarded === false;

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
