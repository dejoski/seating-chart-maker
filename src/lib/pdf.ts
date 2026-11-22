import type { Chart } from './model';
import { guestsAt, unseated } from './model';
import { tableBox, roomSize } from './layouts';
import { pdfSafe, sortName } from './text';

export const FOOTER = 'Made with the free Seating Chart Maker';

/** Free export: floor plan + by-table list + A–Z "find your seat" list. Letter size. */
export async function chartPdf(chart: Chart, opts: { footer?: boolean } = {}): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(chart.title || 'Seating chart'));
  doc.setProducer('Seating Chart Maker');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const footer = opts.footer !== false;
  const title = pdfSafe(chart.title || 'Seating chart');
  const W = 792, H = 612, M = 36; // landscape letter

  // Page 1: floor plan scaled to fit
  const p1 = doc.addPage([W, H]);
  p1.drawText(title, { x: M, y: H - M - 6, size: 18, font: bold });
  const room = roomSize(chart.tables);
  const scale = Math.min((W - 2 * M) / room.w, (H - 2 * M - 50) / room.h, 1);
  const top = H - M - 30;
  for (const t of chart.tables) {
    const b = tableBox(t);
    const x = M + t.x * scale, y = top - (t.y + b.h) * scale, w = b.w * scale, h = b.h * scale;
    if (t.shape === 'round') p1.drawEllipse({ x: x + w / 2, y: y + h / 2, xScale: w / 2, yScale: h / 2, borderColor: rgb(0.3, 0.3, 0.35), borderWidth: 1 });
    else p1.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0.3, 0.3, 0.35), borderWidth: 1 });
    const fs = Math.max(4, Math.min(9, 10 * scale));
    p1.drawText(pdfSafe(t.name), { x: x + 4, y: y + h - fs - 3, size: fs, font: bold });
    guestsAt(chart, t.id).forEach((g, i) => {
      const ly = y + h - (i + 2) * (fs + 2) - 3;
      if (ly > y) p1.drawText(pdfSafe(g.name).slice(0, 28), { x: x + 4, y: ly, size: fs * 0.9, font });
    });
  }
  const pages = [p1];

  // List pages
  const lines: { text: string; bold?: boolean }[] = [];
  for (const t of chart.tables) {
    const gs = guestsAt(chart, t.id);
    lines.push({ text: `${t.name} (${gs.length}/${t.seats})`, bold: true });
    for (const g of gs) lines.push({ text: '   ' + g.name + (g.meal ? ' - ' + g.meal : '') });
  }
  const un = unseated(chart);
  if (un.length) { lines.push({ text: 'Not seated yet', bold: true }); un.forEach((g) => lines.push({ text: '   ' + g.name })); }
  lines.push({ text: '' }, { text: 'Find your seat (A-Z)', bold: true });
  const tn = new Map(chart.tables.map((t) => [t.id, t.name]));
  [...chart.guests].sort((a, b) => sortName(a.name).localeCompare(sortName(b.name))).forEach((g) => lines.push({ text: `   ${g.name} ... ${tn.get(chart.seat[g.id]) ?? '-'}` }));
  const PW = 612, PH = 792, lh = 14, colW = (PW - 2 * M) / 2;
  let page = doc.addPage([PW, PH]); pages.push(page);
  let col = 0, y = PH - M - 10;
  for (const l of lines) {
    if (y < M + 24) {
      if (col === 0) { col = 1; y = PH - M - 10; } else { page = doc.addPage([PW, PH]); pages.push(page); col = 0; y = PH - M - 10; }
    }
    if (l.text) page.drawText(pdfSafe(l.text).slice(0, 48), { x: M + col * colW, y, size: 10, font: l.bold ? bold : font });
    y -= lh;
  }
  if (footer) for (const p of pages) p.drawText(FOOTER, { x: M, y: 16, size: 8, font, color: rgb(0.45, 0.45, 0.5) });
  return doc.save();
}
