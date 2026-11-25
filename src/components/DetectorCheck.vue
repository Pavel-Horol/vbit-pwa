<script setup lang="ts">
// REQ-MIC-6: запись для проверки детектора. Метроном играет текст по кругу, микрофон пишется
// без обработки; на выходе WAV с метаданными (щелчки, ожидаемые слоги) для разметки в Audacity.
import { computed, onBeforeUnmount, ref } from 'vue';
import type { Bar, LadderStage, Text, TimelineEvent } from '@/core/types';
import { drillLayout, mixForStage } from '@/core/ladder';
import { expectedSyllable, type Expected } from '@/core/micScore';
import { loopBars, withCountIn } from '@/core/timeline';
import { encodeWav } from '@/core/wav';
import { barAt, onScheduled, play, stop, unlockAudio } from '@/audio/engine';
import { openCapture, type Capture } from '@/audio/mic/capture';
import { PRESETS } from '@/data';
import { micErrorText } from '@/lib/mic';
import { saveBinaryFile } from '@/platform/saveFile';
import { defaultText } from '@/stores/schema';
import { useSettingsStore } from '@/stores/settings';
import { useTextsStore } from '@/stores/texts';
import ChipGroup from './ChipGroup.vue';

const settings = useSettingsStore();
const texts = useTextsStore();

const DURATION_S = 25;
const sources = computed<[string, string][]>(() => [
  ...PRESETS.map((p, i): [string, string] => [String(i), p.name]),
  ...(texts.isOwn ? [['own', `Текущий текст: ${texts.current.title}`] as [string, string]] : []),
]);
const source = ref('0');
const bpm = ref(75);
const stage = ref<LadderStage>(2);
const stageOptions: [LadderStage, string][] = [
  [2, 'с тиками слогов'],
  [4, 'только доли и ударные'],
  [5, 'только доли'],
];

const text = computed<Text>(() => {
  if (source.value === 'own') return texts.current;
  const p = PRESETS[Number(source.value)] ?? PRESETS[0]!;
  return { ...defaultText(), raw: p.raw, mode: p.mode, perBeat: p.perBeat, title: p.name };
});

type State = 'idle' | 'starting' | 'recording' | 'ready' | 'error';
const state = ref<State>('idle');
const error = ref('');
const left = ref(0);
const wav = ref<{ name: string; bytes: Uint8Array } | null>(null);

let capture: Capture | null = null;
let offScheduled: (() => void) | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let blocks: { time: number; samples: Float32Array }[] = [];
let events: TimelineEvent[] = [];
let expected: Expected[] = [];

function cleanup() {
  clearInterval(timer);
  offScheduled?.();
  offScheduled = null;
  capture?.close();
  capture = null;
}

async function start() {
  stop();
  cleanup();
  unlockAudio(); // REQ-AUD-6: в обработчике жеста
  state.value = 'starting';
  error.value = '';
  wav.value = null;
  blocks = [];
  events = [];
  expected = [];
  try {
    capture = await openCapture((samples, time) => blocks.push({ time, samples }));
  } catch (e) {
    error.value = micErrorText(e);
    state.value = 'error';
    return;
  }
  const r = drillLayout(text.value, 0, Infinity);
  const getBar: (i: number) => Bar = withCountIn(loopBars(r.loop), r.pickup);
  const loopLen = r.loop.length;
  offScheduled = onScheduled((e) => {
    events.push(e);
    const ex = expectedSyllable(e, barAt(e.bar)?.[e.beat]?.syllables[e.slot], bpm.value, loopLen);
    if (ex) expected.push(ex);
  });
  play({
    getBar,
    bpm: () => bpm.value,
    mix: () => mixForStage(stage.value, settings.tickVolume),
    timing: () => ({ leadMs: settings.leadMs, outputOffsetMs: settings.outputOffsetMs }),
    onEvent: () => {},
    onStop: () => void finish(),
  });
  state.value = 'recording';
  left.value = DURATION_S;
  timer = setInterval(() => {
    if (--left.value <= 0) stop();
  }, 1000);
}

function finish() {
  if (state.value !== 'recording') return;
  const cap = capture;
  const got = blocks;
  cleanup();
  if (!cap || !got.length) {
    error.value = 'Микрофон ничего не записал.';
    state.value = 'error';
    return;
  }
  const sr = cap.sampleRate;
  const t0 = got[0]!.time;
  const end = got[got.length - 1]!;
  const out = new Float32Array(Math.round((end.time - t0) * sr) + end.samples.length);
  // пачки кладём по их времени: если какая-то потерялась, на её месте будет тишина
  for (const b of got)
    out.set(
      b.samples.subarray(0, out.length - Math.round((b.time - t0) * sr)),
      Math.round((b.time - t0) * sr),
    );
  const rel = (t: number) => Math.round((t - t0) * 1e6) / 1e6;
  const meta = {
    app: 'vbit',
    kind: 'mic-check',
    version: 1,
    sampleRate: sr,
    bpm: bpm.value,
    stage: stage.value,
    text: text.value.title,
    inputOffsetMs: settings.inputOffsetMs ?? null,
    micClickDb: settings.micClickDb ?? null,
    clicks: events
      .filter((e) => e.kind !== 'rest' && e.gain > 0)
      .map((e) => ({
        t: rel(e.time),
        kind: e.kind,
        gain: e.gain,
        bar: e.bar,
        beat: e.beat,
        slot: e.slot,
      })),
    expected: expected.map((e) => ({ ...e, time: rel(e.time) })),
  };
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  wav.value = {
    name: `vbit-check-${stamp}-${bpm.value}bpm.wav`,
    bytes: encodeWav(out, sr, JSON.stringify(meta)),
  };
  state.value = 'ready';
}

const saveError = ref('');
async function save() {
  if (!wav.value) return;
  saveError.value = '';
  try {
    await saveBinaryFile(wav.value.name, wav.value.bytes, 'audio/wav');
  } catch {
    saveError.value = 'Не получилось сохранить файл.';
  }
}

onBeforeUnmount(() => {
  if (state.value === 'recording') stop();
  cleanup();
});
</script>

<template>
  <details class="card block" data-testid="detector-check">
    <summary><h3>Проверка детектора</h3></summary>
    <p class="small mute" style="margin: 0">
      Для настройки оценки по микрофону. Прочитай текст под метроном {{ DURATION_S }} секунд —
      получится WAV-файл. Его размечают в Audacity: метка в начале гласной каждого слога.
    </p>
    <label class="small mute" for="dc-source">Текст</label>
    <select id="dc-source" v-model="source" :disabled="state === 'recording'">
      <option v-for="[v, l] in sources" :key="v" :value="v">{{ l }}</option>
    </select>
    <label class="slider small mute">
      <span>Темп</span>
      <span class="val">{{ bpm }} BPM</span>
      <input v-model.number="bpm" type="range" min="60" max="120" step="5" />
    </label>
    <ChipGroup v-model="stage" :options="stageOptions" label="Звук метронома" />
    <p v-if="state === 'starting'" class="small mute">Включаю микрофон…</p>
    <p v-if="state === 'recording'" class="small" role="status">Запись · осталось {{ left }} с</p>
    <p v-if="error" class="err" role="status">{{ error }}</p>
    <div class="row">
      <button v-if="state !== 'recording'" type="button" class="pri" @click="start">
        {{ state === 'ready' ? 'Записать ещё' : 'Записать' }}
      </button>
      <button v-else type="button" @click="stop()">Закончить раньше</button>
      <button v-if="wav && state !== 'recording'" type="button" @click="save">Сохранить WAV</button>
    </div>
    <p v-if="wav && state === 'ready'" class="small mute" style="margin: 0">{{ wav.name }}</p>
    <p v-if="saveError" class="err" role="status">{{ saveError }}</p>
  </details>
</template>

<style scoped>
summary {
  cursor: pointer;
  min-height: 44px;
  display: flex;
  align-items: center;
}
summary h3 {
  display: inline;
  margin: 0;
}
details[open] {
  display: grid;
  gap: 10px;
}
select {
  min-height: 44px;
  padding: 0 10px;
}
.slider {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  column-gap: 8px;
}
.slider input {
  grid-column: 1 / -1;
  width: 100%;
}
</style>
