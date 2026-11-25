// REQ-SYL: деление на слоги. Чистые функции, без DOM.

export const VOWELS = 'аеёиоуыэюяaeiouy';
const SONORANTS = 'рлмнй';
const SOFT_HARD = 'ьъ';

const isVowel = (c: string) => VOWELS.includes(c.toLowerCase());

export type RawSyllable = { text: string; wordId: number; onset: string; glued?: number };

/** Делит слово на слоги по REQ-SYL-2. Регистр сохраняется; `+` не влияет на границы. */
export function syllabifyWord(word: string): string[] {
  // `+` (разметка ударения) вырезаем, считаем границы по буквам, затем вставляем обратно
  // перед той же буквой — он попадает в слог своей гласной.
  const plusBefore = new Set<number>();
  let letters = '';
  for (const ch of word) {
    if (ch === '+') plusBefore.add(letters.length);
    else letters += ch;
  }

  const lower = letters.toLowerCase();
  const vowelIdx: number[] = [];
  for (let i = 0; i < lower.length; i++) if (isVowel(lower[i]!)) vowelIdx.push(i);

  const cuts: number[] = [];
  for (let k = 0; k < vowelIdx.length - 1; k++) {
    const a = vowelIdx[k]!;
    const b = vowelIdx[k + 1]!;
    const cluster = lower.slice(a + 1, b);
    let lastSign = -1;
    for (let j = 0; j < cluster.length; j++) if (SOFT_HARD.includes(cluster[j]!)) lastSign = j;
    if (lastSign >= 0) cuts.push(a + 1 + lastSign + 1);
    else if (cluster.length >= 2 && SONORANTS.includes(cluster[0]!)) cuts.push(a + 2);
    else cuts.push(a + 1);
  }

  const withPlus = (from: number, to: number) => {
    let s = '';
    for (let i = from; i < to; i++) s += (plusBefore.has(i) ? '+' : '') + letters[i];
    if (to === letters.length && plusBefore.has(to)) s += '+';
    return s;
  };

  const out: string[] = [];
  let start = 0;
  for (const cut of cuts) {
    out.push(withPlus(start, cut));
    start = cut;
  }
  out.push(withPlus(start, letters.length));
  return out;
}

/** Согласные до первой гласной, lowercase, без `+`. */
export function onsetOf(syllable: string): string {
  let s = '';
  for (const ch of syllable.toLowerCase()) {
    if (ch === '+') continue;
    if (isVowel(ch)) break;
    s += ch;
  }
  return s;
}

export const hasDigits = (line: string) => /\p{N}/u.test(line);

/** Убирает знаки ударения над гласными (U+0300, U+0301), остальные буквы (ё, й) не трогает. */
export const stripAccents = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300\u0301]/g, '')
    .normalize('NFC');

/** Заменяет всё, кроме букв, `-`, `+`, на пробел (цифры тоже — REQ-SYL-4). */
export const cleanLine = (line: string) => stripAccents(line).replace(/[^\p{L}\s+-]/gu, ' ');

const hasVowel = (w: string) => [...w].some(isVowel);

/** REQ-SYL-4: слоги строки. wordId локальный для строки, с 0. */
export function syllabifyLine(line: string): RawSyllable[] {
  const words = cleanLine(line)
    .split(/[\s-]+/)
    .filter((w) => w.replace(/\+/g, '') !== '');

  const res: RawSyllable[] = [];
  let carry = '';
  let wordId = 0;
  for (const w of words) {
    if (!hasVowel(w)) {
      carry += w.replace(/\+/g, '');
      continue;
    }
    const syls = syllabifyWord(w);
    const glued = carry.length;
    if (carry) {
      syls[0] = carry + syls[0];
      carry = '';
    }
    syls.forEach((text, i) =>
      res.push({ text, wordId, onset: onsetOf(text), ...(i === 0 && glued ? { glued } : {}) }),
    );
    wordId++;
  }
  if (carry) {
    const last = res[res.length - 1];
    if (last) {
      last.text += carry;
    } else {
      res.push({ text: carry, wordId: 0, onset: onsetOf(carry) });
    }
  }
  return res;
}
