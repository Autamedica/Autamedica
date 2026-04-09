import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 }, // Mobile view like the screenshot
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();

  console.log('Navigating to login...');
  await page.goto('http://localhost:4321/auth/login?portal=doctors');

  console.log('Filling credentials...');
  await page.fill('input[type="email"]', 'doctor@dev.local');
  await page.fill('input[type="password"]', 'password123');
  
  console.log('Submitting form...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('button[type="submit"]')
  ]);

  console.log('Current URL after login:', page.url());

  // Check BottomNav links
  const rankingLink = await page.getAttribute('a:has-text("Ranking")', 'href');
  const telemedicinaLink = await page.getAttribute('a:has-text("Telemedicina")', 'href');

  console.log('Ranking link:', rankingLink);
  console.log('Telemedicina link:', telemedicinaLink);

  // Click Ranking and check highlight
  console.log('Clicking Ranking...');
  await page.click('a:has-text("Ranking")');
  await page.waitForTimeout(1000);
  console.log('URL after clicking Ranking:', page.url());
  
  const isRankingActive = await page.evaluate(() => {
    const link = Array.from(document.querySelectorAll('nav a')).find(a => a.textContent.includes('Ranking'));
    return link?.querySelector('svg')?.classList.contains('text-blue-600');
  });
  console.log('Is Ranking highlighted?', isRankingActive);

  // Click Telemedicina and check highlight
  console.log('Clicking Telemedicina...');
  await page.click('a:has-text("Telemedicina")');
  await page.waitForTimeout(1000);
  console.log('URL after clicking Telemedicina:', page.url());

  const isTelemedicineActive = await page.evaluate(() => {
    const link = Array.from(document.querySelectorAll('nav a')).find(a => a.textContent.includes('Telemedicina'));
    // The center button has different logic for highlight (blue-600 vs cyan-500)
    return link?.querySelector('div')?.classList.contains('bg-gradient-to-tr') && 
           link?.querySelector('div')?.classList.contains('from-blue-600');
  });
  console.log('Is Telemedicina highlighted?', isTelemedicineActive);

  await browser.close();
})();
