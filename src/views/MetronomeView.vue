<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { DrillSet } from '@/core/types';
import { drillBar } from '@/core/patterns';
import { DRILL_MODES } from '@/data';
import { useMetronomeStore } from '@/stores/metronome';
import BarPlayer from '@/components/BarPlayer.vue';
import ChipGroup from '@/components/ChipGroup.vue';

const m = useMetronomeStore();
const sets: [DrillSet, string][] = [
  ['taka', 'та-ка-ти-ки'],
  ['pbdg', 'па-ба-да-га'],
  ['rand', 'Случайные слоги'],
];
const getBar = computed(() => {
  const { mode, set } = m;
  return (i: number) => drillBar(mode, set, i, Math.random);
});
const player = ref<InstanceType<typeof BarPlayer> | null>(null);
watch(
  () => [m.mode, m.set],
  () => player.value?.refresh(),
);
</script>

<template>
  <section aria-labelledby="title">
    <h2 id="title">Метроном-слоги</h2>
    <p class="mute small">
      Нога отбивает щелчки. Первый слог каждой доли — ровно на щелчке, остальные делят промежуток
      поровну.
    </p>
    <p class="small mute" style="margin-bottom: 6px">Слогов на щелчок</p>
    <ChipGroup v-model="m.mode" :options="DRILL_MODES" label="Слогов на щелчок" />
    <p class="small mute" style="margin: 12px 0 6px">Что говорить</p>
    <ChipGroup v-model="m.set" :options="sets" label="Что говорить" />
    <div class="sp"></div>
    <BarPlayer ref="player" v-model:bpm="m.bpm" :get-bar="getBar" tap />
  </section>
</template>
