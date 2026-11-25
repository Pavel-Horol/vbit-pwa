// REQ-PAR: ручная разметка. `|` — граница доли, пробел/`-` — граница слога, `_` — пауза.
import { applyStress, pause } from './stress';
import { hasDigits, onsetOf, stripAccents } from './syllabify';
import type { Beat, Line, Syllable, Warning } from './types';

export type ParseOptions = { lineStartsBar: boolean; overrides?: Record<string, number> };

/** Непустые строки текста (REQ-PAR-1); индекс в этом массиве — номер строки в Warning. */
export const nonEmptyLines = (raw: string) => raw.split('\n').filter((l) => l.trim() !== '');

export function parseManual(
  raw: string,
  opts: ParseOptions,
): { lines: Line[]; warnings: Warning[] } {
  const lines: Line[] = [];
  const warnings: Warning[] = [];
  let wordId = -1;

  nonEmptyLines(raw).forEach((rawLine, lineNo) => {
    // Этап 1: затакт `>` (REQ-PAR-3) ещё не поддержан — знак просто убираем.
    const line = stripAccents(rawLine.replace(/^\s*>/, ''));
    if (hasDigits(line)) warnings.push({ code: 'digits_removed', line: lineNo });

    const parts = line.split('|');
    const beatOf: number[] = [];
    const flat: Syllable[] = [];
    let continueWord = false;

    parts.forEach((part, beatNo) => {
      let count = 0;
      for (const token of part.trim().split(/\s+/).filter(Boolean)) {
        token.split('-').forEach((piece, j) => {
          if (j > 0) continueWord = true;
          const clean = piece.replace(/[^\p{L}+_]/gu, '');
          if (!clean) return;
          if (/^_+$/.test(clean)) {
            for (let k = 0; k < clean.length; k++) {
              flat.push(pause());
              beatOf.push(beatNo);
              count++;
            }
            continueWord = false;
            return;
          }
          const text = clean.replace(/_/g, '');
          if (!continueWord) wordId++;
          flat.push({ text, stressed: false, wordId, onset: onsetOf(text), stressSource: 'none' });
          beatOf.push(beatNo);
          count++;
          continueWord = false;
        });
        if (token.endsWith('-')) continueWord = true;
      }
      if (count === 0) {
        flat.push(pause());
        beatOf.push(beatNo);
      }
    });

    const stressed = applyStress(flat, { overrides: opts.overrides ?? {}, lineStart: true });
    const beats: Beat[] = parts.map(() => ({ syllables: [] }));
    stressed.forEach((s, i) => beats[beatOf[i]!]!.syllables.push(s));

    const syllables = stressed.filter((s) => s.wordId !== -1);
    if (parts.length === 1 && syllables.length > 0) {
      warnings.push({ code: 'no_beat_separators', line: lineNo });
    }
    lines.push({ syllables, pickupCount: 0, beats });
  });

  return { lines, warnings };
}
