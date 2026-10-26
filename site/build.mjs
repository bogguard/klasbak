// Builds the static site into site/dist: one page per language (nl at /, en at /en/), assets
// with a content hash in their name so they can be cached forever. No dependencies.
//   node site/build.mjs
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './src/config.mjs';
import en from './src/content/en.mjs';
import nl from './src/content/nl.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'assets'), { recursive: true });

// ---------------------------------------------------------------- assets

const assets = new Map(); // 'img/desk.jpg' -> '/assets/desk.3f2a9c1b.jpg'
function addAsset(relative, from = join(src, relative)) {
  const body = readFileSync(from);
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 10);
  const ext = extname(relative);
  const name = `${relative.split('/').pop().slice(0, -ext.length)}.${hash}${ext}`;
  writeFileSync(join(dist, 'assets', name), body);
  assets.set(relative, `/assets/${name}`);
}
for (const dir of ['img']) {
  if (!existsSync(join(src, dir))) continue;
  for (const file of readdirSync(join(src, dir))) addAsset(`${dir}/${file}`);
}
// The app's own typefaces, served from this site (no third party).
const fonts = join(root, '..', 'node_modules', '@fontsource-variable');
addAsset('fonts/fraunces.woff2', join(fonts, 'fraunces/files/fraunces-latin-wght-normal.woff2'));
addAsset('fonts/nunito.woff2', join(fonts, 'nunito/files/nunito-latin-wght-normal.woff2'));
addAsset('icon.svg');
// CSS last: it refers to the fonts by their hashed names.
const css = readFileSync(join(src, 'styles.css'), 'utf8').replace(
  /url\('\.\/(fonts\/[^']+)'\)/g,
  (_, file) => `url('${assets.get(file)}')`,
);
writeFileSync(join(src, '.styles.build.css'), css);
addAsset('styles.css', join(src, '.styles.build.css'));
rmSync(join(src, '.styles.build.css'));
addAsset('main.js');

const asset = (path) => {
  const url = assets.get(path);
  if (!url) throw new Error(`Missing asset ${path}`);
  return url;
};
const has = (path) => assets.has(path);

// ---------------------------------------------------------------- page

const esc = (text) =>
  String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const icon = {
  logo: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  play: '<polygon points="7 4 20 12 7 20 7 4"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  globe:
    '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
};
const svg = (name, cls = 'icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon[name]}</svg>`;

/** A screenshot in a browser window, at its real size so the page doesn't jump while loading. */
const shot = (image, alt, lang, { eager = false, cls = '' } = {}) => {
  const path = `img/${image}${lang === 'en' && has(`img/${image}-en.jpg`) ? '-en' : ''}.jpg`;
  const [w, h] = sizes[path] ?? [1280, 800];
  return `<figure class="window ${cls}"><div class="window-bar" aria-hidden="true"><span></span><span></span><span></span></div><img src="${asset(path)}" alt="${esc(alt)}" width="${w}" height="${h}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></figure>`;
};
const sizes = Object.fromEntries(
  [...assets.keys()].filter((k) => k.endsWith('.jpg')).map((k) => [k, jpegSize(join(src, k))]),
);

function page(t, lang) {
  const other = lang === 'nl' ? { href: '/en/', lang: 'en' } : { href: '/', lang: 'nl-BE' };
  const url = lang === 'nl' ? `${config.siteUrl}/` : `${config.siteUrl}/en/`;
  const mail = `mailto:${config.email}?subject=${encodeURIComponent('Klasbak')}`;
  const repo = config.github;
  const og = has('img/og.jpg') ? `${config.siteUrl}${asset('img/og.jpg')}` : '';

  const feature = (f, i) => `
    <article class="feature ${i % 2 ? 'feature-flip' : ''}" id="${f.id}">
      <div class="feature-text">
        <p class="kicker">${esc(f.kicker)}</p>
        <h3>${esc(f.title)}</h3>
        <p>${esc(f.text)}</p>
        <ul class="checks">${f.points.map((p) => `<li>${svg('check')}${esc(p)}</li>`).join('')}</ul>
      </div>
      <div class="feature-shot">${shot(f.image, f.alt, lang)}</div>
    </article>`;

  const webinar = config.youtubeId
    ? `<button type="button" class="play" data-youtube="${esc(config.youtubeId)}" data-title="${esc(t.video.play)}">
         ${has('img/webinar.jpg') ? `<img src="${asset('img/webinar.jpg')}" alt="" loading="lazy" decoding="async">` : ''}
         <span class="play-button">${svg('play')}<span>${esc(t.video.play)}</span></span>
       </button>
       <p class="small">${esc(t.video.playNote)}</p>`
    : `<div class="soon">${has('img/webinar.jpg') ? `<img src="${asset('img/webinar.jpg')}" alt="" loading="lazy" decoding="async">` : ''}<p>${esc(t.video.soon)}</p></div>`;

  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.meta.title)}</title>
<meta name="description" content="${esc(t.meta.description)}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="nl-BE" href="${config.siteUrl}/">
<link rel="alternate" hreflang="en" href="${config.siteUrl}/en/">
<link rel="alternate" hreflang="x-default" href="${config.siteUrl}/">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(t.meta.title)}">
<meta property="og:description" content="${esc(t.meta.description)}">
<meta property="og:url" content="${url}">
${og ? `<meta property="og:image" content="${og}"><meta name="twitter:card" content="summary_large_image">` : ''}
<meta name="theme-color" content="#0f6e66">
<link rel="icon" href="${asset('icon.svg')}" type="image/svg+xml">
<link rel="preload" href="${asset('fonts/fraunces.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${asset('fonts/nunito.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${asset('styles.css')}">
<script src="${asset('main.js')}" defer></script>
</head>
<body>
<a class="skip" href="#main">${esc(t.nav.skip)}</a>

<header class="top">
  <div class="wrap top-inner">
    <a class="brand" href="${lang === 'nl' ? '/' : '/en/'}">${svg('logo', 'brand-mark')}<span>Klasbak</span></a>
    <nav class="nav" aria-label="${esc(t.nav.menu)}">
      <a href="#functies">${esc(t.nav.features)}</a>
      <a href="#video">${esc(t.nav.video)}</a>
      <a href="#privacy">${esc(t.nav.privacy)}</a>
      <a href="#prijs">${esc(t.nav.price)}</a>
      <a href="#vragen">${esc(t.nav.faq)}</a>
    </nav>
    <div class="top-actions">
      <a class="lang" href="${other.href}" hreflang="${other.lang}" lang="${other.lang}">${svg('globe')}<span>${esc(t.nav.switchLabel)}</span></a>
      <a class="button button-small" href="#starten">${esc(t.nav.contact)}</a>
    </div>
  </div>
</header>

<main id="main">
  <section class="hero">
    <div class="wrap hero-inner">
      <div class="hero-text">
        <p class="eyebrow">${esc(t.hero.eyebrow)}</p>
        <h1>${esc(t.hero.title)}</h1>
        <p class="lead">${esc(t.hero.lead)}</p>
        <div class="actions">
          <a class="button" href="${mail}">${svg('mail')}${esc(t.hero.primary)}</a>
          <a class="button button-ghost" href="#video">${svg('play')}${esc(t.hero.secondary)}</a>
        </div>
        <ul class="facts">${t.hero.facts.map((f) => `<li>${svg('check')}${esc(f)}</li>`).join('')}</ul>
      </div>
      <div class="hero-visual">
        ${shot('desk', t.hero.deskAlt, lang, { eager: true, cls: 'hero-desk' })}
        <figure class="phone"><img src="${asset(`img/phone${lang === 'en' && has('img/phone-en.jpg') ? '-en' : ''}.jpg`)}" alt="${esc(t.hero.phoneAlt)}" width="1170" height="2532" fetchpriority="high" decoding="async"></figure>
        <div class="badge" aria-hidden="true">${svg('check')}<div><strong>${esc(t.hero.badge)}</strong><span>${esc(t.hero.badgeText)}</span></div></div>
      </div>
    </div>
  </section>

  <section class="strip" aria-label="Klasbak">
    <ul class="wrap strip-inner">
      ${t.strip.map((s) => `<li><strong>${esc(s.value)}</strong><span>${esc(s.label)}</span></li>`).join('')}
    </ul>
  </section>

  <section class="section" id="functies">
    <div class="wrap">
      <header class="section-head">
        <p class="kicker">${esc(t.week.kicker)}</p>
        <h2>${esc(t.week.title)}</h2>
        <p class="lead">${esc(t.week.lead)}</p>
      </header>
      ${t.features.map(feature).join('')}
      <h3 class="more-title">${esc(t.more.title)}</h3>
      <div class="cards">
        ${t.more.items
          .map(
            (m) => `<article class="card">
              <div class="card-shot"><img src="${asset(`img/${m.image}${lang === 'en' && has(`img/${m.image}-en.jpg`) ? '-en' : ''}.jpg`)}" alt="${esc(m.alt)}" loading="lazy" decoding="async"></div>
              <h4>${esc(m.title)}</h4>
              <p>${esc(m.text)}</p>
            </article>`,
          )
          .join('')}
      </div>
      <aside class="orgs">
        <h3>${esc(t.orgs.title)}</h3>
        <p>${esc(t.orgs.text)}</p>
      </aside>
    </div>
  </section>

  <section class="section section-sunken" id="video">
    <div class="wrap">
      <header class="section-head">
        <p class="kicker">${esc(t.video.kicker)}</p>
        <h2>${esc(t.video.title)}</h2>
      </header>
      <figure class="video">
        ${webinar}
        <figcaption>${esc(t.video.webinar)}</figcaption>
      </figure>
    </div>
  </section>

  <section class="section section-dark" id="privacy">
    <div class="wrap">
      <header class="section-head">
        <p class="kicker">${esc(t.privacy.kicker)}</p>
        <h2>${esc(t.privacy.title)}</h2>
      </header>
      <ul class="privacy">
        ${t.privacy.points.map((p) => `<li><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p></li>`).join('')}
      </ul>
    </div>
  </section>

  <section class="section" id="prijs">
    <div class="wrap">
      <header class="section-head">
        <p class="kicker">${esc(t.price.kicker)}</p>
        <h2>${esc(t.price.title)}</h2>
      </header>
      <div class="prices">
        <article class="price price-main">
          <h3>${esc(t.price.hosted.name)}</h3>
          <p class="amount"><strong>${esc(config.price)}</strong><span>${esc(t.price.hosted.per)}</span></p>
          <p class="small">${esc(t.price.hosted.note)}</p>
          <ul class="checks">${t.price.hosted.points.map((p) => `<li>${svg('check')}${esc(p)}</li>`).join('')}</ul>
          <a class="button" href="${mail}">${svg('mail')}${esc(t.price.hosted.cta)}</a>
        </article>
        <article class="price">
          <h3>${esc(t.price.self.name)}</h3>
          <p class="amount"><strong>${esc(t.price.self.amount)}</strong><span>${esc(t.price.self.per)}</span></p>
          <p>${esc(t.price.self.text)}</p>
          <a class="button button-ghost" href="${repo}">${svg('code')}${esc(t.price.self.cta)}</a>
        </article>
      </div>
    </div>
  </section>

  <section class="section section-sunken" id="starten">
    <div class="wrap">
      <header class="section-head">
        <p class="kicker">${esc(t.start.kicker)}</p>
        <h2>${esc(t.start.title)}</h2>
      </header>
      <ol class="steps">
        ${t.start.steps.map((s) => `<li><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`).join('')}
      </ol>
      <div class="needs">
        <h3>${esc(t.start.needs)}</h3>
        <ul class="checks">${t.start.needsList.map((n) => `<li>${svg('check')}${esc(n)}</li>`).join('')}</ul>
      </div>
    </div>
  </section>

  <section class="section" id="vragen">
    <div class="wrap narrow">
      <h2>${esc(t.faq.title)}</h2>
      <div class="faq">
        ${t.faq.items.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}
      </div>
    </div>
  </section>

  <section class="cta">
    <div class="wrap cta-inner">
      <h2>${esc(t.cta.title)}</h2>
      <p>${esc(t.cta.text)}</p>
      <a class="button button-light" href="${mail}">${svg('mail')}${esc(t.cta.button)} ${esc(config.email)}</a>
    </div>
  </section>
</main>

<footer class="footer">
  <div class="wrap footer-inner">
    <div>
      <a class="brand" href="${lang === 'nl' ? '/' : '/en/'}">${svg('logo', 'brand-mark')}<span>Klasbak</span></a>
      <p>${esc(t.footer.tagline)}</p>
    </div>
    <div>
      <p>${esc(t.footer.by)} ${esc(config.company.name)}<br>${esc(config.company.address)}<br>${esc(t.footer.vat)} ${esc(config.company.vat)}</p>
    </div>
    <div class="footer-links">
      <a href="mailto:${config.email}">${svg('mail')}${esc(config.email)}</a>
      <a href="${repo}">${svg('code')}${esc(t.footer.source)}</a>
      <a href="${other.href}" hreflang="${other.lang}" lang="${other.lang}">${svg('globe')}${esc(t.nav.switchLabel)}</a>
    </div>
  </div>
  <p class="wrap small footer-note">${esc(t.footer.privacy)}</p>
</footer>
</body>
</html>
`;
}

writeFileSync(join(dist, 'index.html'), page(nl, 'nl'));
mkdirSync(join(dist, 'en'), { recursive: true });
writeFileSync(join(dist, 'en', 'index.html'), page(en, 'en'));
writeFileSync(
  join(dist, 'robots.txt'),
  `User-agent: *\nAllow: /\nSitemap: ${config.siteUrl}/sitemap.xml\n`,
);
writeFileSync(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${config.siteUrl}/</loc></url>
  <url><loc>${config.siteUrl}/en/</loc></url>
</urlset>
`,
);
writeFileSync(join(dist, '404.html'), page(nl, 'nl'));
cpSync(join(src, 'icon.svg'), join(dist, 'favicon.svg'));
console.log(`site/dist: ${assets.size} assets, 2 pages`);

/** Width and height of a JPEG, read from its header. */
function jpegSize(file) {
  const b = readFileSync(file);
  let i = 2;
  while (i < b.length) {
    const marker = b[i + 1];
    const length = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + length;
  }
  return [1280, 800];
}
