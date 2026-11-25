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
    // REQ-PAR-3: `>` в начале строки — первый сегмент (до первой `|`) это затакт.
    const marked = /^\s*>/.test(rawLine);
    const line = stripAccents(rawLine.replace(/^\s*>/, ''));
    if (hasDigits(line)) warnings.push({ code: 'digits_removed', line: lineNo });

    let parts = line.split('|');
    let hasPickup = marked && parts.length > 1;
    if (hasPickup && !/[\p{L}_]/u.test(parts[0]!)) {
      parts = parts.slice(1); // `> | …` — пустой затакт
      hasPickup = false;
    }
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
    const beats: Beat[] = parts.map((_, i) =>
      i === 0 && hasPickup ? { syllables: [], pickup: true } : { syllables: [] },
    );
    stressed.forEach((s, i) => beats[beatOf[i]!]!.syllables.push(s));

    const syllables = stressed.filter((s) => s.wordId !== -1);
    if (parts.length === 1 && syllables.length > 0) {
      warnings.push({ code: 'no_beat_separators', line: lineNo });
    }
    const pickupCount = hasPickup ? beats[0]!.syllables.filter((s) => s.wordId !== -1).length : 0;
    lines.push({ syllables, pickupCount, beats });
  });

  return { lines, warnings };
}

/**
 * REQ-LAY-5: любая раскладка → текст ручной разметки. Ударный слог — капсом (однобуквенный — через
 * `+`, иначе в начале строки он не считается ударным), безударные — строчными, `_` — пауза,
 * `>` — затакт. В безударном слове «ё» пишется как «е», иначе она сама дала бы ударение (REQ-STR-3).
 */
export function serializeManual(lines: Line[]): string {
  const out: string[] = [];
  for (const line of lines) {
    if (!line.beats.length) continue;
    const stressedWords = new Set(line.syllables.filter((s) => s.stressed).map((s) => s.wordId));
    const fmt = (s: Syllable) => {
      if (s.text === '') return '_';
      if (s.stressed)
        return s.text.length === 1 ? '+' + s.text.toLowerCase() : s.text.toUpperCase();
      const lower = s.text.toLowerCase();
      return stressedWords.has(s.wordId) ? lower : lower.replace(/ё/g, 'е');
    };
    const flat = line.beats.flatMap((b) => b.syllables);
    let at = 0;
    const segments = line.beats.map((beat) => {
      let seg = '';
      beat.syllables.forEach((s, i) => {
        const next = flat[at + i + 1];
        const sameWord = s.wordId !== -1 && next?.wordId === s.wordId;
        seg += fmt(s);
        if (i < beat.syllables.length - 1) seg += sameWord ? '-' : ' ';
        else if (sameWord) seg += '-';
      });
      at += beat.syllables.length;
      return seg;
    });
    out.push((line.beats[0]!.pickup ? '> ' : '') + segments.join(' | '));
  }
  return out.join('\n');
}
