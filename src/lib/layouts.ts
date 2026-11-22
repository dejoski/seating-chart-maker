import { Shape, Table, clampSeats, uid } from './model';

export const GAP = 30;
export const ORIGIN = 20;

export function tableBox(t: Pick<Table, 'shape' | 'seats'>): { w: number; h: number } {
  const twoCol = (t.shape === 'rect' && t.seats > 8) || t.shape === 'head';
  switch (t.shape) {
    case 'desk':
      return { w: t.seats > 1 ? 150 : 112, h: 34 + Math.max(1, t.seats) * 22 };
    case 'head':
      return { w: 340, h: 44 + Math.ceil(t.seats / 2) * 22 };
    case 'sweetheart':
      return { w: 160, h: 44 + t.seats * 22 };
    default:
      return { w: twoCol ? 300 : 176, h: 44 + (twoCol ? Math.ceil(t.seats / 2) : t.seats) * 22 };
  }
}

export interface GridOpts { shape: Shape; seats: number; cols?: number; prefix?: string; startY?: number; startIndex?: number }

export function gridTables(n: number, o: GridOpts): Table[] {
  const seats = clampSeats(o.seats);
  const box = tableBox({ shape: o.shape, seats });
  const cols = o.cols ?? Math.max(1, Math.min(6, Math.ceil(Math.sqrt(n * 1.6))));
  const out: Table[] = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    out.push({
      id: uid('t'),
      name: `${o.prefix ?? 'Table'} ${(o.startIndex ?? 1) + i}`,
      shape: o.shape,
      seats,
      x: ORIGIN + c * (box.w + GAP),
      y: (o.startY ?? ORIGIN) + r * (box.h + GAP),
    });
  }
  return out;
}

export function weddingLayout(guestCount: number, seats = 8, opts: { head?: 'head' | 'sweetheart' | 'none'; headSeats?: number } = {}): Table[] {
  const head = opts.head ?? 'sweetheart';
  const tables: Table[] = [];
  let y = ORIGIN;
  let remaining = guestCount;
  if (head !== 'none') {
    const hs = head === 'sweetheart' ? 2 : clampSeats(opts.headSeats ?? 10);
    tables.push({ id: uid('t'), name: head === 'sweetheart' ? 'Sweetheart table' : 'Head table', shape: head, seats: hs, x: ORIGIN, y });
    y += tableBox({ shape: head, seats: hs }).h + GAP;
    remaining = Math.max(0, remaining - hs);
  }
  const n = Math.max(1, Math.ceil(remaining / clampSeats(seats)));
  return tables.concat(gridTables(n, { shape: 'round', seats, startY: y }));
}

export function eventLayout(guestCount: number, seats = 8, shape: Shape = 'rect'): Table[] {
  const n = Math.max(1, Math.ceil(guestCount / clampSeats(seats)));
  return gridTables(n, { shape, seats });
}

export type ClassroomKind = 'rows' | 'pairs' | 'pods' | 'ushape';

export function classroomLayout(kind: ClassroomKind, students: number): Table[] {
  const n = Math.max(1, students);
  if (kind === 'rows') return gridTables(n, { shape: 'desk', seats: 1, cols: Math.min(6, Math.ceil(Math.sqrt(n * 1.5))), prefix: 'Desk' });
  if (kind === 'pairs') return gridTables(Math.ceil(n / 2), { shape: 'desk', seats: 2, cols: 4, prefix: 'Desk' });
  if (kind === 'pods') return gridTables(Math.ceil(n / 4), { shape: 'rect', seats: 4, cols: 3, prefix: 'Group' });
  // U-shape: left column, back row, right column (open end faces the front/board)
  const box = tableBox({ shape: 'desk', seats: 1 });
  const back = Math.max(1, Math.round(n / 3));
  const left = Math.ceil((n - back) / 2);
  const right = n - back - left;
  const out: Table[] = [];
  const mk = (x: number, y: number) => out.push({ id: uid('t'), name: `Desk ${out.length + 1}`, shape: 'desk', seats: 1, x, y });
  const stepY = box.h + GAP, stepX = box.w + GAP;
  const width = Math.max(back + 1, 3) * stepX;
  for (let i = 0; i < left; i++) mk(ORIGIN, ORIGIN + i * stepY);
  const backY = ORIGIN + Math.max(left, right) * stepY;
  for (let i = 0; i < back; i++) mk(ORIGIN + (i + 0.5) * stepX + (width - (back + 1) * stepX) / 2, backY);
  for (let i = right - 1; i >= 0; i--) mk(ORIGIN + width, ORIGIN + i * stepY);
  return out;
}

/** Next free spot below everything else, for "add table". */
export function nextSpot(tables: Table[], shape: Shape, seats: number): { x: number; y: number } {
  if (!tables.length) return { x: ORIGIN, y: ORIGIN };
  const box = tableBox({ shape, seats });
  const maxX = Math.max(...tables.map((t) => t.x + tableBox(t).w));
  const lastRowY = Math.max(...tables.map((t) => t.y));
  const rowTables = tables.filter((t) => t.y === lastRowY);
  const rowRight = Math.max(...rowTables.map((t) => t.x + tableBox(t).w));
  if (rowRight + GAP + box.w <= Math.max(maxX, 1100)) return { x: rowRight + GAP, y: lastRowY };
  const bottom = Math.max(...tables.map((t) => t.y + tableBox(t).h));
  return { x: ORIGIN, y: bottom + GAP };
}

export function roomSize(tables: Table[]): { w: number; h: number } {
  let w = 400, h = 300;
  for (const t of tables) {
    const b = tableBox(t);
    w = Math.max(w, t.x + b.w + ORIGIN);
    h = Math.max(h, t.y + b.h + ORIGIN);
  }
  return { w, h };
}
