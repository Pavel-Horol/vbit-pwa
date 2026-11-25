import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Этап 3: слой платформы (PWA ↔ APK). Плагины Capacitor замоканы.
const native = { value: false };
const keepAwakePlugin = { keepAwake: vi.fn(async () => {}), allowSleep: vi.fn(async () => {}) };
const appListeners = new Map<string, (arg?: unknown) => void>();
const removeListener = vi.fn(async () => {});
const writeFile = vi.fn(async (_o: { path: string; data: string }) => ({
  uri: 'file:///cache/x.json',
}));
const share = vi.fn(async (_o: { files: string[] }) => ({}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native.value },
}));
vi.mock('@capacitor-community/keep-awake', () => ({ KeepAwake: keepAwakePlugin }));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (name: string, cb: (arg?: unknown) => void) => {
      appListeners.set(name, cb);
      return { remove: removeListener };
    }),
    minimizeApp: vi.fn(async () => {}),
  },
}));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile },
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
}));
vi.mock('@capacitor/share', () => ({ Share: { share } }));

const { backAction, onAppHidden } = await import('@/platform/lifecycle');
const { allowSleep, keepAwake } = await import('@/platform/wakeLock');
const { isShareCancel, saveBinaryFile, saveTextFile, toBase64 } =
  await import('@/platform/saveFile');

class FakeDocument extends EventTarget {
  visibilityState: 'visible' | 'hidden' = 'visible';
  hide() {
    this.visibilityState = 'hidden';
    this.dispatchEvent(new Event('visibilitychange'));
  }
}
let doc: FakeDocument;

beforeEach(() => {
  native.value = false;
  appListeners.clear();
  vi.clearAllMocks();
  doc = new FakeDocument();
  vi.stubGlobal('document', doc);
});
afterEach(() => vi.unstubAllGlobals());

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('backAction: system back button in the APK', () => {
  it('minimizes on the home screen, goes back elsewhere', () => {
    expect(backAction('home', true)).toBe('minimize');
    expect(backAction('home', false)).toBe('minimize');
    expect(backAction('settings', true)).toBe('back');
    expect(backAction('drill', false)).toBe('home');
  });
});

describe('REQ-AUD-8: onAppHidden', () => {
  it('fires on visibilitychange → hidden in the browser', () => {
    const cb = vi.fn();
    const off = onAppHidden(cb);
    doc.dispatchEvent(new Event('visibilitychange')); // всё ещё visible
    expect(cb).not.toHaveBeenCalled();
    doc.hide();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    doc.hide();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(appListeners.size).toBe(0);
  });

  it('also listens to the Capacitor pause event in the APK', async () => {
    native.value = true;
    const cb = vi.fn();
    const off = onAppHidden(cb);
    await flush();
    appListeners.get('pause')!();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    expect(removeListener).toHaveBeenCalledTimes(1);
  });

  it('removes the native listener even if unsubscribed before it registered', async () => {
    native.value = true;
    const off = onAppHidden(() => {});
    off();
    await flush();
    expect(removeListener).toHaveBeenCalledTimes(1);
  });
});

describe('REQ-AUD-7: keep the screen awake', () => {
  it('uses the keep-awake plugin in the APK', async () => {
    native.value = true;
    await keepAwake();
    await allowSleep();
    expect(keepAwakePlugin.keepAwake).toHaveBeenCalledTimes(1);
    expect(keepAwakePlugin.allowSleep).toHaveBeenCalledTimes(1);
  });

  it('uses the Screen Wake Lock API in the browser', async () => {
    const sentinel = { released: false, release: vi.fn(async () => {}) };
    const request = vi.fn(async () => sentinel);
    vi.stubGlobal('navigator', { wakeLock: { request } });
    await keepAwake();
    expect(request).toHaveBeenCalledWith('screen');
    await allowSleep();
    expect(sentinel.release).toHaveBeenCalledTimes(1);
    expect(keepAwakePlugin.keepAwake).not.toHaveBeenCalled();
  });

  it('releases a lock that arrives after playback already stopped', async () => {
    const sentinel = { released: false, release: vi.fn(async () => {}) };
    let resolve!: (s: typeof sentinel) => void;
    const request = vi.fn(() => new Promise<typeof sentinel>((r) => (resolve = r)));
    vi.stubGlobal('navigator', { wakeLock: { request } });
    const pending = keepAwake();
    await allowSleep();
    resolve(sentinel);
    await pending;
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  it('does nothing without the Wake Lock API', async () => {
    vi.stubGlobal('navigator', {});
    await expect(keepAwake()).resolves.toBeUndefined();
    await expect(allowSleep()).resolves.toBeUndefined();
  });
});

describe('REQ-DATA-3: saveTextFile in the APK', () => {
  it('writes to the cache and opens the share sheet', async () => {
    native.value = true;
    await expect(saveTextFile('v-bit.json', '{}', 'application/json')).resolves.toBe('saved');
    expect(writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'v-bit.json', data: '{}', directory: 'CACHE' }),
    );
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ files: ['file:///cache/x.json'] }),
    );
  });

  it('treats a closed share sheet as cancelled, other errors as errors', async () => {
    native.value = true;
    share.mockRejectedValueOnce(new Error('Share canceled'));
    await expect(saveTextFile('a.json', '{}', 'application/json')).resolves.toBe('cancelled');
    share.mockRejectedValueOnce(new Error('No app to handle'));
    await expect(saveTextFile('a.json', '{}', 'application/json')).rejects.toThrow();
  });

  it('REQ-MIC-6: binary files go to the cache as base64', async () => {
    native.value = true;
    await saveBinaryFile('a.wav', new Uint8Array([82, 73, 70, 70, 0, 255]), 'audio/wav');
    const arg = writeFile.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(arg).toMatchObject({ path: 'a.wav', data: 'UklGRgD/', directory: 'CACHE' });
    expect(arg.encoding).toBeUndefined();
    expect(toBase64(new Uint8Array(0x9000).fill(65))).toBe(btoa('A'.repeat(0x9000)));
  });

  it('recognises the cancel message', () => {
    expect(isShareCancel(new Error('Share canceled'))).toBe(true);
    expect(isShareCancel('User cancelled')).toBe(true);
    expect(isShareCancel(new Error('Permission denied'))).toBe(false);
  });
});
