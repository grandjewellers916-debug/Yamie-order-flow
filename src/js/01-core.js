// ======================================================================
// Yamie Order Desk — core: helpers, server calls, sync, login
// ======================================================================
const APP_VERSION = '3.0';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s != null ? s : '').replace(/[&<>"']/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]);
const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[,₹\s]/g, '')); return isFinite(n) ? n : 0; };
const r2 = (n) => Math.round(n * 100) / 100;
const rupee = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');
const rupee2 = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const g3 = (n) => (n ? Number(n).toFixed(3) + ' g' : '—');
const fmtN = (n) => (n == null || n === '' ? '' : String(Math.round(Number(n) * 1000) / 1000));
const dt = (s) => (s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const dshort = (s) => (s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—');
const dtt = (s) => (s ? new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const ymd = (d) => { d = new Date(d); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const today = () => ymd(new Date());
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const clone = (o) => JSON.parse(JSON.stringify(o));
const lastOf = (a) => (a && a.length ? a[a.length - 1] : null);
function ago(t) { const h = (Date.now() - new Date(t)) / 36e5; if (h < 1) return Math.max(1, Math.round(h * 60)) + ' min ago'; if (h < 48) return Math.round(h) + ' h ago'; return Math.floor(h / 24) + ' days ago'; }
function load(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('on'), 2800); }
const NATIVE = window.YamieNative || null;

const PERMS = [
  ['enquiry', 'Create & edit enquiries'], ['estimate', 'Issue estimates'], ['approve', 'Record customer approval'],
  ['advance', 'Record payments'], ['verify', 'Verify payments'], ['discount', 'Approve discounts'], ['confirm', 'Confirm orders'],
  ['vendor', 'Assign vendor / change ETD'], ['production', 'Vendor follow-up & production'], ['receive', 'Receive in store'],
  ['qc', 'QC approve / reject'], ['finalprice', 'Calculate final price'], ['approvefinal', 'Approve final price'],
  ['ready', 'Notify ready'], ['close', 'Invoice & close'], ['cancel', 'Hold / cancel confirmed orders'], ['rates', 'Update gold rates'],
  ['vendors', 'Edit vendor list'], ['vendorcontact', 'See vendor phone numbers'], ['review', 'Answer review requests (pricing / design)'], ['viewcost', 'See vendor cost'], ['reports', 'Reports'], ['delete', 'Delete enquiries'], ['grand', 'Grand module: open and view Grand orders'], ['grandCreate', '01. Order creation (new / edit / cancel)'], ['grandSend', '02. Order sending (WhatsApp to vendor & copies)'], ['grandRecv', '03. Order receipt (check against order, not received, close short)'],
  ['grandQc', '04. QC'], ['grandLabel', '05. Labelling'], ['grandMark', '06. Laser marking'], ['grandPack', '07. Packing with printed packing list'], ['grandDispatch', '08. Mark as sent to Grand (carrier & signature)'], ['grandAcct', '09. Bullion issue, receipt doc. no., balance & payment'], ['grandcfg', 'Edit Grand module lists; re-open closed orders (edit & delete orders: admin only)'], ['settings', 'Settings'],
];
const DEF_ROLE_PERMS = {
  manager: PERMS.map((p) => p[0]).filter((k) => k !== 'settings' && !k.startsWith('grand')),
  staff: ['enquiry', 'estimate', 'approve', 'advance', 'confirm', 'production', 'receive', 'finalprice', 'ready', 'close'],
};
const DEF_SETTINGS = {
  shop: 'Yamie Fine Jewellery', shopPhone: '+91 87141 22750', gstin: '32AACFY4685K1ZR',
  shopAddr: '63/322Aa Ground Level, Grand Business Center, K K Road, Kadavanthra, Ernakulam, Kerala 682020',
  rates: { k22: 0, k18: 0, k14: 0, k9: 0, pt: 0, ag: 0, at: 0, by: '', src: '', kioskAt: '' },
  kioskAuto: true, kioskUrl: 'https://grandjewellers.com/api/kiosk-rates',
  gst: 3, minAdv: 20, roundTo: 50, finalRoundTo: 100, gems: null, lists: null, mkRules: [], mkShow: 'type', verifyPay: true, huidRate: 80, shipRates: [{ name: 'Courier (Kerala)', rate: 150 }, { name: 'Courier (rest of India)', rate: 300 }, { name: 'India Post (insured)', rate: 400 }], shopPhone2: '', shopLandline: '', woPhone: '', rem: {}, reviewDesks: [{ name: 'Owner / Admin', users: [] }, { name: 'Design desk', users: [] }], reviewTopics: ['Pricing', 'Making charge', 'Design style', 'Stones', 'Size / weight', 'Other'], mkOnStone: false, leadDays: 20, qcBuffer: 2, weeklyOff: [0], holidays: [],
  estValid: 7, validCount: 'cal', estExpired: 'block', finalValid: 0, roundMode: 'up', finalRoundMode: 'up', advRound: 1, tol: 2, discLimit: 0, karatRef: { k22: 32.6, k18: 28.4, k14: 24.3, k9: 18.7 },
  approveDays: 2, etdWarnDays: 2, collectDays: 7, autoLock: 20,
  priceCheckUrl: 'https://yamie-price-check.netlify.app', repairUrl: 'https://yamie-repair-desk.netlify.app',
};

// ---------------- server ----------------
const API_DEFAULT = 'https://yamie-order-desk.netlify.app';
const SAME_ORIGIN = /^https?:$/.test(location.protocol) && !/^appassets\.|^localhost$|^127\./.test(location.hostname) && !localStorage.getItem('yod_api');
let API = SAME_ORIGIN ? '' : localStorage.getItem('yod_api') || API_DEFAULT;

let orders = [], users = [], vendors = [], rolePerms = DEF_ROLE_PERMS, S = Object.assign({}, DEF_SETTINGS);
let me = null, token = load('yod_token', null), cfgv = '', lastPull = 0, online = true, resetAt = '';
(function () {
  const c = load('yod_cache', null);
  if (c) { orders = c.orders || []; users = c.users || []; vendors = c.vendors || []; rolePerms = c.rolePerms || DEF_ROLE_PERMS; S = Object.assign({}, DEF_SETTINGS, c.settings || {}); cfgv = c.cfgv || ''; lastPull = c.lastPull || 0; resetAt = c.resetAt || ''; }
})();
function cacheLocal() { store('yod_cache', { orders, users, vendors, rolePerms, settings: S, cfgv, lastPull, resetAt }); }

async function api(path, body) {
  const r = await fetch(API + '/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  let d = {};
  try { d = await r.json(); } catch (e) { /* not json */ }
  if (!r.ok) {
    const e = new Error(d.error || 'Server error ' + r.status); e.status = r.status; e.data = d;
    if (r.status === 401 && me && path !== 'login') { toast('Session ended — please log in again'); showLock(); }
    throw e;
  }
  return d;
}
const isNet = (e) => !e || !e.status;
function setNet(ok) { online = ok; const el = $('syncBtn'); if (!el) return; el.className = 'iconBtn syncDot ' + (ok ? 'ok' : 'off'); el.textContent = ok ? '✓' : '⚠'; el.title = ok ? 'Up to date' : 'Offline — showing saved data'; }

const can = (p) => !!me && (me.role === 'admin' || (rolePerms[me.role] || []).includes(p));
function applyCfg(d) {
  if (d.users) users = d.users;
  if (d.vendors) vendors = d.vendors;
  if (d.settings) S = Object.assign({}, DEF_SETTINGS, d.settings);
  if (d.rolePerms) rolePerms = d.rolePerms;
  if (d.cfgv) cfgv = d.cfgv;
  if (d.me) me = d.me;
}
function mergeOrder(o) { const i = orders.findIndex((x) => x.id === o.id); if (i > -1) orders[i] = o; else orders.unshift(o); }
const sortOrders = () => orders.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

let serverVer = '';
/** Version on the top bar (app or web) and a warning when the server is older than this app. */
function showVersion() {
  const appV = NATIVE && NATIVE.version ? (() => { try { return NATIVE.version(); } catch (e) { return ''; } })() : '';
  const el = $('verTag'); if (el) el.textContent = (appV ? 'App v' + APP_VERSION + (appV.split('.').slice(0, 2).join('.') !== APP_VERSION ? ' (live)' : '') : 'Web v' + APP_VERSION) + (serverVer && serverVer !== APP_VERSION ? ' · server v' + serverVer : '');
  const w = $('verWarn'); if (w) w.hidden = !(serverVer && parseFloat(serverVer) < parseFloat(APP_VERSION));
}
async function pullAll() {
  const d = await api('state');
  orders = d.orders; applyCfg(d); lastPull = d.now; resetAt = d.resetAt || '';
  serverVer = d.ver || '1.7'; showVersion(); if (typeof updCheck === 'function') updCheck(false);
  sortOrders(); cacheLocal(); setNet(true);
}
let pulling = false;
async function pullChanges() {
  if (!token || !me || pulling) return;
  pulling = true;
  try {
    const d = await api('changes?since=' + (lastPull || 0) + '&cfgv=' + encodeURIComponent(cfgv));
    if ((d.resetAt || '') !== resetAt) { await pullAll(); }
    else {
      d.orders.forEach(mergeOrder);
      d.deleted.forEach((id) => { orders = orders.filter((o) => o.id !== id); });
      if (d.users) applyCfg(d); else if (d.me) me = d.me;
      lastPull = d.now; sortOrders(); cacheLocal(); setNet(true);
    }
    if (d.orders.length || d.deleted.length || d.users) refresh();
  } catch (e) { if (isNet(e)) setNet(false); }
  finally { pulling = false; }
}
function pullNow() { pullChanges().then(() => toast(online ? 'Up to date' : 'Offline — showing saved data')); }

/** Save one order. The server checks the step and returns the stored order. */
async function saveOrder(o, msg) {
  try {
    const r = await api('order', { order: o, baseRev: o.rev || 0 });
    mergeOrder(r.order); sortOrders(); cacheLocal(); setNet(true);
    if (msg) toast(msg);
    refresh();
    return r.order;
  } catch (e) {
    if (isNet(e)) { setNet(false); toast('No internet — not saved. Try again when online.'); }
    else if (e.status === 409 && e.data && e.data.order) { mergeOrder(e.data.order); refresh(); toast('Changed on another device — showing the latest. Do the step again.'); }
    else toast(e.message);
    return null;
  }
}
/** Copy the order, apply a change, log it, save. */
async function step(id, fn, logText, msg) {
  const cur = orders.find((x) => x.id === id);
  if (!cur) return null;
  const o = clone(cur);
  const r = fn(o);
  if (r === false) return null;
  if (logText) o.log = (o.log || []).concat([{ t: Date.now(), by: me.name, a: logText }]);
  return saveOrder(o, msg);
}

// ---------------- photos ----------------
function imgUrl(ref) {
  if (!ref) return '';
  if (ref.startsWith('img:')) return API + '/api/img/' + ref.slice(4) + '?t=' + encodeURIComponent(token || '');
  return ref;
}
function shrinkImage(file, max = 1600, q = 0.82) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const sc = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q));
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read the photo')); };
    im.src = url;
  });
}
async function uploadPhoto(file) {
  const data = await shrinkImage(file);
  const r = await api('img', { data });
  return 'img:' + r.key;
}
let photoCb = null;
function pickPhoto(cb, camera) { photoCb = cb; const el = camera ? $('phCam') : $('phGal'); el.value = ''; el.click(); }
async function onPhotoPicked(e) {
  const files = Array.from(e.target.files || []); if (!files.length || !photoCb) return;
  const cb = photoCb; photoCb = null;
  toast('Uploading photo…');
  for (const f of files.slice(0, 6)) {
    try { cb(await uploadPhoto(f)); } catch (er) { toast(isNet(er) ? 'No internet — photo not uploaded' : er.message); break; }
  }
}

// ---------------- login / lock ----------------
let loginList = load('yod_loginlist', null), pickUser = null, pinBuf = '', lastAct = Date.now();
function showLock(reason) {
  lockMode = 'pin';
  $('lock').hidden = false; $('app').hidden = true; pinBuf = '';
  if (me) pickUser = me.id;
  me = null; token = null; store('yod_token', null);
  renderLock(reason || '');
  api('login-list').then((d) => { loginList = d; store('yod_loginlist', d); renderLock(reason || ''); }).catch(() => renderLock('Offline — log in needs the internet'));
}
function renderLock(msg) {
  if (lockMode !== 'pin') return;
  const L = loginList;
  if (!L) { $('lockBox').innerHTML = '<div class="msg">Connecting…</div>'; return; }
  if (!pickUser || !L.users.find((u) => u.id === pickUser)) pickUser = L.users.length === 1 ? L.users[0].id : load('yod_lastuser', null);
  $('lockBox').innerHTML = `
    <div class="users">${L.users.map((u) => `<button class="${u.id === pickUser ? 'on' : ''}" onclick="pickUser='${u.id}';pinBuf='';renderLock()">${esc(u.name)}</button>`).join('')}</div>
    ${L.setup ? '<div class="msg" style="color:#fff">First start: log in as Admin with the PIN set in Netlify (or 1986), then set your own name and PIN.</div>' : ''}
    <div class="dots">${[0, 1, 2, 3].map((i) => `<i class="${i < pinBuf.length ? 'f' : ''}"></i>`).join('')}</div>
    <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k) => k === '' ? '<span></span>' : `<button onclick="padKey('${k}')">${k}</button>`).join('')}</div>
    <div class="msg">${esc(msg || '')}</div>`;
}
function padKey(k) {
  if (!pickUser) return renderLock('Tap your name first');
  if (k === '⌫') pinBuf = pinBuf.slice(0, -1); else if (pinBuf.length < 4) pinBuf += k;
  renderLock();
  if (pinBuf.length === 4) doLogin();
}
let lockMode = 'pin';   // 'pin' = keypad on screen, 'setup' = first-time name + PIN form
document.addEventListener('keydown', (e) => {
  if ($('lock').hidden || lockMode !== 'pin') return;
  if (e.target && e.target.matches && e.target.matches('input,textarea,select')) return;
  if (/^[0-9]$/.test(e.key)) padKey(e.key); else if (e.key === 'Backspace') padKey('⌫');
});
async function doLogin() {
  const pin = pinBuf;
  try {
    const r = await api('login', { userId: pickUser, pin });
    token = r.token; me = r.user; store('yod_token', token); store('yod_lastuser', me.id);
    await pullAll();
    if (me.mustChange) return firstSetup();
    startSession();
  } catch (e) { pinBuf = ''; renderLock(isNet(e) ? 'No internet — cannot log in' : e.message); }
}
function firstSetup() {
  lockMode = 'setup';
  $('lockBox').innerHTML = `<div class="msg" style="color:#fff;margin:0 0 10px">Set your own name and a new 4-digit PIN.</div>
    <input id="fsName" placeholder="Your name" value="${esc(me.name === 'Admin' ? '' : me.name)}">
    <input id="fsPin" placeholder="New 4-digit PIN" inputmode="numeric" maxlength="4">
    <button class="btn block" style="background:#fff;color:var(--wine)" onclick="saveFirst()">Save & continue</button><div class="msg" id="fsMsg"></div>`;
}
async function saveFirst() {
  const name = $('fsName').value.trim(), pin = $('fsPin').value.trim();
  if (!name || !/^\d{4}$/.test(pin)) { $('fsMsg').textContent = 'Enter your name and 4 digits'; return; }
  try { const r = await api('mypin', { pin, name }); me = r.user; lockMode = 'pin'; await pullAll(); startSession(); } catch (e) { $('fsMsg').textContent = isNet(e) ? 'No internet — try again' : e.message; }
}
function logout() { store('yod_token', null); token = null; showLock(); }
function startSession() {
  $('lock').hidden = true; $('app').hidden = false; lastAct = Date.now();
  $('meBtn').textContent = (me.name || '?').split(' ')[0];
  go(cur.view || 'vHome');
  syncNative();
  if (pendingOpen) { openOrder(pendingOpen); pendingOpen = null; }
}
['click', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true }));
setInterval(() => { if (me && S.autoLock > 0 && Date.now() - lastAct > S.autoLock * 60000) { toast('Locked after no use'); showLock(); } }, 30000);
setInterval(pullChanges, 15000);
window.addEventListener('focus', pullChanges);
document.addEventListener('visibilitychange', () => { if (!document.hidden) pullChanges(); });

// ---------------- phone contacts ----------------
/** Can this device pick from the phone's contacts? (APK bridge, or Chrome's Contact Picker on Android) */
const canPickContact = () => !!((NATIVE && NATIVE.pickContact) || (navigator.contacts && navigator.contacts.select));
const cleanPhone = (p) => { const d = String(p || '').replace(/[^\d+]/g, ''); return d.replace(/^\+?91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, ''); };
/** Opens the phone's contacts; calls done({name, phone}) with the chosen person. */
async function pickContact(done) {
  if (NATIVE && NATIVE.pickContact) {
    window.onContactPicked = (r) => { window.onContactPicked = null; if (r && r.ok) done({ name: r.name || '', phone: cleanPhone(r.phone) }); else if (r && r.error) toast(r.error); };
    NATIVE.pickContact(); return;
  }
  if (navigator.contacts && navigator.contacts.select) {
    try { const [c] = await navigator.contacts.select(['name', 'tel'], { multiple: false }); if (c) done({ name: (c.name || [])[0] || '', phone: cleanPhone((c.tel || [])[0] || '') }); } catch (e) { /* cancelled */ }
    return;
  }
  toast('Picking contacts works in the Order Desk app or Chrome on Android');
}
/** Adds a person to the phone's contacts (APK), or downloads a contact card (.vcf) elsewhere. */
function saveToContacts(name, phone, note) {
  const p = cleanPhone(phone), full = /^\d{10}$/.test(p) ? '+91' + p : phone;
  if (NATIVE && NATIVE.saveContact) return NATIVE.saveContact(name, full, note || '');
  const vcf = `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL;TYPE=CELL:${full}\n${note ? 'NOTE:' + note + '\n' : ''}END:VCARD\n`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([vcf], { type: 'text/vcard' })); a.download = (name || 'contact').replace(/[^\w ]+/g, '') + '.vcf'; a.click();
  toast('Contact card downloaded — open it to add to contacts');
}
