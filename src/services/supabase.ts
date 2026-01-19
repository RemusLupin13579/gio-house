// src/services/supabase.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL!;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY!;

declare global {
    // eslint-disable-next-line no-var
    var __gio_supabase__: SupabaseClient | undefined;
}

export const supabase: SupabaseClient =
    globalThis.__gio_supabase__ ??
    (globalThis.__gio_supabase__ = createClient(url, key, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: "gio-auth",
        },
        realtime: { params: { eventsPerSecond: 20 } },
    }));
