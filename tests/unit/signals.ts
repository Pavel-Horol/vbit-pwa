// Синтетические сигналы для тестов детектора онсетов (REQ-MIC-2). Голоса в тестах нет —
// «слог» здесь гармонический тон с огибающей, похожей на гласную.
import { seeded } from './helpers';

export const SR = 48000;

export function noise(seconds: number, amp: number, seed = 1, sr = SR): Float32Array {
  const rnd = seeded(seed);
  const out = new Float32Array(Math.round(seconds * sr));
  for (let i = 0; i < out.length; i++) out[i] = (rnd() * 2 - 1) * amp;
  return out;
}

export type SylOpts = { amp?: number; dur?: number; attack?: number; f0?: number; floor?: number };

/** Гармонический «слог» (f0 + гармоники до 3,5 кГц), атака `attack` с, спад 40 мс. */
export function addSyllable(buf: Float32Array, at: number, o: SylOpts = {}, sr = SR) {
  const { amp = 0.3, dur = 0.12, attack = 0.015, f0 = 140 } = o;
  const start = Math.round(at * sr);
  const n = Math.round(dur * sr);
  const decay = 0.04;
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const t = i / sr;
    const env = t < attack ? t / attack : t > dur - decay ? Math.max(0, (dur - t) / decay) : 1;
    let s = 0;
    for (let k = 1; k * f0 < 3500; k++) s += Math.sin(2 * Math.PI * k * f0 * t) / k;
    buf[start + i]! += amp * env * s * 0.5;
  }
}

/** Щелчок метронома как в voices.ts: синус, мгновенный старт, экспоненциальный спад ~45 мс. */
export function addClick(buf: Float32Array, at: number, freq = 950, amp = 0.3, sr = SR) {
  const start = Math.round(at * sr);
  const n = Math.round(0.05 * sr);
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const t = i / sr;
    buf[start + i]! +=
      amp * Math.exp((Math.log(0.001) * t) / 0.045) * Math.sin(2 * Math.PI * freq * t);
  }
}
