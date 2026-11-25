import { describe, expect, it } from 'vitest';
import { layout, type LayoutInput } from '@/core/layout';
import type { Bar, Beat, StressDict } from '@/core/types';

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
  it('«Шла Саша…» perBeat 2 → 2 bars, tail padded with pause beats (шла: one-syllable rule)', () => {
    const r = layout(input('Шла Саша по шоссе и сосала сушку'));
    expect(show(r.bars)).toEqual([
      [
        ['Шла*', 'Са'],
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

// --- этап 2 ---

const DICT: StressDict = {
  lookup: (w) =>
    (
      ({
        саша: [0],
        шоссе: [1],
        сосала: [1],
        сушку: [0],
        мама: [0],
        дворе: [1],
        траве: [1],
        дрова: [1],
        замок: [0, 1],
      }) as Record<string, number[]>
    )[w],
};
const showBeat = (b: Beat | undefined) =>
  b && b.syllables.map((s) => (s.text === '' ? '_' : s.text + (s.stressed ? '*' : '')));

describe('REQ-LAY-3: pickup', () => {
  const V = '> на дво- | РЕ тра- | ВА на тра- | ВЕ дро- | ВА';

  it('first line: pickup goes to the count-in, bars start on the stressed beat', () => {
    const r = layout(input(V, { mode: 'manual' }));
    expect(show(r.bars)).toEqual([[['РЕ*', 'тра'], ['ВА*', 'на', 'тра'], ['ВЕ*', 'дро'], ['ВА*']]]);
    expect(showBeat(r.pickup)).toEqual(['на', 'дво']);
    expect(r.pickup!.pickup).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('pickup beat has max(p, 2) slots for p ≤ 4, else p', () => {
    const p = (seg: string) => showBeat(layout(input(`> ${seg} | ТА`, { mode: 'manual' })).pickup);
    expect(p('на')).toEqual(['_', 'на']);
    expect(p('на на')).toEqual(['на', 'на']);
    expect(p('на на на')).toEqual(['на', 'на', 'на']);
    expect(p('на на на на')).toEqual(['на', 'на', 'на', 'на']);
    expect(p('на на на на на')).toEqual(['на', 'на', 'на', 'на', 'на']);
  });

  it('later line: pickup replaces the pause beat before it', () => {
    const r = layout(input('ТА | ТА\n> на | ТЫ', { mode: 'manual' }));
    expect(show(r.bars)).toEqual([
      [['ТА*'], ['ТА*'], ['_'], ['_', 'на']],
      [['ТЫ*'], ['_'], ['_'], ['_']],
    ]);
    expect(r.warnings).toEqual([]);
  });

  it('lineStartsBar + previous line fills the bar → a whole pause bar + pickup_shifted', () => {
    const r = layout(input('ТА | ТА | ТА | ТА\n> на | ТЫ', { mode: 'manual' }));
    expect(show(r.bars)).toEqual([
      [['ТА*'], ['ТА*'], ['ТА*'], ['ТА*']],
      [['_'], ['_'], ['_'], ['_', 'на']],
      [['ТЫ*'], ['_'], ['_'], ['_']],
    ]);
    expect(r.warnings).toEqual([{ code: 'pickup_shifted', line: 1 }]);
  });

  it('lines run on: previous beat sounds → one pause beat inserted + pickup_shifted', () => {
    const r = layout(input('ТА | ТА\n> на | ТЫ', { mode: 'manual', lineStartsBar: false }));
    expect(show(r.bars)).toEqual([[['ТА*'], ['ТА*'], ['_', 'на'], ['ТЫ*']]]);
    expect(r.warnings).toEqual([{ code: 'pickup_shifted', line: 1 }]);
  });

  it('lines run on: previous beat is a pause → replaced, no warning', () => {
    const r = layout(input('ТА | _\n> на | ТЫ', { mode: 'manual', lineStartsBar: false }));
    expect(show(r.bars)).toEqual([[['ТА*'], ['_', 'на'], ['ТЫ*'], ['_']]]);
    expect(r.warnings).toEqual([]);
  });

  it('auto mode ignores >', () => {
    const r = layout(input('> мама мама', { perBeat: 2 }));
    expect(r.pickup).toBeUndefined();
    expect(show(r.bars)[0]![0]).toEqual(['ма', 'ма']);
  });
});

describe('REQ-LAY-2: stress mode', () => {
  const st = (raw: string, over: Partial<LayoutInput> = {}) =>
    layout(input(raw, { mode: 'stress', ...over }), DICT);

  it('«Шла Саша по шоссе и сосала сушку»: a beat per stressed group', () => {
    const r = st('Шла Саша по шоссе и сосала сушку');
    expect(show(r.bars)).toEqual([
      [['Шла*'], ['Са*', 'ша', 'по', 'шо'], ['ссе*', 'и', 'со'], ['са*', 'ла']],
      [['су*', 'шку'], ['_'], ['_'], ['_']],
    ]);
    expect(r.pickup).toBeUndefined();
    expect(r.warnings).toEqual([]);
  });

  it('unstressed syllables before the first stress are the pickup', () => {
    const r = st('и сосала');
    expect(showBeat(r.pickup)).toEqual(['и', 'со']);
    expect(show(r.bars)[0]![0]).toEqual(['са*', 'ла']);
    expect(r.lines[0]!.pickupCount).toBe(2);
  });

  it('«на дворе трава, на траве дрова»: SPEC pickup example', () => {
    const r = st('на дворе трава на траве дрова', {
      stressOverrides: { трава: 1 },
    });
    expect(showBeat(r.pickup)).toEqual(['на', 'дво']);
    expect(show(r.bars)).toEqual([[['ре*', 'тра'], ['ва*', 'на', 'тра'], ['ве*', 'дро'], ['ва*']]]);
  });

  it('group of k > 4 → ceil(k/4) beats, remainder to the first beats', () => {
    const sizes = (k: number) =>
      st(`мама ${'ку'.repeat(k - 2)}`)
        .bars.flat()
        .filter((b) => b.syllables[0]!.text !== '')
        .map((b) => b.syllables.length);
    // «мама» (2) + неизвестное слово из k−2 слогов → одна группа из k слогов
    expect(sizes(5)).toEqual([3, 2]);
    expect(sizes(8)).toEqual([4, 4]);
    expect(sizes(9)).toEqual([3, 3, 3]);
    expect(sizes(10)).toEqual([4, 3, 3]);
  });

  it('line without stress → auto with 2 per beat + no_stress', () => {
    const r = st('кукуруза');
    expect(show(r.bars)).toEqual([[['ку', 'ку'], ['ру', 'за'], ['_'], ['_']]]);
    expect(r.warnings).toEqual([{ code: 'no_stress', line: 0 }]);
  });

  it('homographs do not give stress', () => {
    expect(st('замок').warnings).toEqual([{ code: 'no_stress', line: 0 }]);
  });

  it('one-syllable rule works before the dictionary is loaded', () => {
    const r = layout(input('Шла кукуруза', { mode: 'stress' }));
    expect(show(r.bars)[0]!.slice(0, 2)).toEqual([
      ['Шла*', 'ку', 'ку'],
      ['ру', 'за'],
    ]);
  });
});

describe('REQ-STR-6: dictionary in modes', () => {
  it('auto uses the dictionary for stress marks', () => {
    const r = layout(input('сосала', { perBeat: 3 }), DICT);
    expect(show(r.bars)[0]![0]).toEqual(['со', 'са*', 'ла']);
  });
  it('manual ignores the dictionary', () => {
    const r = layout(input('со-са-ла', { mode: 'manual' }), DICT);
    expect(show(r.bars)[0]![0]).toEqual(['со', 'са', 'ла']);
  });
});

describe('lines keep the index of non-empty input lines', () => {
  it('punctuation-only line still has a Line (empty)', () => {
    const r = layout(input('мама\n!!!\nмама'));
    expect(r.lines).toHaveLength(3);
    expect(r.lines[1]!.beats).toEqual([]);
  });
});
