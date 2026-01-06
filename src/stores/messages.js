import { defineStore } from "pinia";
import { supabase } from "../services/supabase";
import { session } from "../stores/auth";

export const useMessagesStore = defineStore("messages", {
    state: () => ({
        byRoom: {}, // roomId -> messages[]
        subs: {},   // roomId -> realtime channel
    }),

    getters: {
        messagesInRoom: (state) => (roomId) => state.byRoom[roomId] ?? [],
    },

    actions: {
        async load(roomId, limit = 100) {
            const { data, error } = await supabase
                .from("messages")
                .select("id, room_id, user_id, text, created_at, profiles(nickname, avatar_url)")
                .eq("room_id", roomId)
                .order("created_at", { ascending: true })
                .limit(limit);

            if (error) throw error;
            this.byRoom[roomId] = data ?? [];
        },

        subscribe(roomId) {
            if (this.subs[roomId]) return;

            const ch = supabase
                .channel(`messages:${roomId}`)
                .on(
                    "postgres_changes",
                    { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
                    (payload) => {
                        if (!this.byRoom[roomId]) this.byRoom[roomId] = [];
                        const msg = payload.new;
                        if (!this.byRoom[roomId]) this.byRoom[roomId] = [];

                        // אם כבר קיימת הודעה עם אותו id – לא מוסיפים שוב
                        const exists = this.byRoom[roomId].some(m => m.id === msg.id);
                        if (!exists) this.byRoom[roomId].push(msg);

                    }
                )
                .subscribe();

            this.subs[roomId] = ch;
        },

        async unsubscribe(roomId) {
            const ch = this.subs[roomId];
            if (!ch) return;
            await supabase.removeChannel(ch);
            delete this.subs[roomId];
        },

        async send(roomId, text) {
            const userId = session.value?.user?.id;
            if (!userId) throw new Error("Not authenticated");

            const trimmed = (text ?? "").trim();
            if (!trimmed) return;

            const { data, error } = await supabase
                .from("messages")
                .insert({
                    room_id: roomId,
                    user_id: userId,
                    text: trimmed,
                })
                .select("id, room_id, user_id, text, created_at")
                .single();

            if (error) throw error;

            if (!this.byRoom[roomId]) this.byRoom[roomId] = [];
            this.byRoom[roomId].push(data);

            return data;
        }

    },
});
