import { defineStore } from 'pinia';
import type { Settings } from '@/core/types';
import { defaultRoot } from './schema';

export const useSettingsStore = defineStore('settings', {
  // Необязательные поля объявлены сразу: Pinia отдаёт как свойства стора только ключи,
  // которые были в состоянии при создании, — иначе $patch при загрузке их бы «не видел».
  state: (): Settings => ({
    inputOffsetMs: undefined,
    micClickDb: undefined,
    micScoring: false,
    ...defaultRoot().settings,
  }),
});
