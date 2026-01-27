// /src/stores/dmThreads.js
import { defineStore } from "pinia";
import { supabase } from "../services/supabase";
import { useProfilesStore, PROFILE_SELECT } from "./profiles";

export const useDMThreadsStore = defineStore("dmThreads", {
    state: () => ({
        threads: [], // { id, otherUserId, otherProfile, lastText, lastAt, isSelf }
        loading: false,
        lastError: null,
        selfThreadId: null,
        lastThreadId: localStorage.getItem("dm:lastThreadId") || null,
    }),

    getters: {
        byId: (s) => (id) => s.threads.find((t) => String(t.id) === String(id)) || null,
    },

    actions: {
        async _getMyId() {
            const { data, error } = await supabase.auth.getUser();
            if (error) throw error;
            return data?.user?.id || null;
        },

        setLastThreadId(id) {
            this.lastThreadId = id ? String(id) : null;
            if (this.lastThreadId) localStorage.setItem("dm:lastThreadId", this.lastThreadId);
        },

        async ensureSelfThread() {
            const { data, error } = await supabase.rpc("dm_get_or_create_self_thread");
            if (error) throw error;
            this.selfThreadId = data;
            return data;
        },
        bumpLastMessage(threadId, msg) {
            const t = this.byId(String(threadId));
            if (!t) return;

            t.lastText = msg.text ?? t.lastText;
            t.lastAt = msg.created_at ? Date.parse(msg.created_at) : Date.now();
            t.lastUserId = msg.user_id ?? t.lastUserId;
        },
        async _forceLoadProfiles(ids = []) {
            const profilesStore = useProfilesStore();
            const uniq = [...new Set(ids)].filter(Boolean);
            if (!uniq.length) return;

            const { data, error } = await supabase
                .from("profiles")
                .select(PROFILE_SELECT)
                .in("id", uniq);

            if (error) throw error;
            profilesStore.upsertMany(data || []);
        },

        async loadMyThreads(limit = 50) {
            this.loading = true;
            this.lastError = null;

            try {
                const myId = await this._getMyId();
                if (!myId) {
                    this.threads = [];
                    return;
                }

                if (!this.selfThreadId) {
                    await this.ensureSelfThread().catch(() => { });
                }

                const { data, error } = await supabase.rpc("dm_list_threads", { p_limit: limit });
                if (error) throw error;

                const rows = data || [];
                const otherIds = rows.map((r) => r.other_user_id).filter(Boolean);

                // ✅ טען תמיד את הפרופילים עם שדות ה-DM scene
                await this._forceLoadProfiles([myId, ...otherIds]);

                const profilesStore = useProfilesStore();
                const myProfile = profilesStore.byId?.[myId] || null;

                this.threads = rows.map((r) => {
                    const threadId = r.thread_id;
                    const isSelf = !!(this.selfThreadId && String(threadId) === String(this.selfThreadId));

                    // self thread: other_user_id לרוב null → "הצד השני" הוא אני
                    const otherUserId = isSelf ? myId : (r.other_user_id || null);

                    // ✅ זה החלק שהיה חסר לך וגרם ל-DMScene לקבל null
                    const otherProfile = isSelf
                        ? myProfile
                        : (otherUserId ? (profilesStore.byId?.[otherUserId] || null) : null);

                    return {
                        id: threadId,
                        otherUserId,
                        otherProfile,
                        isSelf,
                        lastText: r.last_text || "",
                        lastAt: r.last_at || null,
                    };
                });
            } catch (e) {
                this.lastError = e?.message || String(e);
                console.error("[dmThreads.loadMyThreads]", e);
            } finally {
                this.loading = false;
            }
        },

        async openOrCreateDM(otherUserId) {
            const { data, error } = await supabase.rpc("dm_get_or_create_thread", {
                other_user_id: otherUserId,
            });
            if (error) throw error;
            return data;
        },
    },
});
