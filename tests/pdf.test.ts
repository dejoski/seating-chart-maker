import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { chartPdf } from '../src/lib/pdf';
import { seatingSign, escortCards, tableNumbers, catererSheet, nameTents, subPlan, DESIGNS } from '../src/lib/printkit';
import { arrange } from '../src/lib/arrange';
import { parseGuests } from '../src/lib/parse';
import { weddingLayout } from '../src/lib/layouts';
import { emptyChart } from '../src/lib/model';

function sample(n = 60) {
  const c = emptyChart('wedding');
  c.title = 'Lee – Park wedding';
  c.guests = parseGuests(Array.from({ length: n }, (_, i) => `Guest Number${i} Ñandú,G${i % 5},${i % 2 ? 'Fish' : 'Chicken'}`).join('\n'));
  c.tables = weddingLayout(n, 8);
  c.seat = arrange(c).seat;
  return c;
}
const load = (b: Uint8Array) => PDFDocument.load(b);

describe('pdf exports', () => {
  it('free chart PDF has floor plan + list pages', async () => {
    expect((await load(await chartPdf(sample()))).getPageCount()).toBeGreaterThanOrEqual(2);
  });
  it('seating sign at every size and design is one page of the right size', async () => {
    for (const [size, [w, h]] of [['24x36', [24, 36]], ['18x24', [18, 24]], ['11x17', [11, 17]]] as const) {
      for (let design = 0; design < DESIGNS.length; design++) {
        const d = await load(await seatingSign(sample(150), { size, design, order: design % 2 ? 'table' : 'alpha' }));
        expect(d.getPageCount()).toBe(1);
        const p = d.getPage(0).getSize();
        expect([Math.round(p.width), Math.round(p.height)]).toEqual([w * 72, h * 72]);
      }
    }
  });
  it('escort cards: 10 per Letter sheet', async () => {
    expect((await load(await escortCards(sample(25)))).getPageCount()).toBe(3);
  });
  it('table numbers: two per page', async () => {
    const c = sample(40);
    expect((await load(await tableNumbers(c))).getPageCount()).toBe(Math.ceil(c.tables.length / 2));
  });
  it('caterer sheet, name tents and sub plan build', async () => {
    const c = sample(30);
    expect((await load(await catererSheet(c))).getPageCount()).toBeGreaterThanOrEqual(1);
    expect((await load(await nameTents(c))).getPageCount()).toBe(30);
    expect((await load(await subPlan(c))).getPageCount()).toBeGreaterThanOrEqual(2);
  });
  it('empty chart still produces valid PDFs', async () => {
    const c = emptyChart('event');
    for (const f of [chartPdf(c), escortCards(c), tableNumbers(c), catererSheet(c), nameTents(c), subPlan(c), seatingSign(c, { size: '18x24', design: 0, order: 'alpha' })]) {
      expect((await load(await f)).getPageCount()).toBeGreaterThanOrEqual(1);
    }
  });
});
