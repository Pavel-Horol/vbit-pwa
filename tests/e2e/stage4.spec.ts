import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Этап 4: микрофон. Chromium получает поддельный микрофон (playwright.config.ts): файл с
// «слогами» каждые 333 мс. Щелчки из динамика он не слышит — калибровка может не сойтись,
// поэтому для оценки круга задержку задаём импортом данных.

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

async function importSettings(page: Page, settings: Record<string, unknown>) {
  await page.goto('./#/settings');
  await page.getByTestId('import-file').setInputFiles({
    name: 'mic.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ app: 'vbit', schemaVersion: 1, settings })),
  });
  await page.getByRole('alertdialog').getByRole('button', { name: 'Заменить' }).click();
  await expect(page.getByText('Данные загружены.')).toBeVisible();
  await page.waitForTimeout(500); // сохранение в IndexedDB отложено на 300 мс
}

test('REQ-MIC-3: mic calibration plays 8 clicks and reports a result', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./#/settings');
  const card = page.getByTestId('mic-calibration');
  await expect(card.getByTestId('input-offset')).toHaveText('не измерена');
  await card.getByRole('button', { name: 'Измерить' }).click();
  await expect(card.getByText('Слушаю щелчки…')).toBeVisible();
  await expect(card.getByRole('status')).toContainText(/Готово|услышал|неровным/, {
    timeout: 12_000,
  });
  await expect(card.getByRole('button', { name: /Измерить/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('REQ-MIC-4: the drill rates a loop by the mic, a button overrides it', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./#/texts/main/drill');
  const toggle = page.getByRole('checkbox', { name: 'Оценивать по микрофону' });
  await expect(toggle).toBeDisabled(); // без калибровки входа
  await expect(page.getByText('Сначала измерь задержку микрофона')).toBeVisible();

  await importSettings(page, { inputOffsetMs: 80, micClickDb: -30, micScoring: true });
  await page.goto('./#/texts/main/drill');
  await page.reload(); // калибровка входа сохранилась в IndexedDB
  await expect(toggle).toBeChecked();
  await page.getByLabel('Темп').fill('180');
  await page.getByRole('button', { name: 'Старт' }).click();

  const result = page.getByTestId('mic-result');
  // отсчёт + такт при 180 BPM ≈ 2,7 с, плюс задержка микрофона и запас
  await expect(result).toBeVisible({ timeout: 10_000 });
  await expect(result.getByRole('listitem')).not.toHaveCount(0);
  await expect(page.getByText(/^По микрофону: (чисто|есть ошибки)\./)).toBeVisible();
  // поддельный микрофон «читает» каждые 333 мс — хоть один слог услышан
  await expect(result.locator('.c:not(.miss)')).not.toHaveCount(0);

  const clean = page.getByRole('button', { name: 'Чисто' });
  await expect(clean).toBeEnabled();
  await clean.click();
  await expect(page.getByText(/^Оценка исправлена\./)).toBeVisible();
  await page.getByRole('button', { name: 'Стоп' }).click();
  expect(errors).toEqual([]);
});

test('REQ-MIC-5: the record step saves a take, Progress plays it', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./#/progress');
  await expect(page.getByTestId('rec-Сегодня')).toContainText('Записи нет');

  await page.goto('./#/session');
  const next = page.getByRole('button', { name: 'Дальше', exact: true }).last();
  for (let i = 0; i < 16; i++) await next.click();
  await expect(page.getByRole('heading', { name: 'Запись на диктофон' })).toBeVisible();
  await page.getByRole('button', { name: 'Старт' }).click();
  await expect(page.getByText('Идёт запись')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Пауза' }).click();
  await expect(page.getByText('Запись на паузе')).toBeVisible();
  await next.click(); // уход с шага сохраняет запись
  await expect(page.getByRole('heading', { name: 'Тренировка закончена' })).toBeVisible();

  await page.goto('./#/progress');
  await expect(page.getByTestId('rec-Сегодня').locator('audio')).toBeVisible();
  await page.waitForTimeout(500);
  await page.reload(); // запись и список записей пережили перезагрузку
  await expect(page.getByTestId('rec-Сегодня').locator('audio')).toBeVisible();
  await expect(page.getByTestId('rec-7 дней назад')).toContainText('Записи нет');
  expect(errors).toEqual([]);
});

test('REQ-MIC-6: detector check exports a WAV with metadata', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./#/settings');
  const box = page.getByTestId('detector-check');
  await box.getByText('Проверка детектора').click();
  await box.getByRole('button', { name: 'Записать' }).click();
  await expect(box.getByText(/Запись · осталось/)).toBeVisible();
  await page.waitForTimeout(4500); // отсчёт при 75 BPM — 3,2 с, потом текст
  await box.getByRole('button', { name: 'Закончить раньше' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    box.getByRole('button', { name: 'Сохранить WAV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^vbit-check-.*\.wav$/);
  const bytes = readFileSync(await download.path());
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
  // чанк «vbit» с метаданными идёт сразу после звука
  const metaAt = 44 + bytes.readUInt32LE(40);
  expect(bytes.subarray(metaAt, metaAt + 4).toString()).toBe('vbit');
  const len = bytes.readUInt32LE(metaAt + 4);
  const meta = JSON.parse(bytes.subarray(metaAt + 8, metaAt + 8 + len).toString('utf8'));
  expect(meta.kind).toBe('mic-check');
  expect(meta.clicks.length).toBeGreaterThan(0);
  expect(meta.expected.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
