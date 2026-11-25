// REQ-MIC-2, REQ-MIC-4: слушаем микрофон во время игры и копим онсеты. Щелчки, которые
// микрофон слышит из динамика, прячутся масками (решение этапа 4, вариант A). Порог масок
// берётся по такту отсчёта — так он соответствует текущей громкости и выходу (динамик или
// наушники); если отсчёт пропущен — по калибровке входа.
import { clickMask, countInClickLevel, maskLevel } from '@/core/micScore';
import { createOnsetDetector, type Onset } from '@/core/onset';
import type { TimelineEvent } from '@/core/types';
import { onScheduled, unlockAudio } from '../engine';
import { openCapture } from './capture';

const KEEP_S = 30;
/** Запас после третьего щелчка отсчёта, чтобы детектор успел его обработать. */
const RESOLVE_AFTER_S = 0.1;

export type MaskState = 'pending' | 'on' | 'off';

export type Listener = {
  /** Онсеты за последние 30 с, по времени AudioContext. */
  onsets: () => Onset[];
  /** Время первого сэмпла с микрофона; null — звук ещё не пришёл. */
  readyAt: () => number | null;
  /** Прячутся ли щелчки: 'off' — микрофон их не слышит (наушники). */
  masking: () => MaskState;
  close: () => void;
};

export async function listen(opts: {
  inputOffsetMs: number;
  clickLevel?: number;
}): Promise<Listener> {
  const ctx = unlockAudio();
  const io = opts.inputOffsetMs / 1000;
  const detector = createOnsetDetector(ctx.sampleRate);
  let onsets: Onset[] = [];
  let ready: number | null = null;

  const countIn: number[] = [];
  let sawText = false;
  let pending: TimelineEvent[] = [];
  let level: number | null | undefined; // undefined — ещё не решили

  const flushMasks = () => {
    if (level === undefined) return;
    if (level !== null)
      for (const e of pending) detector.mask(clickMask(e.time, e.gain, opts.inputOffsetMs, level));
    pending = [];
  };

  const resolve = (now: number) => {
    if (level !== undefined || ready === null) return;
    const lastCountIn = countIn.length === 3 ? countIn[2]! : undefined;
    if (lastCountIn !== undefined ? now < lastCountIn + io + RESOLVE_AFTER_S : !sawText) return;
    level = maskLevel(
      countInClickLevel(countIn, onsets, opts.inputOffsetMs, ready),
      opts.clickLevel,
    );
    flushMasks();
  };

  const off = onScheduled((e) => {
    if (e.kind === 'rest' || e.gain <= 0) return;
    if (e.bar === 0 && e.slot === 0 && e.beat < 3) countIn.push(e.time);
    else {
      if (e.bar > 0) sawText = true;
      pending.push(e);
    }
    flushMasks();
  }, true);

  try {
    const capture = await openCapture((samples, time) => {
      ready ??= time;
      const found = detector.push(samples, time);
      if (found.length) onsets = [...onsets.filter((o) => o.time > time - KEEP_S), ...found];
      resolve(time + samples.length / ctx.sampleRate);
    });
    return {
      onsets: () => onsets,
      readyAt: () => ready,
      masking: () => (level === undefined ? 'pending' : level === null ? 'off' : 'on'),
      close() {
        off();
        capture.close();
      },
    };
  } catch (e) {
    off();
    throw e;
  }
}
