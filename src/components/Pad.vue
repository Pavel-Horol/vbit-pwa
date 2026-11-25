<script setup lang="ts">
import type { Beat } from '@/core/types';

defineProps<{ beat: Beat; label?: string; activeSlot?: number | null }>();
</script>

<template>
  <div class="pad">
    <div v-if="label" class="pl">{{ label }}</div>
    <div class="cells">
      <div
        v-for="(s, i) in beat.syllables"
        :key="i"
        class="cell"
        :class="{ f: i === 0, rest: s.text === '', on: activeSlot === i }"
        :data-slot="i"
      >
        {{ s.text === '' ? '·' : s.text }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.pad {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 5px;
  background: var(--pan2);
  border-radius: 12px;
  border: 1px solid var(--line);
}
.pl {
  font-size: 12px;
  color: var(--mute);
  text-align: center;
  line-height: 1.2;
  padding-top: 2px;
}
.cells {
  display: flex;
  gap: 3px;
  flex: 1;
  min-height: 58px;
}
.cell {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: clamp(14px, 3.6vw, 18px);
  color: var(--mute);
  text-align: center;
  white-space: nowrap;
  padding: 2px 3px;
  transition: background 0.05s;
}
.cell.f {
  color: var(--ink);
  font-weight: 700;
}
.cell.rest {
  opacity: 0.35;
}
.cell.on {
  background: var(--acc);
  color: var(--accInk);
  opacity: 1;
}
</style>
