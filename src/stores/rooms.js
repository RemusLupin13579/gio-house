import { defineStore } from "pinia";
import { supabase } from "../services/supabase";

export const useRoomsStore = defineStore("rooms", {
    state: () => ({
        rooms: [],
        byKey: {},
        loadedForHouseId: null,   // 🔑 איזה בית נטען
        loading: false,
        error: null,
    }),

    actions: {
        /**
         * טוען חדרים לבית ספציפי
         */
        async loadForHouse(houseId) {
            if (!houseId) return;
            if (this.loading) return;
            if (this.loadedForHouseId === houseId && this.rooms.length) return;

            this.loading = true;
            this.error = null;

            try {
                const { data, error } = await supabase
                    .from("rooms")
                    .select("id, house_id, key, name, icon, created_at")
                    .eq("house_id", houseId)
                    .order("created_at", { ascending: true });

                if (error) throw error;

                this.rooms = data ?? [];
                this.byKey = Object.fromEntries(
                    this.rooms.map((r) => [r.key, r])
                );
                this.loadedForHouseId = houseId;

                console.log(
                    "[roomsStore] loaded:",
                    houseId,
                    Object.keys(this.byKey)
                );
            } catch (e) {
                this.error = e;
                console.error("[roomsStore] loadForHouse failed:", e);
            } finally {
                this.loading = false;
            }
        },

        /**
         * מחזיר UUID של חדר לפי key (living, gaming וכו')
         */
        getRoomUuidByKey(key) {
            return this.byKey?.[key]?.id ?? null;
        },

        reset() {
            this.rooms = [];
            this.byKey = {};
            this.loadedForHouseId = null;
            this.loading = false;
            this.error = null;
        },
    },
});
