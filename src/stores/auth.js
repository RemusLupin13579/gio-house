// /src/stores/auth.js
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { supabase } from "../services/supabase";

// ---- Back-compat exports (legacy imports) ----
export const session = ref(null);

// ✅ profile כ-Ref אמיתי כדי שאפשר לעדכן אותו מבחוץ (profilesStore / onboarding)
export const profile = ref(null);

// ---- Exports used across app ----
export const authState = ref("unknown"); // unknown | ready | signed_out
export const authReady = computed(() => authState.value === "ready");

// ✅ Legacy export expected by OnboardingView (and others)
export async function fetchMyProfile() {
    const userId = session.value?.user?.id;
    if (!userId) {
        profile.value = null;
        return null;
    }

    try {
        const { data, error } = await supabase
            .from("profiles")
            .select("id, nickname, avatar_url, color")
            .eq("id", userId)
            .maybeSingle();

        if (error) throw error;

        // אם אין רשומה עדיין → fallback יציב
        const row = data || {
            id: userId,
            nickname: "User",
            avatar_url: null,
            color: "#22c55e",
        };

        profile.value = row;
        return row;
    } catch {
        profile.value =
            profile.value ||
            ({
                id: userId,
                nickname: "User",
                avatar_url: null,
                color: "#22c55e",
            });
        return profile.value;
    }
}

export async function ensureMyProfile() {
    if (profile.value) return profile.value;
    return await fetchMyProfile();
}

export const useAuthStore = defineStore("auth", {
    state: () => ({
        state: "unknown",
        userId: null,
        lastError: null,
        _initDone: false,
        _sub: null,
    }),

    actions: {
        async init() {
            if (this._initDone) return;
            this._initDone = true;

            const { data, error } = await supabase.auth.getSession();
            if (error) this.lastError = error.message;

            session.value = data?.session ?? null;
            this.userId = data?.session?.user?.id ?? null;

            this.state = this.userId ? "ready" : "signed_out";
            authState.value = this.state;

            // fallback יציב כדי שלא ייפול UI
            if (this.userId && !profile.value) {
                profile.value = {
                    id: this.userId,
                    nickname: "User",
                    avatar_url: null,
                    color: "#22c55e",
                };
            }

            // ניסיון להביא פרופיל אמיתי (לא חוסם)
            if (this.userId) void fetchMyProfile();

            if (!this._sub) {
                this._sub = supabase.auth.onAuthStateChange((_event, newSession) => {
                    session.value = newSession ?? null;
                    this.userId = newSession?.user?.id ?? null;

                    this.state = this.userId ? "ready" : "signed_out";
                    authState.value = this.state;

                    if (!this.userId) {
                        profile.value = null;
                    } else {
                        if (!profile.value) {
                            profile.value = {
                                id: this.userId,
                                nickname: "User",
                                avatar_url: null,
                                color: "#22c55e",
                            };
                        }
                        void fetchMyProfile();
                    }
                });
            }
        },

        async waitUntilReady(timeoutMs = 5000) {
            const start = Date.now();
            while (this.state === "unknown") {
                if (Date.now() - start > timeoutMs) throw new Error("AUTH_TIMEOUT");
                await new Promise((r) => setTimeout(r, 40));
            }
            if (this.state !== "ready" || !this.userId) throw new Error("AUTH_NOT_READY");
            return this.userId;
        },

        setProfile(nextProfile) {
            profile.value = nextProfile || null;
        },
    },
});

// ✅ function export that your main.js expects
export async function initAuth() {
    const auth = useAuthStore();
    await auth.init();
    return auth;
}
