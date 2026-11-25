<script setup lang="ts">
import { ref } from 'vue';
import { BPM_MAX, BPM_MIN, clampBpm } from '@/core/timeline';
import { tapTempo } from '@/core/tempo';

defineProps<{ tap?: boolean }>();
const bpm = defineModel<number>({ required: true });

const set = (v: number) => (bpm.value = clampBpm(v));
let taps: number[] = [];
const tapped = ref(false);
function onTap() {
  const r = tapTempo(taps, performance.now());
  taps = r.taps;
  if (r.bpm !== undefined) set(r.bpm);
  tapped.value = true;
}
</script>

<template>
  <div class="row tempo">
    <button type="button" aria-label="Медленнее" @click="set(bpm - 1)">−</button>
    <input
      type="range"
      :min="BPM_MIN"
      :max="BPM_MAX"
      step="1"
      aria-label="Темп"
      :value="bpm"
      @input="set(+($event.target as HTMLInputElement).value)"
    />
    <button type="button" aria-label="Быстрее" @click="set(bpm + 1)">+</button>
    <b class="bv" data-testid="bpm">{{ bpm }} BPM</b>
    <button v-if="tap" type="button" aria-label="Отстучать темп" @click="onTap">TAP</button>
  </div>
</template>

<style scoped>
.tempo input[type='range'] {
  flex: 1 1 120px;
}
.bv {
  min-width: 78px;
  text-align: right;
  white-space: nowrap;
}
</style>
