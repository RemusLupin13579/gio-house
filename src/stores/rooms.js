import { defineStore } from "pinia";
import { supabase } from "../services/supabase";

export const useRoomsStore = defineStore("rooms", {
    state: () => ({
        rooms: [],         // rooms of current house
        byKey: {},         // keyLower -> room
        loadedHouseId: null,
        loading: false,
    }),

    actions: {
        async loadForHouse(houseId) {
            if (!houseId) return;
            if (this.loadedHouseId === houseId) return;

            this.loading = true;
            try {
                const { data, error } = await supabase
                    .from("rooms")
                    .select("id, house_id, key, name, icon")
                    .eq("house_id", houseId)
                    .order("created_at", { ascending: true });

                if (error) throw error;

                this.rooms = data ?? [];
                this.byKey = Object.fromEntries(
                    this.rooms.map((r) => [String(r.key).toLowerCase(), r])
                );
                this.loadedHouseId = houseId;
            } finally {
                this.loading = false;
            }
        },

        getRoomUuidByKey(key) {
            return this.byKey[String(key).toLowerCase()]?.id ?? null;
        },

        getRoomByKey(key) {
            return this.byKey[String(key).toLowerCase()] ?? null;
        },

        // תאימות זמנית אם יש לך עדיין קריאות ישנות
        getRoomUuidByName(name) {
            return this.getRoomUuidByKey(name);
        },
    },
});
