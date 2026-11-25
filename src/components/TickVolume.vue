<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings';

/** REQ-SND-1 / REQ-MET-1: громкость тиков слогов, общая для всех плееров. */
const settings = useSettingsStore();
defineProps<{ disabledHint?: string }>();
</script>

<template>
  <label class="row small mute ticks">
    <span>Тики слогов</span>
    <input
      type="range"
      min="0"
      max="100"
      step="5"
      :value="Math.round(settings.tickVolume * 100)"
      :disabled="!!disabledHint"
      @input="settings.tickVolume = +($event.target as HTMLInputElement).value / 100"
    />
    <span class="val">{{ disabledHint ?? Math.round(settings.tickVolume * 100) + '%' }}</span>
  </label>
</template>

<style scoped>
.ticks {
  gap: 8px;
}
.ticks input {
  flex: 1 1 120px;
}
.val {
  min-width: 44px;
  text-align: right;
}
</style>
