import { describe, expect, it } from 'vitest';
import { createOnsetDetector, detectOnsets } from '@/core/onset';
import { addClick, addSyllable, noise, SR } from './signals';

const times = (xs: { time: number }[]) => xs.map((x) => x.time);

/** Каждое ожидаемое время найдено ровно одним онсетом с ошибкой ≤ tolMs. */
function expectMatches(found: number[], expected: number[], tolMs: number) {
  expect(found).toHaveLength(expected.length);
  expected.forEach((t, i) => expect(Math.abs(found[i]! - t) * 1000).toBeLessThanOrEqual(tolMs));
}

describe('REQ-MIC-2: onset detector', () => {
  it('finds separate syllables within 8 ms', () => {
    const buf = noise(2.5, 0.002);
    const at = [0.5, 1.0, 1.5, 2.0];
    at.forEach((t) => addSyllable(buf, t));
    expectMatches(times(detectOnsets(buf, SR)), at, 8);
  });

  it('finds connected syllables with only a dip between them (fast reading)', () => {
    const buf = noise(2, 0.002);
    // 8 слогов по 110 мс подряд: между ними энергия падает, но не до тишины
    const at = Array.from({ length: 8 }, (_, i) => 0.4 + i * 0.11);
    at.forEach((t) => addSyllable(buf, t, { dur: 0.11, attack: 0.012 }));
    expectMatches(times(detectOnsets(buf, SR)), at, 12);
  });

  it('quiet and loud syllables in the same take', () => {
    const buf = noise(2, 0.001);
    const at = [0.4, 0.8, 1.2, 1.6];
    at.forEach((t, i) => addSyllable(buf, t, { amp: i % 2 ? 0.03 : 0.4 }));
    expectMatches(times(detectOnsets(buf, SR)), at, 10);
  });

  it('noise alone gives no onsets', () => {
    expect(detectOnsets(noise(3, 0.01, 7), SR)).toEqual([]);
  });

  it('two attacks closer than the refractory time count once', () => {
    const buf = noise(1.5, 0.002);
    addSyllable(buf, 0.5, { dur: 0.03, attack: 0.003 });
    addSyllable(buf, 0.53, { amp: 0.6 });
    expect(detectOnsets(buf, SR)).toHaveLength(1);
  });

  it('streaming in 128-sample blocks gives the same onsets as one batch, times follow startTime', () => {
    const buf = noise(2, 0.002, 3);
    [0.3, 0.7, 1.25].forEach((t) => addSyllable(buf, t));
    const batch = detectOnsets(buf, SR, 10);
    const det = createOnsetDetector(SR);
    const streamed = [];
    for (let i = 0; i < buf.length; i += 128)
      streamed.push(...det.push(buf.subarray(i, i + 128), 10 + i / SR));
    streamed.push(...det.flush());
    expect(times(streamed)).toEqual(times(batch));
    expectMatches(times(batch), [10.3, 10.7, 11.25], 8);
  });

  it('click onset time is accurate (used by mic calibration)', () => {
    const buf = noise(2, 0.002);
    const at = [0.5, 1.0, 1.5];
    at.forEach((t) => addClick(buf, t, 950, 0.5));
    expectMatches(times(detectOnsets(buf, SR)), at, 5);
  });

  it('a mask hides a click quieter than its minimum level, a louder voice still passes', () => {
    const click = noise(1.5, 0.002);
    addClick(click, 0.5, 950, 0.3);
    const [c] = detectOnsets(click, SR);
    expect(c).toBeDefined();
    const mask = { start: 0.48, end: 0.56, minLevel: c!.level + 6 };
    expect(detectOnsets(click, SR, 0, { masks: [mask] })).toEqual([]);

    const both = noise(1.5, 0.002);
    addClick(both, 0.5, 950, 0.3);
    addSyllable(both, 0.5, { amp: 1.2 });
    expectMatches(times(detectOnsets(both, SR, 0, { masks: [mask] })), [0.5], 8);
  });

  it('notch filters cut metronome tones more than a voice', () => {
    const level = (buf: Float32Array, notch: boolean) =>
      detectOnsets(buf, SR, 0, notch ? {} : { notchHz: [] })[0]!.level;
    const click = noise(1, 0.0005);
    addClick(click, 0.5, 950, 0.3);
    const voice = noise(1, 0.0005);
    addSyllable(voice, 0.5, { amp: 0.3 });
    const clickCut = level(click, false) - level(click, true);
    const voiceCut = level(voice, false) - level(voice, true);
    expect(clickCut - voiceCut).toBeGreaterThan(3);
  });
});
