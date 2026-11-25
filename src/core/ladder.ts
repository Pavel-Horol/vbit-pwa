// REQ-LAD: «лестница» — ступени, которые постепенно убирают подпорки при разборе строки.
import { layout, type LayoutInput, type LayoutResult } from './layout';
import { nonEmptyLines } from './parse';
import { baseMix, BPM_MIN, loopWithPickup } from './timeline';
import type { Bar, LadderStage, LineProgress, Mix, StressDict } from './types';

export type RenderMode = 'skeleton' | 'syllables' | 'words' | 'karaoke' | 'memory';

type StageInfo = { name: string; render: RenderMode; ticks: number; stressedClick: boolean };

/** Таблица ступеней (SPEC §13). */
export const STAGES: Record<LadderStage, StageInfo> = {
  1: { name: 'Скелет', render: 'skeleton', ticks: 1, stressedClick: true },
  2: { name: 'Слоги', render: 'syllables', ticks: 1, stressedClick: true },
  3: { name: 'Слова', render: 'words', ticks: 0.5, stressedClick: true },
  4: { name: 'Доли', render: 'words', ticks: 0, stressedClick: true },
  5: { name: 'Чистый бит', render: 'karaoke', ticks: 0, stressedClick: false },
  6: { name: 'Наизусть', render: 'memory', ticks: 0, stressedClick: false },
};
export const LADDER_STAGES = [1, 2, 3, 4, 5, 6] as const satisfies readonly LadderStage[];

/** REQ-LAD-1: громкости на ступени; `tickVolume` — базовая громкость тиков из настроек. */
export function mixForStage(stage: LadderStage, tickVolume = 1): Mix {
  const s = STAGES[stage];
  const mix = baseMix(tickVolume, s.ticks);
  return s.stressedClick ? mix : { ...mix, stressed: 0 };
}

export const renderModeForStage = (stage: LadderStage): RenderMode => STAGES[stage].render;

export const CLEAN_TO_SPEED_UP = 3;
export const FAILS_TO_SLOW_DOWN = 2;

// Проценты считаем в целых числах: 85 × 0.7 во float = 59.49999…, а должно округлиться до 60.
const percent = (bpm: number, p: number) => Math.round((bpm * p) / 100);

/** Старт ступени — 70% целевого темпа (не ниже минимального темпа). */
export const startBpm = (targetBpm: number) => Math.max(BPM_MIN, percent(targetBpm, 70));

export const initialProgress = (targetBpm: number): LineProgress => ({
  stage: 1,
  bpm: startBpm(targetBpm),
  cleanStreak: 0,
  failStreak: 0,
});

/** REQ-LAD-2 */
export function nextState(
  state: LineProgress,
  result: 'clean' | 'fail',
  targetBpm: number,
): LineProgress {
  const s = { ...state };
  if (result === 'clean') {
    s.cleanStreak++;
    s.failStreak = 0;
    if (s.cleanStreak === CLEAN_TO_SPEED_UP) {
      s.cleanStreak = 0;
      if (s.bpm >= targetBpm) {
        s.stage = Math.min(6, s.stage + 1) as LadderStage;
        s.bpm = startBpm(targetBpm);
      } else {
        s.bpm = Math.min(targetBpm, percent(s.bpm, 105));
      }
    }
  } else {
    s.failStreak++;
    s.cleanStreak = 0;
    if (s.failStreak === FAILS_TO_SLOW_DOWN) {
      s.failStreak = 0;
      s.bpm = Math.max(BPM_MIN, percent(s.bpm, 95));
    }
  }
  return s;
}

export const progressAt = (lines: LineProgress[], i: number, targetBpm: number): LineProgress =>
  lines[i] ?? initialProgress(targetBpm);

/**
 * REQ-LAD-5: прогресс после правки текста. Строки сопоставляются по содержимому (без пробелов по
 * краям): неизменённая строка сохраняет прогресс даже после вставки строк выше, изменённая или
 * новая начинает со ступени 1. Повторяющиеся строки сопоставляются по порядку.
 */
export function remapProgress(
  oldRaw: string,
  newRaw: string,
  old: LineProgress[],
  targetBpm: number,
): LineProgress[] {
  const pool = new Map<string, LineProgress[]>();
  nonEmptyLines(oldRaw).forEach((line, i) => {
    const key = line.trim();
    const list = pool.get(key) ?? [];
    list.push(progressAt(old, i, targetBpm));
    pool.set(key, list);
  });
  return nonEmptyLines(newRaw).map(
    (line) => pool.get(line.trim())?.shift() ?? initialProgress(targetBpm),
  );
}

/** REQ-SES-5: строка с наименьшей ступенью (первая при равенстве); −1, если строк нет. */
export function lowestStageLine(count: number, lines: LineProgress[]): number {
  let best = -1;
  let bestStage = Infinity;
  for (let i = 0; i < count; i++) {
    const stage = lines[i]?.stage ?? 1;
    if (stage < bestStage) {
      best = i;
      bestStage = stage;
    }
  }
  return best;
}

/**
 * Раскладка для разбора строк [start, start + count): каждая строка с нового такта, `loop` — такты
 * для игры по кругу (с затактом первой строки в конце круга, REQ-LAY-3).
 */
export function drillLayout(
  text: LayoutInput,
  start: number,
  count: number,
  dict?: StressDict,
): LayoutResult & { loop: Bar[] } {
  const raw = nonEmptyLines(text.raw)
    .slice(start, start + count)
    .join('\n');
  const r = layout({ ...text, raw, lineStartsBar: true }, dict);
  return { ...r, loop: loopWithPickup(r.bars, r.pickup) };
}

/** REQ-LAD-3: сколько кругов закончено к такту `bar` (такт 0 — отсчёт, круг — `loopBars` тактов). */
export const completedLoops = (bar: number, loopBars: number) =>
  bar < 1 || loopBars < 1 ? 0 : Math.floor((bar - 1) / loopBars);
