// Post-build checks: run after `npm run build` (same BASE_PATH / SITE_URL env).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PAGES, SITE_URL, BASE } from '../site.config.mjs';
import { PRINT_KIT_LINK_EMPTY } from './config-check.mjs';

const dist = 'dist';
const errors = [];
const fail = (m) => errors.push(m);
const read = (f) => readFileSync(join(dist, f), 'utf8');

for (const f of ['sitemap.xml', 'robots.txt', '_headers', '_redirects', 'og.png', 'favicon.svg', '06d19099c6a3bec051adf16175590868.txt']) if (!existsSync(join(dist, f))) fail(`missing ${f}`);

const sitemap = existsSync(join(dist, 'sitemap.xml')) ? read('sitemap.xml') : '';
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const expected = PAGES.filter((p) => !p.noindex).map((p) => SITE_URL + BASE + p.path);
if (JSON.stringify(locs.sort()) !== JSON.stringify([...expected].sort())) fail(`sitemap mismatch:\n  got ${locs}\n  want ${expected}`);
if (!read('robots.txt').includes(`Sitemap: ${SITE_URL + BASE}sitemap.xml`)) fail('robots.txt sitemap line wrong');

const files = new Set(PAGES.map((p) => p.path));
for (const p of PAGES) {
  if (!existsSync(join(dist, p.file))) { fail(`missing page ${p.file}`); continue; }
  const h = read(p.file);
  const where = p.file;
  const h1s = h.match(/<h1[\s>]/g) || [];
  if (h1s.length !== 1) fail(`${where}: expected 1 <h1>, found ${h1s.length}`);
  if (!h.includes(`<title>${p.title.replace(/&/g, '&amp;')}</title>`)) fail(`${where}: title`);
  if (p.title.length > 60) fail(`${where}: title over 60 chars`);
  if (!h.includes('name="google-site-verification"')) fail(`${where}: no GSC verification meta`);
  if (p.noindex) { if (!h.includes('content="noindex"')) fail(`${where}: should be noindex`); }
  else {
    if (!h.includes(`<link rel="canonical" href="${SITE_URL + BASE + p.path}">`)) fail(`${where}: canonical`);
    if (!h.includes('property="og:image"')) fail(`${where}: og:image`);
    if (!p.noTool && !h.includes('id="app"')) fail(`${where}: tool missing`);
  }
  if (/FAQPage|HowTo"/.test(h)) fail(`${where}: FAQPage/HowTo schema not allowed`);
  if (/\(?\b\d{3}\)?[ .-]\d{3}-\d{4}\b/.test(h.replace(/<script[\s\S]*?<\/script>/g, ''))) fail(`${where}: looks like a phone number`);
  if (/testimonial|★|reviews?\)/i.test(h)) fail(`${where}: review/testimonial content not allowed`);
  if (PRINT_KIT_LINK_EMPTY && /buy\.stripe\.com|Get the Print Kit|Get the Teacher Pack/.test(h)) fail(`${where}: buy button while links are empty`);
  // internal links resolve
  for (const m of h.matchAll(/href="([^"#?]+)"/g)) {
    const u = m[1];
    if (!u.startsWith(BASE) || u.startsWith('//')) continue;
    const rel = u.slice(BASE.length);
    if (rel === '' || files.has(rel)) continue;
    if (!existsSync(join(dist, rel))) fail(`${where}: broken link ${u}`);
  }
}
const js = PAGES.length && existsSync(join(dist, 'assets')) ? '' : '';
void js;
if (errors.length) { console.error('Build check FAILED:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log(`Build check OK: ${PAGES.length} pages, ${locs.length} sitemap URLs, base ${BASE}, site ${SITE_URL}`);
