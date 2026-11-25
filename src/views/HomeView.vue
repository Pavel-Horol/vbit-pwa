<template>
  <section class="hero" aria-labelledby="home-title">
    <div>
      <p class="mute small" style="margin: 0 0 8px"><span class="lamp"></span>тренажёр читки</p>
      <h1 id="home-title">В бит</h1>
      <p class="mute">
        15–20 минут в день: разминка, дыхание, дикция и ритм. Метроном подсвечивает, какой слог
        говорить в каждый момент.
      </p>
    </div>
    <div class="card">
      <h3>Тренировка</h3>
      <p class="small mute">Выбор недели и статистика появятся на этапе 1.</p>
      <RouterLink class="btn pri wide" to="/session">Начать тренировку · ~18 мин</RouterLink>
    </div>
    <div class="row">
      <RouterLink class="btn grow" to="/progress">Прогресс</RouterLink>
      <RouterLink class="btn grow" to="/settings">Настройки</RouterLink>
    </div>
  </section>
</template>

<style scoped>
.hero {
  display: grid;
  gap: 18px;
}
.wide {
  width: 100%;
}
.grow {
  flex: 1;
}
</style>
