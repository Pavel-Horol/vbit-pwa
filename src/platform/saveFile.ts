import { isNative } from './native';

export type SaveResult = 'saved' | 'cancelled';

/**
 * REQ-DATA-3: отдать пользователю текстовый файл.
 * PWA — обычное скачивание. APK — `<a download>` в WebView не работает, поэтому файл
 * пишется во временную папку приложения и отдаётся системному меню «Поделиться».
 */
export const saveTextFile = (name: string, text: string, mime: string) =>
  saveFile(name, text, mime);

/** REQ-MIC-6: двоичный файл (WAV для проверки детектора). */
export const saveBinaryFile = (name: string, bytes: Uint8Array, mime: string) =>
  saveFile(name, bytes, mime);

/** В APK Filesystem принимает двоичные данные только в base64. */
export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function saveFile(
  name: string,
  data: string | Uint8Array,
  mime: string,
): Promise<SaveResult> {
  if (!isNative()) {
    downloadInBrowser(name, data, mime);
    return 'saved';
  }
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const { uri } = await Filesystem.writeFile({
    path: name,
    directory: Directory.Cache,
    ...(typeof data === 'string' ? { data, encoding: Encoding.UTF8 } : { data: toBase64(data) }),
  });
  try {
    await Share.share({ title: name, files: [uri] });
    return 'saved';
  } catch (e) {
    if (isShareCancel(e)) return 'cancelled';
    throw e;
  }
}

/** Share.share отклоняет промис с «Share canceled», если меню закрыли. */
export function isShareCancel(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /cancel/i.test(msg);
}

function downloadInBrowser(name: string, data: string | Uint8Array, mime: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
