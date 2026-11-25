import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseStressDict } from '@/core/stressDict';

// Маленький словарь в формате scripts/build-stress-dict.mjs (RESTART = 32 в реальном файле,
// здесь точки входа — строки с префиксом 0).
const SMALL = [
  '# комментарий',
  '0дорога12',
  '6ми0',
  '0замки1',
  '3ок01',
  '0мама0',
  '0сосала1',
  '',
].join('\n');

describe('REQ-STR-4: front-coded stress dictionary', () => {
  const d = parseStressDict(SMALL);

  it('finds full and front-coded entries', () => {
    expect(d.lookup('мама')).toEqual([0]);
    expect(d.lookup('дорогами')).toEqual([0]);
    expect(d.lookup('замки')).toEqual([1]);
    expect(d.lookup('сосала')).toEqual([1]);
  });

  it('returns several indexes for homographs', () => {
    expect(d.lookup('замок')).toEqual([0, 1]);
    expect(d.lookup('дорога')).toEqual([1, 2]);
  });

  it('missing words → undefined (before, between and after entries)', () => {
    expect(d.lookup('абв')).toBeUndefined();
    expect(d.lookup('дорог')).toBeUndefined();
    expect(d.lookup('мамы')).toBeUndefined();
    expect(d.lookup('яблоко')).toBeUndefined();
  });

  it('empty dictionary', () => {
    expect(parseStressDict('# пусто\n').lookup('мама')).toBeUndefined();
  });
});

describe('REQ-STR-4: the shipped dictionary', () => {
  const d = parseStressDict(readFileSync('public/dict/stress.txt', 'utf8'));

  it('has the expected stress for common words', () => {
    expect(d.lookup('кораллы')).toEqual([1]);
    expect(d.lookup('сушку')).toEqual([0]);
    expect(d.lookup('сосала')).toEqual([1]);
    expect(d.lookup('шоссе')).toEqual([1]);
  });

  it('ё forms are also stored under е spelling', () => {
    expect(d.lookup('пришел')).toEqual([1]);
  });

  it('homographs return several variants', () => {
    expect(d.lookup('замок')).toEqual([0, 1]);
  });

  it('one-syllable words are not stored', () => {
    expect(d.lookup('дом')).toBeUndefined();
  });
});
