import { expect, test, type Page } from '@playwright/test';

// §18: обязательные e2e этапа 1 + миграция и сохранение данных.

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

test('metronome: after start a cell becomes active within 2 s', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./#/metronome');
  await page.getByRole('button', { name: 'Старт' }).click();
  await expect(page.locator('[data-testid="bar-current"] .cell.on')).toHaveCount(1, {
    timeout: 2000,
  });
  await page.getByRole('button', { name: 'Стоп' }).click();
  await expect(page.locator('.cell.on')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('session: «Дальше» × 17 → final screen with streak ≥ 1', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./#/session');
  const next = page.getByRole('button', { name: 'Дальше', exact: true }).last();
  for (let i = 0; i < 17; i++) {
    await expect(page.getByTestId('step-count')).toHaveText(`${i + 1} из 17`);
    await next.click();
  }
  await expect(page.getByRole('heading', { name: 'Тренировка закончена' })).toBeVisible();
  const streak = await page.getByTestId('streak').textContent();
  expect(parseInt(streak ?? '0', 10)).toBeGreaterThanOrEqual(1);
  await page.getByRole('link', { name: 'Главная', exact: true }).click();
  await expect(page.locator('.stat').first()).toContainText('1');
  expect(errors).toEqual([]);
});

test('texts: Karl markup → preview shows 1 bar of 4 beats', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./#/texts');
  await page.getByRole('button', { name: 'Разметка' }).click();
  const area = page.getByRole('textbox', { name: 'Текст для читки' });
  await area.fill('КАРЛ у | КЛА-ры у- | КРАЛ ко- | РАЛ-лы');
  await expect(page.getByTestId('preview-bar')).toHaveCount(1);
  await expect(page.getByTestId('preview-bar').first().getByTestId('preview-beat')).toHaveCount(4);
  await expect(page.getByTestId('layout-preview')).toContainText('1 такт');
  expect(errors).toEqual([]);
});

test('texts: missing | shows an inline warning', async ({ page }) => {
  await page.goto('./#/texts');
  await page.getByRole('button', { name: 'Разметка' }).click();
  await page.getByRole('textbox', { name: 'Текст для читки' }).fill('КАРЛ у КЛА-ры');
  await expect(page.getByTestId('layout-preview')).toContainText('Строка 1: не вижу «|»');
});

test('texts: loading a preset over own text asks in the UI', async ({ page }) => {
  await page.goto('./#/texts');
  await page.getByRole('textbox', { name: 'Текст для читки' }).fill('мой текст | тут');
  await page.getByLabel('Загрузить пример').selectOption({ index: 2 });
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Оставить мой текст' }).click();
  await expect(page.getByRole('textbox', { name: 'Текст для читки' })).toHaveValue(
    'мой текст | тут',
  );
});

test('REQ-DATA-2: imports prototype localStorage on first run', async ({ page }) => {
  await page.addInitScript(() => {
    const set = (k: string, v: unknown) => localStorage.setItem('vbit_' + k, JSON.stringify(v));
    set('week', 2);
    set('text', { mode: 'auto', n: 3, nb: true, text: 'мама мыла раму', bpm: 88 });
    set('total', 5);
    set('breath', 27.5);
    set('mMode', 'auto');
    set('mSet', 'pbdg');
    set('mBpm', 101);
  });
  await page.goto('./');
  await expect(page.getByRole('button', { name: '3-я' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.stat').nth(1)).toContainText('5');
  await expect(page.locator('.stat').nth(2)).toContainText('27.5 с');
  await page.goto('./#/metronome');
  await expect(page.getByTestId('bpm')).toHaveText('101 BPM');
  await expect(page.getByRole('button', { name: 'Авто 1→2→4→3' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.goto('./#/texts');
  await expect(page.getByRole('textbox', { name: 'Текст для читки' })).toHaveValue(
    'мама мыла раму',
  );
  // ключи прототипа не удалены
  expect(await page.evaluate(() => localStorage.getItem('vbit_total'))).toBe('5');
});

test('settings survive a reload (IndexedDB)', async ({ page }) => {
  await page.goto('./#/metronome');
  await page.getByRole('button', { name: 'Быстрее' }).click();
  await page.getByRole('button', { name: 'па-ба-да-га' }).click();
  await expect(page.getByTestId('bpm')).toHaveText('81 BPM');
  await page.waitForTimeout(500); // отложенное сохранение
  await page.reload();
  await expect(page.getByTestId('bpm')).toHaveText('81 BPM');
  await expect(page.getByRole('button', { name: 'па-ба-да-га' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('every screen: no horizontal scroll with real content', async ({ page }) => {
  for (const hash of ['#/', '#/session', '#/metronome', '#/texts']) {
    await page.goto('./' + hash);
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  }
});
