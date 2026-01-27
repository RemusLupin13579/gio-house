<template>
    <!--
      GIO AppShell
      ============
      - Desktop: 3 columns (Rail / Sidebar / Main)
      - Mobile: Topbar + Drawer with Rail + Sidebar
      - RouterView always in Main (except when drawer open on /dms)
      - Badges: DM + Rooms (unread)
    -->
    <div class="fixed inset-0 bg-black text-white overflow-hidden flex flex-col md:flex-row">

        <!-- ✅ MOBILE TOP BAR (לא בחדר ולא בDM פתוח) -->
        <div v-if="showMobileTopBar"
             class="md:hidden h-12 px-3 flex items-center justify-between border-b border-white/5">
            <button class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/50 transition active:scale-[0.98]"
                    @click="openMobileNav()"
                    title="Menu">
                ☰
            </button>

            <!-- לובי shortcut -->
            <button class="w-full px-3 py-2 rounded-xl flex items-center justify-between hover:bg-white/5 transition border border-transparent"
                    :class="route.name === 'home' ? 'bg-white/5 border border-green-500/30' : ''"
                    @click="goLobby({ closeDrawer: true })">
                <div class="flex items-center gap-2">
                    <span class="text-lg">🏛️</span>
                    <span class="font-semibold truncate block max-w-[180px]">לובי</span>
                </div>

                <div class="gio-room-right ml-auto flex items-center gap-2 justify-end" dir="ltr">
                    <!-- avatars -->
                    <div class="gio-room-avatars" dir="ltr">
                        <template v-for="(u, i) in roomUsers('lobby').slice(0, AVATARS_MAX)" :key="u.user_id || u.id || i">
                            <div class="gio-room-avatar" :style="{ zIndex: 10 + i }" :title="u.nickname || 'User'">
                                <img v-if="u.avatar_url" :src="u.avatar_url" alt="" />
                                <span v-else>{{ (u.nickname?.[0] ?? "•") }}</span>
                            </div>
                        </template>

                        <div v-if="roomUsers('lobby').length > AVATARS_MAX"
                             class="gio-room-avatar gio-room-more"
                             :title="`+${roomUsers('lobby').length - AVATARS_MAX}`">
                            +{{ roomUsers('lobby').length - AVATARS_MAX }}
                        </div>
                    </div>

                    <!-- count -->
                    <span v-if="roomUsers('lobby').length >= 2" class="gio-room-count">
                        <span v-if="presence.status === 'connecting'" class="gio-skel-count"></span>
                        <span v-else>{{ roomUsers('lobby').length }}</span>
                    </span>
                </div>
            </button>
        </div>

        <!-- ✅ DESKTOP STAGE -->
        <div class="gio-app-stage flex-1 min-h-0 flex md:flex-row" :style="appStageStyle">

            <!-- LEFT RAIL (desktop): DMs + houses rail -->
            <aside class="hidden md:flex w-16 bg-[#0b0f12] border-r border-white/5 flex-col items-center">
                <div class="w-full px-2 pt-2">
                    <button class="relative w-full h-12 rounded-2xl bg-white/5 border border-white/10 hover:border-green-500/40 transition flex items-center justify-center"
                            :class="isDMMode ? 'border-green-500/40 bg-white/10' : ''"
                            @click="goDMs()"
                            title="DMs">
                        💬

                        <span v-if="notifications.dmTotalUnread > 0"
                              class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1
                     rounded-full bg-green-500 text-black text-[11px] font-extrabold
                     flex items-center justify-center shadow-lg">
                            {{ Math.min(99, notifications.dmTotalUnread) }}
                        </span>
                    </button>

                    <div class="h-px bg-white/10 mt-2 mb-1"></div>
                </div>

                <div class="w-full flex-1 flex items-center">
                    <HousesSidebar :houses="houseRail"
                                   :current-house-id="house.currentHouseId"
                                   @select-house="switchHouse"
                                   @open-add="openHouseModal = true" />
                </div>
            </aside>

            <!-- RIGHT PANEL (desktop): Rooms OR DMs -->
            <section class="hidden md:flex w-72 bg-[#0c1116] border-r border-white/5 flex-col">
                <!-- header -->
                <div class="h-20 px-4 flex items-center justify-between border-b border-white/5">
                    <div class="flex items-center gap-2 w-full">
                        <template v-if="isDMMode">
                            <div class="flex items-center gap-2 flex-1 min-w-0">
                                <span class="text-lg">💬</span>
                                <div class="min-w-0">
                                    <div class="font-extrabold text-white/85 leading-tight truncate">Messages</div>
                                    <div class="text-xs text-white/40 truncate">DMs</div>
                                </div>
                            </div>
                        </template>

                        <template v-else>
                            <div class="gio-topbar flex-1 min-w-0">
                                <div class="gio-topbar__left">
                                    <button class="gio-house-badge text-right w-full" @click="goLobby()" title="לובי">
                                        <span class="gio-house-emoji">{{ isPublicHouse ? "🌍" : "🏠" }}</span>
                                        <div class="gio-house-text">
                                            <div class="gio-house-title">
                                                {{ isPublicHouse ? "GIO HOUSE" : (currentHouse?.name || "My House") }}
                                            </div>
                                            <div class="gio-house-subtitle">
                                                {{ isPublicHouse ? "?איפה כולם עכשיו" : "?מי עכשיו בבית" }}
                                            </div>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            <div class="relative inline-block shrink-0" data-house-menu="1">
                                <button class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/50 transition"
                                        @click.stop="houseMenuOpen = !houseMenuOpen"
                                        title="House menu">
                                    ⋯
                                </button>

                                <div v-if="houseMenuOpen"
                                     class="absolute right-0 mt-2 w-48 bg-[#0b0f12] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
                                    <button class="w-full px-3 py-2 text-right hover:bg-white/5" @click="openInviteModal = true; houseMenuOpen=false">
                                        הזמן חברים
                                    </button>
                                    <div class="h-px bg-white/10 my-1"></div>
                                    <button class="w-full px-3 py-2 text-right hover:bg-white/5" @click="openRoomsModal = true; houseMenuOpen=false">
                                        ניהול בית
                                    </button>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>

                <!-- body list -->
                <div class="flex-1 min-h-0 w-full overflow-hidden flex flex-col p-3">
                    <template v-if="isDMMode">
                        <DMSidebar @openAddFriends="addFriendsOpen = true"
                                   @openThread="onDMOpenThread" />
                    </template>

                    <template v-else>
                        <div class="text-xs text-white/40 mb-3 px-1 uppercase tracking-wider font-medium">חדרים</div>

                        <!-- לובי -->
                        <button class="w-full px-3 py-2 rounded-xl flex items-center justify-between hover:bg-white/5 transition border border-transparent"
                                :class="route.name === 'home' ? 'bg-white/5 border border-green-500/30' : ''"
                                @click="goLobby({ closeDrawer: true })">
                            <div class="flex items-center gap-2">
                                <span class="text-lg">🏛️</span>
                                <span class="font-semibold truncate block max-w-[180px]">לובי</span>
                            </div>

                            <div class="gio-room-right ml-auto flex items-center gap-2 justify-end" dir="ltr">
                                <div class="gio-room-avatars" dir="ltr">
                                    <template v-for="(u, i) in roomUsers('lobby').slice(0, AVATARS_MAX)" :key="u.user_id || u.id || i">
                                        <div class="gio-room-avatar" :style="{ zIndex: 10 + i }" :title="u.nickname || 'User'">
                                            <img v-if="u.avatar_url" :src="u.avatar_url" alt="" />
                                            <span v-else>{{ (u.nickname?.[0] ?? "•") }}</span>
                                        </div>
                                    </template>

                                    <div v-if="roomUsers('lobby').length > AVATARS_MAX"
                                         class="gio-room-avatar gio-room-more"
                                         :title="`+${roomUsers('lobby').length - AVATARS_MAX}`">
                                        +{{ roomUsers('lobby').length - AVATARS_MAX }}
                                    </div>
                                </div>

                                <span v-if="roomUsers('lobby').length >= 2" class="gio-room-count">
                                    <span v-if="presence.status === 'connecting'" class="gio-skel-count"></span>
                                    <span v-else>{{ roomUsers('lobby').length }}</span>
                                </span>
                            </div>
                        </button>

                        <div class="h-px bg-white/10 my-2 mx-2"></div>

                        <!-- rooms -->
                        <button v-for="r in activeRooms"
                                :key="r.id"
                                class="w-full px-3 py-2 rounded-xl hover:bg-white/5 transition"
                                :class="isActiveRoom(r.key) ? 'bg-white/5 border border-green-500/30' : 'border border-transparent'"
                                @click="enterRoom(r.key)">
                            <div class="gio-room-row">
                                <div class="gio-room-left">
                                    <span class="text-lg shrink-0">{{ r.icon || "🚪" }}</span>

                                    <div class="min-w-0">
                                        <span class="font-semibold truncate block max-w-[180px]">
                                            {{ r.name || r.key }}
                                        </span>

                                        <div class="text-[11px] text-white/40 truncate max-w-[180px] w-full text-left" dir="ltr">
                                            {{ roomsStore.lastPreviewFor?.(r.key) || "" }}
                                        </div>
                                    </div>
                                </div>

                                <div class="gio-room-right ml-auto flex items-center gap-2 justify-end" dir="ltr">
                                    <div class="gio-room-avatars" dir="ltr">
                                        <template v-for="(u, i) in roomUsers(r.key).slice(0, AVATARS_MAX)" :key="u.user_id || u.id || i">
                                            <div class="gio-room-avatar" :style="{ zIndex: 10 + i }" :title="u.nickname || 'User'">
                                                <img v-if="u.avatar_url" :src="u.avatar_url" alt="" />
                                                <span v-else>{{ (u.nickname?.[0] ?? "•") }}</span>
                                            </div>
                                        </template>

                                        <div v-if="roomUsers(r.key).length > AVATARS_MAX"
                                             class="gio-room-avatar gio-room-more"
                                             :title="`+${roomUsers(r.key).length - AVATARS_MAX}`">
                                            +{{ roomUsers(r.key).length - AVATARS_MAX }}
                                        </div>
                                    </div>

                                    <span v-if="roomUsers(r.key).length >= 2" class="gio-room-count">
                                        <span v-if="presence.status === 'connecting'" class="gio-skel-count"></span>
                                        <span v-else>{{ roomUsers(r.key).length }}</span>
                                    </span>

                                    <span v-if="getRoomUnread(r.key) > 0"
                                          class="min-w-[18px] h-[18px] px-1 rounded-full
                           bg-green-500 text-black text-[11px] font-extrabold
                           flex items-center justify-center shadow-lg"
                                          title="Unread">
                                        {{ Math.min(99, getRoomUnread(r.key)) }}
                                    </span>
                                </div>
                            </div>
                        </button>
                    </template>
                </div>

                <!-- footer -->
                <div class="h-14 px-3 border-t border-white/5 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <div class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center">
                            <img v-if="avatarUrl" :src="avatarUrl" class="w-full h-full object-cover" alt="" />
                            <span v-else>🙂</span>
                        </div>

                        <div class="leading-tight">
                            <div class="font-bold">{{ nickname }}</div>

                            <div class="gio-topbar__right">
                                <div class="h-5 gio-presence-chip cursor-pointer select-none"
                                     :data-state="presence.status"
                                     :data-user="myUserStatus"
                                     @click="presence.status === 'ready' ? cycleMyStatus() : null"
                                     title="Change status">
                                    <span class="gio-dot" />

                                    <span v-if="presence.status === 'connecting'" class="gio-sync">
                                        Syncing <span class="gio-dots"><i></i><i></i><i></i></span>
                                    </span>

                                    <span v-else-if="presence.status === 'failed'">Offline</span>
                                    <span v-else-if="presence.status === 'ready'">{{ myStatusLabel }}</span>
                                    <span v-else>Idle</span>

                                    <button v-if="presence.status === 'failed'"
                                            class="gio-retry-btn"
                                            @click.stop="retryPresence"
                                            title="Retry">
                                        Retry
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/50 transition"
                            @click="openProfileModal = true"
                            title="Settings">
                        ⚙️
                    </button>
                </div>
            </section>

            <!-- ✅ MAIN CONTENT -->
            <main class="flex-1 bg-black overflow-hidden min-h-0">
                <div class="gio-fade h-full min-h-0" :key="house.currentHouseId">
                    <!-- אם drawer פתוח וגם במסך /dms במובייל → לא מציגים מאחור -->
                    <div v-if="isMobile() && mobileNavOpen && route.name === 'dms'" class="h-full bg-black"></div>

                    <!-- אחרת → רגיל -->
                    <RouterView v-else class="h-full min-h-0" />
                </div>
            </main>
        </div>

        <!-- ✅ MOBILE DRAWER -->
        <div v-if="mobileNavOpen" class="md:hidden fixed inset-0 z-[9999]">
            <div class="absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity"
                 :style="{ opacity: overlayOpacity }"
                 @click="closeMobileNav({ skipHistoryBack: true })"></div>

            <div class="absolute left-0 top-0 h-full bg-[#0b0f12]/95 shadow-2xl will-change-transform"
                 :style="{ width: `${drawerW || drawerWidth()}px`, transform: `translateX(${drawerTranslateX}px)` }"
                 @touchstart.passive="onDrawerTouchStart"
                 @touchmove.passive="onDrawerTouchMove"
                 @touchend="onDrawerTouchEnd">

                <div class="flex h-full">

                    <!-- LEFT RAIL (mobile): DMs + houses -->
                    <div class="w-16 bg-[#0b0f12] border-r border-white/10 flex flex-col items-center">
                        <div class="w-full px-2 pt-2">
                            <button class="relative w-full h-12 rounded-2xl bg-white/5 border border-white/10 hover:border-green-500/40 transition flex items-center justify-center"
                                    :class="isDMMode ? 'border-green-500/40 bg-white/10' : ''"
                                    @click="goDMs()"
                                    title="DMs">
                                💬

                                <span v-if="notifications.dmTotalUnread > 0"
                                      class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1
                         rounded-full bg-green-500 text-black text-[11px] font-extrabold
                         flex items-center justify-center shadow-lg">
                                    {{ Math.min(99, notifications.dmTotalUnread) }}
                                </span>

                                <span v-if="notifications.dmTotalUnread > 0"
                                      class="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full bg-green-500/40 animate-ping"></span>
                            </button>

                            <div class="h-px bg-white/10 mt-2 mb-1"></div>
                        </div>

                        <div class="w-full flex-1">
                            <HousesSidebar :houses="houseRail"
                                           :current-house-id="house.currentHouseId"
                                           @select-house="switchHouse"
                                           @open-add="openHouseModal = true" />
                        </div>
                    </div>

                    <!-- RIGHT PANEL (mobile): lists only -->
                    <div class="flex-1 bg-[#0c1116] flex flex-col min-h-0">
                        <div class="h-16 px-4 flex items-center justify-between border-b border-white/10">
                            <div class="flex items-center gap-2 min-w-0">
                                <div class="font-bold text-green-300 truncate">
                                    {{ isDMMode ? "Messages" : headerTitle }}
                                </div>

                                <div class="relative inline-block shrink-0" data-house-menu="1" v-if="!isDMMode">
                                    <button class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/50 transition"
                                            @click.stop="houseMenuOpen = !houseMenuOpen"
                                            title="House menu">
                                        ⋯
                                    </button>

                                    <div v-if="houseMenuOpen"
                                         class="absolute right-0 mt-2 w-48 bg-[#0b0f12] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
                                        <button class="w-full px-3 py-2 text-right hover:bg-white/5" @click="openInviteModal = true; houseMenuOpen=false">
                                            הזמן חברים
                                        </button>
                                        <div class="h-px bg-white/10 my-1"></div>
                                        <button class="w-full px-3 py-2 text-right hover:bg-white/5" @click="openRoomsModal = true; houseMenuOpen=false">
                                            ניהול בית
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <button class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/50 transition active:scale-[0.98]"
                                    @click="closeMobileNav({ skipHistoryBack: true })"
                                    title="Close">
                                ✕
                            </button>
                        </div>

                        <!-- ✅ BODY (mobile) — כאן התיקון האמיתי: v-if + v-else צמודים -->
                        <div class="flex-1 min-h-0 overflow-hidden">
                            <template v-if="isDMMode">
                                <DMSidebar @openAddFriends="addFriendsOpen = true"
                                           @openThread="onDMOpenThread" />
                            </template>

                            <template v-else>
                                <div class="h-full min-h-0 w-full overflow-hidden flex flex-col p-4">
                                    <div class="text-xs text-white/40 mb-3 px-3 uppercase tracking-wider">חדרים</div>

                                    <div class="space-y-1 overflow-y-auto">
                                        <!-- Lobby -->
                                        <button class="w-full px-3 py-2 rounded-xl flex items-center justify-between hover:bg-white/5 transition border border-transparent"
                                                :class="route.name === 'home' ? 'bg-white/5 border border-green-500/30' : ''"
                                                @click="goLobby({ closeDrawer: true })">
                                            <div class="flex items-center gap-2">
                                                <span class="text-lg">🏛️</span>
                                                <span class="font-semibold truncate block max-w-[180px]">לובי</span>
                                            </div>

                                            <div class="gio-room-right flex items-center gap-2" dir="ltr">
                                                <div class="gio-room-avatars" dir="ltr">
                                                    <template v-for="(u, i) in roomUsers('lobby').slice(0, AVATARS_MAX)" :key="u.user_id || u.id || i">
                                                        <div class="gio-room-avatar" :style="{ zIndex: 10 + i }" :title="u.nickname || 'User'">
                                                            <img v-if="u.avatar_url" :src="u.avatar_url" alt="" />
                                                            <span v-else>{{ (u.nickname?.[0] ?? "•") }}</span>
                                                        </div>
                                                    </template>

                                                    <div v-if="roomUsers('lobby').length > AVATARS_MAX"
                                                         class="gio-room-avatar gio-room-more"
                                                         :title="`+${roomUsers('lobby').length - AVATARS_MAX}`">
                                                        +{{ roomUsers('lobby').length - AVATARS_MAX }}
                                                    </div>
                                                </div>

                                                <span v-if="roomUsers('lobby').length >= 2" class="gio-room-count">
                                                    <span v-if="presence.status === 'connecting'" class="gio-skel-count"></span>
                                                    <span v-else>{{ roomUsers('lobby').length }}</span>
                                                </span>
                                            </div>
                                        </button>

                                        <div class="h-px bg-white/10 my-2"></div>

                                        <!-- Rooms -->
                                        <button v-for="r in activeRooms"
                                                :key="r.id"
                                                class="w-full px-3 py-2 rounded-xl hover:bg-white/5 transition"
                                                :class="isActiveRoom(r.key) ? 'bg-white/5 border border-green-500/30' : 'border border-transparent'"
                                                @click="enterRoom(r.key)">
                                            <div class="gio-room-row">
                                                <div class="gio-room-left">
                                                    <span class="text-lg shrink-0">{{ r.icon || "🚪" }}</span>

                                                    <div class="min-w-0">
                                                        <span class="font-semibold truncate block max-w-[180px]">
                                                            {{ r.name || r.key }}
                                                        </span>

                                                        <div class="text-[11px] text-white/40 truncate max-w-[180px] w-full text-left" dir="ltr">
                                                            {{ roomsStore.lastPreviewFor?.(r.key) || "" }}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div class="gio-room-right flex items-center gap-2" dir="ltr">
                                                    <span v-if="getRoomUnread(r.key) > 0"
                                                          class="w-[18px] h-[18px] rounded-full bg-green-500/40 animate-ping"
                                                          aria-hidden="true"></span>

                                                    <div class="gio-room-avatars" dir="ltr">
                                                        <template v-for="(u, i) in roomUsers(r.key).slice(0, AVATARS_MAX)" :key="u.user_id || u.id || i">
                                                            <div class="gio-room-avatar" :style="{ zIndex: 10 + i }" :title="u.nickname || 'User'">
                                                                <img v-if="u.avatar_url" :src="u.avatar_url" alt="" />
                                                                <span v-else>{{ (u.nickname?.[0] ?? "•") }}</span>
                                                            </div>
                                                        </template>
                                                    </div>

                                                    <span v-if="roomUsers(r.key).length >= 2" class="gio-room-count">
                                                        {{ roomUsers(r.key).length }}
                                                    </span>

                                                    <span v-if="getRoomUnread(r.key) > 0"
                                                          class="min-w-[18px] h-[18px] px-1 rounded-full
                                   bg-green-500 text-black text-[11px] font-extrabold
                                   flex items-center justify-center shadow-lg">
                                                        {{ Math.min(99, getRoomUnread(r.key)) }}
                                                    </span>
                                                </div>
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            </template>
                        </div>

                        <!-- footer (mobile) -->
                        <div class="h-14 px-3 border-t border-white/10 flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <div class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center">
                                    <img v-if="avatarUrl" :src="avatarUrl" class="w-full h-full object-cover" alt="" />
                                    <span v-else>🙂</span>
                                </div>

                                <div class="leading-tight">
                                    <div class="font-bold">{{ nickname }}</div>
                                    <div class="mt-1">
                                        <div class="h-5 gio-presence-chip cursor-pointer select-none inline-flex"
                                             :data-state="presence.status"
                                             :data-user="myUserStatus"
                                             @click="presence.status === 'ready' ? cycleMyStatus() : null">
                                            <span class="gio-dot" />
                                            <span v-if="presence.status === 'connecting'" class="gio-sync">
                                                Syncing <span class="gio-dots"><i></i><i></i><i></i></span>
                                            </span>
                                            <span v-else-if="presence.status === 'failed'">Offline</span>
                                            <span v-else-if="presence.status === 'ready'">{{ myStatusLabel }}</span>
                                            <span v-else>Idle</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/50 transition"
                                    @click="openProfileModal = true"
                                    title="Settings">
                                ⚙️
                            </button>
                        </div>

                    </div>
                </div>
            </div>
        </div>

        <!-- ✅ Toasts (mobile) -->
        <div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10050] flex flex-col gap-2 pointer-events-none md:hidden">
            <div v-for="t in ui.toasts"
                 :key="t.id"
                 class="px-4 py-2 rounded-2xl border border-white/10 bg-black/80 backdrop-blur text-white/90 text-sm font-bold shadow-xl">
                {{ t.text }}
            </div>
        </div>

        <!-- Modals -->
        <HouseSwitcherModal v-if="openHouseModal" @close="openHouseModal=false" />
        <HouseInviteModal v-if="openInviteModal && currentHouse" :house="currentHouse" @close="openInviteModal=false" />
        <RoomManagerModal v-if="openRoomsModal" @close="openRoomsModal=false" />
        <ProfileSettingsModal v-if="openProfileModal" @close="openProfileModal=false" />
        <AddFriendsModal v-if="addFriendsOpen" @close="addFriendsOpen=false" />
    </div>
</template>
/

<script setup>
    /**
     * AppShell — המוח של ה-Layout 🧠
     * --------------------------------
     * פה לא כותבים “לוגיקה של עסק” (שליחה/DB וכו׳),
     * רק:
     * - ניווט
     * - הצגת חדרים/DMs
     * - drawer במובייל
     * - badges (unread)
     *
     * המטרה: “שלד” יציב שלא נשבר כשאתה מוסיף פיצ׳רים.
     */
    import { useNotifications } from "../composables/useNotifications";
    import { useNotificationsStore } from "../stores/notifications";
    import RoomManagerModal from "../components/RoomManagerModal.vue";
    import HousesSidebar from "../components/HousesSidebar.vue";
    import HouseInviteModal from "../components/HouseInviteModal.vue";
    import HouseSwitcherModal from "../components/HouseSwitcherModal.vue";
    import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
    import { RouterView, useRoute, useRouter } from "vue-router";
    import { useHouseStore } from "../stores/house";
    import { usePresenceStore } from "../stores/presence";
    import { session, profile } from "../stores/auth";
    import { useRoomsStore } from "../stores/rooms";
    import { useUIStore } from "../stores/ui";
    import { useMessagesStore } from "../stores/messages";
    import { supabase } from "../services/supabase";
    import ProfileSettingsModal from "../components/ProfileSettingsModal.vue";
    // ✅ DM MODE sidebar
    import DMSidebar from "../components/DMsSidebar.vue";
    import AddFriendsModal from "../components/AddFriendsModal.vue";
    import { useDMThreadsStore } from "../stores/dmThreads";

    const roomUnread = (roomKey) => Number(notifications.roomUnread?.[roomKey] || 0);
    const dmThreads = useDMThreadsStore();

    const { notif } = useNotifications();         // context + auto-clear
    const notifications = useNotificationsStore(); // for getters

    const addFriendsOpen = ref(false);
    const inlineEdit = ref({ id: null, draft: "" });
    const inlineEditInput = ref(null);

    const ui = useUIStore();
    const openInviteModal = ref(false);

    const roomsStore = useRoomsStore();
    const router = useRouter();
    const route = useRoute();
    const rooms = useRoomsStore();
    const messages = useMessagesStore();
    const house = useHouseStore();
    const presence = usePresenceStore();

    const openProfileModal = ref(false);
    const openRoomsModal = ref(false);
    const openHouseModal = ref(false);
    const houseMenuOpen = ref(false);

    const AVATARS_MAX = 5;

    // ✅ DM mode
    const isDMMode = computed(() => route.name === "dms" || route.name === "dm");

    // ✅ top bar only when NOT room and NOT dm
    const showMobileTopBar = computed(() => route.name !== "room" && route.name !== "dm" && route.name !== "dms");

    /* =========================
   ✅ BACK/FOWARD ROUTING HANDLING
   ========================= */
    const lastRoomByHouse = ref({}); // { [houseId]: "roomKey" }
    const popNavLock = ref(false);

    function setLastRoomForHouse(roomKey) {
        const hid = house.currentHouseId;
        if (!hid || !roomKey) return;
        lastRoomByHouse.value = { ...lastRoomByHouse.value, [hid]: String(roomKey) };
    }

    function getLastRoomForHouse() {
        const hid = house.currentHouseId;
        if (!hid) return null;
        return lastRoomByHouse.value?.[hid] ?? null;
    }

    async function onDMOpenThread(id) {
        const threadId = String(id || "").trim();
        if (!threadId) return;

        dmThreads.setLastThreadId?.(threadId);

        // ✅ במובייל: סוגרים מגירה קודם, בלי history.back
        if (isMobile() && mobileNavOpen.value) {
            closeMobileNav({ skipHistoryBack: true });
            await nextTick();
        }

        // ✅ ניווט (מוגן)
        try {
            if (route.name !== "dm" || String(route.params.threadId) !== threadId) {
                await router.push({ name: "dm", params: { threadId } });
            }
        } catch (e) {
            // swallow navigation failures
            console.warn("[DM nav] ignored:", e);
        }
    }


    // ✅ קאש קטן כדי לא לקרוא getter פעמיים לכל חדר בתוך template
    function roomUsers(roomKey) {
        const list = presence.usersInRoom(roomKey) || [];
        return list.filter(u => (u.user_status ?? "online") === "online");
    }
    function isRoomRoute() {
        return route.name === "room" || String(route.path || "").startsWith("/room/");
    }
    function isHomeRoute() {
        return route.name === "home" || String(route.path || "") === "/";
    }


    /* =========================
       ✅ MOBILE DRAWER STATE
       ========================= */
    const mobileNavOpen = ref(false);
    const drawerTranslateX = ref(-400);
    const overlayOpacity = ref(0);
    const drawerW = ref(0); // ✅ GLOBAL drawer width cache

    function drawerWidth() {
        return window.innerWidth; // FULLSCREEN drawer
    }


    function recalcDrawerW() {
        drawerW.value = drawerWidth();

        // אם המגירה סגורה – ננעל אותה בדיוק לסגירה
        if (!mobileNavOpen.value) {
            drawerTranslateX.value = -drawerW.value;
            overlayOpacity.value = 0;
        }
    }

    function animateDrawer(toX, toOpacity, ms = 220) {
        const fromX = drawerTranslateX.value;
        const fromO = overlayOpacity.value;
        const start = performance.now();
        const easeOut = (t) => 1 - Math.pow(1 - t, 3);

        function frame(now) {
            const p = Math.min(1, (now - start) / ms);
            const e = easeOut(p);
            drawerTranslateX.value = fromX + (toX - fromX) * e;
            overlayOpacity.value = fromO + (toOpacity - fromO) * e;
            if (p < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }

    async function goDMs(options = {}) {
        if (options.closeDrawer && mobileNavOpen.value) closeMobileNav({ skipHistoryBack: true });
        if (route.name !== "dms")
            await router.push({ name: "dms" });
    }

    /* =========================
       ✅ Android back closes drawer
       ========================= */
    const drawerHistoryPushed = ref(false);
    let suppressNextPop = false;

    async function openMobileNav() {
        if (mobileNavOpen.value) return;
        stampHistoryState();
        houseMenuOpen.value = false;
        mobileNavOpen.value = true;
        await nextTick();

        const w = drawerWidth();
        drawerTranslateX.value = -w;
        overlayOpacity.value = 0;
        animateDrawer(0, 1, 160);

        if (!drawerHistoryPushed.value) {
            history.pushState({ gioDrawer: true, gioHouseId: house.currentHouseId ?? null }, "");
            drawerHistoryPushed.value = true;
        }
    }

    function closeMobileNav(options = {}) {
        if (!mobileNavOpen.value) return;

        houseMenuOpen.value = false;

        const w = drawerWidth();
        animateDrawer(-w, 0, 140);

        window.setTimeout(async () => {
            mobileNavOpen.value = false;

            // ✅ אם סגרנו מגירה בזמן שהיינו ב־/dms במובייל:
            // נחזיר את המשתמש ל־dm האחרון (אם יש), אחרת נשאר ב־dms
            if (isMobile() && route.name === "dms") {
                const last = dmThreads.lastThreadId || dmThreads.lastThread || null;
                if (last) {
                    try { await router.replace({ name: "dm", params: { threadId: String(last) } }); } catch (_) { }
                }
            }
        }, 155);

        // ✅ טיפול בהיסטוריה (לא רקורסיה)
        if (drawerHistoryPushed.value) {
            if (options.skipHistoryBack) {
                try {
                    const st = history.state || {};
                    const next = { ...st };
                    delete next.gioDrawer;
                    history.replaceState(next, "", window.location.pathname + window.location.search + window.location.hash);
                } catch (_) { }
                drawerHistoryPushed.value = false;
                suppressNextPop = false;
            } else {
                suppressNextPop = true;
                history.back();
                drawerHistoryPushed.value = false;
            }
        }
    }


    function safeReplaceState(stateObj) {
        try {
            history.replaceState(stateObj, "", window.location.pathname + window.location.search + window.location.hash);
        } catch (_) { }
    }

    async function goLobby(options = {}) {
        if (options.closeDrawer && mobileNavOpen.value) closeMobileNav({ skipHistoryBack: true });

        if (route.name !== "home") {
            // ✅ Room -> Home = replace (לא מוסיפים עוד רשומה)
            await router.replace({ name: "home" });
        }

        const hid = house.currentHouseId;
        if (hid) {
            const needsConnect = presence.status !== "ready" || presence.houseId !== hid;
            if (needsConnect) await presence.connect({ houseId: hid, initialRoom: "lobby" });
            await presence.setRoom("lobby");
        }

        house.enterRoom?.("lobby");
    }

    async function signOut() {
        try {
            // 1) להתנתק אמיתי מה-auth
            const { error } = await supabase.auth.signOut();
            if (error) console.warn("signOut error:", error);

            // 2) לנתק realtime / subs
            try { await presence.disconnect?.(); } catch (_) { }

            try {
                const subs = Object.keys(messages.subs || {});
                for (const roomId of subs) {
                    await messages.unsubscribe(roomId);
                }
            } catch (_) { }

            // ✅ DM inbox + thread subs
            try {
                const dmMessages = useDMMessagesStore();
                await dmMessages.unsubscribeInbox?.();

                const dmSubs = Object.keys(dmMessages.subs || {});
                for (const threadId of dmSubs) {
                    await dmMessages.unsubscribe(threadId);
                }
            } catch (_) { }

            // 3) לאפס state מקומי
            session.value = null;
            profile.value = null;

            house.reset?.();
            rooms.reset?.();

            messages.byRoom = {};
            messages.subs = {};

            try {
                const dmMessages = useDMMessagesStore();
                dmMessages.byThread = {};
                dmMessages.subs = {};
                dmMessages.outbox = [];
            } catch (_) { }

            // 4) רק את הדברים שלך (לא של Supabase)
            try { localStorage.removeItem("gio_current_house_id"); } catch (_) { }

            await router.replace({ name: "login" });
        } catch (e) {
            console.error("signOut failed:", e);
            await router.replace({ name: "login" });
        }
    }


    function onPopState() {
        if (suppressNextPop) {
            suppressNextPop = false;
            return;
        }

        // 1) אם המגירה פתוחה — back סוגר רק אותה
        if (mobileNavOpen.value) {
            closeMobileNav({ skipHistoryBack: true });
            drawerHistoryPushed.value = false;
            return;
        }

        // 2) אם אנחנו בתוך חדר — back חייב להחזיר ללובי (בלי double-exit)
        if (isRoomRoute()) {
            exitArmed.value = false;
            if (exitTimer) clearTimeout(exitTimer);

            router.replace({ name: "home" });
            return;
        }

        // 3) אם אנחנו בלובי:
        if (isHomeRoute()) {
            // דסקטופ: לא יוצאים מהדף — "בולעים" את ה-back
            if (!isMobile()) {
                history.pushState({ ...(history.state || {}), gioStay: true }, "");
                return;
            }

            // מובייל: double back to exit
            if (!exitArmed.value) {
                history.pushState({ ...(history.state || {}), gioStay: true }, "");
                armExit(); // מציג toast "לחץ שוב ליציאה" + טיימר שמאפס
                return;
            }

            // לחיצה שנייה: נותנים לדפדפן לעשות back אמיתי (יציאה מה-PWA/חזרה אחורה)
            exitArmed.value = false;
            if (exitTimer) clearTimeout(exitTimer);
            return;
        }
    }


    watch(mobileNavOpen, (open) => {
        if (open) {
            document.documentElement.style.overflow = "hidden";
            document.body.style.overflow = "hidden";
        } else {
            document.documentElement.style.overflow = "";
            document.body.style.overflow = "";
        }
    });

    /* =========================
       ✅ LOAD rooms + presence connect when house changes
       ========================= */
    watch(
        () => house.currentHouseId,
        async (houseId) => {
            if (!houseId) return; // ✅ MUST
            await presence.connect({ houseId, initialRoom: presence.roomName || "lobby" });
        },
        { immediate: true }
    );


    /* =========================
        ✅ Press Back again to exit app (mobile)
       ========================= */
    const exitArmed = ref(false);
    let exitTimer = null;

    function armExit() {
        exitArmed.value = true;
        //ui?.toast?.("לחץ שוב ליציאה");
        if (exitTimer) clearTimeout(exitTimer);
        exitTimer = setTimeout(() => (exitArmed.value = false), 1600);
    }



    /* =========================
       ✅ FULL-SCREEN SWIPE OPEN (Discord-like)
       ========================= */
    const swipeActive = ref(false);
    const swipeLockedHorizontal = ref(false);
    const startX = ref(0);
    const startY = ref(0);

    const INTENT_SLOP = 6;
    const OPEN_COMMIT_RATIO = 0.12;
    const SWIPE_GAIN = 1.9;

    function isMobile() {
        return window.matchMedia?.("(max-width: 767px)")?.matches ?? (window.innerWidth < 768);
    }

    function shouldIgnoreTarget(target) {
        const el = target?.closest?.("input, textarea, select, button, [contenteditable='true']");
        return !!el;
    }

    function onTouchStartGlobal(e) {
        if (!isMobile()) return;
        if (window.visualViewport?.scale && Math.abs(window.visualViewport.scale - 1) > 0.01) return;
        if (mobileNavOpen.value) return;
        const t = e.touches?.[0];
        if (!t) return;
        if (shouldIgnoreTarget(e.target)) return;

        swipeActive.value = true;
        swipeLockedHorizontal.value = false;
        startX.value = t.clientX;
        startY.value = t.clientY;
    }

    let dragFrame = 0;
    let dragTranslate = 0;

    function scheduleDragUpdate(nextTranslate) {
        dragTranslate = nextTranslate;
        if (dragFrame) return;
        dragFrame = requestAnimationFrame(() => {
            const w = drawerWidth();
            drawerTranslateX.value = dragTranslate;
            overlayOpacity.value = 1 - Math.abs(dragTranslate) / w;
            dragFrame = 0;
        });
    }

    function onTouchMoveGlobal(e) {
        if (!swipeActive.value) return;
        if (window.visualViewport?.scale && Math.abs(window.visualViewport.scale - 1) > 0.01) return;
        const t = e.touches?.[0];
        if (!t) return;

        const dx = t.clientX - startX.value;
        const dy = t.clientY - startY.value;

        if (!swipeLockedHorizontal.value) {
            if (Math.abs(dx) < INTENT_SLOP && Math.abs(dy) < INTENT_SLOP) return;
            if (Math.abs(dy) > Math.abs(dx) * 1.15) {
                swipeActive.value = false;
                return;
            }
            // ✅ כאן זה הרגע שהחלטת “זה swipe לפתיחת drawer”
            closeKeyboard();

            swipeLockedHorizontal.value = true;
            mobileNavOpen.value = true;
            drawerTranslateX.value = -drawerWidth();
        }

        e.preventDefault();
        const w = drawerWidth();
        const openPx = Math.max(0, dx) * SWIPE_GAIN;
        const translate = Math.max(-w, Math.min(0, -w + openPx));
        scheduleDragUpdate(translate);
    }

    function onTouchEndGlobal() {
        if (!swipeActive.value) return;
        const w = drawerWidth();
        const currentTranslate = dragFrame ? dragTranslate : drawerTranslateX.value;
        const openness = 1 - Math.abs(currentTranslate) / w;
        const shouldOpen = swipeLockedHorizontal.value && openness >= OPEN_COMMIT_RATIO;

        swipeActive.value = false;
        swipeLockedHorizontal.value = false;

        if (shouldOpen) {
            animateDrawer(0, 1, 120);
            if (!drawerHistoryPushed.value) {
                history.pushState({ gioDrawer: true }, "");
                drawerHistoryPushed.value = true;
            }
        } else {
            animateDrawer(-w, 0, 110);
            window.setTimeout(() => {
                mobileNavOpen.value = false;
            }, 130);
        }
    }

    /* =========================
       ✅ SWIPE CLOSE (drag drawer itself)
       ========================= */
    const touchStartX = ref(0);
    const touchDragging = ref(false);
    const touchStartTranslate = ref(0);

    const drawerProgress = computed(() => {
        const w = drawerW.value || drawerWidth() || 1;
        return Math.max(0, Math.min(1, 1 - Math.abs(drawerTranslateX.value) / w));
    });

    const slideDir = computed(() => {
        const rtl = document?.documentElement?.dir === "rtl";
        return rtl ? -1 : 1;
    });

    const appStageX = computed(() => {
        const w = drawerW.value || drawerWidth();
        return slideDir.value * Math.round(drawerProgress.value * w);
    });

    const appStageStyle = computed(() => ({
        transform: "translateX(0px)", // ✅ אין push בכלל
        transition: "none",
    }));


    function onDrawerTouchStart(e) {
        touchDragging.value = true;
        touchStartX.value = e.touches[0].clientX;
        touchStartTranslate.value = drawerTranslateX.value;
    }

    function onDrawerTouchMove(e) {
        if (!touchDragging.value) return;
        const dx = e.touches[0].clientX - touchStartX.value;
        const w = drawerWidth();
        const next = Math.max(-w, Math.min(0, touchStartTranslate.value + dx));
        scheduleDragUpdate(next);
    }

    function onDrawerTouchEnd() {
        if (!touchDragging.value) return;
        touchDragging.value = false;

        const currentTranslate = dragFrame ? dragTranslate : drawerTranslateX.value;
        const shouldClose = Math.abs(currentTranslate) / drawerWidth() > 0.12;

        if (!shouldClose) {
            animateDrawer(0, 1, 120);
            return;
        }

        // ✅ אם אנחנו במצב DMS – אל תעשה history.back
        if (isMobile() && route.name === "dms") {
            closeMobileNav({ skipHistoryBack: true });
        } else {
            closeMobileNav();
        }
    }


    function onGlobalPointerDown(e) {
        if (houseMenuOpen.value) {
            const insideHeaderMenu = e.target?.closest?.("[data-house-menu]");
            if (!insideHeaderMenu) houseMenuOpen.value = false;
        }
    }

    /* =========================
       ✅ STATUS (Online / AFK / Offline)
       ========================= */
    const myId = computed(() => session.value?.user?.id ?? null);

    const myUserStatus = computed(() => {
        const id = myId.value;
        if (!id) return "offline";
        const fromServer = presence.users?.[id]?.user_status;
        return fromServer ?? presence.myUserStatus ?? "online";
    });

    const myStatusLabel = computed(() => {
        return (
            {
                online: "Online",
                afk: "AFK",
                offline: "Offline",
            }[myUserStatus.value] || "Online"
        );
    });

    async function cycleMyStatus() {
        if (presence.status !== "ready") return;

        const cur = myUserStatus.value;
        const next = cur === "online" ? "afk" : cur === "afk" ? "offline" : "online";

        await presence.setUserStatus(next);

        if (next === "afk") ui?.toast?.("💤 AFK");
        else if (next === "offline") ui?.toast?.("🔕 Offline");
        else ui?.toast?.("🟢 Online");

        scheduleAfk();
    }

    /* =========================
       ✅ AFK automation (status only — NOT a room)
       ========================= */
    //const AFK_MS = 5000; // ✅ דיבוג
    const AFK_MS = 10 * 60 * 1000; // 10 דקות

    let afkTimer = null;
    let wakeDebounce = null;

    function clearAfkTimer() {
        if (afkTimer) clearTimeout(afkTimer);
        afkTimer = null;
    }

    function scheduleAfk() {
        clearAfkTimer();

        // Offline ידני = לא נוגעים
        if (myUserStatus.value === "offline") return;

        afkTimer = setTimeout(async () => {
            if (myUserStatus.value === "offline") return;
            await presence.setUserStatus("afk");
            ui?.toast?.("💤 עברת ל-AFK");
        }, AFK_MS);
    }

    function onUserActivity() {
        if (myUserStatus.value === "offline") return;

        scheduleAfk();

        if (myUserStatus.value === "afk") {
            if (wakeDebounce) clearTimeout(wakeDebounce);
            wakeDebounce = setTimeout(async () => {
                if (myUserStatus.value !== "offline") {
                    await presence.setUserStatus("online");
                    ui?.toast?.("👋 חזרת");
                }
            }, 600);
        }
    }

    function attachAfkListeners() {
        const opts = { passive: true };
        window.addEventListener("pointerdown", onUserActivity, opts);
        window.addEventListener("pointermove", onUserActivity, opts);
        window.addEventListener("keydown", onUserActivity, opts);
        window.addEventListener("scroll", onUserActivity, opts);
        window.addEventListener("touchstart", onUserActivity, opts);
    }

    function detachAfkListeners() {
        window.removeEventListener("pointerdown", onUserActivity);
        window.removeEventListener("pointermove", onUserActivity);
        window.removeEventListener("keydown", onUserActivity);
        window.removeEventListener("scroll", onUserActivity);
        window.removeEventListener("touchstart", onUserActivity);
    }

    /* =========================
       ✅ Navigation / header / rooms
       ========================= */

    const currentHouse = computed(() => {
        const list = house.myHouses ?? [];
        return list.find((h) => h.id === house.currentHouseId) ?? null;
    });

    const isPublicHouse = computed(() => !!currentHouse.value?.is_public);
    const headerTitle = computed(() =>
        currentHouse.value?.is_public ? "GIO HOUSE" : currentHouse.value?.name || "My House"
    );

    const houseRail = computed(() => house.myHouses ?? []);

    const nickname = computed(() => profile.value?.nickname ?? "User");
    const avatarUrl = computed(() => profile.value?.avatar_url ?? null);

    const routeRoomKey = computed(() => {
        const p = route.params || {};
        return (p.key ?? p.roomKey ?? p.id ?? null);
    });

    function isActiveRoom(roomKey) {
        // ✅ בלובי לא מסמנים חדרים בכלל
        if (route.name === "home") return false;

        // במסך חדר — מסמן לפי ה-route
        if (route.name === "room") return String(routeRoomKey.value) === roomKey;

        // מסכים אחרים (אם יש) — ברירת מחדל לפי ה-store
        return house.currentRoom === roomKey;
    }


    const activeRooms = computed(() => roomsStore.activeRooms ?? []);

    async function enterRoom(roomKey, options = {}) {
        if (inlineEdit.value.id) return;

        if (options.closeDrawer && mobileNavOpen.value) {
            closeMobileNav({ skipHistoryBack: true });
        }

        house.enterRoom?.(roomKey);
        // נקה unread לחדר הזה
        notifications.clearRoom(roomKey);
        // ✅ Home -> Room = push (כדי ש-back יחזור ללובי)
        // ✅ Room -> Room = replace (כדי ש-back לא יסתובב בחדרים)
        const nav = route.name === "room" ? router.replace : router.push;
        await nav({ name: "room", params: { id: roomKey } });

        const hid = house.currentHouseId;
        if (hid) {
            const needsConnect = presence.status !== "ready" || presence.houseId !== hid;
            if (needsConnect) await presence.connect({ houseId: hid, initialRoom: roomKey });
            await presence.setRoom(roomKey);
        }

        if (mobileNavOpen.value) closeMobileNav({ skipHistoryBack: true });
    }




    function switchHouse(houseId) {
        if (!houseId) return;

        house.setCurrentHouse(houseId);
        exitArmed.value = false;
        if (exitTimer) clearTimeout(exitTimer);

        exitArmed.value = false;
        if (exitTimer) clearTimeout(exitTimer);

        if (mobileNavOpen.value) closeMobileNav({ skipHistoryBack: true });

        router.replace({ name: "home" });

        nextTick(() => {
            stampHistoryState({ gioHouseReset: Date.now() });
            history.pushState({ ...(history.state || {}), gioHouseId: houseId, gioStay: true }, "");
        });
    }


    const retryPresence = () =>
        house.currentHouseId && presence.connect({ houseId: house.currentHouseId });

    watch(
        () => house.currentHouseId,
        () => {
            exitArmed.value = false;
            if (exitTimer) clearTimeout(exitTimer);
        },
        { immediate: true }
    );


    /* =========================
       ✅ Drawer close on ANY navigation (airtight)
       ========================= */
    // ✅ sync presence with current route (source of truth)
    // ✅ sync presence + stamp history with current route (source of truth)
    watch(
        () => route.fullPath,
        async () => {
            // תמיד חותמים את ה-state של ההיסטוריה לבית הנוכחי
            stampHistoryState();

            // ✅ אם חזרנו ללובי (home) — נוכחות ללובי
            if (route.name === "home") {
                const hid = house.currentHouseId;
                if (hid) {
                    const needsConnect = presence.status !== "ready" || presence.houseId !== hid;
                    if (needsConnect) {
                        await presence.connect({ houseId: hid, initialRoom: "lobby" });
                    }
                    await presence.setRoom("lobby");
                }
                house.enterRoom?.("lobby");
                return;
            }

            // ✅ אם אנחנו בחדר — נוכחות לחדר לפי ה-route
            if (route.name === "room") {
                const p = route.params || {};
                const roomKey = String(p.id ?? p.key ?? p.roomKey ?? "");
                if (!roomKey) return;

                setLastRoomForHouse?.(roomKey); // ✅ קריטי ל-toggle

                const hid = house.currentHouseId;
                if (hid) {
                    const needsConnect = presence.status !== "ready" || presence.houseId !== hid;
                    if (needsConnect) {
                        await presence.connect({ houseId: hid, initialRoom: roomKey });
                    }
                    await presence.setRoom(roomKey);
                }
                house.enterRoom?.(roomKey);
            }

        },
        { immediate: true }
    );


    function resetHorizontalScroll() {
        // iOS sometimes leaves the page panned horizontally
        window.scrollTo({ left: 0, top: window.scrollY, behavior: "instant" });
    }

    function resetGestures(reason) {
        console.log("[AppShell] resetGestures", reason);

        swipeActive.value = false;
        swipeLockedHorizontal.value = false;
        touchDragging.value = false;

        if (mobileNavOpen.value) {
            mobileNavOpen.value = false;
            drawerTranslateX.value = -drawerWidth();
            overlayOpacity.value = 0;
        }

        // ✅ נקה גם את הדגל מה-history.state אם נשאר
        if (drawerHistoryPushed.value) {
            try {
                const st = history.state || {};
                const next = { ...st };
                delete next.gioDrawer;
                history.replaceState(next, "", window.location.pathname + window.location.search + window.location.hash);
            } catch (_) { }
            drawerHistoryPushed.value = false;
        }
    }

    function onVis() {
        if (document.visibilityState === "visible") resetGestures("visibility:visible");
    }
    function onPageShow(e) {
        // BFCache restore
        resetGestures("pageshow" + (e?.persisted ? ":persisted" : ""));
    }
    onMounted(() => {
        attachAfkListeners();
        scheduleAfk();
        recalcDrawerW();
        resetHorizontalScroll();

        if (isMobile()) {
            // שכבת הגנה כדי שה-back הראשון בלובי לא יזרוק את המשתמש מיד החוצה
            history.replaceState({ gioBase: true }, "");
            history.pushState({ gioStay: true }, "");
        }

        document.addEventListener("visibilitychange", onVis, { passive: true });
        window.addEventListener("pageshow", onPageShow, { passive: true });
        window.addEventListener("orientationchange", resetHorizontalScroll, { passive: true });
        window.addEventListener("resize", resetHorizontalScroll, { passive: true });
        window.addEventListener("resize", recalcDrawerW);
        window.addEventListener("popstate", onPopState);
        window.addEventListener("touchstart", onTouchStartGlobal, { capture: true, passive: true });
        window.addEventListener("touchmove", onTouchMoveGlobal, { capture: true, passive: false });
        window.addEventListener("touchend", onTouchEndGlobal, { capture: true, passive: true });
        window.addEventListener("pointerdown", onGlobalPointerDown, { capture: true });

        // ✅ guards once
        const messages = useMessagesStore();
        messages.installGuards?.();
        presence.installGuards?.();
    });


    onBeforeUnmount(() => {
        detachAfkListeners();
        clearAfkTimer();

        document.removeEventListener("visibilitychange", onVis);
        window.removeEventListener("pageshow", onPageShow);
        window.removeEventListener("resize", recalcDrawerW);
        window.removeEventListener("popstate", onPopState);
        window.removeEventListener("touchstart", onTouchStartGlobal, { capture: true });
        window.removeEventListener("touchmove", onTouchMoveGlobal, { capture: true });
        window.removeEventListener("touchend", onTouchEndGlobal, { capture: true });
        window.removeEventListener("pointerdown", onGlobalPointerDown, { capture: true });
    });

    /* =========================
       ✅ Inline room rename
       ========================= */
    function beginInlineEdit(room) {
        if (!room?.id) return;
        // לא עורכים living אם אתה רוצה (אופציונלי). אם כן, מחק את התנאי:
        // if (room.key === "living") return;

        inlineEdit.value = { id: room.id, draft: room.name || room.key || "" };

        nextTick(() => {
            // ref בתוך v-for עלול להיות array — נטפל בזה
            const el = Array.isArray(inlineEditInput.value) ? inlineEditInput.value.at(-1) : inlineEditInput.value;
            el?.focus?.();
            el?.select?.();
        });
    }

    function cancelInlineEdit() {
        inlineEdit.value = { id: null, draft: "" };
    }

    async function commitInlineEdit(room) {
        const name = String(inlineEdit.value.draft || "").trim();
        if (!name) {
            ui?.toast?.("⚠️ שם לא יכול להיות ריק");
            return;
        }

        try {
            await roomsStore.updateRoom(room.id, { name });
            ui?.toast?.("💾 נשמר");
        } catch (e) {
            console.error("[AppShell] inline rename failed:", e);
            ui?.toast?.("💥 שינוי שם נכשל");
        } finally {
            cancelInlineEdit();
        }
    }

    function stampHistoryState(extra = {}) {
        const hid = house.currentHouseId ?? null;
        const cur = history.state || {};
        history.replaceState({ ...cur, gioHouseId: hid, ...extra }, "");
    }

    function closeKeyboard() {
        const el = document.activeElement;
        if (!el) return;

        const tag = (el.tagName || "").toLowerCase();
        const isEditable =
            tag === "textarea" ||
            tag === "input" ||
            el.isContentEditable;

        if (isEditable) {
            el.blur();
        }
    }
    // ---------- unread badges (ROOMS) ----------
    function getRoomUnread(roomKey) {
        // נסה כמה שמות אפשריים כדי שלא תקרוס אם ה-store שלך נקרא אחרת
        const map =
            notifications.roomUnread ||
            notifications.roomsUnread ||
            notifications.unreadRooms ||
            notifications.byRoom ||
            {};

        const n = map?.[roomKey] ?? 0;
        return Number(n) || 0;
    }


</script>

<style>
    :root {
        --gio-bg: #070a0d;
        --gio-panel: #0b0f12;
        --gio-panel2: #0c1116;
        --gio-border: rgba(255, 255, 255, 0.06);
        --gio-green: rgb(34, 197, 94);
        --gio-text-dim: rgba(255, 255, 255, 0.55);
        --gio-text-dimmer: rgba(255, 255, 255, 0.38);
        /* ✅ status colors */
        --gio-online: rgb(34, 197, 94); /* green */
        --gio-afk: rgb(250, 204, 21); /* yellow */
        --gio-offline: rgb(148, 163, 184); /* slate */
    }

    .gio-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 14px 6px;
    }

    .gio-house-badge {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border: 1px solid var(--gio-border);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.015));
        border-radius: 16px;
        box-shadow: 0 0 22px rgba(34, 197, 94, 0.08);
    }

    .gio-house-title {
        font-weight: 800;
        color: rgba(180, 255, 210, 0.92);
        line-height: 1.1;
    }

    .gio-presence-chip {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 999px;
        border: 1px solid var(--gio-border);
        font-size: 12px;
        color: rgba(255, 255, 255, 0.80);
        background: rgba(255,255,255,0.02);
        transition: border-color .18s ease, background .18s ease, transform .10s ease, color .18s ease;
    }

        .gio-presence-chip:active {
            transform: scale(0.98);
        }

    .gio-dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.25);
        transition: background .18s ease, box-shadow .18s ease;
    }

    .gio-presence-chip[data-state="ready"][data-user="online"] {
        border-color: rgba(34,197,94,0.45);
        background: rgba(34,197,94,0.10);
        color: rgba(210,255,225,0.92);
    }

        .gio-presence-chip[data-state="ready"][data-user="online"] .gio-dot {
            background: var(--gio-online);
            box-shadow: 0 0 14px rgba(34, 197, 94, 0.35);
        }

    .gio-presence-chip[data-state="ready"][data-user="afk"] {
        border-color: rgba(250,204,21,0.45);
        background: rgba(250,204,21,0.10);
        color: rgba(255,245,200,0.92);
    }

        .gio-presence-chip[data-state="ready"][data-user="afk"] .gio-dot {
            background: var(--gio-afk);
            box-shadow: 0 0 14px rgba(250, 204, 21, 0.32);
        }

    .gio-presence-chip[data-state="ready"][data-user="offline"] {
        border-color: rgba(148,163,184,0.35);
        background: rgba(148,163,184,0.08);
        color: rgba(255,255,255,0.68);
    }

        .gio-presence-chip[data-state="ready"][data-user="offline"] .gio-dot {
            background: var(--gio-offline);
            box-shadow: 0 0 12px rgba(148, 163, 184, 0.22);
        }

    .gio-presence-chip[data-state="connecting"] .gio-dot {
        background: rgba(255,255,255,0.18);
    }

    .gio-presence-chip[data-state="failed"] .gio-dot {
        background: rgba(239, 68, 68, 0.8);
        box-shadow: 0 0 14px rgba(239, 68, 68, 0.25);
    }

    .gio-skel-count {
        display: inline-block;
        width: 18px;
        height: 12px;
        border-radius: 6px;
        background: linear-gradient(90deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.06));
        background-size: 200% 100%;
        animation: gioShimmer 1.1s ease-in-out infinite;
    }

    @keyframes gioShimmer {
        0% {
            background-position: 0% 0;
        }

        100% {
            background-position: 200% 0;
        }
    }

    .gio-fade {
        animation: gioFade 0.18s ease-out;
    }

    @keyframes gioFade {
        from {
            opacity: 0;
            transform: translateY(4px);
        }

        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .gio-room-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
    }

    .gio-room-left {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        flex: 1;
    }

    .gio-room-title {
        flex: 1;
        min-width: 0;
    }

    .gio-room-right {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0; /* ✅ קריטי: לא ימחץ טקסט */
    }

    .gio-room-avatars {
        display: flex;
        align-items: center;
        flex-shrink: 0;
        direction: ltr; /* ✅ מבטיח LTR גם ב-RTL */
    }

    .gio-room-avatar {
        width: 22px;
        height: 22px;
        border-radius: 999px;
        border: 2px solid rgba(34, 197, 94, 0.35);
        background: rgba(0,0,0,0.35);
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 800;
        color: rgba(210, 255, 225, 0.9);
        /* ✅ stacking */
        margin-left: -7px; /* overlap */
        box-shadow: 0 0 0 2px rgba(11, 15, 18, 0.9); /* separation ring */
    }

        .gio-room-avatar:first-child {
            margin-left: 0;
        }

        .gio-room-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

    .gio-room-more {
        border-color: rgba(255,255,255,0.14);
        color: rgba(255,255,255,0.75);
        background: rgba(255,255,255,0.06);
    }

    .gio-room-count {
        font-size: 12px;
        font-weight: 800;
        color: rgba(180, 255, 210, 0.9);
        min-width: 14px;
        text-align: right;
    }
</style>
