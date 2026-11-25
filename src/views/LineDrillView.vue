<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useTextsStore } from '@/stores/texts';
import LineDrill from '@/components/LineDrill.vue';

const route = useRoute();
const store = useTextsStore();
const text = computed(() => store.byId(String(route.params.id)));
const line = computed(() => {
  const n = Number(route.query.line);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
});
</script>

<template>
  <section aria-labelledby="title">
    <RouterLink class="btn back" :to="text ? `/texts/${text.id}` : '/texts'">← Текст</RouterLink>
    <h2 id="title">Разбор строки</h2>
    <template v-if="text && text.raw.trim()">
      <p class="small mute">
        Строка крутится по кругу. После каждого круга нажми «Чисто» или «Сбился» — темп и подпорки
        подстроятся сами.
      </p>
      <LineDrill :key="text.id" :text="text" :line="line" />
    </template>
    <p v-else class="mute">Текст пустой. Впиши строки в редакторе — и возвращайся.</p>
  </section>
</template>
