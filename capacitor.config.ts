import type { CapacitorConfig } from '@capacitor/cli';

// Этап 3: APK. Веб-часть собирается командой `npm run build:android` (без service worker).
const config: CapacitorConfig = {
  appId: 'io.github.pavelhorol.vbit',
  appName: 'В бит',
  webDir: 'dist',
  backgroundColor: '#17131c',
  plugins: {
    // Тёмные системные панели со светлыми значками; отступы — через env(safe-area-inset-*).
    SystemBars: { style: 'DARK', insetsHandling: 'css' },
  },
  android: {
    // Отладка WebView через chrome://inspect только в debug-сборке.
    webContentsDebuggingEnabled: true,
  },
};

export default config;
