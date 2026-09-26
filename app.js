/* Daftari la Duka — tap-to-sell prototype.
 * Plain JavaScript, no build step. All data stays on the phone (localStorage).
 *
 * Core idea: every sale is ONE tap. The tap records the money and removes the
 * right amount from stock. Restocking is recorded when stock is bought.
 * When a sack/box runs out, "Imeisha" compares what the taps say with reality.
 */
'use strict';

/* ============================== helpers ============================== */
const KEY = 'daftari.v1';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const r3 = n => Math.round(n * 1000) / 1000;
const fmt = n => Math.round(n).toLocaleString('en-US');
const tsh = n => 'TSh ' + fmt(n);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const timeOf = t => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const DAYS = ['Jumapili', 'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi'];
const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ago', 'Sep', 'Okt', 'Nov', 'Des'];
const dayName = key => { const [y, m, d] = key.split('-').map(Number); const dt = new Date(y, m - 1, d); return `${DAYS[dt.getDay()]} ${d} ${MONTHS[m - 1]} ${y}`; };

/** 12.25 -> "12¼", 0.5 -> "½", 3 -> "3", 0.125 -> "0.125" */
function qtyText(q, unit) {
  const neg = q < 0; q = Math.abs(r3(q));
  const w = Math.floor(q + 1e-9), f = r3(q - w);
  const fr = { 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' };
  let s = f in fr ? ((w || !fr[f]) ? String(w) : '') + fr[f] : String(q);
  if (s === '') s = '0';
  return (neg ? '−' : '') + s + (unit === 'kg' ? ' kg' : '');
}
const unitWord = unit => unit === 'kg' ? 'kilo' : 'kipande';

/* ============================== state ============================== */
let S = load();

function demoData() {
  // SAMPLE items and prices guessed from shop photos. Change them in Mipangilio.
  const kg = (name, p1, cost, stock, lowAt = 3) => ({
    id: uid(), name, unit: 'kg', cost, stock, lowAt, lastInQty: stock,
    portions: [{ label: '¼', qty: 0.25, price: Math.round(p1 / 4 / 50) * 50 }, { label: '½', qty: 0.5, price: p1 / 2 }, { label: '1 kg', qty: 1, price: p1 }],
  });
  const pc = (name, price, cost, stock, lowAt = 5, extra = []) => ({
    id: uid(), name, unit: 'pc', cost, stock, lowAt, lastInQty: stock,
    portions: [{ label: '1', qty: 1, price }, ...extra],
  });
  return {
    version: 1,
    shopName: 'Duka Langu',
    idleSeconds: 20,
    showSampleBanner: true,
    items: [
      kg('Mchele (Super)', 2800, 2400, 25),
      kg('Mchele (Kawaida)', 2000, 1700, 25),
      kg('Sukari', 3000, 2650, 25),
      kg('Unga wa Sembe', 1800, 1500, 25),
      pc('Mayai', 400, 330, 60, 12, [{ label: 'Trei (30)', qty: 30, price: 11500 }]),
      pc('Maji Uhai 1.5L', 1000, 750, 24, 6),
      pc('Maji Uhai 500ml', 500, 350, 24, 6),
      pc('Soda', 1000, 800, 24, 6),
      pc('Sabuni kipande', 1000, 800, 20),
      pc('Omo pakiti', 500, 400, 40, 10),
      pc('Royco pakiti', 200, 150, 50, 10),
      pc('Pampers (kimoja)', 500, 380, 40, 10),
      pc('Tishu', 800, 600, 20),
      pc('Pipi', 50, 30, 300, 50),
      pc('Big G / Jojo', 100, 70, 150, 30),
      pc('Kiberiti', 100, 70, 30, 10),
    ],
    customers: [],
    events: [],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.warn('load failed', e); }
  return demoData();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('⚠️ Imeshindwa kuhifadhi kwenye simu'); console.error(e); }
}
const itemById = id => S.items.find(i => i.id === id);
const custById = id => S.customers.find(c => c.id === id);

/** Price of one kg / one piece — used to value stock gaps. */
function unitPrice(item) {
  const p = item.portions.slice().sort((a, b) => Math.abs(a.qty - 1) - Math.abs(b.qty - 1))[0];
  return p ? p.price / p.qty : 0;
}
function balanceOf(cid) {
  let b = 0;
  for (const e of S.events) {
    if (e.void) continue;
    if ((e.type === 'sale' || e.type === 'other') && e.credit === cid) b += e.amount;
    if (e.type === 'payment' && e.customerId === cid) b -= e.amount;
  }
  return b;
}

/* ============================== UI plumbing ============================== */
let tab = 'sell';
let reportDay = dayKey(Date.now());

function go(t) {
  tab = t;
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  render();
  window.scrollTo(0, 0);
}
function render() {
  const v = $('#view');
  ({ sell: renderSell, stock: renderStock, debts: renderDebts, report: renderReport, settings: renderSettings })[tab](v);
}

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 1800);
}
function buzz() { try { navigator.vibrate && navigator.vibrate(35); } catch (e) {} }

function openSheet(html, mount) {
  const sh = $('#sheet'); sh.innerHTML = html; sh.hidden = false; $('#sheet-backdrop').hidden = false;
  sh.scrollTop = 0;
  mount && mount(sh);
}
function closeSheet() { $('#sheet').hidden = true; $('#sheet-backdrop').hidden = true; $('#sheet').innerHTML = ''; }
$('#sheet-backdrop').addEventListener('click', closeSheet);

/* ============================== SELL ============================== */
// The "current customer": taps grouped together until idle for a few seconds.
const basket = { ids: [], credit: null, last: 0 };

function renderSell(v) {
  const banner = S.showSampleBanner ? `
    <div class="banner"><span>ℹ️ Bidhaa na bei hizi ni <b>mfano</b>. Weka za duka lako kwenye ⚙️ Mipangilio.</span>
    <button id="hideBanner" aria-label="Funga">×</button></div>` : '';

  const cards = S.items.map(it => {
    const low = it.stock <= it.lowAt;
    const stock = `<span class="stock ${low ? 'low' : ''}">Stoo: ${qtyText(it.stock, it.unit)}</span>`;
    if (it.portions.length === 1) {
      const p = it.portions[0];
      return `<button class="tile" data-item="${it.id}" data-p="0">
        <span class="name">${esc(it.name)}</span>
        <span class="price">${fmt(p.price)}</span>${stock}</button>`;
    }
    const btns = it.portions.map((p, i) => `
      <button class="pbtn" data-item="${it.id}" data-p="${i}">
        <span class="pl">${esc(p.label)}</span><span class="pp">${fmt(p.price)}</span></button>`).join('');
    return `<div class="card ${it.unit === 'kg' ? 'kg' : ''}" id="card-${it.id}">
      <div class="head"><span class="name">${esc(it.name)}</span>${stock}</div>
      <div class="portions">${btns}</div></div>`;
  }).join('');

  v.innerHTML = `
    <div class="custbar ${basket.credit ? 'credit' : ''}" id="custbar">
      <button class="cust" id="cust" aria-label="Mteja mpya"></button>
      <div class="baractions">
        <button class="barbtn" id="undo">↶ Rudisha</button>
        <button class="barbtn" id="deni">${basket.credit ? 'Deni ✓' : 'Deni'}</button>
      </div>
      <div class="idle"><i id="idlebar"></i></div>
    </div>
    ${banner}
    <div class="grid">${cards}
      <button class="tile other" id="other"><span class="name">Nyingine</span><span class="price">+ Kiasi</span>
      <span class="stock">Bidhaa isiyo kwenye orodha</span></button>
    </div>`;

  updateCustBar();
  $('#hideBanner')?.addEventListener('click', () => { S.showSampleBanner = false; save(); render(); });
  $$('[data-item]', v).forEach(b => b.addEventListener('click', () => sell(b.dataset.item, +b.dataset.p, b)));
  $('#undo').addEventListener('click', undoLast);
  $('#deni').addEventListener('click', openCreditPicker);
  $('#other').addEventListener('click', openOther);
  $('#cust').addEventListener('click', () => { if (basket.ids.length) { clearBasket(); toast('Mteja mpya'); } });
}

function sell(itemId, pIndex, el) {
  const it = itemById(itemId); if (!it) return;
  const p = it.portions[pIndex];
  const e = {
    id: uid(), t: Date.now(), type: 'sale', itemId, name: it.name, label: p.label, unit: it.unit,
    qty: p.qty, amount: p.price, cost: r3(it.cost * p.qty), credit: basket.credit,
  };
  S.events.push(e);
  it.stock = r3(it.stock - p.qty);
  save();
  basket.ids.push(e.id); basket.last = Date.now();
  buzz();
  const target = el.classList.contains('pbtn') ? el : el;
  target.classList.remove('flash'); void target.offsetWidth; target.classList.add('flash');
  // refresh just the stock label on this item
  const low = it.stock <= it.lowAt;
  const lbl = (el.closest('.card') || el).querySelector('.stock');
  if (lbl) { lbl.textContent = 'Stoo: ' + qtyText(it.stock, it.unit); lbl.classList.toggle('low', low); }
  updateCustBar();
}

function basketEvents() { return basket.ids.map(id => S.events.find(e => e.id === id)).filter(e => e && !e.void); }

function updateCustBar() {
  const c = $('#cust'); if (!c) return;
  const evs = basketEvents();
  const total = evs.reduce((s, e) => s + e.amount, 0);
  // group lines: "Sukari ½ ×2"
  const g = new Map();
  for (const e of evs) { const k = e.type === 'other' ? 'Nyingine' : `${e.name} ${e.label}`; g.set(k, (g.get(k) || 0) + 1); }
  const lines = [...g].map(([k, n]) => n > 1 ? `${k} ×${n}` : k).join(' · ');
  const who = basket.credit ? `Deni: ${esc(custById(basket.credit)?.name || '')}` : (evs.length ? 'Mteja huyu' : 'Gusa bidhaa kuuza');
  c.innerHTML = `<div class="label">${who}</div><div class="total">${fmt(total)}</div><div class="lines">${esc(lines) || '&nbsp;'}</div>`;
  $('#custbar').classList.toggle('credit', !!basket.credit);
  $('#deni').textContent = basket.credit ? 'Deni ✓' : 'Deni';
}
function clearBasket() { basket.ids = []; basket.credit = null; basket.last = 0; updateCustBar(); }

// Idle timer: after N seconds without a tap, the next tap is a new customer.
setInterval(() => {
  const bar = $('#idlebar'); if (!bar) return;
  if (!basket.ids.length && !basket.credit) { bar.style.width = '0'; return; }
  const ms = (S.idleSeconds || 20) * 1000;
  const left = Math.max(0, 1 - (Date.now() - basket.last) / ms);
  bar.style.width = (left * 100) + '%';
  if (left === 0) clearBasket();
}, 200);

function undoLast() {
  const today = dayKey(Date.now());
  for (let i = S.events.length - 1; i >= 0; i--) {
    const e = S.events[i];
    if ((e.type === 'sale' || e.type === 'other') && !e.void && dayKey(e.t) === today) {
      e.void = true; e.voidT = Date.now();
      if (e.type === 'sale') { const it = itemById(e.itemId); if (it) it.stock = r3(it.stock + e.qty); }
      save();
      basket.ids = basket.ids.filter(id => id !== e.id);
      buzz(); toast(`Imefutwa: ${e.type === 'other' ? 'Nyingine' : e.name + ' ' + e.label} (${fmt(e.amount)})`);
      render();
      return;
    }
  }
  toast('Hakuna mauzo ya leo ya kufuta');
}

/* ---- credit (deni) ---- */
function openCreditPicker() {
  if (basket.credit) { basket.credit = null; basket.last = Date.now(); updateCustBar(); toast('Deni limezimwa'); return; }
  const list = S.customers.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c =>
    `<button data-c="${c.id}"><span>${esc(c.name)}</span><span class="muted small">${balanceOf(c.id) ? 'Anadaiwa ' + fmt(balanceOf(c.id)) : ''}</span></button>`).join('');
  openSheet(`
    <h2>Andika deni kwa nani?</h2>
    <p class="muted small">Bidhaa za mteja huyu (na zitakazofuata) zitaandikwa kama deni.</p>
    <div class="field"><label>Mteja mpya</label>
      <div style="display:flex;gap:8px"><input id="newc" placeholder="Jina (mf. Mama Asha)"><button class="btn primary" id="addc">Ongeza</button></div></div>
    <div class="custpick">${list || '<p class="muted">Bado hakuna wateja wa deni.</p>'}</div>
    <div class="btnrow"><button class="btn" id="cancel">Ghairi</button></div>`, sh => {
    $$('[data-c]', sh).forEach(b => b.addEventListener('click', () => setCredit(b.dataset.c)));
    $('#addc', sh).addEventListener('click', () => {
      const n = $('#newc', sh).value.trim(); if (!n) return;
      const c = { id: uid(), name: n }; S.customers.push(c); save(); setCredit(c.id);
    });
    $('#cancel', sh).addEventListener('click', closeSheet);
  });
}
function setCredit(cid) {
  basket.credit = cid; basket.last = Date.now();
  // move everything this customer already took onto credit
  for (const e of basketEvents()) e.credit = cid;
  save(); closeSheet(); updateCustBar();
  toast(`Deni: ${custById(cid)?.name}`);
}

/* ---- "Nyingine": item not on the list, amount only ---- */
function openOther() {
  let amt = '';
  openSheet(`
    <h2>Nyingine</h2><p class="muted small">Bidhaa isiyo kwenye orodha. Inarekodi pesa tu (haipunguzi stoo).</p>
    <div class="amount" id="amt">0</div>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '00', 0, '⌫'].map(k => `<button data-k="${k}">${k}</button>`).join('')}</div>
    <div class="field"><label>Maelezo (si lazima)</label><input id="note" placeholder="mf. mafuta ya taa"></div>
    <div class="btnrow"><button class="btn" id="cancel">Ghairi</button><button class="btn primary" id="ok">Weka</button></div>`, sh => {
    const show = () => ($('#amt', sh).textContent = amt ? fmt(+amt) : '0');
    $$('[data-k]', sh).forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.k;
      if (k === '⌫') amt = amt.slice(0, -1); else if (amt.length < 8) amt = (amt + k).replace(/^0+/, '');
      show();
    }));
    $('#cancel', sh).addEventListener('click', closeSheet);
    $('#ok', sh).addEventListener('click', () => {
      const a = +amt; if (!a) return;
      const e = { id: uid(), t: Date.now(), type: 'other', amount: a, note: $('#note', sh).value.trim(), credit: basket.credit };
      S.events.push(e); save();
      basket.ids.push(e.id); basket.last = Date.now();
      closeSheet(); buzz(); updateCustBar(); toast(`Nyingine: ${fmt(a)}`);
    });
  });
}

/* ============================== STOCK ============================== */
function renderStock(v) {
  const rows = S.items.map(it => {
    const low = it.stock <= it.lowAt;
    const last = [...S.events].reverse().find(e => e.type === 'finish' && e.itemId === it.id);
    const lastTxt = last ? `Ukaguzi wa mwisho: ${statusPill(last.status)}` : '';
    return `<div class="row stack"><div class="grow">
        <div class="title">${esc(it.name)}</div>
        <div class="sub ${low ? '' : ''}">Stoo: <b style="color:${low ? 'var(--danger)' : 'inherit'}">${qtyText(it.stock, it.unit)}</b>
          ${it.unit === 'pc' ? 'vipande' : ''} · Bei ya kununua ${fmt(it.cost)}/${unitWord(it.unit)} ${lastTxt ? '<br>' + lastTxt : ''}</div>
      </div>
      <div class="actions">
        <button class="btn sm primary" data-in="${it.id}">+ Mzigo</button>
        <button class="btn sm warn" data-fin="${it.id}">Imeisha</button>
        <button class="btn sm" data-use="${it.id}">Matumizi</button>
      </div></div>`;
  }).join('');
  v.innerHTML = `<div class="screen">
    <h1>Stoo</h1>
    <p class="muted small"><b>+ Mzigo</b>: ukinunua bidhaa. <b>Imeisha</b>: gunia/boksi likiisha, tunalinganisha na mauzo.
    <b>Matumizi</b>: ya nyumbani au iliyoharibika.</p>
    <div class="list">${rows}</div></div>`;
  $$('[data-in]', v).forEach(b => b.addEventListener('click', () => openStockIn(b.dataset.in)));
  $$('[data-fin]', v).forEach(b => b.addEventListener('click', () => openFinish(b.dataset.fin)));
  $$('[data-use]', v).forEach(b => b.addEventListener('click', () => openUse(b.dataset.use)));
}
function statusPill(s) {
  return s === 'ok' ? '<span class="pill ok">Sawa</span>' : s === 'gap' ? '<span class="pill gap">Pengo</span>' : '<span class="pill over">Zaidi</span>';
}

function openStockIn(id) {
  const it = itemById(id);
  const chips = it.unit === 'kg' ? [1, 5, 10, 25, 50] : [6, 12, 24, 30, 50, 100, 150];
  openSheet(`
    <h2>+ Mzigo: ${esc(it.name)}</h2>
    <p class="muted small">Stoo sasa: ${qtyText(it.stock, it.unit)}</p>
    <div class="field"><label>Kiasi ulichonunua (${it.unit === 'kg' ? 'kilo' : 'vipande'})</label>
      <input id="q" type="number" inputmode="decimal" min="0" step="any">
      <div class="chips">${chips.map(c => `<button class="chip" data-q="${c}">${c}</button>`).join('')}</div></div>
    <div class="field"><label>Umelipa jumla (TSh)</label><input id="paid" type="number" inputmode="numeric" min="0"></div>
    <p class="muted small" id="per"></p>
    <div class="btnrow"><button class="btn" id="cancel">Ghairi</button><button class="btn primary" id="ok">Hifadhi</button></div>`, sh => {
    const q = $('#q', sh), paid = $('#paid', sh), per = $('#per', sh);
    const upd = () => { const a = +q.value, b = +paid.value; per.textContent = a && b ? `= ${fmt(b / a)} kwa ${unitWord(it.unit)} (unauza ${fmt(unitPrice(it))})` : ''; };
    $$('[data-q]', sh).forEach(c => c.addEventListener('click', () => { q.value = c.dataset.q; upd(); }));
    q.addEventListener('input', upd); paid.addEventListener('input', upd);
    $('#cancel', sh).addEventListener('click', closeSheet);
    $('#ok', sh).addEventListener('click', () => {
      const a = +q.value; if (!(a > 0)) { q.focus(); return; }
      const b = +paid.value || 0;
      if (b > 0) it.cost = r3(b / a);
      it.stock = r3(it.stock + a); it.lastInQty = a;
      S.events.push({ id: uid(), t: Date.now(), type: 'stockin', itemId: id, name: it.name, unit: it.unit, qty: a, paid: b });
      save(); closeSheet(); toast(`Mzigo umeingia: ${it.name} +${qtyText(a, it.unit)}`); render();
    });
  });
}

/** "Imeisha": the sack/box is empty. Whatever stock the app still shows was never tapped. */
function openFinish(id) {
  const it = itemById(id);
  const left = r3(it.stock);
  const base = it.lastInQty || Math.abs(left) || 1;
  const tol = it.unit === 'kg' ? Math.max(0.1, base * 0.05) : Math.floor(base * 0.03);
  const status = left > tol ? 'gap' : left < -tol ? 'over' : 'ok';
  const value = Math.abs(left) * unitPrice(it);
  const msg = status === 'ok'
    ? `<div class="big">✅ Sawa</div>Mauzo uliyobonyeza yanalingana na mzigo${left ? ` (tofauti ndogo ${qtyText(Math.abs(left), it.unit)} — kawaida kwa kupima/kumwagika)` : ''}.`
    : status === 'gap'
      ? `<div class="big">⚠️ Pengo: ${qtyText(left, it.unit)}${it.unit === 'pc' ? ' vipande' : ''} ≈ ${tsh(value)}</div>
         Kwa mujibu wa mauzo yaliyobonyezwa, bado kungebaki ${qtyText(left, it.unit)}. Hizi ziliuzwa bila kubonyezwa, zilitumika, au zimepotea.`
      : `<div class="big">ℹ️ Umeuza zaidi ya mzigo: ${qtyText(-left, it.unit)}</div>
         Mauzo yaliyobonyezwa ni mengi kuliko mzigo ulioingizwa. Huenda mzigo mpya haukuingizwa, au bei/kipimo si sahihi.`;
  openSheet(`
    <h2>Imeisha: ${esc(it.name)}</h2>
    <p class="muted small">Thibitisha kuwa ${it.unit === 'kg' ? 'gunia/mfuko' : 'boksi/bidhaa'} hii imeisha kabisa dukani.</p>
    <div class="result ${status}">${msg}</div>
    <div class="btnrow"><button class="btn" id="cancel">Ghairi</button><button class="btn primary" id="ok">Ndiyo, imeisha</button></div>`, sh => {
    $('#cancel', sh).addEventListener('click', closeSheet);
    $('#ok', sh).addEventListener('click', () => {
      S.events.push({ id: uid(), t: Date.now(), type: 'finish', itemId: id, name: it.name, unit: it.unit, remaining: left, status, value: status === 'gap' ? value : 0 });
      it.stock = 0; save(); closeSheet(); render();
      openSheet(`<h2>Umeleta mzigo mpya wa ${esc(it.name)}?</h2>
        <div class="btnrow"><button class="btn" id="no">Bado</button><button class="btn primary" id="yes">Ndiyo, ingiza</button></div>`, s2 => {
        $('#no', s2).addEventListener('click', closeSheet);
        $('#yes', s2).addEventListener('click', () => openStockIn(id));
      });
    });
  });
}

function openUse(id) {
  const it = itemById(id);
  const chips = it.unit === 'kg' ? [0.25, 0.5, 1, 2] : [1, 2, 3, 5];
  openSheet(`
    <h2>Matumizi / Imeharibika: ${esc(it.name)}</h2>
    <p class="muted small">Kwa bidhaa iliyotumika nyumbani au kuharibika. Inapunguza stoo bila kuwa mauzo, ili isionekane kama pengo.</p>
    <div class="field"><label>Kiasi (${it.unit === 'kg' ? 'kilo' : 'vipande'})</label>
      <input id="q" type="number" inputmode="decimal" min="0" step="any">
      <div class="chips">${chips.map(c => `<button class="chip" data-q="${c}">${qtyText(c, it.unit)}</button>`).join('')}</div></div>
    <div class="field"><label>Sababu</label><select id="why"><option>Nyumbani</option><option>Imeharibika</option><option>Nyingine</option></select></div>
    <div class="btnrow"><button class="btn" id="cancel">Ghairi</button><button class="btn primary" id="ok">Hifadhi</button></div>`, sh => {
    $$('[data-q]', sh).forEach(c => c.addEventListener('click', () => ($('#q', sh).value = c.dataset.q)));
    $('#cancel', sh).addEventListener('click', closeSheet);
    $('#ok', sh).addEventListener('click', () => {
      const q = +$('#q', sh).value; if (!(q > 0)) return;
      it.stock = r3(it.stock - q);
      S.events.push({ id: uid(), t: Date.now(), type: 'use', itemId: id, name: it.name, unit: it.unit, qty: q, why: $('#why', sh).value, cost: r3(q * it.cost) });
      save(); closeSheet(); toast('Imehifadhiwa'); render();
    });
  });
}

/* ============================== DEBTS ============================== */
function renderDebts(v) {
  const rows = S.customers.map(c => ({ c, b: balanceOf(c.id) })).sort((a, b) => b.b - a.b);
  const total = rows.reduce((s, r) => s + Math.max(0, r.b), 0);
  v.innerHTML = `<div class="screen">
    <h1>Madeni</h1>
    <div class="stats"><div class="stat big"><div class="k">Jumla unayodai</div><div class="v">${tsh(total)}</div></div></div>
    <h2>Wateja</h2>
    <div class="list">${rows.length ? rows.map(({ c, b }) => `
      <div class="row"><div class="grow"><div class="title">${esc(c.name)}</div>
        <div class="sub">${b > 0 ? 'Anadaiwa' : b < 0 ? 'Ana salio' : 'Hana deni'}</div></div>
        <div class="num" style="color:${b > 0 ? 'var(--danger)' : 'inherit'}">${fmt(Math.abs(b))}</div>
        <button class="btn sm" data-open="${c.id}">Fungua</button></div>`).join('')
      : '<div class="empty">Bado hakuna madeni. Kwenye <b>Uza</b>, bonyeza bidhaa kisha <b>Deni</b> kuchagua mteja.</div>'}</div>
    <p class="muted small">Kuandika deni: kwenye skrini ya Uza, gusa bidhaa za mteja kisha bonyeza <b>Deni</b>.</p></div>`;
  $$('[data-open]', v).forEach(b => b.addEventListener('click', () => openCustomer(b.dataset.open)));
}

function openCustomer(cid) {
  const c = custById(cid);
  const hist = S.events.filter(e => !e.void && ((e.credit === cid && (e.type === 'sale' || e.type === 'other')) || (e.type === 'payment' && e.customerId === cid)))
    .slice(-40).reverse();
  const b = balanceOf(cid);
  openSheet(`
    <h2>${esc(c.name)}</h2>
    <p><b style="font-size:22px;color:${b > 0 ? 'var(--danger)' : 'inherit'}">${b > 0 ? 'Anadaiwa ' : ''}${tsh(Math.abs(b))}</b></p>
    <div class="field"><label>Amelipa (TSh)</label>
      <div style="display:flex;gap:8px"><input id="amt" type="number" inputmode="numeric" min="0" placeholder="${b > 0 ? fmt(b) : ''}">
      <button class="btn primary" id="pay">Amelipa</button></div>
      ${b > 0 ? `<div class="chips"><button class="chip" id="all">Yote (${fmt(b)})</button></div>` : ''}</div>
    <h2 style="font-size:16px;margin-top:16px">Historia</h2>
    <div class="list">${hist.map(e => `<div class="row"><div class="grow"><div class="title">${e.type === 'payment' ? 'Malipo' : e.type === 'other' ? 'Nyingine' : esc(e.name + ' ' + e.label)}</div>
      <div class="sub">${dayName(dayKey(e.t))} · ${timeOf(e.t)}</div></div>
      <div class="num" style="color:${e.type === 'payment' ? 'var(--ok)' : 'inherit'}">${e.type === 'payment' ? '−' : '+'}${fmt(e.amount)}</div></div>`).join('') || '<div class="empty">Hakuna historia</div>'}</div>
    <div class="btnrow"><button class="btn danger" id="del">Futa mteja</button><button class="btn" id="close">Funga</button></div>`, sh => {
    $('#close', sh).addEventListener('click', closeSheet);
    $('#all', sh)?.addEventListener('click', () => ($('#amt', sh).value = b));
    $('#pay', sh).addEventListener('click', () => {
      const a = +$('#amt', sh).value; if (!(a > 0)) return;
      S.events.push({ id: uid(), t: Date.now(), type: 'payment', customerId: cid, amount: a });
      save(); closeSheet(); toast(`${c.name} amelipa ${fmt(a)}`); render();
    });
    $('#del', sh).addEventListener('click', () => {
      if (balanceOf(cid) !== 0) { toast('Mteja bado ana deni — haiwezi kufutwa'); return; }
      S.customers = S.customers.filter(x => x.id !== cid); save(); closeSheet(); render();
    });
  });
}

/* ============================== REPORT ============================== */
function reportData(day) {
  const evs = S.events.filter(e => dayKey(e.t) === day);
  const sales = evs.filter(e => (e.type === 'sale' || e.type === 'other') && !e.void);
  const total = sales.reduce((s, e) => s + e.amount, 0);
  const credit = sales.filter(e => e.credit).reduce((s, e) => s + e.amount, 0);
  const cash = total - credit;
  const itemSales = sales.filter(e => e.type === 'sale');
  const profit = itemSales.reduce((s, e) => s + e.amount - (e.cost || 0), 0);
  const otherTotal = sales.filter(e => e.type === 'other').reduce((s, e) => s + e.amount, 0);
  const payments = evs.filter(e => e.type === 'payment' && !e.void).reduce((s, e) => s + e.amount, 0);
  const voids = evs.filter(e => e.void).length;
  const byItem = new Map();
  for (const e of itemSales) {
    const r = byItem.get(e.itemId) || { name: e.name, unit: e.unit, qty: 0, amount: 0, profit: 0, n: 0 };
    r.qty = r3(r.qty + e.qty); r.amount += e.amount; r.profit += e.amount - (e.cost || 0); r.n++;
    byItem.set(e.itemId, r);
  }
  const items = [...byItem.values()].sort((a, b) => b.amount - a.amount);
  const checks = evs.filter(e => e.type === 'finish');
  const uses = evs.filter(e => e.type === 'use');
  const stockins = evs.filter(e => e.type === 'stockin');
  const low = S.items.filter(i => i.stock <= i.lowAt);
  return { day, total, credit, cash, profit, otherTotal, payments, expected: cash + payments, voids, count: sales.length, items, checks, uses, stockins, low };
}

function shiftDay(key, n) { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n).getTime()); }

function renderReport(v) {
  const R = reportData(reportDay);
  const isToday = reportDay === dayKey(Date.now());
  v.innerHTML = `<div class="screen">
    <h1>Ripoti</h1>
    <div class="daynav"><button class="btn" id="prev">‹</button><div class="d">${isToday ? 'Leo · ' : ''}${dayName(reportDay)}</div>
      <button class="btn" id="next" ${isToday ? 'disabled' : ''}>›</button></div>
    <div class="stats">
      <div class="stat big"><div class="k">Mauzo jumla</div><div class="v">${tsh(R.total)}</div></div>
      <div class="stat"><div class="k">Taslimu</div><div class="v">${fmt(R.cash)}</div></div>
      <div class="stat"><div class="k">Deni</div><div class="v">${fmt(R.credit)}</div></div>
      <div class="stat"><div class="k">Faida (makadirio)</div><div class="v" style="color:var(--ok)">${fmt(R.profit)}</div></div>
      <div class="stat"><div class="k">Idadi ya mauzo</div><div class="v">${R.count}</div></div>
    </div>

    <h2>Pesa inayotarajiwa kwenye droo</h2>
    <div class="list">
      <div class="row"><div class="grow">Mauzo ya taslimu</div><div class="num">${fmt(R.cash)}</div></div>
      <div class="row"><div class="grow">Madeni yaliyolipwa</div><div class="num">${fmt(R.payments)}</div></div>
      <div class="row"><div class="grow"><b>Inatarajiwa</b></div><div class="num">${fmt(R.expected)}</div></div>
      <div class="row"><div class="grow"><label class="small muted" for="counted">Ukihesabu droo (si lazima)</label>
        <input id="counted" type="number" inputmode="numeric" placeholder="Weka kiasi" style="width:100%;min-height:44px;border:1px solid var(--line);border-radius:10px;padding:6px 10px;font-size:17px"></div>
        <div class="num" id="diff"></div></div>
    </div>
    ${R.voids ? `<p class="small muted">Mauzo ${R.voids} yalifutwa kwa ↶ Rudisha leo.</p>` : ''}

    <h2>Kwa bidhaa</h2>
    <div class="list">${R.items.map(r => `<div class="row"><div class="grow"><div class="title">${esc(r.name)}</div>
      <div class="sub">${qtyText(r.qty, r.unit)}${r.unit === 'pc' ? ' vipande' : ''} · faida ${fmt(r.profit)}</div></div><div class="num">${fmt(r.amount)}</div></div>`).join('')
      + (R.otherTotal ? `<div class="row"><div class="grow"><div class="title">Nyingine</div><div class="sub">faida haijulikani</div></div><div class="num">${fmt(R.otherTotal)}</div></div>` : '')
      || '<div class="empty">Hakuna mauzo siku hii</div>'}</div>

    ${R.low.length ? `<h2>Karibu kuisha — nunua</h2><div class="list">${R.low.map(i => `<div class="row"><div class="grow">${esc(i.name)}</div>
      <div class="num" style="color:var(--danger)">${qtyText(i.stock, i.unit)}</div></div>`).join('')}</div>` : ''}

    ${R.checks.length ? `<h2>Ukaguzi (Imeisha)</h2><div class="list">${R.checks.map(c => `<div class="row"><div class="grow"><div class="title">${esc(c.name)}</div>
      <div class="sub">${timeOf(c.t)} · ${c.status === 'gap' ? 'Pengo ' + qtyText(c.remaining, c.unit) : c.status === 'over' ? 'Zaidi ' + qtyText(-c.remaining, c.unit) : 'Sawa'}</div></div>
      ${statusPill(c.status)}${c.value ? `<div class="num" style="color:var(--danger)">≈${fmt(c.value)}</div>` : ''}</div>`).join('')}</div>` : ''}

    ${R.uses.length ? `<h2>Matumizi / Imeharibika</h2><div class="list">${R.uses.map(u => `<div class="row"><div class="grow">${esc(u.name)} · ${esc(u.why)}</div>
      <div class="num">${qtyText(u.qty, u.unit)}</div></div>`).join('')}</div>` : ''}

    <div style="margin-top:18px"><button class="btn block primary" id="wa">📤 Tuma ripoti kwa WhatsApp</button></div>
  </div>`;
  $('#prev').addEventListener('click', () => { reportDay = shiftDay(reportDay, -1); render(); });
  $('#next').addEventListener('click', () => { if (!isToday) { reportDay = shiftDay(reportDay, 1); render(); } });
  $('#counted').addEventListener('input', e => {
    const c = +e.target.value, d = $('#diff');
    if (!e.target.value) { d.textContent = ''; return; }
    const diff = c - R.expected;
    d.innerHTML = diff === 0 ? '<span class="pill ok">Sawa</span>' : `<span style="color:${diff < 0 ? 'var(--danger)' : 'var(--ok)'}">${diff < 0 ? 'Pungufu ' : 'Ziada '}${fmt(Math.abs(diff))}</span>`;
  });
  $('#wa').addEventListener('click', () => window.open('https://wa.me/?text=' + encodeURIComponent(reportText(R)), '_blank'));
}

function reportText(R) {
  const L = [];
  L.push(`*${S.shopName} — Ripoti ya ${dayName(R.day)}*`);
  L.push(`Mauzo: ${tsh(R.total)} (${R.count})`);
  L.push(`Taslimu: ${fmt(R.cash)} · Deni: ${fmt(R.credit)}`);
  L.push(`Madeni yaliyolipwa: ${fmt(R.payments)}`);
  L.push(`Droo inatarajiwa: ${tsh(R.expected)}`);
  L.push(`Faida (makadirio): ${tsh(R.profit)}`);
  if (R.voids) L.push(`Yaliyofutwa: ${R.voids}`);
  if (R.items.length) { L.push(''); L.push('_Bidhaa zilizouzwa zaidi:_'); R.items.slice(0, 8).forEach(r => L.push(`• ${r.name}: ${qtyText(r.qty, r.unit)} = ${fmt(r.amount)}`)); }
  if (R.checks.some(c => c.status !== 'ok')) { L.push(''); L.push('_Ukaguzi:_'); R.checks.filter(c => c.status !== 'ok').forEach(c => L.push(`• ${c.name}: ${c.status === 'gap' ? 'pengo ' + qtyText(c.remaining, c.unit) + ' ≈ ' + fmt(c.value) : 'zaidi ya mzigo'}`)); }
  if (R.low.length) { L.push(''); L.push('_Karibu kuisha:_ ' + R.low.map(i => i.name).join(', ')); }
  return L.join('\n');
}

/* ============================== SETTINGS ============================== */
function renderSettings(v) {
  v.innerHTML = `<div class="screen">
    <h1>Mipangilio</h1>
    <div class="list">
      <div class="row"><div class="grow"><div class="title">Jina la duka</div><div class="sub">${esc(S.shopName)}</div></div><button class="btn sm" id="shop">Badilisha</button></div>
      <div class="row"><div class="grow"><div class="title">Muda wa mteja mmoja</div><div class="sub">Sekunde ${S.idleSeconds} bila kugusa = mteja mpya</div></div><button class="btn sm" id="idle">Badilisha</button></div>
    </div>
    <h2>Bidhaa (${S.items.length})</h2>
    <div class="list">${S.items.map((it, i) => `<div class="row"><div class="grow"><div class="title">${esc(it.name)}</div>
      <div class="sub">${it.portions.map(p => `${esc(p.label)} = ${fmt(p.price)}`).join(' · ')}</div></div>
      <div class="actions"><button class="btn sm" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="btn sm" data-edit="${it.id}">Hariri</button></div></div>`).join('')}</div>
    <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <button class="btn primary" id="addkg">+ Bidhaa ya kilo</button><button class="btn primary" id="addpc">+ Bidhaa ya kipande</button></div>
    <h2>Nakala (backup)</h2>
    <p class="muted small">Taarifa zote zinakaa kwenye simu hii tu. Hifadhi nakala mara kwa mara.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <button class="btn" id="export">⬇️ Hifadhi nakala</button>
      <label class="btn" style="display:flex;align-items:center;justify-content:center">⬆️ Rejesha<input id="import" type="file" accept="application/json" hidden></label>
    </div>
    <div style="margin-top:10px"><button class="btn danger block" id="reset">Futa kila kitu na anza upya (mfano)</button></div>
    <p class="muted small" style="margin-top:14px">Daftari · toleo la majaribio (prototype)</p>
  </div>`;
  $('#shop').addEventListener('click', () => promptText('Jina la duka', S.shopName, val => { S.shopName = val; save(); render(); }));
  $('#idle').addEventListener('click', () => promptText('Sekunde (mf. 20)', String(S.idleSeconds), val => { const n = Math.max(5, Math.min(120, +val || 20)); S.idleSeconds = n; save(); render(); }, 'number'));
  $$('[data-up]', v).forEach(b => b.addEventListener('click', () => { const i = +b.dataset.up; [S.items[i - 1], S.items[i]] = [S.items[i], S.items[i - 1]]; save(); render(); }));
  $$('[data-edit]', v).forEach(b => b.addEventListener('click', () => openItemEditor(b.dataset.edit)));
  $('#addkg').addEventListener('click', () => openItemEditor(null, 'kg'));
  $('#addpc').addEventListener('click', () => openItemEditor(null, 'pc'));
  $('#export').addEventListener('click', exportData);
  $('#import').addEventListener('change', importData);
  $('#reset').addEventListener('click', () => openSheet(`<h2>Futa kila kitu?</h2><p>Mauzo, madeni na bidhaa zote zitafutwa na kurudi kwenye mfano. Hifadhi nakala kwanza.</p>
    <div class="btnrow"><button class="btn" id="no">Hapana</button><button class="btn danger" id="yes">Ndiyo, futa</button></div>`, sh => {
    $('#no', sh).addEventListener('click', closeSheet);
    $('#yes', sh).addEventListener('click', () => { S = demoData(); save(); clearBasket(); closeSheet(); go('sell'); });
  }));
}

function promptText(label, value, done, type = 'text') {
  openSheet(`<h2>${esc(label)}</h2><div class="field"><input id="val" type="${type}" value="${esc(value)}"></div>
    <div class="btnrow"><button class="btn" id="no">Ghairi</button><button class="btn primary" id="yes">Hifadhi</button></div>`, sh => {
    $('#no', sh).addEventListener('click', closeSheet);
    $('#yes', sh).addEventListener('click', () => { const v = $('#val', sh).value.trim(); if (!v) return; closeSheet(); done(v); });
  });
}

function openItemEditor(id, unitForNew) {
  const isNew = !id;
  const it = isNew ? {
    id: uid(), name: '', unit: unitForNew, cost: 0, stock: 0, lowAt: unitForNew === 'kg' ? 3 : 5, lastInQty: 0,
    portions: unitForNew === 'kg'
      ? [{ label: '¼', qty: 0.25, price: 0 }, { label: '½', qty: 0.5, price: 0 }, { label: '1 kg', qty: 1, price: 0 }]
      : [{ label: '1', qty: 1, price: 0 }],
  } : JSON.parse(JSON.stringify(itemById(id)));

  const prow = (p, i) => `<div class="prow" data-i="${i}">
    <input class="pl" value="${esc(p.label)}" placeholder="Jina">
    <input class="pq" type="number" inputmode="decimal" step="any" value="${p.qty}" placeholder="Kiasi">
    <input class="pp" type="number" inputmode="numeric" value="${p.price || ''}" placeholder="Bei">
    <button class="x" data-rm="${i}" aria-label="Ondoa">×</button></div>`;

  openSheet(`
    <h2>${isNew ? 'Bidhaa mpya' : 'Hariri bidhaa'}</h2>
    <div class="field"><label>Jina</label><input id="name" value="${esc(it.name)}" placeholder="mf. Sukari"></div>
    <div class="field"><label>Inauzwa kwa</label><select id="unit">
      <option value="kg" ${it.unit === 'kg' ? 'selected' : ''}>Kilo (¼, ½, 1 kg…)</option>
      <option value="pc" ${it.unit === 'pc' ? 'selected' : ''}>Kipande</option></select></div>
    <div class="field"><label>Vitufe vya kuuza — jina · kiasi (<span id="uw">${it.unit === 'kg' ? 'kilo' : 'vipande'}</span>) · bei (TSh)</label>
      <div class="phead"><span>Jina</span><span>Kiasi</span><span>Bei</span><span></span></div>
      <div id="prows">${it.portions.map(prow).join('')}</div>
      <button class="btn sm" id="addp">+ Kitufe</button></div>
    <div class="field"><label>Bei ya kununua kwa <span id="uw2">${unitWord(it.unit)}</span> (TSh)</label><input id="cost" type="number" inputmode="numeric" value="${it.cost || ''}"></div>
    <div class="field"><label>Stoo iliyopo sasa</label><input id="stock" type="number" inputmode="decimal" step="any" value="${it.stock}"></div>
    <div class="field"><label>Nionye ikifika (karibu kuisha)</label><input id="low" type="number" inputmode="decimal" step="any" value="${it.lowAt}"></div>
    <div class="btnrow">${isNew ? '' : '<button class="btn danger" id="del">Futa</button>'}<button class="btn" id="cancel">Ghairi</button><button class="btn primary" id="ok">Hifadhi</button></div>`, sh => {
    const readRows = () => $$('.prow', sh).map(r => ({ label: $('.pl', r).value.trim(), qty: +$('.pq', r).value, price: +$('.pp', r).value }));
    const redraw = rows => { $('#prows', sh).innerHTML = rows.map(prow).join(''); bindRm(); };
    const bindRm = () => $$('[data-rm]', sh).forEach(b => b.addEventListener('click', () => { const rows = readRows(); rows.splice(+b.dataset.rm, 1); redraw(rows); }));
    bindRm();
    $('#addp', sh).addEventListener('click', () => { const rows = readRows(); rows.push({ label: '', qty: 1, price: 0 }); redraw(rows); });
    $('#unit', sh).addEventListener('change', e => {
      const u = e.target.value; $('#uw', sh).textContent = u === 'kg' ? 'kilo' : 'vipande'; $('#uw2', sh).textContent = unitWord(u);
      const rows = readRows();
      if (u === 'kg' && rows.every(r => !r.price)) redraw([{ label: '¼', qty: 0.25, price: 0 }, { label: '½', qty: 0.5, price: 0 }, { label: '1 kg', qty: 1, price: 0 }]);
    });
    $('#cancel', sh).addEventListener('click', closeSheet);
    $('#del', sh)?.addEventListener('click', () => {
      S.items = S.items.filter(x => x.id !== it.id); save(); closeSheet(); toast('Bidhaa imefutwa'); render();
    });
    $('#ok', sh).addEventListener('click', () => {
      const name = $('#name', sh).value.trim();
      const portions = readRows().filter(p => p.label && p.qty > 0 && p.price > 0);
      if (!name) { toast('Weka jina la bidhaa'); return; }
      if (!portions.length) { toast('Weka angalau kitufe kimoja chenye kiasi na bei'); return; }
      const newStock = +$('#stock', sh).value || 0;
      const orig = isNew ? null : itemById(it.id);
      if (orig && r3(newStock) !== r3(orig.stock)) {
        S.events.push({ id: uid(), t: Date.now(), type: 'adjust', itemId: it.id, name, unit: $('#unit', sh).value, from: orig.stock, to: newStock });
      }
      Object.assign(it, {
        name, unit: $('#unit', sh).value, portions,
        cost: +$('#cost', sh).value || 0, stock: r3(newStock), lowAt: +$('#low', sh).value || 0,
      });
      if (isNew) { it.lastInQty = it.stock; S.items.push(it); } else Object.assign(orig, it);
      save(); closeSheet(); toast('Imehifadhiwa'); render();
    });
  });
}

function exportData() {
  const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `daftari-${dayKey(Date.now())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function importData(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.items) || !Array.isArray(d.events)) throw new Error('bad file');
      S = d; save(); clearBasket(); toast('Nakala imerejeshwa'); go('sell');
    } catch (err) { toast('Faili si sahihi'); }
  };
  r.readAsText(f);
}

/* ============================== boot ============================== */
$$('#tabs button').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
go('sell');

// Keep the screen awake while the app is open (phone stands on the counter).
let wake = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wake = await navigator.wakeLock.request('screen'); } catch (e) {}
}
document.addEventListener('visibilitychange', keepAwake);
keepAwake();

// Ask the browser not to clear our data when the phone is low on space.
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

// Offline support.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
