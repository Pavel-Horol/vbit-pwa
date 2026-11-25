<script setup lang="ts">
import { computed, toRaw } from 'vue';
import type { Line, Syllable } from '@/core/types';

// REQ-LAD ступени 5–6: строка обычным текстом, подсвечен текущий слог, ударные подчёркнуты;
// на 6-й ступени слова свёрнуты до первой буквы.
const props = defineProps<{ lines: Line[]; active: Syllable | null; memory?: boolean }>();

type Word = { id: number; syllables: Syllable[] };
const words = computed(() =>
  props.lines.map((line) => {
    const out: Word[] = [];
    for (const s of line.syllables) {
      const last = out[out.length - 1];
      if (last && last.id === s.wordId) last.syllables.push(s);
      else out.push({ id: s.wordId, syllables: [s] });
    }
    return out;
  }),
);
const isActive = (s: Syllable) => !!props.active && toRaw(s) === toRaw(props.active);
const wordActive = (w: Word) => w.syllables.some(isActive);
</script>

<template>
  <div class="karaoke" data-testid="karaoke">
    <p v-for="(line, i) in words" :key="i" class="kl">
      <template v-for="w in line" :key="w.id">
        <span v-if="memory" class="w" :class="{ on: wordActive(w) }"
          >{{ w.syllables[0]!.text.charAt(0) }}<span class="dots">…</span></span
        >
        <span v-else class="w"
          ><span
            v-for="(s, k) in w.syllables"
            :key="k"
            class="s"
            :class="{ on: isActive(s), st: s.stressed }"
            >{{ s.text }}</span
          ></span
        >{{ ' ' }}
      </template>
    </p>
  </div>
</template>

<style scoped>
.karaoke {
  background: var(--pan2);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px 16px;
  min-height: 132px;
}
.kl {
  margin: 0 0 6px;
  font-size: clamp(20px, 5.4vw, 26px);
  line-height: 1.5;
  color: var(--mute);
  overflow-wrap: anywhere;
}
.w {
  white-space: nowrap;
}
.s,
.w {
  border-radius: 6px;
  transition: background 0.05s;
}
.st {
  color: var(--ink);
  text-decoration: underline 2px var(--acc);
  text-underline-offset: 5px;
}
.on {
  background: var(--acc);
  color: var(--accInk);
}
.on.st {
  text-decoration-color: var(--accInk);
}
.dots {
  opacity: 0.4;
}
</style>
