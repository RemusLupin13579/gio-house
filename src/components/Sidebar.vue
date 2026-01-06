<script setup>
    import { useUIStore } from '../stores/ui'
    const ui = useUIStore()

    const users = [
        { id: 1, name: 'Remus', roomId: 'living', activity: '🎮 League' },
        { id: 2, name: 'Noam', roomId: 'gaming', activity: '💬 Talking' },
    ]
</script>

<template>
    <div class="p-4">
        <h1 class="text-xl mb-4">איפה כולם?</h1>

        <div v-for="user in users"
             :key="user.id"
             class="bg-gray-700 p-3 rounded mb-2"
             @click="ui.openRoom(user.roomId)">
            <div class="font-bold">{{ user.name }}</div>
            <div class="text-sm opacity-80">{{ user.activity }}</div>
        </div>
    </div>
</template>
