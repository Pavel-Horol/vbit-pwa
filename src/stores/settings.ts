import { defineStore } from 'pinia';
import type { Settings } from '@/core/types';
import { defaultRoot } from './schema';

export const useSettingsStore = defineStore('settings', {
  state: (): Settings => defaultRoot().settings,
});
