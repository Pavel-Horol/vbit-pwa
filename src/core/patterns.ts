// REQ-PAT: такты для дриллов метронома.
import type { Bar, Beat, DrillMode, DrillSet, Syllable } from './types';
import { onsetOf } from './syllabify';

export const TAKA = ['та', 'ка', 'ти', 'ки'];
export const PBDG = ['па', 'ба', 'да', 'га'];
export const RAND_CONSONANTS = 'бвгдзклмнпрстфхшжч';
export const RAND_VOWELS = 'аоуиэы';
export const AUTO_SEQUENCE = [1, 2, 4, 3] as const;

export const syllablesPerBeat = (mode: DrillMode, barIndex: number): number =>
  mode === 'auto' ? AUTO_SEQUENCE[Math.floor(barIndex / 2) % 4]! : mode;

const pick = (s: string, rng: () => number) => s[Math.floor(rng() * s.length)] ?? s[0]!;

export function drillBar(mode: DrillMode, set: DrillSet, barIndex: number, rng: () => number): Bar {
  const n = syllablesPerBeat(mode, barIndex);
  const beat = (b: number): Beat => {
    const texts =
      set === 'rand'
        ? Array.from({ length: n }, () => pick(RAND_CONSONANTS, rng) + pick(RAND_VOWELS, rng))
        : (set === 'pbdg' ? PBDG : TAKA).slice(0, n);
    const wordId = barIndex * 4 + b;
    return {
      syllables: texts.map((text, i): Syllable => ({
        text,
        stressed: i === 0,
        wordId,
        onset: onsetOf(text),
        stressSource: i === 0 ? 'markup' : 'none',
      })),
    };
  };
  return [beat(0), beat(1), beat(2), beat(3)];
}
