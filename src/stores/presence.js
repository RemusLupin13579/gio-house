import { defineStore } from "pinia";
import { supabase } from "../services/supabase";
import { session, profile } from "../stores/auth";

export const usePresenceStore = defineStore("presence", {
    state: () => ({
        channel: null,
        channelHouseId: null,   // ✅ נוסיף כדי לדעת לאיזה בית מחוברים
        users: {},
        ready: false,
    }),

    getters: {
        usersInRoom: (state) => (roomName) =>
            Object.values(state.users).filter((u) => u.room_name === roomName),

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
        async connect(houseId) {
            const userId = session.value?.user?.id;
            if (!userId) return;
            if (!houseId) return;

            // אם כבר מחוברים לבית הזה – לא לעשות כלום
            if (this.channel && this.channelHouseId === houseId) return;

            // אם היינו מחוברים לבית אחר – ננתק וננקה
            if (this.channel) {
                await supabase.removeChannel(this.channel);
                this.channel = null;
                this.channelHouseId = null;
                this.users = {};
                this.ready = false;
            }

            const channelName = `presence:house:${houseId}`;
            const ch = supabase.channel(channelName, {
                config: { presence: { key: userId } },
            });

            ch.on("presence", { event: "sync" }, () => {
                const state = ch.presenceState();
                const next = {};
                for (const [k, arr] of Object.entries(state)) {
                    next[k] = arr[arr.length - 1];
                }
                this.users = next;
                this.ready = true;
            });

            await ch.subscribe(async (status) => {
                if (status !== "SUBSCRIBED") return;

                await ch.track({
                    user_id: userId,
                    house_id: houseId, // ✅ חשוב!
                    nickname: profile.value?.nickname ?? "User",
                    avatar_url: profile.value?.avatar_url ?? null,
                    room_name: "living",
                    ts: Date.now(),
                });
            });

            this.channel = ch;
            this.channelHouseId = houseId;
        },

        async setRoom(roomName) {
            if (!this.channel) return;
            const userId = session.value?.user?.id;
            if (!userId) return;

            await this.channel.track({
                user_id: userId,
                house_id: this.channelHouseId, // ✅ כדי להישאר עקבי
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
            this.channelHouseId = null;
            this.users = {};
            this.ready = false;
        },
    },
});
