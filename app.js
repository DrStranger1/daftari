/* Daftari la Duka — tap-to-sell app for kiosks.
 * Plain JavaScript, no build step. All data stays on the phone (localStorage).
 *
 * Core idea: every sale is ONE tap. The tap records the money and removes the
 * right amount from stock. The customer's items stay on screen until "Maliza".
 * Owner and helpers log in with a 4-digit PIN; every record says who did it.
 */
'use strict';

/* ============================== helpers ============================== */
const KEY = 'daftari.v1';            // storage key (the data inside carries its own version)
const SESSION_KEY = 'daftari.session';
const BASKET_KEY = 'daftari.basket';
const CATS = ['Vyakula', 'Vinywaji', 'Usafi', 'Vitafunwa', 'Nyinginezo'];
const OWNER_ELEVATE_MS = 3 * 60 * 1000;

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
const round50 = n => Math.round(n / 50) * 50;

/* ============================== state ============================== */
function kgPortions(p1) {
  return [{ label: '¼', qty: 0.25, price: round50(p1 / 4) }, { label: '½', qty: 0.5, price: round50(p1 / 2) }, { label: '1 kg', qty: 1, price: p1 }];
}

function demoData() {
  // SAMPLE items and prices guessed from shop photos. Change them in Mipangilio.
  const kg = (name, p1, cost, stock, fav = false) => ({
    id: uid(), name, unit: 'kg', cat: 'Vyakula', fav, cost, stock, lowAt: 3, lastInQty: stock, portions: kgPortions(p1),
  });
  const pc = (name, cat, price, cost, stock, lowAt = 5, fav = false, extra = []) => ({
    id: uid(), name, unit: 'pc', cat, fav, cost, stock, lowAt, lastInQty: stock, portions: [{ label: '1', qty: 1, price }, ...extra],
  });
  return {
    version: 2,
    setupDone: false,
    shopName: 'Duka Langu',
    users: [],
    recovery: null,
    auth: { fails: 0, until: 0 },
    settings: { autoLockMin: 15 },
    showSampleBanner: true,
    items: [
      kg('Mchele (Super)', 2800, 2400, 25, true),
      kg('Mchele (Kawaida)', 2000, 1700, 25),
      kg('Sukari', 3000, 2650, 25, true),
      kg('Unga wa Sembe', 1800, 1500, 25, true),
      pc('Mayai', 'Vyakula', 400, 330, 60, 12, true, [{ label: 'Trei (30)', qty: 30, price: 11500 }]),
      pc('Maji Uhai 1.5L', 'Vinywaji', 1000, 750, 24, 6, true),
      pc('Maji Uhai 500ml', 'Vinywaji', 500, 350, 24, 6),
      pc('Soda', 'Vinywaji', 1000, 800, 24, 6, true),
      pc('Sabuni kipande', 'Usafi', 1000, 800, 20),
      pc('Omo pakiti', 'Usafi', 500, 400, 40, 10, true),
      pc('Royco pakiti', 'Vyakula', 200, 150, 50, 10),
      pc('Pampers (kimoja)', 'Usafi', 500, 380, 40, 10),
      pc('Tishu', 'Usafi', 800, 600, 20),
      pc('Pipi', 'Vitafunwa', 50, 30, 300, 50, true),
      pc('Big G / Jojo', 'Vitafunwa', 100, 70, 150, 30),
      pc('Kiberiti', 'Nyinginezo', 100, 70, 30, 10),
    ],
    customers: [],
    events: [],
  };
}

/** Bring older saved data up to the current shape without losing anything. */
function migrate(d) {
  if (!d.version || d.version < 2) {
    d.version = 2;
    d.setupDone = false;               // v1 had no accounts: ask for an owner PIN
    d.users = d.users || [];
    d.recovery = null;
    d.auth = { fails: 0, until: 0 };
    d.settings = { autoLockMin: 15 };
    delete d.idleSeconds;
    for (const it of d.items) { it.cat = it.cat || (it.unit === 'kg' ? 'Vyakula' : 'Nyinginezo'); it.fav = !!it.fav; }
    for (const e of d.events) if (e.type === 'sale' || e.type === 'other') e.pay = e.credit ? 'credit' : 'cash';
  }
  return d;
}

function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return migrate(JSON.parse(raw)); }
  catch (e) { console.warn('load failed', e); }
  return demoData();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('⚠️ Imeshindwa kuhifadhi kwenye simu'); console.error(e); }
}
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

let S = load();
let session = lsGet(SESSION_KEY);            // { userId, last }
const basket = lsGet(BASKET_KEY) || { ids: [] };
let elevatedUntil = 0;                        // helper temporarily unlocked with owner PIN

const itemById = id => S.items.find(i => i.id === id);
const custById = id => S.customers.find(c => c.id === id);
const userById = id => S.users.find(u => u.id === id);
const me = () => session && userById(session.userId);
const isOwner = () => me()?.role === 'owner' || Date.now() < elevatedUntil;
const whoName = id => userById(id)?.name || S.formerUsers?.find(u => u.id === id)?.name || '—';

/** Every record gets a timestamp and who made it. */
function log(e) { const ev = { id: uid(), t: Date.now(), by: session?.userId || null, ...e }; S.events.push(ev); return ev; }

function unitPrice(item) {
  const p = item.portions.slice().sort((a, b) => Math.abs(a.qty - 1) - Math.abs(b.qty - 1))[0];
  return p ? p.price / p.qty : 0;
}
const isCredit = e => e.pay === 'credit' || (!!e.credit && !e.pay);
function balanceOf(cid) {
  let b = 0;
  for (const e of S.events) {
    if (e.void) continue;
    if ((e.type === 'sale' || e.type === 'other') && isCredit(e) && e.credit === cid) b += e.amount;
    if (e.type === 'payment' && e.customerId === cid) b -= e.amount;
  }
  return b;
}

/* ============================== PIN security ============================== */
async function hashPin(pin, salt) {
  const text = salt + ':' + pin;
  try {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {}
  // Fallback (non-secure context): simple FNV-1a hash
  let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'f' + h.toString(16);
}
async function makeSecret(value) { const salt = uid(); return { salt, hash: await hashPin(value, salt) }; }
async function checkSecret(secret, value) { return !!secret && (await hashPin(value, secret.salt)) === secret.hash; }

function lockedOutMs() { return Math.max(0, (S.auth?.until || 0) - Date.now()); }
function registerFail() {
  S.auth.fails = (S.auth.fails || 0) + 1;
  if (S.auth.fails >= 5) S.auth.until = Date.now() + Math.min(10 * 60000, 30000 * 2 ** (S.auth.fails - 5));
  save();
}
function registerOk() { S.auth.fails = 0; S.auth.until = 0; save(); }

function newRecoveryCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; const r = new Uint32Array(8);
  (window.crypto?.getRandomValues ? crypto.getRandomValues(r) : r.forEach((_, i) => (r[i] = Math.random() * 1e9)));
  for (let i = 0; i < 8; i++) s += A[r[i] % A.length];
  return s.slice(0, 4) + '-' + s.slice(4);
}
const normCode = c => String(c).toUpperCase().replace(/[^A-Z0-9]/g, '');

/** 4-digit PIN pad. onDone(pin, api) — api.error(msg) resets with a message. */
function pinPad(el, { title, sub = '', onDone }) {
  let v = '', busy = false;
  el.innerHTML = `<div class="pinpad">
    <div class="pintitle">${esc(title)}</div><div class="pinsub">${esc(sub)}</div>
    <div class="dots">${'<i></i>'.repeat(4)}</div><div class="pinerr" role="alert"></div>
    <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button data-k="${k}">${k}</button>`).join('')}</div></div>`;
  const dots = $$('.dots i', el), err = $('.pinerr', el), pad = $('.pinpad', el);
  const show = () => dots.forEach((d, i) => d.classList.toggle('on', i < v.length));
  const api = {
    error(msg) { v = ''; busy = false; show(); err.textContent = msg; pad.classList.remove('shake'); void pad.offsetWidth; pad.classList.add('shake'); buzz(); },
    reset() { v = ''; busy = false; show(); err.textContent = ''; },
  };
  $$('[data-k]', el).forEach(b => b.addEventListener('click', async () => {
    if (busy) return;
    const k = b.dataset.k;
    if (k === '⌫') v = v.slice(0, -1); else if (v.length < 4) v += k;
    err.textContent = ''; show();
    if (v.length === 4) { busy = true; await onDone(v, api); }
  }));
  return api;
}

/** Run fn only for the owner. A helper can unlock it with the owner's PIN. */
function requireOwner(fn, reason = '') {
  if (isOwner()) return fn();
  openSheet(`<div id="op"></div><div class="btnrow"><button class="btn" id="cancel">Ghairi</button></div>`, sh => {
    $('#cancel', sh).addEventListener('click', closeSheet);
    pinPad($('#op', sh), {
      title: 'PIN ya mwenye duka', sub: reason || 'Kitendo hiki ni cha mwenye duka tu.',
      async onDone(pin, api) {
        const wait = lockedOutMs(); if (wait) return api.error(`Subiri sekunde ${Math.ceil(wait / 1000)}`);
        for (const u of S.users.filter(u => u.role === 'owner')) {
          if (await checkSecret(u.pin, pin)) {
            registerOk(); elevatedUntil = Date.now() + OWNER_ELEVATE_MS;
            log({ type: 'override', owner: u.id, reason }); save(); closeSheet(); fn(); return;
          }
        }
        registerFail(); api.error('PIN si sahihi');
      },
    });
  });
}

/* ============================== UI plumbing ============================== */
let tab = 'sell';
let reportDay = dayKey(Date.now());
let catSel = null;

function go(t) {
  if (t !== tab && me()?.role !== 'owner') elevatedUntil = 0;   // a helper's owner-unlock ends when leaving the screen
  if (t === 'settings' && !isOwner()) return requireOwner(() => paint('settings'), 'Kufungua mipangilio');
  paint(t);
}
function paint(t) {
  tab = t;
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  render();
  window.scrollTo(0, 0);
}
function render() {
  if (!S.setupDone) return renderSetup();
  if (!me()) return renderLogin();
  document.body.classList.remove('locked');
  ({ sell: renderSell, stock: renderStock, debts: renderDebts, report: renderReport, settings: renderSettings })[tab]($('#view'));
}

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 1800);
}
function buzz() { try { navigator.vibrate && navigator.vibrate(35); } catch (e) {} }

function openSheet(html, mount) {
  const sh = $('#sheet'); sh.innerHTML = html; sh.hidden = false; $('#sheet-backdrop').hidden = false;
  sh.scrollTop = 0; mount && mount(sh);
}
function closeSheet() { $('#sheet').hidden = true; $('#sheet-backdrop').hidden = true; $('#sheet').innerHTML = ''; }
$('#sheet-backdrop').addEventListener('click', closeSheet);

/* ============================== SETUP & LOGIN ============================== */
function renderSetup() {
  document.body.classList.add('locked');
  const v = $('#view');
  const migrating = S.items.length && S.events.length;
  v.innerHTML = `<div class="auth">
    <div class="logo">📒</div><h1>Karibu Daftari</h1>
    <p class="muted">${migrating ? 'Sasa Daftari lina akaunti. Tengeneza akaunti ya mwenye duka — taarifa zako za zamani zitabaki.' : 'Tuanze kwa kutengeneza akaunti ya mwenye duka.'}</p>
    <div class="form">
      <label>Jina la duka</label><input id="shop" value="${esc(S.shopName)}">
      <label>Jina lako (mwenye duka)</label><input id="owner" placeholder="mf. Ally">
      <button class="btn primary block" id="next">Endelea</button>
    </div></div>`;
  $('#next').addEventListener('click', () => {
    const shop = $('#shop').value.trim(), owner = $('#owner').value.trim();
    if (!shop || !owner) { toast('Jaza jina la duka na jina lako'); return; }
    choosePin(v, `Chagua PIN ya tarakimu 4, ${owner}`, async pin => {
      const code = newRecoveryCode();
      const u = { id: uid(), name: owner, role: 'owner', pin: await makeSecret(pin) };
      S.shopName = shop; S.users = [u]; S.recovery = await makeSecret(normCode(code));
      v.innerHTML = `<div class="auth"><div class="logo">🔑</div><h1>Namba ya dharura</h1>
        <p>Ukisahau PIN, utaitumia namba hii kuweka PIN mpya. <b>Iandike kwenye karatasi</b> na uitunze mahali salama.</p>
        <div class="code">${code}</div>
        <button class="btn primary block" id="ok">Nimeiandika</button></div>`;
      $('#ok').addEventListener('click', () => {
        S.setupDone = true; session = { userId: u.id, last: Date.now() }; lsSet(SESSION_KEY, session);
        log({ type: 'user', action: 'setup', userId: u.id, name: u.name }); save();
        go('sell');
      });
    });
  });
}

/** Ask for a new PIN twice. Calls done(pin) when both match. */
function choosePin(el, title, done, onCancel) {
  const ask = (msg) => {
    const html = `<div class="auth"><div id="pp"></div>${onCancel ? '<button class="btn" id="pc">Ghairi</button>' : ''}</div>`;
    el.innerHTML = html;
    $('#pc', el)?.addEventListener('click', onCancel);
    const api1 = pinPad($('#pp', el), {
      title, sub: msg || 'Usitumie 1234 au tarehe ya kuzaliwa.',
      onDone(p1) {
        if (/^(\d)\1{3}$/.test(p1) || p1 === '1234' || p1 === '4321') return api1.error('PIN rahisi mno — chagua nyingine');
        pinPad($('#pp', el), {
          title: 'Rudia PIN', sub: 'Weka PIN ile ile tena',
          onDone(p2) { if (p1 !== p2) return ask('PIN hazikulingana — anza tena'); done(p1); },
        });
      },
    });
  };
  ask();
}

function renderLogin(selectedId) {
  document.body.classList.add('locked'); closeSheet();
  const v = $('#view');
  const users = S.users;
  const sel = selectedId || (users.length === 1 ? users[0].id : null);
  v.innerHTML = `<div class="auth">
    <div class="logo">📒</div><h1>${esc(S.shopName)}</h1>
    <p class="muted">${sel ? '' : 'Chagua jina lako'}</p>
    <div class="users">${users.map(u => `<button class="utile ${u.id === sel ? 'on' : ''}" data-u="${u.id}">
      <span class="av">${esc(u.name.slice(0, 1).toUpperCase())}</span><span>${esc(u.name)}</span>
      <span class="role">${u.role === 'owner' ? 'Mwenye duka' : 'Msaidizi'}</span></button>`).join('')}</div>
    <div id="pinArea"></div>
    ${sel && userById(sel)?.role === 'owner' ? '<button class="linkbtn" id="forgot">Umesahau PIN?</button>' : ''}
  </div>`;
  $$('[data-u]', v).forEach(b => b.addEventListener('click', () => renderLogin(b.dataset.u)));
  $('#forgot')?.addEventListener('click', () => recoverOwner(sel));
  if (!sel) return;
  const u = userById(sel);
  pinPad($('#pinArea'), {
    title: `PIN ya ${u.name}`,
    async onDone(pin, api) {
      const wait = lockedOutMs(); if (wait) return api.error(`Umekosea mara nyingi. Subiri sekunde ${Math.ceil(wait / 1000)}`);
      if (await checkSecret(u.pin, pin)) {
        registerOk(); session = { userId: u.id, last: Date.now() }; lsSet(SESSION_KEY, session);
        log({ type: 'login' }); save(); tab = 'sell'; go('sell');
      } else {
        registerFail();
        const w = lockedOutMs();
        api.error(w ? `Umekosea mara nyingi. Subiri sekunde ${Math.ceil(w / 1000)}` : `PIN si sahihi (${5 - S.auth.fails} majaribio kabla ya kusubiri)`);
      }
    },
  });
}

function recoverOwner(ownerId) {
  const v = $('#view');
  v.innerHTML = `<div class="auth"><div class="logo">🔑</div><h1>Weka PIN mpya</h1>
    <p class="muted">Andika namba ya dharura uliyopewa ulipoanza kutumia Daftari.</p>
    <div class="form"><input id="code" placeholder="XXXX-XXXX" autocapitalize="characters" autocomplete="off">
    <button class="btn primary block" id="ok">Endelea</button><button class="btn block" id="back">Rudi</button></div></div>`;
  $('#back').addEventListener('click', () => renderLogin(ownerId));
  $('#ok').addEventListener('click', async () => {
    const wait = lockedOutMs(); if (wait) { toast(`Subiri sekunde ${Math.ceil(wait / 1000)}`); return; }
    if (!(await checkSecret(S.recovery, normCode($('#code').value)))) { registerFail(); toast('Namba si sahihi'); return; }
    registerOk();
    choosePin(v, 'Chagua PIN mpya', async pin => {
      const u = userById(ownerId); u.pin = await makeSecret(pin);
      const code = newRecoveryCode(); S.recovery = await makeSecret(normCode(code));
      session = { userId: u.id, last: Date.now() }; lsSet(SESSION_KEY, session);
      log({ type: 'user', action: 'recover', userId: u.id, name: u.name }); save();
      v.innerHTML = `<div class="auth"><div class="logo">🔑</div><h1>Namba mpya ya dharura</h1>
        <p>Namba ya zamani haitumiki tena. Iandike hii mpya.</p><div class="code">${code}</div>
        <button class="btn primary block" id="done">Nimeiandika</button></div>`;
      $('#done').addEventListener('click', () => go('sell'));
    }, () => renderLogin(ownerId));
  });
}

function lock() {
  session = null; lsSet(SESSION_KEY, null); elevatedUntil = 0;
  renderLogin();
}

/* ============================== SELL ============================== */
function saveBasket() { lsSet(BASKET_KEY, basket); }
function basketEvents() { return basket.ids.map(id => S.events.find(e => e.id === id)).filter(e => e && !e.void); }
const lineKey = e => e.type === 'other' ? 'other' : `${e.itemId}|${e.label}`;
const lineName = e => e.type === 'other' ? (e.note || 'Nyingine') : e.label === '1' ? e.name : `${e.name} ${e.label}`;

function visibleItems() {
  if (catSel === 'fav') return S.items.filter(i => i.fav);
  if (!catSel || catSel === 'all') return S.items;
  return S.items.filter(i => i.cat === catSel);
}

function renderSell(v) {
  if (catSel == null) catSel = S.items.some(i => i.fav) ? 'fav' : 'all';
  const cats = [['fav', '⭐ Maarufu'], ['all', 'Zote'], ...CATS.filter(c => S.items.some(i => i.cat === c)).map(c => [c, c])]
    .filter(([k]) => k !== 'fav' || S.items.some(i => i.fav));
  const banner = S.showSampleBanner ? `
    <div class="banner"><span>ℹ️ Bidhaa na bei hizi ni <b>mfano</b>. Weka za duka lako kwenye ⚙️ Mipangilio.</span>
    <button id="hideBanner" aria-label="Funga">×</button></div>` : '';

  const cards = visibleItems().map(it => {
    const low = it.stock <= it.lowAt;
    const stock = `<span class="stock ${low ? 'low' : ''}">${qtyText(it.stock, it.unit)}</span>`;
    if (it.portions.length === 1) {
      const p = it.portions[0];
      return `<button class="tile" data-item="${it.id}" data-p="0">
        <span class="name">${esc(it.name)}</span><span class="price">${fmt(p.price)}</span>${stock}</button>`;
    }
    const btns = it.portions.map((p, i) => `
      <button class="pbtn" data-item="${it.id}" data-p="${i}"><span class="pl">${esc(p.label)}</span><span class="pp">${fmt(p.price)}</span></button>`).join('');
    return `<div class="card ${it.unit === 'kg' ? 'kg' : ''}" id="card-${it.id}">
      <div class="head"><span class="name">${esc(it.name)}</span>${stock}</div><div class="portions">${btns}</div></div>`;
  }).join('');

  v.innerHTML = `
    <div class="custbar" id="custbar">
      <div class="barrow">
        <div class="cust"><div class="label" id="blabel">Gusa bidhaa kuuza</div><div class="total" id="btotal">0</div></div>
        <button class="barbtn done" id="finish">✓ Maliza</button>
        <button class="userbtn" id="me" aria-label="Mtumiaji">${esc(me().name.slice(0, 1).toUpperCase())}</button>
      </div>
      <div class="bchips" id="bchips"></div>
      <div class="cats">${cats.map(([k, l]) => `<button class="cat ${catSel === k ? 'on' : ''}" data-cat="${k}">${esc(l)}</button>`).join('')}</div>
    </div>
    ${banner}
    <div class="grid">${cards || '<div class="empty" style="grid-column:1/-1">Hakuna bidhaa hapa</div>'}
      <button class="tile other" id="other"><span class="name">Nyingine</span><span class="price">+ Kiasi</span>
      <span class="stock">Isiyo kwenye orodha</span></button>
    </div>`;

  updateBar();
  $('#hideBanner')?.addEventListener('click', () => { S.showSampleBanner = false; save(); render(); });
  $$('[data-item]', v).forEach(b => b.addEventListener('click', () => sell(b.dataset.item, +b.dataset.p, b)));
  $$('[data-cat]', v).forEach(b => b.addEventListener('click', () => { catSel = b.dataset.cat; render(); }));
  $('#finish').addEventListener('click', openCheckout);
  $('#other').addEventListener('click', openOther);
  $('#me').addEventListener('click', openUserMenu);
}

function sell(itemId, pIndex, el) {
  const it = itemById(itemId); if (!it) return;
  const p = it.portions[pIndex];
  const e = log({ type: 'sale', itemId, name: it.name, label: p.label, unit: it.unit, qty: p.qty, amount: p.price, cost: r3(it.cost * p.qty), pay: 'cash' });
  it.stock = r3(it.stock - p.qty);
  save();
  basket.ids.push(e.id); saveBasket();
  buzz();
  if (el) {
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    const lbl = (el.closest('.card') || el).querySelector('.stock');
    if (lbl) { lbl.textContent = qtyText(it.stock, it.unit); lbl.classList.toggle('low', it.stock <= it.lowAt); }
  }
  updateBar();
}

function updateBar() {
  const box = $('#bchips'); if (!box) return;
  const evs = basketEvents();
  const total = evs.reduce((s, e) => s + e.amount, 0);
  const lines = new Map();
  evs.forEach((e, i) => {
    const k = lineKey(e);
    const l = lines.get(k) || { name: lineName(e), n: 0, amount: 0, last: 0 };
    l.n++; l.amount += e.amount; l.last = i; lines.set(k, l);
  });
  const sorted = [...lines].sort((a, b) => b[1].last - a[1].last);
  $('#btotal').textContent = fmt(total);
  $('#blabel').textContent = evs.length ? `Mteja huyu · bidhaa ${evs.length}` : 'Gusa bidhaa kuuza';
  $('#finish').disabled = !evs.length;
  box.innerHTML = sorted.map(([k, l]) => `<span class="bchip">
    <button class="minus" data-rm="${esc(k)}" aria-label="Punguza ${esc(l.name)}">${l.n > 1 ? '−' : '✕'}</button>
    <span class="bname">${esc(l.name)}</span><span class="bqty">×${l.n}</span><b>${fmt(l.amount)}</b>
    <button class="plus" data-add="${esc(k)}" aria-label="Ongeza ${esc(l.name)}">+</button></span>`).join('');
  $$('[data-rm]', box).forEach(b => b.addEventListener('click', () => removeOne(b.dataset.rm)));
  $$('[data-add]', box).forEach(b => b.addEventListener('click', () => addOne(b.dataset.add)));
}

/** "+" on a basket line: one more of the same thing. */
function addOne(key) {
  const e = [...basketEvents()].reverse().find(x => lineKey(x) === key); if (!e) return;
  if (e.type === 'other') {
    const n = log({ type: 'other', amount: e.amount, note: e.note, pay: 'cash' });
    save(); basket.ids.push(n.id); saveBasket(); buzz(); updateBar(); return;
  }
  const it = itemById(e.itemId); if (!it) return;
  const idx = it.portions.findIndex(p => p.label === e.label);
  if (idx < 0) { toast('Bei ya bidhaa hii imebadilika — gusa bidhaa kwenye orodha'); return; }
  sell(it.id, idx, null);
  render();
}

/** Customer changed their mind: take one of this line back out of the basket. */
function removeOne(key) {
  const evs = basketEvents();
  const e = [...evs].reverse().find(x => lineKey(x) === key); if (!e) return;
  e.void = true; e.voidT = Date.now(); e.voidBy = session.userId; e.voidReason = 'ondoa';
  if (e.type === 'sale') { const it = itemById(e.itemId); if (it) it.stock = r3(it.stock + e.qty); }
  basket.ids = basket.ids.filter(id => id !== e.id); saveBasket(); save();
  const left = basketEvents().filter(x => lineKey(x) === key).length;
  buzz(); toast(left ? `${lineName(e)}: sasa ${left}` : `Imeondolewa: ${lineName(e)}`); render();
}

/* ---- Maliza: change calculator + how the customer paid ---- */
function openCheckout() {
  const evs = basketEvents(); if (!evs.length) return;
  const T = evs.reduce((s, e) => s + e.amount, 0);
  const opts = [...new Set([T, Math.ceil(T / 500) * 500, Math.ceil(T / 1000) * 1000, 2000, 5000, 10000, 20000])]
    .filter(x => x >= T).sort((a, b) => a - b).slice(0, 6);
  openSheet(`
    <h2>Jumla: ${tsh(T)}</h2>
    <div class="field"><label>Amepokea (si lazima)</label>
      <input id="rec" type="number" inputmode="numeric" placeholder="Kiasi alichotoa">
      <div class="chips">${opts.map(o => `<button class="chip" data-r="${o}">${fmt(o)}</button>`).join('')}</div></div>
    <div class="change" id="chg"></div>
    <label class="small muted">Amelipaje?</label>
    <div class="paybtns">
      <button class="btn primary" data-pay="cash">💵 Taslimu</button>
      <button class="btn" data-pay="mobile">📱 Simu</button>
      <button class="btn warn" data-pay="credit">📒 Deni</button>
    </div>
    <div class="btnrow"><button class="btn" id="cancel">Rudi</button></div>`, sh => {
    const rec = $('#rec', sh), chg = $('#chg', sh);
    const upd = () => {
      const r = +rec.value;
      chg.innerHTML = !rec.value ? '' : r < T ? `<span style="color:var(--danger)">Pungufu ${fmt(T - r)}</span> <span class="small muted">— itaandikwa kama deni</span>` : `Chenji: <b>${fmt(r - T)}</b>`;
    };
    rec.addEventListener('input', upd);
    $$('[data-r]', sh).forEach(b => b.addEventListener('click', () => { rec.value = b.dataset.r; upd(); }));
    $('#cancel', sh).addEventListener('click', closeSheet);
    $$('[data-pay]', sh).forEach(b => b.addEventListener('click', () => {
      const pay = b.dataset.pay, received = +rec.value || null;
      if (received && received < T) return openPartial(pay === 'mobile' ? 'mobile' : 'cash', received, T);
      if (pay === 'credit') pickCustomer(cid => closeBasket('credit', cid, null), 'Deni la nani?');
      else closeBasket(pay, null, received);
    }));
  });
}

/** Customer paid only part: alert, then ask whose debt the balance is. */
function openPartial(method, paid, T) {
  pickCustomer(cid => closeBasket('credit', cid, null, { paid, method }), `Baki ${fmt(T - paid)} — deni la nani?`,
    `<div class="result over"><div class="big">Amelipa ${fmt(paid)} kwa ${method === 'mobile' ? 'simu' : 'taslimu'}</div>
     Jumla ni ${fmt(T)}. Baki <b>${fmt(T - paid)}</b> itaandikwa kama deni la mteja utakayemchagua.</div>`);
}

function closeBasket(pay, cid, received, part) {
  const evs = basketEvents();
  const total = evs.reduce((s, e) => s + e.amount, 0);
  for (const e of evs) { e.pay = pay; e.credit = pay === 'credit' ? cid : null; }
  if (part) log({ type: 'payment', customerId: cid, name: custById(cid)?.name, amount: part.paid, method: part.method, atCheckout: true });
  log({ type: 'close', ids: evs.map(e => e.id), total, pay, credit: cid, received, change: received ? received - total : null, paidNow: part?.paid || 0 });
  basket.ids = []; saveBasket(); save(); closeSheet();
  const name = custById(cid)?.name;
  toast(part ? `${name}: amelipa ${fmt(part.paid)}, deni ${fmt(total - part.paid)}`
    : pay === 'credit' ? `Deni: ${name} ${fmt(total)}` : pay === 'mobile' ? `Simu: ${fmt(total)} ✓` : `Taslimu: ${fmt(total)} ✓`);
  render();
}

function pickCustomer(onPick, title, intro = '') {
  const list = S.customers.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c =>
    `<button data-c="${c.id}"><span>${esc(c.name)}</span><span class="muted small">${balanceOf(c.id) ? 'Anadaiwa ' + fmt(balanceOf(c.id)) : ''}</span></button>`).join('');
  openSheet(`
    ${intro}<h2>${esc(title)}</h2>
    <div class="field"><label>Mteja mpya</label>
      <div style="display:flex;gap:8px"><input id="newc" placeholder="Jina (mf. Mama Asha)"><button class="btn primary" id="addc">Ongeza</button></div></div>
    <div class="custpick">${list || '<p class="muted">Bado hakuna wateja wa deni.</p>'}</div>
    <div class="btnrow"><button class="btn" id="cancel">Ghairi</button></div>`, sh => {
    $$('[data-c]', sh).forEach(b => b.addEventListener('click', () => onPick(b.dataset.c)));
    $('#addc', sh).addEventListener('click', () => {
      const n = $('#newc', sh).value.trim(); if (!n) return;
      const c = { id: uid(), name: n }; S.customers.push(c); save(); onPick(c.id);
    });
    $('#cancel', sh).addEventListener('click', closeSheet);
  });
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
      const e = log({ type: 'other', amount: a, note: $('#note', sh).value.trim(), pay: 'cash' });
      save(); basket.ids.push(e.id); saveBasket();
      closeSheet(); buzz(); updateBar(); toast(`Nyingine: ${fmt(a)}`);
    });
  });
}

function openUserMenu() {
  const u = me();
  openSheet(`<h2>${esc(u.name)}</h2><p class="muted">${u.role === 'owner' ? 'Mwenye duka' : 'Msaidizi'} · ${esc(S.shopName)}</p>
    <div class="custpick">
      <button id="lockNow"><span>🔒 Funga (lock)</span></button>
      <button id="switch"><span>👥 Badili mtumiaji</span></button>
    </div>
    <p class="small muted">Mauzo ya mteja aliye wazi hayapotei ukifunga.</p>
    <div class="btnrow"><button class="btn" id="close">Funga dirisha</button></div>`, sh => {
    $('#close', sh).addEventListener('click', closeSheet);
    $('#lockNow', sh).addEventListener('click', lock);
    $('#switch', sh).addEventListener('click', lock);
  });
}

/* ============================== STOCK ============================== */
function renderStock(v) {
  const owner = isOwner();
  const rows = S.items.map(it => {
    const low = it.stock <= it.lowAt;
    const last = [...S.events].reverse().find(e => e.type === 'finish' && e.itemId === it.id);
    return `<div class="row stack"><div class="grow">
        <div class="title">${esc(it.name)}</div>
        <div class="sub">Stoo: <b style="color:${low ? 'var(--danger)' : 'inherit'}">${qtyText(it.stock, it.unit)}</b>${it.unit === 'pc' ? ' vipande' : ''}
          ${owner ? ` · Bei ya kununua ${fmt(it.cost)}/${unitWord(it.unit)}` : ''}${last ? `<br>Ukaguzi wa mwisho: ${statusPill(last.status)}` : ''}</div>
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
    <b>Matumizi</b>: ya nyumbani au iliyoharibika.${owner ? '' : ' 🔒 Vitendo hivi vinahitaji PIN ya mwenye duka.'}</p>
    <div class="list">${rows}</div></div>`;
  $$('[data-in]', v).forEach(b => b.addEventListener('click', () => requireOwner(() => openStockIn(b.dataset.in), 'Kuingiza mzigo')));
  $$('[data-fin]', v).forEach(b => b.addEventListener('click', () => requireOwner(() => openImeisha(b.dataset.fin), 'Ukaguzi wa Imeisha')));
  $$('[data-use]', v).forEach(b => b.addEventListener('click', () => requireOwner(() => openUse(b.dataset.use), 'Kurekodi matumizi')));
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
      log({ type: 'stockin', itemId: id, name: it.name, unit: it.unit, qty: a, paid: b });
      save(); closeSheet(); toast(`Mzigo umeingia: ${it.name} +${qtyText(a, it.unit)}`); render();
    });
  });
}

/** "Imeisha": the sack/box is empty. Whatever stock the app still shows was never tapped. */
function openImeisha(id) {
  const it = itemById(id);
  const left = r3(it.stock);
  const base = it.lastInQty || Math.abs(left) || 1;
  const tol = it.unit === 'kg' ? Math.max(0.1, base * 0.05) : Math.floor(base * 0.03);
  const status = left > tol ? 'gap' : left < -tol ? 'over' : 'ok';
  const value = Math.abs(left) * unitPrice(it);
  const msg = status === 'ok'
    ? `<div class="big">✅ Sawa</div>Mauzo yaliyobonyezwa yanalingana na mzigo${left ? ` (tofauti ndogo ${qtyText(Math.abs(left), it.unit)} — kawaida kwa kupima/kumwagika)` : ''}.`
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
      log({ type: 'finish', itemId: id, name: it.name, unit: it.unit, remaining: left, status, value: status === 'gap' ? value : 0 });
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
      log({ type: 'use', itemId: id, name: it.name, unit: it.unit, qty: q, why: $('#why', sh).value, cost: r3(q * it.cost) });
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
      : '<div class="empty">Bado hakuna madeni. Kwenye <b>Uza</b>, gusa bidhaa, bonyeza <b>✓ Maliza</b> kisha <b>📒 Deni</b>.</div>'}</div></div>`;
  $$('[data-open]', v).forEach(b => b.addEventListener('click', () => openCustomer(b.dataset.open)));
}

function openCustomer(cid) {
  const c = custById(cid);
  const hist = S.events.filter(e => !e.void && (((e.type === 'sale' || e.type === 'other') && isCredit(e) && e.credit === cid) || (e.type === 'payment' && e.customerId === cid)))
    .slice(-40).reverse();
  const b = balanceOf(cid);
  openSheet(`
    <h2>${esc(c.name)}</h2>
    <p><b style="font-size:22px;color:${b > 0 ? 'var(--danger)' : 'inherit'}">${b > 0 ? 'Anadaiwa ' : ''}${tsh(Math.abs(b))}</b></p>
    <div class="field"><label>Amelipa (TSh)</label>
      <div style="display:flex;gap:8px"><input id="amt" type="number" inputmode="numeric" min="0" placeholder="${b > 0 ? fmt(b) : ''}">
      <button class="btn primary" id="pay">Amelipa</button></div>
      <div class="chips">${b > 0 ? `<button class="chip" id="all">Yote (${fmt(b)})</button>` : ''}
        <button class="chip method on" data-m="cash">💵 Taslimu</button><button class="chip method" data-m="mobile">📱 Simu</button></div></div>
    <h2 style="font-size:16px;margin-top:16px">Historia</h2>
    <div class="list">${hist.map(e => `<div class="row"><div class="grow"><div class="title">${e.type === 'payment' ? `Malipo${e.method === 'mobile' ? ' (simu)' : ''}${e.atCheckout ? ' wakati wa kununua' : ''}` : esc(lineName(e))}</div>
      <div class="sub">${dayName(dayKey(e.t))} · ${timeOf(e.t)} · ${esc(whoName(e.by))}</div></div>
      <div class="num" style="color:${e.type === 'payment' ? 'var(--ok)' : 'inherit'}">${e.type === 'payment' ? '−' : '+'}${fmt(e.amount)}</div></div>`).join('') || '<div class="empty">Hakuna historia</div>'}</div>
    <div class="btnrow"><button class="btn danger" id="del">Futa mteja</button><button class="btn" id="close">Funga</button></div>`, sh => {
    $('#close', sh).addEventListener('click', closeSheet);
    $('#all', sh)?.addEventListener('click', () => ($('#amt', sh).value = b));
    let method = 'cash';
    $$('.method', sh).forEach(m => m.addEventListener('click', () => { method = m.dataset.m; $$('.method', sh).forEach(x => x.classList.toggle('on', x === m)); }));
    $('#pay', sh).addEventListener('click', () => {
      const a = +$('#amt', sh).value; if (!(a > 0)) return;
      log({ type: 'payment', customerId: cid, name: c.name, amount: a, method });
      save(); closeSheet(); toast(`${c.name} amelipa ${fmt(a)}`); render();
    });
    $('#del', sh).addEventListener('click', () => requireOwner(() => {
      if (balanceOf(cid) !== 0) { toast('Mteja bado ana deni — haiwezi kufutwa'); return; }
      S.customers = S.customers.filter(x => x.id !== cid); save(); closeSheet(); render();
    }, 'Kufuta mteja'));
  });
}

/* ============================== REPORT ============================== */
function reportData(day) {
  const evs = S.events.filter(e => dayKey(e.t) === day);
  const sales = evs.filter(e => (e.type === 'sale' || e.type === 'other') && !e.void);
  const sum = a => a.reduce((s, e) => s + e.amount, 0);
  const total = sum(sales);
  const pays = evs.filter(e => e.type === 'payment' && !e.void);
  const isMob = e => e.method === 'mobile';
  const atCheckout = pays.filter(e => e.atCheckout), repaid = pays.filter(e => !e.atCheckout);
  const coCash = sum(atCheckout.filter(e => !isMob(e))), coMobile = sum(atCheckout.filter(isMob));
  const creditSales = sum(sales.filter(isCredit)), mobileSales = sum(sales.filter(e => e.pay === 'mobile'));
  const credit = creditSales - coCash - coMobile;               // only the part still owed
  const mobile = mobileSales + coMobile;
  const cash = total - creditSales - mobileSales + coCash;
  const itemSales = sales.filter(e => e.type === 'sale');
  const profit = itemSales.reduce((s, e) => s + e.amount - (e.cost || 0), 0);
  const otherTotal = sum(sales.filter(e => e.type === 'other'));
  const payments = sum(repaid.filter(e => !isMob(e)));          // old debts paid in cash (goes to drawer)
  const paymentsMobile = sum(repaid.filter(isMob));
  const voided = S.events.filter(e => e.void && e.voidT && dayKey(e.voidT) === day);
  const byItem = new Map();
  for (const e of itemSales) {
    const r = byItem.get(e.itemId) || { name: e.name, unit: e.unit, qty: 0, amount: 0, profit: 0 };
    r.qty = r3(r.qty + e.qty); r.amount += e.amount; r.profit += e.amount - (e.cost || 0);
    byItem.set(e.itemId, r);
  }
  const byUser = new Map();
  for (const e of sales) { const r = byUser.get(e.by || '') || { n: 0, amount: 0 }; r.n++; r.amount += e.amount; byUser.set(e.by || '', r); }
  return {
    day, total, credit, mobile, cash, profit, otherTotal, payments, paymentsMobile, expected: cash + payments, count: sales.length, sales, voided,
    items: [...byItem.values()].sort((a, b) => b.amount - a.amount),
    users: [...byUser].map(([id, r]) => ({ name: whoName(id), ...r })).sort((a, b) => b.amount - a.amount),
    checks: evs.filter(e => e.type === 'finish'), uses: evs.filter(e => e.type === 'use'),
    audit: auditFor(day), low: S.items.filter(i => i.stock <= i.lowAt),
  };
}

/** The owner's activity log: everything except ordinary sales. */
function auditFor(day) {
  const out = [];
  for (const e of S.events) {
    if (e.void && e.voidT && dayKey(e.voidT) === day)
      out.push({ t: e.voidT, by: e.voidBy, text: `${e.voidReason === 'futa' ? 'Alifuta mauzo' : 'Aliondoa kwa mteja'}: ${lineName(e)} (${fmt(e.amount)})`, warn: e.voidReason === 'futa' });
    if (dayKey(e.t) !== day) continue;
    const who = e.by;
    switch (e.type) {
      case 'login': out.push({ t: e.t, by: who, text: 'Aliingia' }); break;
      case 'override': out.push({ t: e.t, by: who, text: `PIN ya mwenye duka ilitumika: ${e.reason || ''}`, warn: userById(who)?.role !== 'owner' }); break;
      case 'stockin': out.push({ t: e.t, by: who, text: `Mzigo: ${e.name} +${qtyText(e.qty, e.unit)}${e.paid ? ` (${fmt(e.paid)})` : ''}` }); break;
      case 'finish': out.push({ t: e.t, by: who, text: `Imeisha: ${e.name} — ${e.status === 'gap' ? 'pengo ' + qtyText(e.remaining, e.unit) : e.status === 'over' ? 'zaidi' : 'sawa'}`, warn: e.status === 'gap' }); break;
      case 'use': out.push({ t: e.t, by: who, text: `Matumizi: ${e.name} ${qtyText(e.qty, e.unit)} (${e.why})` }); break;
      case 'adjust': out.push({ t: e.t, by: who, text: `Alibadilisha stoo: ${e.name} ${qtyText(e.from, e.unit)} → ${qtyText(e.to, e.unit)}`, warn: true }); break;
      case 'price': out.push({ t: e.t, by: who, text: `Alibadilisha ${e.name}: ${e.change}`, warn: true }); break;
      case 'item': out.push({ t: e.t, by: who, text: `${e.action === 'add' ? 'Aliongeza' : 'Alifuta'} bidhaa: ${e.name}`, warn: e.action === 'delete' }); break;
      case 'user': out.push({ t: e.t, by: who, text: { setup: 'Akaunti ya mwenye duka ilitengenezwa', add: `Aliongeza msaidizi ${e.name}`, remove: `Alimwondoa ${e.name}`, pin: `PIN ya ${e.name} ilibadilishwa`, recover: 'PIN ilibadilishwa kwa namba ya dharura', code: 'Namba mpya ya dharura' }[e.action] || e.action, warn: e.action === 'recover' }); break;
    }
  }
  return out.sort((a, b) => b.t - a.t);
}

function shiftDay(key, n) { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n).getTime()); }

function renderReport(v) {
  const R = reportData(reportDay);
  const isToday = reportDay === dayKey(Date.now());
  const owner = isOwner();
  v.innerHTML = `<div class="screen">
    <h1>Ripoti</h1>
    <div class="daynav"><button class="btn" id="prev">‹</button><div class="d">${isToday ? 'Leo · ' : ''}${dayName(reportDay)}</div>
      <button class="btn" id="next" ${isToday ? 'disabled' : ''}>›</button></div>
    <div class="stats">
      <div class="stat big"><div class="k">Mauzo jumla</div><div class="v">${tsh(R.total)}</div></div>
      <div class="stat"><div class="k">💵 Taslimu</div><div class="v">${fmt(R.cash)}</div></div>
      <div class="stat"><div class="k">📱 Simu</div><div class="v">${fmt(R.mobile)}</div></div>
      <div class="stat"><div class="k">📒 Deni</div><div class="v">${fmt(R.credit)}</div></div>
      <div class="stat"><div class="k">Idadi ya mauzo</div><div class="v">${R.count}</div></div>
      ${owner ? `<div class="stat" style="grid-column:1/-1"><div class="k">Faida (makadirio)</div><div class="v" style="color:var(--ok)">${tsh(R.profit)}</div></div>` : ''}
    </div>

    <h2>Pesa inayotarajiwa kwenye droo</h2>
    <div class="list">
      <div class="row"><div class="grow">Mauzo ya taslimu</div><div class="num">${fmt(R.cash)}</div></div>
      <div class="row"><div class="grow">Madeni ya zamani yaliyolipwa (taslimu)</div><div class="num">${fmt(R.payments)}</div></div>
      <div class="row"><div class="grow"><b>Inatarajiwa</b></div><div class="num">${fmt(R.expected)}</div></div>
      <div class="row"><div class="grow"><label class="small muted" for="counted">Ukihesabu droo (si lazima)</label>
        <input id="counted" type="number" inputmode="numeric" placeholder="Weka kiasi" class="inline-input"></div>
        <div class="num" id="diff"></div></div>
    </div>
    ${R.paymentsMobile ? `<p class="small muted">Madeni yaliyolipwa kwa simu: ${fmt(R.paymentsMobile)} (hayako kwenye droo).</p>` : ''}

    ${owner ? ownerReport(R) : `<div style="margin-top:16px"><button class="btn block" id="full">🔒 Ripoti kamili (PIN ya mwenye duka)</button></div>`}

    <div style="margin-top:18px"><button class="btn block primary" id="wa">📤 Tuma ripoti kwa WhatsApp</button></div>
  </div>`;
  $('#prev').addEventListener('click', () => { reportDay = shiftDay(reportDay, -1); render(); });
  $('#next').addEventListener('click', () => { if (!isToday) { reportDay = shiftDay(reportDay, 1); render(); } });
  $('#full')?.addEventListener('click', () => requireOwner(render, 'Kuona ripoti kamili'));
  $('#counted').addEventListener('input', e => {
    const c = +e.target.value, d = $('#diff');
    if (!e.target.value) { d.textContent = ''; return; }
    const diff = c - R.expected;
    d.innerHTML = diff === 0 ? '<span class="pill ok">Sawa</span>' : `<span style="color:${diff < 0 ? 'var(--danger)' : 'var(--ok)'}">${diff < 0 ? 'Pungufu ' : 'Ziada '}${fmt(Math.abs(diff))}</span>`;
  });
  $('#wa').addEventListener('click', () => window.open('https://wa.me/?text=' + encodeURIComponent(reportText(R, owner)), '_blank'));
  $$('[data-void]', v).forEach(b => b.addEventListener('click', () => voidSale(b.dataset.void)));
}

function ownerReport(R) {
  return `
    ${R.users.length ? `<h2>Kwa muuzaji</h2><div class="list">${R.users.map(u => `<div class="row"><div class="grow"><div class="title">${esc(u.name)}</div>
      <div class="sub">mauzo ${u.n}</div></div><div class="num">${fmt(u.amount)}</div></div>`).join('')}</div>` : ''}

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

    <h2>Kumbukumbu (nani alifanya nini)</h2>
    <div class="list">${R.audit.map(a => `<div class="row"><div class="grow"><div class="title" style="font-weight:${a.warn ? 700 : 500};color:${a.warn ? 'var(--danger)' : 'inherit'}">${esc(a.text)}</div>
      <div class="sub">${timeOf(a.t)} · ${esc(whoName(a.by))}</div></div></div>`).join('') || '<div class="empty">Hakuna</div>'}</div>

    <details class="saleslist"><summary>Orodha ya mauzo (${R.sales.length})</summary>
    <div class="list">${[...R.sales].reverse().map(e => `<div class="row"><div class="grow"><div class="title">${esc(lineName(e))}</div>
      <div class="sub">${timeOf(e.t)} · ${esc(whoName(e.by))} · ${isCredit(e) ? 'Deni: ' + esc(custById(e.credit)?.name || '') : e.pay === 'mobile' ? 'Simu' : 'Taslimu'}</div></div>
      <div class="num">${fmt(e.amount)}</div><button class="btn sm danger" data-void="${e.id}">Futa</button></div>`).join('') || '<div class="empty">Hakuna</div>'}</div></details>`;
}

/** Owner cancels a finished sale (e.g. entered by mistake). It stays in the activity log. */
function voidSale(id) {
  const e = S.events.find(x => x.id === id); if (!e || e.void) return;
  requireOwner(() => openSheet(`<h2>Futa mauzo haya?</h2><p>${esc(lineName(e))} · ${fmt(e.amount)} · ${timeOf(e.t)}</p>
    <p class="small muted">Yataonekana kwenye kumbukumbu kama yaliyofutwa.</p>
    <div class="btnrow"><button class="btn" id="no">Hapana</button><button class="btn danger" id="yes">Ndiyo, futa</button></div>`, sh => {
    $('#no', sh).addEventListener('click', closeSheet);
    $('#yes', sh).addEventListener('click', () => {
      e.void = true; e.voidT = Date.now(); e.voidBy = session.userId; e.voidReason = 'futa';
      if (e.type === 'sale') { const it = itemById(e.itemId); if (it) it.stock = r3(it.stock + e.qty); }
      basket.ids = basket.ids.filter(x => x !== e.id); saveBasket(); save(); closeSheet(); toast('Mauzo yamefutwa'); render();
    });
  }), 'Kufuta mauzo');
}

function reportText(R, owner) {
  const L = [];
  L.push(`*${S.shopName} — Ripoti ya ${dayName(R.day)}*`);
  L.push(`Imetumwa na: ${me()?.name || ''}`);
  L.push(`Mauzo: ${tsh(R.total)} (${R.count})`);
  L.push(`Taslimu: ${fmt(R.cash)} · Simu: ${fmt(R.mobile)} · Deni: ${fmt(R.credit)}`);
  L.push(`Madeni ya zamani yaliyolipwa: ${fmt(R.payments + R.paymentsMobile)}${R.paymentsMobile ? ` (simu ${fmt(R.paymentsMobile)})` : ''}`);
  L.push(`Droo inatarajiwa: ${tsh(R.expected)}`);
  if (owner) L.push(`Faida (makadirio): ${tsh(R.profit)}`);
  const removed = R.voided.filter(e => e.voidReason === 'futa').length;
  if (removed) L.push(`Mauzo yaliyofutwa: ${removed}`);
  if (R.items.length) { L.push(''); L.push('_Bidhaa zilizouzwa zaidi:_'); R.items.slice(0, 8).forEach(r => L.push(`• ${r.name}: ${qtyText(r.qty, r.unit)} = ${fmt(r.amount)}`)); }
  if (R.checks.some(c => c.status !== 'ok')) { L.push(''); L.push('_Ukaguzi:_'); R.checks.filter(c => c.status !== 'ok').forEach(c => L.push(`• ${c.name}: ${c.status === 'gap' ? 'pengo ' + qtyText(c.remaining, c.unit) + ' ≈ ' + fmt(c.value) : 'zaidi ya mzigo'}`)); }
  if (R.low.length) { L.push(''); L.push('_Karibu kuisha:_ ' + R.low.map(i => i.name).join(', ')); }
  return L.join('\n');
}

/* ============================== SETTINGS (owner) ============================== */
function renderSettings(v) {
  const lockTxt = S.settings.autoLockMin ? `Baada ya dakika ${S.settings.autoLockMin} bila kutumia` : 'Haijifungi yenyewe';
  v.innerHTML = `<div class="screen">
    <h1>Mipangilio</h1>
    <div class="list">
      <div class="row"><div class="grow"><div class="title">Jina la duka</div><div class="sub">${esc(S.shopName)}</div></div><button class="btn sm" id="shop">Badilisha</button></div>
      <div class="row"><div class="grow"><div class="title">Jifunge yenyewe</div><div class="sub">${lockTxt}</div></div><button class="btn sm" id="autolock">Badilisha</button></div>
    </div>

    <h2>Watumiaji</h2>
    <div class="list">${S.users.map(u => `<div class="row"><div class="grow"><div class="title">${esc(u.name)}</div>
      <div class="sub">${u.role === 'owner' ? 'Mwenye duka' : 'Msaidizi — anaweza kuuza tu'}</div></div>
      <div class="actions"><button class="btn sm" data-pin="${u.id}">Badili PIN</button>
      ${u.role !== 'owner' ? `<button class="btn sm danger" data-rmu="${u.id}">Ondoa</button>` : ''}</div></div>`).join('')}</div>
    <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <button class="btn primary" id="addUser">+ Msaidizi</button><button class="btn" id="newCode">🔑 Namba mpya ya dharura</button></div>

    <h2>Bidhaa (${S.items.length})</h2>
    <div class="list">${S.items.map((it, i) => `<div class="row"><div class="grow"><div class="title">${it.fav ? '⭐ ' : ''}${esc(it.name)}</div>
      <div class="sub">${esc(it.cat)} · ${it.portions.map(p => `${esc(p.label)} = ${fmt(p.price)}`).join(' · ')}</div></div>
      <div class="actions"><button class="btn sm" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Juu">↑</button>
      <button class="btn sm" data-edit="${it.id}">Hariri</button></div></div>`).join('')}</div>
    <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <button class="btn primary" id="addkg">+ Bidhaa ya kilo</button><button class="btn primary" id="addpc">+ Bidhaa ya kipande</button>
      <button class="btn" id="bulk" style="grid-column:1/-1">📋 Ongeza nyingi kwa mara moja (bandika orodha)</button></div>

    <h2>Nakala (backup)</h2>
    <p class="muted small">Taarifa zote zinakaa kwenye simu hii tu. Hifadhi nakala mara kwa mara.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <button class="btn" id="export">⬇️ Hifadhi nakala</button>
      <label class="btn" style="display:flex;align-items:center;justify-content:center">⬆️ Rejesha<input id="import" type="file" accept="application/json" hidden></label>
    </div>
    <div style="margin-top:10px"><button class="btn danger block" id="reset">Futa kila kitu na anza upya</button></div>
    <p class="muted small" style="margin-top:14px">Daftari · toleo la majaribio 2</p>
  </div>`;
  $('#shop').addEventListener('click', () => promptText('Jina la duka', S.shopName, val => { S.shopName = val; save(); render(); }));
  $('#autolock').addEventListener('click', openAutoLock);
  $$('[data-pin]', v).forEach(b => b.addEventListener('click', () => changePin(b.dataset.pin)));
  $$('[data-rmu]', v).forEach(b => b.addEventListener('click', () => removeUser(b.dataset.rmu)));
  $('#addUser').addEventListener('click', addHelper);
  $('#newCode').addEventListener('click', regenerateCode);
  $$('[data-up]', v).forEach(b => b.addEventListener('click', () => { const i = +b.dataset.up; [S.items[i - 1], S.items[i]] = [S.items[i], S.items[i - 1]]; save(); render(); }));
  $$('[data-edit]', v).forEach(b => b.addEventListener('click', () => openItemEditor(b.dataset.edit)));
  $('#addkg').addEventListener('click', () => openItemEditor(null, 'kg'));
  $('#addpc').addEventListener('click', () => openItemEditor(null, 'pc'));
  $('#bulk').addEventListener('click', openBulkAdd);
  $('#export').addEventListener('click', exportData);
  $('#import').addEventListener('change', importData);
  $('#reset').addEventListener('click', () => openSheet(`<h2>Futa kila kitu?</h2><p>Mauzo, madeni, bidhaa na akaunti zote zitafutwa. Hifadhi nakala kwanza.</p>
    <div class="btnrow"><button class="btn" id="no">Hapana</button><button class="btn danger" id="yes">Ndiyo, futa</button></div>`, sh => {
    $('#no', sh).addEventListener('click', closeSheet);
    $('#yes', sh).addEventListener('click', () => {
      S = demoData(); save(); basket.ids = []; saveBasket(); session = null; lsSet(SESSION_KEY, null); closeSheet(); render();
    });
  }));
}

function openAutoLock() {
  const opts = [[5, 'Dakika 5'], [15, 'Dakika 15'], [30, 'Dakika 30'], [60, 'Saa 1'], [0, 'Kamwe']];
  openSheet(`<h2>Jifunge yenyewe baada ya…</h2><p class="small muted">Simu ikikaa bila kuguswa, Daftari inajifunga na inaomba PIN.</p>
    <div class="custpick">${opts.map(([m, l]) => `<button data-m="${m}"><span>${l}</span>${S.settings.autoLockMin === m ? '✓' : ''}</button>`).join('')}</div>`, sh => {
    $$('[data-m]', sh).forEach(b => b.addEventListener('click', () => { S.settings.autoLockMin = +b.dataset.m; save(); closeSheet(); render(); }));
  });
}

function addHelper() {
  promptText('Jina la msaidizi', '', name => {
    if (S.users.some(u => u.name.toLowerCase() === name.toLowerCase())) { toast('Jina hilo lipo tayari'); return; }
    const back = () => { tab = 'settings'; render(); };
    choosePin($('#view'), `Chagua PIN ya ${name}`, async pin => {
      const u = { id: uid(), name, role: 'helper', pin: await makeSecret(pin) };
      S.users.push(u); log({ type: 'user', action: 'add', userId: u.id, name }); save();
      toast(`${name} ameongezwa`); back();
    }, back);
  });
}
function changePin(id) {
  const u = userById(id);
  const back = () => { tab = 'settings'; render(); };
  choosePin($('#view'), `PIN mpya ya ${u.name}`, async pin => {
    u.pin = await makeSecret(pin); log({ type: 'user', action: 'pin', userId: id, name: u.name }); save();
    toast('PIN imebadilishwa'); back();
  }, back);
}
function removeUser(id) {
  const u = userById(id);
  openSheet(`<h2>Mwondoe ${esc(u.name)}?</h2><p class="small muted">Hataweza kuingia tena. Mauzo yake ya zamani yatabaki kwenye ripoti.</p>
    <div class="btnrow"><button class="btn" id="no">Hapana</button><button class="btn danger" id="yes">Ndiyo, ondoa</button></div>`, sh => {
    $('#no', sh).addEventListener('click', closeSheet);
    $('#yes', sh).addEventListener('click', () => {
      u.removed = true; S.users = S.users.filter(x => x.id !== id);
      (S.formerUsers = S.formerUsers || []).push({ id: u.id, name: u.name });
      log({ type: 'user', action: 'remove', userId: id, name: u.name }); save(); closeSheet(); render();
    });
  });
}
function regenerateCode() {
  openSheet(`<h2>Namba mpya ya dharura?</h2><p class="small muted">Namba ya zamani itaacha kufanya kazi.</p>
    <div class="btnrow"><button class="btn" id="no">Hapana</button><button class="btn primary" id="yes">Ndiyo</button></div>`, sh => {
    $('#no', sh).addEventListener('click', closeSheet);
    $('#yes', sh).addEventListener('click', async () => {
      const code = newRecoveryCode(); S.recovery = await makeSecret(normCode(code));
      log({ type: 'user', action: 'code' }); save();
      openSheet(`<h2>Namba mpya ya dharura</h2><div class="code">${code}</div><p>Iandike kwenye karatasi na uitunze mahali salama.</p>
        <div class="btnrow"><button class="btn primary" id="ok">Nimeiandika</button></div>`, s2 => $('#ok', s2).addEventListener('click', closeSheet));
    });
  });
}

function promptText(label, value, done, type = 'text') {
  openSheet(`<h2>${esc(label)}</h2><div class="field"><input id="val" type="${type}" value="${esc(value)}"></div>
    <div class="btnrow"><button class="btn" id="no">Ghairi</button><button class="btn primary" id="yes">Hifadhi</button></div>`, sh => {
    $('#val', sh).focus();
    $('#no', sh).addEventListener('click', closeSheet);
    $('#yes', sh).addEventListener('click', () => { const v = $('#val', sh).value.trim(); if (!v) return; closeSheet(); done(v); });
  });
}

function openItemEditor(id, unitForNew) {
  const isNew = !id;
  const it = isNew ? {
    id: uid(), name: '', unit: unitForNew, cat: unitForNew === 'kg' ? 'Vyakula' : 'Nyinginezo', fav: false, cost: 0, stock: 0,
    lowAt: unitForNew === 'kg' ? 3 : 5, lastInQty: 0,
    portions: unitForNew === 'kg' ? kgPortions(0) : [{ label: '1', qty: 1, price: 0 }],
  } : JSON.parse(JSON.stringify(itemById(id)));

  const prow = (p, i) => `<div class="prow" data-i="${i}">
    <input class="pl" value="${esc(p.label)}" placeholder="Jina">
    <input class="pq" type="number" inputmode="decimal" step="any" value="${p.qty}" placeholder="Kiasi">
    <input class="pp" type="number" inputmode="numeric" value="${p.price || ''}" placeholder="Bei">
    <button class="x" data-rm="${i}" aria-label="Ondoa">×</button></div>`;

  openSheet(`
    <h2>${isNew ? 'Bidhaa mpya' : 'Hariri bidhaa'}</h2>
    <div class="field"><label>Jina</label><input id="name" value="${esc(it.name)}" placeholder="mf. Sukari"></div>
    <div class="field two"><div><label>Inauzwa kwa</label><select id="unit">
      <option value="kg" ${it.unit === 'kg' ? 'selected' : ''}>Kilo</option>
      <option value="pc" ${it.unit === 'pc' ? 'selected' : ''}>Kipande</option></select></div>
      <div><label>Kundi</label><select id="cat">${CATS.map(c => `<option ${it.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div>
    <label class="check"><input type="checkbox" id="fav" ${it.fav ? 'checked' : ''}> ⭐ Maarufu (ionekane kwanza kwenye Uza)</label>
    <div class="field"><label>Vitufe vya kuuza — jina · kiasi (<span id="uw">${it.unit === 'kg' ? 'kilo' : 'vipande'}</span>) · bei (TSh)</label>
      <div class="phead"><span>Jina</span><span>Kiasi</span><span>Bei</span><span></span></div>
      <div id="prows">${it.portions.map(prow).join('')}</div>
      <button class="btn sm" id="addp">+ Kitufe</button></div>
    <div class="field"><label>Bei ya kununua kwa <span id="uw2">${unitWord(it.unit)}</span> (TSh)</label><input id="cost" type="number" inputmode="numeric" value="${it.cost || ''}"></div>
    <div class="field two"><div><label>Stoo iliyopo</label><input id="stock" type="number" inputmode="decimal" step="any" value="${it.stock}"></div>
      <div><label>Nionye ikifika</label><input id="low" type="number" inputmode="decimal" step="any" value="${it.lowAt}"></div></div>
    <div class="btnrow">${isNew ? '' : '<button class="btn danger" id="del">Futa</button>'}<button class="btn" id="cancel">Ghairi</button><button class="btn primary" id="ok">Hifadhi</button></div>`, sh => {
    const readRows = () => $$('.prow', sh).map(r => ({ label: $('.pl', r).value.trim(), qty: +$('.pq', r).value, price: +$('.pp', r).value }));
    const redraw = rows => { $('#prows', sh).innerHTML = rows.map(prow).join(''); bindRm(); };
    const bindRm = () => $$('[data-rm]', sh).forEach(b => b.addEventListener('click', () => { const rows = readRows(); rows.splice(+b.dataset.rm, 1); redraw(rows); }));
    bindRm();
    $('#addp', sh).addEventListener('click', () => { const rows = readRows(); rows.push({ label: '', qty: 1, price: 0 }); redraw(rows); });
    $('#unit', sh).addEventListener('change', e => {
      const u = e.target.value; $('#uw', sh).textContent = u === 'kg' ? 'kilo' : 'vipande'; $('#uw2', sh).textContent = unitWord(u);
      if (u === 'kg' && readRows().every(r => !r.price)) redraw(kgPortions(0));
    });
    $('#cancel', sh).addEventListener('click', closeSheet);
    $('#del', sh)?.addEventListener('click', () => {
      S.items = S.items.filter(x => x.id !== it.id);
      log({ type: 'item', action: 'delete', itemId: it.id, name: it.name }); save(); closeSheet(); toast('Bidhaa imefutwa'); render();
    });
    $('#ok', sh).addEventListener('click', () => {
      const name = $('#name', sh).value.trim();
      const portions = readRows().filter(p => p.label && p.qty > 0 && p.price > 0);
      if (!name) { toast('Weka jina la bidhaa'); return; }
      if (!portions.length) { toast('Weka angalau kitufe kimoja chenye kiasi na bei'); return; }
      const unit = $('#unit', sh).value;
      const newStock = r3(+$('#stock', sh).value || 0), newCost = +$('#cost', sh).value || 0;
      const orig = isNew ? null : itemById(it.id);
      if (orig) {
        if (newStock !== r3(orig.stock)) log({ type: 'adjust', itemId: it.id, name, unit, from: orig.stock, to: newStock });
        const before = orig.portions.map(p => `${p.label}=${fmt(p.price)}`).join(', ');
        const after = portions.map(p => `${p.label}=${fmt(p.price)}`).join(', ');
        const changes = [];
        if (before !== after) changes.push(`bei ${before} → ${after}`);
        if (newCost !== orig.cost) changes.push(`bei ya kununua ${fmt(orig.cost)} → ${fmt(newCost)}`);
        if (name !== orig.name) changes.push(`jina ${orig.name} → ${name}`);
        if (changes.length) log({ type: 'price', itemId: it.id, name, change: changes.join('; ') });
      }
      Object.assign(it, { name, unit, cat: $('#cat', sh).value, fav: $('#fav', sh).checked, portions, cost: newCost, stock: newStock, lowAt: +$('#low', sh).value || 0 });
      if (isNew) { it.lastInQty = it.stock; S.items.push(it); log({ type: 'item', action: 'add', itemId: it.id, name }); }
      else Object.assign(orig, it);
      save(); closeSheet(); toast('Imehifadhiwa'); render();
    });
  });
}

/* ---- bulk add: paste one item per line ---- */
function parseBulk(text) {
  const out = [], bad = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim(); if (!line) continue;
    const parts = line.split(/[,;\t]/).map(s => s.trim()).filter(Boolean);
    const name = parts.shift();
    let unit = 'pc';
    if (parts[0] && /^(kg|kilo|kilogramu)$/i.test(parts[0])) { unit = 'kg'; parts.shift(); }
    const nums = [], words = [];
    for (const p of parts) { const n = +p.replace(/[,\s]/g, '').replace(/tsh/i, ''); if (p && !isNaN(n)) nums.push(n); else words.push(p); }
    const price = nums[0], cost = nums[1] || 0, stock = nums[2] || 0;
    if (!name || !(price > 0)) { bad.push(line); continue; }
    const catWord = words.find(w => CATS.some(c => c.toLowerCase().startsWith(w.toLowerCase().slice(0, 4))));
    const cat = catWord ? CATS.find(c => c.toLowerCase().startsWith(catWord.toLowerCase().slice(0, 4))) : (unit === 'kg' ? 'Vyakula' : 'Nyinginezo');
    out.push({
      id: uid(), name, unit, cat, fav: false, cost, stock, lowAt: unit === 'kg' ? 3 : 5, lastInQty: stock,
      portions: unit === 'kg' ? kgPortions(price) : [{ label: '1', qty: 1, price }],
    });
  }
  return { items: out, bad };
}

function openBulkAdd() {
  openSheet(`<h2>Ongeza bidhaa nyingi</h2>
    <p class="small muted">Bidhaa moja kwa kila mstari. Unaweza kuandika orodha kwenye WhatsApp au kompyuta kisha ubandike hapa.</p>
    <pre class="example">Jina, bei, bei ya kununua, stoo, kundi
Soda, 1000, 800, 24, Vinywaji
Sabuni ya Mbuni, 1500, 1200
Sukari, kg, 3000, 2650, 50
Mchele Mbeya, kg, 2600, 2200, 25</pre>
    <p class="small muted">Kwa bidhaa za kilo andika <b>kg</b> na bei ya kilo 1 — vitufe vya ¼, ½ na 1 kg vinatengenezwa vyenyewe (unaweza kubadilisha bei baadaye).</p>
    <textarea id="txt" rows="8" placeholder="Bandika orodha hapa…"></textarea>
    <div id="prev" class="small"></div>
    <label class="check"><input type="checkbox" id="replace"> Futa bidhaa za mfano kwanza</label>
    <div class="btnrow"><button class="btn" id="cancel">Ghairi</button><button class="btn primary" id="ok" disabled>Ongeza</button></div>`, sh => {
    const txt = $('#txt', sh), prev = $('#prev', sh), ok = $('#ok', sh);
    let parsed = { items: [], bad: [] };
    txt.addEventListener('input', () => {
      parsed = parseBulk(txt.value);
      prev.innerHTML = (parsed.items.length ? `<p>✅ Bidhaa ${parsed.items.length}: ${parsed.items.map(i => `${esc(i.name)} (${i.unit === 'kg' ? 'kilo ' : ''}${fmt(i.portions[i.portions.length - 1].price)})`).join(', ')}</p>` : '')
        + (parsed.bad.length ? `<p style="color:var(--danger)">⚠️ Mistari ${parsed.bad.length} haieleweki: ${parsed.bad.map(esc).join(' | ')}</p>` : '');
      ok.disabled = !parsed.items.length; ok.textContent = `Ongeza ${parsed.items.length || ''}`;
    });
    $('#cancel', sh).addEventListener('click', closeSheet);
    ok.addEventListener('click', () => {
      if ($('#replace', sh).checked) { S.items = []; S.showSampleBanner = false; }
      for (const it of parsed.items) { S.items.push(it); log({ type: 'item', action: 'add', itemId: it.id, name: it.name }); }
      save(); closeSheet(); toast(`Bidhaa ${parsed.items.length} zimeongezwa`); render();
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
      S = migrate(d); save(); basket.ids = []; saveBasket();
      if (!me()) { session = null; lsSet(SESSION_KEY, null); }
      toast('Nakala imerejeshwa'); render();
    } catch (err) { toast('Faili si sahihi'); }
  };
  r.readAsText(f);
}

/* ============================== boot ============================== */
$$('#tabs button').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
paint('sell');

// Auto-lock after a period without touches.
let lastTouchSave = 0;
document.addEventListener('pointerdown', () => {
  if (!session) return;
  session.last = Date.now();
  if (session.last - lastTouchSave > 10000) { lastTouchSave = session.last; lsSet(SESSION_KEY, session); }
}, true);
function checkAutoLock() {
  const m = S.settings?.autoLockMin;
  if (session && m && Date.now() - (session.last || 0) > m * 60000) lock();
}
setInterval(checkAutoLock, 15000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { checkAutoLock(); keepAwake(); } });

// Keep the screen awake while the app is open (phone stands on the counter).
async function keepAwake() {
  try { if ('wakeLock' in navigator && document.visibilityState === 'visible') await navigator.wakeLock.request('screen'); } catch (e) {}
}
keepAwake();

// Ask the browser not to clear our data when the phone is low on space.
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

// Offline support.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
