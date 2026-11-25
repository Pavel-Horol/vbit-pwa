// REQ-MIC-2..4, 6: сопоставление онсетов микрофона с ожидаемыми слогами, оценка круга,
// калибровка входа и маски щелчков. Время — секунды AudioContext.
//
// Модель задержек: щелчок запланирован на t, из динамика выходит позже, пользователь говорит
// под то, что слышит, микрофон добавляет свою задержку. Калибровка входа через динамик меряет
// обе задержки сразу (inputOffsetMs), поэтому «вовремя» = онсет в t + inputOffsetMs.
// outputOffsetMs (калибровка по тапам) сюда не прибавляется — иначе задержка динамика дважды.
import type { Mask, Onset } from './onset';
import { BEAT_GAIN } from './timeline';
import type { Syllable, TimelineEvent } from './types';

export type Expected = {
  time: number;
  /** Половина слота, с — окно поиска онсета. */
  halfSlot: number;
  stressed: boolean;
  text: string;
  /** Позиция в круге «такт:доля:слот» — одинакова на каждом круге. */
  key: string;
};

export type Mark = 'ok' | 'early' | 'late' | 'miss';
export type SyllableMark = {
  key: string;
  text: string;
  stressed: boolean;
  mark: Mark;
  /** Онсет минус ожидаемое время, мс (нет — пропущен). */
  deltaMs?: number;
};
export type LoopScore = {
  marks: SyllableMark[];
  onTime: number;
  total: number;
  pct: number;
  meanOffsetMs: number | null;
  clean: boolean;
};

export const ON_TIME_MS = 40;
export const CLEAN_SHARE = 0.85;

/** REQ-LAD-3: номер круга по такту; такт 0 — отсчёт (−1). */
export const loopOf = (bar: number, loopBars: number) =>
  bar < 1 || loopBars < 1 ? -1 : Math.floor((bar - 1) / loopBars);

/** Слог, который пользователь должен произнести на этом событии; паузы и отсчёт — null. */
export function expectedSyllable(
  e: TimelineEvent,
  syl: Syllable | undefined,
  bpm: number,
  loopBars: number,
): Expected | null {
  if (!syl || syl.text === '' || syl.wordId === -1 || e.bar < 1) return null;
  return {
    time: e.time,
    halfSlot: 60 / bpm / e.slots / 2,
    stressed: syl.stressed,
    text: syl.text,
    key: `${(e.bar - 1) % Math.max(1, loopBars)}:${e.beat}:${e.slot}`,
  };
}

/**
 * REQ-MIC-4: для каждого слога — ближайший онсет в окне ± половина слота; ±40 мс — вовремя.
 * Круг чистый, если ≥ 85% слогов вовремя и все ударные вовремя.
 * REQ-MIC-6 (откат): `stressedOnly` — оцениваются только ударные слоги.
 */
export function scoreLoop(
  expected: Expected[],
  onsets: number[],
  inputOffsetMs: number,
  opts: { stressedOnly?: boolean } = {},
): LoopScore {
  const scored = opts.stressedOnly ? expected.filter((e) => e.stressed) : expected;
  const offset = inputOffsetMs / 1000;
  const marks = scored.map((e): SyllableMark => {
    const target = e.time + offset;
    let best: number | undefined;
    for (const o of onsets) {
      const d = Math.abs(o - target);
      if (d <= e.halfSlot + 1e-9 && (best === undefined || d < Math.abs(best - target))) best = o;
    }
    const base = { key: e.key, text: e.text, stressed: e.stressed };
    if (best === undefined) return { ...base, mark: 'miss' };
    const deltaMs = Math.round((best - target) * 1000);
    const mark = Math.abs(deltaMs) <= ON_TIME_MS ? 'ok' : deltaMs < 0 ? 'early' : 'late';
    return { ...base, mark, deltaMs };
  });
  const total = marks.length;
  const onTime = marks.filter((m) => m.mark === 'ok').length;
  const heard = marks.filter((m) => m.deltaMs !== undefined).map((m) => m.deltaMs!);
  return {
    marks,
    onTime,
    total,
    pct: total ? Math.round((onTime / total) * 100) : 0,
    meanOffsetMs: heard.length ? Math.round(heard.reduce((a, b) => a + b, 0) / heard.length) : null,
    clean:
      total > 0 &&
      onTime / total >= CLEAN_SHARE - 1e-9 &&
      marks.every((m) => !m.stressed || m.mark === 'ok'),
  };
}

// --- REQ-MIC-3: калибровка входа ---

export const MIC_CAL_CLICKS = 8;
export const MIC_CAL_BPM = 90;
export const MIC_CAL_MIN_FOUND = 5;
/** Дальше этой задержки щелчок не ищем (интервал между щелчками 667 мс). */
export const MIC_CAL_MAX_MS = 600;
/** Медианное отклонение задержек больше этого — замер неустойчивый. */
export const MIC_CAL_SPREAD_MS = 25;
const EARLY_S = 0.02;

export const micCalibrationClicks = (start: number): number[] =>
  Array.from({ length: MIC_CAL_CLICKS }, (_, i) => start + (i * 60) / MIC_CAL_BPM);

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export type MicCalibration =
  | { ok: true; offsetMs: number; clickLevel: number; found: number }
  | { ok: false; error: 'not_heard' | 'unstable'; found: number };

/** Для каждого щелчка — самый громкий онсет в [click − 20 мс, click + 600 мс]. */
export function micCalibration(clicks: number[], onsets: Onset[]): MicCalibration {
  const delays: number[] = [];
  const levels: number[] = [];
  for (const c of clicks) {
    let best: Onset | undefined;
    for (const o of onsets)
      if (o.time >= c - EARLY_S && o.time <= c + MIC_CAL_MAX_MS / 1000)
        if (!best || o.level > best.level) best = o;
    if (best) {
      delays.push((best.time - c) * 1000);
      levels.push(best.level);
    }
  }
  const found = delays.length;
  if (found < MIC_CAL_MIN_FOUND) return { ok: false, error: 'not_heard', found };
  const m = median(delays);
  if (median(delays.map((d) => Math.abs(d - m))) > MIC_CAL_SPREAD_MS)
    return { ok: false, error: 'unstable', found };
  return {
    ok: true,
    offsetMs: Math.round(Math.max(0, Math.min(MIC_CAL_MAX_MS, m))),
    clickLevel: Math.round(median(levels) * 10) / 10,
    found,
  };
}

// --- маски щелчков (решение этапа 4, вариант A) ---

export const MASK_BEFORE_S = 0.015;
export const MASK_AFTER_S = 0.06;
/** Голос в окне щелчка должен быть громче щелчка на столько, дБ. */
export const MASK_MARGIN_DB = 6;

/**
 * Окно вокруг щелчка, каким его слышит микрофон. `clickLevel` — громкость щелчка доли (gain
 * BEAT_GAIN) из калибровки входа; тики тише — порог ниже пропорционально gain.
 */
export function clickMask(
  time: number,
  gain: number,
  inputOffsetMs: number,
  clickLevel: number,
): Mask {
  const heard = time + inputOffsetMs / 1000;
  return {
    start: heard - MASK_BEFORE_S,
    end: heard + MASK_AFTER_S,
    minLevel: clickLevel + 20 * Math.log10(gain / BEAT_GAIN) + MASK_MARGIN_DB,
  };
}
