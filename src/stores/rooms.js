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
        activeRooms: (state) =>
            (state.rooms ?? [])
                .filter((r) => r && r.is_archived === false)
                .slice()
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),

        archivedRooms: (state) =>
            (state.rooms ?? [])
                .filter((r) => r && r.is_archived === true)
                .slice()
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),

        byId: (state) => Object.fromEntries((state.rooms ?? []).map((r) => [r.id, r])),

        getRoomUuidByKey: (state) => (key) => state.byKey?.[key]?.id ?? null,
    },

    actions: {
        async loadForHouse(houseId, opts = {}) {
            if (!houseId) return;
            if (this.loading) return;

            const force = !!opts.force;
            if (!force && this.loadedForHouseId === houseId && this.rooms.length) return;

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

        reset() {
            this.rooms = [];
            this.byKey = {};
            this.loadedForHouseId = null;
            this.loading = false;
            this.error = null;
        },

        // ---------- CRUD ----------
        async createRoom({ houseId, name, key, icon }) {
            if (!houseId) throw new Error("createRoom: missing houseId");
            const cleanKey = String(key || "").trim().toLowerCase();

            // choose next sort_order at end (active only)
            const active = (this.rooms ?? []).filter((r) => r.house_id === houseId && r.is_archived === false);
            const maxSort = active.reduce((m, r) => Math.max(m, Number(r.sort_order ?? 0)), -1);
            const sort_order = maxSort + 1;

            const payload = {
                house_id: houseId,
                key: cleanKey,
                name: name ?? cleanKey,
                icon: icon ?? null,
                sort_order,
                is_archived: false,
            };

            const { data, error } = await supabase
                .from("rooms")
                .insert(payload)
                .select("id, house_id, key, name, icon, type, sort_order, is_archived, created_at")
                .single();

            if (error) throw error;

            // Option A: reload to be 100% consistent
            await this.loadForHouse(houseId, { force: true });
            return data;
        },

        async updateRoom(roomId, patch) {
            if (!roomId) throw new Error("updateRoom: missing roomId");

            const safePatch = { ...patch };
            // key rename is intentionally not supported here (URL/presence)
            if ("key" in safePatch) delete safePatch.key;

            const { error } = await supabase.from("rooms").update(safePatch).eq("id", roomId);
            if (error) throw error;

            // reload current house
            const houseId = this.loadedForHouseId;
            if (houseId) await this.loadForHouse(houseId, { force: true });
            return true;
        },

        async archiveRoom(roomId) {
            const r = (this.rooms ?? []).find((x) => x.id === roomId);
            if (!r) throw new Error("archiveRoom: room not found");
            if (r.key === "living") throw new Error("living cannot be archived");

            const { error } = await supabase.from("rooms").update({ is_archived: true }).eq("id", roomId);
            if (error) throw error;

            const houseId = r.house_id ?? this.loadedForHouseId;
            if (houseId) await this.loadForHouse(houseId, { force: true });
            return true;
        },

        async reorderRooms(pairs) {
            if (!Array.isArray(pairs) || pairs.length === 0) return false;
            const houseId = this.loadedForHouseId;
            if (!houseId) throw new Error("reorderRooms: no loaded house");

            const { error } = await supabase.rpc("reorder_rooms", {
                p_house_id: houseId,
                p_pairs: pairs,
            });

            if (error) throw error;

            await this.loadForHouse(houseId, { force: true });
            return true;
        },

    },
});
