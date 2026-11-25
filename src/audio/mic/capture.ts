// REQ-MIC-1: микрофон → AudioWorklet → основной поток. Звук не покидает устройство.
import { unlockAudio } from '../engine';
import workletUrl from './capture.worklet.ts?worker&url';

export type MicErrorCode = 'unsupported' | 'denied' | 'no_device' | 'failed';
export class MicError extends Error {
  constructor(readonly code: MicErrorCode) {
    super(code);
  }
}

export type Capture = { sampleRate: number; close: () => void };

const modules = new WeakMap<BaseAudioContext, Promise<void>>();

function loadWorklet(ctx: AudioContext): Promise<void> {
  let p = modules.get(ctx);
  if (!p) {
    p = ctx.audioWorklet.addModule(workletUrl);
    p.catch(() => modules.delete(ctx));
    modules.set(ctx, p);
  }
  return p;
}

/**
 * Обработка звука браузером выключена: эхоподавление вырезало бы щелчки при калибровке и
 * меняло задержку, шумодав и автогромкость искажают атаки слогов.
 */
export async function getMicStream(raw = true): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new MicError('unsupported');
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: raw
        ? {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
          }
        : true,
    });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new MicError('denied');
    if (name === 'NotFoundError' || name === 'OverconstrainedError')
      throw new MicError('no_device');
    throw new MicError('failed');
  }
}

/** Открыть микрофон; `onBlock` получает сэмплы и время AudioContext первого из них. */
export async function openCapture(
  onBlock: (samples: Float32Array, time: number) => void,
): Promise<Capture> {
  const ctx = unlockAudio();
  if (!ctx.audioWorklet) throw new MicError('unsupported');
  const [stream] = await Promise.all([getMicStream(), loadWorklet(ctx)]);
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'vbit-capture', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
    channelCountMode: 'explicit',
  });
  // узел должен быть подключён к выходу, иначе браузер может его не вызывать; звук не слышен
  const silent = ctx.createGain();
  silent.gain.value = 0;
  let closed = false;
  node.port.onmessage = (e: MessageEvent<{ time: number; samples: Float32Array }>) => {
    if (!closed) onBlock(e.data.samples, e.data.time);
  };
  source.connect(node);
  node.connect(silent);
  silent.connect(ctx.destination);
  return {
    sampleRate: ctx.sampleRate,
    close() {
      if (closed) return;
      closed = true;
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      silent.disconnect();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
