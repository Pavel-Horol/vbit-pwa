import { describe, expect, it } from 'vitest';
import { layout, type LayoutInput } from '@/core/layout';
import type { Bar } from '@/core/types';

const input = (raw: string, over: Partial<LayoutInput> = {}): LayoutInput => ({
  raw,
  mode: 'auto',
  perBeat: 2,
  lineStartsBar: true,
  stressOverrides: {},
  ...over,
});

const show = (bars: Bar[]) =>
  bars.map((bar) =>
    bar.map((b) =>
      b.syllables.map((s) => (s.text === '' ? '_' : s.text + (s.stressed ? '*' : ''))),
    ),
  );

describe('REQ-LAY: manual', () => {
  it('«Карл у Клары» → 1 bar, 4 beats', () => {
    const r = layout(input('КАРЛ у | КЛА-ры у- | КРАЛ ко- | РАЛ-лы', { mode: 'manual' }));
    expect(show(r.bars)).toEqual([
      [
        ['КАРЛ*', 'у'],
        ['КЛА*', 'ры', 'у'],
        ['КРАЛ*', 'ко'],
        ['РАЛ*', 'лы'],
      ],
    ]);
    expect(r.warnings).toEqual([]);
  });

  it('passes manual warnings through', () => {
    const r = layout(input('та ка', { mode: 'manual' }));
    expect(r.warnings).toEqual([{ code: 'no_beat_separators', line: 0 }]);
    expect(show(r.bars)).toEqual([[['та', 'ка'], ['_'], ['_'], ['_']]]);
  });
});

describe('REQ-LAY-1: auto', () => {
  it('«Шла Саша…» perBeat 2 → 2 bars, tail padded with pause beats', () => {
    const r = layout(input('Шла Саша по шоссе и сосала сушку'));
    expect(show(r.bars)).toEqual([
      [
        ['Шла', 'Са'],
        ['ша', 'по'],
        ['шо', 'ссе'],
        ['и', 'со'],
      ],
      [['са', 'ла'], ['су', 'шку'], ['_'], ['_']],
    ]);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]!.syllables).toHaveLength(12);
  });

  it('last beat of a line is padded to perBeat with pauses', () => {
    const r = layout(input('мама мыла', { perBeat: 3 }));
    expect(show(r.bars)[0]!.slice(0, 2)).toEqual([
      ['ма', 'ма', 'мы'],
      ['ла', '_', '_'],
    ]);
  });

  it('perBeat 1 and 4', () => {
    expect(show(layout(input('мама', { perBeat: 1 })).bars)).toEqual([
      [['ма'], ['ма'], ['_'], ['_']],
    ]);
    expect(show(layout(input('мама', { perBeat: 4 })).bars)).toEqual([
      [['ма', 'ма', '_', '_'], ['_'], ['_'], ['_']],
    ]);
  });

  it('ё gives stress in auto', () => {
    const r = layout(input('пришёл', { perBeat: 2 }));
    expect(show(r.bars)[0]![0]).toEqual(['при', 'шёл*']);
  });

  it('digits → digits_removed with the line index', () => {
    const r = layout(input('мама\nв 2 раза'));
    expect(r.warnings).toEqual([{ code: 'digits_removed', line: 1 }]);
  });

  it('word ids are unique across lines', () => {
    const r = layout(input('мама\nмама'));
    const ids = r.lines.flatMap((l) => l.syllables.map((s) => s.wordId));
    expect(ids).toEqual([0, 0, 1, 1]);
  });

  it('punctuation-only line gives no beats', () => {
    expect(layout(input('!!!')).bars).toEqual([]);
  });
});

describe('REQ-LAY-4: lineStartsBar', () => {
  it('true: every line starts a new bar', () => {
    const r = layout(input('мама\nпапа', { perBeat: 2 }));
    expect(show(r.bars)).toEqual([
      [['ма', 'ма'], ['_'], ['_'], ['_']],
      [['па', 'па'], ['_'], ['_'], ['_']],
    ]);
  });
  it('false: lines run on, only the final bar is padded', () => {
    const r = layout(input('мама\nпапа', { perBeat: 2, lineStartsBar: false }));
    expect(show(r.bars)).toEqual([[['ма', 'ма'], ['па', 'па'], ['_'], ['_']]]);
  });
  it('a line of exactly 4 beats adds no extra bar', () => {
    const r = layout(input('та | ка | ти | ки\nта', { mode: 'manual' }));
    expect(r.bars).toHaveLength(2);
  });
});

describe('edge cases', () => {
  it('empty input → no bars, no lines', () => {
    expect(layout(input(''))).toEqual({ bars: [], lines: [], warnings: [] });
  });
  it('line of only _ in manual → pause beats', () => {
    expect(show(layout(input('_ | _', { mode: 'manual' })).bars)).toEqual([
      [['_'], ['_'], ['_'], ['_']],
    ]);
  });
});
