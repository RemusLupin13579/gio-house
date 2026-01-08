import { defineStore } from "pinia";
import { supabase } from "../services/supabase";

export const useRoomsStore = defineStore("rooms", {
    state: () => ({
        rooms: [],      // [{id, name, icon, created_at}]
        byName: {},     // name -> room
        loaded: false,
    }),

    actions: {
        async load() {
            if (this.loaded) return;

            const { data, error } = await supabase
                .from("rooms")
                .select("id, house_id, key, name, icon")
                .order("created_at", { ascending: true });

            if (error) throw error;

            this.rooms = data ?? [];

            // 🔑 מיפוי לפי key (living / gaming / ...)
            this.byKey = Object.fromEntries(
                this.rooms.map((r) => [r.key, r])
            );

            this.loaded = true;
        },

        getRoomUuidByKey(key) {
            return this.byKey?.[key]?.id ?? null;
        },

        getRoomByKey(key) {
            return this.byKey?.[key] ?? null;
        },
    },

});
