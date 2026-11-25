// REQ-MIC-6: проверка детектора на размеченных записях.
//
// Файлы — в папке validation/ в корне репозитория (она в .gitignore: это голос пользователя):
//   validation/<имя>.wav  — запись из «Настройки → Проверка детектора» (в ней чанк с метаданными)
//   validation/<имя>.txt  — метки Audacity (Файл → Экспорт → Экспорт меток): начало гласной
//                           каждого слога, текст метки не важен
// Запуск: npm run validate:mic
// Критерий: детектор находит ≥ 80% слогов с ошибкой ≤ 30 мс.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clickMask, countInClickLevel, maskLevel } from '@/core/micScore';
import { detectOnsets, type Mask } from '@/core/onset';
import { decodeWav } from '@/core/wav';

const DIR = join(process.cwd(), 'validation');
const TOL_S = 0.03;
const NEED = 0.8;

type Meta = {
  inputOffsetMs: number | null;
  micClickDb: number | null;
  bpm: number;
  stage: number;
  text: string;
  clicks: { t: number; kind: string; gain: number; bar: number; beat: number; slot: number }[];
  expected: { time: number; halfSlot: number; stressed: boolean; text: string }[];
};

function readLabels(txt: string): number[] {
  return txt
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('\\'))
    .map((l) => Number(l.split('\t')[0]!.replace(',', '.')))
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b);
}

/** Пары метка ↔ онсет один к одному, сначала самые близкие. */
function match(labels: number[], onsets: number[]) {
  const pairs: { l: number; o: number; d: number }[] = [];
  labels.forEach((l, li) =>
    onsets.forEach((o, oi) => {
      const d = Math.abs(o - l);
      if (d <= TOL_S) pairs.push({ l: li, o: oi, d });
    }),
  );
  pairs.sort((a, b) => a.d - b.d);
  const usedL = new Set<number>();
  const usedO = new Set<number>();
  const hits: { l: number; d: number }[] = [];
  for (const p of pairs) {
    if (usedL.has(p.l) || usedO.has(p.o)) continue;
    usedL.add(p.l);
    usedO.add(p.o);
    hits.push({ l: p.l, d: p.d });
  }
  return { hits, extra: onsets.length - usedO.size };
}

const files = existsSync(DIR)
  ? readdirSync(DIR)
      .filter((f) => f.endsWith('.wav') && existsSync(join(DIR, f.replace(/\.wav$/, '.txt'))))
      .sort()
  : [];

describe.skipIf(!files.length)('REQ-MIC-6: detector on labelled recordings', () => {
  it(`finds ≥ ${NEED * 100}% of syllables within ${TOL_S * 1000} ms`, () => {
    let total = 0;
    let found = 0;
    let stressedTotal = 0;
    let stressedFound = 0;
    const errs: number[] = [];
    const rows: string[] = [];
    for (const f of files) {
      const wav = decodeWav(new Uint8Array(readFileSync(join(DIR, f))));
      const meta = wav.meta ? (JSON.parse(wav.meta) as Meta) : null;
      const labels = readLabels(readFileSync(join(DIR, f.replace(/\.wav$/, '.txt')), 'utf8'));
      const io = meta?.inputOffsetMs ?? 0;
      // как в приложении (audio/mic/listener.ts): порог масок — по щелчкам отсчёта
      const isCountIn = (c: Meta['clicks'][number]) => c.bar === 0 && c.slot === 0 && c.beat < 3;
      const countIn = (meta?.clicks ?? []).filter(isCountIn).map((c) => c.t);
      const unmasked = detectOnsets(wav.samples, wav.sampleRate);
      const level = meta
        ? maskLevel(countInClickLevel(countIn, unmasked, io, 0), meta.micClickDb ?? undefined)
        : null;
      const masks: Mask[] =
        meta && level !== null
          ? meta.clicks.filter((c) => !isCountIn(c)).map((c) => clickMask(c.t, c.gain, io, level))
          : [];
      const onsets = detectOnsets(wav.samples, wav.sampleRate, 0, { masks }).map((o) => o.time);
      const { hits, extra } = match(labels, onsets);
      // ударная ли метка — по ближайшему ожидаемому слогу из метаданных
      const stressed = labels.map((l) => {
        let best: Meta['expected'][number] | undefined;
        for (const e of meta?.expected ?? []) {
          const d = Math.abs(e.time + io / 1000 - l);
          if (d <= e.halfSlot && (!best || d < Math.abs(best.time + io / 1000 - l))) best = e;
        }
        return !!best?.stressed;
      });
      const hitSet = new Set(hits.map((h) => h.l));
      total += labels.length;
      found += hits.length;
      stressedTotal += stressed.filter(Boolean).length;
      stressedFound += stressed.filter((s, i) => s && hitSet.has(i)).length;
      errs.push(...hits.map((h) => h.d * 1000));
      const pct = labels.length ? Math.round((hits.length / labels.length) * 100) : 0;
      rows.push(
        `${f}: ${hits.length}/${labels.length} (${pct}%), лишних онсетов ${extra}` +
          (meta ? `, ${meta.bpm} BPM, ступень ${meta.stage}` : '') +
          `, маски: ${level === null ? 'нет' : `${level} дБ`}`,
      );
    }
    const share = total ? found / total : 0;
    const mean = errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : 0;
    console.log(
      [
        ...rows,
        `Всего: ${found}/${total} = ${(share * 100).toFixed(1)}% (нужно ≥ ${NEED * 100}%), ` +
          `средняя ошибка ${mean.toFixed(1)} мс`,
        `Только ударные: ${stressedFound}/${stressedTotal} = ${
          stressedTotal ? ((stressedFound / stressedTotal) * 100).toFixed(1) : '—'
        }%`,
      ].join('\n'),
    );
    expect(share).toBeGreaterThanOrEqual(NEED);
  });
});
