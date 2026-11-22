import { describe, it, expect } from 'vitest';
import { parseGuests, parseDelimited, splitLinkedNames, CSV_TEMPLATE } from '../src/lib/parse';
import { pdfSafe, toCsv, escapeHtml } from '../src/lib/text';
import { normalizeChart } from '../src/lib/model';
import { classroomLayout, weddingLayout, tableBox } from '../src/lib/layouts';

describe('parse', () => {
  it('one name per line, with bullets and blanks', () => {
    expect(parseGuests('- Ann\n\n2. Bob\n• Cy').map((g) => g.name)).toEqual(['Ann', 'Bob', 'Cy']);
  });
  it('links couples and plus-ones', () => {
    expect(splitLinkedNames('Alex & Sam Lee')).toEqual(['Alex Lee', 'Sam Lee']);
    expect(splitLinkedNames('Jo Park +1')).toEqual(['Jo Park', 'Guest of Jo Park']);
    expect(splitLinkedNames('Jo Park & Guest')).toEqual(['Jo Park', 'Guest of Jo Park']);
    const gs = parseGuests('Alex & Sam Lee');
    expect(gs[0].party).toBeTruthy(); expect(gs[0].party).toBe(gs[1].party);
  });
  it('reads CSV with headers, quotes and first/last columns', () => {
    const gs = parseGuests('First Name,Last Name,Meal\n"Mary ""May""",O\'Neil,Fish\nTom,Hu,');
    expect(gs.map((g) => g.name)).toEqual(['Mary "May" O\'Neil', 'Tom Hu']);
    expect(gs[0].meal).toBe('Fish');
  });
  it('reads tab-separated spreadsheet pastes and the template', () => {
    expect(parseDelimited('a\tb\nc\td')).toEqual([['a', 'b'], ['c', 'd']]);
    const gs = parseGuests(CSV_TEMPLATE);
    expect(gs.length).toBe(5);
    expect(gs.find((g) => g.name === 'Taylor Reed')!.notes).toBe('Nut allergy');
  });
});

describe('text + model', () => {
  it('pdfSafe keeps Latin-1 and replaces the rest', () => {
    expect(pdfSafe('José Łukasz 李')).toBe('José Lukasz ?');
  });
  it('csv cells escape quotes and formula injection', () => {
    expect(toCsv([['=SUM(A1)', 'a,"b"']])).toBe('\'=SUM(A1),"a,""b"""\r\n');
  });
  it('escapes html', () => { expect(escapeHtml('<b x="1">&')).toBe('&lt;b x=&quot;1&quot;&gt;&amp;'); });
  it('normalizeChart drops junk and dangling references', () => {
    const c = normalizeChart({ mode: 'nope', guests: [{ id: 'a', name: 'A' }, { id: 'b', name: '' }], tables: [{ id: 't', seats: 99 }], seat: { a: 't', b: 't', z: 't' }, rules: [{ type: 'apart', a: 'a', b: 'zz' }], locked: ['a', 'q'] });
    expect(c.mode).toBe('wedding'); expect(c.guests).toHaveLength(1); expect(c.tables[0].seats).toBe(20);
    expect(c.seat).toEqual({ a: 't' }); expect(c.rules).toEqual([]); expect(c.locked).toEqual(['a']);
  });
  it('layouts produce enough seats without overlapping', () => {
    for (const k of ['rows', 'pairs', 'pods', 'ushape'] as const) {
      const ts = classroomLayout(k, 25);
      expect(ts.reduce((s, x) => s + x.seats, 0)).toBeGreaterThanOrEqual(25);
      for (const a of ts) for (const b of ts) if (a !== b) {
        const A = tableBox(a), B = tableBox(b);
        expect(a.x < b.x + B.w && b.x < a.x + A.w && a.y < b.y + B.h && b.y < a.y + A.h).toBe(false);
      }
    }
    expect(weddingLayout(100, 8).reduce((s, x) => s + x.seats, 0)).toBeGreaterThanOrEqual(100);
  });
});
