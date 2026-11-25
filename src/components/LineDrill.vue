<script setup lang="ts">
// REQ-LAD: разбор строки по «лестнице». Одна строка или 2–4 подряд играются по кругу после отсчёта.
import { computed, onMounted, ref, shallowRef, toRaw, watch } from 'vue';
import type { LadderStage, LineProgress, Syllable, Text, TimelineEvent } from '@/core/types';
import { barAt } from '@/audio/engine';
import {
  completedLoops,
  drillLayout,
  initialProgress,
  lowestStageLine,
  nextState,
  progressAt,
  renderModeForStage,
  STAGES,
  startBpm,
} from '@/core/ladder';
import { nonEmptyLines } from '@/core/parse';
import { loopBars, withCountIn } from '@/core/timeline';
import { plainLine } from '@/lib/format';
import { ensureStressDict, stressDict } from '@/lib/stressDict';
import { setLineProgress } from '@/stores/texts';
import BarPlayer from './BarPlayer.vue';
import ChipGroup from './ChipGroup.vue';
import KaraokeLine from './KaraokeLine.vue';
import LadderBar from './LadderBar.vue';

const props = withDefaults(
  defineProps<{ text: Text; line?: number; ownStart?: boolean; ticksOffHint?: string }>(),
  { line: undefined, ownStart: true, ticksOffHint: undefined },
);
const emit = defineEmits<{ stopped: [] }>();

onMounted(() => void ensureStressDict());

const lineTexts = computed(() => nonEmptyLines(props.text.raw));
const start = ref(
  props.line ?? Math.max(0, lowestStageLine(lineTexts.value.length, props.text.lines)),
);
const count = ref<1 | 2 | 3 | 4>(1);
const countOptions: [1 | 2 | 3 | 4, string][] = [
  [1, '1'],
  [2, '2'],
  [3, '3'],
  [4, '4'],
];
const indices = computed(() => {
  const n = lineTexts.value.length;
  const s = Math.min(start.value, Math.max(0, n - 1));
  return Array.from({ length: Math.min(count.value, n - s) }, (_, k) => s + k);
});

/** Состояние группы строк — у строки с наименьшей ступенью (решение этапа 2). */
const state = computed<LineProgress>(() => {
  const all = indices.value.map((i) => progressAt(props.text.lines, i, props.text.targetBpm));
  return all.reduce((a, b) => (b.stage < a.stage ? b : a), all[0] ?? initialProgress(80));
});
const stage = computed(() => state.value.stage);
const mode = computed(() => renderModeForStage(stage.value));
const write = (lp: LineProgress) => setLineProgress(props.text, indices.value, lp);

const result = computed(() =>
  drillLayout(props.text, indices.value[0] ?? 0, indices.value.length, stressDict.value),
);
const getBar = computed(() => withCountIn(loopBars(result.value.loop), result.value.pickup));

const bpm = computed({
  get: () => state.value.bpm,
  set: (v: number) => write({ ...state.value, bpm: v }),
});

// --- круги и оценка (REQ-LAD-3) ---
const done = ref(0);
const rated = ref(0);
const canRate = computed(() => done.value > rated.value);
function onEvent(e: TimelineEvent) {
  done.value = Math.max(done.value, completedLoops(e.bar, result.value.loop.length));
  const s = barAt(e.bar)?.[e.beat]?.syllables[e.slot];
  active.value = s && s.wordId !== -1 ? toRaw(s) : null;
}
const lastResult = ref('');
/** Оценка применяется к последнему завершённому кругу; плеер не останавливается. */
function rate(r: 'clean' | 'fail') {
  if (!canRate.value) return;
  rated.value = done.value;
  const before = state.value;
  write(nextState(before, r, props.text.targetBpm));
  const after = state.value;
  if (after.stage !== before.stage) lastResult.value = `Новая ступень: ${STAGES[after.stage].name}`;
  else if (after.bpm !== before.bpm) lastResult.value = `Темп: ${after.bpm} BPM`;
  else lastResult.value = r === 'clean' ? `Чисто ${after.cleanStreak} из 3` : 'Ещё раз';
}

function selectStage(s: LadderStage) {
  write({ stage: s, bpm: startBpm(props.text.targetBpm), cleanStreak: 0, failStreak: 0 });
}
const confirmReset = ref(false);
function resetLines() {
  write(initialProgress(props.text.targetBpm));
  confirmReset.value = false;
}

// --- плеер ---
const player = ref<InstanceType<typeof BarPlayer> | null>(null);
const active = shallowRef<Syllable | null>(null);
const restart = () => {
  done.value = 0;
  rated.value = 0;
  active.value = null;
  player.value?.refresh();
};
watch([indices, () => props.text.raw], restart);

const lineLabel = (i: number) => plainLine(lineTexts.value[i] ?? '', props.text.mode);
const stageOf = (i: number) => progressAt(props.text.lines, i, props.text.targetBpm).stage;

defineExpose({
  start: () => player.value?.start(),
  stop: () => player.value?.stop(),
});
</script>

<template>
  <div class="drill">
    <div v-if="lineTexts.length > 1" class="card lines">
      <p class="small mute" style="margin: 0 0 6px">Строка</p>
      <div class="list" role="group" aria-label="Строка">
        <button
          v-for="(_, i) in lineTexts"
          :key="i"
          type="button"
          class="ln"
          :aria-pressed="indices.includes(i)"
          @click="start = i"
        >
          <span class="lt">{{ lineLabel(i) }}</span><span class="lb small">{{ stageOf(i) }}</span>
        </button>
      </div>
      <div class="row" style="margin-top: 8px">
        <span class="small mute">Строк подряд:</span>
        <ChipGroup v-model="count" :options="countOptions" label="Строк подряд" />
      </div>
    </div>

    <p class="small mute" data-testid="drill-stage">
      Ступень {{ stage }} · {{ STAGES[stage].name }} · цель {{ text.targetBpm }} BPM
    </p>

    <BarPlayer
      ref="player"
      v-model:bpm="bpm"
      :get-bar="getBar"
      :own-start="ownStart"
      :stage="stage"
      :mode="mode"
      :tick-multiplier="STAGES[stage].ticks"
      :ticks-off-hint="STAGES[stage].ticks === 0 ? 'выкл.' : ticksOffHint"
      @event="onEvent"
      @stopped="emit('stopped')"
    >
      <template v-if="mode === 'karaoke' || mode === 'memory'" #display>
        <KaraokeLine :lines="result.lines" :active="active" :memory="mode === 'memory'" />
      </template>
    </BarPlayer>

    <div class="rate">
      <p class="small mute" aria-live="polite" style="margin: 0 0 6px; min-height: 1.5em">
        {{
          canRate ? 'Круг закончен — как прошёл?' : lastResult || 'После круга оцени, как прошёл.'
        }}
      </p>
      <div class="row">
        <button type="button" class="big grow" :disabled="!canRate" @click="rate('fail')">
          Сбился
        </button>
        <button type="button" class="big pri grow" :disabled="!canRate" @click="rate('clean')">
          Чисто
        </button>
      </div>
    </div>

    <div class="sp"></div>
    <LadderBar :stage="stage" @select="selectStage" />
    <div class="row" style="margin-top: 10px">
      <button v-if="!confirmReset" type="button" @click="confirmReset = true">
        Сбросить прогресс строки
      </button>
      <div v-else class="card confirm" role="alertdialog" aria-labelledby="reset-title">
        <p id="reset-title" style="margin: 0 0 10px">Начать строку заново со ступени 1?</p>
        <div class="row">
          <button type="button" class="pri" @click="resetLines">Сбросить</button>
          <button type="button" @click="confirmReset = false">Отмена</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.list {
  display: grid;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
}
.ln {
  justify-content: space-between;
  gap: 8px;
  text-align: left;
  white-space: normal;
}
.ln[aria-pressed='true'] {
  border-color: var(--acc);
}
.lt {
  flex: 1;
}
.lb {
  font-family: var(--font-head);
  color: var(--mute);
}
.rate {
  position: sticky;
  bottom: calc(68px + env(safe-area-inset-bottom));
  background: var(--bg);
  padding: 10px 0 4px;
  z-index: 2;
}
.big {
  min-height: 60px;
  font-size: 18px;
}
.grow {
  flex: 1;
}
.confirm {
  border-color: var(--acc);
  width: 100%;
}
</style>
