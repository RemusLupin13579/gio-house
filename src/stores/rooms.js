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
                .select("id, name, icon")
                .order("created_at", { ascending: true });

            if (error) throw error;

            this.rooms = data ?? [];
            this.byName = Object.fromEntries(this.rooms.map((r) => [r.name, r]));
            this.loaded = true;
        },

        getRoomUuidByName(name) {
            return this.byName[name]?.id ?? null;
        },

        getRoomByName(name) {
            return this.byName[name] ?? null;
        },
    },
});
