// The image shown when the site is shared (og:image, 1200×630): the top of the built page.
// Build first, then serve site/dist (e.g. `python3 -m http.server 8090 -d site/dist`) and run:
//   node site/scripts/og.mjs
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.goto(process.env.SITE_URL ?? 'http://localhost:8090/', { waitUntil: 'networkidle' });
// Headline, facts and the product shot only: buttons mean nothing in a shared image.
await page.addStyleTag({
  content: `.hero{padding-top:40px}.hero h1{font-size:62px}.hero .lead,.hero .actions{display:none}.hero-visual{margin-top:34px}.top{display:none}`,
});
await page.waitForTimeout(800);
await page.screenshot({ path: 'site/src/img/og.jpg', type: 'jpeg', quality: 86 });
await browser.close();
console.log('site/src/img/og.jpg');
