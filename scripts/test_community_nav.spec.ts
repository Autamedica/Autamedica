const { patchright } = require('patchright');

(async () => {
  const browser = await patchright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Navigate to doctor's dashboard (assuming this is how it starts)
  await page.goto('http://localhost:3000/doctors/dashboard'); // Or the correct URL
  
  // Click on "Comunidad"
  await page.click('button:has-text("Comunidad")');
  
  // Verify that the URL or content updated
  const isCommunityVisible = await page.isVisible('h1:has-text("Preguntas de la comunidad")');
  
  if (isCommunityVisible) {
    console.log('Test Passed: Community navigation works');
  } else {
    console.error('Test Failed: Community navigation did not work');
    process.exit(1);
  }
  
  await browser.close();
})();
