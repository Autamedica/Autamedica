import { chromium } from 'playwright';
import fs from 'fs';

async function scrapeTab(page, tabUrl, isShorts) {
  console.log(`🌐 Navigating to ${tabUrl}...`);
  await page.goto(tabUrl, { waitUntil: 'networkidle' });

  // Handle Cookie Consent Dialog if present
  try {
    const cookieButtons = [
      'button:has-text("Aceptar todo")',
      'button:has-text("Accept all")',
      'button[aria-label="Aceptar todo"]',
      'button[aria-label="Accept all"]'
    ];
    for (const selector of cookieButtons) {
      const btn = page.locator(selector);
      if (await btn.count() > 0) {
        await btn.first().click();
        await page.waitForTimeout(2000);
        break;
      }
    }
  } catch (e) {
    // Ignore cookie consent popup if not present
  }

  // Wait for content
  try {
    const selector = isShorts ? 'ytd-rich-item-renderer, a[href*="/shorts/"]' : 'a.ytLockupMetadataViewModelTitle, a#video-title-link, a#video-title';
    await page.waitForSelector(selector, { timeout: 8000 });
  } catch (e) {
    console.log(`⚠️ Timeout waiting for elements on ${tabUrl}`);
    return [];
  }

  // Scroll to load all content
  let previousCount = 0;
  let scrollCount = 0;
  
  const countItems = async () => {
    return await page.evaluate((isShorts) => {
      if (isShorts) {
        return document.querySelectorAll('a[href*="/shorts/"]').length;
      } else {
        return document.querySelectorAll('a.ytLockupMetadataViewModelTitle, a#video-title-link, a#video-title').length;
      }
    }, isShorts);
  };

  while (scrollCount < 10) { // Limit to 10 scrolls for performance
    const currentCount = await countItems();
    if (currentCount > 0 && currentCount === previousCount) {
      break;
    }
    previousCount = currentCount;
    
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight || document.body.scrollHeight);
    });
    await page.waitForTimeout(1500);
    scrollCount++;
  }

  // Extract details
  return await page.evaluate((isShorts) => {
    const selector = isShorts ? 'a[href*="/shorts/"]' : 'a.ytLockupMetadataViewModelTitle, a#video-title-link, a#video-title';
    const links = document.querySelectorAll(selector);
    const results = [];
    const seenIds = new Set();
    
    links.forEach(link => {
      const title = link.innerText.trim();
      const url = link.href || '';
      if (!title || !url) return;
      
      // Extract ID
      let videoId = '';
      if (isShorts) {
        const parts = url.split('/shorts/');
        if (parts.length > 1) videoId = parts[1].split('?')[0];
      } else {
        if (url.includes('v=')) videoId = url.split('v=')[1].split('&')[0];
      }
      
      if (!videoId || seenIds.has(videoId)) return;
      seenIds.add(videoId);
      
      // Find container for views and date
      let container = link.closest('ytd-rich-grid-media, ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-video-renderer');
      if (!container) container = link.parentElement;
      
      let views = '';
      let date = '';
      
      if (container) {
        const spans = container.querySelectorAll('.ytContentMetadataViewModelMetadataText, #metadata-line span');
        if (spans.length >= 2) {
          views = spans[0].innerText.trim();
          date = spans[1].innerText.trim();
        } else if (spans.length === 1) {
          const text = spans[0].innerText.trim();
          if (text.includes('vistas') || text.includes('views') || text.includes('visualizaciones')) {
            views = text;
          } else {
            date = text;
          }
        }
      }
      
      results.push({
        title,
        url,
        views,
        date,
        type: isShorts ? 'Short' : 'Video'
      });
    });
    return results;
  }, isShorts);
}

async function main() {
  console.log("🚀 Launching headless Chromium...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'es-ES' });
  const page = await context.newPage();

  const handle = '@AUTAMEDICA';
  const longVideos = await scrapeTab(page, `https://www.youtube.com/${handle}/videos`, false);
  const shorts = await scrapeTab(page, `https://www.youtube.com/${handle}/shorts`, true);

  console.log(`\n📊 Scrape complete:`);
  console.log(`  - Long Videos found: ${longVideos.length}`);
  console.log(`  - Shorts found: ${shorts.length}`);

  const allMedia = [...longVideos, ...shorts];

  // Group by publication date relative
  const dateGroups = {};
  allMedia.forEach(media => {
    const key = media.date || 'Desconocido';
    dateGroups[key] = dateGroups[key] || [];
    dateGroups[key].push(media);
  });

  console.log("\n📈 TIMELINE DE PUBLICACIÓN DETECTADO:");
  for (const [dateGroup, items] of Object.entries(dateGroups)) {
    console.log(`\n🕒 Publicado "${dateGroup}" (${items.length} elementos):`);
    items.forEach((item, index) => {
      console.log(`   ${index + 1}. [${item.type}] ${item.title}`);
      console.log(`      Link: ${item.url}`);
      console.log(`      Vistas: ${item.views || '0'}`);
    });
  }

  // Output to file if --out option is provided
  const outIndex = process.argv.indexOf('--out');
  if (outIndex !== -1 && outIndex + 1 < process.argv.length) {
    const outFile = process.argv[outIndex + 1];
    fs.writeFileSync(outFile, JSON.stringify(allMedia, null, 2));
    console.log(`\n✓ Scraped data saved to ${outFile}`);
  }

  await browser.close();
}

main().catch(err => {
  console.error("❌ Scraper failed:", err);
  process.exit(1);
});
