import { App } from '@capacitor/app';
import type { Router } from 'vue-router';
import { isNative } from './native';

/**
 * REQ-AUD-8: приложение ушло в фон (вкладка скрыта, APK свёрнут, экран погас).
 * В APK дополнительно слушаем `pause` от Capacitor — на случай, если WebView
 * не пришлёт visibilitychange. Колбэк может прийти дважды: он должен быть идемпотентным.
 */
export function onAppHidden(cb: () => void): () => void {
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') cb();
  };
  document.addEventListener('visibilitychange', onVisibility);
  let removed = false;
  let removeNative: (() => void) | undefined;
  if (isNative()) {
    void App.addListener('pause', cb).then((h) => {
      if (removed) void h.remove();
      else removeNative = () => void h.remove();
    });
  }
  return () => {
    removed = true;
    document.removeEventListener('visibilitychange', onVisibility);
    removeNative?.();
  };
}

/** Что делать по системной кнопке «Назад» в APK. */
export function backAction(routeName: unknown, canGoBack: boolean): 'minimize' | 'back' | 'home' {
  if (routeName === 'home') return 'minimize';
  return canGoBack ? 'back' : 'home';
}

/** APK: «Назад» идёт по истории экранов, на главной сворачивает приложение. */
export function initNativeShell(router: Router): void {
  if (!isNative()) return;
  void App.addListener('backButton', ({ canGoBack }) => {
    const action = backAction(router.currentRoute.value.name, canGoBack);
    if (action === 'minimize') void App.minimizeApp();
    else if (action === 'back') router.back();
    else void router.replace('/');
  });
}
