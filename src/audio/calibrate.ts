// REQ-CAL: калибровка вывода — 16 щелчков при 90 BPM, тапы пользователя во времени AudioContext.
import { calibrationClicks } from '@/core/calibration';
import { BEAT_GAIN } from '@/core/timeline';
import { stop, unlockAudio } from './engine';
import { playTick } from './voices';

const LEAD_IN_S = 0.6;
const TAIL_S = 0.8;

export type Calibration = {
  clicks: number[];
  /** Время тапа в секундах AudioContext (по timeStamp события, без задержки обработчика). */
  tapTime: (e: Event) => number;
  cancel: () => void;
  /** REQ-CAL-2: AudioContext.outputLatency, мс — только подсказка. */
  outputLatencyMs?: number;
};

/** Запускать из обработчика жеста (REQ-AUD-6). `onDone` — после последнего щелчка. */
export function startCalibration(onDone: () => void): Calibration {
  stop(); // REQ-AUD-3: другой плеер замолкает
  const ctx = unlockAudio();
  const bus = ctx.createGain();
  bus.connect(ctx.destination);
  const clicks = calibrationClicks(ctx.currentTime + LEAD_IN_S);
  clicks.forEach((t, i) => playTick(ctx, i % 4 === 0 ? 'downbeat' : 'beat', t, BEAT_GAIN, bus));

  // таймер только для интерфейса (конец серии), звук целиком запланирован в AudioContext
  const timer = setTimeout(onDone, (clicks[clicks.length - 1]! - ctx.currentTime + TAIL_S) * 1000);
  const latency = (ctx as AudioContext & { outputLatency?: number }).outputLatency;
  return {
    clicks,
    tapTime: (e) => ctx.currentTime - Math.max(0, performance.now() - e.timeStamp) / 1000,
    cancel: () => {
      clearTimeout(timer);
      bus.disconnect();
    },
    ...(typeof latency === 'number' && latency > 0
      ? { outputLatencyMs: Math.round(latency * 1000) }
      : {}),
  };
}
