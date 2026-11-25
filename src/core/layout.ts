// REQ-LAY: раскладка текста по долям и тактам. Режимы manual / auto / stress, затакт (REQ-LAY-3).
import { nonEmptyLines, parseManual } from './parse';
import { applyStress, pause, toSyllables } from './stress';
import { hasDigits, syllabifyLine } from './syllabify';
import type { Bar, Beat, Line, StressDict, Syllable, Text, Warning } from './types';

export type LayoutInput = Pick<
  Text,
  'raw' | 'mode' | 'perBeat' | 'lineStartsBar' | 'stressOverrides'
>;
/** `pickup` — затакт первой строки: играется в 4-й доле отсчёта (и в конце круга при повторе). */
export type LayoutResult = { bars: Bar[]; lines: Line[]; warnings: Warning[]; pickup?: Beat };

/** Пустой словарь: правила служебных и односложных слов (REQ-STR-5) работают и без него. */
const NO_DICT: StressDict = { lookup: () => undefined };

const pauseBeat = (): Beat => ({ syllables: [pause()] });
export const isPauseBeat = (b: Beat) => b.syllables.every((s) => s.text === '');

/** REQ-LAY-3: доля затакта — max(p, 2) слотов при p ≤ 4, иначе p; слоги в последних слотах. */
export function pickupBeat(syllables: Syllable[]): Beat {
  const p = syllables.length;
  const slots = p <= 4 ? Math.max(p, 2) : p;
  return {
    syllables: [...Array.from({ length: slots - p }, pause), ...syllables],
    pickup: true,
  };
}

/** Слоги подряд по `n` на долю, последняя доля добивается паузами (REQ-LAY-1). */
function chunk(syllables: Syllable[], n: number): Beat[] {
  const beats: Beat[] = [];
  for (let i = 0; i < syllables.length; i += n) {
    const part = syllables.slice(i, i + n);
    while (part.length < n) part.push(pause());
    beats.push({ syllables: part });
  }
  return beats;
}

/** REQ-LAY-2: группа из k слогов → ceil(k/4) долей, остаток — в первые доли. */
function splitGroup(group: Syllable[]): Beat[] {
  const n = Math.ceil(group.length / 4);
  const base = Math.floor(group.length / n);
  const rem = group.length % n;
  const beats: Beat[] = [];
  let at = 0;
  for (let i = 0; i < n; i++) {
    const size = base + (i < rem ? 1 : 0);
    beats.push({ syllables: group.slice(at, at + size) });
    at += size;
  }
  return beats;
}

function stressBeats(syllables: Syllable[]): { beats: Beat[]; pickupCount: number } | null {
  const first = syllables.findIndex((s) => s.stressed);
  if (first < 0) return null;
  const beats: Beat[] = [];
  if (first > 0) beats.push({ syllables: syllables.slice(0, first), pickup: true });
  let group: Syllable[] = [];
  for (const s of syllables.slice(first)) {
    if (s.stressed && group.length) {
      beats.push(...splitGroup(group));
      group = [];
    }
    group.push(s);
  }
  beats.push(...splitGroup(group));
  return { beats, pickupCount: first };
}

/** Режимы auto и stress: слоги из словаря ударений; одна Line на каждую непустую строку. */
function syllableLines(
  text: LayoutInput,
  dict: StressDict,
): { lines: Line[]; warnings: Warning[] } {
  const lines: Line[] = [];
  const warnings: Warning[] = [];
  let wordBase = 0;
  nonEmptyLines(text.raw).forEach((raw, lineNo) => {
    if (hasDigits(raw)) warnings.push({ code: 'digits_removed', line: lineNo });
    const shifted = toSyllables(syllabifyLine(raw)).map((s) => ({
      ...s,
      wordId: s.wordId + wordBase,
    }));
    if (!shifted.length) {
      lines.push({ syllables: [], pickupCount: 0, beats: [] });
      return;
    }
    wordBase = shifted[shifted.length - 1]!.wordId + 1;
    const syllables = applyStress(shifted, {
      overrides: text.stressOverrides,
      dict,
      lineStart: true,
    });

    if (text.mode === 'stress') {
      const r = stressBeats(syllables);
      if (r) {
        lines.push({ syllables, ...r });
        return;
      }
      warnings.push({ code: 'no_stress', line: lineNo });
      lines.push({ syllables, pickupCount: 0, beats: chunk(syllables, 2) });
      return;
    }
    lines.push({ syllables, pickupCount: 0, beats: chunk(syllables, text.perBeat) });
  });
  return { lines, warnings };
}

/** Режем последовательность долей на такты по 4, хвост добиваем паузами. */
export function toBars(beats: Beat[]): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < beats.length; i += 4) {
    const part = beats.slice(i, i + 4);
    while (part.length < 4) part.push(pauseBeat());
    bars.push(part as Bar);
  }
  return bars;
}

/** Укладывает строки в такты: затакты (REQ-LAY-3) и «каждая строка с нового такта» (REQ-LAY-4). */
export function arrange(
  lines: Line[],
  lineStartsBar: boolean,
): { bars: Bar[]; warnings: Warning[]; pickup?: Beat } {
  const beats: Beat[] = [];
  const warnings: Warning[] = [];
  let lead: Beat | undefined;
  lines.forEach((line, lineNo) => {
    const [first, ...rest] = line.beats;
    if (first?.pickup) {
      const pb = pickupBeat(first.syllables);
      const prev = beats[beats.length - 1];
      if (!prev) lead = pb;
      else if (isPauseBeat(prev)) beats[beats.length - 1] = pb;
      else {
        warnings.push({ code: 'pickup_shifted', line: lineNo });
        if (lineStartsBar) beats.push(pauseBeat(), pauseBeat(), pauseBeat());
        beats.push(pb);
      }
    }
    beats.push(...(first?.pickup ? rest : line.beats));
    if (lineStartsBar) while (beats.length % 4) beats.push(pauseBeat());
  });
  return { bars: toBars(beats), warnings, ...(lead ? { pickup: lead } : {}) };
}

export function layout(text: LayoutInput, dict?: StressDict): LayoutResult {
  // REQ-STR-6: в ручной разметке словарь не применяется.
  const { lines, warnings } =
    text.mode === 'manual'
      ? parseManual(text.raw, {
          lineStartsBar: text.lineStartsBar,
          overrides: text.stressOverrides,
        })
      : syllableLines(text, dict ?? NO_DICT);
  const arranged = arrange(lines, text.lineStartsBar);
  return {
    bars: arranged.bars,
    lines,
    warnings: [...warnings, ...arranged.warnings],
    ...(arranged.pickup ? { pickup: arranged.pickup } : {}),
  };
}
