import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      // REQ-MIC-6: проверка на записях из validation/ — отдельно, `npm run validate:mic`
      include: process.env.VALIDATE_MIC
        ? ['tests/validation/**/*.test.ts']
        : ['tests/unit/**/*.test.ts'],
      root: fileURLToPath(new URL('./', import.meta.url)),
    },
  }),
);
