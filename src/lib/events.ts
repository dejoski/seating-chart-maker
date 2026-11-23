import type { Product } from './unlock';
import { PRODUCT_EVENT_URL } from '../config';

/** Product ids used by the shared product-event endpoint. */
export const PRODUCT_IDS: Record<Product, string> = { printkit: 'print-kit', teacher: 'teacher-pack' };

export type ProductEvent = 'free_download' | 'buy_click' | 'notify_email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const looksLikeEmail = (s: string) => EMAIL_RE.test(s.trim());

export function eventPayload(p: Product, event: ProductEvent, page: string, email?: string): string {
  const body: Record<string, string> = { event, product: PRODUCT_IDS[p], page };
  if (email) body.email = email.trim();
  return JSON.stringify(body);
}

/**
 * Logs a product event (counts only; an email only when the visitor typed one
 * into a notify box). Fire-and-forget: never blocks the free unlock.
 * Sent as text/plain so the cross-origin request needs no preflight.
 */
export function sendProductEvent(p: Product, event: ProductEvent, email?: string, url = PRODUCT_EVENT_URL): Promise<boolean> {
  if (!url) return Promise.resolve(false);
  try {
    return fetch(url, { method: 'POST', body: eventPayload(p, event, location.pathname, email), keepalive: true, headers: { 'Content-Type': 'text/plain' } })
      .then((r) => r.ok)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}
