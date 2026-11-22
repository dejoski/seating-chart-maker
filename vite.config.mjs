import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { PAGES, SITE_URL, BASE, SITE_NAME } from './site.config.mjs';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const content = (n) => readFileSync(resolve(__dirname, 'src/content', n + '.html'), 'utf8');
const navPages = PAGES.filter((p) => !p.noindex && !p.noTool);
const header = () => `<header class="top site">
  <a class="brand" href="%BASE%"><img src="%BASE%favicon.svg" width="24" height="24" alt="">Seating Chart Maker</a>
  <nav aria-label="Main">${navPages.map((p) => `<a href="%BASE%${p.path}">${p.nav}</a>`).join('')}</nav>
</header>`;
const footer = () => `<footer class="foot site">
  <nav aria-label="Footer">${navPages.map((p) => `<a href="%BASE%${p.path}">${esc(p.h1)}</a>`).join('')}<a href="%BASE%privacy/">Privacy</a></nav>
  <p>Free, no sign-up, no ads. Your list stays in your browser and is never uploaded.</p>
</footer>`;

function pageFor(filename) {
  const rel = filename.replace(resolve(__dirname) + '/', '').replace(/\\/g, '/');
  return PAGES.find((p) => p.file === rel);
}

function head(p) {
  const url = SITE_URL + BASE + p.path;
  const ld = {
    '@context': 'https://schema.org', '@type': 'WebApplication', name: SITE_NAME, url: SITE_URL + BASE,
    applicationCategory: 'LifestyleApplication', operatingSystem: 'Any (web browser)', browserRequirements: 'Requires JavaScript',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
  return [
    '<meta name="google-site-verification" content="Yl1hE2g8ab88VS_ZLB6txJ6mMufPpBMz4c52mrTiiw4" />',
    `<title>${esc(p.title)}</title>`,
    `<meta name="description" content="${esc(p.description)}">`,
    p.noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="website"><meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.description)}">`,
    `<meta property="og:url" content="${url}"><meta property="og:image" content="${SITE_URL + BASE}og.png">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<link rel="icon" href="${BASE}favicon.svg" type="image/svg+xml">`,
    `<meta name="theme-color" content="#7c3aed">`,
    p.noindex ? '' : `<script type="application/ld+json">${JSON.stringify(ld)}</script>`,
  ].join('\n    ');
}

const site = {
  name: 'site-pages',
  transformIndexHtml: {
    order: 'pre',
    handler(html, ctx) {
      const p = pageFor(ctx.filename);
      if (!p) throw new Error('No PAGES entry for ' + ctx.filename);
      return html
        .replace('<!--@head-->', head(p))
        .replace('<!--@header-->', header())
        .replace('<!--@footer-->', footer())
        .replace('<!--@h1-->', `<h1>${esc(p.h1)}</h1>` + (p.lede ? `\n      <p class="lede">${esc(p.lede)}</p>` : ''))
        .replace('<!--@tool-->', p.noTool ? '' : `<div id="app" data-mode="${p.mode || 'wedding'}"${p.panel ? ` data-panel="${p.panel}"` : ''}><noscript>This seating chart tool needs JavaScript turned on.</noscript><p class="loading">Loading the seating chart tool…</p></div>`)
        .replace('<!--@content-->', content(p.content))
        .replace('<!--@script-->', p.noTool && !p.script ? '' : `<script type="module" src="/src/${p.script || 'main'}.ts"></script>`)
        .replace(/%MODE%/g, p.mode || 'wedding')
        .replace(/%BASE%/g, BASE);
    },
  },
  generateBundle() {
    const today = new Date().toISOString().slice(0, 10);
    const urls = PAGES.filter((p) => !p.noindex).map((p) => `  <url><loc>${SITE_URL + BASE + p.path}</loc><lastmod>${today}</lastmod><priority>${p.priority || '0.7'}</priority></url>`);
    this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n` });
    this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL + BASE}sitemap.xml\n` });
  },
};

export default defineConfig({
  base: BASE,
  plugins: [site],
  build: {
    outDir: 'dist',
    rollupOptions: { input: Object.fromEntries(PAGES.map((p) => [p.path.replace(/\/$/, '') || 'index', resolve(__dirname, p.file)])) },
  },
});
