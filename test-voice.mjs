import { chromium } from 'patchright';

(async () => {
  console.log("Launching patchright...");
  const browser = await chromium.launchPersistentContext('/home/edu/.patchright-profile', {
    headless: false,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream'
    ]
  });
  
  const page = await browser.newPage();
  console.log("Navigating to anamnesis...");
  await page.goto('http://localhost:3000/patients/anamnesis');
  
  // Wait for the page to load
  await page.waitForTimeout(5000);
  
  console.log("Looking for 'Hablar' button...");
  try {
    const hablarBtn = page.locator('button:has-text("Hablar")');
    if (await hablarBtn.count() > 0) {
      await hablarBtn.click();
      console.log("Clicked 'Hablar'!");
    } else {
      console.log("Could not find 'Hablar' button, maybe we are not logged in or in another state.");
    }
  } catch (e) {
    console.error(e);
  }

  console.log("Now leaving it open for 30 seconds to test voice anamnesis... Please check the UI.");
  await page.waitForTimeout(30000);
  
  console.log("Closing browser.");
  await browser.close();
})();