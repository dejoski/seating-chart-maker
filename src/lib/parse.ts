import { Guest, uid } from './model';

/** Minimal RFC-4180-ish CSV/TSV parser (handles quotes, escaped quotes, CRLF). */
export function parseDelimited(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = firstLine.includes('\t') ? '\t' : firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"' && cell.trim() === '') { q = true; cell = ''; }
    else if (c === delim) { row.push(cell.trim()); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

const HEADER_ALIASES: Record<string, keyof Pick<Guest, 'name' | 'group' | 'meal' | 'notes'> | 'first' | 'last'> = {
  name: 'name', guest: 'name', 'guest name': 'name', 'full name': 'name', student: 'name', 'student name': 'name',
  first: 'first', 'first name': 'first', firstname: 'first', last: 'last', 'last name': 'last', lastname: 'last', surname: 'last',
  group: 'group', party: 'group', side: 'group', household: 'group', category: 'group', class: 'group',
  meal: 'meal', entree: 'meal', 'entrée': 'meal', menu: 'meal', 'meal choice': 'meal', diet: 'meal',
  notes: 'notes', note: 'notes', comments: 'notes', allergies: 'notes',
};

/**
 * Split one name cell into linked people:
 *  "Alex & Sam Lee" -> Alex Lee, Sam Lee ; "Jo Park + Guest" / "Jo Park +1" -> Jo Park, Guest of Jo Park
 */
export function splitLinkedNames(raw: string): string[] {
  let s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return [];
  let plusOnes = 0;
  s = s.replace(/\s*\+\s*(\d+)\s*$/, (_, n) => { plusOnes = Math.min(9, Number(n)); return ''; });
  s = s.replace(/\s*(\+|&|and)\s*(guest|plus one|plus-one)\s*$/i, () => { plusOnes += 1; return ''; });
  const parts = s.split(/\s*(?:&|\+)\s*/).filter(Boolean);
  let names = parts;
  if (parts.length === 2 && !parts[0].includes(' ') && parts[1].includes(' ')) {
    // "Alex & Sam Lee" -> share the last name
    const last = parts[1].split(' ').slice(-1)[0];
    names = [parts[0] + ' ' + last, parts[1]];
  }
  const primary = names[0] ?? s;
  for (let i = 0; i < plusOnes; i++) names.push(plusOnes === 1 ? `Guest of ${primary}` : `Guest ${i + 1} of ${primary}`);
  return names.map((n) => n.slice(0, 80));
}

/** Parse pasted text or a CSV file into guests. Accepts one name per line or columns with a header row. */
export function parseGuests(text: string): Guest[] {
  const rows = parseDelimited(text.replace(/^\uFEFF/, ''));
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.toLowerCase().trim());
  const map = head.map((h) => HEADER_ALIASES[h]);
  const hasHeader = map.some((m) => m === 'name' || m === 'first' || m === 'last');
  const body = hasHeader ? rows.slice(1) : rows;
  const col = (k: string) => (hasHeader ? map.indexOf(k as never) : ({ name: 0, group: 1, meal: 2, notes: 3 } as Record<string, number>)[k] ?? -1);
  const iName = col('name'), iFirst = col('first'), iLast = col('last'), iGroup = col('group'), iMeal = col('meal'), iNotes = col('notes');
  const out: Guest[] = [];
  for (const r of body) {
    const get = (i: number) => (i >= 0 && i < r.length ? r[i].trim() : '');
    let name = get(iName);
    if (!name && (iFirst >= 0 || iLast >= 0)) name = `${get(iFirst)} ${get(iLast)}`.trim();
    // Skip markdown-ish bullets and numbering from pasted lists
    name = name.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '');
    const people = splitLinkedNames(name);
    if (!people.length) continue;
    const party = people.length > 1 ? uid('p') : '';
    for (const p of people) out.push({ id: uid('g'), name: p, group: get(iGroup).slice(0, 60), meal: get(iMeal).slice(0, 60), notes: get(iNotes).slice(0, 300), party });
  }
  return out;
}

export const CSV_TEMPLATE = 'Name,Group,Meal,Notes\r\nAlex & Sam Lee,Bride family,Chicken,\r\nJordan Park +1,College friends,Fish,Needs aisle seat\r\nTaylor Reed,Work,Vegetarian,Nut allergy\r\n';
