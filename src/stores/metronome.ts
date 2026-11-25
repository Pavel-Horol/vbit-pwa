import { defineStore } from 'pinia';
import { defaultRoot, type MetronomeState } from './schema';

export const useMetronomeStore = defineStore('metronome', {
  state: (): MetronomeState => defaultRoot().metronome,
});
