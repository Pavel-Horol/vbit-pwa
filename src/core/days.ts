// REQ-SES-6: дни тренировок и серия. Даты — 'YYYY-MM-DD' по локальному времени.

export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const addDay = (days: string[], key: string): string[] =>
  days.includes(key) ? days : [...days, key];

/** Последовательные дни, заканчивающиеся сегодня или вчера. */
export function streak(days: string[], today: Date): number {
  const set = new Set(days);
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
