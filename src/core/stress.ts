// REQ-STR: ударения. Приоритет источников: user → markup (+, капс) → ё → словарь → none.
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

/** REQ-STR-5: служебные слова без ударения по умолчанию. */
export const SERVICE_WORDS = new Set(
  'и а но да в во на по к ко с со у о об от до за из не ни же ли бы то'.split(' '),
);

/**
 * Шаг словаря (REQ-STR-4/5) для слова из `count` слогов. `key` — слово в нижнем регистре без
 * приклеенных предлогов. Возвращает индекс ударного слога, 'ambiguous' или null (неизвестно).
 */
export function dictStress(
  key: string,
  count: number,
  dict: StressDict,
): number | 'ambiguous' | null {
  if (SERVICE_WORDS.has(key)) return null;
  if (count === 1) return 0;
  const found = dict.lookup(key)?.filter((i) => i < count);
  if (!found?.length) return null;
  return found.length > 1 ? 'ambiguous' : found[0]!;
}

export type StressOptions = {
  overrides: Record<string, number>;
  dict?: StressDict;
  lineStart: boolean;
};

/**
 * Приоритет: user → markup → yo → dict → none. `+` из текста удаляется. Без `dict`
 * (ручная разметка, REQ-STR-6) шаг словаря пропускается. Override `-1` — «без ударения».
 */
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
    const glued = out[idx[0]!]!.glued ?? 0;
    const fromDict =
      opts.dict && !markup.some(Boolean) && !yo.some(Boolean)
        ? dictStress(key.slice(glued), idx.length, opts.dict)
        : null;

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
      } else if (typeof fromDict === 'number') {
        s.stressed = k === fromDict;
        s.stressSource = s.stressed ? 'dict' : 'none';
      } else {
        s.stressed = false;
        s.stressSource = 'none';
      }
      if (fromDict === 'ambiguous' && override === undefined) s.ambiguous = true;
      else delete s.ambiguous;
    });
  }
  return out;
}
