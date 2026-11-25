import { KeepAwake } from '@capacitor-community/keep-awake';
import { isNative } from './native';

// REQ-AUD-7: экран не гаснет во время проигрывания.
// PWA — Screen Wake Lock API; APK — плагин keep-awake (в Android WebView Wake Lock API нет).

let wanted = false;
let sentinel: WakeLockSentinel | null = null;

export async function keepAwake(): Promise<void> {
  wanted = true;
  if (isNative()) {
    await KeepAwake.keepAwake().catch(() => {});
    return;
  }
  if (sentinel && !sentinel.released) return;
  try {
    const s = (await navigator.wakeLock?.request('screen')) ?? null;
    // stop() мог прийти, пока запрос висел
    if (!wanted) void s?.release().catch(() => {});
    else sentinel = s;
  } catch {
    sentinel = null;
  }
}

export async function allowSleep(): Promise<void> {
  wanted = false;
  if (isNative()) {
    await KeepAwake.allowSleep().catch(() => {});
    return;
  }
  const s = sentinel;
  sentinel = null;
  await s?.release().catch(() => {});
}
