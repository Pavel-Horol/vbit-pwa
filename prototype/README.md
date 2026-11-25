# В бит — PWA

Статический сайт, сборка не нужна: index.html, manifest.json, sw.js, иконки.

## Поставить на Android как приложение
1. Залей папку на любой HTTPS-хостинг (GitHub Pages / Netlify Drop / Cloudflare Pages).
2. Открой ссылку в Chrome на телефоне → ⋮ → «Установить приложение».
3. Работает офлайн (service worker кэширует всё, шрифты — после первого запуска).

## Потом APK
npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap init "В бит" com.pasha.vbit --web-dir .
npx cap add android && npx cap open android
