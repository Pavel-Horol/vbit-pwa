// REQ-MIC-2, REQ-MIC-4: слушаем микрофон во время игры и копим онсеты. Щелчки, которые
// микрофон слышит из динамика, прячутся масками (решение этапа 4, вариант A).
import { clickMask } from '@/core/micScore';
import { createOnsetDetector, type Onset } from '@/core/onset';
import { onScheduled, unlockAudio } from '../engine';
import { openCapture } from './capture';

const KEEP_S = 30;

export type Listener = {
  /** Онсеты за последние 30 с, по времени AudioContext. */
  onsets: () => Onset[];
  /** Время первого сэмпла с микрофона; null — звук ещё не пришёл. */
  readyAt: () => number | null;
  close: () => void;
};

export async function listen(opts: {
  inputOffsetMs: number;
  clickLevel?: number;
}): Promise<Listener> {
  const ctx = unlockAudio();
  const detector = createOnsetDetector(ctx.sampleRate);
  let onsets: Onset[] = [];
  let ready: number | null = null;
  const off =
    opts.clickLevel === undefined
      ? () => {}
      : onScheduled((e) => {
          if (e.kind !== 'rest' && e.gain > 0)
            detector.mask(clickMask(e.time, e.gain, opts.inputOffsetMs, opts.clickLevel!));
        });
  try {
    const capture = await openCapture((samples, time) => {
      ready ??= time;
      const found = detector.push(samples, time);
      if (found.length) onsets = [...onsets.filter((o) => o.time > time - KEEP_S), ...found];
    });
    return {
      onsets: () => onsets,
      readyAt: () => ready,
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
