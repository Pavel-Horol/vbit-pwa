import { describe, expect, it } from 'vitest';
import { calibrationClicks, calibrationOffset, CAL_CLICKS } from '@/core/calibration';

const clicks = calibrationClicks(10); // 16 щелчков при 90 BPM от t = 10 с
const tapsAt = (ms: number[]) => ms.map((d, i) => clicks[i]! + d / 1000);

describe('REQ-CAL-1: calibration offset', () => {
  it('16 clicks at 90 BPM', () => {
    expect(clicks).toHaveLength(CAL_CLICKS);
    expect(clicks[1]! - clicks[0]!).toBeCloseTo(60 / 90, 9);
  });

  it('first 4 taps are ignored, result is the median of tap − click', () => {
    const taps = tapsAt([
      500, 500, 500, 500, 80, 90, 100, 110, 120, 100, 95, 105, 400, 100, 98, 102,
    ]);
    expect(calibrationOffset(clicks, taps)).toBe(100);
  });

  it('clamped to 0..400', () => {
    expect(calibrationOffset(clicks, tapsAt(Array(16).fill(-50)))).toBe(0);
    expect(calibrationOffset(clicks, tapsAt(Array(16).fill(450)))).toBe(400);
  });

  it('each tap is matched to the latest click no later than 100 ms after it', () => {
    // задержка больше половины интервала (333 мс) всё равно относится к «своему» щелчку
    expect(calibrationOffset(clicks, tapsAt(Array(16).fill(380)))).toBe(380);
  });

  it('missing taps are fine: taps are matched by time, not by order', () => {
    const taps = [0, 1, 2, 3, 5, 7, 9, 11, 13].map((i) => clicks[i]! + 0.06);
    expect(calibrationOffset(clicks, taps)).toBe(60);
  });

  it('fewer than 4 usable taps → null', () => {
    expect(calibrationOffset(clicks, tapsAt([50, 50, 50, 50, 50, 50, 50]))).toBeNull();
  });

  it('taps before the first click are ignored', () => {
    const taps = [...tapsAt(Array(16).fill(70)), clicks[0]! - 1];
    expect(
      calibrationOffset(
        clicks,
        taps.sort((a, b) => a - b),
      ),
    ).toBe(70);
  });
});
