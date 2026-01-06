import { createApp } from "vue";
import App from "./App.vue";
import { createPinia } from "pinia";
import router from "./router";
import { initAuth } from "./stores/auth";
import "./style.css";

async function bootstrap() {
    await initAuth();

    const app = createApp(App);
    app.use(createPinia());
    app.use(router);
    app.mount("#app");
}

bootstrap();
