import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const storage =
    typeof window !== "undefined" ? window.localStorage : undefined;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage,

        // ✅ זה המפתח: גורם ל-Google לחזור עם ?code= במקום #access_token
        flowType: "pkce",
    },
});
