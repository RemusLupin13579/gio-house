import { ref } from "vue";
import { supabase } from "../services/supabase";

export const authReady = ref(false);
export const session = ref(null);
export const profile = ref(null);

async function ensureProfile(user) {
    const { data: existing, error: selectError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

    if (selectError) throw selectError;
    if (existing) return;

    const { error: insertError } = await supabase.from("profiles").insert({
        id: user.id,
        nickname: null,
        onboarded: false,
        avatar_url: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null,
    });
    if (insertError) throw insertError;
}

export async function fetchMyProfile() {
    if (!session.value?.user) { profile.value = null; return; }

    const { data, error } = await supabase
        .from("profiles")
        .select("id, nickname, avatar_url, onboarded, color")
        .eq("id", session.value.user.id)
        .maybeSingle();

    if (error) throw error;
    profile.value = data ?? null;
}

export async function initAuth() {
    authReady.value = false;

    const { data, error } = await supabase.auth.getSession();
    if (error) console.error("getSession error:", error);

    session.value = data.session ?? null;

    if (session.value?.user) {
        await ensureProfile(session.value.user);
        await fetchMyProfile();
    } else {
        profile.value = null;
    }

    authReady.value = true;

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

export async function hardSignOut() {
    await supabase.auth.signOut();
    session.value = null;
    profile.value = null;

    // לא מוחקים sb-* כאן בזמן flow. רק אם ממש חייבים:
    // Object.keys(localStorage).filter(k=>k.startsWith("sb-")).forEach(k=>localStorage.removeItem(k));

    authReady.value = true;
}
