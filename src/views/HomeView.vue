<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useRouter } from 'vue-router';
import type { Bar } from '@/core/types';
import { drillBar, syllablesPerBeat } from '@/core/patterns';
import { WEEKS } from '@/data';
import { plural } from '@/lib/format';
import { useSettingsStore } from '@/stores/settings';
import { useProgressStore } from '@/stores/progress';
import BarGrid from '@/components/BarGrid.vue';
import ChipGroup from '@/components/ChipGroup.vue';

const router = useRouter();
const settings = useSettingsStore();
const progress = useProgressStore();

const week = computed(() => WEEKS[settings.week - 1]!);
const weekOptions: [1 | 2 | 3 | 4, string][] = [
  [1, '1-я'],
  [2, '2-я'],
  [3, '3-я'],
  [4, '4-я'],
];

const stats = computed(() => {
  const s = progress.streak;
  const n = progress.sessions;
  const br = progress.breathBestSec;
  return [
    [String(s), plural(s, 'день подряд', 'дня подряд', 'дней подряд')],
    [String(n), plural(n, 'тренировка', 'тренировки', 'тренировок')],
    [br ? `${br} с` : '—', 'рекорд выдоха'],
  ];
});

// Демо: сетка «дышит» 1 → 2 → 4 → 3 слога на долю. Только визуал, без звука.
const demoBar = shallowRef<Bar>(drillBar(4, 'taka', 0, Math.random));
const demoActive = ref<{ beat: number; slot: number } | null>(null);
let demoTimer: ReturnType<typeof setTimeout> | undefined;
onMounted(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let bar = 0;
  let beat = 0;
  let slot = 0;
  const step = () => {
    const n = syllablesPerBeat('auto', bar);
    if (beat === 0 && slot === 0)
      demoBar.value = drillBar(n as 1 | 2 | 3 | 4, 'taka', 0, Math.random);
    demoActive.value = { beat, slot };
    if (++slot >= n) {
      slot = 0;
      if (++beat >= 4) {
        beat = 0;
        bar++;
      }
    }
    demoTimer = setTimeout(step, 750 / n);
  };
  step();
});
onBeforeUnmount(() => clearTimeout(demoTimer));
</script>

<template>
  <section class="hero" aria-labelledby="home-title">
    <div>
      <p class="mute small" style="margin: 0 0 8px"><span class="lamp"></span>тренажёр читки</p>
      <h1 id="home-title">В бит</h1>
      <p class="mute">
        15–20 минут в день: разминка, дыхание, дикция и ритм. Метроном подсвечивает, какой слог
        говорить в каждый момент.
      </p>
    </div>
    <div aria-hidden="true">
      <BarGrid :bar="demoBar" :active="demoActive" />
    </div>
    <div class="card">
      <h3>Какая у тебя неделя</h3>
      <ChipGroup
        v-model="settings.week"
        :options="weekOptions"
        label="Неделя"
        style="margin: 10px 0"
      />
      <p class="small mute">{{ week.tip }} Темп: {{ week.bpm }} BPM.</p>
      <button type="button" class="pri wide" @click="router.push('/session')">
        Начать тренировку · ~18 мин
      </button>
    </div>
    <div class="stats">
      <div v-for="[a, b] in stats" :key="b" class="stat">
        <b>{{ a }}</b><span class="small mute">{{ b }}</span>
      </div>
    </div>
    <div class="row">
      <RouterLink class="btn grow" to="/progress">Прогресс</RouterLink>
      <RouterLink class="btn grow" to="/settings">Настройки</RouterLink>
    </div>
  </section>
</template>

<style scoped>
.hero {
  display: grid;
  gap: 18px;
}
.wide {
  width: 100%;
}
.grow {
  flex: 1;
}
.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.stat {
  background: var(--pan);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px;
}
.stat b {
  display: block;
  font-family: var(--font-head);
  font-size: 22px;
  font-weight: 500;
}
</style>
