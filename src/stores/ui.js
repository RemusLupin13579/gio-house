import { defineStore } from 'pinia'

export const useUIStore = defineStore('ui', {
    state: () => ({
        activeView: 'home',
        activeRoomId: null,
    }),

    actions: {
        openRoom(roomId) {
            this.activeRoomId = roomId
            this.activeView = 'room'
        },
        goHome() {
            this.activeView = 'home'
            this.activeRoomId = null
        },
    },
})
