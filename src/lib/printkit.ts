/**
 * Paid add-on generators (Print Kit $14, Teacher Pack $7). All PDFs are built in the browser with pdf-lib.
 * The UI only exposes these when the matching product is unlocked (see config.ts / unlock.ts).
 */
import type { PDFDocument as PDFDoc, PDFFont, PDFPage, RGB } from 'pdf-lib';
import type { Chart } from './model';
import { guestsAt } from './model';
import { pdfSafe, sortName } from './text';
import { roomSize, tableBox } from './layouts';

export type SignSize = '11x17' | '18x24' | '24x36';
export const SIGN_SIZES: Record<SignSize, [number, number]> = { '11x17': [11, 17], '18x24': [18, 24], '24x36': [24, 36] };

export interface Design { name: string; title: 'TimesRomanBoldItalic' | 'HelveticaBold' | 'TimesRomanBold' | 'CourierBold'; body: 'TimesRoman' | 'Helvetica' | 'Courier'; ink: [number, number, number]; accent: [number, number, number]; paper: [number, number, number] }
export const DESIGNS: Design[] = [
  { name: 'Classic', title: 'TimesRomanBoldItalic', body: 'TimesRoman', ink: [0.12, 0.12, 0.14], accent: [0.55, 0.45, 0.25], paper: [1, 1, 1] },
  { name: 'Modern', title: 'HelveticaBold', body: 'Helvetica', ink: [0.1, 0.1, 0.1], accent: [0.1, 0.1, 0.1], paper: [1, 1, 1] },
  { name: 'Garden', title: 'TimesRomanBoldItalic', body: 'TimesRoman', ink: [0.16, 0.26, 0.18], accent: [0.35, 0.5, 0.33], paper: [0.97, 0.98, 0.95] },
  { name: 'Blush', title: 'TimesRomanBoldItalic', body: 'Helvetica', ink: [0.33, 0.2, 0.24], accent: [0.83, 0.58, 0.62], paper: [1, 0.97, 0.97] },
  { name: 'Navy & Gold', title: 'TimesRomanBold', body: 'TimesRoman', ink: [0.95, 0.92, 0.82], accent: [0.83, 0.69, 0.36], paper: [0.08, 0.13, 0.25] },
  { name: 'Typewriter', title: 'CourierBold', body: 'Courier', ink: [0.15, 0.15, 0.15], accent: [0.4, 0.4, 0.4], paper: [0.99, 0.98, 0.95] },
];

async function setup(designIndex: number) {
  const lib = await import('pdf-lib');
  const d = DESIGNS[((designIndex % DESIGNS.length) + DESIGNS.length) % DESIGNS.length];
  const doc = await lib.PDFDocument.create();
  doc.setProducer('Seating Chart Maker');
  const titleF = await doc.embedFont(lib.StandardFonts[d.title]);
  const bodyF = await doc.embedFont(lib.StandardFonts[d.body]);
  const boldF = await doc.embedFont(lib.StandardFonts[d.body === 'Courier' ? 'CourierBold' : d.body === 'Helvetica' ? 'HelveticaBold' : 'TimesRomanBold']);
  const c = (v: [number, number, number]) => lib.rgb(v[0], v[1], v[2]);
  return { lib, doc, d, titleF, bodyF, boldF, ink: c(d.ink), accent: c(d.accent), paper: c(d.paper) };
}

function paint(page: PDFPage, paper: RGB, accent: RGB, inset: number) {
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: 0, width, height, color: paper });
  page.drawRectangle({ x: inset, y: inset, width: width - 2 * inset, height: height - 2 * inset, borderColor: accent, borderWidth: Math.max(0.75, inset / 18) });
}

function centred(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color: RGB, maxW?: number) {
  const { width } = page.getSize();
  let s = size;
  const t = pdfSafe(text);
  if (maxW) while (s > 4 && font.widthOfTextAtSize(t, s) > maxW) s -= 0.5;
  page.drawText(t, { x: (width - font.widthOfTextAtSize(t, s)) / 2, y, size: s, font, color });
}

export interface SignOptions { size: SignSize; design: number; order: 'alpha' | 'table'; heading?: string }

/** Print-shop-ready seating sign. Columns and type size are fitted to the list; no footer. */
export async function seatingSign(chart: Chart, o: SignOptions): Promise<Uint8Array> {
  const { doc, titleF, bodyF, boldF, ink, accent, paper } = await setup(o.design);
  const [wi, hi] = SIGN_SIZES[o.size];
  const W = wi * 72, H = hi * 72, M = W * 0.07;
  const page = doc.addPage([W, H]);
  doc.setTitle(pdfSafe(`${chart.title || 'Seating chart'} sign ${o.size}`));
  paint(page, paper, accent, M * 0.45);
  const heading = o.heading ?? 'Find your seat';
  centred(page, heading, H - M - W * 0.06, titleF, W * 0.075, ink, W - 2 * M);
  if (chart.title) centred(page, chart.title, H - M - W * 0.1, bodyF, W * 0.03, accent, W - 2 * M);
  const tn = new Map(chart.tables.map((t) => [t.id, t.name]));
  type Line = { text: string; right?: string; head?: boolean };
  const lines: Line[] = [];
  if (o.order === 'alpha') {
    for (const g of [...chart.guests].filter((g) => tn.has(chart.seat[g.id])).sort((a, b) => sortName(a.name).localeCompare(sortName(b.name)))) lines.push({ text: g.name, right: tn.get(chart.seat[g.id])!.replace(/^Table\s+/i, '') });
  } else {
    for (const t of chart.tables) {
      const gs = guestsAt(chart, t.id);
      if (!gs.length) continue;
      lines.push({ text: t.name, head: true });
      gs.forEach((g) => lines.push({ text: g.name }));
      lines.push({ text: '' });
    }
  }
  const top = H - M - W * 0.16, bottom = M * 1.1, areaW = W - 2 * M;
  // find the largest size (and column count) that fits
  let size = W * 0.03, cols = 1;
  for (; size > 5; size -= 0.5) {
    const lh = size * 1.45;
    const perCol = Math.max(1, Math.floor((top - bottom) / lh));
    cols = Math.ceil(lines.length / perCol);
    const colW = areaW / Math.max(cols, 1);
    const widest = Math.max(1, ...lines.map((l) => (l.head ? boldF : bodyF).widthOfTextAtSize(pdfSafe(l.text + (l.right ? '   ' + l.right : '')), size)));
    if (cols <= 6 && widest + size * 1.5 <= colW) break;
  }
  const lh = size * 1.45;
  const perCol = Math.max(1, Math.floor((top - bottom) / lh));
  cols = Math.max(1, Math.ceil(lines.length / perCol));
  const colW = areaW / cols;
  lines.forEach((l, i) => {
    const c = Math.floor(i / perCol), r = i % perCol;
    const x = M + c * colW + size * 0.5, y = top - r * lh;
    if (!l.text) return;
    page.drawText(pdfSafe(l.text), { x, y, size: l.head ? size * 1.05 : size, font: l.head ? boldF : bodyF, color: l.head ? accent : ink });
    if (l.right) {
      const rt = pdfSafe(l.right);
      page.drawText(rt, { x: x + colW - size * 1.5 - boldF.widthOfTextAtSize(rt, size), y, size, font: boldF, color: accent });
    }
  });
  return doc.save();
}

/** Escort / place cards: Avery-style 10-up sheet (2 × 5 cards, 3.5 × 2 in) on US Letter. */
export async function escortCards(chart: Chart, design = 0): Promise<Uint8Array> {
  const { doc, titleF, bodyF, ink, accent, paper } = await setup(design);
  const tn = new Map(chart.tables.map((t) => [t.id, t.name]));
  const guests = [...chart.guests].sort((a, b) => sortName(a.name).localeCompare(sortName(b.name)));
  const cw = 3.5 * 72, ch = 2 * 72, left = 0.75 * 72, top = 0.5 * 72;
  let page: PDFPage | null = null;
  guests.forEach((g, i) => {
    if (i % 10 === 0) page = doc.addPage([612, 792]);
    const k = i % 10, x = left + (k % 2) * cw, y = 792 - top - (Math.floor(k / 2) + 1) * ch;
    const p = page!;
    p.drawRectangle({ x: x + 4, y: y + 4, width: cw - 8, height: ch - 8, color: paper, borderColor: accent, borderWidth: 0.75 });
    const nm = pdfSafe(g.name);
    let s = 18; while (s > 8 && titleF.widthOfTextAtSize(nm, s) > cw - 30) s -= 0.5;
    p.drawText(nm, { x: x + (cw - titleF.widthOfTextAtSize(nm, s)) / 2, y: y + ch * 0.55, size: s, font: titleF, color: ink });
    const tl = pdfSafe(tn.get(chart.seat[g.id]) ?? '');
    p.drawText(tl, { x: x + (cw - bodyF.widthOfTextAtSize(tl, 12)) / 2, y: y + ch * 0.3, size: 12, font: bodyF, color: accent });
    if (g.meal) { const m = pdfSafe(g.meal); p.drawText(m, { x: x + (cw - bodyF.widthOfTextAtSize(m, 8)) / 2, y: y + ch * 0.15, size: 8, font: bodyF, color: ink }); }
  });
  if (!guests.length) doc.addPage([612, 792]);
  return doc.save();
}

/** Table number cards: one 5 × 7 in tent per half-letter, two per landscape Letter page. */
export async function tableNumbers(chart: Chart, design = 0): Promise<Uint8Array> {
  const { doc, titleF, bodyF, ink, accent, paper } = await setup(design);
  chart.tables.forEach((t, i) => {
    const page = i % 2 === 0 ? doc.addPage([792, 612]) : doc.getPages()[doc.getPageCount() - 1];
    const x0 = (i % 2) * 396;
    page.drawRectangle({ x: x0 + 18, y: 18, width: 360, height: 576, color: paper, borderColor: accent, borderWidth: 1.5 });
    const label = pdfSafe(t.name);
    const num = label.match(/(\d+)\s*$/)?.[1];
    const big = num ?? label;
    let s = num ? 220 : 64; while (s > 12 && titleF.widthOfTextAtSize(big, s) > 320) s -= 1;
    page.drawText(big, { x: x0 + 198 - titleF.widthOfTextAtSize(big, s) / 2, y: 306 - s * 0.35, size: s, font: titleF, color: ink });
    if (num) { const w = label.replace(/\s*\d+\s*$/, '') || 'Table'; page.drawText(w, { x: x0 + 198 - bodyF.widthOfTextAtSize(w, 28) / 2, y: 470, size: 28, font: bodyF, color: accent }); }
  });
  if (!chart.tables.length) doc.addPage([792, 612]);
  return doc.save();
}

/** Caterer sheet: guests and meals by table, with per-table and overall meal totals. */
export async function catererSheet(chart: Chart): Promise<Uint8Array> {
  const { doc, bodyF, boldF } = await setup(1);
  const lines: { t: string; b?: boolean }[] = [];
  const total = new Map<string, number>();
  for (const t of chart.tables) {
    const gs = guestsAt(chart, t.id);
    const counts = new Map<string, number>();
    gs.forEach((g) => { const m = g.meal || 'No choice'; counts.set(m, (counts.get(m) ?? 0) + 1); total.set(m, (total.get(m) ?? 0) + 1); });
    lines.push({ t: `${t.name}  (${gs.length} guests)  ${[...counts].map(([m, n]) => `${m}: ${n}`).join(', ')}`, b: true });
    gs.forEach((g) => lines.push({ t: `    ${g.name}${g.meal ? '  -  ' + g.meal : ''}${g.notes ? '  (' + g.notes + ')' : ''}` }));
  }
  const header = [`Caterer sheet: ${chart.title || 'Seating chart'}`, `Total seated: ${[...total.values()].reduce((a, b) => a + b, 0)}`, 'Meal totals: ' + ([...total].map(([m, n]) => `${m} ${n}`).join(', ') || 'none')];
  let page = doc.addPage([612, 792]); let y = 750;
  header.forEach((h, i) => { page.drawText(pdfSafe(h).slice(0, 95), { x: 40, y, size: i ? 11 : 16, font: boldF }); y -= i ? 16 : 24; });
  y -= 8;
  for (const l of lines) {
    if (y < 40) { page = doc.addPage([612, 792]); y = 750; }
    page.drawText(pdfSafe(l.t).slice(0, 100), { x: 40, y, size: 10, font: l.b ? boldF : bodyF }); y -= 14;
  }
  return doc.save();
}

/** Teacher Pack: name tents, one per Letter page, fold along the middle (top half printed upside down). */
export async function nameTents(chart: Chart, design = 1): Promise<Uint8Array> {
  const { lib, doc, titleF, ink, accent } = await setup(design);
  for (const g of chart.guests) {
    const p = doc.addPage([792, 612]);
    p.drawLine({ start: { x: 20, y: 306 }, end: { x: 772, y: 306 }, thickness: 0.5, color: accent, dashArray: [6, 6] });
    const nm = pdfSafe(g.name);
    let s = 110; while (s > 14 && titleF.widthOfTextAtSize(nm, s) > 700) s -= 1;
    const w = titleF.widthOfTextAtSize(nm, s);
    p.drawText(nm, { x: 396 - w / 2, y: 306 - 153 - s * 0.35, size: s, font: titleF, color: ink });
    p.drawText(nm, { x: 396 + w / 2, y: 306 + 153 + s * 0.35, size: s, font: titleF, color: ink, rotate: lib.degrees(180) });
  }
  if (!chart.guests.length) doc.addPage([792, 612]);
  return doc.save();
}

/** Teacher Pack: substitute plan with the seating chart and a notes column for each student. */
export async function subPlan(chart: Chart): Promise<Uint8Array> {
  const { lib, doc, bodyF, boldF } = await setup(1);
  const W = 792, H = 612, M = 36;
  const p = doc.addPage([W, H]);
  p.drawText(pdfSafe(`Substitute plan: ${chart.title || 'Class'}`), { x: M, y: H - M - 10, size: 18, font: boldF });
  p.drawText('Front of room / board', { x: W / 2 - 50, y: H - M - 30, size: 9, font: bodyF });
  const room = roomSize(chart.tables);
  const scale = Math.min((W - 2 * M) / room.w, (H - 2 * M - 60) / room.h, 1);
  const top = H - M - 40;
  for (const t of chart.tables) {
    const b = tableBox(t);
    const x = M + t.x * scale, y = top - (t.y + b.h) * scale;
    p.drawRectangle({ x, y, width: b.w * scale, height: b.h * scale, borderColor: lib.rgb(0.3, 0.3, 0.3), borderWidth: 0.8 });
    const fs = Math.max(5, Math.min(10, 11 * scale));
    guestsAt(chart, t.id).forEach((g, i) => p.drawText(pdfSafe(g.name).slice(0, 22), { x: x + 4, y: y + b.h * scale - (i + 1) * (fs + 3) - 2, size: fs, font: bodyF }));
  }
  let page = doc.addPage([612, 792]); let y = 740;
  page.drawText('Student notes for the substitute', { x: M, y, size: 16, font: boldF }); y -= 28;
  for (const g of [...chart.guests].sort((a, b) => sortName(a.name).localeCompare(sortName(b.name)))) {
    if (y < 50) { page = doc.addPage([612, 792]); y = 750; }
    page.drawText(pdfSafe(g.name).slice(0, 30), { x: M, y, size: 11, font: boldF });
    page.drawText(pdfSafe(g.notes || '').slice(0, 60), { x: 220, y, size: 10, font: bodyF });
    page.drawLine({ start: { x: M, y: y - 6 }, end: { x: 576, y: y - 6 }, thickness: 0.3, color: lib.rgb(0.7, 0.7, 0.7) });
    y -= 24;
  }
  return doc.save();
}

export type { PDFDoc };
