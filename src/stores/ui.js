import { defineStore } from "pinia";

export const useUIStore = defineStore("ui", {
    state: () => ({
        toasts: [],
    }),
    actions: {
        toast(text, ms = 2400) {
            const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
            this.toasts.push({ id, text });
            setTimeout(() => {
                this.toasts = this.toasts.filter(t => t.id !== id);
            }, ms);
        },
    },
});
