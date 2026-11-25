import { describe, expect, it } from 'vitest';
import { decodeWav, encodeWav } from '@/core/wav';

describe('REQ-MIC-6: WAV for detector validation', () => {
  it('PCM16 mono round trip with a metadata chunk', () => {
    const x = new Float32Array([0, 0.5, -0.5, 1, -1, 0.25]);
    const meta = JSON.stringify({ text: 'Карл у Клары', t0: 1.5 });
    const d = decodeWav(encodeWav(x, 48000, meta));
    expect(d.sampleRate).toBe(48000);
    expect(d.meta).toBe(meta);
    expect(d.samples).toHaveLength(6);
    d.samples.forEach((v, i) => expect(v).toBeCloseTo(x[i]!, 3));
  });

  it('file without metadata; odd-sized chunks are padded', () => {
    const d = decodeWav(encodeWav(new Float32Array(3), 44100, 'abc'));
    expect(d.meta).toBe('abc');
    expect(decodeWav(encodeWav(new Float32Array(3), 44100)).meta).toBeUndefined();
  });

  it('reads float32 stereo (first channel), e.g. re-exported from an editor', () => {
    const n = 2;
    const buf = new ArrayBuffer(44 + n * 8);
    const v = new DataView(buf);
    const str = (o: number, s: string) =>
      [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF');
    v.setUint32(4, 36 + n * 8, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 3, true); // float
    v.setUint16(22, 2, true);
    v.setUint32(24, 22050, true);
    v.setUint32(28, 22050 * 8, true);
    v.setUint16(32, 8, true);
    v.setUint16(34, 32, true);
    str(36, 'data');
    v.setUint32(40, n * 8, true);
    v.setFloat32(44, 0.5, true);
    v.setFloat32(48, -1, true);
    v.setFloat32(52, -0.25, true);
    v.setFloat32(56, 1, true);
    const d = decodeWav(new Uint8Array(buf));
    expect(d.sampleRate).toBe(22050);
    expect([...d.samples]).toEqual([0.5, -0.25]);
  });

  it('not a WAV → throws', () => {
    expect(() => decodeWav(new Uint8Array(20))).toThrow();
  });
});
