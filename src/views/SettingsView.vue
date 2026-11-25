<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { CAL_CLICKS, CAL_IGNORE_TAPS, calibrationOffset } from '@/core/calibration';
import { startCalibration, type Calibration } from '@/audio/calibrate';
import { calibrateMic, type MicCalibrationRun } from '@/audio/mic/calibrate';
import { MIC_CAL_CLICKS } from '@/core/micScore';
import { micErrorText } from '@/lib/mic';
import { exportData, parseImport, type RootData } from '@/stores/schema';
import { applyRoot, snapshotRoot } from '@/stores/persist';
import { useProgressStore } from '@/stores/progress';
import { useSettingsStore } from '@/stores/settings';
import TickVolume from '@/components/TickVolume.vue';
import DetectorCheck from '@/components/DetectorCheck.vue';
import { isNative } from '@/platform/native';
import { saveTextFile } from '@/platform/saveFile';

const settings = useSettingsStore();
const progress = useProgressStore();

// --- REQ-CAL: калибровка вывода ---
type CalState = 'idle' | 'running' | 'done' | 'failed';
const cal = ref<CalState>('idle');
const taps = ref<number[]>([]);
const latencyHint = ref<number | undefined>();
let session: Calibration | null = null;

function startCal() {
  session?.cancel();
  taps.value = [];
  cal.value = 'running';
  session = startCalibration(finishCal);
  latencyHint.value = session.outputLatencyMs;
}
function onTap(e: PointerEvent) {
  if (cal.value !== 'running' || !session) return;
  taps.value.push(session.tapTime(e));
}
function finishCal() {
  if (!session) return;
  const offset = calibrationOffset(session.clicks, taps.value);
  session = null;
  if (offset === null) {
    cal.value = 'failed';
    return;
  }
  settings.outputOffsetMs = offset;
  cal.value = 'done';
}
function resetCal() {
  session?.cancel();
  session = null;
  settings.outputOffsetMs = 0;
  cal.value = 'idle';
}
onBeforeUnmount(() => session?.cancel());

// --- REQ-MIC-3: калибровка микрофона ---
type MicCalState = 'idle' | 'running' | 'done' | 'failed';
const mic = ref<MicCalState>('idle');
const micMsg = ref('');
let micRun: MicCalibrationRun | null = null;

async function startMicCal() {
  micRun?.cancel();
  mic.value = 'running';
  micMsg.value = '';
  const run = calibrateMic();
  micRun = run;
  try {
    const r = await run.result;
    if (micRun !== run) return;
    if (r.ok) {
      settings.inputOffsetMs = r.offsetMs;
      settings.micClickDb = r.clickLevel;
      micMsg.value = `Готово: задержка ${r.offsetMs} мс, услышано щелчков — ${r.found} из ${MIC_CAL_CLICKS}.`;
      mic.value = 'done';
    } else {
      micMsg.value =
        r.error === 'not_heard'
          ? `Микрофон услышал только ${r.found} из ${MIC_CAL_CLICKS} щелчков. Сними наушники, сделай звук громче и повтори в тишине.`
          : 'Замер получился неровным. Повтори в тишине и не двигай телефон.';
      mic.value = 'failed';
    }
  } catch (e) {
    if (micRun !== run) return;
    micMsg.value = micErrorText(e);
    mic.value = 'failed';
  } finally {
    if (micRun === run) micRun = null;
  }
}
function resetMicCal() {
  micRun?.cancel();
  micRun = null;
  settings.inputOffsetMs = undefined;
  settings.micClickDb = undefined;
  settings.micScoring = false;
  mic.value = 'idle';
  micMsg.value = '';
}
onBeforeUnmount(() => micRun?.cancel());

// --- REQ-DATA-3: экспорт / импорт ---
// В APK файл уходит в системное меню «Поделиться» (этап 3).
const exportLabel = isNative() ? 'Сохранить копию' : 'Скачать копию';
const exportError = ref('');
async function download() {
  exportError.value = '';
  const name = `v-bit-${new Date().toISOString().slice(0, 10)}.json`;
  try {
    await saveTextFile(name, exportData(snapshotRoot()), 'application/json');
  } catch {
    exportError.value = 'Не получилось сохранить файл. Попробуй ещё раз.';
  }
}

const pendingImport = ref<{ name: string; root: RootData } | null>(null);
const importError = ref('');
const importDone = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
async function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  importError.value = '';
  importDone.value = false;
  if (!file) return;
  const r = parseImport(await file.text());
  if (!r.ok) {
    importError.value =
      r.error === 'not_json'
        ? `Это не JSON-файл. Выбери файл, который сохранил кнопкой «${exportLabel}».`
        : 'В файле нет данных «В бит».';
    return;
  }
  pendingImport.value = { name: file.name, root: r.root };
}
function confirmImport() {
  if (!pendingImport.value) return;
  const root = pendingImport.value.root;
  // аудиозаписи (этап 4) в файл не входят — оставляем те, что на устройстве
  if (progress.recordings) root.progress.recordings = progress.recordings;
  applyRoot(root);
  pendingImport.value = null;
  importDone.value = true;
}
</script>

<template>
  <section aria-labelledby="title">
    <RouterLink class="btn back" to="/">← Главная</RouterLink>
    <h2 id="title">Настройки</h2>

    <div class="card block">
      <h3>Звук и подсветка</h3>
      <TickVolume />
      <label class="slider small mute">
        <span>Упреждение подсветки</span>
        <span class="val">{{ settings.leadMs }} мс</span>
        <input v-model.number="settings.leadMs" type="range" min="0" max="150" step="5" />
      </label>
      <p class="small mute" style="margin: 0">
        Ячейка загорается чуть раньше щелчка, чтобы глаз успел. Больше — раньше.
      </p>
    </div>

    <div class="card block" data-testid="calibration">
      <h3>Калибровка звука</h3>
      <p class="small mute" style="margin: 0">
        Наушники и динамики отдают звук с задержкой — из-за неё подсветка может спешить. Прозвучат
        {{ CAL_CLICKS }} щелчков: тапай по большой кнопке ровно в такт. Первые
        {{ CAL_IGNORE_TAPS }} тапа не считаются.
      </p>
      <p style="margin: 0">
        Задержка звука: <b data-testid="output-offset">{{ settings.outputOffsetMs }} мс</b>
      </p>
      <p v-if="latencyHint !== undefined" class="small mute" style="margin: 0">
        Система сообщает задержку вывода около {{ latencyHint }} мс — это только подсказка, к
        калибровке не прибавляется.
      </p>
      <button v-if="cal === 'running'" type="button" class="pri tap" @pointerdown.prevent="onTap">
        Тап · {{ taps.length }}
      </button>
      <p v-if="cal === 'done'" class="small" role="status">
        Готово: задержка {{ settings.outputOffsetMs }} мс. Можно повторить для точности.
      </p>
      <p v-if="cal === 'failed'" class="err" role="status">
        Слишком мало тапов — попробуй ещё раз и тапай до последнего щелчка.
      </p>
      <div v-if="cal !== 'running'" class="row">
        <button type="button" class="pri" @click="startCal">
          {{ cal === 'idle' ? 'Начать калибровку' : 'Повторить' }}
        </button>
        <button type="button" :disabled="settings.outputOffsetMs === 0" @click="resetCal">
          Сбросить
        </button>
      </div>
    </div>

    <div class="card block" data-testid="mic-calibration">
      <h3>Калибровка микрофона</h3>
      <p class="small mute" style="margin: 0">
        Нужна, чтобы приложение оценивало круги по голосу. Сними наушники и сделай звук погромче:
        прозвучат {{ MIC_CAL_CLICKS }} щелчков, микрофон их услышит. Во время замера помолчи.
      </p>
      <p style="margin: 0">
        Задержка микрофона:
        <b data-testid="input-offset">{{
          settings.inputOffsetMs === undefined ? 'не измерена' : `${settings.inputOffsetMs} мс`
        }}</b>
      </p>
      <p v-if="mic === 'running'" class="small" role="status">Слушаю щелчки…</p>
      <p v-if="mic === 'done'" class="small" role="status">{{ micMsg }}</p>
      <p v-if="mic === 'failed'" class="err" role="status">{{ micMsg }}</p>
      <div v-if="mic !== 'running'" class="row">
        <button type="button" class="pri" @click="startMicCal">
          {{ settings.inputOffsetMs === undefined ? 'Измерить' : 'Измерить заново' }}
        </button>
        <button type="button" :disabled="settings.inputOffsetMs === undefined" @click="resetMicCal">
          Сбросить
        </button>
      </div>
    </div>

    <DetectorCheck />

    <div class="card block">
      <h3>Данные</h3>
      <p class="small mute" style="margin: 0">
        Тексты, прогресс и настройки одним файлом — для переноса на другой телефон или на всякий
        случай. Аудиозаписи в файл не входят.
      </p>
      <div class="row">
        <button type="button" @click="download">{{ exportLabel }}</button>
        <button type="button" @click="fileInput?.click()">Загрузить из файла</button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          hidden
          data-testid="import-file"
          @change="onFile"
        />
      </div>
      <p v-if="isNative()" class="small mute" style="margin: 0">
        Откроется меню «Поделиться» — выбери Диск, Файлы или мессенджер.
      </p>
      <p v-if="exportError" class="err" role="status">{{ exportError }}</p>
      <p v-if="importError" class="err" role="status">{{ importError }}</p>
      <p v-if="importDone" class="small" role="status">Данные загружены.</p>
      <div
        v-if="pendingImport"
        class="card confirm"
        role="alertdialog"
        aria-labelledby="import-title"
      >
        <p id="import-title" style="margin: 0 0 10px">
          Все тексты, прогресс и настройки заменятся данными из файла «{{ pendingImport.name }}».
          Заменить?
        </p>
        <div class="row">
          <button type="button" class="pri" @click="confirmImport">Заменить</button>
          <button type="button" @click="pendingImport = null">Отмена</button>
        </div>
      </div>
    </div>

    <div class="card block">
      <h3>О приложении</h3>
      <p class="small mute" style="margin: 0">
        Словарь ударений построен на данных
        <a href="https://en.openrussian.org" target="_blank" rel="noopener">OpenRussian.org</a>
        (лицензия
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener"
          >CC BY-SA 4.0</a
        >). Файл словаря распространяется на тех же условиях.
      </p>
    </div>
  </section>
</template>

<style scoped>
h2 {
  margin-bottom: 16px;
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
.block {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
}
.val {
  min-width: 56px;
  text-align: right;
}
.tap {
  min-height: 120px;
  font-size: 22px;
  touch-action: manipulation;
  user-select: none;
}
.confirm {
  border-color: var(--acc);
}
</style>
