import { Capacitor } from '@capacitor/core';

/** Этап 3: true внутри APK (Capacitor), false в браузере/PWA. */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}
