/** Русское множественное число: plural(5, 'день', 'дня', 'дней') → 'дней'. */
export function plural(n: number, one: string, few: string, many: string): string {
  const m = n % 10;
  const h = n % 100;
  if (m === 1 && h !== 11) return one;
  if (m >= 2 && m <= 4 && (h < 12 || h > 14)) return few;
  return many;
}

/** 75 → '1:15' */
export const formatTime = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.max(0, sec) % 60).padStart(2, '0')}`;

/**
 * REQ-SES-4: строка текста без разметки. В ручной разметке убираем `|`, `_`, `>`, `+` и склеиваем
 * слоги через `-`; в авто-режиме дефис — настоящий, убираем только `+`.
 */
export function plainLine(line: string, mode: 'manual' | 'auto' | 'stress' = 'manual'): string {
  if (mode !== 'manual') return line.replace(/\+/g, '').replace(/\s+/g, ' ').trim();
  return line
    .replace(/^\s*>/, '')
    .replace(/[|_+]/g, ' ')
    .replace(/(\S)-\s+(\S)/g, '$1$2')
    .replace(/(\p{L})-(\p{L})/gu, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}
