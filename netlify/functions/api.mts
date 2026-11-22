// Yamie Order Desk — shared database for all phones (APK) and computers (web).
// Netlify Blobs store "yamie-order" (strong consistency):
//   orders/<id>            one enquiry / order (photos stored separately as img/<key>)
//   img/<key>              photo bytes
//   seq/<EST|YOR>-<yyyy>/<n>  document numbers, created once (onlyIfNew) so two phones never get the same number
//   chg/<day>/<ts>-<r>     change log used by phones to pull only what changed
//   cfg/users|vendors|settings|roleperms, meta/cfgv, meta/secret, meta/resetAt, lock/<uid>
//
// Every status change is checked here, not only in the app: permission for the step, and the
// business rules (20% verified advance before confirming, QC + final price before ready,
// invoice + payment + handover before closing). Order numbers are issued here, once.
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import { backupOp } from '../lib/backup.mts';

export const config = { path: '/api/*' };

const PERM_KEYS = ['enquiry', 'estimate', 'approve', 'advance', 'verify', 'discount', 'confirm', 'vendor', 'production', 'receive', 'qc',
  'finalprice', 'approvefinal', 'ready', 'close', 'cancel', 'rates', 'vendors', 'vendorcontact', 'viewcost', 'reports', 'delete', 'settings'];
const DEF_ROLE_PERMS: Record<string, string[]> = {
  manager: PERM_KEYS.filter((k) => k !== 'settings'),
  staff: ['enquiry', 'estimate', 'approve', 'advance', 'confirm', 'production', 'receive', 'finalprice', 'ready', 'close'],
};
const DEF_SETTINGS: any = {
  shop: 'Yamie Fine Jewellery', shopPhone: '+91 87141 22750', gstin: '32AACFY4685K1ZR',
  shopAddr: '63/322Aa Ground Level, Grand Business Center, K K Road, Kadavanthra, Ernakulam, Kerala 682020',
  rates: { k22: 0, k18: 0, k14: 0, k9: 0, pt: 0, ag: 0, at: 0, by: '', src: '', kioskAt: '' },
  kioskAuto: true, kioskUrl: 'https://grandjewellers.com/api/kiosk-rates',
  gst: 3, minAdv: 20, roundTo: 50, finalRoundTo: 100, gems: null, lists: null, mkRules: [], mkOnStone: true, leadDays: 20, qcBuffer: 2, weeklyOff: [0], holidays: [],
  estValid: 7, tol: 2, discLimit: 0, karatRef: { k22: 32.6, k18: 28.4, k14: 24.3, k9: 18.7 },
  approveDays: 2, etdWarnDays: 2, collectDays: 7, autoLock: 20,
  priceCheckUrl: 'https://yamie-price-check.netlify.app', repairUrl: 'https://yamie-repair-desk.netlify.app',
};

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-max-age': '86400' };
const J = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });
const err = (msg: string, status = 400, extra: any = {}) => J({ error: msg, ...extra }, status);
const store = () => getStore({ name: 'yamie-order', consistency: 'strong' });
const rid = () => crypto.randomBytes(5).toString('hex');
const now = () => Date.now();
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
class HttpError extends Error { status: number; extra: any; constructor(m: string, s: number, extra: any = {}) { super(m); this.status = s; this.extra = extra; } }

// ---------- auth (same scheme as Repair Desk) ----------
async function secret(s: any) {
  const env = Netlify.env.get('APP_SECRET');
  if (env) return env;
  let v = await s.get('meta/secret');
  if (!v) { await s.set('meta/secret', crypto.randomBytes(32).toString('hex'), { onlyIfNew: true }); v = await s.get('meta/secret'); }
  return v as string;
}
const hashPin = (pin: string, salt: string) => crypto.pbkdf2Sync(String(pin), salt, 20000, 32, 'sha256').toString('hex');
async function sign(s: any, payload: any) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', await secret(s)).update(body).digest('base64url');
}
async function verify(s: any, tok: string | null) {
  if (!tok) return null;
  const [body, sig] = tok.split('.');
  if (!body || !sig) return null;
  const good = crypto.createHmac('sha256', await secret(s)).update(body).digest('base64url');
  if (good.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  return p.exp < now() ? null : p;
}

// ---------- config ----------
async function getUsers(s: any): Promise<any[]> {
  let u = await s.get('cfg/users', { type: 'json' });
  if (!u) {
    const salt = rid();
    const pin = Netlify.env.get('ADMIN_PIN') || '1986';
    await s.setJSON('cfg/users', { users: [{ id: 'admin', name: 'Admin', role: 'admin', phone: '', salt, pinHash: hashPin(pin, salt), active: true, mustChange: true, created: now() }] }, { onlyIfNew: true });
    u = await s.get('cfg/users', { type: 'json' });
  }
  return u.users;
}
const pubUser = (u: any) => ({ id: u.id, name: u.name, role: u.role, phone: u.phone || '', active: u.active !== false, mustChange: !!u.mustChange });
async function getSettings(s: any) {
  const st = (await s.get('cfg/settings', { type: 'json' })) || {};
  return { ...DEF_SETTINGS, ...st, rates: { ...DEF_SETTINGS.rates, ...(st.rates || {}) }, karatRef: { ...DEF_SETTINGS.karatRef, ...(st.karatRef || {}) } };
}
async function getCfg(s: any) {
  const [users, vendors, settings, rp, cfgv] = await Promise.all([
    getUsers(s), s.get('cfg/vendors', { type: 'json' }), getSettings(s), s.get('cfg/roleperms', { type: 'json' }), s.get('meta/cfgv'),
  ]);
  return { users: users.map(pubUser), vendors: vendors || [], settings, rolePerms: rp || DEF_ROLE_PERMS, cfgv: cfgv || '0' };
}
const bumpCfg = (s: any) => s.set('meta/cfgv', String(now()) + rid());

// ---------- document numbers ----------
async function nextNo(s: any, p: 'EST' | 'YOR') {
  const yr = new Date(now() + 5.5 * 36e5).getUTCFullYear();   // India year
  const k = `${p}-${yr}`;
  let n = +((await s.get(`seqhint/${k}`)) || 0);
  for (let i = 0; i < 500; i++) {
    n++;
    const r = await s.setJSON(`seq/${k}/${n}`, { at: now() }, { onlyIfNew: true });
    if (r?.modified !== false) { await s.set(`seqhint/${k}`, String(n)); return `${k}-${String(n).padStart(4, '0')}`; }
  }
  throw new HttpError('Could not allocate a document number', 500);
}

// ---------- working days (India time) ----------
function istDate(t: number) { return new Date(t + 5.5 * 36e5).toISOString().slice(0, 10); }
function addWorkDays(fromYmd: string, n: number, st: any) {
  const off: number[] = Array.isArray(st.weeklyOff) ? st.weeklyOff : [0];
  const hol = new Set<string>(Array.isArray(st.holidays) ? st.holidays : []);
  if (off.length >= 7) return fromYmd;
  const d = new Date(fromYmd + 'T00:00:00Z');
  let left = Math.max(0, Math.round(n));
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const y = d.toISOString().slice(0, 10);
    if (!off.includes(d.getUTCDay()) && !hol.has(y)) left--;
  }
  return d.toISOString().slice(0, 10);
}

// ---------- gold rates from the Grand Jewellers kiosk ----------
// Same feed the Grand / Yamie Price Check uses (/api/rates there). Fields: r22 r18 r14 r9 platinum silver updated_at.
const KIOSK_MAP: Record<string, string> = { r22: 'k22', r18: 'k18', r14: 'k14', r9: 'k9', platinum: 'pt', silver: 'ag' };
async function readKiosk(url: string) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' }, signal: ctl.signal });
    if (!r.ok) throw new HttpError(`Kiosk answered ${r.status}`, 502);
    const j: any = await r.json();
    const rates: any = {};
    for (const [k, v] of Object.entries(KIOSK_MAP)) { const n = Number(j[k]); if (Number.isFinite(n) && n > 0) rates[v] = n; }
    if (!Object.keys(rates).length) throw new HttpError('The kiosk has no rates right now', 502);
    return { rates, updated: typeof j.updated_at === 'string' ? j.updated_at : '' };
  } catch (e: any) { throw e instanceof HttpError ? e : new HttpError('Kiosk rates are unavailable right now', 502); }
  finally { clearTimeout(t); }
}
/** Apply kiosk rates. Automatic runs skip a day on which someone typed rates by hand. Returns true if rates changed. */
async function applyKiosk(s: any, who: string, auto: boolean) {
  const st = await getSettings(s);
  if (auto) {
    if (!st.kioskAuto) return false;
    if (st.rates.src === 'manual' && istDate(num(st.rates.at)) === istDate(now())) return false;
    const last = +((await s.get('meta/kioskCheck')) || 0);
    if (now() - last < 10 * 60000) return false;
    await s.set('meta/kioskCheck', String(now()));
  }
  const k = await readKiosk(st.kioskUrl || DEF_SETTINGS.kioskUrl);
  const merged = { ...st.rates, ...k.rates };
  const same = ['k22', 'k18', 'k14', 'k9', 'pt', 'ag'].every((x) => num(merged[x]) === num(st.rates[x]));
  if (same && st.rates.src === 'kiosk') { if (!auto) { st.rates.checkedAt = now(); } return false; }
  st.rates = { ...merged, at: now(), by: who, src: 'kiosk', kioskAt: k.updated };
  await s.setJSON('cfg/settings', st);
  await bumpCfg(s);
  return true;
}

// ---------- order rules ----------
// status → status : permission needed. Anything else is an admin override.
const FLOW: Record<string, Record<string, string>> = {
  enquiry: { estimate: 'estimate', hold: 'enquiry', lost: 'enquiry' },
  estimate: { estimate: 'estimate', enquiry: 'enquiry', approved: 'approve', hold: 'enquiry', lost: 'enquiry' },
  approved: { confirmed: 'confirm', enquiry: 'enquiry', hold: 'enquiry', lost: 'enquiry' },
  confirmed: { vendor: 'vendor', hold: 'cancel', lost: 'cancel' },
  vendor: { vendor: 'vendor', production: 'production', hold: 'cancel', lost: 'cancel' },
  production: { received: 'receive', hold: 'cancel', lost: 'cancel' },
  received: { qc_ok: 'qc', qc_fail: 'qc' },
  qc_fail: { rework: 'production' },
  rework: { received: 'receive' },
  qc_ok: { final: 'finalprice' },
  final: { final: 'finalprice', final_ok: 'approvefinal' },
  final_ok: { ready: 'ready', final: 'finalprice' },
  ready: { closed: 'close' },
};
const num = (v: any) => (Number.isFinite(+v) ? +v : 0);
const lastOf = (a: any) => (Array.isArray(a) && a.length ? a[a.length - 1] : null);
const verifiedNet = (o: any, kind?: string) => (o.pays || []).filter((p: any) => p.ok && (!kind || p.kind === kind))
  .reduce((t: number, p: any) => t + (p.kind === 'refund' ? -num(p.amt) : num(p.amt)), 0);
const minAdvance = (est: any, st: any) => Math.ceil(num(est?.total) * num(st.minAdv) / 100);

function checkOrder(o: any, old: any, me: any, can: (p: string) => boolean, st: any, notes: string[]) {
  const need = (p: string, what: string) => { if (!can(p)) throw new HttpError(`Your role cannot ${what}`, 403); };
  const from = old?.status || 'new', to = o.status;
  const est = lastOf(o.ests);

  // --- status change permission ---
  if (old && from !== to) {
    let perm = FLOW[from]?.[to];
    if (from === 'hold' && to === old.outcome?.prev) perm = old.ono ? 'cancel' : 'enquiry';
    if (!perm) {
      if (me.role !== 'admin') throw new HttpError(`Cannot move from "${from}" to "${to}"`, 403);
      notes.push(`Admin override: ${from} → ${to}`);
    } else need(perm, `move this order to "${to}"`);
  }

  // --- payments: new ones need "advance"; verifying needs "verify"; edits/removals are admin only ---
  const oldPays = new Map<string, any>((old?.pays || []).map((p: any) => [p.id, p]));
  for (const p of o.pays || []) {
    const was = oldPays.get(p.id);
    if (!was) {
      need('advance', 'record payments');
      if (!(num(p.amt) > 0)) throw new HttpError('Payment amount must be more than zero', 400);
      if (p.ref && (o.pays || []).some((q: any) => q !== p && q.kind === p.kind && q.ref && String(q.ref).toLowerCase() === String(p.ref).toLowerCase())) throw new HttpError(`A payment with reference "${p.ref}" is already recorded`, 400);
      p.by = me.name; p.at = now();
      if (p.ok) { if (can('verify')) p.ok = { by: me.name, at: now() }; else p.ok = null; }
      continue;
    }
    if (!was.ok && p.ok) { need('verify', 'verify payments'); p.ok = { by: me.name, at: now() }; }
    else if (was.ok && p.ok) p.ok = was.ok;
    const key = (x: any) => JSON.stringify([x.kind, num(x.amt), x.mode || '', x.ref || '', x.by || '', x.at || 0]);
    if (key(was) !== key(p) || (was.ok && !p.ok)) { if (me.role !== 'admin') throw new HttpError('Only an admin can change a recorded payment', 403); notes.push('Admin edited a payment'); }
    oldPays.delete(p.id);
  }
  if (oldPays.size && me.role !== 'admin') throw new HttpError('Only an admin can remove a payment', 403);

  // --- customer OK on the final price: stamped by the server ---
  const lf = lastOf(o.finals), lfOld = lastOf(old?.finals);
  if (lf && lf.cust && !(lfOld && lfOld.v === lf.v && lfOld.cust)) {
    need('finalprice', 'record the customer\'s OK');
    lf.cust = { ev: String(lf.cust.ev || '').slice(0, 300), at: now(), by: me.name };
  }

  // --- restricted vendor cost ---
  if (o.vendor && !can('viewcost')) o.vendor.cost = old?.vendor?.cost ?? null;

  // --- discount approval ---
  if (num(o.disc) !== num(old?.disc)) o.discOk = null;
  if (o.discOk && !old?.discOk) { need('discount', 'approve discounts'); o.discOk = { by: me.name, at: now() }; }

  // --- ETD moved: keep the customer promise realistic ---
  if (o.vendor?.etd && old?.vendor?.etd && o.vendor.etd !== old.vendor.etd && o.promise) {
    const needBy = addWorkDays(o.vendor.etd, num(st.qcBuffer), st);
    if (needBy > o.promise) { notes.push(`ETD ${old.vendor.etd} → ${o.vendor.etd}: promised delivery moved ${o.promise} → ${needBy} (by ${me.name}) — update the customer`); o.promise = needBy; }
  }

  // re-entering the same status counts for a new estimate version / final price version / vendor change
  const again = old && from === to && (
    (to === 'estimate' && est?.v !== lastOf(old.ests)?.v) ||
    (to === 'final' && (o.finals || []).length !== (old.finals || []).length) ||
    (to === 'vendor' && JSON.stringify(o.vendor || {}) !== JSON.stringify(old.vendor || {})));
  if (old && from === to && !again) return;   // no status change: nothing more to check

  // --- rules for the status being entered ---
  if (to === 'estimate') {
    if (!(o.items || []).length) throw new HttpError('Add at least one item', 400);
    (o.items || []).forEach((it: any, i: number) => {
      if (!String(it.product || '').trim()) throw new HttpError(`Item ${i + 1}: product is required`, 400);
      if (!(num(it.wt) > 0)) throw new HttpError(`Item ${i + 1}: approximate weight is required`, 400);
    });
    if (!est || !(num(est.total) > 0)) throw new HttpError('Estimate total missing', 400);
    const sub = num(est.sub);
    if (num(o.disc) > 0 && !o.discOk && !can('discount') && sub > 0 && (num(o.disc) * 100) / sub > num(st.discLimit)) throw new HttpError('This discount needs manager approval', 403);
    est.at = now(); est.by = me.name; est.valid = istDate(now() + num(st.estValid) * 864e5);
  }
  if (to === 'approved') {
    if (!o.approval || o.approval.v !== est?.v || !String(o.approval.ev || '').trim()) throw new HttpError('Record the customer approval for the latest estimate', 400);
    if (est?.valid && istDate(now()) > est.valid) throw new HttpError(`Estimate expired on ${est.valid}. Issue it again at today's rates.`, 400);
    o.approval.at = now(); o.approval.by = me.name;
  }
  if (to === 'confirmed') {
    if (!o.approval || o.approval.v !== est?.v) throw new HttpError('Customer approval is missing for the latest estimate', 400);
    const adv = verifiedNet(o, 'advance'), min = minAdvance(est, st);
    if (adv < min) throw new HttpError(`Verified advance ₹${adv.toLocaleString('en-IN')} is below the minimum ₹${min.toLocaleString('en-IN')} (${st.minAdv}%)`, 400);
    if (o.lock === 'full') {
      const need2 = Math.ceil(num(est.metal));
      if (adv < need2) throw new HttpError(`Rate lock needs a verified advance of ₹${need2.toLocaleString('en-IN')} (metal value)`, 400);
    } else o.lock = 'none';
    o.lockRates = est.rates;
    o.confirmedAt = now(); o.confirmedBy = me.name;
    o.promise = addWorkDays(istDate(now()), num(st.leadDays) || 20, st);
  }
  if (to === 'vendor') {
    if (!o.vendor?.name || !o.vendor?.etd) throw new HttpError('Choose the vendor and ETD', 400);
    const needBy = addWorkDays(o.vendor.etd, num(st.qcBuffer), st);
    if (o.promise && needBy > o.promise) { notes.push(`Promised delivery moved ${o.promise} → ${needBy} (ETD ${o.vendor.etd}, approved by ${me.name})`); o.promise = needBy; }
  }
  if (to === 'received') {
    const r = lastOf(o.recv);
    if (!r || (o.items || []).some((it: any) => !(num(r.wts?.[it.id]) > 0))) throw new HttpError('Enter the actual net weight of every item', 400);
    r.at = now(); r.by = me.name;
  }
  if (to === 'qc_ok' || to === 'qc_fail') {
    const q = lastOf(o.qc);
    if (!q) throw new HttpError('QC record missing', 400);
    if (to === 'qc_ok' && (!q.ok || Object.values(q.checks || {}).some((v) => !v) || !Object.keys(q.checks || {}).length)) throw new HttpError('Every QC check must pass before approval', 400);
    if (to === 'qc_fail' && !String(q.note || '').trim()) throw new HttpError('Give the QC rejection reason', 400);
    q.at = now(); q.by = me.name;
  }
  if (to === 'final') {
    const f = lastOf(o.finals);
    if (!f || !(num(f.total) > 0)) throw new HttpError('Final price missing', 400);
    f.at = now(); f.by = me.name; f.ok = null;
  }
  if (to === 'final_ok') {
    const f = lastOf(o.finals);
    if (!f) throw new HttpError('Final price missing', 400);
    if (!f.cust) throw new HttpError('Record the customer\'s OK on the final price first', 400);
    f.ok = { by: me.name, at: now() };
  }
  if (to === 'ready') {
    if (!lastOf(o.qc)?.ok) throw new HttpError('QC approval is required before the order is ready', 400);
    if (!lastOf(o.finals)?.ok) throw new HttpError('Final price is not approved', 400);
    o.readyAt = now();
  }
  if (to === 'closed') {
    const gaps: string[] = [];
    if (!o.inv?.no) gaps.push('ERP invoice not linked');
    const bal = num(o.inv?.amt) - verifiedNet(o);
    if (bal > 1) gaps.push(`balance ₹${Math.round(bal).toLocaleString('en-IN')} not received/verified`);
    if ((o.pays || []).some((p: any) => !p.ok)) gaps.push('unverified payments');
    if (!String(o.handover?.to || '').trim()) gaps.push('handover recipient missing');
    if (gaps.length) {
      const ex = String(o.handover?.exception || '').trim();
      if (!ex || !(me.role === 'admin' || can('cancel'))) throw new HttpError('Cannot close: ' + gaps.join('; '), 400);
      notes.push(`Closed by exception (${me.name}): ${ex} — ${gaps.join('; ')}`);
    }
    o.handover = { ...(o.handover || {}), at: now(), by: me.name };
  }
  if (to === 'hold' || to === 'lost') {
    if (!String(o.outcome?.reason || '').trim()) throw new HttpError('A reason is required', 400);
    o.outcome.prev = from; o.outcome.at = now(); o.outcome.by = me.name;
  }
}

async function allocNumbers(s: any, o: any, old: any) {
  const est = lastOf(o.ests);
  if (o.status === 'estimate' && est && (!old || old.status !== 'estimate' || est.v !== lastOf(old.ests)?.v)) {
    if (!o.estNo) o.estNo = await nextNo(s, 'EST');
    est.no = o.estNo;
  }
  if (o.status === 'confirmed' && !o.ono) o.ono = await nextNo(s, 'YOR');
}

// ---------- orders ----------
async function logChange(s: any, id: string, del = false) {
  const t = now();
  await s.setJSON(`chg/${day(t)}/${String(t).padStart(13, '0')}-${rid()}`, { id, del, t });
}
async function allOrders(s: any) {
  const { blobs } = await s.list({ prefix: 'orders/' });
  const out = await Promise.all(blobs.map((b: any) => s.get(b.key, { type: 'json' })));
  return out.filter(Boolean);
}
async function changesSince(s: any, since: number) {
  const ids = new Map<string, boolean>();
  const from = since - 10000;
  for (let t = Date.parse(day(from)); t <= now(); t += 864e5) {
    const { blobs } = await s.list({ prefix: `chg/${day(t)}/` });
    for (const b of blobs) {
      const ts = +b.key.split('/')[2].split('-')[0];
      if (ts >= from) ids.set(b.key, true);
    }
  }
  const recs = await Promise.all([...ids.keys()].map((k) => s.get(k, { type: 'json' })));
  const touched = [...new Set(recs.filter(Boolean).map((r: any) => r.id))];
  const orders: any[] = []; const deleted: string[] = [];
  await Promise.all(touched.map(async (id) => { const j = await s.get(`orders/${id}`, { type: 'json' }); if (j) orders.push(j); else deleted.push(id); }));
  return { orders, deleted };
}
function cleanOrder(o: any) {
  for (const it of o.items || []) for (const p of it.photos || []) if (typeof p === 'string' && p.startsWith('data:')) throw new HttpError('A photo was not uploaded', 400);
  if (!Array.isArray(o.log)) o.log = [];
  if (o.log.length > 400) o.log = o.log.slice(-400);
  return o;
}
const stripVendorPhones = (cfg: any) => ({ ...cfg, vendors: (cfg.vendors || []).map((v: any) => ({ ...v, phone: '' })) });
const hideCost = (o: any) => (o?.vendor && 'cost' in o.vendor ? { ...o, vendor: { ...o.vendor, cost: null } } : o);

// ---------- link to Yamie Price Check (design numbers & photos) ----------
// Reads the Price Check shared database with its shop key (env PC_SHOP_KEY; site PC_URL).
const PC_FIELDS = ['key', 'barcode', 'label', 'item', 'category', 'carat', 'gw', 'nw', 'sw', 'dw', 'dq', 'sa', 'pname', 'design', 'model', 'size', 'mcol', 'scol', 'stype', 'stoneName', 'supplier'];
const normK = (v: any) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
async function pcGet(op: string, extra = '') {
  const key = Netlify.env.get('PC_SHOP_KEY');
  if (!key) throw new HttpError('Link to Price Check is not set up: add PC_SHOP_KEY (the Yamie Price Check shop key) in Netlify', 503);
  const base = (Netlify.env.get('PC_URL') || 'https://yamie-price-check.netlify.app').replace(/\/$/, '');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(`${base}/api/sync?op=${op}${extra}`, { headers: { 'x-shop-key': key }, signal: ctl.signal });
    if (r.status === 401) throw new HttpError('Price Check refused the shop key (check PC_SHOP_KEY)', 502);
    if (!r.ok) throw new HttpError(`Price Check answered ${r.status}`, 502);
    return await r.json();
  } catch (e: any) { throw e instanceof HttpError ? e : new HttpError('Price Check is not reachable right now', 502); }
  finally { clearTimeout(t); }
}
async function pcLoad(s: any) {
  let c: any = await s.get('pc/cache', { type: 'json' });
  if (c && now() - c.chk < 10 * 60000) return c;
  const meta: any = await pcGet('meta');
  const v = { stock: meta.stock || 0, imgs: meta.imgs || 0, pattrs: meta.pattrs || 0, pnames: meta.pnames || 0 };
  c = c || { v: {}, rows: [], idx: {}, n: {}, attrs: {}, names: {} };
  if (c.v.stock !== v.stock || !c.rows.length) {
    const d: any = await pcGet('stock');
    c.rows = (d.rows || []).map((r: any) => { const o: any = {}; for (const f of PC_FIELDS) if (r[f] != null && r[f] !== '') o[f] = r[f]; return o; });
  }
  if (c.v.imgs !== v.imgs) { const d: any = await pcGet('imgidx'); c.idx = d.idx || {}; c.n = d.n || {}; }
  if (c.v.pattrs !== v.pattrs) { const d: any = await pcGet('pattrs'); c.attrs = d.map || {}; }
  if (c.v.pnames !== v.pnames) { const d: any = await pcGet('pnames'); c.names = d.map || {}; }
  c.v = v; c.chk = now(); c.at = now();
  await s.setJSON('pc/cache', c);
  return c;
}
const pcImgCount = (c: any, k: string) => (c.idx && c.idx[k] ? Math.max(1, num(c.n && c.n[k]) || 1) : 0);
async function pcFind(s: any, q: string) {
  const c = await pcLoad(s), nq = normK(q);
  if (nq.length < 2) return { at: c.at, rows: [] };
  const score = (r: any) => {
    const ks = [r.key, r.barcode, r.label, r.design, r.model].map(normK);
    if (ks.includes(nq)) return 3;
    if (ks.some((k) => k.startsWith(nq))) return 2;
    if (ks.some((k) => k.includes(nq))) return 1;
    return 0;
  };
  const hits = c.rows.map((r: any) => [score(r), r]).filter((x: any) => x[0] > 0).sort((a: any, b: any) => b[0] - a[0]).slice(0, 10).map((x: any) => x[1]);
  const rows = hits.map((r: any) => {
    const k = normK(r.key);
    return { ...r, label: r.label || r.barcode || r.key, name: c.names[k] || r.pname || '', attrs: { ...(c.attrs[k] || {}), size: r.size, mc: r.mcol }, imgs: pcImgCount(c, k) };
  });
  await Promise.all(rows.slice(0, 4).filter((r: any) => r.imgs).map(async (r: any) => { try { r.thumb = (await pcGet('img', `&k=${encodeURIComponent(normK(r.key))}&i=1`)).img || ''; } catch (e) { /* no thumb */ } }));
  return { at: c.at, rows };
}
async function pcPhotos(s: any, q: string) {
  const c = await pcLoad(s), nq = normK(q);
  const row = c.rows.find((r: any) => [r.key, r.barcode, r.label, r.design].map(normK).includes(nq));
  const k = row ? normK(row.key) : nq;
  const done: any = await s.get(`pc/imgmap/${k}`, { type: 'json' });
  const count = pcImgCount(c, k);
  if (done && done.keys && done.keys.length >= count && done.v === c.v.imgs) return { keys: done.keys };
  const keys: string[] = [];
  for (let i = 1; i <= Math.min(6, count); i++) {
    const d: any = await pcGet('img', `&k=${encodeURIComponent(k)}&i=${i}`);
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(d.img || '');
    if (!m) continue;
    const id = crypto.randomUUID();
    await s.set(`img/${id}`, Buffer.from(m[2], 'base64'), { metadata: { type: m[1], from: 'pricecheck:' + k, at: now() } });
    keys.push(id);
  }
  await s.setJSON(`pc/imgmap/${k}`, { keys, v: c.v.imgs });
  return { keys };
}

// ---------- handler ----------
export default async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const s = store();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const method = req.method;
  let body: any = {};
  if (method === 'POST') body = await req.json().catch(() => ({}));

  try {
    if (path === 'ping') return J({ ok: true, now: now() });
    if (path === 'login-list') {
      const users = await getUsers(s);
      const st = await getSettings(s);
      const setup = users.length === 1 && users[0].id === 'admin' && users[0].mustChange;
      return J({ users: users.filter((u) => u.active !== false).map((u) => ({ id: u.id, name: u.name, role: u.role })), shop: st.shop, setup });
    }
    if (path === 'login' && method === 'POST') {
      const users = await getUsers(s);
      const u = users.find((x) => x.id === body.userId && x.active !== false);
      if (!u) return err('Unknown user', 401);
      const lk: any = (await s.get(`lock/${u.id}`, { type: 'json' })) || { n: 0, until: 0 };
      if (lk.until > now()) return err(`Too many wrong PINs. Try again in ${Math.ceil((lk.until - now()) / 60000)} min.`, 429);
      if (hashPin(body.pin, u.salt) !== u.pinHash) {
        lk.n++; if (lk.n >= 5) { lk.until = now() + 5 * 60000; lk.n = 0; }
        await s.setJSON(`lock/${u.id}`, lk);
        return err('Wrong PIN', 401);
      }
      await s.delete(`lock/${u.id}`);
      return J({ token: await sign(s, { uid: u.id, exp: now() + 30 * 864e5 }), user: pubUser(u) });
    }

    // ----- logged in -----
    const tok = (req.headers.get('authorization') || '').replace(/^Bearer /, '') || url.searchParams.get('t');
    const p = await verify(s, tok);
    if (!p) return err('Please log in again', 401);
    const users = await getUsers(s);
    const me = users.find((u) => u.id === p.uid && u.active !== false);
    if (!me) return err('Your login was disabled', 401);
    const rolePerms = (await s.get('cfg/roleperms', { type: 'json' })) || DEF_ROLE_PERMS;
    const can = (perm: string) => me.role === 'admin' || (rolePerms[me.role] || []).includes(perm);
    const need = (perm: string) => { if (!can(perm)) throw new HttpError('Your role does not have permission for this', 403); };
    const admin = () => { if (me.role !== 'admin') throw new HttpError('Admin only', 403); };
    const out = (o: any) => (can('viewcost') ? o : hideCost(o));
    const cfgOut = async () => { const c = await getCfg(s); return can('vendorcontact') ? c : stripVendorPhones(c); };

    if (path.startsWith('img/') && method === 'GET') {
      const key = path.slice(4).replace(/[^a-z0-9-]/gi, '');
      const e = await s.getWithMetadata(`img/${key}`, { type: 'arrayBuffer' });
      if (e === null) return new Response('Not found', { status: 404, headers: CORS });
      return new Response(e.data as ArrayBuffer, { headers: { 'content-type': (e.metadata as any)?.type || 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable', ...CORS } });
    }
    if (path === 'img' && method === 'POST') {
      const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(body.data || '');
      if (!m) return err('Not an image');
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 3 * 1024 * 1024) return err('Photo too large');
      const key = crypto.randomUUID();
      await s.set(`img/${key}`, buf, { metadata: { type: m[1], by: me.id, at: now() } });
      return J({ key });
    }

    if (path === 'state' || path === 'changes') { try { await applyKiosk(s, 'Kiosk (auto)', true); } catch (e) { /* keep last rates */ } }
    if (path === 'state') {
      const [orders, cfg, resetAt] = await Promise.all([allOrders(s), cfgOut(), s.get('meta/resetAt')]);
      return J({ now: now(), orders: orders.map(out), ...cfg, resetAt: resetAt || '', me: pubUser(me) });
    }
    if (path === 'changes') {
      const since = +(url.searchParams.get('since') || 0);
      const t = now();
      const ch = await changesSince(s, since);
      const cfgv = (await s.get('meta/cfgv')) || '0';
      const res: any = { now: t, orders: ch.orders.map(out), deleted: ch.deleted, cfgv, resetAt: (await s.get('meta/resetAt')) || '', me: pubUser(me) };
      if (cfgv !== url.searchParams.get('cfgv')) Object.assign(res, await cfgOut());
      return J(res);
    }

    if (path === 'order' && method === 'POST') {
      const o = cleanOrder({ ...(body.order || {}) });
      const st = await getSettings(s);
      const notes: string[] = [];
      if (body.create) {
        need('enquiry');
        o.id = 'Q' + now().toString(36).toUpperCase() + rid().slice(0, 3).toUpperCase();
        o.status = 'enquiry'; o.createdAt = now(); o.createdBy = me.name;
        delete o.ono; delete o.estNo; o.pays = []; o.ests = [];
        o.rev = 1; o.updatedAt = now(); o.updatedBy = me.name;
        await s.setJSON(`orders/${o.id}`, o, { onlyIfNew: true });
        await logChange(s, o.id);
        return J({ order: out(o) });
      }
      if (!o.id) return err('Missing order id');
      const cur = await s.getWithMetadata(`orders/${o.id}`, { type: 'json' });
      if (cur === null) return err('This order was deleted on another device', 404, { deleted: true });
      const old: any = cur.data;
      if ((old.rev || 0) !== (body.baseRev || 0)) return err('This order was changed on another device', 409, { order: out(old) });
      // fields only the server sets
      for (const k of ['ono', 'estNo', 'createdAt', 'createdBy', 'confirmedAt', 'confirmedBy', 'lockRates', 'promise', 'readyAt']) o[k] = old[k];
      if (old.ono) o.lock = old.lock;   // the rate policy is fixed at confirmation
      checkOrder(o, old, me, can, st, notes);
      await allocNumbers(s, o, old);
      notes.forEach((n) => o.log.push({ t: now(), by: 'Server', a: n }));
      o.rev = (old.rev || 0) + 1; o.updatedAt = now(); o.updatedBy = me.name;
      const r = await s.setJSON(`orders/${o.id}`, o, { onlyIfMatch: cur.etag });
      if (r?.modified === false) return err('This order was changed on another device', 409, { order: out(await s.get(`orders/${o.id}`, { type: 'json' })) });
      await logChange(s, o.id);
      return J({ order: out(o) });
    }
    if (path === 'order-delete' && method === 'POST') {
      const cur = await s.get(`orders/${body.id}`, { type: 'json' });
      if (cur?.ono) admin(); else need('delete');
      await s.delete(`orders/${body.id}`);
      await logChange(s, body.id, true);
      return J({ ok: true });
    }

    if (path === 'vendors' && method === 'POST') {
      need('vendors');
      const oldV: any[] = (await s.get('cfg/vendors', { type: 'json' })) || [];
      if (!can('vendorcontact')) for (const x of body.vendors || []) x.phone = (oldV.find((v) => v.name === x.name) || {}).phone || '';
      await s.setJSON('cfg/vendors', (body.vendors || []).slice(0, 200).map((x: any) => ({
        name: String(x.name || '').trim().slice(0, 80), phone: String(x.phone || '').trim().slice(0, 20), spec: String(x.spec || '').trim().slice(0, 80),
        lead: Math.max(1, Math.min(120, Math.round(num(x.lead) || 15))), active: x.active !== false,
      })).filter((x: any) => x.name));
      await bumpCfg(s);
      return J(await cfgOut());
    }
    if (path === 'rates' && method === 'POST') {
      need('rates');
      const st = await getSettings(s);
      const r: any = {};
      for (const k of ['k22', 'k18', 'k14', 'k9', 'pt', 'ag']) r[k] = Math.max(0, num(body.rates?.[k]));
      st.rates = { ...r, at: now(), by: me.name, src: 'manual', kioskAt: '' };
      await s.setJSON('cfg/settings', st);
      await bumpCfg(s);
      return J(await cfgOut());
    }
    if (path === 'rates-kiosk' && method === 'POST') {
      need('rates');
      const changed = await applyKiosk(s, me.name + ' (kiosk)', false);
      return J({ ...(await cfgOut()), changed });
    }
    if (path === 'mkrules' && method === 'POST') {
      if (!can('rates') && !can('settings')) return err('Not allowed', 403);
      const st = await getSettings(s);
      const MODES = ['pct', 'pg', 'combo', 'flat'];
      st.mkRules = (Array.isArray(body.rules) ? body.rules : []).slice(0, 200).map((r: any) => ({
        vendor: String(r.vendor || '').slice(0, 80), cat: String(r.cat || '').slice(0, 60), purity: String(r.purity || '').slice(0, 10),
        min: num(r.min) > 0 ? num(r.min) : '', max: num(r.max) > 0 ? num(r.max) : '', mode: MODES.includes(r.mode) ? r.mode : 'pct',
        mk: Math.max(0, num(r.mk)), mkPg: Math.max(0, num(r.mkPg)), note: String(r.note || '').slice(0, 120),
      }));
      await s.setJSON('cfg/settings', st);
      await bumpCfg(s);
      return J(await cfgOut());
    }
    if (path === 'pc/find') { need('enquiry'); return J(await pcFind(s, url.searchParams.get('q') || '')); }
    if (path === 'pc/photos' && method === 'POST') { need('enquiry'); return J(await pcPhotos(s, String(body.k || ''))); }
    if (path === 'settings' && method === 'POST') {
      need('settings');
      const cur = await getSettings(s);
      const st = { ...DEF_SETTINGS, ...(body.settings || {}), rates: cur.rates };
      if (st.lists && typeof st.lists === 'object') {
        const L: any = {};
        for (const [k, v] of Object.entries(st.lists).slice(0, 60)) if (Array.isArray(v)) L[String(k).slice(0, 60)] = (v as any[]).slice(0, 120).map((e: any) => {
          const o: any = { name: String(e.name || '').trim().slice(0, 60) };
          if (e.img) o.img = String(e.img).slice(0, 200); if (e.color) o.color = String(e.color).slice(0, 9); return o;
        }).filter((e: any) => e.name);
        st.lists = L;
      } else st.lists = cur.lists || null;
      if (!Array.isArray(st.mkRules)) st.mkRules = cur.mkRules || [];
      st.weeklyOff = (Array.isArray(st.weeklyOff) ? st.weeklyOff : [0]).map((x: any) => Math.round(num(x))).filter((x: number) => x >= 0 && x <= 6).slice(0, 6);
      st.holidays = (Array.isArray(st.holidays) ? st.holidays : []).filter((x: any) => /^\d{4}-\d\d-\d\d$/.test(x)).slice(0, 200);
      await s.setJSON('cfg/settings', st);
      await bumpCfg(s);
      return J(await cfgOut());
    }
    if (path === 'roleperms' && method === 'POST') {
      admin();
      const rp: any = {};
      for (const r of ['manager', 'staff']) rp[r] = (body.rolePerms?.[r] || []).filter((x: string) => PERM_KEYS.includes(x));
      await s.setJSON('cfg/roleperms', rp);
      await bumpCfg(s);
      return J(await cfgOut());
    }
    if (path === 'user' && method === 'POST') {
      admin();
      const data = await s.get('cfg/users', { type: 'json' });
      const list: any[] = data.users;
      const b = body.user || {};
      if (b.pin != null && b.pin !== '' && !/^\d{4}$/.test(String(b.pin))) return err('PIN must be 4 digits');
      let u = list.find((x) => x.id === b.id);
      if (!u) {
        if (!b.name || !/^\d{4}$/.test(String(b.pin || ''))) return err('Name and 4-digit PIN needed');
        if (list.some((x) => x.name.toLowerCase() === String(b.name).trim().toLowerCase())) return err('Name already exists');
        u = { id: 'u' + now().toString(36) + rid().slice(0, 3), created: now() };
        list.push(u);
      }
      if (b.name) u.name = String(b.name).trim();
      if (b.phone != null) u.phone = String(b.phone).trim();
      if (b.role && ['admin', 'manager', 'staff'].includes(b.role) && u.id !== me.id) u.role = b.role;
      if (!u.role) u.role = 'staff';
      if (b.active != null && u.id !== me.id) u.active = !!b.active;
      if (b.pin) { u.salt = rid(); u.pinHash = hashPin(b.pin, u.salt); u.mustChange = false; }
      if (!list.some((x) => x.role === 'admin' && x.active !== false)) return err('Keep at least one active admin');
      await s.setJSON('cfg/users', { users: list });
      await bumpCfg(s);
      return J(await cfgOut());
    }
    if (path === 'mypin' && method === 'POST') {
      if (!/^\d{4}$/.test(String(body.pin || ''))) return err('PIN must be 4 digits');
      const data = await s.get('cfg/users', { type: 'json' });
      const u = data.users.find((x: any) => x.id === me.id);
      u.salt = rid(); u.pinHash = hashPin(body.pin, u.salt); u.mustChange = false;
      if (body.name) u.name = String(body.name).trim() || u.name;
      await s.setJSON('cfg/users', data);
      await bumpCfg(s);
      return J({ user: pubUser(u) });
    }
    if (path.startsWith('bk/') && method === 'POST') {
      admin();
      return J(await backupOp(s, path.slice(3), body, {
        skip: (k) => k.startsWith('chg/') || k.startsWith('lock/') || k === 'meta/secret' || k === 'pc/cache',
        done: async () => { await s.set('meta/resetAt', String(now())); await bumpCfg(s); },
      }));
    }
    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message || 'Server error', e.status || 500, e.extra || {});
  }
};
