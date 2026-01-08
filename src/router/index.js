import { createRouter, createWebHistory } from "vue-router";

import AppShell from "../layouts/AppShell.vue";
import HomeView from "../views/HomeView.vue";
import RoomView from "../views/RoomView.vue";
import LoginView from "../views/LoginView.vue";
import AuthCallbackView from "../views/AuthCallbackView.vue";
import OnboardingView from "../views/OnboardingView.vue";

import { authReady, session, profile } from "../stores/auth";

const routes = [
    { path: "/login", name: "login", component: LoginView, meta: { public: true } },
    { path: "/auth/callback", name: "auth-callback", component: AuthCallbackView, meta: { public: true } },
    { path: "/onboarding", name: "onboarding", component: OnboardingView },

    // ✅ כל האפליקציה בתוך shell
    {
        path: "/",
        component: AppShell,
        children: [
            { path: "", name: "home", component: HomeView },
            { path: "room/:id", name: "room", component: RoomView, props: true },
        ],
    },
];

const router = createRouter({
    history: createWebHistory(),
    routes,
});

router.beforeEach((to) => {
    if (!authReady.value) return true;

    const isPublic = Boolean(to.meta.public);
    const isAuthed = Boolean(session.value);

    if (!isPublic && !isAuthed) return { name: "login" };
    if (to.name === "login" && isAuthed) return { name: "home" };

    const needsOnboarding =
        isAuthed && (!profile.value || !profile.value.nickname || profile.value.onboarded === false);

    if (needsOnboarding && to.name !== "onboarding" && to.name !== "auth-callback") {
        return { name: "onboarding" };
    }

    return true;
});

export default router;
