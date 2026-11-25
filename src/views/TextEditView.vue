<script setup lang="ts">
// REQ-TXT-1: редактор текста — режим, превью раскладки (REQ-STR-7: тап правит ударение),
// «В разметку» (REQ-LAY-5), плеер, «Разобрать строку» → LineDrill.
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Bar, LayoutMode, Syllable, Warning } from '@/core/types';
import { layout } from '@/core/layout';
import { serializeManual } from '@/core/parse';
import { needsStressCheck, toggleStress, wordKey } from '@/core/stress';
import { loopBars, loopWithPickup, withCountIn } from '@/core/timeline';
import { PRESETS, type Preset } from '@/data';
import { plural } from '@/lib/format';
import { ensureStressDict, stressDict } from '@/lib/stressDict';
import { updateText, useTextsStore } from '@/stores/texts';
import BarPlayer from '@/components/BarPlayer.vue';
import ChipGroup from '@/components/ChipGroup.vue';

const route = useRoute();
const router = useRouter();
const store = useTextsStore();

const text = computed(() => store.byId(String(route.params.id)) ?? store.current);
onMounted(() => {
  store.open(text.value.id);
  void ensureStressDict();
});
const update = (patch: Parameters<typeof updateText>[1]) => updateText(text.value, patch);

const modes: [LayoutMode, string][] = [
  ['manual', 'Разметка'],
  ['auto', 'Авто'],
  ['stress', 'По ударениям'],
];
const perBeatOptions: [1 | 2 | 3 | 4, string][] = [
  [1, '1'],
  [2, '2'],
  [3, '3'],
  [4, '4'],
];
const HELP: Record<LayoutMode, string> = {
  manual:
    'Ставь | между долями. Первый слог после | падает на щелчок — ударный пиши заглавными. Слоги внутри доли — через пробел или дефис. _ — пауза. > в начале строки — затакт: слоги до первой | звучат перед щелчком.',
  auto: 'Вставь текст: приложение само делит его на слоги и кладёт по N на каждый щелчок. Деление примерное — если флоу не тот, переключись на разметку.',
  stress:
    'Приложение ставит ударения по словарю: каждый ударный слог падает на щелчок, безударные делят долю. Слоги до первого ударного — затакт. Тапни по слогу в раскладке, чтобы поправить ударение.',
};
const WARN: Record<Warning['code'], string> = {
  no_beat_separators: 'не вижу «|» — вся строка идёт одной долей.',
  digits_removed: 'цифры убраны — напиши числа словами.',
  no_stress: 'не нашёл ударных слогов — раскладываю по 2 слога на долю.',
  pickup_shifted: 'затакт сдвинул строку на долю.',
};

const field = <K extends 'title' | 'mode' | 'perBeat' | 'lineStartsBar' | 'raw' | 'targetBpm'>(
  key: K,
) =>
  computed({
    get: () => text.value[key],
    set: (v) => update({ [key]: v }),
  });
const title = field('title');
const mode = field('mode');
const perBeat = field('perBeat');
const lineStartsBar = field('lineStartsBar');
const raw = field('raw');
const bpm = field('targetBpm');

const result = computed(() => layout(text.value, stressDict.value));
const getBar = computed(() =>
  withCountIn(
    loopBars(loopWithPickup(result.value.bars, result.value.pickup)),
    result.value.pickup,
  ),
);

// --- превью: слова, «проверь ударение», тап по слогу ---
type WordInfo = { key: string; index: number; word: Syllable[] };
const words = computed(() => {
  const map = new Map<Syllable, WordInfo>();
  for (const line of result.value.lines) {
    const byWord = new Map<number, Syllable[]>();
    for (const s of line.syllables) byWord.set(s.wordId, [...(byWord.get(s.wordId) ?? []), s]);
    for (const word of byWord.values()) {
      const key = wordKey(word);
      word.forEach((s, index) => map.set(s, { key, index, word }));
    }
  }
  return map;
});
const unsure = (s: Syllable) => {
  const w = words.value.get(s);
  return !!w && needsStressCheck(w.word);
};
const hasUnsure = computed(() => [...words.value.keys()].some(unsure));

function tapSyllable(s: Syllable) {
  const w = words.value.get(s);
  if (!w) return;
  const t = text.value;
  const rest = { ...t.stressOverrides };
  delete rest[w.key];
  const plain = layout({ ...t, stressOverrides: rest }, stressDict.value);
  const autoWord = plain.lines.flatMap((l) => l.syllables).filter((x) => x.wordId === s.wordId);
  const auto = autoWord.findIndex((x) => x.stressed);
  const current = w.word.findIndex((x) => x.stressed);
  update({ stressOverrides: toggleStress(t.stressOverrides, w.key, w.index, current, auto) });
}

const sylLabel = (s: Syllable) => {
  if (s.text === '') return 'пауза';
  const w = words.value.get(s);
  return `${s.text}${s.stressed ? ', ударный' : ''}${w && needsStressCheck(w.word) ? ', проверь ударение' : ''}`;
};
const isPauseBeat = (b: Bar[number]) => b.syllables.every((s) => s.text === '');

const player = ref<InstanceType<typeof BarPlayer> | null>(null);
watch([mode, perBeat, lineStartsBar], () => player.value?.refresh());

// --- примеры: если в поле свой текст — сначала спрашиваем (без confirm()) ---
const presetIndex = ref('');
const pending = ref<Preset | null>(null);
function applyPreset(p: Preset) {
  update({ mode: p.mode, perBeat: p.perBeat, raw: p.raw });
  pending.value = null;
  player.value?.refresh();
}
watch(presetIndex, (v) => {
  if (v === '') return;
  const p = PRESETS[+v];
  presetIndex.value = '';
  if (!p) return;
  const own = text.value.raw.trim() !== '' && !PRESETS.some((x) => x.raw === text.value.raw);
  if (own) pending.value = p;
  else applyPreset(p);
});

// --- REQ-LAY-5: «В разметку» ---
const confirmMarkup = ref(false);
function toMarkup() {
  update({ raw: serializeManual(result.value.lines), mode: 'manual' });
  confirmMarkup.value = false;
  player.value?.refresh();
}

const drill = () => void router.push(`/texts/${text.value.id}/drill`);
</script>

<template>
  <section aria-labelledby="title">
    <RouterLink class="btn back" to="/texts">← Тексты</RouterLink>
    <h2 id="title">Текст в бит</h2>
    <label class="name">
      <span class="small mute">Название</span>
      <input v-model="title" type="text" maxlength="80" />
    </label>
    <ChipGroup v-model="mode" :options="modes" label="Режим раскладки" style="margin-top: 12px" />
    <p class="small mute">{{ HELP[mode] }}</p>
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
          {{ plural(result.bars.length, 'такт', 'такта', 'тактов') }} · блок = одна доля · тап по
          слогу — ударение
        </p>
        <p v-if="hasUnsure" class="small mute legend" style="margin: 0 0 6px">
          <span class="syl unsure">пунктир</span> — проверь ударение
        </p>
        <div v-if="result.pickup" class="bar" data-testid="preview-pickup">
          <span class="small mute">затакт</span>
          <span class="beat">
            <template v-for="(s, k) in result.pickup.syllables" :key="k">
              <button
                v-if="s.text"
                type="button"
                class="syl"
                :class="{ st: s.stressed, unsure: unsure(s) }"
                :aria-label="sylLabel(s)"
                @click="tapSyllable(s)"
              >
                {{ s.text }}
              </button>
            </template>
          </span>
        </div>
        <div v-for="(bar, i) in result.bars" :key="i" class="bar" data-testid="preview-bar">
          <span
            v-for="(b, j) in bar"
            :key="j"
            class="beat"
            :class="{ empty: isPauseBeat(b) }"
            data-testid="preview-beat"
          >
            <template v-if="isPauseBeat(b)">—</template>
            <template v-for="(s, k) in b.syllables" v-else :key="k">
              <span v-if="s.text === ''" class="pause" aria-label="пауза">·</span>
              <button
                v-else
                type="button"
                class="syl"
                :class="{ st: s.stressed, unsure: unsure(s), pk: b.pickup }"
                :aria-label="sylLabel(s)"
                @click="tapSyllable(s)"
              >
                {{ s.text }}
              </button>
            </template>
          </span>
        </div>
      </template>
      <p v-else class="small mute" style="margin: 0">
        Впиши текст — здесь появится раскладка по долям.
      </p>
      <div v-if="result.bars.length" class="row" style="margin-top: 10px">
        <button v-if="mode !== 'manual'" type="button" @click="confirmMarkup = true">
          В разметку
        </button>
        <button type="button" @click="drill">Разобрать строку</button>
      </div>
      <div
        v-if="confirmMarkup"
        class="card confirm"
        role="alertdialog"
        aria-labelledby="markup-title"
      >
        <p id="markup-title" style="margin: 0 0 10px">
          Текст заменится разметкой с «|» и заглавными ударными, режим станет «Разметка». Заменить?
        </p>
        <div class="row">
          <button type="button" class="pri" @click="toMarkup">Заменить</button>
          <button type="button" @click="confirmMarkup = false">Отмена</button>
        </div>
      </div>
    </div>
    <div class="sp"></div>
    <BarPlayer ref="player" v-model:bpm="bpm" :get-bar="getBar" tap />
  </section>
</template>

<style scoped>
.name {
  display: grid;
  gap: 4px;
  margin-top: 12px;
}
.name input,
textarea,
select {
  background: var(--pan2);
  border: 1px solid var(--line);
  border-radius: 12px;
  font-size: 16px;
}
.name input {
  min-height: 44px;
  padding: 0 12px;
}
textarea {
  width: 100%;
  min-height: 150px;
  padding: 12px;
  line-height: 1.5;
  resize: vertical;
  margin-top: 8px;
}
select {
  min-height: 44px;
  padding: 0 10px;
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
  line-height: 1.4;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin: 4px 0;
  padding-bottom: 4px;
  border-bottom: 1px dashed var(--line);
}
.beat {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--pan2);
  min-height: 44px;
}
.beat.empty {
  padding: 0 10px;
  color: var(--mute);
}
.syl {
  min-height: 40px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--mute);
  font-size: 15px;
}
.syl.st {
  color: var(--ink);
  font-weight: 800;
  text-decoration: underline 2px var(--acc);
  text-underline-offset: 4px;
}
.syl.unsure {
  border: 1px dashed var(--mute);
}
.legend .syl {
  display: inline-block;
  min-height: 0;
  padding: 0 4px;
}
.pause {
  color: var(--mute);
  opacity: 0.5;
  padding: 0 4px;
}
</style>
