import { MicError } from '@/audio/mic/capture';

/** Текст ошибки микрофона для UI. */
export function micErrorText(e: unknown): string {
  const code = e instanceof MicError ? e.code : 'failed';
  switch (code) {
    case 'denied':
      return 'Нет доступа к микрофону. Разреши его в настройках браузера или телефона.';
    case 'unsupported':
      return 'Здесь микрофон недоступен — открой приложение в Chrome или установи его.';
    case 'no_device':
      return 'Микрофон не найден.';
    default:
      return 'Не получилось включить микрофон. Попробуй ещё раз.';
  }
}
