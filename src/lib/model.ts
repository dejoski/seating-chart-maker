export type Mode = 'wedding' | 'classroom' | 'event';
export type Shape = 'round' | 'rect' | 'head' | 'sweetheart' | 'desk';
export type RuleType = 'together' | 'apart';

export interface Guest {
  id: string;
  name: string;
  /** Loose grouping, e.g. "College friends". Used as a soft preference. */
  group: string;
  meal: string;
  notes: string;
  /** Household / couple / plus-one link. Guests sharing a party always sit together. */
  party: string;
}

export interface Table {
  id: string;
  name: string;
  shape: Shape;
  seats: number;
  x: number;
  y: number;
}

export interface Rule {
  id: string;
  type: RuleType;
  a: string;
  b: string;
}

export interface Chart {
  v: 1;
  mode: Mode;
  title: string;
  guests: Guest[];
  tables: Table[];
  rules: Rule[];
  /** guestId -> tableId */
  seat: Record<string, string>;
  /** guest ids whose seat auto-arrange must not move */
  locked: string[];
}

let counter = 0;
export function uid(prefix = 'x'): string {
  counter = (counter + 1) % 1e6;
  return prefix + Date.now().toString(36) + counter.toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

export const MIN_SEATS = 1;
export const MAX_SEATS = 20;

export function clampSeats(n: number): number {
  if (!Number.isFinite(n)) return 8;
  return Math.max(MIN_SEATS, Math.min(MAX_SEATS, Math.round(n)));
}

export function emptyChart(mode: Mode = 'wedding'): Chart {
  return { v: 1, mode, title: '', guests: [], tables: [], rules: [], seat: {}, locked: [] };
}

export function guestsAt(chart: Chart, tableId: string): Guest[] {
  return chart.guests.filter((g) => chart.seat[g.id] === tableId);
}

export function unseated(chart: Chart): Guest[] {
  const ids = new Set(chart.tables.map((t) => t.id));
  return chart.guests.filter((g) => !ids.has(chart.seat[g.id]));
}

export function totalSeats(chart: Chart): number {
  return chart.tables.reduce((s, t) => s + t.seats, 0);
}

/** Sanity-repair anything loaded from storage or a backup file. */
export function normalizeChart(raw: unknown): Chart {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Chart>;
  const mode: Mode = r.mode === 'classroom' || r.mode === 'event' ? r.mode : 'wedding';
  const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.slice(0, max) : '');
  const guests: Guest[] = Array.isArray(r.guests)
    ? r.guests
        .filter((g) => g && typeof g === 'object' && typeof g.id === 'string' && str(g.name).trim())
        .map((g) => ({ id: g.id, name: str(g.name).trim(), group: str(g.group), meal: str(g.meal), notes: str(g.notes, 300), party: str(g.party) }))
    : [];
  const shapes: Shape[] = ['round', 'rect', 'head', 'sweetheart', 'desk'];
  const tables: Table[] = Array.isArray(r.tables)
    ? r.tables
        .filter((t) => t && typeof t === 'object' && typeof t.id === 'string')
        .map((t, i) => ({
          id: t.id,
          name: str(t.name, 60) || `Table ${i + 1}`,
          shape: shapes.includes(t.shape as Shape) ? (t.shape as Shape) : 'round',
          seats: clampSeats(Number(t.seats)),
          x: Number.isFinite(t.x) ? Math.max(0, Number(t.x)) : 0,
          y: Number.isFinite(t.y) ? Math.max(0, Number(t.y)) : 0,
        }))
    : [];
  const gids = new Set(guests.map((g) => g.id));
  const tids = new Set(tables.map((t) => t.id));
  const rules: Rule[] = Array.isArray(r.rules)
    ? r.rules.filter((x) => x && (x.type === 'together' || x.type === 'apart') && gids.has(x.a) && gids.has(x.b) && x.a !== x.b)
        .map((x) => ({ id: String(x.id || uid('r')), type: x.type, a: x.a, b: x.b }))
    : [];
  const seat: Record<string, string> = {};
  if (r.seat && typeof r.seat === 'object') {
    for (const [g, t] of Object.entries(r.seat)) if (gids.has(g) && tids.has(t as string)) seat[g] = t as string;
  }
  const locked = Array.isArray(r.locked) ? r.locked.filter((g) => typeof g === 'string' && seat[g]) : [];
  return { v: 1, mode, title: str(r.title, 80), guests, tables, rules, seat, locked };
}
