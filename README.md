# Seating Chart Maker

A free seating chart maker for weddings, classrooms and events that runs entirely in the browser. Names are never uploaded: charts are saved in `localStorage` and every export (PDF, PNG, CSV, JSON) is generated on the device.

Live (GitHub Pages): https://dejoski.github.io/seating-chart-maker/

## Features

- Wedding (default), classroom and event modes, each with its own saved chart.
- Guest import by paste (one per line or spreadsheet columns) or CSV file. "Alex & Sam Lee" and "Jo Park +1" become linked parties.
- Round, long (rect), head, sweetheart and classroom-desk tables (1–20 seats); quick layouts for rounds of 8/10, long tables, head table, and classroom rows, pairs, pods and U-shape.
- Drag and drop with mouse or pen, tap-to-seat on touch screens, and table dragging on the floor plan.
- Keep-together and keep-apart rules, seat locks, an auto-arrange button and a classroom random shuffle. Conflicts are listed and highlighted in red.
- Views: floor plan, by table, and A–Z "find your seat".
- Free exports: PDF (floor plan, by-table list, A–Z list) and PNG with a small "made with" footer, a caterer CSV, and a JSON backup with restore.
- Paid add-ons, built but hidden until configured:
  - Print Kit ($14): a seating sign at 24×36, 18×24 or 11×17 in 6 designs with no footer, escort cards (Avery-style 10-up), table numbers and a caterer sheet.
  - Teacher Pack ($7): name tents and a substitute plan.

## Pages

| Path | Title |
|---|---|
| `/` | Free Seating Chart Maker – Drag, Drop & Print |
| `/wedding-seating-chart/` | Wedding Seating Chart Maker (Free, Printable) |
| `/classroom-seating-chart/` | Classroom Seating Chart Generator – Free |
| `/banquet-seating-chart/` | Banquet Seating Chart Maker (Free, Printable) |
| `/seating-chart-template/` | Seating Chart Templates – Round & Long Tables |
| `/seating-chart-sign-size/` | Seating Chart Sign Size Guide (+ Free Maker) |
| `/seating-chart-with-restrictions/` | Seating Chart Generator With Rules |
| `/privacy/` | Privacy – Seating Chart Maker |
| `/unlock/` | Purchase unlock (noindex, not in the sitemap) |

Page metadata lives in `site.config.mjs`. Page bodies are in `src/content/*.html`. Every page uses the same skeleton (`src/skeleton.html`), and a small Vite plugin in `vite.config.mjs` fills in the head (title, description, canonical, OG, `WebApplication` JSON-LD), header and footer navigation, the tool mount, `sitemap.xml` and `robots.txt`. Q&A sections are visible HTML only: there is no FAQPage or HowTo schema.

## Develop

```
npm ci
npm run dev           # http://localhost:5173/
npm test              # unit tests (vitest): rules, auto-arrange, parsing, PDFs, unlock
npm run build         # -> dist/
npm run check:build   # checks dist: pages, titles, canonicals, sitemap, links, no buy buttons while links are empty
```

The build reads two environment variables:

- `SITE_URL`: the origin used for canonical tags, OG tags and the sitemap. The default is `https://seating-chart-maker.pages.dev`.
- `BASE_PATH`: the path the site is served from. The default is `/`. GitHub Pages uses `/seating-chart-maker/`.

Examples:

```
BASE_PATH=/seating-chart-maker/ SITE_URL=https://dejoski.github.io npm run build   # GitHub Pages
BASE_PATH=/ SITE_URL=https://example.com npm run build                              # root domain
```

## Deploy: GitHub Pages (current)

`.github/workflows/pages.yml` runs the tests, builds with the GitHub Pages base path, runs the build check and deploys on every push to `main`.

## Deploy: connecting Cloudflare Pages (later)

The repo is ready for Cloudflare Pages: `wrangler.toml` sets `pages_build_output_dir = "./dist"`, and `public/_headers` and `public/_redirects` are copied into `dist/`.

1. In the Cloudflare dashboard, go to Workers & Pages, then Create, then Pages, then Connect to Git, and pick `dejoski/seating-chart-maker`.
2. Build settings:
   - Framework preset: None.
   - Build command: `npm run build`.
   - Build output directory: `dist`.
   - Environment variables: `NODE_VERSION=22`, `BASE_PATH=/`, and `SITE_URL=https://seating-chart-maker.pages.dev` (or your custom domain).
3. Save and deploy. The project name `seating-chart-maker` gives `seating-chart-maker.pages.dev`; if that name is taken, use another name and update `SITE_URL` to match.
4. Optional: add a custom domain under Custom domains and set `SITE_URL` to it.
5. When Cloudflare becomes the main host, submit the new `sitemap.xml` in Search Console. `_redirects` already sends old `/seating-chart-maker/*` paths to the root. You can then turn off GitHub Pages, or keep it and accept the duplicate; canonical tags follow `SITE_URL`.

## Paid add-ons: how unlocking works (v0)

All settings are in `src/config.ts`.

- `PRINT_KIT_LINK` and `TEACHER_PACK_LINK` are Stripe Payment Link URLs. While a link is empty and `FREE_GIVEAWAY` is false, no buy button or paid panel is shown.
- `FREE_GIVEAWAY` (2026-11-22, on): while a link is empty, each add-on shows **Get it free** (unlocks in this browser at once; email optional) and **Buy $14 / Buy $7**. Buy only logs a `buy_click` event and shows "Payments open soon. Here's your free copy now." with the free unlock and an optional notify-me email. No charge, no checkout. Events (`free_download`, `buy_click`, `notify_email`) go to `PRODUCT_EVENT_URL` (the osceolasodsolutions.top worker). Read aggregate counts with `curl -s https://osceolasodsolutions.top/api/product-events` (`totals.print-kit`, `totals.teacher-pack`). Set `FREE_GIVEAWAY = false` when the Payment Links go live.
- `UNLOCK_HASHES` holds the SHA-256 of each product's secret unlock token. The plain tokens are not stored in this repo.

To go live:

1. Create a Stripe Payment Link with a success redirect to `https://<site>/unlock/?unlock=<token>`. Stripe may append `&session_id=…`; that's fine.
2. Paste the Payment Link URL into `PRINT_KIT_LINK` or `TEACHER_PACK_LINK`.
3. Deploy.

When someone opens the unlock URL, the page hashes the token, compares it with `UNLOCK_HASHES`, sets `localStorage['scm.unlock.printkit']` (or `teacher`) and removes the token from the address bar.

To rotate a token: make a new random token (`openssl rand -hex 16`), put its `sha256sum` in `UNLOCK_HASHES`, update the Stripe redirect and redeploy.

This is spoofable by design, which is fine for a low-price MVP. The planned next step is a Pages Function `/api/verify` that checks the Stripe Checkout session (`payment_status=paid`) with a restricted key and returns a signed token, plus a "Restore purchase" field.

## Privacy

There are no cookies, analytics, ads or third-party scripts. The Content-Security-Policy in `_headers` (Cloudflare) allows same-origin scripts only.

## Code map

- `src/lib/model.ts`: data types and sanitizing.
- `src/lib/parse.ts`: paste and CSV import.
- `src/lib/arrange.ts`: auto-arrange and conflict detection.
- `src/lib/layouts.ts`: table geometry and layouts.
- `src/lib/pdf.ts` and `src/lib/png.ts`: free exports.
- `src/lib/printkit.ts`: paid generators.
- `src/lib/unlock.ts`: the v0 unlock.
- `src/main.ts`: the UI.
