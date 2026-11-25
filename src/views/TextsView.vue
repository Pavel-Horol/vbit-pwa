<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Bar, LayoutMode, Warning } from '@/core/types';
import { layout } from '@/core/layout';
import { loopBars, withCountIn } from '@/core/timeline';
import { PRESETS, type Preset } from '@/data';
import { plural } from '@/lib/format';
import { useTextsStore } from '@/stores/texts';
import BarPlayer from '@/components/BarPlayer.vue';
import ChipGroup from '@/components/ChipGroup.vue';

const store = useTextsStore();
const text = computed(() => store.current);

const modes: [LayoutMode, string][] = [
  ['manual', 'Разметка'],
  ['auto', 'Авто'],
];
const perBeatOptions: [1 | 2 | 3 | 4, string][] = [
  [1, '1'],
  [2, '2'],
  [3, '3'],
  [4, '4'],
];
const HELP: Record<string, string> = {
  manual:
    'Ставь | между долями. Первый слог после | падает на щелчок — ударный пиши заглавными. Слоги внутри доли — через пробел или дефис. _ — пауза.',
  auto: 'Вставь текст: приложение само делит его на слоги и кладёт по N на каждый щелчок. Деление примерное — если флоу не тот, переключись на разметку.',
};
const WARN: Record<Warning['code'], string> = {
  no_beat_separators: 'не вижу «|» — вся строка идёт одной долей.',
  digits_removed: 'цифры убраны — напиши числа словами.',
  no_stress: 'не нашёл ударных слогов.',
  pickup_shifted: 'затакт сдвинул строку на долю.',
};

const mode = computed({
  get: () => text.value.mode,
  set: (v: LayoutMode) => store.update({ mode: v }),
});
const perBeat = computed({
  get: () => text.value.perBeat,
  set: (v: 1 | 2 | 3 | 4) => store.update({ perBeat: v }),
});
const lineStartsBar = computed({
  get: () => text.value.lineStartsBar,
  set: (v: boolean) => store.update({ lineStartsBar: v }),
});
const raw = computed({
  get: () => text.value.raw,
  set: (v: string) => store.update({ raw: v }),
});
const bpm = computed({
  get: () => text.value.targetBpm,
  set: (v: number) => store.update({ targetBpm: v }),
});

const result = computed(() => layout(text.value));
const getBar = computed(() => withCountIn(loopBars(result.value.bars)));

const beatLabel = (b: Bar[number]) =>
  b.syllables.every((s) => s.text === '') ? '—' : b.syllables.map((s) => s.text || '·').join(' ');

const player = ref<InstanceType<typeof BarPlayer> | null>(null);
watch([mode, perBeat, lineStartsBar], () => player.value?.refresh());

// Примеры: если в поле свой текст — сначала спрашиваем (без confirm()).
const presetIndex = ref('');
const pending = ref<Preset | null>(null);
function applyPreset(p: Preset) {
  store.update({ mode: p.mode, perBeat: p.perBeat, raw: p.raw });
  pending.value = null;
  player.value?.refresh();
}
watch(presetIndex, (v) => {
  if (v === '') return;
  const p = PRESETS[+v];
  presetIndex.value = '';
  if (!p) return;
  if (store.isOwn) pending.value = p;
  else applyPreset(p);
});
</script>

<template>
  <section aria-labelledby="title">
    <h2 id="title">Мой текст в бит</h2>
    <ChipGroup v-model="mode" :options="modes" label="Режим раскладки" style="margin-top: 12px" />
    <p class="small mute">{{ HELP[mode] ?? HELP.auto }}</p>
    <textarea v-model="raw" aria-label="Текст для читки" spellcheck="false"></textarea>
    <div v-if="mode === 'auto'" class="row" style="margin-top: 10px">
      <span class="small mute">Слогов на долю:</span>
      <ChipGroup v-model="perBeat" :options="perBeatOptions" label="Слогов на долю" />
    </div>
    <label class="row small mute" style="gap: 8px; margin-top: 10px">
      <input v-model="lineStartsBar" type="checkbox" /> Каждая строка с нового такта
    </label>
    <div class="row" style="margin-top: 10px">
      <label for="preset" class="small mute">Загрузить пример</label>
      <select id="preset" v-model="presetIndex" style="flex: 1">
        <option value="">—</option>
        <option v-for="(p, i) in PRESETS" :key="i" :value="String(i)">{{ p.name }}</option>
      </select>
    </div>
    <div v-if="pending" class="card confirm" role="alertdialog" aria-labelledby="confirm-title">
      <p id="confirm-title" style="margin: 0 0 10px">
        Твой текст заменится примером «{{ pending.name }}». Заменить?
      </p>
      <div class="row">
        <button type="button" class="pri" @click="applyPreset(pending)">Заменить</button>
        <button type="button" @click="pending = null">Оставить мой текст</button>
      </div>
    </div>

    <div class="sp"></div>
    <div class="card prev" data-testid="layout-preview">
      <p v-for="(w, i) in result.warnings" :key="i" class="err" style="margin: 0 0 6px">
        Строка {{ w.line + 1 }}: {{ WARN[w.code] }}
      </p>
      <template v-if="result.bars.length">
        <p class="small mute" style="margin: 0 0 6px">
          Раскладка: {{ result.bars.length }}
          {{ plural(result.bars.length, 'такт', 'такта', 'тактов') }} · блок = одна доля · перед
          текстом отсчёт 1-2-3-4
        </p>
        <div v-for="(bar, i) in result.bars" :key="i" data-testid="preview-bar">
          <span v-for="(b, j) in bar" :key="j" data-testid="preview-beat">{{ beatLabel(b) }}</span>
        </div>
      </template>
      <p v-else class="small mute" style="margin: 0">
        Впиши текст — здесь появится раскладка по долям.
      </p>
    </div>
    <div class="sp"></div>
    <BarPlayer ref="player" v-model:bpm="bpm" :get-bar="getBar" tap />
  </section>
</template>

<style scoped>
textarea {
  width: 100%;
  min-height: 150px;
  background: var(--pan2);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px;
  font-size: 16px;
  line-height: 1.5;
  resize: vertical;
}
select {
  min-height: 44px;
  background: var(--pan2);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0 10px;
  font-size: 16px;
}
input[type='checkbox'] {
  width: 20px;
  height: 20px;
  accent-color: var(--acc);
}
.confirm {
  margin-top: 10px;
  border-color: var(--acc);
}
.prev {
  font-size: 14px;
  line-height: 1.8;
}
.prev div {
  margin: 2px 0;
}
.prev span {
  display: inline-block;
  padding: 0 7px;
  margin: 2px;
  border-radius: 6px;
  background: var(--pan2);
}
.err {
  color: var(--err);
  font-size: 13px;
}
</style>
