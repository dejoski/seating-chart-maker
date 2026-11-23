import './style.css';
import { Chart, Guest, Mode, Shape, Table, clampSeats, emptyChart, guestsAt, normalizeChart, totalSeats, uid, unseated } from './lib/model';
import { parseGuests, CSV_TEMPLATE } from './lib/parse';
import { arrange, findConflicts } from './lib/arrange';
import { classroomLayout, ClassroomKind, eventLayout, nextSpot, roomSize, tableBox, weddingLayout } from './lib/layouts';
import { loadChart, saveChart, backupJson, restoreJson } from './lib/storage';
import { escapeHtml as e, sortName, toCsv } from './lib/text';
import { consumeUnlockParam, isUnlocked, setUnlocked, Product } from './lib/unlock';
import { looksLikeEmail, sendProductEvent } from './lib/events';
import { PRINT_KIT_LINK, TEACHER_PACK_LINK, PRINT_KIT_PRICE, TEACHER_PACK_PRICE, FREE_GIVEAWAY } from './config';
import { DESIGNS } from './lib/printkit';


function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const MODE_LABEL: Record<Mode, string> = { wedding: 'Wedding', classroom: 'Classroom', event: 'Event' };
const PERSON: Record<Mode, string> = { wedding: 'guest', classroom: 'student', event: 'guest' };

function demo(mode: Mode): Chart {
  const c = emptyChart(mode);
  if (mode === 'classroom') {
    c.title = 'Period 1';
    c.guests = parseGuests('Ava\nBen\nCarlos\nDani\nEli\nFatima\nGrace\nHiro\nIsla\nJamal\nKira\nLeo');
    c.tables = classroomLayout('pairs', c.guests.length);
  } else {
    c.title = mode === 'wedding' ? 'Our wedding' : 'Company dinner';
    c.guests = parseGuests('Name,Group,Meal\nAlex & Sam Lee,Bride family,Chicken\nJordan Park +1,College friends,Fish\nTaylor Reed,Work,Vegetarian\nMorgan Diaz,Groom family,Chicken\nCasey Diaz,Groom family,Fish\nRiley Chen,College friends,Chicken\nPat Kim,Work,Fish\nDrew Ortiz,Bride family,Vegetarian\nQuinn Ali,Groom family,Chicken');
    c.tables = mode === 'wedding' ? weddingLayout(c.guests.length, 8, { head: 'sweetheart' }) : eventLayout(c.guests.length, 8);
  }
  return c;
}

function init(el: HTMLElement) {
  const startMode = (el.dataset.mode as Mode) || 'wedding';
  let chart: Chart = loadChart(startMode) ?? demo(startMode);
  let view: 'plan' | 'tables' | 'az' = 'plan';
  let panel: 'guests' | 'tables' | 'rules' = (el.dataset.panel as 'rules') || 'guests';
  let selected: string | null = null;
  let warnings: string[] = [];
  const undo: string[] = [];
  const apartRadius = () => (chart.mode === 'classroom' ? 200 : 0);
  // Free giveaway: which add-on's "Buy" was clicked (shows the payments-open-soon note) and notify status text.
  const buyNotice: Partial<Record<Product, boolean>> = {};
  const notifyStatus: Partial<Record<Product, string>> = {};

  consumeUnlockParam().then((p) => { if (p) render(); }).catch(() => {});

  const commit = (fn: () => void) => {
    undo.push(JSON.stringify(chart)); if (undo.length > 50) undo.shift();
    fn(); saveChart(chart); render();
  };

  const seatGuest = (gid: string, tid: string | null) => commit(() => {
    if (tid) chart.seat[gid] = tid; else { delete chart.seat[gid]; chart.locked = chart.locked.filter((x) => x !== gid); }
  });

  function render() {
    const conflicts = findConflicts(chart, apartRadius());
    const badTables = new Set(conflicts.flatMap((c) => c.tables));
    const badGuests = new Set(conflicts.filter((c) => c.kind === 'apart' || c.kind === 'together').flatMap((c) => c.guests));
    const un = unseated(chart);
    const person = PERSON[chart.mode];
    const seats = totalSeats(chart);
    const chip = (g: Guest, inTable = false) =>
      `<li class="chip${selected === g.id ? ' sel' : ''}${badGuests.has(g.id) ? ' bad' : ''}" data-guest="${g.id}" title="${e([g.group, g.meal, g.notes].filter(Boolean).join(' · '))}">` +
      `<span class="nm">${e(g.name)}</span>` +
      (inTable ? `<button class="ic" data-lock="${g.id}" aria-label="${chart.locked.includes(g.id) ? 'Unlock' : 'Lock'} seat">${chart.locked.includes(g.id) ? '🔒' : '🔓'}</button><button class="ic" data-unseat="${g.id}" aria-label="Remove from table">×</button>` : '') + '</li>';
    const tableEl = (t: Table) => {
      const b = tableBox(t); const gs = guestsAt(chart, t.id);
      return `<div class="tbl ${t.shape}${badTables.has(t.id) ? ' bad' : ''}${gs.length >= t.seats ? ' full' : ''}" data-table="${t.id}" style="left:${t.x}px;top:${t.y}px;width:${b.w}px;min-height:${b.h}px">` +
        `<div class="th" data-move="${t.id}"><span>${e(t.name)}</span><span class="cnt">${gs.length}/${t.seats}</span></div><ul class="seats">${gs.map((g) => chip(g, true)).join('')}</ul></div>`;
    };
    const room = roomSize(chart.tables);
    const tn = new Map(chart.tables.map((t) => [t.id, t.name]));
    const viewHtml = view === 'plan'
      ? `<div class="room-wrap"><div class="room" style="width:${room.w}px;height:${room.h}px">${chart.mode === 'classroom' ? '<div class="front">Front / board ↑</div>' : ''}${chart.tables.map(tableEl).join('')}</div></div>`
      : view === 'tables'
        ? `<div class="list">${chart.tables.map((t) => `<section><h4>${e(t.name)} <small>${guestsAt(chart, t.id).length}/${t.seats}</small></h4><ol>${guestsAt(chart, t.id).map((g) => `<li>${e(g.name)}${g.meal ? ` <small>${e(g.meal)}</small>` : ''}</li>`).join('')}</ol></section>`).join('')}</div>`
        : `<ol class="az">${[...chart.guests].sort((a, b) => sortName(a.name).localeCompare(sortName(b.name))).map((g) => `<li><span>${e(g.name)}</span><b>${e(tn.get(chart.seat[g.id]) ?? '—')}</b></li>`).join('')}</ol>`;

    const guestOpts = chart.guests.map((g) => `<option value="${g.id}">${e(g.name)}</option>`).join('');
    const panelHtml = panel === 'guests' ? `
      <label class="lbl" for="paste">Add ${person}s: one per line, or paste CSV/spreadsheet columns (Name, Group, Meal, Notes). “Alex &amp; Sam Lee” and “Jo Park +1” stay linked.</label>
      <textarea id="paste" rows="4" placeholder="Alex &amp; Sam Lee, Bride family, Chicken&#10;Jordan Park +1"></textarea>
      <div class="row"><button class="btn" id="add">Add ${person}s</button><label class="btn ghost file">Import CSV<input type="file" id="csv" accept=".csv,.tsv,.txt,text/csv" hidden></label><button class="btn ghost" id="tpl">CSV template</button></div>
      ${selected && chart.guests.find((g) => g.id === selected) ? editGuest(chart.guests.find((g) => g.id === selected)!) : ''}
      <h3 class="ph">Not seated (${un.length})</h3><ul class="pool" data-table="">${un.map((g) => chip(g)).join('') || `<li class="muted">Everyone has a seat.</li>`}</ul>
      <details><summary>All ${person}s (${chart.guests.length})</summary><ul class="pool">${chart.guests.map((g) => chip(g)).join('')}</ul></details>`
      : panel === 'tables' ? `
      <div class="row"><select id="tshape" aria-label="Table shape">${(chart.mode === 'classroom' ? ['desk', 'rect', 'round'] : ['round', 'rect', 'head', 'sweetheart']).map((s) => `<option>${s}</option>`).join('')}</select>
      <input id="tseats" type="number" min="1" max="20" value="${chart.mode === 'classroom' ? 2 : 8}" aria-label="Seats" style="width:4.5em"><button class="btn" id="addt">Add table</button></div>
      <p class="lbl">Quick layouts (replaces tables, keeps ${person}s):</p>
      <div class="row wrap">${chart.mode === 'classroom'
        ? ['rows', 'pairs', 'pods', 'ushape'].map((k) => `<button class="btn ghost" data-layout="${k}">${({ rows: 'Rows', pairs: 'Pairs', pods: 'Pods of 4', ushape: 'U-shape' } as Record<string, string>)[k]}</button>`).join('')
        : `<button class="btn ghost" data-layout="round8">Rounds of 8</button><button class="btn ghost" data-layout="round10">Rounds of 10</button><button class="btn ghost" data-layout="rect8">Long tables of 8</button>${chart.mode === 'wedding' ? '<button class="btn ghost" data-layout="head">Head table + rounds</button>' : ''}`}</div>
      <ul class="tlist">${chart.tables.map((t) => `<li><input data-tname="${t.id}" value="${e(t.name)}" aria-label="Table name"><input type="number" min="1" max="20" data-tseats="${t.id}" value="${t.seats}" aria-label="Seats"><button class="ic" data-tdel="${t.id}" aria-label="Delete table">🗑</button></li>`).join('')}</ul>`
      : `
      <p class="lbl">Keep two people together or apart. Couples and “+1”s are linked automatically.${chart.mode === 'classroom' ? ' In classroom mode “apart” also means not at a neighbouring desk.' : ''}</p>
      <div class="row wrap"><select id="ra" aria-label="First person">${guestOpts}</select><select id="rt" aria-label="Rule"><option value="apart">keep apart from</option><option value="together">keep together with</option></select><select id="rb" aria-label="Second person">${guestOpts}</select><button class="btn" id="addr">Add rule</button></div>
      <ul class="rlist">${chart.rules.map((r) => `<li>${e(chart.guests.find((g) => g.id === r.a)?.name ?? '?')} <b>${r.type === 'apart' ? 'apart from' : 'with'}</b> ${e(chart.guests.find((g) => g.id === r.b)?.name ?? '?')} <button class="ic" data-rdel="${r.id}" aria-label="Delete rule">×</button></li>`).join('') || '<li class="muted">No rules yet.</li>'}</ul>`;

    el.innerHTML = `
      <div class="bar">
        <div class="seg" role="group" aria-label="Mode">${(['wedding', 'classroom', 'event'] as Mode[]).map((m) => `<button aria-pressed="${m === chart.mode}" data-mode="${m}">${MODE_LABEL[m]}</button>`).join('')}</div>
        <input id="title" value="${e(chart.title)}" placeholder="Chart title" aria-label="Chart title">
        <button class="btn primary" id="auto">Auto-arrange</button>
        ${chart.mode === 'classroom' ? '<button class="btn" id="shuffle">Random shuffle</button>' : ''}
        <button class="btn ghost" id="clear">Clear seats</button>
        <button class="btn ghost" id="undo" ${undo.length ? '' : 'disabled'}>Undo</button>
      </div>
      <p class="stats">${chart.guests.length} ${person}s · ${chart.tables.length} ${chart.mode === 'classroom' ? 'desks/tables' : 'tables'} · ${seats} seats · ${un.length} not seated${selected ? ' · <b>Tap a table to seat the selected person</b>' : ''}</p>
      ${conflicts.length || warnings.length ? `<div class="warn" role="status"><b>${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'}</b><ul>${[...warnings, ...conflicts.map((c) => c.message)].slice(0, 8).map((m) => `<li>${e(m)}</li>`).join('')}</ul></div>` : ''}
      <div class="tool">
        <aside class="side"><div class="seg small">${(['guests', 'tables', 'rules'] as const).map((p) => `<button data-panel="${p}" aria-pressed="${panel === p}">${p === 'guests' ? PERSON[chart.mode][0].toUpperCase() + PERSON[chart.mode].slice(1) + 's' : p[0].toUpperCase() + p.slice(1)}</button>`).join('')}</div>${panelHtml}</aside>
        <div class="main"><div class="seg small">${([['plan', 'Floor plan'], ['tables', 'By table'], ['az', 'A–Z find your seat']] as const).map(([v, l]) => `<button data-view="${v}" aria-pressed="${view === v}">${l}</button>`).join('')}</div>${viewHtml}</div>
      </div>
      <div class="bar exp"><span>Export:</span><button class="btn" id="pdf">PDF</button><button class="btn" id="png">PNG</button><button class="btn ghost" id="csvout">Caterer CSV</button><button class="btn ghost" id="json">Backup (.json)</button><label class="btn ghost file">Restore<input type="file" id="restore" accept=".json,application/json" hidden></label><button class="btn ghost" id="reset">New chart</button></div>
      ${paidPanel()}
      <p class="privacy">🔒 Your list never leaves this device: everything is saved in your browser (localStorage). No sign-up, no upload.</p>`;
  }

  const OFFER: Record<Product, { name: string; price: string; blurb: string }> = {
    printkit: { name: 'Print Kit', price: PRINT_KIT_PRICE, blurb: 'print-shop-ready seating sign (24×36, 18×24, 11×17; 6 designs, no footer), escort cards, table numbers and a caterer sheet.' },
    teacher: { name: 'Teacher Pack', price: TEACHER_PACK_PRICE, blurb: 'name tents and a substitute plan PDF.' },
  };

  // "Get it free" + "Buy $N" (willingness-to-pay test; no charge, no checkout).
  function freeOffer(p: Product): string {
    const o = OFFER[p];
    return `<div class="paid offer" data-offer="${p}"><b>${o.name}</b>: ${o.blurb} Free for now.
      <label class="em">Email (optional) <input type="email" id="em-${p}" autocomplete="email" placeholder="you@example.com"></label>
      <button class="btn primary" data-free="${p}">Get it free</button><button class="btn" data-buy="${p}">Buy ${o.price}</button></div>`;
  }

  function notice(p: Product): string {
    if (!buyNotice[p]) return '';
    return `<div class="paid notice" role="status" data-notice="${p}"><b>Payments open soon. Here's your free copy now.</b> The ${OFFER[p].name} is unlocked below.
      <form data-notify="${p}" class="row wrap"><label class="em">Notify me when payments open (optional) <input type="email" required autocomplete="email" placeholder="you@example.com"></label><button class="btn" type="submit">Notify me</button></form>
      <span class="muted" aria-live="polite">${e(notifyStatus[p] || '')}</span></div>`;
  }

  function paidPanel(): string {
    let out = '';
    if (isUnlocked('printkit')) {
      out += notice('printkit');
      out += `<div class="paid"><b>Print Kit</b> <select id="kSize" aria-label="Sign size"><option value="24x36">24×36 in</option><option value="18x24">18×24 in</option><option value="11x17">11×17 in</option></select>
        <select id="kDesign" aria-label="Design">${DESIGNS.map((d, i) => `<option value="${i}">${e(d.name)}</option>`).join('')}</select>
        <select id="kOrder" aria-label="Order"><option value="alpha">A–Z</option><option value="table">By table</option></select>
        <button class="btn" data-kit="sign">Seating sign</button><button class="btn" data-kit="escort">Escort cards</button><button class="btn" data-kit="numbers">Table numbers</button><button class="btn" data-kit="caterer">Caterer sheet</button></div>`;
    } else if (PRINT_KIT_LINK) {
      out += `<div class="paid"><b>Print Kit ${PRINT_KIT_PRICE}</b>: print-shop-ready seating sign (24×36, 18×24, 11×17; 6 designs, no footer), escort cards, table numbers and a caterer sheet. <a class="btn primary" href="${e(PRINT_KIT_LINK)}" rel="nofollow noopener">Get the Print Kit</a></div>`;
    } else if (FREE_GIVEAWAY) {
      out += freeOffer('printkit');
    }
    if (chart.mode === 'classroom') {
      if (isUnlocked('teacher')) out += notice('teacher') + `<div class="paid"><b>Teacher Pack</b> <button class="btn" data-kit="tents">Name tents</button><button class="btn" data-kit="subplan">Sub plan</button></div>`;
      else if (TEACHER_PACK_LINK) out += `<div class="paid"><b>Teacher Pack ${TEACHER_PACK_PRICE}</b>: name tents and a substitute plan PDF. <a class="btn primary" href="${e(TEACHER_PACK_LINK)}" rel="nofollow noopener">Get the Teacher Pack</a></div>`;
      else if (FREE_GIVEAWAY) out += freeOffer('teacher');
    }
    return out;
  }

  function editGuest(g: Guest) {
    return `<div class="edit"><b>Edit</b> <input data-gf="name" value="${e(g.name)}" aria-label="Name"><input data-gf="group" value="${e(g.group)}" placeholder="Group" aria-label="Group"><input data-gf="meal" value="${e(g.meal)}" placeholder="Meal" aria-label="Meal"><input data-gf="notes" value="${e(g.notes)}" placeholder="Notes" aria-label="Notes"><button class="btn ghost" id="gdel">Delete</button></div>`;
  }

  function applyLayout(k: string, min = 0) {
    const n = Math.max(chart.guests.length, min, 1);
    commit(() => {
      chart.tables = k in { rows: 1, pairs: 1, pods: 1, ushape: 1 } ? classroomLayout(k as ClassroomKind, n)
        : k === 'round10' ? weddingLayout(n, 10, { head: chart.mode === 'wedding' ? 'sweetheart' : 'none' })
        : k === 'rect8' ? eventLayout(n, 8, 'rect')
        : k === 'head' ? weddingLayout(n, 8, { head: 'head', headSeats: 10 })
        : weddingLayout(n, 8, { head: chart.mode === 'wedding' ? 'sweetheart' : 'none' });
      chart.seat = {}; chart.locked = [];
    });
  }

  // ---- events (delegated) ----
  el.addEventListener('click', async (ev) => {
    const t = ev.target as HTMLElement;
    const b = t.closest('button, [data-guest], [data-table]') as HTMLElement | null;
    if (!b) return;
    const d = b.dataset;
    if (d.mode) { saveChart(chart); chart = loadChart(d.mode as Mode) ?? demo(d.mode as Mode); selected = null; warnings = []; undo.length = 0; render(); return; }
    if (d.panel) { panel = d.panel as typeof panel; render(); return; }
    if (d.view) { view = d.view as typeof view; render(); return; }
    if (d.layout) return applyLayout(d.layout);
    if (d.kit) {
      const k = await import('./lib/printkit');
      const v = (id: string) => el.querySelector<HTMLSelectElement>(id)?.value ?? '';
      const design = Number(v('#kDesign')) || 0;
      const run: Record<string, () => Promise<Uint8Array>> = {
        sign: () => k.seatingSign(chart, { size: (v('#kSize') || '24x36') as never, design, order: v('#kOrder') === 'table' ? 'table' : 'alpha' }),
        escort: () => k.escortCards(chart, design), numbers: () => k.tableNumbers(chart, design), caterer: () => k.catererSheet(chart),
        tents: () => k.nameTents(chart, design), subplan: () => k.subPlan(chart),
      };
      if ((d.kit === 'tents' || d.kit === 'subplan') ? !isUnlocked('teacher') : !isUnlocked('printkit')) return;
      download(fname(d.kit + '.pdf').replace('.pdf.pdf', '.pdf'), (await run[d.kit]()) as BlobPart, 'application/pdf');
      return;
    }
    if (d.free || d.buy) {
      const p = (d.free || d.buy) as Product;
      if (p !== 'printkit' && p !== 'teacher') return;
      if (d.free) {
        const email = el.querySelector<HTMLInputElement>(`#em-${p}`)?.value.trim() || '';
        void sendProductEvent(p, 'free_download');
        if (email && looksLikeEmail(email)) void sendProductEvent(p, 'notify_email', email);
      } else {
        void sendProductEvent(p, 'buy_click');
        buyNotice[p] = true;
      }
      setUnlocked(p);
      render();
      return;
    }
    if (d.lock) { const id = d.lock; return commit(() => { chart.locked = chart.locked.includes(id) ? chart.locked.filter((x) => x !== id) : [...chart.locked, id]; }); }
    if (d.unseat) return seatGuest(d.unseat, null);
    if (d.tdel) { const id = d.tdel; return commit(() => { chart.tables = chart.tables.filter((x) => x.id !== id); for (const g of Object.keys(chart.seat)) if (chart.seat[g] === id) delete chart.seat[g]; }); }
    if (d.rdel) { const id = d.rdel; return commit(() => { chart.rules = chart.rules.filter((x) => x.id !== id); }); }
    if (d.guest !== undefined && !dragMoved) { selected = selected === d.guest ? null : d.guest; panel = 'guests'; render(); return; }
    if (d.table !== undefined && selected && !dragMoved) { const g = selected; selected = null; return seatGuest(g, d.table || null); }
    switch (b.id) {
      case 'add': {
        const ta = el.querySelector<HTMLTextAreaElement>('#paste')!;
        const gs = parseGuests(ta.value);
        if (gs.length) commit(() => { chart.guests.push(...gs); });
        return;
      }
      case 'tpl': return download('seating-chart-template.csv', CSV_TEMPLATE, 'text/csv');
      case 'gdel': { const id = selected!; selected = null; return commit(() => { chart.guests = chart.guests.filter((g) => g.id !== id); delete chart.seat[id]; chart.rules = chart.rules.filter((r) => r.a !== id && r.b !== id); chart.locked = chart.locked.filter((x) => x !== id); }); }
      case 'addt': {
        const shape = (el.querySelector<HTMLSelectElement>('#tshape')!.value) as Shape;
        const seats = clampSeats(Number(el.querySelector<HTMLInputElement>('#tseats')!.value));
        return commit(() => { const p = nextSpot(chart.tables, shape, seats); chart.tables.push({ id: uid('t'), name: `${shape === 'desk' ? 'Desk' : 'Table'} ${chart.tables.length + 1}`, shape, seats, ...p }); });
      }
      case 'addr': {
        const a = el.querySelector<HTMLSelectElement>('#ra')!.value, bb = el.querySelector<HTMLSelectElement>('#rb')!.value;
        const type = el.querySelector<HTMLSelectElement>('#rt')!.value as 'apart' | 'together';
        if (!a || !bb || a === bb) return;
        return commit(() => { chart.rules.push({ id: uid('r'), type, a, b: bb }); });
      }
      case 'auto': case 'shuffle': {
        const res = arrange(chart, { seed: Date.now() & 0xffffffff, shuffle: b.id === 'shuffle', apartRadius: apartRadius() });
        warnings = res.warnings;
        return commit(() => { chart.seat = res.seat; });
      }
      case 'clear': warnings = []; return commit(() => { chart.seat = {}; chart.locked = []; });
      case 'undo': { const prev = undo.pop(); if (prev) { chart = normalizeChart(JSON.parse(prev)); saveChart(chart); render(); } return; }
      case 'reset': if (confirm('Start a new empty chart? (Tip: save a backup first.)')) commit(() => { chart = emptyChart(chart.mode); }); return;
      case 'pdf': { const { chartPdf } = await import('./lib/pdf'); download(fname('pdf'), (await chartPdf(chart)) as BlobPart, 'application/pdf'); return; }
      case 'png': { const { chartPng } = await import('./lib/png'); download(fname('png'), await chartPng(chart), 'image/png'); return; }
      case 'csvout': {
        const tn = new Map(chart.tables.map((x) => [x.id, x.name]));
        const rows = [['Table', 'Name', 'Meal', 'Notes'], ...chart.tables.flatMap((x) => guestsAt(chart, x.id).map((g) => [x.name, g.name, g.meal, g.notes])), ...unseated(chart).map((g) => ['(not seated)', g.name, g.meal, g.notes])];
        void tn; return download(fname('csv'), toCsv(rows), 'text/csv');
      }
      case 'json': return download(fname('json'), backupJson(chart), 'application/json');
    }
  });
  const fname = (ext: string) => `${(chart.title || 'seating-chart').replace(/[^\w-]+/g, '-').toLowerCase()}${ext.includes('.') ? '-' : '.'}${ext}`;

  el.addEventListener('submit', (ev) => {
    const f = (ev.target as HTMLElement).closest('form[data-notify]') as HTMLFormElement | null;
    if (!f) return;
    ev.preventDefault();
    const p = f.dataset.notify as Product;
    const email = f.querySelector('input')?.value.trim() || '';
    if (!looksLikeEmail(email)) { notifyStatus[p] = 'That email does not look right. Your free copy is unlocked either way.'; render(); return; }
    notifyStatus[p] = 'Saving…'; render();
    void sendProductEvent(p, 'notify_email', email).then((ok) => {
      notifyStatus[p] = ok ? "Thanks. You're on the list for when payments open." : 'Could not save that right now. Your free copy is unlocked either way.';
      render();
    });
  });

  el.addEventListener('change', async (ev) => {
    const t = ev.target as HTMLInputElement;
    if (t.id === 'title') return commit(() => { chart.title = t.value.slice(0, 80); });
    if (t.dataset.tname) { const id = t.dataset.tname; return commit(() => { const x = chart.tables.find((q) => q.id === id); if (x) x.name = t.value.slice(0, 60) || x.name; }); }
    if (t.dataset.tseats) { const id = t.dataset.tseats; return commit(() => { const x = chart.tables.find((q) => q.id === id); if (x) x.seats = clampSeats(Number(t.value)); }); }
    if (t.dataset.gf && selected) { const f = t.dataset.gf as 'name' | 'group' | 'meal' | 'notes'; const id = selected; return commit(() => { const g = chart.guests.find((q) => q.id === id); if (g && (f !== 'name' || t.value.trim())) g[f] = t.value.trim().slice(0, f === 'notes' ? 300 : 80); }); }
    if ((t.id === 'csv' || t.id === 'restore') && t.files?.[0]) {
      const text = await t.files[0].text();
      if (t.id === 'csv') { const gs = parseGuests(text); if (gs.length) commit(() => { chart.guests.push(...gs); }); }
      else { try { const c = restoreJson(text, chart.mode); commit(() => { chart = c; }); } catch (err) { alert('Could not restore: ' + (err as Error).message); } }
    }
  });

  // ---- mouse/pen drag: guests onto tables, tables around the room ----
  let dragMoved = false;
  el.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'touch' || ev.button !== 0) return;
    const t = ev.target as HTMLElement;
    if (t.closest('button, input, select')) return;
    const chipEl = t.closest('[data-guest]') as HTMLElement | null;
    const mover = t.closest('[data-move]') as HTMLElement | null;
    if (!chipEl && !mover) return;
    dragMoved = false;
    const sx = ev.clientX, sy = ev.clientY;
    let ghost: HTMLElement | null = null;
    const tableId = mover?.dataset.move;
    const tbl = tableId ? chart.tables.find((x) => x.id === tableId) : null;
    const tEl = mover?.closest('.tbl') as HTMLElement | null;
    const ox = tbl?.x ?? 0, oy = tbl?.y ?? 0;
    const move = (m: PointerEvent) => {
      const dx = m.clientX - sx, dy = m.clientY - sy;
      if (!dragMoved && Math.hypot(dx, dy) < 5) return;
      dragMoved = true;
      if (chipEl) {
        if (!ghost) { ghost = chipEl.cloneNode(true) as HTMLElement; ghost.classList.add('ghost'); document.body.appendChild(ghost); }
        ghost.style.left = m.clientX + 8 + 'px'; ghost.style.top = m.clientY + 8 + 'px';
        el.querySelectorAll('.over').forEach((n) => n.classList.remove('over'));
        (document.elementFromPoint(m.clientX, m.clientY)?.closest('[data-table]') as HTMLElement | null)?.classList.add('over');
      } else if (tEl) {
        tEl.style.left = Math.max(0, Math.round((ox + dx) / 10) * 10) + 'px';
        tEl.style.top = Math.max(0, Math.round((oy + dy) / 10) * 10) + 'px';
      }
    };
    const up = (m: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      ghost?.remove();
      if (!dragMoved) return;
      setTimeout(() => (dragMoved = false), 0);
      if (chipEl) {
        const target = document.elementFromPoint(m.clientX, m.clientY)?.closest('[data-table]') as HTMLElement | null;
        if (target) seatGuest(chipEl.dataset.guest!, target.dataset.table || null); else render();
      } else if (tbl && tEl) {
        commit(() => { tbl.x = parseInt(tEl.style.left); tbl.y = parseInt(tEl.style.top); });
      }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });

  // template buttons in page content (outside the tool)
  document.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('[data-template]') as HTMLElement | null;
    if (!b || el.contains(b)) return;
    const spec = b.dataset.template!;
    if (spec === 'csv') return download('seating-chart-template.csv', CSV_TEMPLATE, 'text/csv');
    const [m, count, layout] = spec.split(':');
    if (m !== chart.mode) { saveChart(chart); chart = loadChart(m as Mode) ?? emptyChart(m as Mode); undo.length = 0; warnings = []; }
    panel = 'tables'; view = 'plan';
    applyLayout(layout, Number(count));
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  render();
  saveChart(chart);
  (window as unknown as { __scm: unknown }).__scm = { get chart() { return chart; } };
}

const root = document.getElementById("app");
if (root) init(root);
