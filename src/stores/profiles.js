// /src/stores/profiles.js
import { defineStore } from "pinia";
import { supabase } from "../services/supabase";
import { useAuthStore } from "./auth";

// ✅ include DM scene fields so cache always has them
export const PROFILE_SELECT =
    "id, nickname, avatar_url, avatar_full_url, color, dm_scene_background_url, dm_scene_caption";

function normalizeToHexColor(input) {
    const v = String(input || "").trim();
    if (!v) return "#22c55e";

    if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(v)) {
        const r = v[1],
            g = v[2],
            b = v[3];
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }

    const m = v.match(/^hsl\(\s*([0-9.]+)\s*,\s*([0-9.]+)%\s*,\s*([0-9.]+)%\s*\)$/i);
    if (m) {
        const h = Number(m[1]);
        const s = Number(m[2]) / 100;
        const l = Number(m[3]) / 100;

        const c = (1 - Math.abs(2 * l - 1)) * s;
        const hp = (((h % 360) + 360) % 360) / 60;
        const x = c * (1 - Math.abs((hp % 2) - 1));

        let r1 = 0,
            g1 = 0,
            b1 = 0;
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

function stripUndefined(obj) {
    return Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v !== undefined));
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
                const { data, error } = await supabase.from("profiles").select(PROFILE_SELECT).in("id", need);
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
            await auth.init?.();

            const uid = auth.userId || null;
            if (!uid) {
                auth.setProfile?.(null);
                return null;
            }

            const cached = this.byId?.[uid];

            if (
                cached &&
                (cached.nickname ||
                    cached.avatar_url ||
                    cached.avatar_full_url ||
                    cached.color ||
                    cached.dm_scene_background_url ||
                    cached.dm_scene_caption)
            ) {
                auth.setProfile?.({
                    ...cached,
                    id: uid,
                    nickname: cached.nickname || "User",
                    color: normalizeToHexColor(cached.color),
                    dm_scene_caption: cached.dm_scene_caption || "",
                    dm_scene_background_url: cached.dm_scene_background_url || null,
                });
                return cached;
            }

            if (this.meLoading) return cached || null;
            this.meLoading = true;
            this.lastError = null;

            try {
                const { data, error } = await supabase.from("profiles").select(PROFILE_SELECT).eq("id", uid).maybeSingle();
                if (error) throw error;

                const row =
                    data || {
                        id: uid,
                        nickname: "User",
                        avatar_url: null,
                        avatar_full_url: null,
                        color: "#22c55e",
                        dm_scene_background_url: null,
                        dm_scene_caption: "",
                    };

                this._upsertOne(row);

                auth.setProfile?.({
                    ...row,
                    id: uid,
                    nickname: row.nickname || "User",
                    color: normalizeToHexColor(row.color),
                    dm_scene_caption: row.dm_scene_caption || "",
                    dm_scene_background_url: row.dm_scene_background_url || null,
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
                    dm_scene_background_url: null,
                    dm_scene_caption: "",
                });

                return null;
            } finally {
                this.meLoading = false;
            }
        },

        /**
         * ✅ Safe update:
         * - no `session` import needed
         * - reads uid from supabase.auth.getUser()
         * - returns SELECT with dm fields too
         * - upserts into byId (merge) so nothing "disappears"
         * - syncs authStore.profile as well (if you use it elsewhere)
         */
        async updateMyProfile(patch) {
            const clean = stripUndefined(patch);

            if (clean.color !== undefined) {
                clean.color = normalizeToHexColor(clean.color);
            }

            const { data: authData, error: authErr } = await supabase.auth.getUser();
            if (authErr) throw authErr;

            const uid = authData?.user?.id;
            if (!uid) throw new Error("Not authed");

            const { data, error } = await supabase
                .from("profiles")
                .update(clean)
                .eq("id", uid)
                .select(PROFILE_SELECT)
                .single();

            if (error) throw error;

            this._upsertOne(data);

            const auth = useAuthStore();
            const prev = auth.profile || {};
            auth.setProfile?.({
                ...prev,
                ...data,
                color: normalizeToHexColor(data.color),
                dm_scene_caption: data.dm_scene_caption || "",
                dm_scene_background_url: data.dm_scene_background_url || null,
            });

            return data;
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
