import { Chart, Table } from './model';
import { tableBox } from './layouts';

export interface ArrangeOptions {
  /** Deterministic seed. Different seeds give different valid charts. */
  seed?: number;
  /** Random order instead of "biggest party first" (classroom shuffle). */
  shuffle?: boolean;
  /** Keep-apart also means "not at a neighbouring table/desk" within this many px (centre to centre). 0 = same table only. */
  apartRadius?: number;
  /** How many randomized attempts to try; the best one wins. */
  attempts?: number;
}

export interface ArrangeResult {
  seat: Record<string, string>;
  unseated: string[];
  warnings: string[];
  /** Number of rule violations in the chosen result (0 = every rule satisfied). */
  violations: number;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], r: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

class DSU {
  p = new Map<string, string>();
  find(x: string): string {
    if (!this.p.has(x)) this.p.set(x, x);
    let r = x;
    while (this.p.get(r) !== r) r = this.p.get(r)!;
    let c = x;
    while (this.p.get(c) !== r) { const n = this.p.get(c)!; this.p.set(c, r); c = n; }
    return r;
  }
  union(a: string, b: string) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p.set(ra, rb); }
}

export function centre(t: Table): { x: number; y: number } {
  const b = tableBox(t);
  return { x: t.x + b.w / 2, y: t.y + b.h / 2 };
}

/** Table ids that count as "too close" for keep-apart (always includes itself). */
export function neighbourMap(tables: Table[], radius: number): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const a of tables) {
    const s = new Set([a.id]);
    if (radius > 0) {
      const ca = centre(a);
      for (const b of tables) {
        if (a === b) continue;
        const cb = centre(b);
        if (Math.hypot(ca.x - cb.x, ca.y - cb.y) <= radius) s.add(b.id);
      }
    }
    m.set(a.id, s);
  }
  return m;
}

/** Linked clusters: same party (couples, plus-ones) and keep-together rules. */
export function clusters(chart: Chart): string[][] {
  const d = new DSU();
  for (const g of chart.guests) d.find(g.id);
  const byParty = new Map<string, string>();
  for (const g of chart.guests) {
    if (!g.party) continue;
    const first = byParty.get(g.party);
    if (first) d.union(first, g.id); else byParty.set(g.party, g.id);
  }
  for (const r of chart.rules) if (r.type === 'together') d.union(r.a, r.b);
  const groups = new Map<string, string[]>();
  for (const g of chart.guests) {
    const k = d.find(g.id);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(g.id);
  }
  return [...groups.values()];
}

export function arrange(chart: Chart, opts: ArrangeOptions = {}): ArrangeResult {
  const r0 = rng(opts.seed ?? 1);
  const attempts = Math.max(1, opts.attempts ?? 60);
  const tables = chart.tables;
  const name = new Map(chart.guests.map((g) => [g.id, g.name]));
  const group = new Map(chart.guests.map((g) => [g.id, g.group.trim().toLowerCase()]));
  const warnings: string[] = [];
  if (!tables.length) {
    return { seat: {}, unseated: chart.guests.map((g) => g.id), warnings: ['Add at least one table first.'], violations: 0 };
  }
  const tableIds = new Set(tables.map((t) => t.id));
  const cap = new Map(tables.map((t) => [t.id, t.seats]));
  const near = neighbourMap(tables, opts.apartRadius ?? 0);
  const maxSeats = Math.max(...tables.map((t) => t.seats));

  // apart adjacency
  const apart = new Map<string, Set<string>>();
  for (const r of chart.rules) {
    if (r.type !== 'apart') continue;
    if (!apart.has(r.a)) apart.set(r.a, new Set());
    if (!apart.has(r.b)) apart.set(r.b, new Set());
    apart.get(r.a)!.add(r.b); apart.get(r.b)!.add(r.a);
  }

  // locked guests stay where they are
  const lockedSeat = new Map<string, string>();
  for (const id of chart.locked) {
    const t = chart.seat[id];
    if (t && tableIds.has(t)) lockedSeat.set(id, t);
  }

  // build clusters; split ones that cannot physically fit or contradict locks
  let cl = clusters(chart);
  const units: { ids: string[]; fixed?: string }[] = [];
  for (const c of cl) {
    const inner = c.filter((a) => c.some((b) => apart.get(a)?.has(b)));
    if (inner.length) warnings.push(`Contradiction: ${inner.slice(0, 2).map((i) => name.get(i)).join(' and ')} are linked (couple/party or keep-together) but also marked keep-apart.`);
    const lockTables = [...new Set(c.filter((id) => lockedSeat.has(id)).map((id) => lockedSeat.get(id)!))];
    if (lockTables.length > 1) {
      warnings.push(`${c.filter((id) => lockedSeat.has(id)).map((i) => name.get(i)).join(', ')} are linked but locked at different tables; they stay where they are locked.`);
      for (const id of c) units.push({ ids: [id], fixed: lockedSeat.get(id) });
      continue;
    }
    const fixed = lockTables[0];
    const limit = fixed ? cap.get(fixed)! : maxSeats;
    if (c.length > limit) {
      warnings.push(`A linked group of ${c.length} (${name.get(c[0])}, …) is bigger than ${fixed ? 'its locked table' : 'the largest table'} (${limit} seats), so it was split.`);
      for (let i = 0; i < c.length; i += limit) {
        const chunk = c.slice(i, i + limit);
        units.push({ ids: chunk, fixed: chunk.some((id) => lockedSeat.has(id)) ? fixed : undefined });
      }
      continue;
    }
    units.push({ ids: c, fixed });
  }
  cl = units.map((u) => u.ids);

  const degree = (u: { ids: string[] }) => u.ids.reduce((s, id) => s + (apart.get(id)?.size ?? 0), 0);

  const attempt = (r: () => number, order: { ids: string[]; fixed?: string }[]) => {
    const seat: Record<string, string> = {};
    const used = new Map(tables.map((t) => [t.id, 0]));
    const at = new Map(tables.map((t) => [t.id, [] as string[]]));
    const unseatedIds: string[] = [];
    let violations = 0;
    const put = (ids: string[], t: string) => {
      for (const id of ids) { seat[id] = t; at.get(t)!.push(id); }
      used.set(t, used.get(t)! + ids.length);
    };
    const clashes = (ids: string[], t: string) => {
      let n = 0;
      for (const nt of near.get(t)!) for (const other of at.get(nt)!) for (const id of ids) if (apart.get(id)?.has(other)) n++;
      return n;
    };
    for (const u of order) if (u.fixed) {
      put(u.ids, u.fixed);
      if (used.get(u.fixed)! > cap.get(u.fixed)!) violations++;
    }
    for (const u of order) {
      if (u.fixed) continue;
      const size = u.ids.length;
      const fits = tables.filter((t) => cap.get(t.id)! - used.get(t.id)! >= size);
      if (!fits.length) {
        // not enough contiguous room: try to seat members individually anywhere with space
        for (const id of u.ids) {
          const any = tables.filter((t) => cap.get(t.id)! - used.get(t.id)! >= 1);
          if (!any.length) { unseatedIds.push(id); continue; }
          any.sort((a, b) => clashes([id], a.id) - clashes([id], b.id));
          violations += clashes([id], any[0].id) + (size > 1 ? 1 : 0);
          put([id], any[0].id);
        }
        continue;
      }
      let best: Table | null = null, bestScore = Infinity;
      for (const t of fits) {
        const c = clashes(u.ids, t.id);
        const free = cap.get(t.id)! - used.get(t.id)! - size;
        const g = u.ids.map((id) => group.get(id)).filter(Boolean);
        const sameGroup = g.length ? at.get(t.id)!.filter((o) => g.includes(group.get(o))).length : 0;
        const otherGroup = g.length ? at.get(t.id)!.filter((o) => group.get(o) && !g.includes(group.get(o))).length : 0;
        let score = c * 1000;
        if (opts.shuffle) score += r() * 50;
        else score += free * 2 - sameGroup * 6 + otherGroup * 1.5 + r() * 0.5;
        if (score < bestScore) { bestScore = score; best = t; }
      }
      violations += clashes(u.ids, best!.id);
      put(u.ids, best!.id);
    }
    return { seat, unseatedIds, violations };
  };

  let best: ReturnType<typeof attempt> | null = null;
  for (let i = 0; i < attempts; i++) {
    const order = shuffleInPlace(units.slice(), r0);
    if (!opts.shuffle) order.sort((a, b) => (b.fixed ? 1 : 0) - (a.fixed ? 1 : 0) || degree(b) - degree(a) || b.ids.length - a.ids.length);
    else order.sort((a, b) => (b.fixed ? 1 : 0) - (a.fixed ? 1 : 0) || degree(b) - degree(a));
    const res = attempt(r0, order);
    const cost = (x: typeof res) => x.unseatedIds.length * 10000 + x.violations;
    if (!best || cost(res) < cost(best)) best = res;
    if (best.violations === 0 && best.unseatedIds.length === 0 && i >= (opts.shuffle ? 0 : 4)) break;
  }
  const res = best!;
  const total = tables.reduce((s, t) => s + t.seats, 0);
  if (res.unseatedIds.length) warnings.push(`${res.unseatedIds.length} ${res.unseatedIds.length === 1 ? 'person has' : 'people have'} no seat: ${chart.guests.length} people, ${total} seats. Add a table or seats.`);
  if (res.violations) warnings.push(`Could not satisfy every rule (${res.violations} conflict${res.violations === 1 ? '' : 's'}). Try adding a table, more seats, or loosening a rule.`);
  return { seat: res.seat, unseated: res.unseatedIds, warnings, violations: res.violations };
}

export type ConflictKind = 'over' | 'apart' | 'together' | 'unseated';
export interface Conflict { kind: ConflictKind; tables: string[]; guests: string[]; message: string }

/** Everything wrong with the chart as it currently stands (manual moves included). */
export function findConflicts(chart: Chart, apartRadius = 0): Conflict[] {
  const out: Conflict[] = [];
  const name = new Map(chart.guests.map((g) => [g.id, g.name]));
  const tname = new Map(chart.tables.map((t) => [t.id, t.name]));
  const near = neighbourMap(chart.tables, apartRadius);
  for (const t of chart.tables) {
    const n = chart.guests.filter((g) => chart.seat[g.id] === t.id).length;
    if (n > t.seats) out.push({ kind: 'over', tables: [t.id], guests: [], message: `${t.name} has ${n} people but only ${t.seats} seats.` });
  }
  for (const r of chart.rules) {
    const ta = chart.seat[r.a], tb = chart.seat[r.b];
    if (!ta || !tb || !tname.has(ta) || !tname.has(tb)) continue;
    if (r.type === 'apart' && (ta === tb || near.get(ta)?.has(tb))) {
      out.push({ kind: 'apart', tables: [ta, tb], guests: [r.a, r.b], message: `${name.get(r.a)} and ${name.get(r.b)} should be kept apart (${ta === tb ? 'both at ' + tname.get(ta) : tname.get(ta) + ' is next to ' + tname.get(tb)}).` });
    }
    if (r.type === 'together' && ta !== tb) {
      out.push({ kind: 'together', tables: [ta, tb], guests: [r.a, r.b], message: `${name.get(r.a)} (${tname.get(ta)}) and ${name.get(r.b)} (${tname.get(tb)}) should sit together.` });
    }
  }
  const parties = new Map<string, string[]>();
  for (const g of chart.guests) if (g.party) { if (!parties.has(g.party)) parties.set(g.party, []); parties.get(g.party)!.push(g.id); }
  for (const ids of parties.values()) {
    const ts = new Set(ids.map((id) => chart.seat[id]).filter((t) => t && tname.has(t)));
    if (ts.size > 1) out.push({ kind: 'together', tables: [...ts], guests: ids, message: `${ids.map((i) => name.get(i)).join(' & ')} are a couple/party but are split across tables.` });
  }
  return out;
}
