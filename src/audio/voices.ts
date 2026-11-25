// REQ-SND: синтез тиков (осциллятор + огибающая), без сэмплов.
import type { TickKind } from '@/core/types';

/** attack / decay — секунды; без attack — мгновенный старт и спад ~45 мс. */
type Voice = { type: OscillatorType; freq: number; attack?: number; decay: number };

const VOICES: Record<Exclude<TickKind, 'rest'>, Voice> = {
  downbeat: { type: 'sine', freq: 1400, decay: 0.045 },
  beat: { type: 'sine', freq: 950, decay: 0.045 },
  // «деревянный» клик ударного слога: треугольник 420 Гц, атака 2 мс, спад 60 мс
  stressed: { type: 'triangle', freq: 420, attack: 0.002, decay: 0.06 },
  unstressed: { type: 'sine', freq: 650, decay: 0.045 },
};

const FLOOR = 0.001;

function tone(ctx: AudioContext, t: number, voice: Voice, gain: number) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = voice.type;
  osc.frequency.value = voice.freq;
  const peak = t + (voice.attack ?? 0);
  if (voice.attack) {
    amp.gain.setValueAtTime(FLOOR, t);
    amp.gain.exponentialRampToValueAtTime(gain, peak);
  } else {
    amp.gain.setValueAtTime(gain, t);
  }
  amp.gain.exponentialRampToValueAtTime(FLOOR, peak + voice.decay);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(t);
  osc.stop(peak + voice.decay + 0.005);
}

export function playTick(ctx: AudioContext, kind: TickKind, t: number, gain: number) {
  if (kind === 'rest' || gain <= 0) return;
  tone(ctx, t, VOICES[kind], gain);
}

/** REQ-SND-2: сигнал конца шага — два тона 880 и 1320 Гц через 170 мс. */
export function playChime(ctx: AudioContext) {
  const t = ctx.currentTime + 0.02;
  tone(ctx, t, { type: 'sine', freq: 880, decay: 0.045 }, 0.35);
  tone(ctx, t + 0.17, { type: 'sine', freq: 1320, decay: 0.045 }, 0.35);
}
