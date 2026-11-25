// REQ-STR-4: разбор словаря ударений (формат — scripts/build-stress-dict.mjs).
// Текст словаря не раскладывается в полмиллиона строк: держим исходную строку и точки входа
// (записи с префиксом 0), поиск — бинарный по точкам входа и линейный внутри блока.
import type { StressDict } from './types';

const isDigit = (c: number) => c >= 48 && c <= 57;

type Entry = { word: string; idx: number[]; end: number };

/** Декодирует запись, начинающуюся в `pos`, относительно предыдущей формы `prev`. */
function decode(text: string, pos: number, prev: string): Entry {
  let end = text.indexOf('\n', pos);
  if (end < 0) end = text.length;
  let i = pos;
  let prefix = 0;
  while (i < end && isDigit(text.charCodeAt(i))) prefix = prefix * 10 + text.charCodeAt(i++) - 48;
  let j = end;
  while (j > i && isDigit(text.charCodeAt(j - 1))) j--;
  const word = prev.slice(0, prefix) + text.slice(i, j);
  const idx: number[] = [];
  for (let k = j; k < end; k++) idx.push(text.charCodeAt(k) - 48);
  return { word, idx, end: end + 1 };
}

export function parseStressDict(text: string): StressDict {
  const keys: string[] = [];
  const offsets: number[] = [];
  let pos = 0;
  while (pos < text.length) {
    let end = text.indexOf('\n', pos);
    if (end < 0) end = text.length;
    const c = text.charCodeAt(pos);
    // Точка входа — запись с префиксом ровно 0 (за нулём сразу идёт буква).
    if (c === 48 && end > pos + 1 && !isDigit(text.charCodeAt(pos + 1))) {
      keys.push(decode(text, pos, '').word);
      offsets.push(pos);
    }
    pos = end + 1;
  }

  return {
    lookup(word: string) {
      let lo = 0;
      let hi = keys.length - 1;
      let block = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (keys[mid]! <= word) {
          block = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      if (block < 0) return undefined;
      const stop = block + 1 < offsets.length ? offsets[block + 1]! : text.length;
      let p = offsets[block]!;
      let prev = '';
      while (p < stop) {
        const e = decode(text, p, prev);
        if (e.word === word) return e.idx;
        if (e.word > word) return undefined;
        prev = e.word;
        p = e.end;
      }
      return undefined;
    },
  };
}
