import { describe, expect, it } from 'vitest';
import {
  BPM_MAX,
  BPM_MIN,
  baseMix,
  beatEvents,
  clampBpm,
  countInBar,
  createClock,
  loopBars,
  schedule,
  withCountIn,
} from '@/core/timeline';
import { drillBar } from '@/core/patterns';
import { layout } from '@/core/layout';
import type { Bar, TimelineEvent } from '@/core/types';
import { seeded } from './helpers';

const mix = baseMix(1);
const karl = layout({
  raw: 'КАРЛ у | КЛА-ры у- | КРАЛ ко- | РАЛ-лы',
  mode: 'manual',
  perBeat: 2,
  lineStartsBar: true,
  stressOverrides: {},
}).bars[0]!;

describe('REQ-TL-1/2/3: beatEvents', () => {
  it('slot s of n is at beatStart + s * spb / n', () => {
    const ev = beatEvents(karl, 0, 1, 10, 0.6, mix);
    expect(ev.map((e) => e.time)).toEqual([10, 10.2, 10.4]);
    expect(ev.map((e) => e.slots)).toEqual([3, 3, 3]);
    expect(ev.map((e) => e.slot)).toEqual([0, 1, 2]);
  });

  it('kind: downbeat on beat 0, beat on others, then stressed / unstressed / rest', () => {
    expect(beatEvents(karl, 0, 0, 0, 1, mix).map((e) => e.kind)).toEqual([
      'downbeat',
      'unstressed',
    ]);
    expect(beatEvents(karl, 0, 2, 0, 1, mix).map((e) => e.kind)).toEqual(['beat', 'unstressed']);
    const bar: Bar = layout({
      raw: 'та ТА _ | та',
      mode: 'manual',
      perBeat: 2,
      lineStartsBar: true,
      stressOverrides: {},
    }).bars[0]!;
    expect(beatEvents(bar, 0, 0, 0, 1, mix).map((e) => e.kind)).toEqual([
      'downbeat',
      'stressed',
      'rest',
    ]);
  });

  it('gain comes from Mix, rest has gain 0 but still produces an event', () => {
    const m = { downbeat: 0.9, beat: 0.8, stressed: 0.3, unstressed: 0.1 };
    const bar: Bar = layout({
      raw: 'та ТА _ | та ка',
      mode: 'manual',
      perBeat: 2,
      lineStartsBar: true,
      stressOverrides: {},
    }).bars[0]!;
    expect(beatEvents(bar, 0, 0, 0, 1, m).map((e) => e.gain)).toEqual([0.9, 0.3, 0]);
    expect(beatEvents(bar, 0, 1, 0, 1, m).map((e) => e.gain)).toEqual([0.8, 0.1]);
  });

  it('a pause on slot 0 still clicks the beat (stage 1 decision)', () => {
    const silent = loopBars([])(0);
    const ev = beatEvents(silent, 0, 0, 0, 1, mix);
    expect(ev).toHaveLength(1);
    expect(ev[0]!.kind).toBe('downbeat');
    expect(ev[0]!.gain).toBe(mix.downbeat);
  });
});

describe('REQ-TL-4 / REQ-AUD-4: scheduler', () => {
  it('at 90 BPM beat #4000 starts at 4000 * 60/90 (±1e-6 s); events strictly increase', () => {
    let clock = createClock(0);
    const rng = seeded(3);
    const memo = new Map<number, Bar>();
    const getBar = (i: number) => {
      if (!memo.has(i)) memo.set(i, drillBar('auto', 'rand', i, rng));
      return memo.get(i)!;
    };
    let prev = -Infinity;
    let beat4000: TimelineEvent | undefined;
    // Имитируем тики планировщика: горизонт сдвигается на 25 мс, lookahead 0.12 с.
    for (let now = 0; !beat4000; now += 0.025) {
      const r = schedule(clock, now + 0.12, 90, getBar, mix);
      clock = r.clock;
      for (const e of r.events) {
        expect(e.time).toBeGreaterThan(prev);
        prev = e.time;
        if (e.bar * 4 + e.beat === 4000 && e.slot === 0) beat4000 = e;
      }
    }
    expect(Math.abs(beat4000!.time - (4000 * 60) / 90)).toBeLessThan(1e-6);
  });

  it('schedules every beat whose start is before the horizon, and nothing after it', () => {
    const r = schedule(createClock(1), 2.0, 60, () => karl, mix);
    expect(r.events.filter((e) => e.slot === 0).map((e) => e.time)).toEqual([1]);
    expect(r.clock).toEqual({ next: 2, bar: 0, beat: 1 });
  });

  it('BPM change applies from the next beat', () => {
    let r = schedule(createClock(0), 0.01, 60, () => karl, mix);
    expect(r.clock.next).toBe(1);
    r = schedule(r.clock, 1.01, 120, () => karl, mix);
    expect(r.events[0]!.time).toBe(1);
    expect(r.clock.next).toBe(1.5);
  });

  it('bar index advances after 4 beats', () => {
    const r = schedule(createClock(0), 4.5, 60, () => karl, mix);
    const firsts = r.events.filter((e) => e.slot === 0).map((e) => [e.bar, e.beat]);
    expect(firsts).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 0],
    ]);
  });
});

describe('REQ-AUD-9: count-in and looping', () => {
  it('count-in bar is 1 2 3 4, one slot per beat', () => {
    expect(countInBar().map((b) => b.syllables.map((s) => s.text))).toEqual([
      ['1'],
      ['2'],
      ['3'],
      ['4'],
    ]);
    const ev = [0, 1, 2, 3].flatMap((b) => beatEvents(countInBar(), 0, b, b, 1, mix));
    expect(ev.map((e) => e.kind)).toEqual(['downbeat', 'beat', 'beat', 'beat']);
  });

  it('withCountIn puts the count-in before bar 0, then loops the text', () => {
    const g = withCountIn(loopBars([karl]));
    expect(g(0)[0].syllables[0]!.text).toBe('1');
    expect(g(1)).toBe(karl);
    expect(g(5)).toBe(karl);
  });

  it('loopBars of an empty layout gives a silent bar', () => {
    const bar = loopBars([])(3);
    expect(bar.every((b) => b.syllables.length === 1 && b.syllables[0]!.text === '')).toBe(true);
  });
});

describe('mix and tempo', () => {
  it('baseMix: unstressed ticks 0.14 × tickVolume × multiplier', () => {
    expect(baseMix(1)).toEqual({ downbeat: 0.55, beat: 0.55, stressed: 0.14, unstressed: 0.14 });
    expect(baseMix(0.5).unstressed).toBeCloseTo(0.07);
    expect(baseMix(1, 0).unstressed).toBe(0);
  });
  it('clampBpm keeps 40..180 and rounds', () => {
    expect([clampBpm(10), clampBpm(80.4), clampBpm(500)]).toEqual([BPM_MIN, 80, BPM_MAX]);
  });
});
