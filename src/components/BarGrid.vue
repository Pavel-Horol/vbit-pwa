<script setup lang="ts">
import type { Bar } from '@/core/types';
import Pad from './Pad.vue';

defineProps<{
  bar: Bar;
  next?: Bar | null;
  active?: { beat: number; slot: number } | null;
}>();

const LABELS = ['РАЗ', 'два', 'три', 'четыре'];
</script>

<template>
  <div class="bargrid">
    <div class="grid cur" data-testid="bar-current">
      <Pad
        v-for="(beat, i) in bar"
        :key="i"
        :beat="beat"
        :label="LABELS[i]"
        :active-slot="active && active.beat === i ? active.slot : null"
      />
    </div>
    <div v-if="next" class="grid next" aria-hidden="true">
      <Pad v-for="(beat, i) in next" :key="i" :beat="beat" />
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
