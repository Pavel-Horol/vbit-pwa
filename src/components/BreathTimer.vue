<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { useProgressStore } from '@/stores/progress';

// REQ-SES-4 (breath): секундомер выдоха, лог попыток, рекорд.
const progress = useProgressStore();
const running = ref(false);
const elapsed = ref(0);
const log = ref<string[]>([]);
let startedAt = 0;
let raf = 0;

function frame() {
  elapsed.value = (performance.now() - startedAt) / 1000;
  raf = requestAnimationFrame(frame);
}
function toggle() {
  if (!running.value) {
    startedAt = performance.now();
    running.value = true;
    frame();
    return;
  }
  cancelAnimationFrame(raf);
  running.value = false;
  const s = +((performance.now() - startedAt) / 1000).toFixed(1);
  elapsed.value = s;
  log.value.push(s.toFixed(1));
  progress.recordBreath(s);
}
onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<template>
  <div class="card">
    <div class="row" style="justify-content: space-between">
      <span
        >Выдох: <b>{{ elapsed.toFixed(1) }}</b> с</span
      >
      <span class="small mute">
        Рекорд: <b>{{ progress.breathBestSec ? progress.breathBestSec.toFixed(1) : '—' }}</b> с
      </span>
    </div>
    <button type="button" class="wide" @click="toggle">
      {{ running ? 'Закончил' : 'Начал выдох' }}
    </button>
    <p v-if="log.length" class="small mute" style="margin: 8px 0 0">
      Попытки: {{ log.join(' · ') }} с
    </p>
  </div>
</template>

<style scoped>
.wide {
  width: 100%;
  margin-top: 10px;
}
</style>
