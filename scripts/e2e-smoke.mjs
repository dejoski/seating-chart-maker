// Headless end-to-end smoke test. Usage: npm i --no-save puppeteer-core && CHROME=/path/to/chrome node scripts/e2e-smoke.mjs <base-url> (PK_TOKEN=<print kit token> to test unlock)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const base = process.argv[2]; // e.g. https://dejoski.github.io/seating-chart-maker/
const token = process.env.PK_TOKEN || '';
const dl = '/tmp/scm-dl'; fs.rmSync(dl, { recursive: true, force: true }); fs.mkdirSync(dl);
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--user-data-dir=/tmp/scm-chrome-' + Date.now()] });
const p = await b.newPage(); await p.setViewport({ width: 1366, height: 1000 });
p.on('dialog', (d) => d.accept());
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
// Product events are intercepted (never sent to production) and recorded for assertions.
const events = [];
await p.setRequestInterception(true);
p.on('request', (r) => {
  if (r.url().includes('/api/product-event')) {
    if (r.method() === 'POST') { try { events.push(JSON.parse(r.postData() || '{}')); } catch { /* ignore */ } }
    return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"ok":true,"outcome":"counted"}' });
  }
  r.continue();
});
const cdp = await p.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
const ok = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) process.exitCode = 1; };
const chart = () => p.evaluate(() => window.__scm.chart);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await p.goto(base, { waitUntil: 'networkidle0' });
await p.waitForSelector('#app .tbl');
await p.evaluate(() => { localStorage.clear(); }); await p.reload({ waitUntil: 'networkidle0' }); await p.waitForSelector('#app .tbl');
await p.type('#paste', 'Ann Smith\nBob Jones & Cara Jones\nDan Wu +1\nEve Ray');
await p.click('#add');
let c = await chart();
ok('add guests by paste (11 demo + 6 new = 17)', c.guests.length === 17);
const id = (n) => c.guests.find((x) => x.name === n).id;
await p.click('[data-panel=rules]');
await p.select('#ra', id('Ann Smith')); await p.select('#rt', 'apart'); await p.select('#rb', id('Eve Ray')); await p.click('#addr');
await p.click('[data-panel=tables]'); await p.click('[data-layout=round8]');
await p.click('#auto');
c = await chart();
ok('auto-arrange seats everyone', Object.keys(c.seat).length === c.guests.length);
ok('keep-apart respected', c.seat[id('Ann Smith')] !== c.seat[id('Eve Ray')]);
ok('couple kept together', c.seat[id('Bob Jones')] === c.seat[id('Cara Jones')]);
ok('no conflict banner', !(await p.$('.warn')));

// Drag: add a new guest (lands in the Not seated pool), drag it onto the first visible table with space.
await p.click('[data-panel=guests]');
await p.type('#paste', 'Zed Drag'); await p.click('#add');
c = await chart();
const zid = id('Zed Drag');
const target = await p.evaluate(() => {
  const t = [...document.querySelectorAll('.room .tbl')].find((t) => !t.classList.contains('full'));
  document.querySelector('.room-wrap').scrollTop = 0; t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return t.dataset.table;
});
const src = await p.$(`.pool [data-guest="${zid}"] .nm`);
await src.evaluate((e) => e.scrollIntoView({ block: 'nearest' }));
const sb = await src.boundingBox();
const tb = await (await p.$(`.room .tbl[data-table="${target}"] .th`)).boundingBox();
await p.mouse.move(sb.x + 5, sb.y + 5); await p.mouse.down();
await p.mouse.move(sb.x + 25, sb.y + 25, { steps: 4 }); await p.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 12 }); await p.mouse.up();
c = await chart();
ok('mouse drag guest onto table', c.seat[zid] === target);

// Tap-to-seat: add a table, select chip, then tap the new table
await p.click('[data-panel=tables]'); await p.click('#addt'); await p.click('[data-panel=guests]');
await p.click(`.room [data-guest="${zid}"] .nm`);
const other = await p.evaluate((t) => [...document.querySelectorAll('.room .tbl')].find((x) => x.dataset.table !== t && !x.classList.contains('full')).dataset.table, target);
await p.click(`.room .tbl[data-table="${other}"] .th`);
c = await chart();
ok('tap-to-seat moves guest', c.seat[zid] === other);

await p.click('#pdf'); await p.click('#png'); await p.click('#csvout'); await p.click('#json');
await wait(2500);
const files = fs.readdirSync(dl);
ok('exports downloaded (pdf, png, csv, json): ' + files.join(' '), ['pdf', 'png', 'csv', 'json'].every((e) => files.some((f) => f.endsWith('.' + e) && fs.statSync(dl + '/' + f).size > 200)));
ok('free Print Kit offer shown (Get it free + Buy $14), no Stripe link', !!(await p.$('[data-free=printkit]')) && (await p.$eval('[data-buy=printkit]', (e) => e.textContent)).includes('Buy $14') && !(await p.content()).includes('buy.stripe.com'));
await p.reload({ waitUntil: 'networkidle0' });
ok('saved in localStorage across reload', (await chart()).guests.length === 18);

// Classroom page: mode + shuffle
await p.goto(base + 'classroom-seating-chart/', { waitUntil: 'networkidle0' }); await p.waitForSelector('#app .tbl');
c = await chart(); ok('classroom page opens classroom mode', c.mode === 'classroom');
const before = JSON.stringify(c.seat); await p.click('#shuffle'); await p.click('#shuffle'); c = await chart();
ok('random shuffle seats everyone', Object.keys(c.seat).length === c.guests.length && JSON.stringify(c.seat) !== before);

// Banquet page: event mode
await p.goto(base + 'banquet-seating-chart/', { waitUntil: 'networkidle0' }); await p.waitForSelector('#app .tbl');
c = await chart(); ok('banquet page opens event mode', c.mode === 'event');

// Template page: load a template
await p.goto(base + 'seating-chart-template/', { waitUntil: 'networkidle0' }); await p.waitForSelector('#app .tbl');
await p.click('[data-template="wedding:150:round10"]'); c = await chart();
ok('template loads 150-seat layout', c.tables.reduce((s, t) => s + t.seats, 0) >= 150);

// Restrictions page opens rules panel
await p.goto(base + 'seating-chart-with-restrictions/', { waitUntil: 'networkidle0' }); await p.waitForSelector('#app');
ok('restrictions page opens rules tab', !!(await p.$('#addr')));

// Free giveaway + willingness-to-pay test
const clearUnlocks = () => p.evaluate(() => { localStorage.removeItem('scm.unlock.printkit'); localStorage.removeItem('scm.unlock.teacher'); });
await p.goto(base, { waitUntil: 'networkidle0' }); await clearUnlocks(); await p.reload({ waitUntil: 'networkidle0' }); await p.waitForSelector('[data-buy=printkit]');
events.length = 0;
await p.click('[data-buy=printkit]'); await wait(300);
ok('Buy $14 shows payments-open-soon note', (await p.$eval('[data-notice=printkit]', (e) => e.textContent)).includes("Payments open soon. Here's your free copy now."));
ok('Buy $14 unlocks the free Print Kit', !!(await p.$('[data-kit=sign]')));
ok('Buy $14 logs buy_click for print-kit', events.some((x) => x.event === 'buy_click' && x.product === 'print-kit'));
await p.type('[data-notify=printkit] input', 'e2e@example.com'); await p.click('[data-notify=printkit] button'); await wait(500);
ok('notify-me email sent as notify_email', events.some((x) => x.event === 'notify_email' && x.email === 'e2e@example.com'));
ok('notify-me thanks shown', (await p.$eval('[data-notice=printkit]', (e) => e.textContent)).includes('on the list'));
await p.click('[data-kit=sign]'); await wait(2500);
ok('free Print Kit sign PDF downloads', fs.readdirSync(dl).some((f) => /sign/.test(f) && f.endsWith('.pdf')));
await clearUnlocks(); await p.reload({ waitUntil: 'networkidle0' }); await p.waitForSelector('[data-free=printkit]');
events.length = 0;
await p.click('[data-free=printkit]'); await wait(300);
ok('Get it free unlocks Print Kit without email', !!(await p.$('[data-kit=sign]')) && !(await p.$('[data-notice=printkit]')));
ok('Get it free logs free_download only', events.length === 1 && events[0].event === 'free_download' && events[0].product === 'print-kit');
await p.goto(base + 'classroom-seating-chart/', { waitUntil: 'networkidle0' }); await clearUnlocks(); await p.reload({ waitUntil: 'networkidle0' }); await p.waitForSelector('[data-buy=teacher]');
ok('Teacher Pack offer shows Buy $7', (await p.$eval('[data-buy=teacher]', (e) => e.textContent)).includes('Buy $7'));
events.length = 0;
await p.type('#em-teacher', 'teacher@example.com'); await p.click('[data-free=teacher]'); await wait(300);
ok('Teacher Pack Get it free unlocks name tents', !!(await p.$('[data-kit=tents]')));
ok('Get it free with email logs free_download + notify_email', events.some((x) => x.event === 'free_download' && x.product === 'teacher-pack') && events.some((x) => x.event === 'notify_email' && x.email === 'teacher@example.com'));
await clearUnlocks();

// Unlock flow (v0)
if (token) {
  await p.goto(base + 'unlock/?unlock=bogus_token_value_123456', { waitUntil: 'networkidle0' });
  ok('bad token rejected', (await p.$eval('#unlock-status', (e) => e.textContent)).includes('doesn’t contain a valid'));
  await p.goto(base + 'unlock/?unlock=' + token + '&session_id=cs_test', { waitUntil: 'networkidle0' }); await wait(500);
  ok('good token unlocks Print Kit', (await p.$eval('#unlock-status', (e) => e.textContent)).includes('Print Kit unlocked'));
  ok('token stripped from URL', !p.url().includes(token));
  await p.goto(base, { waitUntil: 'networkidle0' }); await p.waitForSelector('.paid');
  for (const k of ['sign', 'escort', 'numbers', 'caterer']) await p.click(`[data-kit=${k}]`);
  await wait(3000);
  const kit = fs.readdirSync(dl).filter((f) => /sign|escort|numbers|caterer/.test(f));
  ok('Print Kit PDFs generated: ' + kit.join(' '), kit.length === 4);
}
ok('no page errors ' + JSON.stringify(errs), errs.length === 0);
await b.close();
