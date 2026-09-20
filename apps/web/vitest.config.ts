import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@autamedica/shared': resolve(__dirname, '../../packages/shared/src'),
      '@autamedica/telemedicine': resolve(__dirname, '../../packages/telemedicine/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
