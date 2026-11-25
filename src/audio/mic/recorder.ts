// REQ-MIC-5: дневная запись. MediaRecorder (Opus) — ~0,5 МБ в минуту; обработка звука
// браузером включена (шумодав, автогромкость) — для прослушивания так приятнее.
import { getMicStream, MicError } from './capture';

export type DayRecorder = {
  pause: () => void;
  resume: () => void;
  /** Завершить и получить файл; микрофон освобождается. */
  stop: () => Promise<Blob>;
  readonly seconds: () => number;
};

const MIME = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export async function startRecorder(): Promise<DayRecorder> {
  if (typeof MediaRecorder === 'undefined') throw new MicError('unsupported');
  const stream = await getMicStream(false);
  const mimeType = MIME.find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  // длительность — по реальному времени записи, без пауз (только для подписи в UI)
  let total = 0;
  let since: number | null = performance.now();
  const seconds = () => (total + (since === null ? 0 : performance.now() - since)) / 1000;
  rec.start(1000);
  const release = () => stream.getTracks().forEach((t) => t.stop());
  return {
    pause() {
      if (rec.state !== 'recording') return;
      rec.pause();
      if (since !== null) total += performance.now() - since;
      since = null;
    },
    resume() {
      if (rec.state !== 'paused') return;
      rec.resume();
      since = performance.now();
    },
    seconds,
    stop() {
      return new Promise<Blob>((resolve) => {
        if (rec.state === 'inactive') {
          release();
          resolve(new Blob(chunks, { type: rec.mimeType }));
          return;
        }
        rec.onstop = () => {
          release();
          resolve(new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' }));
        };
        if (since !== null) total += performance.now() - since;
        since = null;
        rec.stop();
      });
    },
  };
}
