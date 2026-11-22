/**
 * Paid add-ons. While a *_LINK is empty, no buy button or paid panel is shown anywhere.
 * To go live: create a Stripe Payment Link, set its success redirect to
 *   https://<your-site>/unlock/?unlock=<secret token>
 * and paste the Payment Link URL below. Only the SHA-256 of each token is stored here,
 * so reading the public source does not reveal the unlock URL.
 * v0 is client-side only (spoofable by design, acceptable for a low-price MVP).
 * A server check (Pages Function /api/verify against the Stripe session) replaces this later.
 */
export const PRINT_KIT_LINK = '';
export const TEACHER_PACK_LINK = '';

export const PRINT_KIT_PRICE = '$14';
export const TEACHER_PACK_PRICE = '$7';

export const UNLOCK_HASHES: Record<'printkit' | 'teacher', string> = {
  printkit: '810eb92b5871e0bc13afe7e56319e0b77d0105bb56acab916c49fe0470f843d2',
  teacher: 'e7766427f118737c1e96f925fc9a33c2555eb2bfeb7094bbca80caa9ff1daae5',
};
