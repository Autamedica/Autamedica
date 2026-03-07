import { defineConfig } from 'patchright/test'

const isCI = Boolean(process.env.CI)
const artifactsDir = process.env.PATCHRIGHT_SIGNALING_ARTIFACTS_DIR || 'generated-docs/patchright-signaling'
const headless = process.env.PATCHRIGHT_HEADLESS === '1'
  ? true
  : process.env.PATCHRIGHT_HEADLESS === '0'
    ? false
    : isCI

export default defineConfig({
  testDir: '.',
  testMatch: 'signaling-server-e2e.spec.ts',
  fullyParallel: false,
  forbidOnly: isCI,
  workers: 1,
  retries: isCI ? 2 : 1,
  timeout: 60_000,
  outputDir: `${artifactsDir}/test-results`,
  reporter: [
    ['line'],
    ['html', { open: 'never', outputFolder: `${artifactsDir}/html-report` }],
    ['json', { outputFile: `${artifactsDir}/results.json` }],
    ['junit', { outputFile: `${artifactsDir}/junit.xml` }],
  ],
  use: {
    headless,
    permissions: ['camera', 'microphone'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
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
