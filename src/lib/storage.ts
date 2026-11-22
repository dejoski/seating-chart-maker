import { Chart, Mode, emptyChart, normalizeChart } from './model';

const KEY = (m: Mode) => `scm.chart.${m}`;
const SAVED = (m: Mode) => `scm.saved.${m}`;

function ls(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function loadChart(mode: Mode): Chart | null {
  const s = ls();
  const raw = s?.getItem(KEY(mode));
  if (!raw) return null;
  try { return { ...normalizeChart(JSON.parse(raw)), mode }; } catch { return null; }
}

export function saveChart(chart: Chart): boolean {
  try { ls()?.setItem(KEY(chart.mode), JSON.stringify(chart)); return true; } catch { return false; }
}

export interface SavedEntry { name: string; savedAt: number; chart: Chart }

export function listSaved(mode: Mode): SavedEntry[] {
  try { const v = JSON.parse(ls()?.getItem(SAVED(mode)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function putSaved(mode: Mode, entries: SavedEntry[]): void {
  try { ls()?.setItem(SAVED(mode), JSON.stringify(entries)); } catch { /* quota */ }
}

export function backupJson(chart: Chart): string {
  return JSON.stringify({ app: 'seating-chart-maker', ...chart }, null, 2);
}

export function restoreJson(text: string, fallbackMode: Mode): Chart {
  const parsed = JSON.parse(text);
  const c = normalizeChart(parsed);
  if (!c.guests.length && !c.tables.length) throw new Error('That file has no guests or tables.');
  return c.mode ? c : { ...emptyChart(fallbackMode), ...c };
}
