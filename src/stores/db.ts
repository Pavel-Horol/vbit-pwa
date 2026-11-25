// REQ-DATA-1: хранение в IndexedDB через idb-keyval.
import { get, set } from 'idb-keyval';
import { defaultRoot, fromPrototype, migrate, type RootData } from './schema';

const KEY = 'vbit-data';

function readPrototype(): RootData | null {
  try {
    return fromPrototype((k) => localStorage.getItem(k), Date.now());
  } catch {
    return null;
  }
}

/** Загружает данные; при первом запуске импортирует прототип (REQ-DATA-2). */
export async function loadRoot(): Promise<RootData> {
  let stored: unknown;
  try {
    stored = await get(KEY);
  } catch {
    stored = undefined;
  }
  if (stored !== undefined) return migrate(stored, Date.now());
  const root = readPrototype() ?? defaultRoot(Date.now());
  await saveRoot(root);
  return root;
}

export async function saveRoot(root: RootData): Promise<void> {
  try {
    await set(KEY, JSON.parse(JSON.stringify(root)) as RootData);
  } catch {
    // приватный режим / нет места — приложение работает, просто без сохранения
  }
}
