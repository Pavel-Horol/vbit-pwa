// REQ-MET-1: TAP-темп — среднее по тапам в окне 3 с, нужно ≥ 3 тапа.
import { clampBpm } from './timeline';

export const TAP_WINDOW_MS = 3000;
export const TAP_MIN = 3;

/** Добавляет тап (мс) и возвращает новое окно тапов и BPM, если тапов хватает. */
export function tapTempo(taps: number[], now: number): { taps: number[]; bpm?: number } {
  const recent = [...taps.filter((t) => now - t < TAP_WINDOW_MS), now];
  if (recent.length < TAP_MIN) return { taps: recent };
  const interval = (now - recent[0]!) / (recent.length - 1);
  return { taps: recent, bpm: clampBpm(60000 / interval) };
}
