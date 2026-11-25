<script setup lang="ts">
// Экран «Прогресс»: серия и рекорды (REQ-SES-4/6) и сравнение записей (REQ-MIC-5).
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { comparisonRecordings, type Recording } from '@/core/recordings';
import { plural } from '@/lib/format';
import { useProgressStore } from '@/stores/progress';
import { loadRecording } from '@/stores/recordings';

const progress = useProgressStore();

const stats = computed(() => {
  const s = progress.streak;
  const n = progress.sessions;
  return [
    [String(s), plural(s, 'день подряд', 'дня подряд', 'дней подряд')],
    [String(n), plural(n, 'тренировка', 'тренировки', 'тренировок')],
    [progress.breathBestSec ? `${progress.breathBestSec} с` : '—', 'рекорд выдоха'],
    [progress.countBest ? String(progress.countBest) : '—', 'рекорд счёта'],
  ];
});

const cmp = computed(() => comparisonRecordings(progress.recordings ?? [], new Date()));

const dateLabel = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

type Slot = { title: string; note?: string; rec?: Recording; url?: string };
const urls = ref<Record<string, string>>({});
let made: string[] = [];

async function loadUrls() {
  const recs = [cmp.value.today, cmp.value.weekAgo].filter((r): r is Recording => !!r);
  for (const r of recs) {
    if (urls.value[r.blobKey]) continue;
    const blob = await loadRecording(r);
    if (!blob) continue;
    const u = URL.createObjectURL(blob);
    made.push(u);
    urls.value = { ...urls.value, [r.blobKey]: u };
  }
}
watch(cmp, () => void loadUrls(), { immediate: true });
onBeforeUnmount(() => {
  made.forEach((u) => URL.revokeObjectURL(u));
  made = [];
});

const slots = computed<Slot[]>(() => {
  const { today, weekAgo, weekAgoExact } = cmp.value;
  return [
    { title: 'Сегодня', rec: today, url: today && urls.value[today.blobKey] },
    {
      title: '7 дней назад',
      ...(weekAgo && !weekAgoExact
        ? { note: `ближайшая раньше — ${dateLabel(weekAgo.date)}` }
        : {}),
      rec: weekAgo,
      url: weekAgo && urls.value[weekAgo.blobKey],
    },
  ];
});
</script>

<template>
  <section aria-labelledby="title">
    <RouterLink class="btn back" to="/">← Главная</RouterLink>
    <h2 id="title">Прогресс</h2>

    <div class="stats">
      <div v-for="[v, l] in stats" :key="l" class="card stat">
        <div class="v">{{ v }}</div>
        <div class="small mute">{{ l }}</div>
      </div>
    </div>

    <h3>Записи</h3>
    <p class="small mute">
      Каждый день не переслушивай — раз в неделю сравни, как звучишь сейчас и неделю назад. Записи
      хранятся 30 дней и в файл копии не входят.
    </p>
    <div v-for="s in slots" :key="s.title" class="card rec" :data-testid="'rec-' + s.title">
      <p class="rt">
        <b>{{ s.title }}</b>
        <span v-if="s.note" class="small mute"> · {{ s.note }}</span>
      </p>
      <audio v-if="s.url" :src="s.url" controls preload="metadata"></audio>
      <p v-else-if="s.rec" class="small mute">Загружаю…</p>
      <p v-else class="small mute">
        Записи нет — она появится после шага «Запись на диктофон» в тренировке.
      </p>
    </div>
  </section>
</template>

<style scoped>
h2 {
  margin-bottom: 16px;
}
.stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 18px;
}
.stat .v {
  font-family: var(--font-head);
  font-size: 24px;
}
.rec {
  display: grid;
  gap: 8px;
  margin-bottom: 10px;
}
.rec p {
  margin: 0;
}
audio {
  width: 100%;
}
</style>
