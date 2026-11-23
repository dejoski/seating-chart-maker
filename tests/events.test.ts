import { describe, it, expect } from 'vitest';
import { eventPayload, looksLikeEmail, PRODUCT_IDS } from '../src/lib/events';
import { FREE_GIVEAWAY, PRODUCT_EVENT_URL, PRINT_KIT_PRICE, TEACHER_PACK_PRICE } from '../src/config';

describe('product events (free giveaway + willingness-to-pay test)', () => {
  it('maps products to the shared endpoint ids', () => {
    expect(PRODUCT_IDS).toEqual({ printkit: 'print-kit', teacher: 'teacher-pack' });
  });
  it('builds count-only payloads; email only when given', () => {
    expect(JSON.parse(eventPayload('printkit', 'buy_click', '/seating-chart-maker/'))).toEqual({ event: 'buy_click', product: 'print-kit', page: '/seating-chart-maker/' });
    expect(JSON.parse(eventPayload('teacher', 'notify_email', '/x/', ' a@b.co '))).toEqual({ event: 'notify_email', product: 'teacher-pack', page: '/x/', email: 'a@b.co' });
  });
  it('validates emails loosely', () => {
    expect(looksLikeEmail('a@b.co')).toBe(true);
    expect(looksLikeEmail('nope')).toBe(false);
    expect(looksLikeEmail('a@b')).toBe(false);
  });
  it('ships the free giveaway on, pointed at the osceola worker, with the test prices', () => {
    expect(FREE_GIVEAWAY).toBe(true);
    expect(PRODUCT_EVENT_URL).toBe('https://osceolasodsolutions.top/api/product-event');
    expect([PRINT_KIT_PRICE, TEACHER_PACK_PRICE]).toEqual(['$14', '$7']);
  });
});
