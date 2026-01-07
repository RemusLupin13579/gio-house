import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import { createPinia } from "pinia";
import { initAuth } from "./stores/auth";
import "./assets/main.css";

async function bootstrap() {
    await initAuth();
    createApp(App).use(createPinia()).use(router).mount("#app");
}

bootstrap();
