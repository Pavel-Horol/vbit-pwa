import { defineStore } from 'pinia';
import { STEPS } from '@/data';

/** Состояние прохождения тренировки (не сохраняется между запусками, как в прототипе). */
export const useSessionStore = defineStore('session', {
  state: () => ({ index: 0, left: STEPS[0]!.durationSec, finished: false }),
});
