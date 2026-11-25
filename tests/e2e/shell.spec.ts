import { expect, test, type Page } from '@playwright/test';

// §18: каждый экран открывается без ошибок в консоли; нигде нет горизонтальной прокрутки.
const screens = [
  { hash: '#/', heading: 'В бит' },
  { hash: '#/session', heading: 'Зевок с открытым горлом' },
  { hash: '#/metronome', heading: 'Метроном-слоги' },
  { hash: '#/texts', heading: 'Тексты' },
  { hash: '#/texts/main', heading: 'Текст в бит' },
  { hash: '#/texts/main/drill', heading: 'Разбор строки' },
  { hash: '#/settings', heading: 'Настройки' },
  { hash: '#/progress', heading: 'Прогресс' },
];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

async function expectNoHorizontalScroll(page: Page) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(390);
}

for (const s of screens) {
  test(`screen ${s.hash} opens without errors and without horizontal scroll`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`./${s.hash}`);
    await expect(page.getByRole('heading', { level: s.hash === '#/' ? 1 : 2 })).toHaveText(
      s.heading,
    );
    await expectNoHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
}

test('bottom navigation switches screens and marks the active tab', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  const nav = page.getByRole('navigation', { name: 'Разделы' });
  for (const [label, heading] of [
    ['Тренировка', 'Зевок с открытым горлом'],
    ['Метроном', 'Метроном-слоги'],
    ['Тексты', 'Тексты'],
    ['Главная', 'В бит'],
  ] as const) {
    await nav.getByRole('link', { name: label, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(nav.getByRole('link', { name: label, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expectNoHorizontalScroll(page);
  }
  expect(errors).toEqual([]);
});

test('PWA manifest is linked and valid', async ({ page }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const res = await page.request.get(new URL(href!, page.url()).toString());
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.name).toBe('В бит');
  expect(manifest.display).toBe('standalone');
  expect(manifest.theme_color).toBe('#17131c');
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
});

test('fonts are served locally', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost')) external.push(r.url());
  });
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
  );
  expect(loaded).toEqual(expect.arrayContaining(['Manrope', 'Unbounded']));
  expect(external).toEqual([]);
});

test('works offline after first open', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r));
    }
  });
  await context.setOffline(true);
  await page.goto('./#/texts');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Тексты' })).toBeVisible();
  await context.setOffline(false);
});
