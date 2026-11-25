import { defineStore } from 'pinia';
import type { LineProgress, Text } from '@/core/types';
import { initialProgress, remapProgress } from '@/core/ladder';
import { PRESETS } from '@/data';
import { defaultRoot, type TextsState } from './schema';

const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const useTextsStore = defineStore('texts', {
  state: (): TextsState => defaultRoot().texts,
  getters: {
    /** Текущий текст — последний открытый (его берут шаги тренировки). */
    current: (s): Text => s.texts.find((t) => t.id === s.currentId) ?? s.texts[0]!,
    /** Свой текст: не пустой и не совпадает ни с одним примером. */
    isOwn(): boolean {
      const raw = this.current.raw;
      return raw.trim() !== '' && !PRESETS.some((p) => p.raw === raw);
    },
    byId: (s) => (id: string) => s.texts.find((t) => t.id === id),
  },
  actions: {
    /** Правка текущего текста. При смене текста строк прогресс лестницы переносится (REQ-LAD-5). */
    update(patch: Partial<Omit<Text, 'id'>>) {
      updateText(this.current, patch);
    },
    open(id: string) {
      if (this.texts.some((t) => t.id === id)) this.currentId = id;
    },
    /** REQ-TXT-1: новый пустой текст; становится текущим. */
    create(): Text {
      const n = this.texts.length + 1;
      const base = defaultRoot(Date.now()).texts.texts[0]!;
      const text: Text = {
        ...base,
        id: newId(),
        title: `Текст ${n}`,
        raw: '',
        mode: 'stress',
        perBeat: 2,
      };
      this.texts.push(text);
      this.currentId = text.id;
      return text;
    },
    rename(id: string, title: string) {
      const t = this.byId(id);
      if (t) updateText(t, { title });
    },
    /** Удаление; если удалили последний текст — создаётся новый пустой. */
    remove(id: string) {
      this.texts = this.texts.filter((t) => t.id !== id);
      if (!this.texts.length) this.create();
      if (!this.texts.some((t) => t.id === this.currentId)) this.currentId = this.texts[0]!.id;
    },
  },
});

export function updateText(text: Text, patch: Partial<Omit<Text, 'id'>>) {
  if (patch.raw !== undefined && patch.raw !== text.raw) {
    text.lines = remapProgress(text.raw, patch.raw, text.lines, patch.targetBpm ?? text.targetBpm);
  }
  Object.assign(text, patch, { updatedAt: Date.now() });
}

/** REQ-LAD: записать прогресс лестницы в строки `indices` текста. */
export function setLineProgress(text: Text, indices: number[], lp: LineProgress) {
  for (let i = 0; i < Math.max(...indices) + 1; i++)
    text.lines[i] ??= initialProgress(text.targetBpm);
  for (const i of indices) text.lines[i] = { ...lp };
  text.updatedAt = Date.now();
}
