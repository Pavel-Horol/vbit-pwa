import { describe, expect, it } from 'vitest';
import { applyStress, toSyllables } from '@/core/stress';
import { syllabifyLine } from '@/core/syllabify';

const run = (line: string, overrides: Record<string, number> = {}, lineStart = true) =>
  applyStress(toSyllables(syllabifyLine(line)), { overrides, lineStart }).map(
    (s) => `${s.text}${s.stressed ? '*' : ''}:${s.stressSource}`,
  );

describe('REQ-STR-1: + markup', () => {
  it('кор+аллы → ко-РАЛ-лы, + removed', () => {
    expect(run('кор+аллы')).toEqual(['ко:none', 'рал*:markup', 'лы:none']);
  });
});

describe('REQ-STR-2: caps markup', () => {
  it('all-caps syllable of length ≥ 2 is stressed', () => {
    expect(run('коРАЛлы')).toEqual(['ко:none', 'РАЛ*:markup', 'лы:none']);
  });
  it('capitalised word is not stressed (only first letter upper)', () => {
    expect(run('Клары')).toEqual(['Кла:none', 'ры:none']);
  });
  it('single capital letter at line start is not stressed', () => {
    expect(run('Я иду')).toEqual(['Я:none', 'и:none', 'ду:none']);
  });
  it('single capital letter not at line start is stressed', () => {
    expect(run('иду Я')).toEqual(['и:none', 'ду:none', 'Я*:markup']);
  });
  it('lineStart=false: single capital first syllable is stressed', () => {
    expect(run('Я иду', {}, false)[0]).toBe('Я*:markup');
  });
});

describe('REQ-STR-3: ё', () => {
  it('syllable with ё is stressed', () => {
    expect(run('пришёл')).toEqual(['при:none', 'шёл*:yo']);
  });
  it('markup beats ё within a word', () => {
    expect(run('ПРИшёл')).toEqual(['ПРИ*:markup', 'шёл:none']);
  });
});

describe('priority: user overrides first', () => {
  it('override wins over markup and ё', () => {
    expect(run('ПРИшёл', { пришёл: 0 })).toEqual(['ПРИ*:user', 'шёл:user']);
  });
  it('override index is per word, key is lowercase without +', () => {
    expect(run('мама Кор+аллы', { кораллы: 0 })).toEqual([
      'ма:none',
      'ма:none',
      'Ко*:user',
      'рал:user',
      'лы:user',
    ]);
  });
});

describe('pauses', () => {
  it('pause syllables are untouched', () => {
    const syls = applyStress(
      [{ text: '', stressed: false, wordId: -1, onset: '', stressSource: 'none' }],
      { overrides: {}, lineStart: true },
    );
    expect(syls).toEqual([
      { text: '', stressed: false, wordId: -1, onset: '', stressSource: 'none' },
    ]);
  });
});
