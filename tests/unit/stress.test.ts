import { describe, expect, it } from 'vitest';
import { applyStress, toSyllables } from '@/core/stress';
import { syllabifyLine } from '@/core/syllabify';
import type { StressDict } from '@/core/types';

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

// --- REQ-STR-4..6: словарь, служебные слова, односложные слова ---

const DICT: StressDict = {
  lookup: (w) =>
    ({ сосала: [1], сушку: [0], замок: [0, 1], доме: [0], мама: [0] })[w] as number[] | undefined,
};
const runDict = (line: string, overrides: Record<string, number> = {}) =>
  applyStress(toSyllables(syllabifyLine(line)), { overrides, dict: DICT, lineStart: true }).map(
    (s) => `${s.text}${s.stressed ? '*' : ''}:${s.stressSource}${s.ambiguous ? '?' : ''}`,
  );

describe('REQ-STR-4: dictionary', () => {
  it('stress comes from the dictionary', () => {
    expect(runDict('сосала сушку')).toEqual([
      'со:none',
      'са*:dict',
      'ла:none',
      'су*:dict',
      'шку:none',
    ]);
  });
  it('lookup is lowercase', () => {
    expect(runDict('Сосала')).toEqual(['Со:none', 'са*:dict', 'ла:none']);
  });
  it('homograph → none + ambiguous on every syllable of the word', () => {
    expect(runDict('замок')).toEqual(['за:none?', 'мок:none?']);
  });
  it('unknown word of 2+ syllables → none, not ambiguous', () => {
    expect(runDict('кукуруза')).toEqual(['ку:none', 'ку:none', 'ру:none', 'за:none']);
  });
  it('prefix without vowel glued to the word: falls back to the word itself', () => {
    expect(runDict('в доме')).toEqual(['вдо*:dict', 'ме:none']);
  });
  it('markup and ё beat the dictionary', () => {
    expect(runDict('соСАла')).toEqual(['со:none', 'СА*:markup', 'ла:none']);
    expect(runDict('сосёт')).toEqual(['со:none', 'сёт*:yo']);
  });
  it('user override beats the dictionary; -1 means «no stress»', () => {
    expect(runDict('сосала', { сосала: 0 })).toEqual(['со*:user', 'са:user', 'ла:user']);
    expect(runDict('шла', { шла: -1 })).toEqual(['шла:user']);
  });
  it('without a dictionary nothing changes (REQ-STR-6, manual)', () => {
    expect(run('сосала шла')).toEqual(['со:none', 'са:none', 'ла:none', 'шла:none']);
  });
});

describe('REQ-STR-5: service words, one-syllable words', () => {
  it('service words stay unstressed', () => {
    for (const w of [
      'и',
      'а',
      'но',
      'да',
      'во',
      'на',
      'по',
      'ко',
      'со',
      'у',
      'о',
      'об',
      'от',
      'до',
      'за',
      'из',
      'не',
      'ни',
      'же',
      'ли',
      'бы',
      'то',
    ])
      expect(runDict(`мама ${w}`)[2]).toBe(`${w}:none`);
  });
  it('one-syllable non-service word is stressed (source dict)', () => {
    expect(runDict('Шла Саша по шоссе')[0]).toBe('Шла*:dict');
  });
  it('one-syllable word with a glued preposition: к нам → кнам stressed', () => {
    expect(runDict('к нам')).toEqual(['кнам*:dict']);
  });
  it('service word with a glued preposition stays unstressed', () => {
    expect(runDict('с не')).toEqual(['сне:none']);
  });
  it('кто-то: «то» is a service word', () => {
    expect(runDict('кто-то')).toEqual(['кто*:dict', 'то:none']);
  });
});
