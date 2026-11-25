import { defineStore } from 'pinia';
import type { Progress } from '@/core/types';
import { addDay, dayKey, streak } from '@/core/days';
import { defaultRoot } from './schema';

export const useProgressStore = defineStore('progress', {
  state: (): Progress => defaultRoot().progress,
  getters: {
    streak: (s) => streak(s.days, new Date()),
  },
  actions: {
    /** REQ-SES-6 */
    finishSession(now = new Date()) {
      this.days = addDay(this.days, dayKey(now));
      this.sessions++;
    },
    recordBreath(sec: number): boolean {
      if (sec <= this.breathBestSec) return false;
      this.breathBestSec = sec;
      return true;
    },
    recordCount(n: number): number {
      this.countBest = Math.max(this.countBest, n);
      return this.countBest;
    },
  },
});
