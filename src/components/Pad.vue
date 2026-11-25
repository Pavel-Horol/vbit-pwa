<script setup lang="ts">
import type { RenderMode } from '@/core/ladder';
import type { Beat, Syllable } from '@/core/types';

const props = withDefaults(
  defineProps<{
    beat: Beat;
    label?: string;
    activeSlot?: number | null;
    mode?: RenderMode;
    /** joins[i] — слог i продолжает слово слева / справа (ступени 3–4 склеивают слова). */
    joins?: { l: boolean; r: boolean }[];
  }>(),
  { label: undefined, activeSlot: null, mode: 'syllables', joins: undefined },
);

/** REQ-VIS-3: начальные согласные (2+) рисуются бледнее и левее. */
function parts(s: Syllable): [string, string] {
  // ступень 1: слоги текста → «та»/«ТА»; отсчёт (wordId −1) остаётся цифрами
  if (props.mode === 'skeleton' && s.wordId !== -1) return ['', s.stressed ? 'ТА' : 'та'];
  const n = s.onset.length >= 2 ? s.onset.length : 0;
  return [s.text.slice(0, n), s.text.slice(n)];
}
</script>

<template>
  <div class="pad">
    <div v-if="label" class="pl">{{ label }}</div>
    <div class="cells" :class="{ words: mode === 'words' }">
      <div
        v-for="(s, i) in beat.syllables"
        :key="i"
        class="cell"
        :class="{
          f: i === 0,
          rest: s.text === '',
          on: activeSlot === i,
          st: s.stressed,
          jl: mode === 'words' && joins?.[i]?.l,
          jr: mode === 'words' && joins?.[i]?.r,
        }"
        :data-slot="i"
      >
        <template v-if="s.text === ''">·</template>
        <template v-else
          ><span v-if="parts(s)[0]" class="ons">{{ parts(s)[0] }}</span
          ><span class="nuc">{{ parts(s)[1] }}</span></template
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
.pad {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 5px;
  background: var(--pan2);
  border-radius: 12px;
  border: 1px solid var(--line);
}
.pl {
  font-size: 12px;
  color: var(--mute);
  text-align: center;
  line-height: 1.2;
  padding-top: 2px;
}
.cells {
  display: flex;
  gap: 3px;
  flex: 1;
  min-height: 58px;
}
.cell {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: clamp(14px, 3.6vw, 18px);
  color: var(--mute);
  text-align: center;
  white-space: nowrap;
  padding: 2px 3px;
  transition: background 0.05s;
}
.cell.f {
  color: var(--ink);
  font-weight: 600;
}
/* REQ-VIS-4: ударный слог — жирный, подчёркнут акцентным цветом */
.cell.st {
  color: var(--ink);
  font-weight: 800;
}
.cell.st .nuc,
.cell.st .ons {
  text-decoration: underline 2px var(--acc);
  text-underline-offset: 4px;
}
.ons {
  opacity: 0.55;
  margin-left: -0.35em;
}
.cell.rest {
  opacity: 0.35;
}
/* ступени 3–4: слоги одного слова — общий фон, скругление только по краям слова */
.cells.words {
  gap: 0;
}
.cells.words .cell:not(.rest) {
  background: var(--line);
  margin: 0 2px;
}
.cells.words .cell.jl {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  margin-left: 0;
}
.cells.words .cell.jr {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  margin-right: 0;
}
.cell.on,
.cells.words .cell.on {
  background: var(--acc);
  color: var(--accInk);
  opacity: 1;
}
.cell.on .ons {
  opacity: 0.7;
}
.cell.on.st .nuc,
.cell.on.st .ons {
  text-decoration-color: var(--accInk);
}
</style>
