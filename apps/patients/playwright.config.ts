import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Cargar variables desde .env.local para que el runner tenga SUPABASE_* disponibles
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config();

export default defineConfig({
  testDir: './e2e',
  reporter: process.env.CI ? 'github' : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  
  // Enterprise Quality Assurance Requirements 
  // Run tests in files in parallel
  fullyParallel: true,
  // Fail the build on CI if you accidentally left test.only in the source code.
  forbidOnly: !!process.env.CI,
  // Retry on CI only
  retries: process.env.CI ? 2 : 1,
  // Opt out of parallel tests on CI.
  workers: process.env.CI ? 1 : undefined,
  
  // Configuración base para todos los proyectos
  use: {
    baseURL: 'http://localhost:3002',       // Patients portal runs on 3002 by default
    trace: 'on-first-retry',                // Collect trace when retrying the failed test.
    video: 'retain-on-failure',             // Record video ONLY when a test fails.
    screenshot: 'only-on-failure',          // Take screenshot ONLY when a test fails.
    headless: true,                         // Default to headless locally and CI.
  },
  
  // Enterprise Browser & Mobile Matrix
  projects: [
    {
      name: 'API',
      testMatch: /api-.*\.spec\.ts$/,
      // No browser context needed for API, fast execution
    },
    {
      name: 'Chromium (Desktop)',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /ui-.*\.spec\.ts$/,
    },
    {
      name: 'Firefox (Desktop)',
      use: { ...devices['Desktop Firefox'] },
      testMatch: /ui-.*\.spec\.ts$/,
    },
    {
      name: 'WebKit (Desktop Safari)',
      use: { ...devices['Desktop Safari'] },
      testMatch: /ui-.*\.spec\.ts$/,
    },
    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
      testMatch: /ui-.*\.spec\.ts$/,
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
      testMatch: /ui-.*\.spec\.ts$/,
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: [
    {
      command: 'pnpm dev',  // Starts the Patients app
      url: 'http://localhost:3002',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Also ensure the public web app is reachable if flows cross apps
      command: 'pnpm -w --silent --filter @autamedica/web dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
