// REQ-LAY-6: снэпшоты раскладки. Формат: такт → доли → слоги, `*` — ударный, `_` — пауза,
// `^` — затакт. Изменения снэпшотов проверять глазами перед `vitest -u`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layout, type LayoutInput } from '@/core/layout';
import { parseStressDict } from '@/core/stressDict';
import type { Beat } from '@/core/types';

const dict = parseStressDict(readFileSync('public/dict/stress.txt', 'utf8'));

const beat = (b: Beat) =>
  (b.pickup ? '^' : '') +
  b.syllables.map((s) => (s.text === '' ? '_' : s.text + (s.stressed ? '*' : ''))).join(' ');

function snap(raw: string, over: Partial<LayoutInput>) {
  const r = layout(
    { raw, mode: 'manual', perBeat: 2, lineStartsBar: true, stressOverrides: {}, ...over },
    dict,
  );
  return {
    pickup: r.pickup ? beat(r.pickup) : null,
    bars: r.bars.map((bar) => bar.map(beat).join(' | ')),
    warnings: r.warnings.map((w) => `${w.line}:${w.code}`),
  };
}

describe('REQ-LAY-6: layout snapshots', () => {
  it('«Карл у Клары» (manual)', () => {
    expect(snap('КАРЛ у | КЛА-ры у- | КРАЛ ко- | РАЛ-лы', {})).toMatchSnapshot();
  });
  it('«Шла Саша по шоссе и сосала сушку» (auto, 2)', () => {
    expect(snap('Шла Саша по шоссе и сосала сушку', { mode: 'auto' })).toMatchSnapshot();
  });
  it('«Шла Саша по шоссе и сосала сушку» (stress)', () => {
    expect(snap('Шла Саша по шоссе и сосала сушку', { mode: 'stress' })).toMatchSnapshot();
  });
  it('pickup: > на дво- | РЕ тра- | ВА на тра- | ВЕ дро- | ВА', () => {
    expect(snap('> на дво- | РЕ тра- | ВА на тра- | ВЕ дро- | ВА', {})).toMatchSnapshot();
  });
  it('line of only _', () => {
    expect(snap('_ _ | _', {})).toMatchSnapshot();
  });
  it('empty input', () => {
    expect(snap('', {})).toMatchSnapshot();
    expect(snap('', { mode: 'auto' })).toMatchSnapshot();
    expect(snap('', { mode: 'stress' })).toMatchSnapshot();
  });
});
