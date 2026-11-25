import { defineStore } from 'pinia';
import type { Text } from '@/core/types';
import { PRESETS } from '@/data';
import { defaultRoot, type TextsState } from './schema';

export const useTextsStore = defineStore('texts', {
  state: (): TextsState => defaultRoot().texts,
  getters: {
    current: (s): Text => s.texts.find((t) => t.id === s.currentId) ?? s.texts[0]!,
    /** Свой текст: не пустой и не совпадает ни с одним примером. */
    isOwn(): boolean {
      const raw = this.current.raw;
      return raw.trim() !== '' && !PRESETS.some((p) => p.raw === raw);
    },
  },
  actions: {
    update(patch: Partial<Omit<Text, 'id'>>) {
      Object.assign(this.current, patch, { updatedAt: Date.now() });
    },
  },
});
