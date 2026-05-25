import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'apps/web/src'),
      '@autamedica/telemedicine': resolve(__dirname, 'packages/telemedicine/src'),
    },
  },
  test: {
    include: [
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
      'apps/web/src/**/*.test.ts',
      'apps/web/src/**/*.test.tsx',
      'apps/reminder-worker/src/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/e2e/**',
      '**/tests/integration/**',
      '**/*.spec.ts',
      '**/*.spec.js',
      '.claude/**',
      '**/coverage/**',
      '**/integration.test.ts',
    ],
  },
})
