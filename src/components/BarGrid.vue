<script setup lang="ts">
import { computed } from 'vue';
import type { RenderMode } from '@/core/ladder';
import type { Bar } from '@/core/types';
import Pad from './Pad.vue';

type Join = { l: boolean; r: boolean };

const props = withDefaults(
  defineProps<{
    bar: Bar;
    next?: Bar | null;
    active?: { beat: number; slot: number } | null;
    mode?: RenderMode;
  }>(),
  { next: null, active: null, mode: 'syllables' },
);

const LABELS = ['РАЗ', 'два', 'три', 'четыре'];

/** Склейка слов через границы долей: соседний слог того же слова (wordId ≠ −1). */
function joinsOf(bar: Bar): Join[][] {
  const flat = bar.flatMap((b) => b.syllables);
  let at = 0;
  return bar.map((b) =>
    b.syllables.map((s) => {
      const i = at++;
      const same = (o?: (typeof flat)[number]) => s.wordId !== -1 && o?.wordId === s.wordId;
      return { l: same(flat[i - 1]), r: same(flat[i + 1]) };
    }),
  );
}
const joins = computed(() => (props.mode === 'words' ? joinsOf(props.bar) : undefined));
const nextJoins = computed(() =>
  props.mode === 'words' && props.next ? joinsOf(props.next) : undefined,
);
</script>

<template>
  <div class="bargrid">
    <div class="grid cur" data-testid="bar-current">
      <Pad
        v-for="(beat, i) in bar"
        :key="i"
        :beat="beat"
        :label="LABELS[i]"
        :mode="mode"
        :joins="joins?.[i]"
        :active-slot="active && active.beat === i ? active.slot : null"
      />
    </div>
    <div v-if="next" class="grid next" aria-hidden="true">
      <Pad v-for="(beat, i) in next" :key="i" :beat="beat" :mode="mode" :joins="nextJoins?.[i]" />
    </div>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
@media (max-width: 560px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.next {
  margin-top: 8px;
  opacity: 0.5;
}
.next :deep(.cells) {
  min-height: 34px;
}
.next :deep(.cell) {
  font-size: 13px;
}
</style>
