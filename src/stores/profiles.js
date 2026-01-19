// /src/stores/profiles.js
import { defineStore } from "pinia";
import { supabase } from "../services/supabase";
import { useAuthStore } from "./auth";

const PROFILE_SELECT = "id, nickname, avatar_url, avatar_full_url, color";

function normalizeToHexColor(input) {
    const v = String(input || "").trim();
    if (!v) return "#22c55e";
    if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(v)) {
        const r = v[1], g = v[2], b = v[3];
        return (`#${r}${r}${g}${g}${b}${b}`).toLowerCase();
    }
    const m = v.match(/^hsl\(\s*([0-9.]+)\s*,\s*([0-9.]+)%\s*,\s*([0-9.]+)%\s*\)$/i);
    if (m) {
        const h = Number(m[1]);
        const s = Number(m[2]) / 100;
        const l = Number(m[3]) / 100;

        // HSL -> RGB -> HEX
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const hp = (((h % 360) + 360) % 360) / 60;
        const x = c * (1 - Math.abs((hp % 2) - 1));
        let r1 = 0, g1 = 0, b1 = 0;
        if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
        else if (hp < 2) [r1, g1, b1] = [x, c, 0];
        else if (hp < 3) [r1, g1, b1] = [0, c, x];
        else if (hp < 4) [r1, g1, b1] = [0, x, c];
        else if (hp < 5) [r1, g1, b1] = [x, 0, c];
        else[r1, g1, b1] = [c, 0, x];

        const m2 = l - c / 2;
        const r = Math.round((r1 + m2) * 255);
        const g = Math.round((g1 + m2) * 255);
        const b = Math.round((b1 + m2) * 255);
        const to = (n) => n.toString(16).padStart(2, "0");
        return `#${to(r)}${to(g)}${to(b)}`.toLowerCase();
    }
    return "#22c55e";
}

export const useProfilesStore = defineStore("profiles", {
    state: () => ({
        byId: {},
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
            const color = normalizeToHexColor(row.color ?? prev.color);
            this.byId[row.id] = { ...prev, ...row, color };
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

        async fetchMyProfile() {
            const auth = useAuthStore();
            await auth.init();

            const uid = auth.userId || null;
            if (!uid) {
                auth.setProfile?.(null);
                return null;
            }

            const cached = this.byId?.[uid];

            // ✅ אם יש cached כלשהו, נשתמש בו (כולל avatar_full_url)
            if (cached && (cached.nickname || cached.avatar_url || cached.avatar_full_url || cached.color)) {
                auth.setProfile?.({
                    id: uid,
                    nickname: cached.nickname || "User",
                    avatar_url: cached.avatar_url || null,
                    avatar_full_url: cached.avatar_full_url || null,
                    color: normalizeToHexColor(cached.color),
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
                    avatar_full_url: null,
                    color: "#22c55e",
                };

                this._upsertOne(row);

                auth.setProfile?.({
                    id: uid,
                    nickname: row.nickname || "User",
                    avatar_url: row.avatar_url || null,
                    avatar_full_url: row.avatar_full_url || null,
                    color: normalizeToHexColor(row.color),
                });

                return row;
            } catch (e) {
                this.lastError = e?.message || String(e);
                console.error("[profiles.fetchMyProfile] failed:", e);

                auth.setProfile?.({
                    id: uid,
                    nickname: "User",
                    avatar_url: null,
                    avatar_full_url: null,
                    color: "#22c55e",
                });

                return null;
            } finally {
                this.meLoading = false;
            }
        },

        async updateMyProfile(patch = {}) {
            const auth = useAuthStore();
            await auth.init();

            const uid = auth.userId || null;
            if (!uid) throw new Error("Not signed in");

            const next = {
                nickname: patch.nickname ?? undefined,
                color: patch.color ? normalizeToHexColor(patch.color) : undefined,
                avatar_url: patch.avatar_url ?? undefined,
                avatar_full_url: patch.avatar_full_url ?? undefined, // ✅ allow updating full url too
                updated_at: new Date().toISOString(),
            };
            Object.keys(next).forEach((k) => next[k] === undefined && delete next[k]);

            this.lastError = null;

            const prev = this.byId?.[uid] || {};

            const optimistic = {
                ...prev,
                id: uid,
                ...next,
                color: normalizeToHexColor(next.color ?? prev.color),
            };

            this._upsertOne(optimistic);
            auth.setProfile?.({
                id: uid,
                nickname: optimistic.nickname || "User",
                avatar_url: optimistic.avatar_url || null,
                avatar_full_url: optimistic.avatar_full_url || null,
                color: normalizeToHexColor(optimistic.color),
            });

            try {
                const { data, error } = await supabase
                    .from("profiles")
                    .update(next)
                    .eq("id", uid)
                    .select(PROFILE_SELECT)
                    .maybeSingle();

                if (error) throw error;

                if (data) {
                    this._upsertOne(data);
                    auth.setProfile?.({
                        id: uid,
                        nickname: data.nickname || "User",
                        avatar_url: data.avatar_url || null,
                        avatar_full_url: data.avatar_full_url || null,
                        color: normalizeToHexColor(data.color),
                    });
                }

                return data || optimistic;
            } catch (e) {
                // rollback
                this._upsertOne(prev);
                auth.setProfile?.({
                    id: uid,
                    nickname: prev.nickname || "User",
                    avatar_url: prev.avatar_url || null,
                    avatar_full_url: prev.avatar_full_url || null,
                    color: normalizeToHexColor(prev.color),
                });

                this.lastError = e?.message || String(e);
                console.error("[profiles.updateMyProfile] failed:", e);
                throw e;
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
