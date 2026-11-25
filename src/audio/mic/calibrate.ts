// REQ-MIC-3: калибровка входа — 8 щелчков через динамик (без наушников), микрофон их слышит,
// медиана задержки → inputOffsetMs. Заодно меряется громкость щелчка для масок.
import { micCalibration, micCalibrationClicks, type MicCalibration } from '@/core/micScore';
import { createOnsetDetector, type Onset } from '@/core/onset';
import { BEAT_GAIN } from '@/core/timeline';
import { stop, unlockAudio } from '../engine';
import { playTick } from '../voices';
import { openCapture } from './capture';

const LEAD_IN_S = 0.6;
const TAIL_S = 0.8;
const READY_TIMEOUT_MS = 3000;

export type MicCalibrationRun = { result: Promise<MicCalibration>; cancel: () => void };

/** Запускать из обработчика жеста (REQ-AUD-6). Ошибки доступа — MicError в `result`. */
export function calibrateMic(): MicCalibrationRun {
  stop(); // REQ-AUD-3
  const ctx = unlockAudio();
  const detector = createOnsetDetector(ctx.sampleRate);
  const onsets: Onset[] = [];
  let cancelled = false;
  let close = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  let bus: GainNode | null = null;

  const result = (async () => {
    let gotFirst: () => void = () => {};
    const first = new Promise<void>((r) => (gotFirst = r));
    const capture = await openCapture((samples, time) => {
      gotFirst();
      onsets.push(...detector.push(samples, time));
    });
    close = () => {
      capture.close();
      bus?.disconnect();
      clearTimeout(timer);
    };
    if (cancelled) close();
    // ждём первый звук с микрофона, чтобы щелчки не пришлись на «включение»
    await Promise.race([first, new Promise((r) => (timer = setTimeout(r, READY_TIMEOUT_MS)))]);
    if (cancelled) throw new Error('cancelled');
    bus = ctx.createGain();
    bus.connect(ctx.destination);
    const clicks = micCalibrationClicks(ctx.currentTime + LEAD_IN_S);
    clicks.forEach((t, i) => playTick(ctx, i % 4 === 0 ? 'downbeat' : 'beat', t, BEAT_GAIN, bus!));
    // таймер только ждёт конца серии; звук целиком запланирован в AudioContext
    const waitMs = (clicks[clicks.length - 1]! - ctx.currentTime + TAIL_S) * 1000;
    await new Promise((r) => (timer = setTimeout(r, waitMs)));
    if (cancelled) throw new Error('cancelled');
    onsets.push(...detector.flush());
    close();
    return micCalibration(clicks, onsets);
  })();

  return {
    result,
    cancel() {
      cancelled = true;
      close();
    },
  };
}
