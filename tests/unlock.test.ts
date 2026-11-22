import { describe, it, expect, beforeEach } from 'vitest';
import { productForToken, sha256Hex, isUnlocked, setUnlocked } from '../src/lib/unlock';
import { PRINT_KIT_LINK, TEACHER_PACK_LINK, UNLOCK_HASHES } from '../src/config';

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  (globalThis as unknown as { localStorage: Pick<Storage, 'getItem' | 'setItem'> }).localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
});

describe('unlock', () => {
  it('matches a token only by its SHA-256', async () => {
    const token = 'abcdef0123456789abcdef';
    const hashes = { printkit: await sha256Hex(token), teacher: '' };
    expect(await productForToken(token, hashes)).toBe('printkit');
    expect(await productForToken(token + 'x', hashes)).toBeNull();
    expect(await productForToken('short', hashes)).toBeNull();
    expect(await productForToken('<script>alert(1)</script>xxxxxxxx', hashes)).toBeNull();
  });
  it('stores the unlock flag', () => {
    expect(isUnlocked('printkit')).toBe(false);
    setUnlocked('printkit');
    expect(isUnlocked('printkit')).toBe(true);
    expect(isUnlocked('teacher')).toBe(false);
  });
  it('config ships with empty buy links and SHA-256 hashes only (no plain tokens)', () => {
    expect(PRINT_KIT_LINK).toBe('');
    expect(TEACHER_PACK_LINK).toBe('');
    for (const h of Object.values(UNLOCK_HASHES)) expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
