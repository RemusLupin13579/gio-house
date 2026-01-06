import { defineStore } from "pinia";
import { supabase } from "../services/supabase";
import { session, profile } from "../stores/auth";

export const usePresenceStore = defineStore("presence", {
    state: () => ({
        channel: null,
        // map: userId -> payload (כולל room_name)
        users: {},
        ready: false,
    }),

    getters: {
        // מחזיר מערך של משתמשים לפי חדר (name: living/gaming/...)
        usersInRoom: (state) => (roomName) => {
            return Object.values(state.users).filter((u) => u.room_name === roomName);
        },

        // מחזיר map של room -> users[]
        usersByRoom: (state) => {
            const grouped = {};
            for (const u of Object.values(state.users)) {
                const key = u.room_name ?? "unknown";
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(u);
            }
            return grouped;
        },
    },

    actions: {
        async connect() {
            if (this.channel) return;

            const userId = session.value?.user?.id;
            if (!userId) return;

            const ch = supabase.channel("presence:house", {
                config: { presence: { key: userId } },
            });

            ch.on("presence", { event: "sync" }, () => {
                const state = ch.presenceState();
                // state: { [userId]: [payloads...] }
                const next = {};
                for (const [k, arr] of Object.entries(state)) {
                    // לוקחים את האחרון (יש מקרים של כמה payloads)
                    next[k] = arr[arr.length - 1];
                }
                this.users = next;
                this.ready = true;
            });

            ch.on("presence", { event: "join" }, ({ key, newPresences }) => {
                // אופציונלי – sync כבר מכסה
            });

            ch.on("presence", { event: "leave" }, ({ key, leftPresences }) => {
                // אופציונלי – sync כבר מכסה
            });

            await ch.subscribe(async (status) => {
                if (status !== "SUBSCRIBED") return;

                // track ראשוני (ברירת מחדל: living)
                await ch.track({
                    user_id: userId,
                    nickname: profile.value?.nickname ?? "User",
                    avatar_url: profile.value?.avatar_url ?? null,
                    room_name: "living",
                    ts: Date.now(),
                });
            });

            this.channel = ch;
        },

        async setRoom(roomName) {
            if (!this.channel) return;
            const userId = session.value?.user?.id;
            if (!userId) return;

            await this.channel.track({
                user_id: userId,
                nickname: profile.value?.nickname ?? "User",
                avatar_url: profile.value?.avatar_url ?? null,
                room_name: roomName,
                ts: Date.now(),
            });
        },

        async disconnect() {
            if (!this.channel) return;
            await supabase.removeChannel(this.channel);
            this.channel = null;
            this.users = {};
            this.ready = false;
        },
    },
});
