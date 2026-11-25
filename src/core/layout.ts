// REQ-LAY: раскладка текста по долям и тактам.
// Этап 1: режимы `manual` и `auto`. `stress` (REQ-LAY-2) и затакт (REQ-LAY-3) — этап 2.
import { nonEmptyLines, parseManual } from './parse';
import { applyStress, pause, toSyllables } from './stress';
import { hasDigits, syllabifyLine } from './syllabify';
import type { Bar, Beat, Line, StressDict, Text, Warning } from './types';

export type LayoutInput = Pick<
  Text,
  'raw' | 'mode' | 'perBeat' | 'lineStartsBar' | 'stressOverrides'
>;
export type LayoutResult = { bars: Bar[]; lines: Line[]; warnings: Warning[] };

const pauseBeat = (): Beat => ({ syllables: [pause()] });

function autoLines(text: LayoutInput): { lines: Line[]; warnings: Warning[] } {
  const lines: Line[] = [];
  const warnings: Warning[] = [];
  let wordBase = 0;
  nonEmptyLines(text.raw).forEach((raw, lineNo) => {
    if (hasDigits(raw)) warnings.push({ code: 'digits_removed', line: lineNo });
    const rawSyls = syllabifyLine(raw);
    if (!rawSyls.length) return;
    const shifted = toSyllables(rawSyls).map((s) => ({ ...s, wordId: s.wordId + wordBase }));
    wordBase = shifted[shifted.length - 1]!.wordId + 1;
    const syllables = applyStress(shifted, { overrides: text.stressOverrides, lineStart: true });

    const beats: Beat[] = [];
    for (let i = 0; i < syllables.length; i += text.perBeat) {
      const chunk = syllables.slice(i, i + text.perBeat);
      while (chunk.length < text.perBeat) chunk.push(pause());
      beats.push({ syllables: chunk });
    }
    lines.push({ syllables, pickupCount: 0, beats });
  });
  return { lines, warnings };
}

/** Режем последовательность долей на такты по 4, хвост добиваем паузами. */
export function toBars(beats: Beat[]): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < beats.length; i += 4) {
    const chunk = beats.slice(i, i + 4);
    while (chunk.length < 4) chunk.push(pauseBeat());
    bars.push(chunk as Bar);
  }
  return bars;
}

// `dict` пока не используется: словарь ударений подключается на этапе 2 (REQ-STR-4).
export function layout(text: LayoutInput, _dict?: StressDict): LayoutResult {
  const { lines, warnings } =
    text.mode === 'manual'
      ? parseManual(text.raw, {
          lineStartsBar: text.lineStartsBar,
          overrides: text.stressOverrides,
        })
      : autoLines(text);

  const beats: Beat[] = [];
  for (const line of lines) {
    beats.push(...line.beats);
    if (text.lineStartsBar) while (beats.length % 4) beats.push(pauseBeat());
  }
  return { bars: toBars(beats), lines, warnings };
}
