<script setup lang="ts">
import { ref } from 'vue';
import { useProgressStore } from '@/stores/progress';

// REQ-SES-4 (count): число 1–300 с инлайн-ошибкой, рекорд.
const progress = useProgressStore();
// v-model на type=number отдаёт число, пустое поле — строку.
const value = ref<string | number>('');
const error = ref('');
const saved = ref<number | null>(null);

function save() {
  const raw = String(value.value).trim();
  const v = Math.round(Number(raw));
  if (!raw || !Number.isFinite(v) || v < 1 || v > 300) {
    error.value = 'Впиши число от 1 до 300';
    return;
  }
  progress.recordCount(v);
  saved.value = v;
}
</script>

<template>
  <div class="card">
    <form class="row" novalidate @submit.prevent="save">
      <label for="cnt">Досчитал до</label>
      <input
        id="cnt"
        v-model="value"
        type="number"
        min="1"
        max="300"
        inputmode="numeric"
        :aria-invalid="!!error"
        aria-describedby="cnt-err"
        @input="error = ''"
      />
      <button type="submit">Записать</button>
    </form>
    <p id="cnt-err" class="err" style="margin: 6px 0 0" aria-live="polite">{{ error }}</p>
    <p class="small mute" style="margin: 6px 0 0">
      <template v-if="saved !== null"
        >Записано: {{ saved }} · рекорд: {{ progress.countBest }}</template
      >
      <template v-else>Рекорд: {{ progress.countBest || '—' }}</template>
    </p>
  </div>
</template>
