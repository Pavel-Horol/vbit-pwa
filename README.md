# В бит

Тренажёр читки рэпа в бит. PWA (Vite + Vue 3 + TS), позже APK через Capacitor. Требования — [SPEC.md](SPEC.md), эталон поведения — [prototype/](prototype/) (`npx serve prototype`).

```bash
npm ci
npm run dev          # локально
npm run lint         # eslint + prettier --check
npm test             # vitest (tests/unit)
npm run build        # vue-tsc + vite build; BASE_PATH=/repo/ для GitHub Pages
npx playwright test  # e2e (tests/e2e), 390×844
```

Деплой: push в `main` → GitHub Actions (lint, test, build, e2e) → GitHub Pages.

Шрифты Manrope и Unbounded — SIL OFL 1.1, лежат в `public/fonts/`.
