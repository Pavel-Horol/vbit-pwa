import { describe, expect, it } from 'vitest';
import {
  comparisonRecordings,
  pruneRecordings,
  recordingKey,
  upsertRecording,
  type Recording,
} from '@/core/recordings';

const rec = (date: string): Recording => ({ date, blobKey: recordingKey(date) });
const today = new Date(2026, 10, 25); // 25 ноября 2026, локальное время

describe('REQ-MIC-5: daily recordings', () => {
  it('one per day: a new take replaces the same date, list stays sorted', () => {
    const list = upsertRecording([rec('2026-11-20'), rec('2026-11-25')], {
      ...rec('2026-11-25'),
      textId: 't2',
    });
    expect(list).toEqual([rec('2026-11-20'), { ...rec('2026-11-25'), textId: 't2' }]);
    expect(upsertRecording([rec('2026-11-25')], rec('2026-11-21')).map((r) => r.date)).toEqual([
      '2026-11-21',
      '2026-11-25',
    ]);
  });

  it('keeps the last 30 days including today', () => {
    const { keep, drop } = pruneRecordings(
      [rec('2026-10-26'), rec('2026-10-27'), rec('2026-11-25')],
      today,
    );
    expect(keep.map((r) => r.date)).toEqual(['2026-10-27', '2026-11-25']);
    expect(drop.map((r) => r.date)).toEqual(['2026-10-26']);
  });

  it('today and exactly 7 days ago', () => {
    const c = comparisonRecordings(
      [rec('2026-11-18'), rec('2026-11-20'), rec('2026-11-25')],
      today,
    );
    expect(c).toEqual({ today: rec('2026-11-25'), weekAgo: rec('2026-11-18'), weekAgoExact: true });
  });

  it('no take 7 days ago → the newest older one, marked as not exact', () => {
    const c = comparisonRecordings(
      [rec('2026-11-10'), rec('2026-11-15'), rec('2026-11-20')],
      today,
    );
    expect(c).toEqual({ weekAgo: rec('2026-11-15'), weekAgoExact: false });
  });

  it('nothing old enough', () => {
    expect(comparisonRecordings([rec('2026-11-22')], today)).toEqual({ weekAgoExact: false });
  });
});
