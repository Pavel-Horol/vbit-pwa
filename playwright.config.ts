import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * REQ-MIC: поддельный микрофон Chromium играет этот файл по кругу — «слоги» (гармонический тон
 * 100 мс) каждые 333 мс. Голоса в тестах нет.
 */
function fakeMicWav(): string {
  const sr = 48000;
  const n = sr * 4;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  const period = Math.round(sr / 3);
  for (let i = 0; i < n; i++) {
    const t = (i % period) / sr;
    const env = t < 0.01 ? t / 0.01 : t < 0.1 ? 1 : 0;
    let x = 0;
    for (let k = 1; k * 150 < 3500; k++) x += Math.sin(2 * Math.PI * k * 150 * t) / k;
    buf.writeInt16LE(Math.round(env * x * 0.15 * 0x7fff), 44 + i * 2);
  }
  const dir = join(tmpdir(), 'vbit-e2e');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'fake-mic.wav');
  writeFileSync(path, buf);
  return path;
}

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 3,
        launchOptions: {
          args: [
            '--autoplay-policy=no-user-gesture-required',
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${fakeMicWav()}`,
          ],
        },
      },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
