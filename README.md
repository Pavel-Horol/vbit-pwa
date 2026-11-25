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

## APK (Capacitor, Android)

Готовый debug-APK последнего зелёного `main`: [releases/apk-latest](https://github.com/Pavel-Horol/vbit-pwa/releases/tag/apk-latest) (файл `v-bit.apk`). Каждый push собирает APK и кладёт его артефактом `v-bit-apk` в прогон CI.

Локальная сборка (нужны JDK 21 и Android SDK в `ANDROID_HOME`):

```bash
npm run build:android   # веб-часть без service worker (NATIVE=1, BASE_PATH=/) + cap sync
npm run apk             # то же + ./gradlew assembleDebug → android/app/build/outputs/apk/debug/
```

Подпись: debug-ключ из секрета `ANDROID_DEBUG_KEYSTORE` (base64 файла keystore, пароль и alias стандартные — `android` / `androiddebugkey`). Локально путь к тому же файлу передаётся в `VBIT_DEBUG_KEYSTORE`. Без постоянного ключа новый APK не встанет поверх старого.

Код, который отличается в PWA и APK (wake lock, сворачивание, «Назад», сохранение файла), — в `src/platform/`.

Шрифты Manrope и Unbounded — SIL OFL 1.1, лежат в `public/fonts/`.
