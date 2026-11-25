<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import type { Bar, LadderStage, TimelineEvent } from '@/core/types';
import { baseMix } from '@/core/timeline';
import { mixForStage, type RenderMode } from '@/core/ladder';
import { barAt, play, stop } from '@/audio/engine';
import { useSettingsStore } from '@/stores/settings';
import BarGrid from './BarGrid.vue';
import TempoControl from './TempoControl.vue';
import TickVolume from './TickVolume.vue';

const props = withDefaults(
  defineProps<{
    getBar: (i: number) => Bar;
    tap?: boolean;
    ownStart?: boolean;
    /** Множитель тиков слогов (0 — выключены в этом контексте). */
    tickMultiplier?: number;
    ticksOffHint?: string;
    /** Ступень лестницы (REQ-LAD-1): громкости берутся из mixForStage. */
    stage?: LadderStage;
    mode?: RenderMode;
  }>(),
  {
    tap: false,
    ownStart: true,
    tickMultiplier: 1,
    ticksOffHint: undefined,
    stage: undefined,
    mode: 'syllables',
  },
);
const emit = defineEmits<{ stopped: []; event: [e: TimelineEvent] }>();
const bpm = defineModel<number>('bpm', { required: true });

const settings = useSettingsStore();
const playing = ref(false);
const shownBar = ref(-1);
const liveCur = shallowRef<Bar | null>(null);
const liveNext = shallowRef<Bar | null>(null);
const active = ref<{ beat: number; slot: number } | null>(null);

const cur = computed(() => (playing.value && liveCur.value) || props.getBar(0));
const next = computed(() => (playing.value && liveNext.value) || props.getBar(1));

function onEvent(e: TimelineEvent) {
  if (e.bar !== shownBar.value) {
    shownBar.value = e.bar;
    liveCur.value = barAt(e.bar) ?? null;
    liveNext.value = barAt(e.bar + 1) ?? null;
  }
  active.value = { beat: e.beat, slot: e.slot };
  emit('event', e);
}

function start() {
  const getBar = props.getBar;
  play({
    getBar,
    bpm: () => bpm.value,
    mix: () =>
      props.stage
        ? mixForStage(props.stage, settings.tickVolume)
        : baseMix(settings.tickVolume, props.tickMultiplier),
    timing: () => ({ leadMs: settings.leadMs, outputOffsetMs: settings.outputOffsetMs }),
    onEvent,
    onStop: () => {
      playing.value = false;
      active.value = null;
      shownBar.value = -1;
      liveCur.value = liveNext.value = null;
      emit('stopped');
    },
  });
  playing.value = true;
}

function stopPlayer() {
  if (playing.value) stop();
}

const toggle = () => (playing.value ? stopPlayer() : start());
/** Перезапуск после смены режима/набора — как refresh() в прототипе. */
const refresh = () => {
  if (playing.value) start();
};

onBeforeUnmount(stopPlayer);
defineExpose({ start, stop: stopPlayer, toggle, refresh, playing });
</script>

<template>
  <div class="player">
    <slot name="display" :bar="cur" :next="next" :active="active">
      <BarGrid :bar="cur" :next="next" :active="active" :mode="mode" />
    </slot>
    <div class="controls">
      <TempoControl v-model="bpm" :tap="tap" />
      <TickVolume :disabled-hint="tickMultiplier === 0 ? ticksOffHint : undefined" />
      <slot name="controls"></slot>
      <button v-if="ownStart" type="button" class="pri wide" @click="toggle">
        {{ playing ? 'Стоп' : 'Старт' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.controls {
  display: grid;
  gap: 6px;
  margin-top: 14px;
}
.wide {
  width: 100%;
  margin-top: 4px;
}
</style>
