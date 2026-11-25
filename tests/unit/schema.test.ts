import { describe, expect, it } from 'vitest';
import { defaultRoot, fromPrototype, migrate, SCHEMA_VERSION } from '@/stores/schema';
import { STEPS, WEEKS, PRESETS } from '@/data';

const ls = (data: Record<string, unknown>) => (k: string) =>
  k in data ? JSON.stringify(data[k]) : null;

describe('REQ-DATA-2: import from prototype localStorage', () => {
  it('no prototype keys → null', () => {
    expect(fromPrototype(() => null)).toBeNull();
  });

  it('maps every key', () => {
    const root = fromPrototype(
      ls({
        vbit_week: 2,
        vbit_text: { mode: 'auto', n: 3, nb: false, text: 'мама мыла раму', bpm: 88 },
        vbit_days: ['2026-11-20', 'мусор', '2026-11-21'],
        vbit_total: 7,
        vbit_breath: 31.4,
        vbit_count: 55,
        vbit_mMode: 'auto',
        vbit_mSet: 'rand',
        vbit_mBpm: 95,
      }),
      123,
    )!;
    expect(root.settings.week).toBe(3);
    expect(root.texts.texts[0]).toMatchObject({
      mode: 'auto',
      perBeat: 3,
      lineStartsBar: false,
      raw: 'мама мыла раму',
      targetBpm: 88,
      updatedAt: 123,
    });
    expect(root.progress).toEqual({
      days: ['2026-11-20', '2026-11-21'],
      sessions: 7,
      breathBestSec: 31.4,
      countBest: 55,
    });
    expect(root.metronome).toEqual({ mode: 'auto', set: 'rand', bpm: 95 });
    expect(root.importedFromPrototype).toBe(true);
  });

  it('week 0..3 → 1..4', () => {
    expect(fromPrototype(ls({ vbit_week: 0 }))!.settings.week).toBe(1);
    expect(fromPrototype(ls({ vbit_week: 3 }))!.settings.week).toBe(4);
  });

  it('partial data keeps defaults for the rest', () => {
    const root = fromPrototype(ls({ vbit_mBpm: 120 }))!;
    expect(root.metronome).toEqual({ mode: 1, set: 'taka', bpm: 120 });
    expect(root.texts.texts[0]!.raw).toBe(PRESETS[0]!.raw);
  });

  it('broken JSON and out-of-range values are ignored or clamped', () => {
    const get = (k: string) =>
      ({ vbit_week: '{oops', vbit_mBpm: '999', vbit_mMode: '7', vbit_count: '-5' })[k] ?? null;
    const root = fromPrototype(get)!;
    expect(root.settings.week).toBe(1);
    expect(root.metronome).toEqual({ mode: 1, set: 'taka', bpm: 180 });
    expect(root.progress.countBest).toBe(0);
  });
});

describe('REQ-DATA-1: schema migration', () => {
  it('garbage → defaults', () => {
    expect(migrate(null)).toEqual(defaultRoot());
    expect(migrate('x')).toEqual(defaultRoot());
  });
  it('round-trips a valid root', () => {
    const root = fromPrototype(ls({ vbit_week: 1, vbit_total: 2 }))!;
    expect(migrate(JSON.parse(JSON.stringify(root)))).toEqual(root);
  });
  it('sets the current schema version', () => {
    expect(migrate({ schemaVersion: 0 }).schemaVersion).toBe(SCHEMA_VERSION);
  });
  it('fixes a dangling currentId', () => {
    const root = defaultRoot();
    expect(migrate({ ...root, texts: { ...root.texts, currentId: 'nope' } }).texts.currentId).toBe(
      'main',
    );
  });
});

describe('REQ-SES-1: steps data', () => {
  it('17 steps, 18.5 minutes, known kinds', () => {
    expect(STEPS).toHaveLength(17);
    expect(STEPS.reduce((s, x) => s + x.durationSec, 0)).toBe(1110);
    expect(STEPS.filter((s) => s.kind).map((s) => s.kind)).toEqual([
      'breath',
      'count',
      'ends',
      'drill',
      'karl',
      'mytext',
    ]);
  });
  it('REQ-SES-2: week BPMs 75/80/85/90', () => {
    expect(WEEKS.map((w) => w.bpm)).toEqual([75, 80, 85, 90]);
  });
});
