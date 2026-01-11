import { defineStore } from 'pinia'
import { supabase } from "../services/supabase";

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
            },
            afk: {
                name: 'שינה',
                background: 'afk',
                users: [],
                description: 'מצב AFK / לא זמין'
            },

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
        // ✅ קובע בית נוכחי + שומר ללוקאלסטורג'
        setCurrentHouse(houseId) {
            this.currentHouseId = houseId;
            try { localStorage.setItem("gio_current_house_id", houseId); } catch (_) { }
        },

        // ✅ טוען currentHouseId מה-localStorage
        hydrateCurrentHouse() {
            try {
                const saved = localStorage.getItem("gio_current_house_id");
                if (saved) this.currentHouseId = saved;
            } catch (_) { }
        },

        // --------------------
        // Rooms (הישן שלך)
        // --------------------
        enterRoom(roomKey) {
            if (this.rooms[roomKey]) this.currentRoom = roomKey;
        },

        addUserToRoom(roomKey, userName) {
            if (this.rooms[roomKey] && !this.rooms[roomKey].users.includes(userName)) {
                this.rooms[roomKey].users.push(userName);
            }
        },

        removeUserFromRoom(roomKey, userName) {
            if (this.rooms[roomKey]) {
                const index = this.rooms[roomKey].users.indexOf(userName);
                if (index > -1) this.rooms[roomKey].users.splice(index, 1);
            }
        },

        moveUser(userName, fromRoom, toRoom) {
            this.removeUserFromRoom(fromRoom, userName);
            this.addUserToRoom(toRoom, userName);
        },

        // --------------------
        // Houses (החדש)
        // --------------------
        async loadMyHouses() {
            const { data, error } = await supabase
                .from("house_members")
                .select("role, houses:house_id ( id, name, is_public, join_code, created_at )")
                .order("created_at", { ascending: true });

            if (error) {
                console.error("loadMyHouses error:", error);
                return;
            }

            this.myHouses = (data ?? [])
                .map((r) => ({ ...r.houses, myRole: r.role }))
                .filter(Boolean);
        },

        async ensurePublicHouseMembership() {
            const { data, error } = await supabase.rpc("ensure_public_house_membership");
            if (error) {
                console.error("ensurePublicHouseMembership error:", error);
                return null;
            }
            return data; // house_id
        },

        async createHouse(name, joinCode) {
            const { data, error } = await supabase.rpc("create_house", {
                p_name: name,
                p_join_code: joinCode || null,
            });

            if (error) throw error;
            return data; // house_id
        },

        async joinHouseByCode(code) {
            const { data, error } = await supabase.rpc("join_house_by_code", {
                p_code: code,
            });

            if (error) throw error;
            return data; // house_id
        },
    },

})
