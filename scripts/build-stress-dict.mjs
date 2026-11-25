#!/usr/bin/env node
// REQ-STR-4: собирает словарь ударений public/dict/stress.txt из данных OpenRussian.org.
//
// Источник: https://github.com/Badestrand/russian-dictionary (CC BY-SA 4.0), закреплённый коммит.
// Запуск:   node scripts/build-stress-dict.mjs            — скачать CSV по закреплённому коммиту
//           node scripts/build-stress-dict.mjs --src DIR  — взять CSV из локальной папки
//
// Формат вывода (UTF-8, строки через \n):
//   строки, начинающиеся с '#', — комментарии;
//   остальные — формы слов в порядке сортировки JS (по кодам UTF-16), фронт-кодирование:
//   <длина общего префикса с предыдущей формой><остаток формы><индексы ударных слогов>.
//   Каждая RESTART-я запись хранится целиком (префикс 0) — точки входа для бинарного поиска.
//   Несколько индексов (омографы, варианты) — несколько цифр подряд, например «замок» → 01.
//
// В словарь попадают только формы из ≥ 2 слогов без «ё» (ударение с «ё» даёт REQ-STR-3);
// формы с «ё» добавляются под написанием через «е» («пришел» → как «пришёл»).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'Badestrand/russian-dictionary';
const COMMIT = '50e210c4803237779cb562bc1abcea529066031c';
const FILES = ['nouns', 'adjectives', 'verbs', 'others'];
const RESTART = 32;
const VOWELS = 'аеёиоуыэюя';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public/dict/stress.txt');

async function readCsv(name, src) {
  if (src) return readFileSync(join(src, `${name}.csv`), 'utf8');
  const url = `https://raw.githubusercontent.com/${REPO}/${COMMIT}/${name}.csv`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

// Колонки с формами слова (апостроф после ударной гласной). Флаги вида sg_only/pl_only — не формы.
const isFormColumn = (h) =>
  !h.endsWith('_only') &&
  /^(accented|comparative|superlative|short_|decl_|sg_|pl_|imperative_|past_|presfut_)/.test(h);

/** 'сосна\'' → { bare: 'сосна', idx: [1] } или null. */
function parseForm(raw) {
  const a = raw.trim().toLowerCase();
  if (!/^[а-яё']+$/.test(a)) return null; // пробелы, дефисы, артефакты — пропускаем
  const bare = a.replace(/'/g, '');
  const vowelPos = [];
  for (let i = 0; i < bare.length; i++) if (VOWELS.includes(bare[i])) vowelPos.push(i);
  if (vowelPos.length < 2) return null;

  const idx = new Set();
  let pos = 0;
  for (const ch of a) {
    if (ch === "'") {
      const v = vowelPos.indexOf(pos - 1);
      if (v >= 0) idx.add(v);
    } else pos++;
  }
  if (!idx.size) {
    const yo = vowelPos.findIndex((p) => bare[p] === 'ё');
    if (yo >= 0) idx.add(yo);
  }
  if (!idx.size || [...idx].some((i) => i > 9)) return null;
  return { bare, idx: [...idx] };
}

function parseArgs() {
  const i = process.argv.indexOf('--src');
  return i > 0 ? process.argv[i + 1] : undefined;
}

const forms = new Map();
const add = (word, idx) => {
  const set = forms.get(word) ?? new Set();
  idx.forEach((i) => set.add(i));
  forms.set(word, set);
};

const src = parseArgs();
for (const name of FILES) {
  const [head, ...rows] = (await readCsv(name, src)).split('\n');
  const cols = head.split('\t').map((h, i) => (isFormColumn(h.trim()) ? i : -1));
  for (const row of rows) {
    const cells = row.split('\t');
    for (const c of cols) {
      if (c < 0 || !cells[c]) continue;
      for (const variant of cells[c].split(',')) {
        const f = parseForm(variant);
        if (!f) continue;
        if (f.bare.includes('ё')) add(f.bare.replace(/ё/g, 'е'), f.idx);
        else add(f.bare, f.idx);
      }
    }
  }
}

const words = [...forms.keys()].sort();
const lines = [
  `# Словарь ударений «В бит» (REQ-STR-4). Источник: OpenRussian.org, github.com/${REPO}@${COMMIT.slice(0, 7)}`,
  '# Лицензия: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Изменения: только формы',
  '# из 2+ слогов, апострофы → индексы ударного слога, «ё» → «е», фронт-кодирование.',
];
let prev = '';
words.forEach((w, n) => {
  let k = 0;
  if (n % RESTART !== 0) while (k < w.length && k < prev.length && w[k] === prev[k]) k++;
  const idx = [...forms.get(w)].sort((a, b) => a - b).join('');
  lines.push(`${k}${w.slice(k)}${idx}`);
  prev = w;
});

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join('\n') + '\n');
const ambiguous = words.filter((w) => forms.get(w).size > 1).length;
console.log(`${out}: ${words.length} forms, ${ambiguous} ambiguous`);
