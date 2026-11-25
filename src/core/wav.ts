// REQ-MIC-6: WAV для проверки детектора. Пишем PCM16 моно и кладём метаданные записи (JSON)
// в отдельный чанк «vbit» — Audacity и другие редакторы его просто пропускают.

const META_CHUNK = 'vbit';

export function encodeWav(samples: Float32Array, sampleRate: number, meta?: string): Uint8Array {
  const metaBytes = meta === undefined ? null : new TextEncoder().encode(meta);
  const metaSize = metaBytes ? 8 + metaBytes.length + (metaBytes.length % 2) : 0;
  const dataSize = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataSize + metaSize);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, buf.byteLength - 8, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // моно
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]!));
    v.setInt16(44 + i * 2, Math.round(x < 0 ? x * 0x8000 : x * 0x7fff), true);
  }
  if (metaBytes) {
    const o = 44 + dataSize;
    str(o, META_CHUNK);
    v.setUint32(o + 4, metaBytes.length, true);
    new Uint8Array(buf, o + 8, metaBytes.length).set(metaBytes);
  }
  return new Uint8Array(buf);
}

/** PCM 16/24/32 бит или float32, любое число каналов (берётся первый). */
export function decodeWav(bytes: Uint8Array): {
  sampleRate: number;
  samples: Float32Array;
  meta?: string;
} {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const str = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (bytes.length < 12 || str(0) !== 'RIFF' || str(8) !== 'WAVE') throw new Error('not a WAV');
  let format = 0;
  let channels = 1;
  let sampleRate = 0;
  let bits = 16;
  let data: { o: number; n: number } | null = null;
  let meta: string | undefined;
  for (let o = 12; o + 8 <= bytes.length;) {
    const id = str(o);
    const n = v.getUint32(o + 4, true);
    const body = o + 8;
    if (id === 'fmt ') {
      format = v.getUint16(body, true);
      channels = v.getUint16(body + 2, true);
      sampleRate = v.getUint32(body + 4, true);
      bits = v.getUint16(body + 14, true);
      if (format === 0xfffe) format = v.getUint16(body + 24, true); // WAVE_FORMAT_EXTENSIBLE
    } else if (id === 'data') {
      data = { o: body, n: Math.min(n, bytes.length - body) };
    } else if (id === META_CHUNK) {
      meta = new TextDecoder().decode(bytes.subarray(body, body + n));
    }
    o = body + n + (n % 2);
  }
  if (!data || !sampleRate) throw new Error('no audio data');
  const step = (bits / 8) * channels;
  const count = Math.floor(data.n / step);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const p = data.o + i * step;
    if (format === 3) samples[i] = v.getFloat32(p, true);
    else if (bits === 16) samples[i] = v.getInt16(p, true) / 0x8000;
    else if (bits === 24)
      samples[i] = (v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getInt8(p + 2) << 16)) / 0x800000;
    else if (bits === 32) samples[i] = v.getInt32(p, true) / 0x80000000;
    else throw new Error(`unsupported WAV: ${bits} bit`);
  }
  return { sampleRate, samples, ...(meta !== undefined ? { meta } : {}) };
}
