<script setup lang="ts">
import { LADDER_STAGES, STAGES } from '@/core/ladder';
import type { LadderStage } from '@/core/types';

// REQ-LAD-4: ступени 1–6, текущая выделена, выбор вручную.
defineProps<{ stage: LadderStage }>();
const emit = defineEmits<{ select: [stage: LadderStage] }>();
</script>

<template>
  <div class="ladder" role="group" aria-label="Ступень">
    <button
      v-for="s in LADDER_STAGES"
      :key="s"
      type="button"
      class="st"
      :aria-pressed="s === stage"
      @click="emit('select', s)"
    >
      <b>{{ s }}</b><span>{{ STAGES[s].name }}</span>
    </button>
  </div>
</template>

<style scoped>
.ladder {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.st {
  flex-direction: column;
  gap: 0;
  padding: 6px 4px;
  min-height: 52px;
  white-space: normal;
  line-height: 1.2;
  font-size: 13px;
}
.st b {
  font-family: var(--font-head);
  font-size: 16px;
  font-weight: 500;
}
.st[aria-pressed='true'] {
  background: var(--ink);
  color: var(--bg);
  border-color: var(--ink);
}
</style>
