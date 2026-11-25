// REQ-DATA-1/2: корень данных, миграции схемы и импорт из localStorage прототипа.
// Чистые функции: без IndexedDB/localStorage, чтобы покрыть тестами.
import type {
  DrillMode,
  DrillSet,
  LadderStage,
  LineProgress,
  Progress,
  Settings,
  Text,
} from '@/core/types';
import { clampBpm } from '@/core/timeline';
import { initialProgress } from '@/core/ladder';
import { MIC_CAL_MAX_MS } from '@/core/micScore';
import type { Recording } from '@/core/recordings';
import { PRESETS } from '@/data';

export const SCHEMA_VERSION = 1;

export type MetronomeState = { mode: DrillMode; set: DrillSet; bpm: number };
export type TextsState = { texts: Text[]; currentId: string };

export type RootData = {
  schemaVersion: number;
  settings: Settings;
  progress: Progress;
  texts: TextsState;
  metronome: MetronomeState;
  /** true, если при первом запуске нашлись ключи прототипа. */
  importedFromPrototype?: boolean;
};

export const MAIN_TEXT_ID = 'main';

export function defaultText(now = 0): Text {
  const p = PRESETS[0]!;
  return {
    id: MAIN_TEXT_ID,
    title: 'Мой текст',
    raw: p.raw,
    mode: p.mode,
    perBeat: p.perBeat,
    lineStartsBar: true,
    targetBpm: 75,
    stressOverrides: {},
    lines: [],
    updatedAt: now,
  };
}

export function defaultRoot(now = 0): RootData {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { week: 1, tickVolume: 1, leadMs: 60, outputOffsetMs: 0 },
    progress: { days: [], sessions: 0, breathBestSec: 0, countBest: 0 },
    texts: { texts: [defaultText(now)], currentId: MAIN_TEXT_ID },
    metronome: { mode: 1, set: 'taka', bpm: 80 },
  };
}

// --- санитайзеры: всё, что пришло из хранилища, считаем недоверенным ---

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number, min = -Infinity, max = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : d;
const oneOf = <T>(v: unknown, allowed: readonly T[], d: T): T =>
  allowed.includes(v as T) ? (v as T) : d;
const strArr = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeSettings(v: unknown, d: Settings): Settings {
  const s = isObj(v) ? v : {};
  const out: Settings = {
    week: oneOf(s.week, [1, 2, 3, 4] as const, d.week),
    tickVolume: num(s.tickVolume, d.tickVolume, 0, 1),
    leadMs: num(s.leadMs, d.leadMs, 0, 150),
    outputOffsetMs: num(s.outputOffsetMs, d.outputOffsetMs, 0, 400),
  };
  if (typeof s.inputOffsetMs === 'number')
    out.inputOffsetMs = num(s.inputOffsetMs, 0, 0, MIC_CAL_MAX_MS);
  if (typeof s.micClickDb === 'number') out.micClickDb = num(s.micClickDb, -40, -120, 0);
  if (typeof s.micScoring === 'boolean') out.micScoring = s.micScoring;
  return out;
}

function sanitizeProgress(v: unknown, d: Progress): Progress {
  const p = isObj(v) ? v : {};
  return {
    days: strArr(p.days).filter((x) => DAY.test(x)),
    sessions: Math.round(num(p.sessions, d.sessions, 0)),
    breathBestSec: num(p.breathBestSec, d.breathBestSec, 0),
    countBest: Math.round(num(p.countBest, d.countBest, 0, 300)),
    ...(Array.isArray(p.recordings)
      ? {
          recordings: p.recordings.filter(
            (r): r is Recording =>
              isObj(r) &&
              typeof r.date === 'string' &&
              DAY.test(r.date) &&
              typeof r.blobKey === 'string',
          ),
        }
      : {}),
  };
}

function sanitizeLine(v: unknown, targetBpm: number): LineProgress {
  if (!isObj(v)) return initialProgress(targetBpm);
  return {
    stage: oneOf(v.stage, [1, 2, 3, 4, 5, 6] as const, 1 as LadderStage),
    bpm: clampBpm(num(v.bpm, initialProgress(targetBpm).bpm)),
    cleanStreak: Math.round(num(v.cleanStreak, 0, 0, 2)),
    failStreak: Math.round(num(v.failStreak, 0, 0, 1)),
  };
}

function sanitizeText(v: unknown, d: Text): Text {
  const t = isObj(v) ? v : {};
  const targetBpm = clampBpm(num(t.targetBpm, d.targetBpm));
  return {
    id: typeof t.id === 'string' && t.id ? t.id : d.id,
    title: typeof t.title === 'string' ? t.title : d.title,
    raw: typeof t.raw === 'string' ? t.raw : d.raw,
    mode: oneOf(t.mode, ['manual', 'auto', 'stress'] as const, d.mode),
    perBeat: oneOf(t.perBeat, [1, 2, 3, 4] as const, d.perBeat),
    lineStartsBar: typeof t.lineStartsBar === 'boolean' ? t.lineStartsBar : d.lineStartsBar,
    targetBpm,
    // индекс ударного слога; -1 — «без ударения» (REQ-STR-7)
    stressOverrides: isObj(t.stressOverrides)
      ? (Object.fromEntries(
          Object.entries(t.stressOverrides).filter(
            ([, i]) => Number.isInteger(i) && (i as number) >= -1,
          ),
        ) as Record<string, number>)
      : {},
    lines: Array.isArray(t.lines) ? t.lines.map((l) => sanitizeLine(l, targetBpm)) : [],
    updatedAt: num(t.updatedAt, d.updatedAt),
  };
}

function sanitizeMetronome(v: unknown, d: MetronomeState): MetronomeState {
  const m = isObj(v) ? v : {};
  return {
    mode: oneOf(m.mode, [1, 2, 3, 4, 'auto'] as const, d.mode),
    set: oneOf(m.set, ['taka', 'pbdg', 'rand'] as const, d.set),
    bpm: clampBpm(num(m.bpm, d.bpm)),
  };
}

/**
 * Приводит сохранённые данные к текущей схеме. Новые версии добавляют шаги
 * `if (version < N) data = upgradeToN(data)` перед санитайзингом.
 */
export function migrate(raw: unknown, now = 0): RootData {
  const d = defaultRoot(now);
  if (!isObj(raw)) return d;
  // schemaVersion 1 — первая версия, шагов апгрейда пока нет. Данные из более новой версии
  // читаем «как можем»: санитайзеры берут понятные поля.
  const textsIn = isObj(raw.texts) ? raw.texts : {};
  const list = Array.isArray(textsIn.texts)
    ? textsIn.texts.map((t) => sanitizeText(t, d.texts.texts[0]!))
    : [];
  const texts = list.length ? list : d.texts.texts;
  const currentId =
    typeof textsIn.currentId === 'string' && texts.some((t) => t.id === textsIn.currentId)
      ? textsIn.currentId
      : texts[0]!.id;
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: sanitizeSettings(raw.settings, d.settings),
    progress: sanitizeProgress(raw.progress, d.progress),
    texts: { texts, currentId },
    metronome: sanitizeMetronome(raw.metronome, d.metronome),
    ...(raw.importedFromPrototype === true ? { importedFromPrototype: true } : {}),
  };
}

const PROTO_KEYS = ['week', 'text', 'days', 'total', 'breath', 'count', 'mMode', 'mSet', 'mBpm'];

/**
 * REQ-DATA-2: данные прототипа из localStorage (`vbit_*`, значения — JSON).
 * `get` возвращает сырое значение ключа или null. Ключи не удаляются.
 * Возвращает null, если ни одного ключа прототипа нет.
 */
export function fromPrototype(get: (key: string) => string | null, now = 0): RootData | null {
  const read = (k: string): unknown => {
    const v = get('vbit_' + k);
    if (v == null) return undefined;
    try {
      return JSON.parse(v);
    } catch {
      return undefined;
    }
  };
  const vals = Object.fromEntries(PROTO_KEYS.map((k) => [k, read(k)]));
  if (PROTO_KEYS.every((k) => vals[k] === undefined)) return null;

  const root = defaultRoot(now);
  const week = num(vals.week, -1);
  if ([0, 1, 2, 3].includes(week)) root.settings.week = (week + 1) as Settings['week'];

  if (isObj(vals.text)) {
    const t = vals.text;
    const base = root.texts.texts[0]!;
    root.texts.texts[0] = sanitizeText(
      {
        ...base,
        mode: t.mode,
        perBeat: t.n,
        lineStartsBar: t.nb,
        raw: t.text,
        targetBpm: t.bpm,
        updatedAt: now,
      },
      base,
    );
  }

  root.progress = sanitizeProgress(
    { days: vals.days, sessions: vals.total, breathBestSec: vals.breath, countBest: vals.count },
    root.progress,
  );
  root.metronome = sanitizeMetronome(
    { mode: vals.mMode, set: vals.mSet, bpm: vals.mBpm },
    root.metronome,
  );
  root.importedFromPrototype = true;
  return root;
}

// --- REQ-DATA-3: экспорт / импорт одним JSON-файлом (без аудиозаписей) ---

export function exportData(root: RootData, now = Date.now()): string {
  const progress = { ...root.progress };
  delete progress.recordings;
  return JSON.stringify({ app: 'vbit', exportedAt: now, ...root, progress }, null, 2);
}

export type ImportResult =
  { ok: true; root: RootData } | { ok: false; error: 'not_json' | 'not_vbit' };

export function parseImport(text: string, now = Date.now()): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not_json' };
  }
  if (!isObj(data) || (data.app !== 'vbit' && typeof data.schemaVersion !== 'number'))
    return { ok: false, error: 'not_vbit' };
  const root = migrate(data, now);
  delete root.progress.recordings;
  return { ok: true, root };
}
