// /src/stores/profiles.js
import { defineStore } from "pinia";
import { supabase } from "../services/supabase";
import { useAuthStore } from "./auth";

const PROFILE_SELECT = "id, nickname, avatar_url, color";

export const useProfilesStore = defineStore("profiles", {
    state: () => ({
        byId: {}, // { [userId]: { id, nickname, avatar_url, color } }
        loading: new Set(),
        meLoading: false,
        lastLoadedAt: 0,
        lastError: null,
    }),

    getters: {
        getById: (s) => (id) => (id ? s.byId?.[id] || null : null),
    },

    actions: {
        _now() {
            return Date.now();
        },

        _upsertOne(row) {
            if (!row?.id) return;
            const prev = this.byId[row.id] || {};
            this.byId[row.id] = { ...prev, ...row };
            this.lastLoadedAt = this._now();
        },

        upsertMany(rows = []) {
            for (const r of rows) this._upsertOne(r);
        },

        async ensureLoaded(ids = []) {
            const uniq = [...new Set(ids)].filter(Boolean);
            const need = uniq.filter((id) => !this.byId[id] && !this.loading.has(id));
            if (!need.length) return;

            need.forEach((id) => this.loading.add(id));
            this.lastError = null;

            try {
                const { data, error } = await supabase
                    .from("profiles")
                    .select(PROFILE_SELECT)
                    .in("id", need);

                if (error) throw error;
                this.upsertMany(data || []);
            } catch (e) {
                this.lastError = e?.message || String(e);
                console.error("[profiles.ensureLoaded] failed:", e);
            } finally {
                need.forEach((id) => this.loading.delete(id));
            }
        },

        // ✅ טוען "אני" וממלא auth.profile דרך auth.setProfile
        async fetchMyProfile() {
            const auth = useAuthStore();
            await auth.init();

            const uid = auth.userId || null;
            if (!uid) {
                auth.setProfile?.(null);
                return null;
            }

            // cache hit
            const cached = this.byId?.[uid];
            if (cached?.nickname || cached?.avatar_url || cached?.color) {
                auth.setProfile?.({
                    id: uid,
                    nickname: cached.nickname || "User",
                    avatar_url: cached.avatar_url || null,
                    color: cached.color || "#22c55e",
                });
                return cached;
            }

            if (this.meLoading) return cached || null;
            this.meLoading = true;
            this.lastError = null;

            try {
                const { data, error } = await supabase
                    .from("profiles")
                    .select(PROFILE_SELECT)
                    .eq("id", uid)
                    .maybeSingle();

                if (error) throw error;

                const row = data || {
                    id: uid,
                    nickname: "User",
                    avatar_url: null,
                    color: "#22c55e",
                };

                this._upsertOne(row);

                auth.setProfile?.({
                    id: uid,
                    nickname: row.nickname || "User",
                    avatar_url: row.avatar_url || null,
                    color: row.color || "#22c55e",
                });

                return row;
            } catch (e) {
                this.lastError = e?.message || String(e);
                console.error("[profiles.fetchMyProfile] failed:", e);

                // fallback יציב
                auth.setProfile?.({
                    id: uid,
                    nickname: "User",
                    avatar_url: null,
                    color: "#22c55e",
                });

                return null;
            } finally {
                this.meLoading = false;
            }
        },

        reset() {
            this.byId = {};
            this.loading = new Set();
            this.meLoading = false;
            this.lastLoadedAt = 0;
            this.lastError = null;
        },
    },
});
