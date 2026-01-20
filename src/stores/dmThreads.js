// /src/stores/dmThreads.js
import { defineStore } from "pinia";
import { supabase } from "../services/supabase";
import { useProfilesStore } from "./profiles";
import { session } from "./auth";

export const useDMThreadsStore = defineStore("dmThreads", {
    state: () => ({
        threads: [], // { id, last_message_at, otherUserId, otherProfile, lastText, lastAt }
        loading: false,
        lastError: null,
        selfThreadId: null,
    }),

    getters: {
        byId: (s) => (id) => s.threads.find((t) => t.id === id) || null,
    },

    actions: {
        async ensureSelfThread() {
            const { data, error } = await supabase.rpc("dm_get_or_create_self_thread");
            if (error) throw error;
            this.selfThreadId = data;
            return data;
        },

        async loadMyThreads(limit = 50) {
            const myId = session.value?.user?.id;
            if (!myId) return;

            this.loading = true;
            this.lastError = null;

            try {
                const { data, error } = await supabase.rpc("dm_list_threads", { p_limit: limit });
                if (error) throw error;

                const rows = data || [];
                const otherIds = rows.map(r => r.other_user_id).filter(Boolean);

                const profilesStore = useProfilesStore();
                await profilesStore.ensureLoaded([...new Set(otherIds)]);

                this.threads = rows.map(r => {
                    const otherProfile = r.other_user_id ? (profilesStore.byId?.[r.other_user_id] || null) : null;
                    return {
                        id: r.thread_id,
                        otherUserId: r.other_user_id,
                        otherProfile,
                        lastText: r.last_text || "",
                        lastAt: r.last_at,
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
            return data; // threadId (uuid)
        },
    },
});
