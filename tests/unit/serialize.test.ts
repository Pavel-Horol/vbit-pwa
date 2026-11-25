import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layout, type LayoutInput } from '@/core/layout';
import { parseManual, serializeManual } from '@/core/parse';
import { parseStressDict } from '@/core/stressDict';
import type { Line, Syllable } from '@/core/types';
import { seeded } from './helpers';

/**
 * Раскладка строк без служебных деталей: текст слога (регистр и ё/е не важны — разметка
 * передаёт ударение капсом), ударение, затакт и разбиение на слова (номер слова внутри строки).
 */
function norm(lines: Line[]) {
  return lines.map((line) => {
    const ids = new Map<number, number>();
    const id = (s: Syllable) => {
      if (s.wordId === -1) return -1;
      if (!ids.has(s.wordId)) ids.set(s.wordId, ids.size);
      return ids.get(s.wordId)!;
    };
    return {
      pickupCount: line.pickupCount,
      beats: line.beats.map((b) => ({
        pickup: !!b.pickup,
        syllables: b.syllables.map((s) => [
          s.text.toLowerCase().replace(/ё/g, 'е'),
          s.stressed,
          id(s),
        ]),
      })),
    };
  });
}

const roundTrip = (lines: Line[]) =>
  parseManual(serializeManual(lines), { lineStartsBar: true }).lines;

describe('REQ-LAY-5: serializeManual', () => {
  const inp = (raw: string, over: Partial<LayoutInput> = {}): LayoutInput => ({
    raw,
    mode: 'auto',
    perBeat: 2,
    lineStartsBar: true,
    stressOverrides: {},
    ...over,
  });

  it('Karl: manual → the same markup', () => {
    const r = layout(inp('КАРЛ у | КЛА-ры у- | КРАЛ ко- | РАЛ-лы', { mode: 'manual' }));
    expect(serializeManual(r.lines)).toBe('КАРЛ у | КЛА-ры у- | КРАЛ ко- | РАЛ-лы');
  });

  it('pickup line → «>», words continue across | with a trailing hyphen', () => {
    const r = layout(inp('> на дво- | РЕ тра- | ВА на тра- | ВЕ дро- | ВА', { mode: 'manual' }));
    expect(serializeManual(r.lines)).toBe('> на дво- | РЕ тра- | ВА на тра- | ВЕ дро- | ВА');
  });

  it('auto layout: pauses become _, stress becomes caps', () => {
    const r = layout(inp('пришёл мама', { perBeat: 3 }));
    expect(serializeManual(r.lines)).toBe('при-ШЁЛ ма- | ма _ _');
  });

  it('single-letter stressed syllable at line start uses +', () => {
    const r = layout(inp('Я', { stressOverrides: { я: 0 } }));
    expect(serializeManual(r.lines)).toBe('+я _');
    expect(norm(roundTrip(r.lines))).toEqual(norm(r.lines));
  });

  it('unstressed word with ё is written with е (ё alone would make it stressed)', () => {
    const r = layout(inp('пришёл', { stressOverrides: { пришёл: -1 }, perBeat: 2 }));
    expect(serializeManual(r.lines)).toBe('при-шел');
    expect(norm(roundTrip(r.lines))).toEqual(norm(r.lines));
  });

  it('several lines → several lines; empty lines are dropped', () => {
    const r = layout(inp('мама\n!!!\nмама', { perBeat: 2 }));
    expect(serializeManual(r.lines)).toBe('ма-ма\nма-ма');
  });

  it('real texts in every mode survive the round trip', () => {
    const dict = parseStressDict(readFileSync('public/dict/stress.txt', 'utf8'));
    const raw =
      'Шла Саша по шоссе и сосала сушку\nна дворе трава, на траве дрова\nв доме кто-то был';
    for (const mode of ['auto', 'stress'] as const)
      for (const perBeat of [1, 2, 3, 4] as const) {
        const r = layout(inp(raw, { mode, perBeat }), dict);
        expect(norm(roundTrip(r.lines))).toEqual(norm(r.lines));
      }
  });
});

// --- property-тест: случайные раскладки (seeded rng, без сторонних библиотек) ---

const POOL = ['та', 'кра', 'у', 'о', 'ё', 'Я', 'шёл', 'ко', 'РАЛ', 'stra', 'a', 'вдом', 'ЖИ', 'ь'];

function randomLines(rng: () => number): Line[] {
  const pick = <T>(xs: T[]) => xs[Math.floor(rng() * xs.length)]!;
  let wordId = 0;
  const lines: Line[] = [];
  const nLines = 1 + Math.floor(rng() * 3);
  for (let l = 0; l < nLines; l++) {
    const beats: Line['beats'] = [];
    const nBeats = 1 + Math.floor(rng() * 6);
    const hasPickup = rng() < 0.4;
    let inWord = false;
    let wordSyllables: Syllable[] = [];
    const endWord = () => {
      // в слове ровно одно ударение или ни одного
      if (wordSyllables.length && rng() < 0.7) pick(wordSyllables).stressed = true;
      wordSyllables = [];
      inWord = false;
    };
    for (let b = 0; b < nBeats + (hasPickup ? 1 : 0); b++) {
      const syllables: Syllable[] = [];
      const n = 1 + Math.floor(rng() * 4);
      for (let k = 0; k < n; k++) {
        if (rng() < 0.15) {
          endWord();
          syllables.push({
            text: '',
            stressed: false,
            wordId: -1,
            onset: '',
            stressSource: 'none',
          });
          continue;
        }
        if (!inWord || rng() < 0.4) {
          endWord();
          wordId++;
          inWord = true;
        }
        const s: Syllable = {
          text: pick(POOL),
          stressed: false,
          wordId,
          onset: '',
          stressSource: 'none',
        };
        wordSyllables.push(s);
        syllables.push(s);
      }
      beats.push(b === 0 && hasPickup ? { syllables, pickup: true } : { syllables });
    }
    endWord();
    const pickupCount = hasPickup ? beats[0]!.syllables.filter((s) => s.wordId !== -1).length : 0;
    lines.push({
      syllables: beats.flatMap((b) => b.syllables).filter((s) => s.wordId !== -1),
      pickupCount,
      beats,
    });
  }
  return lines;
}

describe('REQ-LAY-5: parseManual(serializeManual(x)) == x (property)', () => {
  it('500 random layouts', () => {
    const rng = seeded(2026);
    for (let i = 0; i < 500; i++) {
      const lines = randomLines(rng);
      const text = serializeManual(lines);
      expect(norm(roundTrip(lines)), text).toEqual(norm(lines));
    }
  });
});
