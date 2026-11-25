import { describe, expectTypeOf, it } from 'vitest';
import type { Bar, Beat, LadderStage, Syllable } from '@/core/types';

describe('REQ-DATA: types', () => {
  it('Bar is exactly four beats (4/4 only)', () => {
    expectTypeOf<Bar['length']>().toEqualTypeOf<4>();
    expectTypeOf<Bar[number]>().toEqualTypeOf<Beat>();
  });

  it('ladder has six stages', () => {
    expectTypeOf<LadderStage>().toEqualTypeOf<1 | 2 | 3 | 4 | 5 | 6>();
  });

  it('stress sources match SPEC priority list', () => {
    expectTypeOf<Syllable['stressSource']>().toEqualTypeOf<
      'markup' | 'yo' | 'dict' | 'user' | 'none'
    >();
  });
});
