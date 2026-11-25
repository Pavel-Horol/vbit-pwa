<script setup lang="ts">
// REQ-MIC-5: шаг «Запись на диктофон». Старт/пауза шага управляют и таймером, и записью;
// на нуле, при уходе с шага или из приложения запись сохраняется. Одна запись в день.
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { startRecorder, type DayRecorder } from '@/audio/mic/recorder';
import { onAppHidden } from '@/platform/lifecycle';
import { formatTime } from '@/lib/format';
import { micErrorText } from '@/lib/mic';
import { saveDayRecording } from '@/stores/recordings';

const props = defineProps<{ textId?: string }>();

type State = 'idle' | 'starting' | 'recording' | 'paused' | 'saving' | 'saved' | 'error';
const state = ref<State>('idle');
const error = ref('');
const savedSec = ref(0);
let rec: DayRecorder | null = null;
/** Пауза или сохранение, нажатые, пока микрофон ещё включался. */
let pending: 'pause' | 'finish' | null = null;

async function start() {
  if (state.value === 'paused' && rec) {
    rec.resume();
    state.value = 'recording';
    return;
  }
  if (state.value === 'starting' || state.value === 'recording' || state.value === 'saving') return;
  state.value = 'starting';
  error.value = '';
  pending = null;
  try {
    rec = await startRecorder();
  } catch (e) {
    error.value = micErrorText(e);
    state.value = 'error';
    return;
  }
  state.value = 'recording';
  if (pending === 'pause') stop();
  else if (pending === 'finish') void finish();
}

function stop() {
  if (state.value === 'starting') pending = 'pause';
  if (state.value !== 'recording' || !rec) return;
  rec.pause();
  state.value = 'paused';
}

async function finish() {
  if (state.value === 'starting') {
    pending = 'finish';
    return;
  }
  if ((state.value !== 'recording' && state.value !== 'paused') || !rec) return;
  const r = rec;
  rec = null;
  state.value = 'saving';
  const sec = Math.round(r.seconds());
  try {
    const blob = await r.stop();
    if (blob.size) await saveDayRecording(blob, props.textId);
    savedSec.value = sec;
    state.value = 'saved';
  } catch {
    error.value = 'Не получилось сохранить запись.';
    state.value = 'error';
  }
}

let offHidden: (() => void) | undefined;
onMounted(() => (offHidden = onAppHidden(() => void finish())));
onBeforeUnmount(() => {
  offHidden?.();
  void finish();
});

defineExpose({ start: () => void start(), stop, finish: () => void finish() });
</script>

<template>
  <div class="card rec" data-testid="record-step">
    <p v-if="state === 'idle'" class="small mute">
      Нажми «Старт» — запись пойдёт вместе с таймером. Одна запись в день: новая заменит
      сегодняшнюю.
    </p>
    <p v-else-if="state === 'starting'" class="small mute">Включаю микрофон…</p>
    <p v-else-if="state === 'recording'" role="status"><span class="dot"></span>Идёт запись</p>
    <p v-else-if="state === 'paused'" role="status">Запись на паузе</p>
    <p v-else-if="state === 'saving'" class="small mute">Сохраняю…</p>
    <p v-else-if="state === 'saved'" role="status" data-testid="record-saved">
      Запись сохранена ({{ formatTime(savedSec) }}). Сравнить с прошлой неделей —
      <RouterLink to="/progress">на экране «Прогресс»</RouterLink>.
    </p>
    <p v-else class="err" role="status">{{ error }}</p>
  </div>
</template>

<style scoped>
.rec p {
  margin: 0;
}
.dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--acc);
  margin-right: 8px;
  vertical-align: 1px;
}
@media (prefers-reduced-motion: no-preference) {
  .dot {
    animation: blink 1s steps(2) infinite;
  }
}
@keyframes blink {
  50% {
    opacity: 0.3;
  }
}
</style>
