// /src/lifecycle/resume.js
import { useAuthStore } from "../stores/auth";

let paused = false;
export function isPaused() {
    return paused;
}

export function installResumeGuards() {
    const auth = useAuthStore();

    async function resume(reason) {
        paused = true;
        try {
            await auth.init();
            // לא חייב לזרוק — רק “ניסיון להתאושש”
            try {
                await auth.waitUntilReady(5000);
            } catch (_) { }
        } finally {
            paused = false;
        }
    }

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void resume("visible");
        if (document.visibilityState === "hidden") paused = true;
    });

    window.addEventListener("online", () => void resume("online"));
    window.addEventListener("offline", () => {
        paused = true;
    });

    window.addEventListener("pageshow", (e) => {
        void resume(e?.persisted ? "bfcache" : "pageshow");
    });
}
