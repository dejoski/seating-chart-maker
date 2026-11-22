import './style.css';
import { consumeUnlockParam, isUnlocked } from './lib/unlock';

const box = document.getElementById('unlock-status')!;
const NAMES = { printkit: 'Print Kit', teacher: 'Teacher Pack' } as const;
consumeUnlockParam().then((p) => {
  const any = (['printkit', 'teacher'] as const).filter(isUnlocked);
  box.innerHTML = p
    ? `<p><b>${NAMES[p]} unlocked.</b> Thank you! Go back to your chart and you’ll find it under the export buttons.</p>`
    : any.length
      ? `<p>Already unlocked in this browser: ${any.map((x) => NAMES[x]).join(', ')}.</p>`
      : '<p>This link doesn’t contain a valid unlock code. If you completed a purchase, open the link from your purchase confirmation again.</p>';
}).catch(() => { box.innerHTML = '<p>Your browser blocked the unlock check. Try a different browser.</p>'; });
