//import { createRouter, createWebHistory } from "vue-router";
import { createRouter, createWebHashHistory } from "vue-router";

import HomeView from "../views/HomeView.vue";
import RoomView from "../views/RoomView.vue";
import LoginView from "../views/LoginView.vue";
import AuthCallbackView from "../views/AuthCallbackView.vue";
import OnboardingView from "../views/OnboardingView.vue";

import { authReady, session, profile } from "../stores/auth";

const routes = [
    {
        path: "/login",
        name: "login",
        component: LoginView,
        meta: { public: true },
    },
    {
        path: "/auth/callback",
        name: "auth-callback",
        component: AuthCallbackView,
        meta: { public: true },
    },
    {
        path: "/onboarding",
        name: "onboarding",
        component: OnboardingView,
        meta: { public: false },
    },
    {
        path: "/",
        name: "home",
        component: HomeView,
    },
    {
        path: "/room/:id",
        name: "room",
        component: RoomView,
        props: true,
    },
];

const router = createRouter({
    history: createWebHashHistory(),
    routes,
});
const authReady = ref(false);

supabase.auth.onAuthStateChange((_event, session) => {
    sessionRef.value = session;
    authReady.value = true;
});

router.beforeEach(async (to) => {
    // חכה ש-auth יאותחל
    if (!authReady.value) {
        await new Promise(resolve => {
            const stop = watch(authReady, (ready) => {
                if (ready) {
                    stop();
                    resolve();
                }
            });
        });
    }

    const isPublic = Boolean(to.meta.public);
    const isAuthed = Boolean(session.value);

    if (!isPublic && !isAuthed) {
        return { name: "login" };
    }

    if (to.name === "login" && isAuthed) {
        return { name: "home" };
    }

    const needsOnboarding =
        isAuthed &&
        (!profile.value || !profile.value.nickname || profile.value.onboarded === false);

    if (needsOnboarding && to.name !== "onboarding" && to.name !== "auth-callback") {
        return { name: "onboarding" };
    }

    return true;
});


export default router;
