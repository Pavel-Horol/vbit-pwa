import { describe, expect, it } from 'vitest';
import {
  clickMask,
  expectedSyllable,
  loopOf,
  micCalibration,
  micCalibrationClicks,
  MIC_CAL_CLICKS,
  scoreLoop,
  type Expected,
} from '@/core/micScore';
import { BEAT_GAIN } from '@/core/timeline';
import type { Syllable, TimelineEvent } from '@/core/types';

const exp = (time: number, stressed = false, halfSlot = 0.1): Expected => ({
  time,
  halfSlot,
  stressed,
  text: 'та',
  key: String(time),
});

describe('REQ-MIC-4: loop score', () => {
  it('all syllables on time → 100%, clean', () => {
    const e = [exp(1, true), exp(1.2), exp(1.4, true), exp(1.6)];
    const s = scoreLoop(e, [1.005, 1.19, 1.41, 1.6], 0);
    expect(s.pct).toBe(100);
    expect(s.onTime).toBe(4);
    expect(s.clean).toBe(true);
    expect(s.marks.map((m) => m.mark)).toEqual(['ok', 'ok', 'ok', 'ok']);
  });

  it('±40 ms is on time; beyond is early / late; nothing within half a slot is missed', () => {
    const e = [exp(1), exp(2), exp(3), exp(4), exp(5)];
    const s = scoreLoop(e, [1.04, 1.96, 3.041, 3.95, 4.89], 0);
    expect(s.marks.map((m) => m.mark)).toEqual(['ok', 'ok', 'late', 'early', 'miss']);
    expect(s.marks[2]!.deltaMs).toBe(41);
    expect(s.marks[3]!.deltaMs).toBe(-50);
    expect(s.marks[4]!.deltaMs).toBeUndefined();
  });

  it('the nearest onset in the window wins', () => {
    const s = scoreLoop([exp(1)], [0.93, 1.02, 1.08], 0);
    expect(s.marks[0]).toMatchObject({ mark: 'ok', deltaMs: 20 });
  });

  it('input offset (speaker → mic round trip) is subtracted', () => {
    const s = scoreLoop([exp(1), exp(1.2)], [1.15, 1.35], 150);
    expect(s.marks.map((m) => m.deltaMs)).toEqual([0, 0]);
    expect(s.pct).toBe(100);
  });

  it('clean needs ≥ 85% on time and every stressed syllable on time', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => exp(1 + i * 0.25, i === 0));
    const onsets = (bad: number) => twenty.map((e, i) => e.time + (i >= 20 - bad ? 0.07 : 0));
    expect(scoreLoop(twenty, onsets(3), 0).clean).toBe(true); // 17 / 20 = 85%
    expect(scoreLoop(twenty, onsets(4), 0).clean).toBe(false); // 80%
    const lateStress = twenty.map((e, i) => e.time + (i === 0 ? 0.07 : 0));
    const s = scoreLoop(twenty, lateStress, 0);
    expect(s.pct).toBe(95);
    expect(s.clean).toBe(false);
  });

  it('mean offset is over the syllables that were heard', () => {
    const s = scoreLoop([exp(1), exp(2), exp(3)], [1.02, 2.06], 0);
    expect(s.meanOffsetMs).toBe(40);
    expect(scoreLoop([exp(1)], [], 0).meanOffsetMs).toBeNull();
  });

  it('REQ-MIC-6 fallback: stressed syllables only', () => {
    const e = [exp(1, true), exp(1.2), exp(1.4, true)];
    const s = scoreLoop(e, [1, 1.4], 0, { stressedOnly: true });
    expect(s.marks.map((m) => m.key)).toEqual(['1', '1.4']);
    expect(s.pct).toBe(100);
    expect(s.clean).toBe(true);
  });

  it('empty loop is never clean', () => {
    expect(scoreLoop([], [1], 0)).toMatchObject({ pct: 0, total: 0, clean: false });
  });
});

describe('REQ-MIC-4: expected syllables from timeline events', () => {
  const syl = (text: string, stressed = false, wordId = 0): Syllable => ({
    text,
    stressed,
    wordId,
    onset: '',
    stressSource: 'none',
  });
  const ev = (bar: number, beat: number, slot: number, slots: number): TimelineEvent => ({
    time: 5,
    bar,
    beat,
    slot,
    slots,
    kind: 'unstressed',
    gain: 0.1,
  });

  it('half a slot at the current tempo, key is the position inside the loop', () => {
    const e = expectedSyllable(ev(3, 1, 1, 2), syl('КРАЛ', true), 90, 2);
    expect(e).toEqual({
      time: 5,
      halfSlot: 60 / 90 / 2 / 2,
      stressed: true,
      text: 'КРАЛ',
      key: '0:1:1',
    });
  });

  it('pauses and the count-in are not expected', () => {
    expect(expectedSyllable(ev(1, 0, 0, 1), syl(''), 90, 1)).toBeNull();
    expect(expectedSyllable(ev(0, 3, 0, 1), syl('1', false, -1), 90, 1)).toBeNull();
    expect(expectedSyllable(ev(1, 0, 0, 1), undefined, 90, 1)).toBeNull();
  });

  it('loops start after the count-in bar', () => {
    expect([0, 1, 2, 3, 4].map((b) => loopOf(b, 2))).toEqual([-1, 0, 0, 1, 1]);
  });
});

describe('REQ-MIC-3: input calibration', () => {
  const clicks = micCalibrationClicks(2);
  const heard = (delaysMs: (number | null)[], level = -30) =>
    delaysMs.flatMap((d, i) => (d === null ? [] : [{ time: clicks[i]! + d / 1000, level }]));

  it('8 clicks at 90 BPM', () => {
    expect(clicks).toHaveLength(MIC_CAL_CLICKS);
    expect(clicks[1]! - clicks[0]!).toBeCloseTo(60 / 90, 9);
  });

  it('median delay of heard clicks and their median level', () => {
    const r = micCalibration(clicks, heard([118, 120, 122, 121, null, 119, 300, 120]));
    expect(r).toEqual({ ok: true, offsetMs: 120, clickLevel: -30, found: 7 });
  });

  it('noise between clicks does not count, the loudest onset near a click does', () => {
    const onsets = [
      ...heard([100, 100, 100, 100, 100, 100, 100, 100]),
      { time: clicks[2]! + 0.03, level: -60 },
    ];
    expect(micCalibration(clicks, onsets)).toMatchObject({ ok: true, offsetMs: 100 });
  });

  it('fewer than 5 heard clicks → not_heard', () => {
    const r = micCalibration(clicks, heard([100, 100, 100, 100, null, null, null, null]));
    expect(r).toEqual({ ok: false, error: 'not_heard', found: 4 });
  });

  it('scattered delays → unstable', () => {
    const r = micCalibration(clicks, heard([50, 200, 90, 300, 120, 400, 60, 250]));
    expect(r).toMatchObject({ ok: false, error: 'unstable' });
  });
});

describe('click masks (stage 4 decision A)', () => {
  it('window around the heard click, level scales with the tick gain', () => {
    const m = clickMask(10, BEAT_GAIN, 120, -30);
    expect(m.start).toBeCloseTo(10.12 - 0.015, 9);
    expect(m.end).toBeCloseTo(10.12 + 0.06, 9);
    expect(m.minLevel).toBeCloseTo(-24, 9);
    expect(clickMask(10, BEAT_GAIN / 2, 120, -30).minLevel).toBeCloseTo(-24 - 6.02, 2);
  });
});
