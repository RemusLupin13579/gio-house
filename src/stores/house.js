import { defineStore } from 'pinia'

export const useHouseStore = defineStore('house', {
    state: () => ({
        currentRoom: 'living',
        rooms: {
            living: {
                name: 'הסלון',
                background: 'living',
                users: ['רמוס', 'נועם'],
                description: 'מקום להיפגש ולדבר'
            },
            gaming: {
                name: 'חדר המשחקים',
                background: 'gaming',
                users: ['יהאב'],
                description: 'League, Riftbound ועוד'
            },
            bathroom: {
                name: 'שירותים',
                background: 'bathroom',
                users: [],
                description: 'רגע של שקט...'
            },
            study: {
                name: 'בית המדרש',
                background: 'study',
                users: [],
                description: 'ללמוד חברותות ביחד'
            },
            cinema: {
                name: 'אולם הקולנוע',
                background: 'cinema',
                users: [],
                description: 'צפייה משותפת בסרטים'
            }
        },
    }),

    getters: {
        // קבלת החדר הנוכחי
        currentRoomData: (state) => {
            return state.rooms[state.currentRoom]
        },

        // כמה משתמשים בכל חדר
        roomUserCounts: (state) => {
            const counts = {}
            for (const [roomId, room] of Object.entries(state.rooms)) {
                counts[roomId] = room.users.length
            }
            return counts
        },

        // חדרים פעילים (עם משתמשים)
        activeRooms: (state) => {
            return Object.entries(state.rooms)
                .filter(([_, room]) => room.users.length > 0)
                .map(([id, room]) => ({ id, ...room }))
        }
    },

    actions: {
        // כניסה לחדר
        enterRoom(roomKey) {
            if (this.rooms[roomKey]) {
                this.currentRoom = roomKey
            }
        },

        // הוספת משתמש לחדר
        addUserToRoom(roomKey, userName) {
            if (this.rooms[roomKey] && !this.rooms[roomKey].users.includes(userName)) {
                this.rooms[roomKey].users.push(userName)
            }
        },

        // הסרת משתמש מחדר
        removeUserFromRoom(roomKey, userName) {
            if (this.rooms[roomKey]) {
                const index = this.rooms[roomKey].users.indexOf(userName)
                if (index > -1) {
                    this.rooms[roomKey].users.splice(index, 1)
                }
            }
        },

        // העברת משתמש בין חדרים
        moveUser(userName, fromRoom, toRoom) {
            this.removeUserFromRoom(fromRoom, userName)
            this.addUserToRoom(toRoom, userName)
        }
    },
})