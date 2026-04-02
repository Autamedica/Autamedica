import { chromium } from 'patchright';

async function testPatientsPanel() {
  const browser = await chromium.launchPersistentContext('/home/edu/.patchright-profile-doc', {
    headless: false,
    channel: 'chrome'
  });

  const page = await browser.newPage();
  
  // Listen for console logs
  page.on('console', msg => {
    if (msg.text().includes('[PatientsPanel]')) {
      console.log('BROWSER LOG:', msg.text());
    }
  });

  console.log('Navigating to http://localhost:3001/doctors/patients...');
  await page.goto('http://localhost:3001/doctors/patients');
  
  // Wait for the panel to load
  await page.waitForSelector('h1:has-text("Mis Pacientes")', { timeout: 15000 });
  console.log('Page loaded, inspecting patients panel...');
  
  await browser.close();
}

testPatientsPanel().catch(console.error);
