<script setup lang="ts">
import { useRoute } from 'vue-router';
import type { Tab } from '@/router';

const route = useRoute();

const tabs: { tab: Tab; to: string; label: string }[] = [
  { tab: 'home', to: '/', label: 'Главная' },
  { tab: 'session', to: '/session', label: 'Тренировка' },
  { tab: 'metronome', to: '/metronome', label: 'Метроном' },
  { tab: 'texts', to: '/texts', label: 'Тексты' },
];
</script>

<template>
  <nav class="tabs" aria-label="Разделы">
    <RouterLink
      v-for="t in tabs"
      :key="t.tab"
      :to="t.to"
      :class="{ on: route.meta.tab === t.tab }"
      :aria-current="route.meta.tab === t.tab ? 'page' : undefined"
      ><i aria-hidden="true"></i>{{ t.label }}</RouterLink
    >
  </nav>
</template>

<style scoped>
.tabs {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  background: var(--pan);
  border-top: 1px solid var(--line);
  padding-bottom: env(safe-area-inset-bottom);
  z-index: 5;
}
.tabs a {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 60px;
  color: var(--mute);
  text-decoration: none;
  font-size: 13px;
}
.tabs a i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--line);
}
.tabs a.on {
  color: var(--ink);
}
.tabs a.on i {
  background: var(--acc);
}
.tabs a:focus-visible {
  outline-offset: -4px;
}
</style>
