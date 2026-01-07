import { defineStore } from 'pinia'

export const useHouseStore = defineStore('house', {
    state: () => ({
        // ✅ חדש: בתים (לשלב ה-Houses)
        currentHouseId: null,
        myHouses: [],

        // ✅ קיים אצלך: חדר נוכחי + חדרים (עד שנעבור ל-rooms מה-DB)
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
        currentRoomData: (state) => state.rooms[state.currentRoom],

        roomUserCounts: (state) => {
            const counts = {}
            for (const [roomId, room] of Object.entries(state.rooms)) {
                counts[roomId] = room.users.length
            }
            return counts
        },

        activeRooms: (state) => {
            return Object.entries(state.rooms)
                .filter(([_, room]) => room.users.length > 0)
                .map(([id, room]) => ({ id, ...room }))
        }
    },

    actions: {
        // ✅ חדש: קובע בית נוכחי + אפשר לשמור ללוקאלסטורג' אם בא לך
        setCurrentHouse(houseId) {
            this.currentHouseId = houseId
            try { localStorage.setItem('gio_current_house_id', houseId) } catch (_) { }
        },

        // ✅ חדש: טעינה בסיסית של currentHouseId מה-localStorage (לא חובה אבל נוח)
        hydrateCurrentHouse() {
            try {
                const saved = localStorage.getItem('gio_current_house_id')
                if (saved) this.currentHouseId = saved
            } catch (_) { }
        },

        // קיים אצלך
        enterRoom(roomKey) {
            if (this.rooms[roomKey]) this.currentRoom = roomKey
        },

        addUserToRoom(roomKey, userName) {
            if (this.rooms[roomKey] && !this.rooms[roomKey].users.includes(userName)) {
                this.rooms[roomKey].users.push(userName)
            }
        },

        removeUserFromRoom(roomKey, userName) {
            if (this.rooms[roomKey]) {
                const index = this.rooms[roomKey].users.indexOf(userName)
                if (index > -1) this.rooms[roomKey].users.splice(index, 1)
            }
        },

        moveUser(userName, fromRoom, toRoom) {
            this.removeUserFromRoom(fromRoom, userName)
            this.addUserToRoom(toRoom, userName)
        }
    },
})
