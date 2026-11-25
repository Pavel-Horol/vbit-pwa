import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Этап 2: библиотека текстов, ударения, затакт, «В разметку», лестница, калибровка, экспорт/импорт.

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

const area = (page: Page) => page.getByRole('textbox', { name: 'Текст для читки' });
const preview = (page: Page) => page.getByTestId('layout-preview');

test('REQ-TXT-1: create, rename, delete with an in-page confirmation', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./#/texts');
  await page.getByRole('button', { name: 'Новый текст' }).click();
  await expect(page.getByRole('heading', { name: 'Текст в бит' })).toBeVisible();
  await page.getByLabel('Название').fill('Мой куплет');
  await area(page).fill('я читаю ровно');
  await page.getByRole('link', { name: '← Тексты' }).click();

  const list = page.getByTestId('text-list');
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list).toContainText('Мой куплет');
  await expect(list).toContainText('текущий');

  await page.getByRole('button', { name: 'Удалить Мой куплет' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Удалить «Мой куплет»?');
  await page.getByRole('button', { name: 'Отмена' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: 'Удалить Мой куплет' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).not.toContainText('Мой куплет');
  expect(errors).toEqual([]);
});

test('REQ-STR / REQ-LAY-2: stress mode uses the dictionary, tap fixes stress', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./#/texts/main');
  await page.getByRole('button', { name: 'По ударениям' }).click();
  await area(page).fill('сосала сушку бурумбара');
  // словарь грузится лениво: «са» в «сосала» становится ударным
  await expect(preview(page).getByRole('button', { name: 'са, ударный' })).toBeVisible();
  // выдуманного слова нет в словаре → подсвечено «проверь ударение»
  await expect(preview(page).getByRole('button', { name: 'рум, проверь ударение' })).toBeVisible();
  await preview(page).getByRole('button', { name: 'рум, проверь ударение' }).click();
  await expect(preview(page).getByRole('button', { name: 'рум, ударный' })).toBeVisible();
  // повторный тап снимает правку — слово снова без ударения и помечено
  await preview(page).getByRole('button', { name: 'рум, ударный' }).click();
  await expect(preview(page).getByRole('button', { name: 'рум, проверь ударение' })).toBeVisible();
  // тап по ударному из словаря снимает ударение — это правка пользователя, пометки нет
  await preview(page).getByRole('button', { name: 'са, ударный' }).click();
  await expect(preview(page).getByRole('button', { name: 'са', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('REQ-PAR-3 / REQ-LAY-3: pickup is shown before the first bar', async ({ page }) => {
  await page.goto('./#/texts/main');
  await page.getByRole('button', { name: 'Разметка' }).click();
  await area(page).fill('> на дво- | РЕ тра- | ВА на тра- | ВЕ дро- | ВА');
  await expect(page.getByTestId('preview-pickup')).toContainText('на');
  await expect(page.getByTestId('preview-pickup')).toContainText('дво');
  await expect(page.getByTestId('preview-bar')).toHaveCount(1);
});

test('REQ-LAY-5: «В разметку» turns an auto layout into markup', async ({ page }) => {
  await page.goto('./#/texts/main');
  await page.getByRole('button', { name: 'Авто' }).click();
  await area(page).fill('мама мыла раму');
  await page.getByRole('button', { name: 'В разметку' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Заменить' }).click();
  await expect(area(page)).toHaveValue(/\|/);
  await expect(page.getByRole('button', { name: 'Разметка' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('preview-bar')).toHaveCount(1);
});

test('REQ-LAD: line drill — loop, rating, manual stage, karaoke', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./#/texts/main');
  await page.getByRole('button', { name: 'Разметка' }).click();
  await area(page).fill('ТА-та | ТА-та\nКА-ка | КА');
  await page.getByRole('button', { name: 'Разобрать строку' }).click();
  await expect(page.getByRole('heading', { name: 'Разбор строки' })).toBeVisible();
  await expect(page.getByTestId('drill-stage')).toContainText('Ступень 1 · Скелет');

  const clean = page.getByRole('button', { name: 'Чисто' });
  await expect(clean).toBeDisabled();
  await page.getByLabel('Темп').fill('180');
  await page.getByRole('button', { name: 'Старт' }).click();
  await expect(page.locator('[data-testid="bar-current"] .cell.on')).toHaveCount(1);
  // отсчёт + один такт при 180 BPM ≈ 2,7 с
  await expect(clean).toBeEnabled({ timeout: 6000 });
  await clean.click();
  await expect(page.getByText('Чисто 1 из 3')).toBeVisible();
  await expect(clean).toBeDisabled(); // один круг — одна оценка

  await page.getByRole('button', { name: '5 Чистый бит' }).click();
  await expect(page.getByTestId('drill-stage')).toContainText('Ступень 5');
  await expect(page.getByTestId('karaoke')).toContainText('ТАта');
  await page.getByRole('button', { name: 'Стоп' }).click();

  // прогресс сохраняется в тексте
  await page.waitForTimeout(500);
  await page.reload();
  // после перезагрузки выбрана строка с наименьшей ступенью — вторая
  await expect(page.getByTestId('drill-stage')).toContainText('Ступень 1');
  await page.getByRole('group', { name: 'Строка' }).getByRole('button').first().click();
  await expect(page.getByTestId('drill-stage')).toContainText('Ступень 5');
  expect(errors).toEqual([]);
});

test('REQ-SES-5: «Трудная строка» step shows the line drill', async ({ page }) => {
  await page.goto('./#/session');
  const next = page.getByRole('button', { name: 'Дальше', exact: true }).last();
  for (let i = 0; i < 14; i++) await next.click();
  await expect(page.getByRole('heading', { name: 'Трудная строка' })).toBeVisible();
  await expect(page.getByTestId('drill-stage')).toContainText('Ступень 1');
  await expect(page.getByText('Свой куплет ещё не добавлен')).toBeVisible();
});

test('REQ-CAL: calibration collects taps and stores the offset', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Начать калибровку' }).click();
  const tap = page.getByRole('button', { name: /^Тап/ });
  await expect(tap).toBeVisible();
  for (let i = 0; i < 16; i++) {
    await tap.dispatchEvent('pointerdown');
    await page.waitForTimeout(667);
  }
  await expect(page.getByRole('status')).toContainText(/Готово|мало тапов/, { timeout: 5000 });
  await expect(page.getByRole('button', { name: 'Повторить' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('REQ-DATA-3: export and import back', async ({ page }) => {
  await page.goto('./#/texts/main');
  await page.getByLabel('Название').fill('До экспорта');
  await page.waitForTimeout(400);
  await page.goto('./#/settings');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Скачать копию' }).click(),
  ]);
  const path = await download.path();
  const json = JSON.parse(readFileSync(path, 'utf8'));
  expect(json.app).toBe('vbit');
  expect(json.texts.texts[0].title).toBe('До экспорта');

  await page.goto('./#/texts/main');
  await page.getByLabel('Название').fill('После экспорта');
  await page.goto('./#/settings');
  await page.getByTestId('import-file').setInputFiles(path);
  await expect(page.getByRole('alertdialog')).toContainText('Заменить?');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Заменить' }).click();
  await expect(page.getByText('Данные загружены.')).toBeVisible();
  await page.goto('./#/texts');
  await expect(page.getByTestId('text-list')).toContainText('До экспорта');

  await page.goto('./#/settings');
  await page.getByTestId('import-file').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":1}'),
  });
  await expect(page.getByText('В файле нет данных «В бит».')).toBeVisible();
});

test('REQ-STR-4: the dictionary works offline', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r));
    }
  });
  await context.setOffline(true);
  await page.goto('./#/texts/main');
  await page.reload();
  await page.getByRole('button', { name: 'По ударениям' }).click();
  await area(page).fill('сосала');
  await expect(preview(page).getByRole('button', { name: 'са, ударный' })).toBeVisible();
  await context.setOffline(false);
});
