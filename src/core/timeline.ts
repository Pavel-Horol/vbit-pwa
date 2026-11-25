// REQ-TL: события таймлайна и чистый планировщик (REQ-AUD-1/4). Время — секунды AudioContext.
import { pause } from './stress';
import type { Bar, Beat, Mix, TickKind, TimelineEvent } from './types';

export const BPM_MIN = 40;
export const BPM_MAX = 180;
export const clampBpm = (bpm: number) => Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(bpm)));

/** REQ-SND (этап 1): ударный слог звучит тем же тиком, что безударный; «деревянный» клик — этап 2. */
export const UNSTRESSED_GAIN = 0.14;
export const BEAT_GAIN = 0.55;
export const baseMix = (tickVolume: number, multiplier = 1): Mix => {
  const tick = UNSTRESSED_GAIN * tickVolume * multiplier;
  return { downbeat: BEAT_GAIN, beat: BEAT_GAIN, stressed: tick, unstressed: tick };
};

export function beatEvents(
  bar: Bar,
  barIndex: number,
  beatIndex: number,
  beatStart: number,
  spb: number,
  mix: Mix,
): TimelineEvent[] {
  const syls = bar[beatIndex]?.syllables ?? [];
  const n = Math.max(1, syls.length);
  const events: TimelineEvent[] = [];
  for (let s = 0; s < n; s++) {
    const syl = syls[s];
    let kind: TickKind;
    if (s === 0) kind = beatIndex === 0 ? 'downbeat' : 'beat';
    else if (!syl || syl.text === '') kind = 'rest';
    else kind = syl.stressed ? 'stressed' : 'unstressed';
    events.push({
      time: beatStart + (s * spb) / n,
      bar: barIndex,
      beat: beatIndex,
      slot: s,
      slots: n,
      kind,
      gain: kind === 'rest' ? 0 : mix[kind],
    });
  }
  return events;
}

/** Состояние планировщика: время начала следующей доли и её позиция. */
export type Clock = { next: number; bar: number; beat: number };
export const createClock = (start: number): Clock => ({ next: start, bar: 0, beat: 0 });

/**
 * Планирует все доли, начало которых < horizon. Темп читается на каждой доле, поэтому
 * смена BPM действует со следующей запланированной доли. Начало следующей доли =
 * предыдущее + 60/bpm, без округления.
 */
export function schedule(
  clock: Clock,
  horizon: number,
  bpm: number,
  getBar: (i: number) => Bar,
  mix: Mix,
): { clock: Clock; events: TimelineEvent[] } {
  let { next, bar, beat } = clock;
  const events: TimelineEvent[] = [];
  const spb = 60 / clampBpm(bpm);
  while (next < horizon) {
    events.push(...beatEvents(getBar(bar), bar, beat, next, spb, mix));
    next += spb;
    if (++beat === 4) {
      beat = 0;
      bar++;
    }
  }
  return { clock: { next, bar, beat }, events };
}

const oneSyllableBeat = (text: string): Beat => ({
  syllables: [{ text, stressed: false, wordId: -1, onset: '', stressSource: 'none' }],
});

/** REQ-AUD-9: такт отсчёта «1 2 3 4» — только щелчки долей. */
export const countInBar = (): Bar => [
  oneSyllableBeat('1'),
  oneSyllableBeat('2'),
  oneSyllableBeat('3'),
  oneSyllableBeat('4'),
];

export const silentBar = (): Bar => [
  { syllables: [pause()] },
  { syllables: [pause()] },
  { syllables: [pause()] },
  { syllables: [pause()] },
];

/** Такты текста по кругу; пустой текст — тихий такт (щёлкают только доли). */
export const loopBars = (bars: Bar[]) => {
  const silent = silentBar();
  return (i: number): Bar => (bars.length ? bars[i % bars.length]! : silent);
};

export const withCountIn =
  (getBar: (i: number) => Bar) =>
  (i: number): Bar =>
    i === 0 ? countInBar() : getBar(i - 1);
