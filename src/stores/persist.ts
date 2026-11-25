// Связка Pinia ↔ IndexedDB: загрузка до монтирования и отложенное сохранение.
import type { Pinia } from 'pinia';
import { loadRoot, saveRoot } from './db';
import { SCHEMA_VERSION, type RootData } from './schema';
import { useMetronomeStore } from './metronome';
import { useProgressStore } from './progress';
import { useSettingsStore } from './settings';
import { useTextsStore } from './texts';

const SAVE_DELAY_MS = 300;

export async function initPersistence(pinia: Pinia): Promise<void> {
  const root = await loadRoot();
  const settings = useSettingsStore(pinia);
  const progress = useProgressStore(pinia);
  const texts = useTextsStore(pinia);
  const metronome = useMetronomeStore(pinia);
  settings.$patch(root.settings);
  progress.$patch(root.progress);
  texts.$patch(root.texts);
  metronome.$patch(root.metronome);

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
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && timer !== undefined) flush();
  });
}
