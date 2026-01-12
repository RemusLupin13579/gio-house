import { defineStore } from "pinia";
import { supabase } from "../services/supabase";

export const useProfilesStore = defineStore("profiles", {
    state: () => ({
        byId: {},     // userId -> profile
        loading: false,
    }),

    actions: {
        async ensureLoaded(userIds = []) {
            const ids = [...new Set(userIds.filter(Boolean))];
            if (!ids.length) return;

            // טען רק מה שחסר
            const missing = ids.filter(id => !this.byId[id]);
            if (!missing.length) return;

            const { data, error } = await supabase
                .from("profiles")
                .select("id, nickname, avatar_url, color")
                .in("id", missing);

            if (error) throw error;

            for (const p of (data ?? [])) this.byId[p.id] = p;
        }
    }
});
