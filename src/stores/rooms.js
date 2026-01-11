import { defineStore } from "pinia";
import { supabase } from "../services/supabase";

export const useRoomsStore = defineStore("rooms", {
    state: () => ({
        rooms: [],
        byKey: {},
        loadedForHouseId: null,
        loading: false,
        error: null,
    }),

    getters: {
        // ✅ החדרים שיוצגו בסיידבר
        activeRooms: (state) =>
            (state.rooms ?? [])
                .filter((r) => r && r.is_archived === false)
                .slice()
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    },

    actions: {
        async loadForHouse(houseId) {
            if (!houseId) return;
            if (this.loading) return;
            if (this.loadedForHouseId === houseId && this.rooms.length) return;

            this.loading = true;
            this.error = null;

            try {
                const { data, error } = await supabase
                    .from("rooms")
                    .select("id, house_id, key, name, icon, type, sort_order, is_archived, created_at")
                    .eq("house_id", houseId)
                    .order("sort_order", { ascending: true });

                if (error) throw error;

                this.rooms = data ?? [];
                this.byKey = Object.fromEntries((this.rooms ?? []).map((r) => [r.key, r]));
                this.loadedForHouseId = houseId;

                console.log("[roomsStore] loaded:", houseId, this.rooms.length);
            } catch (e) {
                this.error = e;
                console.error("[roomsStore] loadForHouse failed:", e);
            } finally {
                this.loading = false;
            }
        },

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
