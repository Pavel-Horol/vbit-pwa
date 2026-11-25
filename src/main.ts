import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { initPersistence } from './stores/persist';
import { initNativeShell } from './platform/lifecycle';
import './styles/fonts.css';
import './styles/theme.css';

async function boot() {
  const pinia = createPinia();
  await initPersistence(pinia);
  createApp(App).use(pinia).use(router).mount('#app');
  initNativeShell(router);
}
void boot();
