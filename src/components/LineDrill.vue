<script setup lang="ts">
// REQ-LAD: разбор строки по «лестнице». Одна строка или 2–4 подряд играются по кругу после отсчёта.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch } from 'vue';
import type { LadderStage, LineProgress, Syllable, Text, TimelineEvent } from '@/core/types';
import { audioNow, barAt } from '@/audio/engine';
import { listen, type Listener } from '@/audio/mic/listener';
import {
  expectedSyllable,
  loopOf,
  SCORE_STRESSED_ONLY,
  scoreLoop,
  type Expected,
  type LoopScore,
} from '@/core/micScore';
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
import { micErrorText } from '@/lib/mic';
import { useSettingsStore } from '@/stores/settings';
import { setLineProgress } from '@/stores/texts';
import BarPlayer from './BarPlayer.vue';
import MicResult from './MicResult.vue';
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
/** Последняя автооценка по микрофону — кнопки могут её заменить (решение этапа 4). */
const lastAuto = shallowRef<{ loop: number; before: LineProgress } | null>(null);
const canRate = computed(() => done.value > rated.value || lastAuto.value !== null);
function onEvent(e: TimelineEvent) {
  done.value = Math.max(done.value, completedLoops(e.bar, result.value.loop.length));
  const s = barAt(e.bar)?.[e.beat]?.syllables[e.slot];
  active.value = s && s.wordId !== -1 ? toRaw(s) : null;
  if (listener) collect(e, s);
}
const lastResult = ref('');

function apply(r: 'clean' | 'fail', before: LineProgress, source: 'button' | 'mic' | 'override') {
  write(nextState(before, r, props.text.targetBpm));
  const after = state.value;
  const prefix =
    source === 'mic'
      ? `По микрофону: ${r === 'clean' ? 'чисто' : 'есть ошибки'}. `
      : source === 'override'
        ? 'Оценка исправлена. '
        : '';
  let what: string;
  if (after.stage !== before.stage) what = `Новая ступень: ${STAGES[after.stage].name}`;
  else if (after.bpm !== before.bpm) what = `Темп: ${after.bpm} BPM`;
  else what = r === 'clean' ? `Чисто ${after.cleanStreak} из 3` : 'Ещё раз';
  lastResult.value = prefix + what;
}

/**
 * Кнопка применяется к последнему завершённому кругу; плеер не останавливается. Если этот круг
 * уже оценён микрофоном, кнопка заменяет автооценку.
 */
function rate(r: 'clean' | 'fail') {
  if (done.value > rated.value) {
    rated.value = done.value;
    lastAuto.value = null;
    apply(r, state.value, 'button');
  } else if (lastAuto.value) {
    const { before } = lastAuto.value;
    lastAuto.value = null;
    apply(r, before, 'override');
  }
}

// --- REQ-MIC-4: оценка круга по микрофону ---
const settings = useSettingsStore();
const micCalibrated = computed(() => settings.inputOffsetMs !== undefined);
const micOn = computed({
  get: () => micCalibrated.value && !!settings.micScoring,
  set: (v: boolean) => (settings.micScoring = v),
});
const micError = ref('');
const micListening = ref(false);
const micScore = shallowRef<LoopScore | null>(null);
let listener: Listener | null = null;
let micToken = 0;
let playing = false;

type LoopData = { expected: Expected[]; start: number; end?: number; partial: boolean };
const loops = new Map<number, LoopData>();
/** Запас после конца круга: задержка микрофона + обработка. */
const EVAL_MARGIN_S = 0.25;

async function openMic() {
  if (listener) return;
  const token = ++micToken;
  micError.value = '';
  try {
    const l = await listen({
      inputOffsetMs: settings.inputOffsetMs ?? 0,
      ...(settings.micClickDb !== undefined ? { clickLevel: settings.micClickDb } : {}),
    });
    if (token !== micToken || !playing || !micOn.value) return l.close();
    listener = l;
    micListening.value = true;
  } catch (e) {
    if (token === micToken) micError.value = micErrorText(e);
  }
}

function closeMic() {
  micToken++;
  evaluate(true);
  listener?.close();
  listener = null;
  loops.clear();
  micListening.value = false;
}

function collect(e: TimelineEvent, syl: Syllable | undefined) {
  const L = result.value.loop.length;
  const k = loopOf(e.bar, L);
  if (k < 0) return;
  let d = loops.get(k);
  if (!d) {
    const isStart = (e.bar - 1) % L === 0 && e.beat === 0 && e.slot === 0;
    d = { expected: [], start: e.time, partial: !isStart };
    loops.set(k, d);
    const prev = loops.get(k - 1);
    if (prev && prev.end === undefined) prev.end = e.time;
  }
  const ex = expectedSyllable(e, syl, bpm.value, L);
  if (ex) d.expected.push(ex);
  evaluate(false);
}

/** Оценивает законченные круги, для которых микрофон уже всё услышал. */
function evaluate(final: boolean) {
  const now = audioNow();
  if (!listener || now === null) return;
  const ready = listener.readyAt();
  const offsetMs = settings.inputOffsetMs ?? 0;
  for (const [k, d] of [...loops]) {
    if (d.end === undefined) continue;
    if (!final && now < d.end + offsetMs / 1000 + EVAL_MARGIN_S) continue;
    loops.delete(k);
    // круг, начавшийся до включения микрофона, не оцениваем
    if (d.partial || ready === null || ready > d.start - 0.05 || !d.expected.length) continue;
    const onsets = listener.onsets().map((o) => o.time);
    const score = scoreLoop(d.expected, onsets, offsetMs, { stressedOnly: SCORE_STRESSED_ONLY });
    micScore.value = score;
    if (k < rated.value) continue; // этот круг уже оценили кнопкой
    const before = state.value;
    rated.value = k + 1;
    lastAuto.value = { loop: k, before };
    apply(score.clean ? 'clean' : 'fail', before, 'mic');
  }
}

function onStarted() {
  playing = true;
  loops.clear();
  if (micOn.value) void openMic();
}
function onStopped() {
  playing = false;
  closeMic();
  emit('stopped');
}
watch(micOn, (on) => {
  if (on && playing) void openMic();
  if (!on) closeMic();
});
onBeforeUnmount(closeMic);

const rateHint = computed(() => {
  if (done.value > rated.value)
    return micListening.value
      ? 'Круг закончен — оцениваю по микрофону…'
      : 'Круг закончен — как прошёл?';
  if (lastAuto.value) return `${lastResult.value} Не согласен — нажми свою оценку.`;
  return lastResult.value || 'После круга оцени, как прошёл.';
});

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
  lastAuto.value = null;
  loops.clear();
  micScore.value = null;
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
      @started="onStarted"
      @stopped="onStopped"
    >
      <template v-if="mode === 'karaoke' || mode === 'memory'" #display>
        <KaraokeLine :lines="result.lines" :active="active" :memory="mode === 'memory'" />
      </template>
    </BarPlayer>

    <div class="card mic" data-testid="mic">
      <label class="row small" style="gap: 8px">
        <input v-model="micOn" type="checkbox" :disabled="!micCalibrated" /> Оценивать по микрофону
      </label>
      <p v-if="!micCalibrated" class="small mute">
        Сначала измерь задержку микрофона в
        <RouterLink to="/settings">настройках</RouterLink>.
      </p>
      <p v-else-if="micOn" class="small mute">
        Точнее в проводных наушниках. С Bluetooth-наушниками оценка не работает — их задержка
        другая.
      </p>
      <p v-if="micError" class="err" role="status">{{ micError }}</p>
      <MicResult v-if="micOn && micScore" :score="micScore" />
    </div>

    <div class="rate">
      <p class="small mute" aria-live="polite" style="margin: 0 0 6px; min-height: 1.5em">
        {{ rateHint }}
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
.mic {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}
.mic p {
  margin: 0;
}
input[type='checkbox'] {
  width: 20px;
  height: 20px;
  accent-color: var(--acc);
}
</style>
