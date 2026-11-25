import { isNative } from './native';

export type SaveResult = 'saved' | 'cancelled';

/**
 * REQ-DATA-3: отдать пользователю текстовый файл.
 * PWA — обычное скачивание. APK — `<a download>` в WebView не работает, поэтому файл
 * пишется во временную папку приложения и отдаётся системному меню «Поделиться».
 */
export async function saveTextFile(name: string, text: string, mime: string): Promise<SaveResult> {
  if (!isNative()) {
    downloadInBrowser(name, text, mime);
    return 'saved';
  }
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const { uri } = await Filesystem.writeFile({
    path: name,
    data: text,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
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

function downloadInBrowser(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
