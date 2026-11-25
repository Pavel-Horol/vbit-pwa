// REQ-DATA: общие типы ядра (SPEC §2). Чистый TS, без DOM/Vue/Web Audio.

export type Syllable = {
  text: string; // как отображать: 'КРАЛ', 'ко'; '' = пауза
  stressed: boolean;
  wordId: number; // слоги одного слова имеют одинаковый wordId; пауза = -1
  onset: string; // согласные до первой гласной, lowercase: 'кр' для 'крал', '' для 'у'
  stressSource: 'markup' | 'yo' | 'dict' | 'user' | 'none';
  /** REQ-STR-4: у слова несколько вариантов ударения в словаре (омограф) — проверь вручную. */
  ambiguous?: boolean;
  /** REQ-SYL-4: сколько букв в начале слога приклеено от слова без гласных («вдом» → 1). */
  glued?: number;
};
export type Beat = { syllables: Syllable[]; pickup?: boolean }; // слоги делят долю поровну
export type Bar = [Beat, Beat, Beat, Beat]; // только 4/4
export type Line = { syllables: Syllable[]; pickupCount: number; beats: Beat[] };

export type LayoutMode = 'manual' | 'auto' | 'stress';
export type Text = {
  id: string;
  title: string;
  raw: string;
  mode: LayoutMode;
  perBeat: 1 | 2 | 3 | 4;
  lineStartsBar: boolean;
  targetBpm: number;
  stressOverrides: Record<string, number>; // lowercase слово → индекс ударного слога
  lines: LineProgress[]; // по индексу непустой строки
  updatedAt: number;
};
export type LadderStage = 1 | 2 | 3 | 4 | 5 | 6;
export type LineProgress = {
  stage: LadderStage;
  bpm: number;
  cleanStreak: number;
  failStreak: number;
};

export type Settings = {
  week: 1 | 2 | 3 | 4;
  tickVolume: number; // 0..1, громкость тиков безударных слогов (базовая, лестница множит)
  leadMs: number; // 0..150, упреждение подсветки
  outputOffsetMs: number; // калибровка вывода звука, >= 0
  inputOffsetMs?: number; // калибровка микрофона (этап 4)
};
export type Progress = {
  days: string[]; // 'YYYY-MM-DD' по локальному времени
  sessions: number;
  breathBestSec: number;
  countBest: number;
  recordings?: { date: string; blobKey: string; textId?: string }[];
};

// --- Дополнения, на которые ссылаются сигнатуры SPEC §3–§8 ---

export type WarningCode = 'digits_removed' | 'no_beat_separators' | 'no_stress' | 'pickup_shifted';
/** line — индекс непустой строки текста (с 0). */
export type Warning = { code: WarningCode; line: number };

/** Словарь ударений (REQ-STR-4, этап 2): lowercase-слово → индексы ударного слога. */
export type StressDict = { lookup(word: string): number[] | undefined };

export type TickKind = 'downbeat' | 'beat' | 'stressed' | 'unstressed' | 'rest';
/** Громкость для каждого вида тика (REQ-TL-3). */
export type Mix = Record<Exclude<TickKind, 'rest'>, number>;
export type TimelineEvent = {
  time: number;
  bar: number;
  beat: number;
  slot: number;
  slots: number;
  kind: TickKind;
  gain: number;
};

export type DrillMode = 1 | 2 | 3 | 4 | 'auto';
export type DrillSet = 'taka' | 'pbdg' | 'rand';
