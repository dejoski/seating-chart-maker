// Public site URL without trailing slash. Override at build time with SITE_URL.
export const SITE_URL = (process.env.SITE_URL || 'https://seating-chart-maker.pages.dev').replace(/\/$/, '');
// Base path the site is served from ("/" at a root domain, "/seating-chart-maker/" on GitHub Pages).
export const BASE = (process.env.BASE_PATH || '/').replace(/\/?$/, '/');

export const SITE_NAME = 'Seating Chart Maker';

/** path (relative to base, '' = home) -> meta. inSitemap=false pages get noindex. */
export const PAGES = [
  { file: 'index.html', path: '', title: 'Free Seating Chart Maker – Drag, Drop & Print', h1: 'Free Seating Chart Maker', description: 'Make a seating chart in minutes: paste your guest list, drag people to tables, keep couples together and feuding relatives apart, then print a PDF. Free, no sign-up.', mode: 'wedding', priority: '1.0' },
];
