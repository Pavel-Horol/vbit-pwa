// Приёмка этапа 2: ударения на наборе из 50 слов без омографов верны ≥ 90%.
// Набор составлен вручную из частых слов (не из словаря); число — индекс ударного слога.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyStress, toSyllables } from '@/core/stress';
import { parseStressDict } from '@/core/stressDict';
import { syllabifyLine } from '@/core/syllabify';

const WORDS: [string, number][] = [
  ['молоко', 2],
  ['ветер', 0],
  ['город', 0],
  ['музыка', 0],
  ['красиво', 1],
  ['говорить', 2],
  ['читать', 1],
  ['ударение', 2],
  ['собака', 1],
  ['машина', 1],
  ['телефон', 2],
  ['окно', 1],
  ['работа', 1],
  ['голова', 2],
  ['человек', 2],
  ['кровать', 1],
  ['учитель', 1],
  ['деревня', 1],
  ['карандаш', 2],
  ['магазин', 2],
  ['красота', 2],
  ['тишина', 2],
  ['память', 0],
  ['сердце', 0],
  ['дыхание', 1],
  ['микрофон', 2],
  ['звучать', 1],
  ['повторять', 2],
  ['медленно', 0],
  ['громко', 0],
  ['тихо', 0],
  ['слово', 0],
  ['строчка', 0],
  ['куплет', 1],
  ['припев', 1],
  ['бумага', 1],
  ['улица', 0],
  ['воздух', 0],
  ['комната', 0],
  ['дерево', 0],
  ['яблоко', 0],
  ['девочка', 0],
  ['мальчик', 0],
  ['солнце', 0],
  ['зеркало', 0],
  ['праздник', 0],
  ['позвонить', 2],
  ['хороший', 1],
  ['рисовать', 2],
  ['никогда', 2],
];

describe('stage 2 acceptance: stress accuracy', () => {
  const dict = parseStressDict(readFileSync('public/dict/stress.txt', 'utf8'));
  const misses: string[] = [];
  for (const [word, expected] of WORDS) {
    const syls = applyStress(toSyllables(syllabifyLine(word)), {
      overrides: {},
      dict,
      lineStart: true,
    });
    const got = syls.findIndex((s) => s.stressed);
    if (got !== expected) misses.push(`${word}: ждали ${expected}, получили ${got}`);
  }

  it('the set has 50 distinct words', () => {
    expect(new Set(WORDS.map(([w]) => w)).size).toBe(50);
  });

  it('≥ 90% correct', () => {
    const accuracy = (WORDS.length - misses.length) / WORDS.length;
    expect(accuracy, misses.join('; ')).toBeGreaterThanOrEqual(0.9);
  });
});
