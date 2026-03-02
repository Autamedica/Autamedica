import { defineConfig } from 'patchright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'signaling-server-e2e.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['line']],
  use: {
    permissions: ['camera', 'microphone'],
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
})
