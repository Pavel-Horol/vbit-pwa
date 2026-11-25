import { globalIgnores } from 'eslint/config';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import pluginVue from 'eslint-plugin-vue';
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting';

export default defineConfigWithVueTs(
  { name: 'app/files-to-lint', files: ['**/*.{ts,mts,vue}'] },
  globalIgnores([
    '**/dist/**',
    '**/dev-dist/**',
    '**/coverage/**',
    'prototype/**',
    'playwright-report/**',
    'test-results/**',
  ]),
  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  {
    name: 'app/no-dialogs',
    rules: {
      // Имена компонентов заданы SPEC (REQ-TECH-2).
      'vue/multi-word-component-names': ['error', { ignores: ['Pad'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-alert': 'error',
      'no-restricted-globals': ['error', 'alert', 'confirm', 'prompt'],
    },
  },
  {
    name: 'app/core-is-pure',
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        'alert',
        'confirm',
        'prompt',
        'window',
        'document',
        'navigator',
        'localStorage',
        'AudioContext',
        'requestAnimationFrame',
        'setTimeout',
        'setInterval',
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'vue',
            'pinia',
            'vue-router',
            '@/audio/*',
            '@/stores/*',
            '@/views/*',
            '@/components/*',
          ],
        },
      ],
    },
  },
  skipFormatting,
);
