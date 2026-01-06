<script setup>
import { useUIStore } from '../stores/ui'
const ui = useUIStore()
</script>

<template>
    <div class="h-12 flex items-center px-3 bg-black/40">
        <button @click="ui.goHome()" class="text-lg">⬅</button>
        <div class="ml-3 font-bold">חדר</div>
    </div>
</template>
