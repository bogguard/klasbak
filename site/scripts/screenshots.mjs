// Takes the site's screenshots from the local demo library (macOS: uses Quick Look for PDFs).
// With `npm run dev:local` running:  npm run demo && node site/scripts/screenshots.mjs
// SITE_LANG=en takes the English app (files named *-en.jpg) for the English page.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const BASE = process.env.APP_URL ?? 'http://localhost:5173';
const LANG = process.env.SITE_LANG === 'en' ? 'en' : 'nl-BE';
const SUFFIX = LANG === 'en' ? '-en' : '';
// The app's texts the script clicks on, per language.
const UI = {
  'nl-BE': {
    cards: 'Lezerskaarten',
    pdf: 'PDF maken',
    reminders: /herinneringsbriefje/i,
    preview: 'Controleer voor je importeert',
    group: 'Klas',
  },
  en: {
    cards: 'Reader cards',
    pdf: 'Make PDF',
    reminders: /reminder slip/i,
    preview: 'Check before importing',
    group: 'Class',
  },
}[LANG];
const OUT = 'site/src/img';
const TMP = 'site/.tmp';
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const get = async (path, role = 'librarian') =>
  (await fetch(BASE + path, { headers: { authorization: `Dev ${role}` } })).json();

// Demo data the shots need.
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' });
const readers = await get('/api/readers');
const loans = await get('/api/circulation/loans');
const lateReaders = new Set(loans.filter((l) => l.dueDate < today).map((l) => l.readerId));
const pupil = readers.find(
  (r) => r.category === 'pupil' && r.activeLoanCount === 0 && r.active !== false,
);
const reading = readers.find((r) => lateReaders.has(r.id) && r.activeLoanCount >= 2);
const index = await get('/search/catalog.json');
const shelf = [];
let damaged;
for (const id of Object.values(index.documentIds)) {
  const title = await get(`/api/catalog/titles/${id}`);
  const copy = title.copies.find((c) => c.status === 'available' && !c.exchangeId);
  if (copy && title.coverImageKey) shelf.push(copy.barcode);
  if (title.copies.some((c) => c.status === 'damaged')) damaged = id;
}
const exchange = (await get('/api/catalog/exchanges')).find((e) => e.status === 'active');
if (!pupil || !reading || shelf.length < 2 || !exchange || !damaged) {
  throw new Error('Run `npm run demo` first');
}

const browser = await chromium.launch();
// 1100 px wide: the app's content fills more of the picture, so it reads well on the site.
async function open(path, { role = 'librarian', width = 1100, height = 640, scale = 2 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    locale: LANG,
    timezoneId: 'Europe/Brussels',
    acceptDownloads: true,
  });
  await context.addInitScript((r) => sessionStorage.setItem('dev-role', r), role);
  await context.addInitScript((l) => localStorage.setItem('language', l), LANG);
  await context.addInitScript(() => (window.print = () => {}));
  const page = await context.newPage();
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  return page;
}
const shot = async (page, name, options = {}) => {
  await page.waitForTimeout(500);
  await page.screenshot({
    path: join(OUT, `${name}${SUFFIX}.jpg`),
    type: 'jpeg',
    quality: 84,
    ...options,
  });
  console.log(`${name}${SUFFIX}.jpg`);
  await page.context().close();
};
/** First page of a PDF the app downloads, optionally cropped (ffmpeg crop syntax). */
async function pdfImage(page, button, name, crop) {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  const pdf = join(TMP, `${name}.pdf`);
  await download.saveAs(pdf);
  execFileSync('qlmanage', ['-t', '-s', '2400', '-o', TMP, pdf], { stdio: 'ignore' });
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    `${pdf}.png`,
    '-vf',
    crop ? `crop=${crop}` : 'null',
    '-q:v',
    '3',
    join(OUT, `${name}${SUFFIX}.jpg`),
  ]);
  console.log(`${name}${SUFFIX}.jpg`);
  await page.context().close();
}

// The desk, mid-loan.
{
  const page = await open('/manage/desk', { height: 560 });
  await page.locator('#scan').click();
  for (const code of [pupil.memberNumber, shelf[0], shelf[1]]) {
    await page.keyboard.type(code, { delay: 10 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
  }
  await page.mouse.move(-10, -10);
  await shot(page, 'desk');
}

// The catalogue, on a laptop and on a phone.
await shot(await open('/', { role: '', height: 700 }), 'catalogue');
await shot(await open('/', { role: '', width: 390, height: 844, scale: 3 }), 'phone');

// A title's page in the catalogue.
{
  const page = await open('/', { role: '' });
  await page.locator('#q').fill('dolfje');
  await page.waitForTimeout(600);
  await page.locator('main a[href^="/titles/"]').first().click();
  await shot(page, 'title', { clip: { x: 0, y: 60, width: 1100, height: 520 } });
}

// "Mijn boeken".
{
  const page = await open('/kiosk', { height: 560 });
  await page.locator('#card').fill(reading.memberNumber);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  await shot(page, 'my-books');
}

// A new title from its ISBN (Jip en Janneke: clean data and a cover on Open Library).
{
  const page = await open('/manage/titles/new', { height: 600 });
  await page.locator('#isbn-scan').fill('9789029540056');
  await page.keyboard.press('Enter');
  const cover = page.locator('img[src*="covers.openlibrary.org"]');
  await cover.waitFor({ timeout: 20000 });
  await cover.evaluate((img) =>
    img.complete && img.naturalWidth ? null : new Promise((resolve) => (img.onload = resolve)),
  );
  await shot(page, 'new-title');
}

// Copies and their status.
await shot(await open(`/manage/titles/${damaged}`, { height: 700 }), 'copies');

// Importing next school year's pupil list (Informat-style export).
{
  const next = { '1A': '2A', '2B': '3B', '3A': '4A', '3B': '4B', '4A': '5A', '5B': '6B' };
  const rows = readers
    .filter((r) => r.category === 'pupil' && r.active !== false && r.schoolNumber && next[r.group])
    .map((r) => [r.schoolNumber, r.lastName, r.firstName, next[r.group]].join(';'));
  rows.push('2001;Claes;Mila;1A', '2002;Peeters;Adam;1A', '2003;Vandamme;Noor;1A');
  const file = join(TMP, 'leerlingen.csv');
  writeFileSync(
    file,
    ['Leerlingenlijst', 'Stamboeknummer;Naam;Voornaam;Klasgroep', ...rows].join('\r\n'),
  );
  const page = await open('/manage/readers/import', { role: 'admin', height: 600 });
  await page.locator('input[type=file]').setInputFiles(file);
  const preview = page.getByText(UI.preview);
  await preview.waitFor();
  await preview.evaluate((el) =>
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 32),
  );
  await shot(page, 'import');
}

// Reminder slips and reader cards, as printed.
{
  const page = await open('/manage/loans');
  await pdfImage(page, page.getByRole('button', { name: UI.reminders }), 'reminder', 'iw:ih/3:0:0');
}
{
  const page = await open('/manage/labels');
  await page.getByRole('button', { name: UI.cards }).click();
  await page.getByLabel(UI.group).selectOption('3A');
  await pdfImage(page, page.getByRole('button', { name: UI.pdf }), 'cards', 'iw:ih/3:0:0');
}

// An exchange collection, with where each book is.
{
  const page = await open(`/manage/exchanges/${exchange.id}`, { height: 600 });
  await page
    .locator('table')
    .first()
    .evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 120));
  await shot(page, 'exchange');
}

// Statistics.
{
  const page = await open('/manage/statistics', { height: 640 });
  await shot(page, 'statistics');
}

await browser.close();
