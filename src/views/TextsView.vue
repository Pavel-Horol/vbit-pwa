<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { nonEmptyLines } from '@/core/parse';
import { plainLine, plural } from '@/lib/format';
import { useTextsStore } from '@/stores/texts';

// REQ-TXT-1: библиотека текстов.
const store = useTextsStore();
const router = useRouter();

const firstLine = (raw: string, mode: 'manual' | 'auto' | 'stress') => {
  const l = nonEmptyLines(raw)[0];
  return l ? plainLine(l, mode) : 'пустой текст';
};
const lineCount = (raw: string) => nonEmptyLines(raw).length;

function open(id: string) {
  store.open(id);
  void router.push(`/texts/${id}`);
}
function create() {
  open(store.create().id);
}

const deleting = ref<string | null>(null);
function remove(id: string) {
  store.remove(id);
  deleting.value = null;
}
</script>

<template>
  <section aria-labelledby="title">
    <h2 id="title">Тексты</h2>
    <p class="small mute">
      Свои куплеты и скороговорки. Тренировка берёт тот текст, который ты открывал последним.
    </p>
    <button type="button" class="pri wide" @click="create">Новый текст</button>
    <div class="sp"></div>
    <ul class="list" data-testid="text-list">
      <li v-for="t in store.texts" :key="t.id" class="card item">
        <button type="button" class="open" @click="open(t.id)">
          <span class="title">
            {{ t.title || 'Без названия' }}
            <span v-if="t.id === store.currentId" class="small cur">текущий</span>
          </span>
          <span class="small mute line">{{ firstLine(t.raw, t.mode) }}</span>
          <span class="small mute">
            {{ lineCount(t.raw) }}
            {{ plural(lineCount(t.raw), 'строка', 'строки', 'строк') }}
          </span>
        </button>
        <div
          v-if="deleting === t.id"
          class="confirm"
          role="alertdialog"
          :aria-label="`Удалить ${t.title}`"
        >
          <p style="margin: 0 0 10px">
            Удалить «{{ t.title || 'Без названия' }}»? Вернуть не получится.
          </p>
          <div class="row">
            <button type="button" class="pri" @click="remove(t.id)">Удалить</button>
            <button type="button" @click="deleting = null">Отмена</button>
          </div>
        </div>
        <button
          v-else
          type="button"
          class="del"
          :aria-label="`Удалить ${t.title || 'текст'}`"
          @click="deleting = t.id"
        >
          Удалить
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.wide {
  width: 100%;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.item {
  display: grid;
  gap: 8px;
  padding: 10px;
}
.open {
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  text-align: left;
  white-space: normal;
  padding: 8px 10px;
  background: transparent;
  border: 0;
}
.title {
  font-weight: 700;
}
.cur {
  font-weight: 400;
  color: var(--acc);
  margin-left: 6px;
}
.line {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.del {
  justify-self: end;
}
.confirm {
  border-top: 1px solid var(--line);
  padding-top: 10px;
}
</style>
