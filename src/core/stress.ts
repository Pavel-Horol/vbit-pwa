// REQ-STR: ударения. Этап 1 — только разметка (+, капс), ё и user-overrides.
// Словарь (REQ-STR-4) подключается на этапе 2.
import type { RawSyllable } from './syllabify';
import type { StressDict, Syllable } from './types';

export const PAUSE: Readonly<Syllable> = Object.freeze({
  text: '',
  stressed: false,
  wordId: -1,
  onset: '',
  stressSource: 'none',
});

export const pause = (): Syllable => ({ ...PAUSE });

export const toSyllables = (raw: RawSyllable[]): Syllable[] =>
  raw.map((r) => ({ ...r, stressed: false, stressSource: 'none' }));

const letters = (s: string) => s.replace(/\+/g, '');

function isCapsMarkup(text: string, firstOfLine: boolean): boolean {
  const l = [...letters(text)].filter((c) => /\p{L}/u.test(c));
  if (!l.length) return false;
  const word = l.join('');
  if (word !== word.toUpperCase() || word === word.toLowerCase()) return false;
  if (l.length >= 2) return true;
  return !firstOfLine;
}

export type StressOptions = {
  overrides: Record<string, number>;
  dict?: StressDict;
  lineStart: boolean;
};

/** Приоритет: user → markup → yo → (dict, этап 2) → none. `+` из текста удаляется. */
export function applyStress(syls: Syllable[], opts: StressOptions): Syllable[] {
  const out = syls.map((s) => ({ ...s }));
  const firstReal = opts.lineStart ? out.findIndex((s) => s.wordId !== -1) : -1;

  const words = new Map<number, number[]>();
  out.forEach((s, i) => {
    if (s.wordId === -1) return;
    const list = words.get(s.wordId) ?? [];
    list.push(i);
    words.set(s.wordId, list);
  });

  for (const idx of words.values()) {
    const key = idx
      .map((i) => letters(out[i]!.text))
      .join('')
      .toLowerCase();
    const markup = idx.map(
      (i) => out[i]!.text.includes('+') || isCapsMarkup(out[i]!.text, i === firstReal),
    );
    const yo = idx.map((i) => /ё/i.test(out[i]!.text));
    const override = opts.overrides[key];

    idx.forEach((i, k) => {
      const s = out[i]!;
      s.text = letters(s.text);
      if (override !== undefined) {
        s.stressed = k === override;
        s.stressSource = 'user';
      } else if (markup.some(Boolean)) {
        s.stressed = markup[k]!;
        s.stressSource = s.stressed ? 'markup' : 'none';
      } else if (yo.some(Boolean)) {
        s.stressed = yo[k]!;
        s.stressSource = s.stressed ? 'yo' : 'none';
      } else {
        s.stressed = false;
        s.stressSource = 'none';
      }
    });
  }
  return out;
}
