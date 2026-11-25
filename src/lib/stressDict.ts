// REQ-STR-4: ленивая загрузка словаря ударений (не в основном бандле; офлайн — из precache).
import { shallowRef } from 'vue';
import { parseStressDict } from '@/core/stressDict';
import type { StressDict } from '@/core/types';

export const STRESS_DICT_URL = `${import.meta.env.BASE_URL}dict/stress.txt`;

/** Загруженный словарь; пока не загружен — undefined (раскладка работает без него). */
export const stressDict = shallowRef<StressDict | undefined>();

let loading: Promise<void> | undefined;

export function ensureStressDict(): Promise<void> {
  loading ??= fetch(STRESS_DICT_URL)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((text) => {
      stressDict.value = parseStressDict(text);
    })
    .catch(() => {
      loading = undefined; // повторим при следующем открытии экрана
    });
  return loading;
}
