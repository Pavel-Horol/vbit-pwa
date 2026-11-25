import { describe, expect, it } from 'vitest';
import { hasDigits, syllabifyLine, syllabifyWord } from '@/core/syllabify';

const texts = (line: string) => syllabifyLine(line).map((s) => s.text);

describe('REQ-SYL-5: SPEC vectors (words)', () => {
  const vectors: [string, string][] = [
    ['мама', 'ма-ма'],
    ['кораллы', 'ко-рал-лы'],
    ['большой', 'боль-шой'],
    ['сушку', 'су-шку'],
    ['мойка', 'мой-ка'],
    ['семья', 'семь-я'],
    ['подъезд', 'подъ-езд'],
    ['шоссе', 'шо-ссе'],
    ['сестра', 'се-стра'],
    ['карта', 'кар-та'],
    ['лампа', 'лам-па'],
    ['поэт', 'по-эт'],
    ['ёжик', 'ё-жик'],
    ['пришёл', 'при-шёл'],
    ['Клары', 'Кла-ры'],
  ];
  for (const [input, output] of vectors) {
    it(`${input} → ${output}`, () => {
      expect(syllabifyWord(input).join('-')).toBe(output);
    });
  }
});

describe('REQ-SYL-5: SPEC vectors (lines)', () => {
  it('«в дом» → вдом (1 слог)', () => {
    expect(texts('в дом')).toEqual(['вдом']);
  });
  it('«к нам пришёл» → кнам-при-шёл', () => {
    expect(texts('к нам пришёл')).toEqual(['кнам', 'при', 'шёл']);
  });
  it('«кто-то» → кто-то (2 слова)', () => {
    const syls = syllabifyLine('кто-то');
    expect(syls.map((s) => s.text)).toEqual(['кто', 'то']);
    expect(syls[0]!.wordId).not.toBe(syls[1]!.wordId);
  });
});

describe('REQ-SYL: own vectors', () => {
  const words: [string, string][] = [
    ['а', 'а'],
    ['дом', 'дом'],
    ['мост', 'мост'],
    ['ветер', 'ве-тер'],
    ['кольцо', 'коль-цо'],
    ['объём', 'объ-ём'],
    ['стройка', 'строй-ка'],
    ['армия', 'ар-ми-я'],
    ['КАРЛ', 'КАРЛ'],
    ['УКРАЛ', 'У-КРАЛ'],
    ['кларнет', 'клар-нет'],
    ['тупогубенький', 'ту-по-гу-бень-кий'],
    ['music', 'mu-sic'],
    ['hello', 'he-llo'], // сонорные в правиле 2 — только кириллица (REQ-SYL-2)
    ['rhythm', 'rhythm'],
    ['ДоМиНо', 'До-Ми-Но'],
  ];
  for (const [input, output] of words) {
    it(`${input} → ${output}`, () => {
      expect(syllabifyWord(input).join('-')).toBe(output);
    });
  }

  it('punctuation-only line → []', () => {
    expect(syllabifyLine('!?, … — «» ;:')).toEqual([]);
  });

  it('empty line → []', () => {
    expect(syllabifyLine('   ')).toEqual([]);
  });

  it('punctuation splits words like a space', () => {
    expect(texts('слово,слово')).toEqual(['сло', 'во', 'сло', 'во']);
  });

  it('trailing word without vowels sticks to the previous syllable', () => {
    expect(texts('дом б')).toEqual(['домб']);
  });

  it('line of only vowel-less words becomes one syllable', () => {
    expect(texts('в к')).toEqual(['вк']);
  });

  it('digits are removed (REQ-SYL-4)', () => {
    expect(texts('в 2 раза')).toEqual(['вра', 'за']);
    expect(hasDigits('в 2 раза')).toBe(true);
    expect(hasDigits('в два раза')).toBe(false);
  });

  it('keeps + for stress markup and does not let it move boundaries', () => {
    expect(syllabifyWord('кор+аллы')).toEqual(['ко', 'р+ал', 'лы']);
    expect(texts('кор+аллы')).toEqual(['ко', 'р+ал', 'лы']);
  });

  it('combining stress mark does not split the word', () => {
    expect(texts('кора́ллы')).toEqual(['ко', 'рал', 'лы']);
  });

  it('wordId: syllables of a word share an id, glued preposition joins the next word', () => {
    const syls = syllabifyLine('в доме мама');
    expect(syls.map((s) => [s.text, s.wordId])).toEqual([
      ['вдо', 0],
      ['ме', 0],
      ['ма', 1],
      ['ма', 1],
    ]);
  });

  it('onset: lowercase consonants before the first vowel', () => {
    const syls = syllabifyLine('КРАЛ у вдом');
    expect(syls.map((s) => s.onset)).toEqual(['кр', '', 'вд']);
  });

  it('onset ignores + markup', () => {
    expect(syllabifyLine('+ура').map((s) => s.onset)).toEqual(['', 'р']);
  });
});
