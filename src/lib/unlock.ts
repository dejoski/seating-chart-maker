import { UNLOCK_HASHES } from '../config';

export type Product = 'printkit' | 'teacher';
const FLAG = (p: Product) => `scm.unlock.${p}`;

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Returns which product (if any) the given token unlocks. */
export async function productForToken(token: string, hashes = UNLOCK_HASHES): Promise<Product | null> {
  const t = token.trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(t)) return null;
  const h = await sha256Hex(t);
  for (const p of Object.keys(hashes) as Product[]) if (hashes[p] && hashes[p] === h) return p;
  return null;
}

export function isUnlocked(p: Product): boolean {
  try { return localStorage.getItem(FLAG(p)) === '1'; } catch { return false; }
}

export function setUnlocked(p: Product): void {
  try { localStorage.setItem(FLAG(p), '1'); } catch { /* ignore */ }
}

/** Reads ?unlock=… from the URL, sets the flag, and strips the token from the address bar. */
export async function consumeUnlockParam(loc: Location = location, hist: History = history): Promise<Product | null> {
  const url = new URL(loc.href);
  const token = url.searchParams.get('unlock');
  if (!token) return null;
  const p = await productForToken(token);
  url.searchParams.delete('unlock');
  url.searchParams.delete('session_id');
  hist.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
  if (p) setUnlocked(p);
  return p;
}
