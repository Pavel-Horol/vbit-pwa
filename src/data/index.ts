// REQ-SES-1, REQ-TXT-2: данные, перенесённые из прототипа без изменения текстов.
import type { DrillMode, LayoutMode } from '@/core/types';
import stepsJson from './steps.json';
import weeksJson from './weeks.json';
import presetsJson from './presets.json';

export type StepKind = 'breath' | 'count' | 'ends' | 'drill' | 'karl' | 'mytext';
export type Step = {
  block: string;
  title: string;
  durationSec: number;
  body: string;
  list?: string[];
  kind?: StepKind;
};
export type Week = { bpm: number; tip: string };
export type Preset = { name: string; mode: LayoutMode; perBeat: 1 | 2 | 3 | 4; raw: string };

export const STEPS = stepsJson as Step[];
export const WEEKS = weeksJson as Week[];
export const PRESETS = presetsJson as Preset[];

export const DRILL_MODES: [DrillMode, string][] = [
  [1, '1'],
  [2, '2'],
  [3, '3'],
  [4, '4'],
  ['auto', 'Авто 1→2→4→3'],
];
