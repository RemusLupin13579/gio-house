import { ref } from "vue";
import { supabase } from "../services/supabase";

export const authReady = ref(false);
export const session = ref(null);
export const profile = ref(null);

async function ensureProfile(user) {
    // בודקים אם קיים פרופיל
    const { data: existing, error: selectError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

    if (selectError) {
        console.error("ensureProfile select error:", selectError);
        return;
    }

    if (existing) return;

    // יוצרים פרופיל חדש (ללא שם אמיתי)
    const { error: insertError } = await supabase.from("profiles").insert({
        id: user.id,
        nickname: null,
        onboarded: false,
        // אפשר לשמור תמונת גוגל כ-fallback זמני, או לשים null אם אתה לא רוצה בכלל
        avatar_url: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null,
    });

    if (insertError) console.error("ensureProfile insert error:", insertError);
}

export async function fetchMyProfile() {
    if (!session.value?.user) {
        profile.value = null;
        return;
    }

    const { data, error } = await supabase
        .from("profiles")
        .select("id, nickname, avatar_url, onboarded")
        .eq("id", session.value.user.id)
        .maybeSingle();

    if (error) {
        console.error("fetchMyProfile error:", error);
        return;
    }

    profile.value = data ?? null;
}

export async function initAuth() {
    // 1) משחזרים session
    const { data, error } = await supabase.auth.getSession();
    if (error) console.error("getSession error:", error);

    session.value = data.session ?? null;

    // 2) אם מחובר - דואגים לפרופיל + טוענים אותו
    if (session.value?.user) {
        await ensureProfile(session.value.user);
        await fetchMyProfile();
    } else {
        profile.value = null;
    }

    // 3) מסמנים שה-auth מוכן
    authReady.value = true;

    // 4) מאזינים לשינויים
    supabase.auth.onAuthStateChange(async (_event, newSession) => {
        session.value = newSession ?? null;

        if (newSession?.user) {
            await ensureProfile(newSession.user);
            await fetchMyProfile();
        } else {
            profile.value = null;
        }
    });
}
