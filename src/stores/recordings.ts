// REQ-MIC-5: аудиозаписи лежат в IndexedDB отдельными ключами `rec:YYYY-MM-DD`; список — в Progress.
import { del, get, set } from 'idb-keyval';
import { dayKey } from '@/core/days';
import { pruneRecordings, recordingKey, upsertRecording, type Recording } from '@/core/recordings';
import { useProgressStore } from './progress';

/** Сохраняет запись дня (перезаписывает сегодняшнюю) и удаляет записи старше 30 дней. */
export async function saveDayRecording(blob: Blob, textId?: string, now = new Date()) {
  const progress = useProgressStore();
  const date = dayKey(now);
  const rec: Recording = { date, blobKey: recordingKey(date), ...(textId ? { textId } : {}) };
  await set(rec.blobKey, blob);
  const { keep, drop } = pruneRecordings(upsertRecording(progress.recordings ?? [], rec), now);
  progress.recordings = keep;
  await Promise.all(drop.map((r) => del(r.blobKey).catch(() => {})));
  // попросить браузер не вычищать данные при нехватке места; отказ не страшен
  void navigator.storage?.persist?.().catch(() => false);
}

export async function loadRecording(rec: Recording): Promise<Blob | undefined> {
  try {
    const b: unknown = await get(rec.blobKey);
    return b instanceof Blob ? b : undefined;
  } catch {
    return undefined;
  }
}
