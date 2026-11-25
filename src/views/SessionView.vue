<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import type { Bar, Text } from '@/core/types';
import { drillBar } from '@/core/patterns';
import { layout } from '@/core/layout';
import { nonEmptyLines } from '@/core/parse';
import { loopBars, withCountIn } from '@/core/timeline';
import { chime, unlockAudio } from '@/audio/engine';
import { onAppHidden } from '@/platform/lifecycle';
import { PRESETS, STEPS, WEEKS } from '@/data';
import { plainLine, plural } from '@/lib/format';
import { useSessionStore } from '@/stores/session';
import { useSettingsStore } from '@/stores/settings';
import { useProgressStore } from '@/stores/progress';
import { useTextsStore } from '@/stores/texts';
import { defaultText } from '@/stores/schema';
import BarPlayer from '@/components/BarPlayer.vue';
import LineDrill from '@/components/LineDrill.vue';
import BreathTimer from '@/components/BreathTimer.vue';
import CountRecord from '@/components/CountRecord.vue';
import StepTimer from '@/components/StepTimer.vue';

const session = useSessionStore();
const settings = useSettingsStore();
const progress = useProgressStore();
const texts = useTextsStore();

const done = computed(() => session.index >= STEPS.length);
const step = computed(() => STEPS[session.index]);
const weekBpm = computed(() => WEEKS[settings.week - 1]!.bpm);
const running = ref(false);
/** BarPlayer или LineDrill (шаг mytext) — у обоих start/stop. */
const player = ref<{ start: () => void; stop: () => void } | null>(null);

// --- REQ-SES-5: шаг mytext — LineDrill по строке с наименьшей ступенью текущего текста ---
// Без своего текста — пример «Шла Саша» (прогресс примера не сохраняется).
const sample = PRESETS[1]!;
const sampleText = reactive<Text>({
  ...defaultText(),
  id: 'sample',
  title: sample.name,
  raw: sample.raw,
  mode: sample.mode,
  perBeat: sample.perBeat,
});
const drillText = computed<Text>(() => (texts.isOwn ? texts.current : sampleText));

// --- ритм-шаги (REQ-SES-2) ---
const barsOf = (raw: string, mode: 'manual' | 'auto', perBeat: 1 | 2 | 3 | 4) =>
  layout({ raw, mode, perBeat, lineStartsBar: true, stressOverrides: {} }).bars;

const rhythm = computed<{ getBar: (i: number) => Bar; bpm: number; tickMultiplier: number } | null>(
  () => {
    const kind = step.value?.kind;
    const wb = weekBpm.value;
    if (kind === 'drill') {
      return {
        getBar: (i) => drillBar('auto', 'taka', i, Math.random),
        bpm: wb,
        tickMultiplier: settings.week <= 2 ? 1 : 0,
      };
    }
    if (kind === 'karl') {
      const p = PRESETS[0]!;
      return {
        getBar: withCountIn(loopBars(barsOf(p.raw, p.mode as 'manual', p.perBeat))),
        bpm: wb,
        tickMultiplier: 1,
      };
    }
    return null;
  },
);
const playerBpm = ref(75);

const firstLine = computed(() => {
  const t = texts.current;
  const line = nonEmptyLines(t.raw)[0];
  return line ? plainLine(line, t.mode) : '';
});

// --- таймер шага ---
let timer: ReturnType<typeof setInterval> | undefined;
function stopTimer() {
  clearInterval(timer);
  timer = undefined;
  running.value = false;
  player.value?.stop();
}

function show(i: number) {
  stopTimer();
  session.index = i;
  const st = STEPS[i];
  if (!st) return finish();
  session.left = st.durationSec;
  if (rhythm.value) playerBpm.value = rhythm.value.bpm;
}

function finish() {
  stopTimer();
  session.index = STEPS.length;
  if (!session.finished) {
    progress.finishSession();
    session.finished = true;
  }
}

function start() {
  running.value = true;
  unlockAudio();
  player.value?.start();
  timer = setInterval(() => {
    session.left--;
    if (session.left <= 0) {
      stopTimer();
      chime();
    }
  }, 1000);
}

function toggle() {
  if (done.value) {
    session.finished = false;
    return show(0);
  }
  if (session.left <= 0) return show(session.index + 1);
  if (running.value) stopTimer();
  else start();
}

const next = () => show(session.index + 1);
const prev = () => show(done.value ? STEPS.length - 1 : Math.max(0, session.index - 1));

const playLabel = computed(() => {
  if (done.value) return 'Пройти ещё раз';
  if (session.left <= 0) return 'Дальше';
  if (running.value) return 'Пауза';
  return session.left < (step.value?.durationSec ?? 0) ? 'Продолжить' : 'Старт';
});

// Плеер остановился сам (скрыли вкладку, запустили другой плеер) — пауза шага.
const onPlayerStopped = () => {
  if (running.value) stopTimer();
};
// REQ-AUD-8: вкладка скрыта → пауза таймера.
// REQ-AUD-8: приложение ушло в фон — пауза таймера шага.
let offHidden: (() => void) | undefined;
onMounted(() => {
  offHidden = onAppHidden(() => {
    if (running.value) stopTimer();
  });
  if (rhythm.value) playerBpm.value = rhythm.value.bpm;
});
onBeforeUnmount(() => {
  offHidden?.();
  stopTimer();
});

const streakText = computed(
  () => `${progress.streak} ${plural(progress.streak, 'день', 'дня', 'дней')}`,
);
const progressPct = computed(() => (Math.min(session.index, STEPS.length) / STEPS.length) * 100);
</script>

<template>
  <section aria-labelledby="title">
    <div class="row" style="justify-content: space-between">
      <span class="small mute">{{ done ? 'Готово' : step?.block }}</span>
      <span v-if="!done" class="small mute" data-testid="step-count">
        {{ session.index + 1 }} из {{ STEPS.length }}
      </span>
    </div>
    <div class="bar" aria-hidden="true"><i :style="{ width: progressPct + '%' }"></i></div>

    <template v-if="done">
      <h2 id="title">Тренировка закончена</h2>
      <div class="big" data-testid="streak">{{ streakText }}</div>
      <div class="mute">
        <p>Столько дней подряд ты тренируешься. Завтра — снова 15–20 минут.</p>
      </div>
    </template>

    <template v-else-if="step">
      <h2 id="title">{{ step.title }}</h2>
      <StepTimer :left="session.left" done-text="Готово" />
      <div class="mute">
        <p>{{ step.body }}</p>
        <ul v-if="step.list" class="tw">
          <li v-for="x in step.list" :key="x">{{ x }}</li>
        </ul>
      </div>
      <div class="sp"></div>
      <div :key="session.index">
        <BreathTimer v-if="step.kind === 'breath'" />
        <CountRecord v-else-if="step.kind === 'count'" />
        <div v-else-if="step.kind === 'ends' && firstLine" class="card">
          <p class="small mute" style="margin: 0 0 4px">Твоя строка</p>
          <p style="margin: 0; font-size: 18px">{{ firstLine }}</p>
        </div>
        <template v-else-if="step.kind === 'mytext'">
          <p v-if="!texts.isOwn" class="small mute">
            Свой куплет ещё не добавлен — пока тренируем пример. Добавь текст во вкладке «Тексты».
          </p>
          <LineDrill
            ref="player"
            :key="drillText.id"
            :text="drillText"
            :own-start="false"
            @stopped="onPlayerStopped"
          />
        </template>
        <template v-else-if="rhythm">
          <BarPlayer
            ref="player"
            v-model:bpm="playerBpm"
            :get-bar="rhythm.getBar"
            :own-start="false"
            :tick-multiplier="rhythm.tickMultiplier"
            ticks-off-hint="выкл. с 3-й недели"
            @stopped="onPlayerStopped"
          />
        </template>
      </div>
    </template>

    <div class="sp"></div>
    <div class="row">
      <button type="button" :disabled="session.index === 0" @click="prev">Назад</button>
      <button type="button" class="pri grow" @click="toggle">{{ playLabel }}</button>
      <button type="button" :disabled="done" @click="next">Дальше</button>
    </div>
  </section>
</template>

<style scoped>
.grow {
  flex: 1;
}
.bar {
  height: 6px;
  background: var(--pan2);
  border-radius: 3px;
  overflow: hidden;
  margin: 8px 0 18px;
}
.bar i {
  display: block;
  height: 100%;
  background: var(--acc);
  width: 0;
  transition: width 0.3s;
}
.big {
  font-family: var(--font-head);
  font-size: clamp(44px, 14vw, 72px);
  line-height: 1;
  margin: 14px 0;
}
ul.tw {
  margin: 8px 0 0;
  padding-left: 20px;
  color: var(--ink);
}
ul.tw li {
  margin: 4px 0;
}
</style>
