// Takes the site's screenshots from the local demo library (macOS: uses Quick Look for PDFs).
// With `npm run dev:local` running:  npm run demo && node site/scripts/screenshots.mjs
// SITE_LANG=en takes the English app (files named *-en.jpg) for the English page.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
    uploaded: /Klaar: \d+ foto/,
  },
  en: {
    cards: 'Reader cards',
    pdf: 'Make PDF',
    reminders: /reminder slip/i,
    preview: 'Check before importing',
    group: 'Class',
    uploaded: /Done: \d+ photo/,
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
  // The last table is the collection's books (the first is the example list for the library).
  await page
    .locator('table')
    .last()
    .evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 120));
  await shot(page, 'exchange');
}

// Statistics.
{
  const page = await open('/manage/statistics', { height: 640 });
  await shot(page, 'statistics');
}

await shot(await open('/manage/equipment', { role: 'equipment', height: 700 }), 'equipment');

// School photos: made-up people (never real children), uploaded through the app to the demo's
// photo day, which is then opened to parents. Pictures made with AI in video/photos (local, see
// video/README.md) are used when they are there, otherwise drawings.
// Only once: the English run reuses them.
{
  const admin = async (path, method, body) =>
    fetch(BASE + path, {
      method,
      headers: { authorization: 'Dev admin', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const [day] = await get('/api/photos/days', 'admin');
  if (!day) throw new Error('Run `npm run demo` first');
  const detail = await get(`/api/photos/days/${day.id}`, 'admin');
  const pupils = await get('/api/photos/pupils', 'admin');
  const noPhoto = new Set(detail.pupils.filter((p) => p.noPhoto).map((p) => p.readerId));
  const byClass = Object.groupBy(
    pupils.filter((p) => p.group),
    (p) => p.group,
  );
  // Ill on the photo day: that class shows the most of the page.
  const absent = pupils.find((p) => p.firstName === 'Seppe' && !noPhoto.has(p.id));
  if (!absent) throw new Error('Run `npm run demo` first');
  const group = absent.group;
  if (detail.photos.length === 0) {
    const page = await open('/', { role: 'admin' });
    const drawn = await page.evaluate(drawPictures, pupils.length);
    await page.context().close();
    const upload = async (query, files) => {
      const up = await open(`/manage/photos/${day.id}/upload?${query}`, { role: 'admin' });
      await up.locator('input[type=file]').setInputFiles(
        files.map((data, i) => ({
          name: `IMG_${1000 + i}.JPG`,
          mimeType: 'image/jpeg',
          buffer: Buffer.from(data, 'base64'),
        })),
      );
      await up.getByText(UI.uploaded).waitFor({ timeout: 60000 });
      await up.context().close();
    };
    const slug = (text) =>
      text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
    const picture = (name, fallback) => {
      const file = join('video/photos', `${name}.jpg`);
      return existsSync(file) ? readFileSync(file).toString('base64') : fallback;
    };
    for (const [i, pupil] of pupils.entries()) {
      if (noPhoto.has(pupil.id) || pupil === absent) continue;
      const name = slug(`${pupil.firstName} ${pupil.lastName}`);
      await upload(
        `reader=${pupil.id}`,
        [1, 2].map((take) => picture(`${name}-${take}`, drawn.portraits[i * 2 + take - 1])),
      );
    }
    for (const name of Object.keys(byClass)) {
      await upload(`group=${encodeURIComponent(name)}`, [
        picture(`klas-${slug(name)}`, drawn.group),
      ]);
    }
    const until = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    await admin(`/api/photos/days/${day.id}`, 'PUT', {
      name: day.name,
      takenOn: day.takenOn,
      open: true,
      availableUntil: until,
    });
  }
  const page = await open(`/manage/photos/${day.id}?class=${encodeURIComponent(group)}`, {
    role: 'admin',
    height: 760,
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const review = document.getElementById('review');
    if (review) window.scrollTo(0, review.getBoundingClientRect().top + window.scrollY - 24);
  });
  await shot(page, 'photos');
}

/**
 * Friendly flat illustrations, drawn in the browser as JPEG (base64): two portraits per pupil
 * (the same child, a slightly different pose) and one class photo. Same input, same pictures.
 */
function drawPictures(pupils) {
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = (list) => list[Math.floor(random() * list.length)];
  const skins = ['#f3d2b6', '#e8b896', '#c98f6a', '#a86d4a', '#7a4b31', '#f7dcc6'];
  const hairs = ['#2b1d16', '#4a2f1f', '#7b4a26', '#c8913f', '#e2c07a', '#1c1c1c'];
  const shirts = ['#2f6f73', '#c8553d', '#3d5a80', '#e0a458', '#6b8f71', '#8e6c8a', '#d1495b'];
  const backgrounds = [
    ['#dfe7ec', '#b9c7d1'],
    ['#ece4da', '#cdbca8'],
    ['#e3e8e1', '#bccab7'],
  ];
  const look = () => ({
    skin: pick(skins),
    hair: pick(hairs),
    shirt: pick(shirts),
    style: Math.floor(random() * 4),
  });
  function person(c, x, y, size, { skin, hair, shirt, style }, smile = 0.17) {
    // Shoulders and shirt.
    c.fillStyle = shirt;
    c.beginPath();
    c.ellipse(x, y + size * 1.55, size * 1.05, size * 0.75, 0, Math.PI, 0);
    c.fill();
    // Long hair behind the head.
    c.fillStyle = hair;
    if (style === 2 || style === 3) {
      c.beginPath();
      c.ellipse(x, y + size * 0.35, size * 0.62, size * 0.85, 0, 0, Math.PI * 2);
      c.fill();
    }
    // Neck and head.
    c.fillStyle = skin;
    c.fillRect(x - size * 0.17, y + size * 0.4, size * 0.34, size * 0.5);
    c.beginPath();
    c.ellipse(x, y, size * 0.48, size * 0.58, 0, 0, Math.PI * 2);
    c.fill();
    // Hair on top.
    c.fillStyle = hair;
    c.beginPath();
    if (style === 1) {
      for (let a = 0; a < 9; a++) {
        const angle = Math.PI + (a / 8) * Math.PI;
        c.moveTo(x, y);
        c.arc(
          x + Math.cos(angle) * size * 0.42,
          y - size * 0.18 + Math.sin(angle) * size * 0.42,
          size * 0.16,
          0,
          Math.PI * 2,
        );
      }
    } else {
      c.ellipse(x, y - size * 0.22, size * 0.52, size * 0.42, 0, Math.PI, 0);
    }
    c.fill();
    // Eyes and a smile.
    c.fillStyle = '#2b2420';
    for (const dx of [-0.17, 0.17]) {
      c.beginPath();
      c.arc(x + dx * size, y + size * 0.02, size * 0.045, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = '#8a4b3a';
    c.lineWidth = size * 0.035;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(x, y + size * 0.14, size * smile, Math.PI * 0.15, Math.PI * 0.85);
    c.stroke();
  }
  function picture(width, height, background, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const c = canvas.getContext('2d');
    const [light, dark] = background;
    const gradient = c.createRadialGradient(
      width / 2,
      height * 0.4,
      0,
      width / 2,
      height * 0.4,
      height,
    );
    gradient.addColorStop(0, light);
    gradient.addColorStop(1, dark);
    c.fillStyle = gradient;
    c.fillRect(0, 0, width, height);
    draw(c);
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
  }
  const portraits = Array.from({ length: pupils }, () => {
    const child = look();
    const background = pick(backgrounds);
    return [
      picture(900, 1200, background, (c) => person(c, 450, 520, 330, child)),
      picture(900, 1200, background, (c) => person(c, 470, 500, 350, child, 0.2)),
    ];
  }).flat();
  const group = picture(1800, 1200, pick(backgrounds), (c) => {
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 6; i++) {
        person(c, 230 + i * 268 + (row ? 0 : 74), 420 + row * 360, 120, look());
      }
    }
  });
  return { portraits, group };
}

await browser.close();
