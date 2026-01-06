<template>
    <div class="min-h-screen bg-black text-white overflow-auto">
        <!-- כותרת -->
        <div class="text-center pt-8 pb-4">
            <h1 class="text-4xl font-bold text-green-400 mb-2">🏠 GIO HOUSE</h1>
            <p class="text-green-600">איפה כולם עכשיו?</p>
        </div>

        <!-- שעון הוויזלים -->
        <div class="flex justify-center py-8">
            <div class="relative w-96 h-96">
                <!-- מעגל חיצוני -->
                <div class="absolute inset-0 rounded-full border-4 border-green-500 bg-gradient-to-br from-gray-900 to-black shadow-2xl shadow-green-500/30 overflow-hidden">
                    <!-- מרכז השעון -->
                    <div class="absolute inset-0 flex items-center justify-center">
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 border-4 border-black shadow-xl"></div>
                    </div>

                    <!-- מיקומים על השעון -->
                    <div v-for="room in roomPositions"
                         :key="room.id"
                         class="absolute text-xs font-bold z-10"
                         :style="getRoomLabelStyle(room.id)">
                        <div class="text-center bg-black/70 px-2 py-1 rounded-lg border border-green-500/50 backdrop-blur">
                            <span class="text-2xl">{{ room.icon }}</span>
                        </div>
                    </div>

                    <!-- אפקט זכוכית -->
                    <div class="absolute inset-0 rounded-full pointer-events-none z-0"
                         style="background: radial-gradient(circle at 30% 20%, rgba(255,255,255,0.10), transparent 45%);"></div>

                    <!-- מחוגים (אווטרים של משתמשים) -->
                    <div v-for="user in clockUsers"
                         :key="user.id"
                         class="absolute inset-0 z-20 pointer-events-none"
                         :style="{ transform: `rotate(${getUserRotation(user)}deg)` }">
                        <!-- המחוג -->
                        <div class="absolute left-1/2 top-1/2 origin-left"
                             :style="{
                                width: `${getHandLen(user)}px`,
                                height: '4px',
                                transform: 'translateY(-50%)',
                                backgroundColor: safeColor(user.color),
                                boxShadow: `0 0 12px ${safeColor(user.color)}66`,
                                borderRadius: '999px',
                                opacity: user.status === 'offline' ? '0.25' : '0.85'
                              }"></div>

                        <!-- avatar at end (locked to the hand) -->
                        <div class="absolute left-1/2 top-1/2"
                             :style="{ transform: `translate(-50%, -50%) translateX(${getHandLen(user)}px)` }">
                            <!-- counter-rotate so the avatar stays upright -->
                            <div :style="{ transform: `rotate(${-getUserRotation(user)}deg)` }">
                                <!-- CLICKABLE HITBOX (not just the emoji) -->
                                <div data-avatar-btn="1"
                                     @click.stop="toggleTooltip(user.id)"
                                     class="relative z-30 cursor-pointer select-none pointer-events-auto group"
                                     :style="{ width: `${getAvatarSize(user)}px`, height: `${getAvatarSize(user)}px` }">
                                    <!-- ring + face -->
                                    <div class="w-full h-full rounded-full flex items-center justify-center border-4 transition-transform active:scale-95 hover:scale-110 overflow-hidden"
                                         :style="{
                                            borderColor: safeColor(user.color),
                                            background: `linear-gradient(135deg, ${safeColor(user.color)}22, ${safeColor(user.color)}44)`,
                                            boxShadow: `0 0 20px ${safeColor(user.color)}88`,
                                            opacity: user.status === 'offline' ? '0.35' : '1'
                                          }">
                                        <!-- אם avatar הוא URL – נציג תמונה -->
                                        <img v-if="user.avatar && (String(user.avatar).startsWith('http') || String(user.avatar).startsWith('blob:'))"
                                             :src="user.avatar"
                                             alt="avatar"
                                             class="w-full h-full object-cover" />

                                        <!-- אחרת – נציג את מה שיש (אימוג'י/אות) -->
                                        <span v-else :class="getAvatarFontClass(user)">
                                            {{ user.avatar || (user.name ? user.name[0] : "🙂") }}
                                        </span>
                                    </div>


                                    <!-- status dot -->
                                    <div class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-black"
                                         :class="getStatusColor(user.status)"></div>

                                    <!-- tooltip (tap on mobile, hover on desktop) -->
                                    <div class="absolute -bottom-9 left-1/2 -translate-x-1/2
                                           bg-black/90 px-3 py-1 rounded-lg border whitespace-nowrap text-xs font-bold
                                           pointer-events-none opacity-0 transition-opacity"
                                         :class="activeTooltipUserId === user.id ? 'opacity-100' : 'group-hover:opacity-100'"
                                         :style="{ borderColor: safeColor(user.color), color: safeColor(user.color) }">
                                        {{ user.name }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>


                        <!-- טבעת “זוהר” עדינה בפנים (אופציונלי) -->
                        <div class="absolute inset-0 rounded-full pointer-events-none z-0"
                             style="box-shadow: inset 0 0 80px rgba(34,197,94,0.12);"></div>
                    </div>
            </div>
        </div>


        

        <!-- רשימת חדרים -->
        <div class="max-w-md mx-auto px-4 pb-8">
            <h2 class="text-green-400 font-bold mb-4 text-xl text-center">
                🚪 חדרים זמינים
            </h2>

            <div class="space-y-3">
                <button v-for="room in Object.entries(house.rooms)"
                        :key="room[0]"
                        @click="enterRoom(room[0])"
                        class="w-full bg-gradient-to-r from-gray-900 to-gray-800 border-2 border-green-500/50 rounded-xl p-4 hover:border-green-400 hover:shadow-xl hover:shadow-green-500/20 transition-all active:scale-98">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-4">
                            <span class="text-4xl">{{ getRoomIcon(room[0]) }}</span>
                            <div class="text-right">
                                <div class="text-white font-bold text-lg">{{ room[1].name }}</div>
                                <div class="text-green-500 text-sm">
                                    {{ presence.usersInRoom(room[0]).length }} בפנים
                                </div>
                            </div>
                        </div>
                        <div class="text-green-400 text-2xl">←</div>
                    </div>

                    <!-- מפריד + שורת מחוברים -->
                    <div v-if="presence.usersInRoom(room[0]).length > 0" class="mt-3 pt-3">
                        <div class="h-px w-full bg-gradient-to-r from-transparent via-green-500/40 to-transparent mb-3"></div>

                        <div class="flex flex-row flex-wrap gap-2 justify-end items-center">
                            <div v-for="u in presence.usersInRoom(room[0]).slice(0, 8)"
                                 :key="u.user_id"
                                 class="w-8 h-8 rounded-full border-2 border-green-400/50 overflow-hidden bg-black/50 flex-shrink-0"
                                 :title="u.nickname">
                                <img v-if="u.avatar_url" :src="u.avatar_url" class="w-full h-full object-cover" alt="" />
                                <div v-else class="w-full h-full flex items-center justify-center text-xs text-green-200">
                                    {{ (u.nickname?.[0] ?? "•") }}
                                </div>
                            </div>

                            <div v-if="presence.usersInRoom(room[0]).length > 8"
                                 class="text-green-400 text-xs font-bold">
                                +{{ presence.usersInRoom(room[0]).length - 8 }}
                            </div>
                        </div>
                    </div>


                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { supabase } from "../services/supabase";
    import { computed } from 'vue'
    import { useUIStore } from '../stores/ui'
    import { useHouseStore } from '../stores/house'
    import { useUserStore } from '../stores/users'
    import { useRouter } from 'vue-router'
    import { ref, onMounted, onBeforeUnmount, onUnmounted } from 'vue'
    import { usePresenceStore } from "../stores/presence";

    const activeTooltipUserId = ref(null)
    const router = useRouter()
    const ui = useUIStore()
    const house = useHouseStore()
    const userStore = useUserStore()
    const status = ref("loading...");
    const presence = usePresenceStore();
   
    const clockUsers = computed(() => {
        const list = Object.values(presence.users || {}); // ✅ הופך map -> array

        return list
            .map(u => ({
                id: u.user_id ?? u.id,                 // אצלך זה user_id
                name: u.nickname ?? "User",            // אצלך זה nickname
                avatar: u.avatar_url ?? null,          // אצלך זה avatar_url
                color: u.color ?? "#22c55e",           // אם אין עדיין צבע בפרזנס
                status: "online",                      // Presence = אונליין. אופליין פשוט לא נמצא
                roomKey: u.room_name ?? "living",      // אצלך זה room_name
            }))
            .filter(u => !!u.id)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    });

    function getAvatarSize(user) {
        const sameRoomCount = clockUsers.value.filter(u => u.roomKey === user.roomKey).length;

        if (sameRoomCount >= 7) return 44;
        if (sameRoomCount >= 5) return 50;
        if (sameRoomCount >= 3) return 56;
        return 60; // היה 72
    }

    function getAvatarFontClass(user) {
        const s = getAvatarSize(user);
        if (s <= 44) return "text-xl";
        if (s <= 50) return "text-2xl";
        return "text-3xl";
    }


    function toggleTooltip(userId) {
        console.log('tap user:', userId)
        activeTooltipUserId.value = (activeTooltipUserId.value === userId) ? null : userId
    }


    function closeTooltip() {
        activeTooltipUserId.value = null
    }

    // סוגר כשנוגעים “בחוץ”
    function onDocPointerDown(e) {
        // אם לחצו על כפתור אוואטר (יש לנו data attr), לא לסגור
        const insideAvatar = e.target?.closest?.('[data-avatar-btn="1"]')
        if (!insideAvatar) closeTooltip()
    }

    onMounted(async () => {
        await presence.connect();
        // תדווח שאתה בחדר הנוכחי
        await presence.setRoom("living");
        console.log("✅ Supabase ping: start");

        console.log("URL:", import.meta.env.VITE_SUPABASE_URL);
        console.log("KEY starts with:", (import.meta.env.VITE_SUPABASE_ANON_KEY || "").slice(0, 14));

        const { data, error } = await supabase.auth.getSession();
        console.log("✅ Supabase ping: session result", { data, error });
    });
    onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointerDown))
    // אופציונלי: כשעוזבים את האפליקציה
    onUnmounted(() => {
        // לא חובה, נוח לדיבוג
        //presence.disconnect();
    });


    // מיקומי החדרים על השעון
    const roomPositions = computed(() => [
        { id: 'living', name: 'סלון', icon: '🛋️' },
        { id: 'gaming', name: 'גיימינג', icon: '🎮' },
        { id: 'study', name: 'לימוד', icon: '📚' },
        { id: 'bathroom', name: 'שירותים', icon: '🚿' },
        { id: 'cinema', name: 'קולנוע', icon: '🎬' },
        { id: 'afk', name: 'לא פה', icon: '😴' },
    ])
    

    const ROOM_ANGLE = {
        // 12, 2, 4, 6, 8, 10 (עם כיוון שעון)
        living: 0,
        gaming: 60,
        cinema: 120,
        bathroom: 180,
        study: 240,
        afk: 300,
    }

    function safeColor(c) {
        return (typeof c === 'string' && c.startsWith('#')) ? c : '#22c55e'
    }

    function getHandLen(user) {
        const base = 145;

        const sameRoom = clockUsers.value
            .filter(u => u.roomKey === user.roomKey)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));

        const idx = sameRoom.findIndex(u => u.id === user.id);

        // כל אחד באותו חדר יקבל עוד 8px, כדי שלא יישבו בדיוק על אותו נקודה
        return base + idx * 8;
    }



    // חישוב מיקום תוויות החדרים
    function getRoomLabelStyle(roomId) {
        const angleDeg = ((ROOM_ANGLE[roomId] ?? ROOM_ANGLE.afk) - 90)
        const radius = 160

        const rad = (angleDeg * Math.PI) / 180
        const x = Math.cos(rad) * radius
        const y = Math.sin(rad) * radius

        return {
            left: `calc(50% + ${x}px)`,
            top: `calc(50% + ${y}px)`,
            transform: 'translate(-50%, -50%)'
        }
    }


    // חישוב זווית המחוג
    function getUserRotation(user) {
        // ROOM_ANGLE מוגדר אצלך כ"שעון" (0 למעלה, 60 = 2, וכו')
        // בשביל CSS צריך להזיז ב-90 מעלות שמאלה כדי ש-0 יהיה למעלה
        const base = (ROOM_ANGLE[user.roomKey] ?? ROOM_ANGLE.afk) - 90;

        const sameRoom = clockUsers.value
            .filter(u => u.roomKey === user.roomKey)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));

        const idx = sameRoom.findIndex(u => u.id === user.id);

        const step = 10;
        const offset = (idx - (sameRoom.length - 1) / 2) * step;

        return base + offset;
    }





    // צבע סטטוס
    function getStatusColor(status) {
        return {
            online: 'bg-green-400',
            afk: 'bg-yellow-400',
            offline: 'bg-gray-600',
        }[status] || 'bg-gray-600'
    }

    // שם החדר
    function getRoomName(roomId) {
        return house.rooms[roomId]?.name || 'לא פה'
    }

    // אייקון חדר
    function getRoomIcon(roomId) {
        const icons = {
            living: '🛋️',
            gaming: '🎮',
            bathroom: '🚿',
            study: '📚',
            cinema: '🎬'
        }
        return icons[roomId] || '🚪'
    }

    // משתמשים בחדר
    function getUsersInRoom(roomId) {
        return userStore.usersInRoom(roomId)
    }

    // כניסה לחדר
    async function enterRoom(roomKey) {
        await presence.connect();        // 👈 חובה, כדי שיהיה channel פעיל
        house.enterRoom(roomKey);
        await presence.setRoom(roomKey);
        router.push(`/room/${roomKey}`);
    }


    console.log('USERS', userStore.users.map(u => ({ name: u.name, currentRoom: u.currentRoom, color: u.color })))
    console.log('ROOM IDS', roomPositions.value.map(r => r.id))
</script>

<style scoped>
    .active\:scale-98:active {
        transform: scale(0.98);
    }
</style>