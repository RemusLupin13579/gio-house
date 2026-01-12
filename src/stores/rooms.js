import { defineStore } from "pinia";
import { supabase } from "../services/supabase";

function fileExt(name = "") {
    const i = name.lastIndexOf(".");
    return i !== -1 ? name.slice(i + 1).toLowerCase() : "png";
}

export async function uploadRoomSceneBackground({ houseId, roomId, file }) {
    if (!file) throw new Error("No file provided");

    const ext = fileExt(file.name);
    const path = `${houseId}/${roomId}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
        .from("room-scenes")
        .upload(path, file, {
            cacheControl: "3600",
            upsert: true,
            contentType: file.type || undefined,
        });

    if (upErr) throw upErr;

    const { data } = supabase.storage.from("room-scenes").getPublicUrl(path);
    const publicUrl = data?.publicUrl;
    if (!publicUrl) throw new Error("Failed to get public URL");

    return { publicUrl, path };
}

const ROOM_SELECT = "id, house_id, key, name, icon, type, sort_order, is_archived, scene_background_url, created_at";

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
        async setRoomSceneBackground(roomId, file) {
            const room = (this.rooms || []).find(r => r.id === roomId);
            if (!room) throw new Error("Room not found");

            const { publicUrl } = await uploadRoomSceneBackground({
                houseId: room.house_id,
                roomId,
                file
            });

            await this.updateRoom(roomId, { scene_background_url: publicUrl });
            return publicUrl;
        },

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
                    .select(ROOM_SELECT)
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
                .select(ROOM_SELECT)
                .single();

            if (error) throw error;

            await this.loadForHouse(houseId, { force: true });
            return data;
        },

        async updateRoom(roomId, patch) {
            if (!roomId) throw new Error("updateRoom: missing roomId");

            const safePatch = { ...patch };
            if ("key" in safePatch) delete safePatch.key;

            // מחזירים את הרשומה המעודכנת מהשרת כדי למנוע "שמרתי אבל לא רואים"
            const { data, error } = await supabase
                .from("rooms")
                .update(safePatch)
                .eq("id", roomId)
                .select(ROOM_SELECT)
                .single();

            if (error) throw error;

            // local update לפי מה שחזר
            const idx = (this.rooms ?? []).findIndex((r) => r.id === roomId);
            if (idx >= 0) {
                this.rooms[idx] = data;
            } else {
                this.rooms = [...(this.rooms ?? []), data];
            }

            this.byKey = Object.fromEntries((this.rooms ?? []).map((r) => [r.key, r]));
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
