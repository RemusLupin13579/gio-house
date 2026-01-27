import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
    plugins: [vue()],
    server: {
        proxy: {
            "/api/send-push": {
                target: "https://khaezthvfznjqalhzitz.supabase.co",
                changeOrigin: true,
                secure: true,
                rewrite: (path) => path.replace(/^\/api\/send-push/, "/functions/v1/send-push"),
            },
        },
    },
})
