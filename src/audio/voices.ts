// REQ-SND: синтез тиков (осциллятор + огибающая ~45 мс), без сэмплов.
import type { TickKind } from '@/core/types';

type Voice = { type: OscillatorType; freq: number };

// Этап 1: `stressed` звучит как `unstressed`; «деревянный» клик (треугольник 420 Гц) — этап 2.
const VOICES: Record<Exclude<TickKind, 'rest'>, Voice> = {
  downbeat: { type: 'sine', freq: 1400 },
  beat: { type: 'sine', freq: 950 },
  stressed: { type: 'sine', freq: 650 },
  unstressed: { type: 'sine', freq: 650 },
};

const ENVELOPE = 0.045;

function tone(ctx: AudioContext, t: number, voice: Voice, gain: number) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = voice.type;
  osc.frequency.value = voice.freq;
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.001, t + ENVELOPE);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + ENVELOPE + 0.005);
}

export function playTick(ctx: AudioContext, kind: TickKind, t: number, gain: number) {
  if (kind === 'rest' || gain <= 0) return;
  tone(ctx, t, VOICES[kind], gain);
}

/** REQ-SND-2: сигнал конца шага — два тона 880 и 1320 Гц через 170 мс. */
export function playChime(ctx: AudioContext) {
  const t = ctx.currentTime + 0.02;
  tone(ctx, t, { type: 'sine', freq: 880 }, 0.35);
  tone(ctx, t + 0.17, { type: 'sine', freq: 1320 }, 0.35);
}
