const { chromium } = require('playwright'); // Use standard playwright package if patchright is not working

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to doctor portal...');
  await page.goto('http://localhost:3000/doctors/dashboard');

  // Verify elements are present (e.g. "Nueva Cita" button)
  await page.waitForSelector('text=Nueva Cita', { timeout: 10000 });
  console.log('Test Passed: Dashboard loaded and Nueva Cita button found');

  // Navigate to community
  await page.click('button:has-text("Comunidad")');
  await page.waitForSelector('text=Preguntas de la comunidad', { timeout: 10000 });
  console.log('Test Passed: Community SPA navigation successful');

  await browser.close();
})();
