import { describe, expect, it } from 'vitest';
import { drillBar, RAND_CONSONANTS, RAND_VOWELS } from '@/core/patterns';
import { seeded } from './helpers';

const texts = (mode: Parameters<typeof drillBar>[0], set: Parameters<typeof drillBar>[1], i = 0) =>
  drillBar(mode, set, i, seeded(1)).map((b) => b.syllables.map((s) => s.text));

describe('REQ-PAT-1/3: fixed sets', () => {
  it('taka, 1..4 syllables per beat', () => {
    expect(texts(1, 'taka')).toEqual([['та'], ['та'], ['та'], ['та']]);
    expect(texts(2, 'taka')[0]).toEqual(['та', 'ка']);
    expect(texts(3, 'taka')[0]).toEqual(['та', 'ка', 'ти']);
    expect(texts(4, 'taka')[3]).toEqual(['та', 'ка', 'ти', 'ки']);
  });
  it('pbdg takes the first n', () => {
    expect(texts(3, 'pbdg')[1]).toEqual(['па', 'ба', 'да']);
  });
  it('first syllable of every beat is stressed, others not', () => {
    for (const beat of drillBar(4, 'taka', 0, seeded(1))) {
      expect(beat.syllables.map((s) => s.stressed)).toEqual([true, false, false, false]);
    }
  });
  it('onset is set', () => {
    expect(drillBar(2, 'pbdg', 0, seeded(1))[0].syllables.map((s) => s.onset)).toEqual(['п', 'б']);
  });
});

describe('REQ-PAT-2: auto', () => {
  it('syllables per beat follow [1,2,4,3] every 2 bars', () => {
    const n = Array.from(
      { length: 10 },
      (_, i) => drillBar('auto', 'taka', i, seeded(1))[0].syllables.length,
    );
    expect(n).toEqual([1, 1, 2, 2, 4, 4, 3, 3, 1, 1]);
  });
});

describe('REQ-PAT-3/4: rand', () => {
  it('consonant + vowel from the given sets', () => {
    for (const beat of drillBar(4, 'rand', 0, seeded(7))) {
      for (const s of beat.syllables) {
        expect(s.text).toHaveLength(2);
        expect(RAND_CONSONANTS).toContain(s.text[0]);
        expect(RAND_VOWELS).toContain(s.text[1]);
      }
    }
  });
  it('is deterministic with the same seed', () => {
    expect(texts(4, 'rand')).toEqual(texts(4, 'rand'));
    const other = drillBar(4, 'rand', 0, seeded(2)).map((b) => b.syllables.map((s) => s.text));
    expect(other).not.toEqual(texts(4, 'rand'));
  });
});
