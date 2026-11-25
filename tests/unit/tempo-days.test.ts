import { describe, expect, it } from 'vitest';
import { tapTempo } from '@/core/tempo';
import { addDay, dayKey, streak } from '@/core/days';

describe('REQ-MET-1: tap tempo', () => {
  it('needs at least 3 taps', () => {
    let r = tapTempo([], 0);
    expect(r.bpm).toBeUndefined();
    r = tapTempo(r.taps, 500);
    expect(r.bpm).toBeUndefined();
    r = tapTempo(r.taps, 1000);
    expect(r.bpm).toBe(120);
  });
  it('averages the taps inside the 3 s window', () => {
    let taps: number[] = [];
    let bpm: number | undefined;
    for (const t of [0, 750, 1500, 2250]) ({ taps, bpm } = tapTempo(taps, t));
    expect(bpm).toBe(80);
  });
  it('drops taps older than 3 s', () => {
    const r = tapTempo([0, 1000, 5000, 5500], 6000);
    expect(r.taps).toEqual([5000, 5500, 6000]);
    expect(r.bpm).toBe(120);
  });
  it('clamps to 40..180', () => {
    expect(tapTempo([0, 100], 200).bpm).toBe(180);
  });
});

describe('REQ-SES-6: days and streak', () => {
  const today = new Date(2026, 10, 25, 15, 0);
  it('dayKey uses local date', () => {
    expect(dayKey(today)).toBe('2026-11-25');
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('addDay does not duplicate', () => {
    expect(addDay(['2026-11-25'], '2026-11-25')).toEqual(['2026-11-25']);
    expect(addDay([], '2026-11-25')).toEqual(['2026-11-25']);
  });
  it('streak ends today', () => {
    expect(streak(['2026-11-23', '2026-11-24', '2026-11-25'], today)).toBe(3);
  });
  it('streak ending yesterday still counts', () => {
    expect(streak(['2026-11-23', '2026-11-24'], today)).toBe(2);
  });
  it('a gap breaks the streak', () => {
    expect(streak(['2026-11-21', '2026-11-25'], today)).toBe(1);
    expect(streak(['2026-11-20'], today)).toBe(0);
  });
  it('crosses month boundaries', () => {
    expect(streak(['2026-10-31', '2026-11-01'], new Date(2026, 10, 1))).toBe(2);
  });
});
