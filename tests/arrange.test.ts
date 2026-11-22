import { describe, it, expect } from 'vitest';
import { arrange, findConflicts, clusters } from '../src/lib/arrange';
import { classroomLayout } from '../src/lib/layouts';
import { parseGuests } from '../src/lib/parse';
import { g, t, chart } from './helpers';

const names = (n: number) => Array.from({ length: n }, (_, i) => g('P' + i));

describe('arrange', () => {
  it('seats everyone when there is room and never overfills a table', () => {
    const c = chart(names(20), [t('A', 8), t('B', 8), t('C', 8)]);
    const r = arrange(c, { seed: 3 });
    expect(r.unseated).toEqual([]);
    expect(Object.keys(r.seat)).toHaveLength(20);
    for (const id of ['A', 'B', 'C']) expect(Object.values(r.seat).filter((x) => x === id).length).toBeLessThanOrEqual(8);
  });

  it('respects keep-apart rules', () => {
    const gs = names(16);
    const rules = [['P0', 'P1'], ['P0', 'P2'], ['P1', 'P2'], ['P3', 'P4']].map(([a, b], i) => ({ id: 'r' + i, type: 'apart' as const, a, b }));
    const c = chart(gs, [t('A', 6), t('B', 6), t('C', 6)], { rules });
    for (let seed = 1; seed < 20; seed++) {
      const r = arrange(c, { seed });
      expect(r.violations).toBe(0);
      for (const x of rules) expect(r.seat[x.a]).not.toBe(r.seat[x.b]);
    }
  });

  it('keeps together-rule chains and linked parties at one table', () => {
    const gs = [...names(10), g('Alex', { party: 'p1' }), g('Sam', { party: 'p1' })];
    const rules = [{ id: 'r1', type: 'together' as const, a: 'P0', b: 'P1' }, { id: 'r2', type: 'together' as const, a: 'P1', b: 'P2' }];
    const c = chart(gs, [t('A', 4), t('B', 4), t('C', 4)], { rules });
    const r = arrange(c, { seed: 9 });
    expect(r.seat.P0).toBe(r.seat.P1); expect(r.seat.P1).toBe(r.seat.P2);
    expect(r.seat.Alex).toBe(r.seat.Sam);
    expect(clusters(c).some((cl) => cl.length === 3)).toBe(true);
  });

  it('never moves locked guests', () => {
    const c = chart(names(8), [t('A', 4), t('B', 4)], { seat: { P0: 'B', P1: 'B' }, locked: ['P0', 'P1'] });
    for (let seed = 1; seed < 10; seed++) { const r = arrange(c, { seed, shuffle: true }); expect(r.seat.P0).toBe('B'); expect(r.seat.P1).toBe('B'); }
  });

  it('reports unseated people when there are not enough seats', () => {
    const r = arrange(chart(names(10), [t('A', 4), t('B', 4)]));
    expect(r.unseated).toHaveLength(2);
    expect(r.warnings.join(' ')).toMatch(/no seat/);
  });

  it('warns about contradictory rules and oversized linked groups', () => {
    const rules = [{ id: 'a', type: 'together' as const, a: 'P0', b: 'P1' }, { id: 'b', type: 'apart' as const, a: 'P0', b: 'P1' }];
    const r1 = arrange(chart(names(6), [t('A', 4), t('B', 4)], { rules }));
    expect(r1.warnings.join(' ')).toMatch(/Contradiction/);
    const big = names(6).map((x) => ({ ...x, party: 'fam' }));
    const r2 = arrange(chart(big, [t('A', 4), t('B', 4)]));
    expect(r2.warnings.join(' ')).toMatch(/split/);
    expect(r2.unseated).toEqual([]);
  });

  it('reports impossible keep-apart sets instead of hiding them', () => {
    const rules = [['P0', 'P1'], ['P0', 'P2'], ['P1', 'P2']].map(([a, b], i) => ({ id: 'r' + i, type: 'apart' as const, a, b }));
    const r = arrange(chart(names(3), [t('A', 4), t('B', 4)], { rules }));
    expect(r.violations).toBeGreaterThan(0);
    expect(r.warnings.join(' ')).toMatch(/Could not satisfy/);
  });

  it('classroom apart radius keeps students off neighbouring desks', () => {
    const rules = [{ id: 'r', type: 'apart' as const, a: 'P0', b: 'P1' }];
    const c = { ...chart(names(12), classroomLayout('rows', 12), { rules }), mode: 'classroom' as const };
    for (let seed = 1; seed < 15; seed++) {
      const r = arrange(c, { seed, shuffle: true, apartRadius: 200 });
      expect(findConflicts({ ...c, seat: r.seat }, 200).filter((x) => x.kind === 'apart')).toEqual([]);
    }
  });

  it('shuffle gives different arrangements for different seeds', () => {
    const c = chart(names(12), classroomLayout('rows', 12));
    const a = arrange(c, { seed: 1, shuffle: true }).seat, b = arrange(c, { seed: 2, shuffle: true }).seat;
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('prefers seating the same group together', () => {
    const gs = [...Array.from({ length: 4 }, (_, i) => g('F' + i, { group: 'family' })), ...Array.from({ length: 4 }, (_, i) => g('W' + i, { group: 'work' }))];
    const r = arrange(chart(gs, [t('A', 4), t('B', 4)]), { seed: 5 });
    expect(new Set(['F0', 'F1', 'F2', 'F3'].map((x) => r.seat[x])).size).toBe(1);
  });

  it('handles no tables gracefully', () => {
    expect(arrange(chart(names(2), [])).unseated).toHaveLength(2);
  });

  it('works on a parsed wedding list with couples', () => {
    const gs = parseGuests('Alex & Sam Lee\nJo Park +1\nTaylor Reed');
    const r = arrange(chart(gs, [t('A', 2), t('B', 3)]));
    const by = (n: string) => r.seat[gs.find((x) => x.name === n)!.id];
    expect(by('Alex Lee')).toBe(by('Sam Lee'));
    expect(by('Jo Park')).toBe(by('Guest of Jo Park'));
  });
});

describe('findConflicts', () => {
  it('flags over-capacity, apart, together and split parties', () => {
    const gs = [g('A'), g('B'), g('C', { party: 'x' }), g('D', { party: 'x' })];
    const c = chart(gs, [t('T1', 1), t('T2', 4)], {
      seat: { A: 'T1', B: 'T1', C: 'T1', D: 'T2' },
      rules: [{ id: '1', type: 'apart', a: 'A', b: 'B' }, { id: '2', type: 'together', a: 'A', b: 'D' }],
    });
    expect(findConflicts(c).map((x) => x.kind).sort()).toEqual(['apart', 'over', 'together', 'together']);
  });
  it('is empty for a clean chart', () => {
    expect(findConflicts(chart([g('A')], [t('T', 2)], { seat: { A: 'T' } }))).toEqual([]);
  });
});
