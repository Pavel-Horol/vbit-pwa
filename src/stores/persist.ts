// Связка Pinia ↔ IndexedDB: загрузка до монтирования и отложенное сохранение.
import type { Pinia } from 'pinia';
import { loadRoot, saveRoot } from './db';
import { SCHEMA_VERSION, type RootData } from './schema';
import { useMetronomeStore } from './metronome';
import { useProgressStore } from './progress';
import { useSettingsStore } from './settings';
import { useTextsStore } from './texts';
import { onAppHidden } from '@/platform/lifecycle';

const SAVE_DELAY_MS = 300;

function stores(pinia?: Pinia) {
  return {
    settings: useSettingsStore(pinia),
    progress: useProgressStore(pinia),
    texts: useTextsStore(pinia),
    metronome: useMetronomeStore(pinia),
  };
}

/** Заменяет данные во всех сторах (загрузка, REQ-DATA-3 импорт). Сохранение — подпиской. */
export function applyRoot(root: RootData, pinia?: Pinia) {
  const { settings, progress, texts, metronome } = stores(pinia);
  settings.$reset();
  settings.$patch(root.settings);
  progress.$reset();
  progress.$patch(root.progress);
  texts.$patch((s) => {
    s.texts = root.texts.texts;
    s.currentId = root.texts.currentId;
  });
  metronome.$patch(root.metronome);
}

/** Текущие данные всех сторов (REQ-DATA-3 экспорт). */
export function snapshotRoot(pinia?: Pinia): RootData {
  const { settings, progress, texts, metronome } = stores(pinia);
  return JSON.parse(
    JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      settings: settings.$state,
      progress: progress.$state,
      texts: texts.$state,
      metronome: metronome.$state,
    }),
  ) as RootData;
}

export async function initPersistence(pinia: Pinia): Promise<void> {
  const root = await loadRoot();
  const { settings, progress, texts, metronome } = stores(pinia);
  applyRoot(root, pinia);

  const snapshot = (): RootData => ({
    schemaVersion: SCHEMA_VERSION,
    settings: settings.$state,
    progress: progress.$state,
    texts: texts.$state,
    metronome: metronome.$state,
    ...(root.importedFromPrototype ? { importedFromPrototype: true } : {}),
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    void saveRoot(snapshot());
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY_MS);
  };
  for (const s of [settings, progress, texts, metronome])
    s.$subscribe(schedule, { detached: true });
  onAppHidden(() => {
    if (timer !== undefined) flush();
  });
}
