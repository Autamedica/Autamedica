import AxeBuilder from '@axe-core/playwright'; // Enterprise A11y verification tool
import { expect, test } from '@playwright/test';

// A basic enterprise E2E quality check testing visual stability and WCAG accessibility
test.describe('Enterprise Quality Assurance - Portal Patients Landing', () => {
  // Test 1: Content Security Policy & Basic Navigation (Resilience)
  test('should navigate to the portal and ensure no console errors (CSP resilient)', async ({ page }) => {
    const consoleLogs: string[] = [];
    const consoleErrors: string[] = [];
    
    // Capture unhandled errors on the page
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      } else {
        consoleLogs.push(msg.text());
      }
    });

    // Navigate to local patient app (defaults to localhost:3002 per config)
    await page.goto('/');

    // Validate the page title is correct to confirm it's not a generic NextJS/Astro 404
    await expect(page).toHaveTitle(/AutaMedica/i);

    // Verify there are no critical setup console errors avoiding blank whitescreens
    expect(consoleErrors.length).toBe(0);
  });

  // Test 2: Accessibility Guarantee (WCAG 2.1 AA)
  test('should not have any automatically detectable accessibility violations', async ({ page }) => {
    // Navigate setup
    await page.goto('/');
    
    // Perform accessibility scan using axe-core
    const accessibilityScanResults = await new AxeBuilder({ page })
      // We can disable specific rules if there are known third-party violations that we cannot fix
      // .disableRules(['color-contrast']) 
      .analyze();

    // The violations array should be empty; if not, throw an error with the detailed violation message
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  // Test 3: Visual Regression Testing (Pixel Perfect Tracking)
  test('visual regression testing against the baseline layout', async ({ page }) => {
    await page.goto('/');

    // Wait for the main elements to load, such as fonts, buttons, or hero elements, so snapshots aren't flaky
    await page.waitForLoadState('networkidle');

    // Make sure there are no CSS transitions or loading spinners before capturing the visual state
    // Take a screenshot and compare against snapshots/(browser-name)-...
    await expect(page).toHaveScreenshot('landing-page-baseline.png', {
      maxDiffPixels: 100, // Small tolerance for font rendering differences between CI and local
      animations: 'disabled', // Automatically pause CSS animations/videos to make snapshots deterministic
    });
  });
});
