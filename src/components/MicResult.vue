<script setup lang="ts">
// REQ-MIC-4: результат круга по микрофону — метка у каждого слога и итог.
import { computed } from 'vue';
import type { LoopScore, Mark } from '@/core/micScore';

const props = defineProps<{ score: LoopScore }>();

const LABEL: Record<Mark, string> = {
  ok: 'вовремя',
  early: 'рано',
  late: 'поздно',
  miss: 'пропущен',
};
const caption = (m: LoopScore['marks'][number]) =>
  m.mark === 'ok'
    ? '✓'
    : m.mark === 'miss'
      ? '—'
      : `${m.deltaMs! > 0 ? '+' : '−'}${Math.abs(m.deltaMs!)}`;

const summary = computed(() => {
  const s = props.score;
  const head = `Вовремя ${s.onTime} из ${s.total} (${s.pct}%)`;
  if (s.meanOffsetMs === null) return head;
  const off = s.meanOffsetMs;
  if (Math.abs(off) <= 10) return `${head} · в среднем точно в долю`;
  return `${head} · в среднем на ${Math.abs(off)} мс ${off > 0 ? 'позже' : 'раньше'}`;
});
</script>

<template>
  <div class="mres" data-testid="mic-result">
    <p class="small" role="status">
      <b>{{ score.clean ? 'Чисто' : 'Есть ошибки' }}</b> · {{ summary }}
    </p>
    <ol class="cells" aria-label="Слоги круга">
      <li
        v-for="m in score.marks"
        :key="m.key"
        class="c"
        :class="[m.mark, { st: m.stressed }]"
        :title="LABEL[m.mark]"
      >
        <span class="t">{{ m.text }}</span>
        <span class="m"
          >{{ caption(m) }}<span class="sr">{{ ' ' + LABEL[m.mark] }}</span></span
        >
      </li>
    </ol>
  </div>
</template>

<style scoped>
.mres p {
  margin: 0 0 8px;
}
.cells {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.c {
  display: grid;
  justify-items: center;
  min-width: 40px;
  padding: 4px 6px;
  border-radius: 8px;
  background: var(--pan2);
  border: 1px solid var(--line);
  white-space: nowrap;
}
.t {
  font-size: 15px;
}
.st .t {
  font-weight: 800;
  text-decoration: underline 2px var(--acc);
  text-underline-offset: 3px;
}
.m {
  font-size: 12px;
  color: var(--mute);
}
.ok {
  border-color: var(--mute);
}
.ok .m {
  color: var(--ink);
}
.early,
.late {
  border-color: var(--acc);
}
.early .m,
.late .m {
  color: var(--acc);
}
.miss {
  opacity: 0.55;
  border-style: dashed;
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
