// REQ-DATA: общие типы ядра (SPEC §2). Чистый TS, без DOM/Vue/Web Audio.

export type Syllable = {
  text: string; // как отображать: 'КРАЛ', 'ко'; '' = пауза
  stressed: boolean;
  wordId: number; // слоги одного слова имеют одинаковый wordId; пауза = -1
  onset: string; // согласные до первой гласной, lowercase: 'кр' для 'крал', '' для 'у'
  stressSource: 'markup' | 'yo' | 'dict' | 'user' | 'none';
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
