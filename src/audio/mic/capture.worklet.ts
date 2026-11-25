// REQ-MIC-1: AudioWorklet только принимает звук микрофона и отдаёт его пачками в основной поток
// вместе со временем AudioContext первого сэмпла. Детектор — в core/onset.ts.
export {};

declare const currentTime: number;
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: typeof AudioWorkletProcessor): void;

/** ~21 мс при 48 кГц: часто, но без лишней нагрузки на основной поток. */
const BATCH = 1024;

class CaptureProcessor extends AudioWorkletProcessor {
  private buf = new Float32Array(BATCH);
  private n = 0;
  private start = 0;

  process(inputs: Float32Array[][]): boolean {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      if (this.n === 0) this.start = currentTime + i / sampleRate;
      this.buf[this.n++] = ch[i]!;
      if (this.n === BATCH) {
        this.port.postMessage({ time: this.start, samples: this.buf }, [this.buf.buffer]);
        this.buf = new Float32Array(BATCH);
        this.n = 0;
      }
    }
    return true;
  }
}

registerProcessor('vbit-capture', CaptureProcessor);
