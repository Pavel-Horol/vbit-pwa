// REQ-MIC-5: дневные записи — одна в день, хранятся 30 дней, сравнение «сегодня» и «7 дней назад».
import { dayKey } from './days';
import type { Progress } from './types';

export type Recording = NonNullable<Progress['recordings']>[number];

export const KEEP_DAYS = 30;
export const recordingKey = (date: string) => `rec:${date}`;

const shift = (d: Date, days: number) =>
  dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));

/** Новая запись заменяет запись того же дня; список по возрастанию даты. */
export const upsertRecording = (list: Recording[], rec: Recording): Recording[] =>
  [...list.filter((r) => r.date !== rec.date), rec].sort((a, b) => a.date.localeCompare(b.date));

/** Оставляем последние `keepDays` дней, считая сегодня. */
export function pruneRecordings(list: Recording[], today: Date, keepDays = KEEP_DAYS) {
  const from = shift(today, -(keepDays - 1));
  return { keep: list.filter((r) => r.date >= from), drop: list.filter((r) => r.date < from) };
}

/** «7 дней назад» — ровно та дата, иначе ближайшая более старая запись. */
export function comparisonRecordings(
  list: Recording[],
  today: Date,
): { today?: Recording; weekAgo?: Recording; weekAgoExact: boolean } {
  const t = dayKey(today);
  const target = shift(today, -7);
  const todayRec = list.find((r) => r.date === t);
  const exact = list.find((r) => r.date === target);
  const older = list.filter((r) => r.date < target).sort((a, b) => b.date.localeCompare(a.date))[0];
  const weekAgo = exact ?? older;
  return {
    ...(todayRec ? { today: todayRec } : {}),
    ...(weekAgo ? { weekAgo } : {}),
    weekAgoExact: !!exact,
  };
}
