import { describe, expect, it } from 'vitest';
import { parseManual } from '@/core/parse';
import type { Beat } from '@/core/types';

const show = (beats: Beat[]) =>
  beats.map((b) =>
    b.syllables.map((s) => (s.text === '' ? '_' : s.text + (s.stressed ? '*' : ''))),
  );

describe('REQ-PAR-5: SPEC vector', () => {
  it('КАРЛ у | КЛА-ры у- | КРАЛ ко- | РАЛ-лы → 4 beats', () => {
    const { lines, warnings } = parseManual('КАРЛ у | КЛА-ры у- | КРАЛ ко- | РАЛ-лы', {
      lineStartsBar: true,
    });
    expect(warnings).toEqual([]);
    expect(lines).toHaveLength(1);
    expect(show(lines[0]!.beats)).toEqual([
      ['КАРЛ*', 'у'],
      ['КЛА*', 'ры', 'у'],
      ['КРАЛ*', 'ко'],
      ['РАЛ*', 'лы'],
    ]);
  });
});

describe('REQ-PAR-1: lines', () => {
  it('empty lines are skipped', () => {
    const { lines } = parseManual('\n  \nа | б\n\nв | г\n', { lineStartsBar: false });
    expect(lines.map((l) => show(l.beats))).toEqual([
      [['а'], ['б']],
      [['в'], ['г']],
    ]);
  });
  it('empty input → no lines', () => {
    expect(parseManual('', { lineStartsBar: true })).toEqual({ lines: [], warnings: [] });
  });
});

describe('REQ-PAR-2: beats, syllables, pauses', () => {
  it('syllables split by space or hyphen', () => {
    const { lines } = parseManual('та ка-ти | ки', { lineStartsBar: false });
    expect(show(lines[0]!.beats)).toEqual([['та', 'ка', 'ти'], ['ки']]);
  });
  it('_ is a pause syllable', () => {
    const { lines } = parseManual('та _ | _ _', { lineStartsBar: false });
    expect(show(lines[0]!.beats)).toEqual([
      ['та', '_'],
      ['_', '_'],
    ]);
    expect(lines[0]!.beats[1]!.syllables[0]!.wordId).toBe(-1);
  });
  it('empty beat is one pause', () => {
    const { lines } = parseManual('та | | ка', { lineStartsBar: false });
    expect(show(lines[0]!.beats)).toEqual([['та'], ['_'], ['ка']]);
  });
  it('line of only _ → all pauses', () => {
    const { lines } = parseManual('_ | _ _', { lineStartsBar: false });
    expect(show(lines[0]!.beats)).toEqual([['_'], ['_', '_']]);
    expect(lines[0]!.syllables).toEqual([]);
  });
  it('punctuation is dropped from syllables', () => {
    const { lines } = parseManual('КАРЛ, у | КЛА-ры!', { lineStartsBar: false });
    expect(show(lines[0]!.beats)).toEqual([
      ['КАРЛ*', 'у'],
      ['КЛА*', 'ры'],
    ]);
  });
});

describe('words in manual markup', () => {
  it('hyphen joins syllables into one word, also across |', () => {
    const { lines } = parseManual('КАРЛ у | КЛА-ры у- | КРАЛ ко- | РАЛ-лы', {
      lineStartsBar: false,
    });
    const ids = lines[0]!.syllables.map((s) => s.wordId);
    // КАРЛ | у | КЛА-ры | у-КРАЛ | ко-РАЛ-лы
    expect(ids).toEqual([0, 1, 2, 2, 3, 3, 4, 4, 4]);
  });
  it('word ids continue across lines', () => {
    const { lines } = parseManual('та | ка\nти | ки', { lineStartsBar: false });
    expect(lines[1]!.syllables.map((s) => s.wordId)).toEqual([2, 3]);
  });
  it('onset is computed for each syllable', () => {
    const { lines } = parseManual('КРАЛ ко', { lineStartsBar: false });
    expect(lines[0]!.syllables.map((s) => s.onset)).toEqual(['кр', 'к']);
  });
});

describe('REQ-PAR-4 and warnings', () => {
  it('no | → whole line is one beat + no_beat_separators', () => {
    const { lines, warnings } = parseManual('а\nКАРЛ у КЛА-ры', { lineStartsBar: false });
    expect(show(lines[1]!.beats)).toEqual([['КАРЛ*', 'у', 'КЛА*', 'ры']]);
    expect(warnings).toEqual([
      { code: 'no_beat_separators', line: 0 },
      { code: 'no_beat_separators', line: 1 },
    ]);
  });
  it('line of only pauses without | does not warn', () => {
    expect(parseManual('_ _', { lineStartsBar: false }).warnings).toEqual([]);
  });
  it('digits are removed with digits_removed', () => {
    const { lines, warnings } = parseManual('та 2 | ка', { lineStartsBar: false });
    expect(show(lines[0]!.beats)).toEqual([['та'], ['ка']]);
    expect(warnings).toEqual([{ code: 'digits_removed', line: 0 }]);
  });
});

describe('REQ-PAR-3: pickup «>»', () => {
  const V = '> на дво- | РЕ тра- | ВА на тра- | ВЕ дро- | ВА';
  it('first segment becomes a pickup beat', () => {
    const { lines, warnings } = parseManual(V, { lineStartsBar: true });
    expect(warnings).toEqual([]);
    const line = lines[0]!;
    expect(line.pickupCount).toBe(2);
    expect(line.beats[0]!.pickup).toBe(true);
    expect(line.beats.slice(1).every((b) => !b.pickup)).toBe(true);
    expect(show(line.beats)).toEqual([
      ['на', 'дво'],
      ['РЕ*', 'тра'],
      ['ВА*', 'на', 'тра'],
      ['ВЕ*', 'дро'],
      ['ВА*'],
    ]);
  });
  it('words continue from the pickup into the first beat', () => {
    const { lines } = parseManual(V, { lineStartsBar: true });
    // на | дво-РЕ | тра-ВА | на | тра-ВЕ | дро-ВА
    expect(lines[0]!.syllables.map((s) => s.wordId)).toEqual([0, 1, 1, 2, 2, 3, 4, 4, 5, 5]);
  });
  it('pickupCount counts sounding syllables only', () => {
    const { lines } = parseManual('> _ на | РЕ', { lineStartsBar: true });
    expect(show(lines[0]!.beats)).toEqual([['_', 'на'], ['РЕ*']]);
    expect(lines[0]!.pickupCount).toBe(1);
  });
  it('the first sounding syllable after > counts as the line start for caps (REQ-STR-2)', () => {
    const { lines } = parseManual('> Я | БЕГ', { lineStartsBar: true });
    expect(show(lines[0]!.beats)).toEqual([['Я'], ['БЕГ*']]);
  });
  it('empty pickup segment → no pickup', () => {
    const { lines } = parseManual('> | та | ка', { lineStartsBar: true });
    expect(lines[0]!.pickupCount).toBe(0);
    expect(show(lines[0]!.beats)).toEqual([['та'], ['ка']]);
  });
  it('> without | → no pickup, the line is one beat', () => {
    const { lines, warnings } = parseManual('> на дво', { lineStartsBar: true });
    expect(lines[0]!.pickupCount).toBe(0);
    expect(lines[0]!.beats[0]!.pickup).toBeUndefined();
    expect(warnings).toEqual([{ code: 'no_beat_separators', line: 0 }]);
  });
  it('> only matters at the line start', () => {
    const { lines } = parseManual('та | > ка', { lineStartsBar: true });
    expect(lines[0]!.pickupCount).toBe(0);
  });
});
