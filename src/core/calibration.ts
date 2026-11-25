// REQ-CAL-1: калибровка вывода звука по тапам пользователя. Время — секунды AudioContext.

export const CAL_CLICKS = 16;
export const CAL_BPM = 90;
export const CAL_IGNORE_TAPS = 4;
export const CAL_MIN_TAPS = 4;
export const CAL_MAX_MS = 400;
/** Тап может опередить щелчок не больше чем на столько (с) — иначе он относится к прошлому. */
const EARLY_S = 0.1;

export const calibrationClicks = (start: number): number[] =>
  Array.from({ length: CAL_CLICKS }, (_, i) => start + (i * 60) / CAL_BPM);

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * outputOffsetMs = clamp(median(tap − click), 0, 400). Первые 4 тапа не считаются. Тап сравнивается
 * с последним щелчком, прозвучавшим не позже чем через 100 мс после тапа. null — мало тапов.
 */
export function calibrationOffset(clicks: number[], taps: number[]): number | null {
  const diffs: number[] = [];
  for (const tap of taps.slice(CAL_IGNORE_TAPS)) {
    let click: number | undefined;
    for (const c of clicks) if (c <= tap + EARLY_S) click = c;
    if (click !== undefined) diffs.push((tap - click) * 1000);
  }
  if (diffs.length < CAL_MIN_TAPS) return null;
  return Math.round(Math.max(0, Math.min(CAL_MAX_MS, median(diffs))));
}
