<script setup lang="ts">
import { computed } from 'vue';
import { formatTime } from '@/lib/format';

const props = defineProps<{ left: number; doneText?: string }>();
const shown = computed(() =>
  props.left <= 0 && props.doneText ? props.doneText : formatTime(props.left),
);
</script>

<template>
  <div class="big" role="timer" aria-live="off">{{ shown }}</div>
</template>

<style scoped>
.big {
  font-family: var(--font-head);
  font-size: clamp(44px, 14vw, 72px);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  margin: 14px 0;
}
</style>
