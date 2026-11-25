<script setup lang="ts" generic="T extends string | number">
defineProps<{ options: [T, string][]; label: string }>();
const model = defineModel<T>({ required: true });
</script>

<template>
  <div class="row" role="group" :aria-label="label">
    <button
      v-for="[value, text] in options"
      :key="String(value)"
      type="button"
      class="chip"
      :aria-pressed="model === value"
      @click="model = value"
    >
      {{ text }}
    </button>
  </div>
</template>

<style scoped>
.chip[aria-pressed='true'] {
  background: var(--ink);
  color: var(--bg);
  border-color: var(--ink);
  font-weight: 600;
}
</style>
