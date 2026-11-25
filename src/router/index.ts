import { createRouter, createWebHashHistory } from 'vue-router';
import HomeView from '@/views/HomeView.vue';
import { stop } from '@/audio/engine';

export type Tab = 'home' | 'session' | 'metronome' | 'texts';

declare module 'vue-router' {
  interface RouteMeta {
    tab: Tab;
    title: string;
  }
}

export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { tab: 'home', title: 'Главная' } },
    {
      path: '/session',
      name: 'session',
      component: () => import('@/views/SessionView.vue'),
      meta: { tab: 'session', title: 'Тренировка' },
    },
    {
      path: '/metronome',
      name: 'metronome',
      component: () => import('@/views/MetronomeView.vue'),
      meta: { tab: 'metronome', title: 'Метроном' },
    },
    {
      path: '/texts',
      name: 'texts',
      component: () => import('@/views/TextsView.vue'),
      meta: { tab: 'texts', title: 'Тексты' },
    },
    {
      path: '/texts/:id',
      name: 'text',
      component: () => import('@/views/TextEditView.vue'),
      meta: { tab: 'texts', title: 'Текст' },
    },
    {
      path: '/texts/:id/drill',
      name: 'drill',
      component: () => import('@/views/LineDrillView.vue'),
      meta: { tab: 'texts', title: 'Разбор строки' },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { tab: 'home', title: 'Настройки' },
    },
    {
      path: '/progress',
      name: 'progress',
      component: () => import('@/views/ProgressView.vue'),
      meta: { tab: 'home', title: 'Прогресс' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

// REQ-AUD-8: смена экрана останавливает звук.
router.beforeEach(() => {
  stop();
});

router.afterEach((to) => {
  document.title = to.name === 'home' ? 'В бит — тренажёр читки' : `${to.meta.title} · В бит`;
});
