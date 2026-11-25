import { describe, expect, it } from 'vitest';
import {
  completedLoops,
  drillLayout,
  initialProgress,
  lowestStageLine,
  mixForStage,
  nextState,
  progressAt,
  remapProgress,
  renderModeForStage,
  startBpm,
} from '@/core/ladder';
import type { LadderStage, LineProgress } from '@/core/types';

const lp = (over: Partial<LineProgress> = {}): LineProgress => ({
  stage: 1,
  bpm: 70,
  cleanStreak: 0,
  failStreak: 0,
  ...over,
});
const run = (s: LineProgress, results: ('clean' | 'fail')[], target = 100) =>
  results.reduce((acc, r) => nextState(acc, r, target), s);

describe('REQ-LAD-1: stage table', () => {
  it('mixForStage: unstressed multiplier 1 / 1 / 0.5 / 0 / 0 / 0, stressed click on 1–4', () => {
    const m = (s: LadderStage) => mixForStage(s, 1);
    expect([1, 2, 3, 4, 5, 6].map((s) => m(s as LadderStage).unstressed)).toEqual([
      0.14, 0.14, 0.07, 0, 0, 0,
    ]);
    expect([1, 2, 3, 4, 5, 6].map((s) => m(s as LadderStage).stressed)).toEqual([
      0.33, 0.33, 0.33, 0.33, 0, 0,
    ]);
    expect(m(5)).toMatchObject({ downbeat: 0.55, beat: 0.55 });
  });
  it('mixForStage multiplies the base tick volume', () => {
    expect(mixForStage(1, 0.5).unstressed).toBeCloseTo(0.07);
    expect(mixForStage(3, 0.5).unstressed).toBeCloseTo(0.035);
  });
  it('renderModeForStage', () => {
    expect([1, 2, 3, 4, 5, 6].map((s) => renderModeForStage(s as LadderStage))).toEqual([
      'skeleton',
      'syllables',
      'words',
      'words',
      'karaoke',
      'memory',
    ]);
  });
});

describe('REQ-LAD-2: nextState', () => {
  it('stage starts at round(target × 0.7), never below 40', () => {
    expect(startBpm(100)).toBe(70);
    expect(startBpm(85)).toBe(60);
    expect(startBpm(50)).toBe(40);
    expect(initialProgress(90)).toEqual({ stage: 1, bpm: 63, cleanStreak: 0, failStreak: 0 });
  });

  it('clean: cleanStreak++, failStreak reset', () => {
    expect(nextState(lp({ failStreak: 1 }), 'clean', 100)).toEqual(lp({ cleanStreak: 1 }));
  });

  it('3 clean → bpm × 1.05 rounded, streak reset', () => {
    expect(run(lp(), ['clean', 'clean', 'clean'])).toEqual(lp({ bpm: 74 }));
  });

  it('speed-up is capped at the target', () => {
    expect(run(lp({ bpm: 98 }), ['clean', 'clean', 'clean'])).toEqual(lp({ bpm: 100 }));
  });

  it('3 clean at the target → next stage at 70% of the target', () => {
    expect(run(lp({ stage: 2, bpm: 100 }), ['clean', 'clean', 'clean'])).toEqual(
      lp({ stage: 3, bpm: 70 }),
    );
  });

  it('stage 6 is the maximum', () => {
    expect(run(lp({ stage: 6, bpm: 100 }), ['clean', 'clean', 'clean'])).toEqual(
      lp({ stage: 6, bpm: 70 }),
    );
  });

  it('fail: failStreak++, cleanStreak reset', () => {
    expect(nextState(lp({ cleanStreak: 2 }), 'fail', 100)).toEqual(lp({ failStreak: 1 }));
  });

  it('2 fails → bpm × 0.95 rounded, streak reset', () => {
    expect(run(lp(), ['fail', 'fail'])).toEqual(lp({ bpm: 67 }));
  });

  it('slow-down never goes below 40', () => {
    expect(run(lp({ bpm: 41 }), ['fail', 'fail'])).toEqual(lp({ bpm: 40 }));
    expect(run(lp({ bpm: 40 }), ['fail', 'fail'])).toEqual(lp({ bpm: 40 }));
  });

  it('a clean between fails resets the fail streak', () => {
    expect(run(lp(), ['fail', 'clean', 'fail'])).toEqual(lp({ failStreak: 1 }));
  });

  it('a full climb from 70 to the target and to stage 2', () => {
    let s = lp();
    const seen: number[] = [];
    while (s.stage === 1) {
      s = run(s, ['clean', 'clean', 'clean']);
      seen.push(s.bpm);
    }
    expect(seen).toEqual([74, 78, 82, 86, 90, 95, 100, 70]);
    expect(s.stage).toBe(2);
  });

  it('does not mutate its input', () => {
    const s = lp();
    nextState(s, 'clean', 100);
    expect(s).toEqual(lp());
  });
});

describe('REQ-LAD-5: progress follows line content', () => {
  const p = (stage: LadderStage) => lp({ stage });

  it('unchanged lines keep progress, changed ones restart', () => {
    const out = remapProgress('раз\nдва\nтри', 'раз\nДВА!\nтри', [p(3), p(4), p(5)], 100);
    expect(out.map((x) => x.stage)).toEqual([3, 1, 5]);
  });

  it('inserting a line does not reset the lines after it', () => {
    const out = remapProgress('раз\nдва', 'раз\nновая\nдва', [p(3), p(4)], 100);
    expect(out.map((x) => x.stage)).toEqual([3, 1, 4]);
  });

  it('empty lines and surrounding spaces do not matter', () => {
    const out = remapProgress('раз\nдва', '\n  раз  \n\nдва', [p(2), p(6)], 100);
    expect(out.map((x) => x.stage)).toEqual([2, 6]);
  });

  it('duplicate lines are matched in order', () => {
    const out = remapProgress('ля\nля', 'ля\nля\nля', [p(2), p(3)], 100);
    expect(out.map((x) => x.stage)).toEqual([2, 3, 1]);
  });

  it('missing old progress counts as a fresh line', () => {
    const out = remapProgress('раз\nдва', 'раз\nдва', [p(2)], 90);
    expect(out).toEqual([p(2), initialProgress(90)]);
  });
});

describe('REQ-SES-5: line to drill', () => {
  it('progressAt falls back to a fresh line', () => {
    expect(progressAt([], 2, 100)).toEqual(initialProgress(100));
  });
  it('lowestStageLine picks the lowest stage, first on ties', () => {
    expect(lowestStageLine(3, [lp({ stage: 3 }), lp({ stage: 2 }), lp({ stage: 2 })])).toBe(1);
    expect(lowestStageLine(3, [lp({ stage: 3 })])).toBe(1);
    expect(lowestStageLine(0, [])).toBe(-1);
  });
});

describe('REQ-LAD-3: loops', () => {
  it('completedLoops: bar 0 is the count-in, a loop ends when the next one starts', () => {
    expect([0, 1, 2, 3, 4, 5, 7].map((b) => completedLoops(b, 2))).toEqual([0, 0, 0, 1, 1, 2, 3]);
  });
  it('drillLayout: selected lines only, always from a new bar, with the loop pickup', () => {
    const r = drillLayout(
      {
        raw: 'та | та\n\n> на | ТЫ\nко',
        mode: 'manual',
        perBeat: 2,
        lineStartsBar: false,
        stressOverrides: {},
      },
      1,
      1,
    );
    expect(r.loop.map((bar) => bar.map((b) => b.syllables.map((s) => s.text || '_')))).toEqual([
      [['ТЫ'], ['_'], ['_'], ['_', 'на']],
    ]);
    expect(r.pickup?.syllables.map((s) => s.text || '_')).toEqual(['_', 'на']);
    expect(r.lines).toHaveLength(1);
  });
  it('drillLayout clips the range to the text', () => {
    const r = drillLayout(
      { raw: 'та\nка', mode: 'auto', perBeat: 1, lineStartsBar: false, stressOverrides: {} },
      1,
      4,
    );
    expect(r.lines).toHaveLength(1);
  });
});
