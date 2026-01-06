import { defineStore } from "pinia";
import { profile, session } from "../stores/auth";

export const useUserStore = defineStore("users", {
    state: () => ({
        // משתמשים דמו (אחרים) - שים להם אווטארים דיפולטיביים, לא מהפרופיל שלך
        users: [
            {
                id: 2,
                name: "נועם",
                status: "online",
                avatar: null,
                currentRoom: "gaming",
            },
            {
                id: 3,
                name: "יהאב",
                status: "afk",
                avatar: null,
                currentRoom: null,
            },
        ],

        messages: [
            // ...כמו שיש לך
        ],
    }),

    getters: {
        // ✅ המשתמש הנוכחי מה-auth (ריאקטיבי)
        currentUser() {
            if (!session.value?.user) return null;

            return {
                id: session.value.user.id,
                name: profile.value?.nickname ?? "משתמש חדש",
                status: "online",
                avatar: profile.value?.avatar_url ?? null,
                currentRoom: "living", // או null / לפי הלוגיקה שלך
            };
        },

        // ✅ רשימת משתמשים כולל המשתמש הנוכחי
        allUsers(state) {
            const me = this.currentUser ? [this.currentUser] : [];
            return [...me, ...state.users];
        },

        onlineUsers() {
            return this.allUsers.filter((u) => u.status === "online");
        },

        usersInRoom() {
            return (roomId) => this.allUsers.filter((u) => u.currentRoom === roomId);
        },

        messagesInRoom: (state) => (roomId) =>
            state.messages
                .filter((msg) => msg.roomId === roomId)
                .sort((a, b) => a.timestamp - b.timestamp),
    },

    actions: {
        addMessage({ userName, userInitial, text, roomId, time }) {
            const newMsg = {
                id: Date.now(),
                userName,
                userInitial: userInitial || userName[0],
                text,
                roomId,
                time:
                    time ||
                    new Date().toLocaleTimeString("he-IL", {
                        hour: "2-digit",
                        minute: "2-digit",
                    }),
                timestamp: Date.now(),
            };

            this.messages.push(newMsg);
            return newMsg;
        },
    },
});
