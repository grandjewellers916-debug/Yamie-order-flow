import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import { buildSeed } from '../lib/seed.mjs';
import { runDocReminders } from '../lib/reminders.mjs';
import {
  DEFAULT_SETTINGS, ROLE_PERMS, PERMS, SECTIONS, TXN_TYPES, deriveLocMeta, JTYPES, normJts, applyJewelleryTypes, mainLocsOf, placeLoc29, defaultPlace, keyText, lineKey, itemOf, jtOfLine, purOfLine, summarize, closingVerified, computeExpected, erpCompare,
  latestCounts, locStatus, sumLines, istDate, r3, CASH_DENOMS, cashCalc, isMorning,
  teamsForLoc, CLAIM_MS,
} from '../../web/core.mjs';

export const config = { path: '/api/*' };

const store = () => getStore({ name: 'yamie-stock', consistency: 'strong' });
const J = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (msg: string, status = 400) => J({ error: msg }, status);
const rid = () => crypto.randomBytes(5).toString('hex');
const now = () => Date.now();

// ---------- auth ----------
async function secret(s: any) {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  let v = await s.get('meta/secret');
  if (!v) { v = crypto.randomBytes(32).toString('hex'); await s.set('meta/secret', v, { onlyIfNew: true }); v = await s.get('meta/secret'); }
  return v;
}
const hashPin = (pin: string, salt: string) => crypto.pbkdf2Sync(String(pin), salt, 20000, 32, 'sha256').toString('hex');
async function sign(s: any, payload: any) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', await secret(s)).update(body).digest('base64url');
  return body + '.' + sig;
}
async function verify(s: any, tok: string | null) {
  if (!tok) return null;
  const [body, sig] = tok.split('.');
  if (!body || !sig) return null;
  const good = crypto.createHmac('sha256', await secret(s)).update(body).digest('base64url');
  if (good.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (p.exp < now()) return null;
  return p;
}

// ---------- data ----------
// v1.18 cash: the opening for a morning count = the latest closed Evening chit of that counter before the date (carried forward)
async function cashOpening(s: any, date: string, counter: string) {
  const slug = counter.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const { blobs } = await s.list({ prefix: 'cash/' });
  const keys = blobs.map((b: any) => b.key).filter((k: string) => { const [, d, rest] = k.split('/'); return d < date && rest.startsWith(slug + '_') && !rest.endsWith('_morning'); }).sort().reverse();
  for (const k of keys.slice(0, 20)) { const r = await s.get(k, { type: 'json' }); if (r?.state === 'closed') return { id: r.id, date: r.date, gt: r.gt, denoms: r.denoms, coins: r.coins || 0, closedBy: r.verifiedByName, countedBy: r.countedByName }; }
  return null;
}
async function getUsers(s: any) {
  let u = await s.get('cfg/users', { type: 'json' });
  if (!u) {
    const salt = rid();
    u = { users: [{ id: 'admin', name: 'Admin', role: 'admin', perms: ROLE_PERMS.admin, salt, pinHash: hashPin(process.env.ADMIN_PIN || '1986', salt), active: true }] };
    await s.setJSON('cfg/users', u, { onlyIfNew: true });
    u = await s.get('cfg/users', { type: 'json' });
  }
  if (!u.grand37) {   // v1.37 admin keeps everything; Grand staff permission is given per user
    u.grand37 = true; await s.setJSON('cfg/users', u);
  }
  if (!u.special36) {   // v1.36 bullion / Grand-Yamie boxes: admin + managers
    for (const x of u.users) if (x.role === 'manager' || x.role === 'admin') x.perms = [...new Set([...(x.perms || []), 'special'])];
    u.special36 = true; await s.setJSON('cfg/users', u);
  }
  if (!u.docsShare35) {   // v1.35: sharing documents is its own permission — everyone who could see documents keeps sharing
    for (const x of u.users) if ((x.perms || []).includes('docs') || x.role === 'admin') x.perms = [...new Set([...(x.perms || []), 'docsShare'])];
    u.docsShare35 = true; await s.setJSON('cfg/users', u);
  }
  if (!u.share30) {   // v1.31: sharing / downloading reports is a permission — admin and managers keep it
    for (const x of u.users) if (x.role === 'manager' || x.role === 'admin') x.perms = [...new Set([...(x.perms || []), 'share'])];
    u.share30 = true; await s.setJSON('cfg/users', u);
  }
  if (!u.docs19) {   // v1.19: managers can view business documents
    for (const x of u.users) if (x.role === 'manager' || x.role === 'admin') x.perms = [...new Set([...(x.perms || []), 'docs'])];
    u.docs19 = true; await s.setJSON('cfg/users', u);
  }
  if (!u.cash17) {   // v1.17: cash closing permissions for existing users
    for (const x of u.users) { const add = x.role === 'manager' ? ['cash', 'cashVerify'] : x.role === 'staff' ? ['cash'] : x.role === 'admin' ? ['cash', 'cashVerify'] : []; x.perms = [...new Set([...(x.perms || []), ...add])]; }
    u.cash17 = true; await s.setJSON('cfg/users', u);
  }
  return u.users as any[];
}
const pubUser = (u: any) => ({ id: u.id, name: u.name, role: u.role, perms: u.perms, active: u.active !== false, phone: u.phone || '' });
async function getSettings(s: any) {
  const st: any = { ...DEFAULT_SETTINGS, ...((await s.get('cfg/settings', { type: 'json' })) || {}) };
  applyJewelleryTypes(st); st.jtypes = [...JTYPES];   // v1.28 admin-managed jewellery types
  st.mainLocs = mainLocsOf(st); st.areas = st.mainLocs.map((m: any) => m.name);   // v1.29 main → sub locations
  st.subDisplays = [...new Set(st.mainLocs.flatMap((m: any) => (m.subs || []).map((x: any) => x.name)))];
  if (Array.isArray(st.purities) && !st.purities.includes('925')) st.purities = [...st.purities.filter((p: string) => !['Silver', 'Mixed'].includes(p)), '925', ...st.purities.filter((p: string) => ['Silver', 'Mixed'].includes(p))];   // v1.13 silver
  return st;
}
async function getLocs(s: any) {
  let l = await s.get('cfg/locs', { type: 'json' });
  if (!l) {
    const seed = buildSeed();
    const today = istDate();
    await s.setJSON(`day/${today}`, { date: today, opening: seed.opening, status: 'open', createdAt: now(), seeded: true }, { onlyIfNew: true });
    await s.setJSON('cfg/locs', { locs: seed.locs }, { onlyIfNew: true });
    l = await s.get('cfg/locs', { type: 'json' });
  }
  // v1.13: lab-grown (CVD) trays become the new jewellery type Tanih - CVD Jewellery — once
  if (!l.mig13) {
    for (const x of l.locs) if (x.cat === 'Lab-grown' && (x.jtype === 'Diamond Jewellery' || x.jtype === undefined)) x.jtype = 'Tanih - CVD Jewellery';
    l.mig13 = true; await s.setJSON('cfg/locs', l);
  }
  // v1.29: main locations Counter Display / Buffer Tray / Buffer Boxes / Grand Jewellers with sub locations — move older locations once
  if (!l.mig29) {
    const st = await getSettings(s);
    for (const x of l.locs) { const p = placeLoc29(x, st); if (p) { x.area = p.area; x.sub = p.sub; if (p.spot) x.spot = p.spot; } }
    l.mig29 = true; await s.setJSON('cfg/locs', l);
  }
  // v1.42: mixed boxes get their own sub location "Buffer Boxes › Mixed" so the item-count table shows them as a column
  if (!l.mig42) {
    const raw = (await s.get('cfg/settings', { type: 'json' })) || {}; const st = await getSettings(s); const ml = JSON.parse(JSON.stringify(st.mainLocs));
    const bb = ml.find((m: any) => m.name === 'Buffer Boxes'); let n = 0;
    if (bb) { bb.subs ||= []; if (!bb.subs.some((x: any) => x.name === 'Mixed')) { const gi = bb.subs.findIndex((x: any) => x.name === 'Gold boxes'); bb.subs.splice(gi + 1, 0, { name: 'Mixed' }); await s.setJSON('cfg/settings', { ...raw, mainLocs: ml }); }
      for (const x of l.locs) if (x.sec === 'box' && x.area === 'Buffer Boxes' && (String(x.boxNo || '').toUpperCase() === 'MIX' || /\bmix(ed)?\b/i.test(x.name || ''))) { x.sub = 'Mixed'; n++; } }
    l.mig42 = true; await s.setJSON('cfg/locs', l);
  }
  // v1.54: six main locations — Counter Display · Shelf Display · Floating Counters · Buffer Trays · Buffer Boxes · Grand Location;
  // classifications in the order Gold · Diamond Studded · Lab-grown Diamond · Platinum · Silver with their full names — once
  if (!l.mig54) {
    const raw: any = (await s.get('cfg/settings', { type: 'json' })) || {}; const st = await getSettings(s); const ml: any[] = JSON.parse(JSON.stringify(st.mainLocs));
    const at = (n: string) => ml.findIndex((m: any) => m.name === n);
    const mv = (fa: string, fs: string | null, ta: string, ts = '') => { for (const x of l.locs) if (x.area === fa && (fs === null || (x.sub || '') === fs)) { x.area = ta; x.sub = ts; } };
    const renKeep = (from: string, to: string) => { const i = at(from); if (i >= 0 && at(to) < 0) { ml[i].name = to; for (const x of l.locs) if (x.area === from) x.area = to; } };
    const cd = ml[at('Counter Display')];
    if (cd) {
      const sh = (cd.subs || []).find((x: any) => /^shel/i.test(x.name));
      if (at('Shelf Display') < 0) ml.splice(at('Counter Display') + 1, 0, { name: 'Shelf Display', kind: 'counter', subs: [] });
      if (sh) { mv('Counter Display', sh.name, 'Shelf Display'); cd.subs = cd.subs.filter((x: any) => x !== sh); }
      if (at('Floating Counters') < 0) ml.splice(at('Shelf Display') + 1, 0, { name: 'Floating Counters', kind: 'counter', subs: [] });
      for (const x of l.locs) if (x.sec === 'counter' && x.area === 'Counter Display' && /free.?standing|floating/i.test(`${x.spot || ''} ${x.group || ''} ${x.name || ''}`)) { x.area = 'Floating Counters'; x.sub = ''; }
      if ((cd.subs || []).length === 1 && /^counters?$/i.test(cd.subs[0].name)) { mv('Counter Display', cd.subs[0].name, 'Counter Display'); cd.subs = []; }
    }
    renKeep('Buffer Tray', 'Buffer Trays'); renKeep('Grand Jewellers', 'Grand Location');
    const ORDER = ['Counter Display', 'Shelf Display', 'Floating Counters', 'Buffer Trays', 'Buffer Boxes', 'Grand Location'];
    ml.sort((a: any, b: any) => { const ia = ORDER.indexOf(a.name), ib = ORDER.indexOf(b.name); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    const B = ['Plain Gold Jewellery', 'Diamond Jewellery', 'Tanih - CVD Jewellery', 'Platinum', 'Silver'];
    const jl = { ...(raw.jtLabels || {}) }, js = { ...(raw.jtShort || {}) }; for (const k of B) { delete jl[k]; delete js[k]; }
    const jo = [...B, ...((raw.jtOrder || []).filter((j: string) => !B.includes(j)))];
    await s.setJSON('cfg/settings', { ...raw, mainLocs: ml, jtLabels: jl, jtShort: js, jtOrder: jo });
    l.mig54 = true; await s.setJSON('cfg/locs', l);
  }
  // v1.8: Main location / Sub display / Jewellery type — fill in once for older locations
  if (l.locs.some((x: any) => x.jtype === undefined)) {
    for (const x of l.locs) if (x.jtype === undefined) Object.assign(x, deriveLocMeta(x));
    await s.setJSON('cfg/locs', l);
  }
  return l.locs as any[];
}
async function listJSON(s: any, prefix: string) {
  const { blobs } = await s.list({ prefix });
  const out = await Promise.all(blobs.map((b: any) => s.get(b.key, { type: 'json' })));
  return out.filter(Boolean);
}
async function dayKeys(s: any) {
  const { blobs } = await s.list({ prefix: 'day/' });
  return blobs.map((b: any) => b.key.slice(4)).sort();
}
async function loadDay(s: any, date: string, round?: string) {
  const [day, mvs, counts] = await Promise.all([
    s.get(`day/${date}`, { type: 'json' }), listJSON(s, `mv/${date}/`), listJSON(s, `ct/${date}/`),
  ]);
  mvs.sort((a: any, b: any) => a.at - b.at);
  // Two compulsory counts a day: 'morning' then 'evening'. Checks always use the current round.
  const r = round || day?.round || 'morning';
  return { day, mvs, counts: counts.filter((c: any) => (c.round || 'morning') === r), allCounts: counts, round: r };
}
function roundsDone(locs: any[], day: any, mvs: any[], morning: any[], evening: any[], settings: any) {
  const f = (cs: any[]) => { const sm = summarize(locs, day.opening, mvs, cs, settings); return { done: sm.total.locs - sm.total.pending - sm.total.stale, locs: sm.total.locs, var: sm.total.var }; };
  // morning: stale is fine (stock moved later in the day) — it was counted
  const m = summarize(locs, day.opening, mvs, morning, settings);
  return { morning: { done: m.total.locs - m.total.pending, locs: m.total.locs, var: m.total.var + m.total.stale }, evening: f(evening) };
}
function daySummaryLine(locs: any[], day: any, mvs: any[], counts: any[], settings: any) {
  const sm = summarize(locs, day.opening, mvs, counts, settings);
  return { opening: sm.total.opening, closing: sm.total.expected, in: sm.total.in, out: sm.total.out, checked: sm.total.locs - sm.total.pending, locs: sm.total.locs, variances: sm.total.var + sm.total.stale, sec: Object.fromEntries(Object.entries(sm.sec).map(([k, v]: any) => [k, { opening: v.opening, closing: v.expected, var: v.var + v.stale, checked: v.locs - v.pending, locs: v.locs, wt: v.wtExpected }])) };
}
async function closeDay(s: any, date: string, by: string, auto = false) {
  const locs = await getLocs(s); const settings = await getSettings(s);
  const { day, mvs, counts, allCounts } = await loadDay(s, date, 'evening');
  if (!day || day.status === 'closed') return day;
  const mc = allCounts.filter((c: any) => (c.round || 'morning') === 'morning');
  day.closing = closingVerified(locs, day.opening, mvs, counts, settings);
  day.summary = daySummaryLine(locs, day, mvs, counts, settings);
  day.summary.rounds = roundsDone(locs, day, mvs, mc, counts, settings);
  const erp = await s.get(`erp/${date}`, { type: 'json' });
  const ec = erpCmp(erp, locs, day, mvs, counts, settings);
  day.summary.erp = { entered: ec.entered, matched: ec.matched, app: ec.total.app, pcs: ec.total.pcs, lbl: ec.total.lbl, diff: ec.total.diff };
  day.status = 'closed'; day.closedAt = now(); day.closedBy = by; day.autoClosed = auto;
  await s.setJSON(`day/${date}`, day);
  return day;
}
async function ensureToday(s: any) {
  await getLocs(s);
  const today = istDate();
  const cur = await s.get(`day/${today}`, { type: 'json' });
  if (cur) return cur;
  const keys = (await dayKeys(s)).filter((k: string) => k < today);
  let opening = {};
  if (keys.length) {
    const prevDate = keys[keys.length - 1];
    let prev = await s.get(`day/${prevDate}`, { type: 'json' });
    if (prev.status !== 'closed') prev = await closeDay(s, prevDate, 'system', true);
    opening = prev.closing || {};
  }
  await s.setJSON(`day/${today}`, { date: today, opening, status: 'open', createdAt: now() }, { onlyIfNew: true });
  return s.get(`day/${today}`, { type: 'json' });
}
const erpWhich = (erp: any, date: string) => (erp?.reportDate && erp.reportDate < date ? 'opening' : 'closing');
function erpCmp(erp: any, locs: any[], day: any, mvs: any[], counts: any[], settings: any) {
  return erpCompare(erp, locs, summarize(locs, day.opening, mvs, counts, settings), settings, erpWhich(erp, day.date), day.opening);
}
async function addAlert(s: any, a: any) {
  const date = istDate(); const at = now();
  const rec = { id: `${at}-${rid()}`, date, at, ...a };
  await s.setJSON(`al/${date}/${rec.id}`, rec);
  return rec;
}

// ---------- handler ----------
export default async (req: Request) => {
  const s = store();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const method = req.method;
  const body: any = method === 'POST' ? await req.json().catch(() => ({})) : {};

  try {
    // ----- public -----
    if (path === 'login-list') {
      const users = await getUsers(s);
      return J({ users: users.filter((u) => u.active !== false).map((u) => ({ id: u.id, name: u.name, role: u.role })), settings: { shopName: (await getSettings(s)).shopName } });
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
      const token = await sign(s, { uid: u.id, exp: now() + 14 * 864e5 });
      return J({ token, user: pubUser(u) });
    }

    // ----- authenticated -----
    const tok = (req.headers.get('authorization') || '').replace(/^Bearer /, '') || url.searchParams.get('t');
    const p = await verify(s, tok);
    if (!p) return err('Please log in again', 401);
    const users = await getUsers(s);
    const me = users.find((u) => u.id === p.uid && u.active !== false);
    if (!me) return err('User disabled', 401);
    const can = (perm: string) => me.role === 'admin' || (me.perms || []).includes(perm);
    const need = (perm: string) => { if (!can(perm)) throw Object.assign(new Error(`No permission: ${PERMS[perm as keyof typeof PERMS] || perm}`), { status: 403 }); };
    const today = istDate();

    if (path.startsWith('img/') && method === 'GET') {
      const key = path.slice(4).replace(/[^a-z0-9-]/gi, '');
      const e = await s.getWithMetadata(`img/${key}`, { type: 'arrayBuffer' });
      if (e === null) return new Response('Not found', { status: 404 });
      if ((e.metadata as any)?.doc && !can('docs') && !can('docsEdit')) return new Response('No permission', { status: 403 });
      return new Response(e.data as ArrayBuffer, { headers: { 'content-type': (e.metadata as any)?.type || 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' } });
    }

    if (path === 'state') {
      try { await runDocReminders(s); } catch {}   // v1.20 fallback if the scheduled run did not happen today
      const date = url.searchParams.get('date') || today;
      if (date > today) return err('That date has not started yet');
      if (date === today) await ensureToday(s);
      const [locs, settings, d] = await Promise.all([getLocs(s), getSettings(s), loadDay(s, date)]);
      if (!d.day) return err(`No stock record for ${date}`, 404);
      let alerts = { unread: 0 };
      if (can('alerts')) {
        const seen = +((await s.get(`seen/${me.id}`)) || 0);
        const list = await listJSON(s, `al/${today}/`);
        alerts.unread = list.filter((a: any) => a.at > seen && a.by !== me.id).length;
      }
      const days = await dayKeys(s);
      const [sessions, erp] = await Promise.all([listJSON(s, `ss/${date}/`), s.get(`erp/${date}`, { type: 'json' })]);
      const rpSent = can('share') ? await listJSON(s, `rps/${today}/`) : [];
      const grandDE = can('special') || can('grandBul') ? ((await s.get(`sxd/gbul/${today}`, { type: 'json' })) || false) : null;   // v1.37 Grand bullion day-end received?
      const shopLocs = (await listJSON(s, 'doc/')).filter((x: any) => x.type === 'Shop Location' && x.place).map((x: any) => ({ id: x.id, title: x.title, type: x.type, place: x.place }));   // v1.33 everyone can share the shop location
      const claims = date === today ? (await listJSON(s, `cl/${today}/`)).filter((c: any) => now() - c.at < CLAIM_MS) : [];   // v1.56 who is counting what right now
      return J({ today, date, day: d.day, mvs: d.mvs, counts: d.allCounts, sessions, erp, claims, locs, settings, me: pubUser(me), alerts, days, rpSent, shopLocs, grandDE, userNames: Object.fromEntries(users.map((u) => [u.id, u.name])) });
    }

    // helpers needing an open day
    const openDay = async (date: string) => {
      if (date !== today) throw Object.assign(new Error('Only today can be changed'), { status: 400 });
      const day = await ensureToday(s);
      if (day.status === 'closed') throw Object.assign(new Error('Today is closed. Ask admin to reopen.'), { status: 400 });
      return day;
    };

    // v1.56 "counting now" claim from a phone — renew every minute while the count screen is open; release on close
    if (path === 'claim' && method === 'POST') {
      need('count'); await openDay(body.date || today);
      const locId = String(body.locId || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 40); if (!locId) return err('Unknown location');
      const key = `cl/${today}/${locId}`; const cur: any = await s.get(key, { type: 'json' });
      if (body.release) { if (cur && cur.by === me.id) await s.delete(key); return J({ ok: true }); }
      if (cur && cur.by !== me.id && now() - cur.at < CLAIM_MS && !body.force) return J({ ok: false, by: cur.by, name: users.find((u) => u.id === cur.by)?.name || cur.by, at: cur.at });
      if (cur && cur.by !== me.id && body.force && !can('accept')) return err('Only a manager can take over a count', 403);
      await s.setJSON(key, { locId, by: me.id, at: now() });
      return J({ ok: true });
    }

    if (path === 'count' && method === 'POST') {
      need('count');
      await openDay(body.date);
      const locs = await getLocs(s); const settings = await getSettings(s);
      const loc = locs.find((l) => l.id === body.locId); if (!loc) return err('Unknown location');
      // v1.56 teams: when "only the assigned team" is on, other staff can't count a team's locations (managers can)
      const tf = teamsForLoc(settings, loc);
      if (settings.teamStrict && tf.length && !can('accept') && !tf.some((t: any) => (t.members || []).includes(me.id))) return err(`${loc.name} is assigned to ${tf.map((t: any) => t.name).join(' / ')}. Ask a manager.`, 403);
      const clm: any = await s.get(`cl/${today}/${loc.id}`, { type: 'json' });
      if (clm && clm.by !== me.id && now() - clm.at < CLAIM_MS && !can('accept')) return err(`${users.find((u) => u.id === clm.by)?.name || 'Someone'} is counting ${loc.name} on another phone.`, 409);
      const { day, mvs, counts } = await loadDay(s, today);
      const exp = computeExpected(day.opening, mvs)[loc.id] || { lines: {}, wt: 0 };
      const prev = latestCounts(counts)[loc.id];
      if (prev && !can('accept')) {
        const pst = locStatus(exp, prev, mvs, loc.id, settings);
        if (pst.state !== 'stale' && !prev.recountAllowed) return err(`Already verified by ${users.find((u) => u.id === prev.by)?.name || prev.by}. Changes need a manager correction.`, 409);
      }
      const mode = loc.sec === 'box' ? (body.mode || 'both') : 'count';
      const lines: any = {}; for (const [t, n] of Object.entries(body.lines || {})) if (+(n as any) > 0) lines[t] = Math.round(+(n as any));
      const rec: any = { id: `${now()}-${rid()}`, date: today, locId: loc.id, sec: loc.sec, mode, lines: mode === 'weight' ? null : lines, wt: mode === 'count' ? null : r3(body.wt), note: String(body.note || '').slice(0, 300), by: me.id, at: now(), round: day.round || 'morning', expected: exp, sessionId: String(body.sessionId || '').slice(0, 40), reasons: {} as any };
      if (Array.isArray(body.slots)) rec.slots = body.slots.slice(0, 20).map((x: any) => ({ f: Math.max(0, Math.round(+x.f || 0)), n: Math.max(0, Math.round(+x.n || 0)), per: Math.max(0, Math.round(+x.per || 0)) }));
      for (const [t, r] of Object.entries(body.reasons || {})) rec.reasons[String(t).slice(0, 30)] = String(r).slice(0, 80);
      if (body.verifyAll && !can('verifyAll')) return err('No permission to use Verify all', 403);
      rec.verifyAll = !!body.verifyAll;
      rec.itemNotes = {}; rec.photos = {};
      for (const [k, n] of Object.entries(body.itemNotes || {})) { const v = String(n || '').trim().slice(0, 200); if (v) rec.itemNotes[String(k).slice(0, 30)] = v; }
      let nPh = 0;
      for (const [k, arr] of Object.entries(body.photos || {})) { const ks = (Array.isArray(arr) ? arr : []).map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 300 - nPh); nPh += ks.length; if (ks.length) rec.photos[String(k).slice(0, 30)] = ks; }
      // standing item notes on the location (shown at the next count)
      if (body.itemNotes && typeof body.itemNotes === 'object') {
        const data = await s.get('cfg/locs', { type: 'json' }); const L = data.locs.find((x: any) => x.id === loc.id);
        const before = JSON.stringify(L.itemNotes || {}); L.itemNotes = { ...(L.itemNotes || {}) };
        for (const k of Object.keys(body.itemNotes)) { const v = rec.itemNotes[String(k).slice(0, 30)]; if (v) L.itemNotes[String(k).slice(0, 30)] = v; else delete L.itemNotes[String(k).slice(0, 30)]; }
        if (JSON.stringify(L.itemNotes) !== before) await s.setJSON('cfg/locs', data);
      }
      const st = locStatus(exp, rec, [], loc.id, settings);
      rec.result = st.state; rec.diff = st.diff; rec.wtDiff = st.wtDiff;
      await s.setJSON(`ct/${today}/${loc.id}/${rec.id}`, rec);
      try { await s.delete(`cl/${today}/${loc.id}`); } catch {}
      if (st.state === 'var') {
        const parts = Object.entries(st.diff).map(([t, d]: any) => `${keyText(loc, t)} ${d > 0 ? '+' : ''}${d}${rec.reasons[t] ? ` (${rec.reasons[t]})` : ''}`);
        if (mode !== 'count' && Math.abs(st.wtDiff) > settings.wtTol) parts.push(`weight ${st.wtDiff > 0 ? '+' : ''}${st.wtDiff.toFixed(3)} g`);
        await addAlert(s, { type: 'variance', title: `Variance · ${loc.name}`, body: `${SECTIONS.find((x) => x.key === loc.sec)?.label} · ${loc.group}: ${parts.join(', ')}`, locId: loc.id, sec: loc.sec, by: me.id });
      }
      return J({ ok: true, count: rec });
    }

    if (path === 'count/recount' && method === 'POST') {
      need('accept'); await openDay(body.date);
      const { counts } = await loadDay(s, today);
      const c: any = latestCounts(counts)[body.locId]; if (!c) return err('No count yet');
      c.recountAllowed = { by: me.id, at: now() };
      await s.setJSON(`ct/${today}/${c.locId}/${c.id}`, c);
      const loc = (await getLocs(s)).find((l) => l.id === c.locId);
      await addAlert(s, { type: 'info', title: `Recount requested · ${loc?.name}`, body: `${me.name} asked for ${loc?.name} to be counted again.`, locId: c.locId, by: me.id });
      return J({ ok: true });
    }

    if (path === 'session/start' && method === 'POST') {
      need('count'); await openDay(body.date);
      const scope = ['all', ...SECTIONS.map((x) => x.key)].includes(body.scope) ? body.scope : 'all';
      const ids = Array.isArray(body.ids) ? body.ids.slice(0, 400).map((x: any) => String(x).slice(0, 40)) : null;
      const label = String(body.label || '').slice(0, 120);
      const curDay = await ensureToday(s); const round = curDay.round || 'morning';
      const existing = (await listJSON(s, `ss/${today}/`)).find((x: any) => x.by === me.id && x.scope === scope && (x.label || '') === label && (x.round || 'morning') === round && x.status === 'active');
      if (existing) return J({ session: existing, resumed: true });
      const rec: any = { id: `${now()}-${rid()}`, date: today, scope, round, by: me.id, at: now(), status: 'active' };
      if (ids) { rec.ids = ids; rec.label = label; }
      await s.setJSON(`ss/${today}/${rec.id}`, rec);
      return J({ session: rec });
    }
    if (path === 'session/finish' && method === 'POST') {
      need('count');
      const key = `ss/${today}/${String(body.id).replace(/[^a-z0-9-]/gi, '')}`;
      const ses: any = await s.get(key, { type: 'json' }); if (!ses) return err('Session not found');
      const locs = await getLocs(s); const settings = await getSettings(s);
      const { day, mvs, counts } = await loadDay(s, today, ses.round || 'morning');
      const sm = summarize(locs, day.opening, mvs, counts, settings);
      const inScope = ses.ids ? locs.filter((l) => ses.ids.includes(l.id)) : locs.filter((l) => l.active !== false && (ses.scope === 'all' || l.sec === ses.scope));
      let exp = 0, act = 0, short = 0, excess = 0, pend = 0, done = 0, wtVar = 0;
      const lines: string[] = [];
      for (const l of inScope) {
        const st = sm.status[l.id]; const c = sm.last[l.id];
        if (st.state === 'pending') continue; done++;
        if (c.mode !== 'weight') { exp += Object.values(sm.exp[l.id]?.lines || {}).reduce((a: number, b: any) => a + b, 0); act += Object.values(c.lines || {}).reduce((a: number, b: any) => a + b, 0); }
        for (const d of Object.values(st.diff) as number[]) { if (d < 0) short -= d; else excess += d; }
        if (st.state === 'var' || st.state === 'stale') { pend++; if (Math.abs(st.wtDiff) > settings.wtTol) wtVar++; lines.push(`${l.name}: ${Object.entries(st.diff).map(([t, d]: any) => `${keyText(l, t)} ${d > 0 ? '+' : ''}${d}`).join(', ') || `weight ${st.wtDiff > 0 ? '+' : ''}${st.wtDiff} g`}`); }
      }
      ses.summary = { locs: inScope.length, done, expected: exp, actual: act, short, excess, pending: pend, wtVar };
      ses.status = done >= inScope.length ? 'done' : 'active'; ses.finishedAt = now();
      await s.setJSON(key, ses);
      const label = (ses.round === 'evening' ? 'Evening · ' : 'Morning · ') + (ses.label || (ses.scope === 'all' ? 'Full stock count' : SECTIONS.find((x) => x.key === ses.scope)?.label + ' count'));
      const text = `${label} by ${me.name}: ${done}/${inScope.length} verified. Expected ${exp}, actual ${act}, short ${short}, excess ${excess}. Pending discrepancies ${pend}.` + (lines.length ? ' ' + lines.join('; ') : '');
      await addAlert(s, { type: 'report', title: `${label} ${ses.status === 'done' ? 'completed' : 'saved (incomplete)'}`, body: text, by: me.id, ok: !pend && ses.status === 'done' });
      return J({ ok: true, session: ses, text });
    }

    if (path === 'erp' && method === 'POST') {
      need('erp'); await openDay(body.date);
      const n = (v: any) => (v === null || v === undefined || v === '' || !isFinite(+v) ? null : +v);
      const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 200).map((x: any) => ({ name: String(x.name || '').trim().slice(0, 60), pcs: n(x.pcs) == null ? null : Math.round(n(x.pcs)!), lbl: n(x.lbl) == null ? null : Math.round(n(x.lbl)!), gr: n(x.gr) == null ? null : r3(n(x.gr)), net: n(x.net) == null ? null : r3(n(x.net)) })).filter((x: any) => x.name);
      const t = body.total || {};
      const total = (t.pcs != null || t.lbl != null) ? { pcs: n(t.pcs) == null ? null : Math.round(n(t.pcs)!), lbl: n(t.lbl) == null ? null : Math.round(n(t.lbl)!), gr: n(t.gr), net: n(t.net) } : null;
      const reportDate = /^\d{4}-\d{2}-\d{2}$/.test(body.reportDate || '') && body.reportDate <= today ? body.reportDate : today;
      const rec = { date: today, reportDate, rows, total, ref: String(body.ref || '').slice(0, 80), source: body.source === 'pdf' ? 'pdf' : 'manual', fileName: String(body.fileName || '').slice(0, 80), by: me.id, at: now() };
      await s.setJSON(`erp/${today}`, rec);
      // weight-only ERP rows (no Pc / Lbl) → weight-only boxes, created once with the ERP weight
      const added: string[] = [];
      const data = await s.get('cfg/locs', { type: 'json' });
      for (const x of rows) {
        if (x.pcs != null || x.lbl != null || !(x.gr || x.net)) continue;
        if (data.locs.some((l: any) => l.erpName && l.erpName.toLowerCase().replace(/[^a-z0-9]/g, '') === x.name.toLowerCase().replace(/[^a-z0-9]/g, ''))) continue;
        const pm = /\((\d{1,2})K?\)/i.exec(x.name); const purity = pm ? `${pm[1]}K` : '';
        const nice = x.name.replace(/\((\d{1,2})K?\)/i, (_m, k) => `${k}K`).replace(/\s+/g, ' ').replace(/\b(loose)\b/i, 'Loose').trim();
        const loc = { id: 'B' + now().toString(36) + rid().slice(0, 3), sec: 'box', group: 'Loose stock (weight only)', name: nice, erpName: x.name, purity, cat: 'Gold', itemType: /finding/i.test(x.name) ? 'Findings' : '', mode: 'weight', ...defaultPlace(await getSettings(s), 'box'), images: [], active: true, order: data.locs.length + 1, note: 'Added from ERP (weight only, no count)' };
        data.locs.push(loc); added.push(loc.name);
        const wt = r3(x.gr ?? x.net);
        await s.setJSON(`mv/${today}/${now()}-${rid()}`, { id: `${now()}-${rid()}`, date: today, kind: 'set', reason: 'From ERP', ref: rec.fileName || 'ERP', note: `Opening weight from ERP ${reportDate} (gross)`, legs: [{ locId: loc.id, lines: {}, wt }], by: me.id, at: now() });
      }
      if (added.length) await s.setJSON('cfg/locs', data);
      const locs = await getLocs(s); const settings = await getSettings(s); const { day, mvs, counts } = await loadDay(s, today);
      const ec = erpCmp(rec, locs, day, mvs, counts, settings);
      const bl = ec.basis === 'lbl' ? 'Lbl' : 'Pc';
      await addAlert(s, { type: ec.matched ? 'report' : 'variance', title: ec.matched ? 'ERP matched' : 'ERP does not match', body: `${me.name} loaded ERP ${reportDate}: ${ec.total.pcs ?? '—'} Pc / ${ec.total.lbl ?? '—'} Lbl. App ${ec.which} ${ec.total.app}. Difference ${ec.total.diff > 0 ? '+' : ''}${ec.total.diff} (${bl}).${added.length ? ` Added to Boxes (weight only): ${added.join(', ')}.` : ''}`, by: me.id, ok: ec.matched });
      return J({ ok: true, erp: rec, matched: ec.matched, added });
    }

    if (path === 'report' && method === 'POST') {
      need('count');
      const locs = await getLocs(s); const settings = await getSettings(s);
      const { day, mvs, counts } = await loadDay(s, today);
      const sm = summarize(locs, day.opening, mvs, counts, settings);
      const sec = SECTIONS.find((x) => x.key === body.sec); if (!sec) return err('Unknown section');
      const S = sm.sec[sec.key];
      const vlist = locs.filter((l) => l.sec === sec.key && ['var', 'stale'].includes(sm.status[l.id]?.state)).map((l) => `${l.name} (${sm.status[l.id].state === 'stale' ? '' : ''}${Object.entries(sm.status[l.id].diff).map(([t, d]: any) => `${t} ${d > 0 ? '+' : ''}${d}`).join(', ') || 'weight'}${sm.status[l.id].state === 'stale' ? ' — stock moved after check, recount' : ''})`);
      const text = `${sec.label} check done by ${me.name}: ${S.locs - S.pending}/${S.locs} checked, ${S.ok} OK, ${S.var + S.stale} variance, ${S.pending} pending. Counted ${S.counted} of ${S.checkedExp} expected pcs.` + (vlist.length ? ` Variances: ${vlist.join('; ')}` : '');
      await addAlert(s, { type: 'report', title: `${sec.label} check finished`, body: text, sec: sec.key, by: me.id, ok: !vlist.length });
      return J({ ok: true, text });
    }

    if (path === 'round' && method === 'POST') {
      need('move'); const day = await openDay(body.date);
      const to = body.round === 'evening' ? 'evening' : 'morning';
      if (to === 'morning' && me.role !== 'admin') return err('Only admin can go back to the morning count', 403);
      day.round = to; if (to === 'evening') { day.eveningAt = now(); day.eveningBy = me.id; }
      await s.setJSON(`day/${today}`, day);
      const locs = await getLocs(s); const settings = await getSettings(s); const d = await loadDay(s, today, 'morning');
      const r = roundsDone(locs, day, d.mvs, d.counts, [], settings).morning;
      await addAlert(s, { type: 'info', title: to === 'evening' ? 'Evening count started' : 'Back to morning count', body: `${me.name} ${to === 'evening' ? 'finished end-of-day entries and started the evening count' : 'reopened the morning count'}. Morning count: ${r.done}/${r.locs} verified.`, by: me.id });
      return J({ ok: true, round: to });
    }

    if (path === 'txns' && method === 'POST') {
      need('move'); await openDay(body.date);
      const locs = await getLocs(s); const byId = Object.fromEntries(locs.map((l) => [l.id, l]));
      const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 100);
      if (!rows.length) return err('No entries');
      const out: any[] = [];
      for (const [i, x] of rows.entries()) {
        const T = TXN_TYPES.find((t: any) => t.k === x.type); if (!T) return err(`Row ${i + 1}: choose a type`);
        if (T.admin && me.role !== 'admin') return err(`Row ${i + 1}: ${T.label} is admin only`, 403);
        const loc = byId[x.locId]; if (!loc) return err(`Row ${i + 1}: choose a location`);
        const qty = Math.max(0, Math.round(+x.qty || 0)); const wt = Math.max(0, r3(x.wt));
        if (!qty && !wt) return err(`Row ${i + 1}: enter quantity or weight`);
        if (qty && !x.item) return err(`Row ${i + 1}: choose the item`);
        out.push({ T, loc, qty, wt, item: String(x.item || '').slice(0, 40), ref: String(x.ref || '').slice(0, 60), note: String(x.note || '').slice(0, 200) });
      }
      const saved = [];
      const dd = await loadDay(s, today); const expAll = computeExpected(dd.day.opening, dd.mvs);
      for (const r of out) {
        const sign = r.T.dir;
        const mv = { id: `${now()}-${rid()}`, date: today, kind: sign > 0 ? 'in' : 'out', txn: r.T.k, reason: r.T.label, ref: r.ref, note: r.note, qty: r.qty, wtTotal: r.wt,
          legs: [{ locId: r.loc.id, lines: r.qty ? { [r.item]: sign * r.qty } : {}, wt: r.loc.sec === 'box' && ((expAll[r.loc.id]?.wt || 0) > 0 || sign > 0) ? sign * r.wt : 0 }]   /* v1.28: weight for boxes only */, by: me.id, at: now(), eod: true };
        const L0 = (expAll[r.loc.id] ||= { lines: {}, wt: 0 }); L0.wt = r3(L0.wt + mv.legs[0].wt);
        await s.setJSON(`mv/${today}/${mv.id}`, mv); saved.push(mv);
      }
      return J({ ok: true, saved: saved.length });
    }

    if (path === 'move' && method === 'POST') {
      need(body.kind === 'set' ? 'setup' : 'move');
      if (body.reason === 'Stock withdrawal' && me.role !== 'admin') return err('Stock withdrawal is admin only', 403);
      await openDay(body.date);
      const locs = await getLocs(s);
      const byId = Object.fromEntries(locs.map((l) => [l.id, l]));
      const clean = (o: any) => { const r: any = {}; for (const [t, n] of Object.entries(o || {})) { const v = Math.round(+(n as any) || 0); if (v) r[t] = v; } return r; };
      const neg = (o: any) => Object.fromEntries(Object.entries(o).map(([t, n]: any) => [t, -n]));
      let legs: any[] = [];
      const lines = clean(body.lines); const wt = r3(body.wt);
      if (body.kind === 'in') { if (!byId[body.locId]) return err('Pick a location'); legs = [{ locId: body.locId, lines, wt }]; }
      else if (body.kind === 'out') { if (!byId[body.locId]) return err('Pick a location'); legs = [{ locId: body.locId, lines: neg(lines), wt: -wt }]; }
      else if (body.kind === 'move') {
        if (!byId[body.locId] || !byId[body.toLocId] || body.locId === body.toLocId) return err('Pick two different locations');
        // keep each piece's jewellery type when it moves to a location of another type
        const toLines: any = {}; for (const [k, n] of Object.entries(lines)) { const k2 = lineKey(byId[body.toLocId], itemOf(k), jtOfLine(byId[body.locId], k), purOfLine(byId[body.locId], k)); toLines[k2] = (toLines[k2] || 0) + (n as number); }
        legs = [{ locId: body.locId, lines: neg(lines), wt: -wt }, { locId: body.toLocId, lines: toLines, wt: r3(body.toWt ?? wt) }];
      } else if (body.kind === 'set' || body.kind === 'accept') {
        if (body.kind === 'accept') need('accept');
        const loc = byId[body.locId]; if (!loc) return err('Pick a location');
        const { day, mvs, counts } = await loadDay(s, today);
        const exp = computeExpected(day.opening, mvs)[loc.id] || { lines: {}, wt: 0 };
        let target: any;
        if (body.kind === 'set') target = { lines: clean(body.lines), wt: body.wt == null ? exp.wt : r3(body.wt) };
        else {
          const c = latestCounts(counts)[loc.id]; if (!c) return err('No count to accept');
          target = { lines: c.mode === 'weight' ? exp.lines : c.lines, wt: c.mode === 'count' ? exp.wt : c.wt }; body.countId = c.id;
        }
        const d: any = {}; for (const t of new Set([...Object.keys(exp.lines), ...Object.keys(target.lines)])) { const v = (target.lines[t] || 0) - (exp.lines[t] || 0); if (v) d[t] = v; }
        legs = [{ locId: loc.id, lines: d, wt: r3(target.wt - exp.wt) }];
        if (!sumLines(d) && !Object.keys(d).length && !legs[0].wt) return J({ ok: true, nochange: true });
      } else return err('Unknown movement');
      if (!legs.some((l) => Object.keys(l.lines).length || l.wt)) return err('Enter a quantity or weight');
      const mv = { id: `${now()}-${rid()}`, date: today, kind: body.kind, txn: TXN_TYPES.find((t: any) => t.label === body.reason)?.k, wtTotal: r3(body.wtTotal ?? body.wt), reason: String(body.reason || '').slice(0, 60), ref: String(body.ref || '').slice(0, 60), note: String(body.note || '').slice(0, 300), legs, by: me.id, at: now(), ...(body.kind === 'accept' ? { countId: body.countId } : {}) };
      await s.setJSON(`mv/${today}/${mv.id}`, mv);
      if (body.kind === 'set' || body.kind === 'accept') {
        const loc = byId[body.locId];
        await addAlert(s, { type: 'info', title: `${body.kind === 'accept' ? 'Count accepted' : 'Count set'} · ${loc.name}`, body: `${me.name} changed stock by ${Object.entries(legs[0].lines).map(([t, n]: any) => `${t} ${n > 0 ? '+' : ''}${n}`).join(', ') || '0 pcs'}${legs[0].wt ? `, ${legs[0].wt > 0 ? '+' : ''}${legs[0].wt} g` : ''}. ${mv.note}`, locId: loc.id, by: me.id });
      }
      return J({ ok: true, mv });
    }

    if (path === 'move/void' && method === 'POST') {
      need('move'); await openDay(body.date);
      const key = `mv/${today}/${String(body.id).replace(/[^a-z0-9-]/gi, '')}`;
      const mv: any = await s.get(key, { type: 'json' }); if (!mv) return err('Not found');
      if (mv.kind === 'set' || mv.kind === 'accept') need('setup');
      mv.void = { by: me.id, at: now(), why: String(body.why || '').slice(0, 120) };
      await s.setJSON(key, mv);
      return J({ ok: true });
    }

    if (path === 'loc' && method === 'POST') {
      need('setup');
      const data = await s.get('cfg/locs', { type: 'json' });
      const L = body.loc || {};
      const fields = ['sec', 'group', 'name', 'purity', 'cat', 'itemType', 'boxNo', 'insert', 'qty', 'mode', 'images', 'note', 'order', 'erpName', 'itemNotes', 'area', 'sub', 'jtype', 'jtypes', 'cover', 'spot'];
      let loc = data.locs.find((l: any) => l.id === L.id);
      if (L.active === false && loc) {
        const day = await ensureToday(s); const { mvs } = await loadDay(s, today);
        const e = computeExpected(day.opening, mvs)[loc.id];
        if (e && (sumLines(e.lines) || e.wt)) {
          // Deleting a location that still holds stock: admin only, with a reason; stock is written off to zero (logged)
          if (me.role !== 'admin') return err('This location still has stock. Move it or set it to zero first — or ask admin to delete it.', 409);
          if (!String(body.reason || '').trim()) return err('Give a reason to delete a location that still has stock', 409);
          const neg: any = {}; for (const [t, n] of Object.entries(e.lines)) if (n) neg[t] = -(n as number);
          const mv = { id: `${now()}-${rid()}`, date: today, kind: 'set', reason: 'Location deleted', note: String(body.reason).slice(0, 200), legs: [{ locId: loc.id, lines: neg, wt: -(e.wt || 0) }], by: me.id, at: now() };
          await s.setJSON(`mv/${today}/${mv.id}`, mv);
          await addAlert(s, { type: 'info', title: `Location deleted · ${loc.name}`, body: `${me.name} deleted ${loc.name} with ${sumLines(e.lines)} pcs${e.wt ? ` / ${e.wt} g` : ''} written off. Reason: ${body.reason}`, by: me.id });
        }
        loc.active = false; loc.deletedAt = now(); loc.deletedBy = me.id;
      } else if (loc) { for (const f of fields) if (f in L) loc[f] = L[f]; loc.active = true; }
      else {
        if (!SECTIONS.find((x) => x.key === L.sec) || !L.name) return err('Section and name are required');
        loc = { id: (L.sec === 'counter' ? 'C' : L.sec === 'tray' ? 'T' : 'B') + now().toString(36), active: true, images: [] };
        for (const f of fields) if (f in L) loc[f] = L[f];
        loc.order = loc.order ?? data.locs.length + 1;
        data.locs.push(loc);
      }
      if (loc && Array.isArray(loc.jtypes)) {   // v1.14 several jewellery types: keep list valid, jtype = single type or Mixed
        loc.jtypes = normJts(loc.jtypes);
        if (loc.jtypes.length === 1) loc.jtype = loc.jtypes[0]; else if (loc.jtypes.length > 1) loc.jtype = 'Mixed'; else delete loc.jtypes;
      }
      await s.setJSON('cfg/locs', data);
      return J({ ok: true, loc });
    }

    if (path === 'img' && method === 'POST') {
      const isDoc = !!body.doc;   // v1.19 business documents: images or PDF, readable only with the docs permission
      if (isDoc) need('docsEdit'); else if (!can('setup') && !can('count')) need('setup');
      const m = (isDoc ? /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,(.+)$/ : /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/).exec(body.dataUrl || '');
      if (!m) return err(isDoc ? 'Upload a photo (JPG / PNG) or a PDF' : 'Bad image');
      const buf = Buffer.from(m[2], 'base64'); if (buf.length > (isDoc ? 4_000_000 : 1_500_000)) return err(isDoc ? 'File too large (max 4 MB)' : 'Image too large');
      const key = crypto.randomUUID();
      await s.set(`img/${key}`, buf, { metadata: { type: m[1], by: me.id, at: now(), ...(isDoc ? { doc: true } : {}) } });
      return J({ key });
    }

    if (path === 'close' && method === 'POST') {
      need('close');
      if (body.date !== today) return err('Only today can be closed');
      {
        const locs = await getLocs(s); const settings = await getSettings(s); const d = await loadDay(s, today);
        const erp = await s.get(`erp/${today}`, { type: 'json' });
        const ec = erpCmp(erp, locs, d.day, d.mvs, d.counts, settings);
        const rd = roundsDone(locs, d.day, d.mvs, d.allCounts.filter((c: any) => (c.round || 'morning') === 'morning'), d.allCounts.filter((c: any) => c.round === 'evening'), settings);
        const miss = [];
        if (rd.morning.done < rd.morning.locs) miss.push(`morning count ${rd.morning.done}/${rd.morning.locs}`);
        if ((d.day.round || 'morning') !== 'evening') miss.push('evening count not started');
        else if (rd.evening.done < rd.evening.locs) miss.push(`evening count ${rd.evening.done}/${rd.evening.locs}`);
        if (miss.length) {
          if (me.role !== 'admin') return err(`Both counts are compulsory — ${miss.join(', ')}. Only admin can close now.`, 409);
          if (!String(body.override || '').trim()) return err(`Counts incomplete (${miss.join(', ')}). Give a reason to close.`, 409);
        }
        if (ec.entered && !ec.matched) {
          if (me.role !== 'admin') return err(`ERP total does not match (difference ${ec.total.diff > 0 ? '+' : ''}${ec.total.diff}). Only admin can close with a mismatch.`, 409);
          if (!String(body.override || '').trim()) return err('Give a reason to close with an ERP mismatch', 409);
        }
      }
      const day = await closeDay(s, today, me.id);
      if (body.override) { day.override = { by: me.id, why: String(body.override).slice(0, 200) }; await s.setJSON(`day/${today}`, day); }
      const sm = day.summary;
      await addAlert(s, { type: 'close', title: `Day closed · ${today}`, body: `Closed by ${me.name}. Closing stock ${sm.closing} pcs (opening ${sm.opening}, in ${sm.in}, out ${sm.out}). Checked ${sm.checked}/${sm.locs}, variances ${sm.variances}. Closing becomes tomorrow's opening.`, by: me.id, ok: !sm.variances });
      return J({ ok: true, day });
    }
    if (path === 'reopen' && method === 'POST') {
      need('close'); if (me.role !== 'admin') return err('Only admin can reopen', 403);
      const day = await s.get(`day/${today}`, { type: 'json' });
      if (!day || day.status !== 'closed') return err('Today is not closed');
      day.status = 'open'; delete day.closing; delete day.summary; day.reopenedBy = me.id; day.reopenedAt = now();
      await s.setJSON(`day/${today}`, day);
      return J({ ok: true });
    }

    if (path === 'history') {
      need('reports');
      const keys = (await dayKeys(s)).slice(-90).reverse();
      const days = await Promise.all(keys.map((k: string) => s.get(`day/${k}`, { type: 'json' })));
      return J({ days: days.filter(Boolean).map((d: any) => ({ date: d.date, status: d.status, summary: d.summary || null, closedBy: d.closedBy, autoClosed: d.autoClosed })) });
    }

    if (path === 'alerts') {
      need('alerts');
      const dates = (await dayKeys(s)).slice(-7);
      if (!dates.includes(today)) dates.push(today);
      const lists = await Promise.all(dates.map((d: string) => listJSON(s, `al/${d}/`)));
      const list = lists.flat().sort((a: any, b: any) => b.at - a.at).slice(0, 300);
      const seen = +((await s.get(`seen/${me.id}`)) || 0);
      return J({ alerts: list, seen });
    }
    if (path === 'alerts/seen' && method === 'POST') { await s.set(`seen/${me.id}`, String(now())); return J({ ok: true }); }

    // v1.34 Google review requests: log who was asked (any signed-in user), list recent
    if (path === 'review/log' && method === 'POST') {
      const t = (v: any, n = 60) => String(v ?? '').trim().slice(0, n); const at = now(); const ph = t(body.phone, 20).replace(/[^0-9]/g, '');
      const rec = { id: `${at}-${rid().slice(0, 6)}`, at, date: today, by: me.id, byName: me.name, name: t(body.name), phone: ph, shop: t(body.shop, 80), via: t(body.via, 20), lang: t(body.lang, 10) };
      await s.setJSON(`rv/${today.slice(0, 7)}/${rec.id}`, rec); return J({ ok: true, rec });
    }
    if (path === 'review/log' && method === 'GET') {
      const m = today.slice(0, 7); const d = new Date(today + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); const pm = d.toISOString().slice(0, 7);
      const all = [...await listJSON(s, `rv/${pm}/`), ...await listJSON(s, `rv/${m}/`)].sort((a: any, b: any) => b.at - a.at);
      return J({ list: all.slice(0, 200), month: all.filter((x: any) => x.date.startsWith(m)).length, today: all.filter((x: any) => x.date === today).length });
    }
    // ================= v1.36 separate group (not part of stock): bullion boxes (999 / 995) + Grand-Yamie label stock =================
    if (path.startsWith('sx')) {
      const full = can('special'), gOnly = !full && can('grandBul');   // v1.37 Grand staff see only the Grand bullion box
      if (!full && !gOnly) need('special');
      const sideOk = (b: any, side: string) => side === 'grand' ? (me.role === 'admin' || can('grandBul')) : full;
      const T = (v: any, n = 80) => String(v ?? '').trim().slice(0, n);
      const W = (v: any) => { const n = Math.round(+v * 1000) / 1000; return Number.isFinite(n) ? n : NaN; };
      const D = (v: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : today;
      const SX_DEFAULT = [
        { id: 'gbul', kind: 'bullion', name: 'Grand Bullion', purities: ['999', '995'], sides: ['yamie', 'grand'], boxWt: 0, opening: {}, openingG: {} },
        { id: 'ybul', kind: 'bullion', name: 'Yamie Bullion Box', purities: ['999', '995'], boxWt: 0, opening: {} },
        { id: 'gys', kind: 'labels', name: 'Grand-Yamie Stock', note: 'Grand stock held at Yamie', boxWt: 0, opening: {} },
      ];
      const boxes: any[] = (await s.get('sx/boxes', { type: 'json' })) || SX_DEFAULT;
      { const g = boxes.find((b) => b.id === 'gbul'); if (g && !g.sides) { g.sides = ['yamie', 'grand']; g.openingG ||= {}; if (g.name === 'Grand Bullion Box') g.name = 'Grand Bullion'; } }   // v1.37 split: at Yamie + at Grand
      const box = (id: any) => boxes.find((b) => b.id === id);
      if (path === 'sx' && method === 'GET') {
        const [entries, labels, issues, dayEnd] = await Promise.all([listJSON(s, 'sxe/'), gOnly ? [] : listJSON(s, 'sxl/'), gOnly ? [] : listJSON(s, 'sxi/'), listJSON(s, 'sxd/')]);
        if (gOnly) return J({ boxes: boxes.filter((b) => b.id === 'gbul'), gOnly: true, dayEnd: dayEnd.sort((a: any, b: any) => b.date.localeCompare(a.date)).slice(0, 60), entries: entries.filter((e: any) => e.boxId === 'gbul').sort((a: any, b: any) => a.date.localeCompare(b.date) || a.at - b.at), labels: [], issues: [], userNames: Object.fromEntries((await getUsers(s)).map((x: any) => [x.id, x.name])) });
        return J({ boxes, dayEnd: dayEnd.sort((a: any, b: any) => b.date.localeCompare(a.date)).slice(0, 60), entries: entries.sort((a: any, b: any) => a.date.localeCompare(b.date) || a.at - b.at), labels, issues: issues.sort((a: any, b: any) => b.at - a.at), userNames: Object.fromEntries((await getUsers(s)).map((x: any) => [x.id, x.name])) });
      }
      if (path === 'sx/box' && method === 'POST') {   // name, box weight, opening (admin / setup)
        const b = box(body.id); if (!b) return err('Box not found');
        if (body.name !== undefined) b.name = T(body.name, 50) || b.name;
        if (body.boxWt !== undefined && !full) return err('No permission', 403);
        if (body.boxWt !== undefined) { const w = W(body.boxWt); if (!(w >= 0)) return err('Enter the box weight'); b.boxWt = w; b.boxWtAt = now(); b.boxWtBy = me.id; }
        if (body.opening && typeof body.opening === 'object') { need('setup'); const key = body.side === 'grand' && b.sides ? 'openingG' : 'opening'; b[key] ||= {};
          for (const [k, v] of Object.entries(body.opening as any)) { if (!b.purities?.includes(k)) continue; const w = W((v as any).wt); if (!(w >= 0)) return err(`Opening ${k}: enter the weight`); b[key][k] = { wt: w, date: D((v as any).date), by: me.id, at: now() }; } }
        await s.setJSON('sx/boxes', boxes); return J({ ok: true, box: b });
      }
      if (path === 'sx/entry' && method === 'POST') {   // bullion receipt / issue
        const b = box(body.boxId); if (!b || b.kind !== 'bullion') return err('Box not found');
        const dir = body.dir === 'out' ? 'out' : 'in'; const pur = T(body.purity, 10); if (!b.purities.includes(pur)) return err('Pick 999 or 995');
        const side = b.sides && body.side === 'grand' ? 'grand' : 'yamie'; if (!sideOk(b, side)) return err(side === 'grand' ? 'Bullion at Grand is entered by Grand staff' : 'Bullion at Yamie is entered by Yamie', 403);
        const wt = W(body.wt); if (!(wt > 0)) return err('Enter the weight');
        if (dir === 'out') { const ents = (await listJSON(s, `sxe/${b.id}/`)).filter((e: any) => (e.side || 'yamie') === side); const bal = ((side === 'grand' ? b.openingG : b.opening)?.[pur]?.wt || 0) + ents.filter((e: any) => !e.void && e.purity === pur).reduce((a: number, e: any) => a + (e.dir === 'in' ? e.wt : -e.wt), 0);
          if (wt > Math.round(bal * 1000) / 1000 + 1e-9) return err(`Only ${bal.toFixed(3)} g of ${pur} in the box`); }
        const at = now(); const e = { id: `${at}-${rid().slice(0, 6)}`, boxId: b.id, ...(b.sides ? { side } : {}), dir, purity: pur, wt, date: D(body.date), party: T(body.party), smith: T(body.smith), ref: T(body.ref, 60), mode: T(body.mode, 20), note: T(body.note, 200), by: me.id, at };
        await s.setJSON(`sxe/${b.id}/${e.id}`, e); return J({ ok: true, entry: e });
      }
      if (path === 'sx/dayend' && method === 'POST') {   // v1.37 Grand staff report the Grand-side bullion balance at day end
        const b = box('gbul'); if (!b) return err('Box not found'); if (!sideOk(b, 'grand')) return err('Only Grand staff can send the Grand balance', 403);
        const bal: any = {}; for (const p of b.purities) { const w = W(body.bal?.[p]); if (!(w >= 0)) return err(`Enter the ${p} balance`); bal[p] = w; }
        const ents = (await listJSON(s, 'sxe/gbul/')).filter((e: any) => e.side === 'grand' && !e.void); const date = D(body.date);
        const book: any = {}; for (const p of b.purities) book[p] = Math.round((((b.openingG || {})[p]?.wt || 0) + ents.filter((e: any) => e.purity === p && e.date <= date).reduce((a: number, e: any) => a + (e.dir === 'in' ? e.wt : -e.wt), 0)) * 1000) / 1000;
        const rec = { date, bal, book, note: T(body.note, 200), by: me.id, byName: me.name, at: now() };
        await s.setJSON(`sxd/gbul/${date}`, rec); return J({ ok: true, rec });
      }
      if (path === 'sx/void' && method === 'POST') {   // cancel a wrong entry (admin), kept for audit
        if (me.role !== 'admin') return err('Only admin can cancel an entry', 403);
        const k = `sxe/${T(body.boxId, 20)}/${T(body.id, 40)}`; const e = await s.get(k, { type: 'json' }); if (!e) return err('Entry not found');
        e.void = { by: me.id, at: now(), reason: T(body.reason, 120) || 'Cancelled' }; await s.setJSON(k, e); return J({ ok: true });
      }
      if (gOnly && /^sx\/(receive|label|issue)$/.test(path)) return err('No permission', 403);
      if (path === 'sx/receive' && method === 'POST') {   // Grand-Yamie: receipt of labelled pieces
        const b = box(body.boxId); if (!b || b.kind !== 'labels') return err('Box not found');
        const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 500); if (!rows.length) return err('Nothing to receive');
        const date = D(body.date); const at = now(); const out: any[] = []; const seen = new Set();
        for (const r of rows) { const label = T(r.label, 30).toUpperCase(); if (!label) return err('Every row needs a label number'); if (seen.has(label)) return err(`${label} is listed twice`); seen.add(label);
          const wt = W(r.wt); if (!(wt > 0)) return err(`${label}: enter the weight`); if (!T(r.item)) return err(`${label}: pick the item`);
          const old = await s.get(`sxl/${b.id}/${label}`, { type: 'json' }); if (old && old.status === 'in') return err(`${label} is already in the box`);
          const net = r.net === '' || r.net == null ? null : W(r.net);
          out.push({ boxId: b.id, label, code: T(r.code, 6), item: T(r.item, 40), purity: T(r.purity, 12), wt, net: Number.isFinite(net) ? net : null, docNo: T(r.docNo || body.docNo, 40), docDate: T(r.docDate || body.docDate, 12), src: T(body.src, 20), party: T(r.party || body.party), rdate: date, rby: me.id, rat: at, rref: T(body.ref, 60), status: 'in', history: old ? [...(old.history || []), { rdate: old.rdate, idate: old.idate, to: old.to }].slice(-10) : [] }); }
        await Promise.all(out.map((x) => s.setJSON(`sxl/${b.id}/${x.label}`, x))); return J({ ok: true, count: out.length, wt: out.reduce((a, x) => a + x.wt, 0) });
      }
      if (path === 'sx/label' && method === 'POST') {   // fix item / purity / weight / party of a piece in the box
        const k = `sxl/${T(body.boxId, 20)}/${T(body.label, 30).toUpperCase()}`; const x = await s.get(k, { type: 'json' }); if (!x) return err('Label not found');
        if (body.delete) { if (me.role !== 'admin') return err('Only admin can delete', 403); if (x.status !== 'in') return err('Issued pieces cannot be deleted'); await s.delete(k); return J({ ok: true }); }
        if (x.status !== 'in') return err('Already issued — cannot edit');
        if (body.item !== undefined) x.item = T(body.item, 40) || x.item; if (body.purity !== undefined) x.purity = T(body.purity, 12); if (body.party !== undefined) x.party = T(body.party);
        if (body.wt !== undefined) { const w = W(body.wt); if (!(w > 0)) return err('Enter the weight'); x.wt = w; }
        if (body.net !== undefined) { const w = body.net === '' ? null : W(body.net); x.net = Number.isFinite(w as any) ? w : null; } if (body.docNo !== undefined) x.docNo = T(body.docNo, 40); if (body.docDate !== undefined) x.docDate = T(body.docDate, 12);
        x.eby = me.id; x.eat = now(); await s.setJSON(k, x); return J({ ok: true, label: x });
      }
      if (path === 'sx/issue' && method === 'POST') {   // Grand-Yamie: issue labels back to Grand (by hand / courier)
        const b = box(body.boxId); if (!b || b.kind !== 'labels') return err('Box not found');
        const list = [...new Set((Array.isArray(body.labels) ? body.labels : []).map((x: any) => T(x, 30).toUpperCase()).filter(Boolean))].slice(0, 500);
        if (!list.length) return err('Pick the labels to issue'); const mode = body.mode === 'courier' ? 'courier' : 'hand'; const to = T(body.to); if (!to) return err(mode === 'courier' ? 'Enter the courier name' : 'Enter who took it');
        const xs = await Promise.all(list.map((l) => s.get(`sxl/${b.id}/${l}`, { type: 'json' })));
        const bad = list.filter((l, i) => !xs[i] || xs[i].status !== 'in'); if (bad.length) return err(`Not in the box: ${bad.slice(0, 8).join(', ')}${bad.length > 8 ? '…' : ''}`);
        const at = now(); const id = `${at}-${rid().slice(0, 6)}`; const date = D(body.date);
        const r3 = (v: number) => Math.round(v * 1000) / 1000;
        const iss = { id, boxId: b.id, date, mode, to, ref: T(body.ref, 60), note: T(body.note, 200), labels: list, qty: list.length, wt: r3(xs.reduce((a: number, x: any) => a + x.wt, 0)), net: r3(xs.reduce((a: number, x: any) => a + (x.net || 0), 0)), by: me.id, at,
          items: Object.values(xs.reduce((m: any, x: any) => { const k = `${x.item}|${x.purity}`; (m[k] ||= { item: x.item, purity: x.purity, qty: 0, wt: 0, net: 0 }); m[k].qty++; m[k].wt = r3(m[k].wt + x.wt); m[k].net = r3(m[k].net + (x.net || 0)); return m; }, {})) };
        await Promise.all(xs.map((x: any) => s.setJSON(`sxl/${b.id}/${x.label}`, { ...x, status: 'out', idate: date, iby: me.id, iat: at, issueId: id, mode, to, iref: iss.ref })));
        await s.setJSON(`sxi/${b.id}/${id}`, iss); return J({ ok: true, issue: iss });
      }
      return err('Not found', 404);
    }
    if (path === 'rpsent' && method === 'POST') {   // v1.32: a report was shared (WhatsApp / email / file) — log it; clears the daily report reminder
      need('share'); const t = (v: any, n = 80) => String(v ?? '').slice(0, n); const at = now();
      const rec = { id: `${at}-${rid().slice(0, 6)}`, date: today, at, by: me.id, title: t(body.title, 120), via: t(body.via, 20), to: t(body.to), daily: !!body.daily };
      await s.setJSON(`rps/${today}/${rec.id}`, rec); return J({ ok: true, rec });
    }
    if (path === 'master/rename' && method === 'POST') {   // v1.28: rename a main location / sub display / item type and move locations that use it
      need('setup'); const kind = body.kind; const from = String(body.from || '').trim(), to = String(body.to || '').trim().slice(0, 40);
      if (!from || !to || from === to) return err('Enter the new name');
      const cur = await getSettings(s); const main = String(body.main || '');
      if (kind === 'area') { if (cur.mainLocs.some((m: any) => m.name === to)) return err(`“${to}” already exists`); const m = cur.mainLocs.find((m: any) => m.name === from); if (!m) return err('Not found'); m.name = to; }
      else if (kind === 'sub') { const m = cur.mainLocs.find((m: any) => m.name === main); const x = m?.subs?.find((x: any) => x.name === from); if (!x) return err('Not found'); if (m.subs.some((y: any) => y.name === to)) return err(`“${to}” already exists`); x.name = to; }
      else if (kind === 'item') { if (cur.itemTypes.includes(to)) return err(`“${to}” already exists`); cur.itemTypes = cur.itemTypes.map((x: string) => x === from ? to : x); }
      else return err('Unknown list');
      const data = await s.get('cfg/locs', { type: 'json' }); let n = 0;
      for (const l of data.locs) { if (kind === 'area' && l.area === from) { l.area = to; n++; } if (kind === 'sub' && l.area === main && l.sub === from) { l.sub = to; n++; } if (kind === 'item' && l.itemType === from) { l.itemType = to; n++; } }
      if (kind === 'item' && cur.erpItemMap?.[from]) { cur.erpItemMap[to] = cur.erpItemMap[from]; delete cur.erpItemMap[from]; }
      await s.setJSON('cfg/locs', data); await s.setJSON('cfg/settings', cur);
      return J({ ok: true, moved: n });
    }
    if (path === 'settings' && method === 'POST') {
      need('setup');
      const cur = await getSettings(s); const b = body.settings || {};
      const next: any = { ...cur };
      if (typeof b.shopName === 'string') next.shopName = b.shopName.slice(0, 60);
      if (b.erpBasis === 'lbl' || b.erpBasis === 'pcs') next.erpBasis = b.erpBasis;
      for (const k of ['erpItemMap', 'erpCatMap']) if (b[k] && typeof b[k] === 'object') next[k] = Object.fromEntries(Object.entries(b[k]).slice(0, 60).map(([a, v]: any) => [String(a).trim().slice(0, 30), String(v).trim().slice(0, 60)]).filter(([a]) => a));
      for (const k of ['itemTypes', 'purities', 'categories', 'reasons']) if (Array.isArray(b[k])) next[k] = b[k].map((x: any) => String(x).trim().slice(0, 30)).filter(Boolean);
      if (b.wtTol != null) next.wtTol = Math.max(0, r3(b.wtTol));
      if (b.blind != null) next.blind = !!b.blind;
      if (b.reqPhotos != null) next.reqPhotos = !!b.reqPhotos;
      if (Array.isArray(b.labelCodes)) next.labelCodes = b.labelCodes.slice(0, 60).map((x: any) => ({ item: String(x.item || '').trim().slice(0, 40), code: String(x.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) })).filter((x: any) => x.item && x.code);
      // v1.32 holidays, report recipients, daily report
      if (b.holidays && typeof b.holidays === 'object') next.holidays = { sunday: b.holidays.sunday !== false,
        dates: (Array.isArray(b.holidays.dates) ? b.holidays.dates : []).filter((x: any) => /^\d{4}-\d{2}-\d{2}$/.test(x?.date)).map((x: any) => ({ date: x.date, name: String(x.name || 'Holiday').trim().slice(0, 40) })).sort((a: any, c: any) => a.date.localeCompare(c.date)).slice(-200) };
      if (Array.isArray(b.rpRecipients)) next.rpRecipients = b.rpRecipients.slice(0, 20).map((x: any) => ({ name: String(x.name || '').trim().slice(0, 40), wa: String(x.wa || '').replace(/[^0-9]/g, '').slice(0, 15), email: String(x.email || '').trim().slice(0, 80) })).filter((x: any) => x.name && (x.wa || x.email));
      if (b.rpDaily && typeof b.rpDaily === 'object') next.rpDaily = { on: !!b.rpDaily.on, time: /^\d{2}:\d{2}$/.test(b.rpDaily.time) ? b.rpDaily.time : '20:00', type: String(b.rpDaily.type || 'place').slice(0, 20) };
      if (Array.isArray(b.mainLocs)) { const K = ['counter', 'tray', 'box']; const t = (v: any) => String(v ?? '').trim().slice(0, 40); const seen = new Set();
        const ml = b.mainLocs.map((m: any) => ({ name: t(m.name), kind: K.includes(m.kind) ? m.kind : 'box', subs: (Array.isArray(m.subs) ? m.subs : []).map((x: any) => ({ name: t(x.name), ...(K.includes(x.kind) && x.kind !== m.kind ? { kind: x.kind } : {}) })).filter((x: any, i: number, a: any[]) => x.name && a.findIndex((y: any) => y.name === x.name) === i) }))
          .filter((m: any) => m.name && !seen.has(m.name) && (seen.add(m.name), true));
        if (ml.length) next.mainLocs = ml; }
      for (const k of ['areas', 'subDisplays']) if (Array.isArray(b[k]) && !Array.isArray(b.mainLocs)) next[k] = b[k].map((x: any) => String(x).trim().slice(0, 40)).filter(Boolean);
      if (typeof b.erpPlatinum === 'string' && b.erpPlatinum.trim()) next.erpPlatinum = b.erpPlatinum.trim().slice(0, 60);
      if (typeof b.erpTanih === 'string' && b.erpTanih.trim()) next.erpTanih = b.erpTanih.trim().slice(0, 60);
      if (typeof b.erpSilver === 'string' && b.erpSilver.trim()) next.erpSilver = b.erpSilver.trim().slice(0, 60);
      if (typeof b.waNumber === 'string') next.waNumber = b.waNumber.replace(/[^0-9]/g, '').slice(0, 15);
      // v1.28 jewellery types managed by admin
      const str = (v: any, n = 40) => String(v ?? '').trim().slice(0, n);
      if (b.jtLabels && typeof b.jtLabels === 'object') next.jtLabels = Object.fromEntries(Object.entries(b.jtLabels).map(([k, v]: any) => [str(k, 60), str(v)]).filter(([, v]) => v));
      if (b.jtShort && typeof b.jtShort === 'object') next.jtShort = Object.fromEntries(Object.entries(b.jtShort).map(([k, v]: any) => [str(k, 60), str(v, 20)]).filter(([, v]) => v));
      if (b.itemLabels && typeof b.itemLabels === 'object') next.itemLabels = Object.fromEntries(Object.entries(b.itemLabels).map(([k, v]: any) => [str(k, 30), str(v)]).filter(([k, v]) => k && v));   // v1.54 product display names
      if (Array.isArray(b.jtHidden)) next.jtHidden = b.jtHidden.map((x: any) => str(x, 60)).filter((x: string) => x && x !== 'Plain Gold Jewellery');
      if (Array.isArray(b.teams)) next.teams = b.teams.slice(0, 30).map((t: any, i: number) => ({ id: str(t.id, 20).replace(/[^a-z0-9-]/gi, '') || `t${now()}${i}`, name: str(t.name) || `Team ${i + 1}`,
        members: (Array.isArray(t.members) ? t.members : []).map((x: any) => str(x, 40)).filter((x: string) => users.some((u: any) => u.id === x)),
        scope: (Array.isArray(t.scope) ? t.scope : []).slice(0, 400).map((x: any) => str(x, 140)).filter((x: string) => /^[asgl]\|/.test(x)) }));   // v1.56 counting teams
      if (b.teamStrict != null) next.teamStrict = !!b.teamStrict;
      if (Array.isArray(b.jtOrder)) next.jtOrder = b.jtOrder.map((x: any) => str(x, 60)).filter(Boolean);
      if (Array.isArray(b.jtCustom)) { const used = new Set(['G', 'D', 'P', 'T', 'S']);
        next.jtCustom = b.jtCustom.slice(0, 15).map((c: any) => ({ name: str(c.name, 60), code: str(c.code, 1).toUpperCase(), label: str(c.label || c.name), short: str(c.short || c.label || c.name, 20), metal: ['Gold', 'Platinum', 'Silver'].includes(c.metal) ? c.metal : 'Gold' }))
          .filter((c: any) => c.name && /^[A-Z]$/.test(c.code) && !used.has(c.code) && (used.add(c.code), true) && !['Plain Gold Jewellery', 'Diamond Jewellery', 'Platinum', 'Tanih - CVD Jewellery', 'Silver', 'Mixed'].includes(c.name)); }
      await s.setJSON('cfg/settings', next);
      return J({ ok: true, settings: next });
    }

    // ----- database backup (admin only): list keys, then fetch values in batches -----
    if (path === 'backup/keys') {
      if (me.role !== 'admin') return err('Only admin can back up the database', 403);
      const { blobs } = await s.list();
      const keys = blobs.map((b: any) => b.key).filter((k: string) => k !== 'meta/secret').sort();
      const last = await s.get('meta/lastBackup', { type: 'json' }); const lastRestore = await s.get('meta/lastRestore', { type: 'json' });
      return J({ lastRestore, data: keys.filter((k: string) => !k.startsWith('img/')), images: keys.filter((k: string) => k.startsWith('img/')).map((k: string) => k.slice(4)), last });
    }
    if (path === 'backup/get' && method === 'POST') {
      if (me.role !== 'admin') return err('Only admin can back up the database', 403);
      const keys: string[] = (body.keys || []).filter((k: any) => typeof k === 'string' && k !== 'meta/secret' && !k.startsWith('img/')).slice(0, 400);
      const vals = await Promise.all(keys.map((k) => s.get(k)));
      const out: any = {};
      keys.forEach((k, i) => { const v = vals[i]; if (v == null) return; try { out[k] = { j: JSON.parse(v) }; } catch { out[k] = { t: v }; } });
      return J({ items: out });
    }
    if (path === 'backup/done' && method === 'POST') {
      if (me.role !== 'admin') return err('Only admin can back up the database', 403);
      const rec = { at: now(), by: me.id, byName: me.name, keys: +body.keys || 0, images: +body.images || 0, bytes: +body.bytes || 0, photos: !!body.photos };
      await s.setJSON('meta/lastBackup', rec);
      return J({ ok: true, last: rec });
    }
    // ----- restore from backup (admin only) -----
    // Only these record types can be written by a restore; meta/secret and meta/* are never touched.
    const RESTORABLE = /^(cfg\/(locs|users|settings)|day\/\d{4}-\d{2}-\d{2}|(mv|ct|ss|al)\/\d{4}-\d{2}-\d{2}\/[\w@#.\/-]+|erp\/\d{4}-\d{2}-\d{2}|seen\/[\w-]+|cash\/\d{4}-\d{2}-\d{2}\/[\w-]+|doc\/[\w-]+|sx\/boxes|sx[elid]\/[\w-]+\/[\w.@#-]+|rv\/\d{4}-\d{2}\/[\w-]+|rps\/\d{4}-\d{2}-\d{2}\/[\w-]+|coin\/(log|set))$/;
    if (path.startsWith('restore/') && me.role !== 'admin') return err('Only admin can restore the database', 403);
    if (path === 'restore/put' && method === 'POST') {
      const items = body.items || {}; let n = 0; const skipped: string[] = [];
      for (const [k, v] of Object.entries(items) as any) {
        if (!RESTORABLE.test(k) || !v || (v.j === undefined && typeof v.t !== 'string')) { skipped.push(k); continue; }
        if (v.j !== undefined) await s.setJSON(k, v.j); else await s.set(k, v.t);
        n++;
      }
      return J({ ok: true, written: n, skipped });
    }
    if (path === 'restore/img' && method === 'POST') {
      const key = String(body.key || '').replace(/[^a-z0-9-]/gi, '');
      const m = /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,(.+)$/.exec(body.dataUrl || '');
      if (!key || !m) return err('Bad photo');
      if (body.onlyIfNew && (await s.getWithMetadata(`img/${key}`, { type: 'arrayBuffer' }))) return J({ ok: true, kept: true });
      await s.set(`img/${key}`, Buffer.from(m[2], 'base64'), { metadata: { type: m[1], by: me.id, at: now(), restored: true, ...(body.doc ? { doc: true } : {}) } });
      return J({ ok: true });
    }
    if (path === 'restore/delete' && method === 'POST') {
      // Replace mode: remove data records that are not in the backup (photos are kept).
      const keys: string[] = (body.keys || []).filter((k: any) => typeof k === 'string' && RESTORABLE.test(k)).slice(0, 400);
      await Promise.all(keys.map((k) => s.delete(k)));
      return J({ ok: true, deleted: keys.length });
    }
    if (path === 'restore/done' && method === 'POST') {
      const rec = { at: now(), by: me.id, byName: me.name, mode: body.mode === 'merge' ? 'merge' : 'replace', file: String(body.file || '').slice(0, 120), exportedAt: String(body.exportedAt || '').slice(0, 40), written: +body.written || 0, deleted: +body.deleted || 0, photos: +body.photos || 0 };
      await s.setJSON('meta/lastRestore', rec);
      await addAlert(s, { type: 'restore', title: `Database restored from backup (${rec.mode})`, body: `${me.name} restored ${rec.written} records${rec.deleted ? `, removed ${rec.deleted}` : ''}${rec.photos ? `, ${rec.photos} photos` : ''} from ${rec.file || 'a backup file'}${rec.exportedAt ? ` taken ${rec.exportedAt.slice(0, 16).replace('T', ' ')}` : ''}.`, by: me.id });
      return J({ ok: true, last: rec });
    }
    // ----- v1.17 cash closing (shared register) -----
    if (path === 'cash' && method === 'GET') {
      if (!can('cash') && !can('cashVerify') && !can('reports')) need('cash');
      const to = url.searchParams.get('to') || today; const from = url.searchParams.get('from') || istDate(new Date(Date.now() - 62 * 864e5));
      const { blobs } = await s.list({ prefix: 'cash/' });
      const keys = blobs.map((b: any) => b.key).filter((k: string) => { const d = k.split('/')[1]; return d >= from && d <= to; });
      const recs = (await Promise.all(keys.map((k: string) => s.get(k, { type: 'json' })))).filter(Boolean).sort((a: any, b: any) => (b.date + b.updatedAt).localeCompare(a.date + a.updatedAt));
      const oc = url.searchParams.get('openFor'); const od = url.searchParams.get('openDate') || today;
      const opening = oc ? await cashOpening(s, od, oc) : undefined;
      return J({ opening, records: recs, from, to, today, users: users.filter((u) => u.active !== false).map((u) => ({ id: u.id, name: u.name, role: u.role, verify: u.role === 'admin' || (u.perms || []).includes('cashVerify') })) });
    }
    if (path === 'cash/save' && method === 'POST') {
      if (!can('cash') && !can('cashVerify')) need('cash');
      const R = body.rec || {}; const final = !!body.final;
      const date = String(R.date || today).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return err('Choose a valid date (not in the future)');
      const counter = String(R.counter || '').trim().slice(0, 40); const shift = R.shift === 'Morning' ? 'Morning' : 'Evening';
      if (!counter) return err('Select the counter');
      const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const id = `${date}_${slug(counter)}_${slug(shift)}`; const key = `cash/${date}/${slug(counter)}_${slug(shift)}`;
      const old = await s.get(key, { type: 'json' });
      if (old?.state === 'closed') return err(`This chit was already closed by ${old.verifiedByName}. Ask admin to reopen it.`, 409);
      const denoms = CASH_DENOMS.map((d) => { const x = (R.denoms || []).find((y: any) => +y.note === d) || {}; return { note: d, bundles: Math.max(0, Math.floor(+x.bundles || 0)), loose: Math.max(0, Math.floor(+x.loose || 0)) }; });
      const rec: any = { id, date, counter, shift, chit: String(R.chit || '').trim().slice(0, 30), denoms, coins: Math.max(0, +R.coins || 0), acme: R.acme === '' || R.acme == null ? '' : +R.acme, remarks: String(R.remarks || '').trim().slice(0, 600),
        countedBy: old?.countedBy || me.id, countedByName: old?.countedByName || me.name, createdAt: old?.createdAt || now(), updatedAt: now(), updatedBy: me.id, state: 'draft', log: [...(old?.log || []), { at: now(), by: me.id, name: me.name, act: final ? 'close' : 'save' }].slice(-30) };
      // the counter is whoever entered it first; a different staff member can be named as counter
      if (R.countedBy && users.find((u) => u.id === R.countedBy)) { rec.countedBy = R.countedBy; rec.countedByName = users.find((u) => u.id === R.countedBy).name; }
      if (shift === 'Morning') { rec.acme = ''; rec.opening = await cashOpening(s, date, counter); }   // carried forward from the previous evening closing
      Object.assign(rec, cashCalc(rec));
      if (final) {
        if (!can('cashVerify')) return err('Only a manager or admin can verify and close cash', 403);
        if (shift === 'Evening' && rec.acme === '') return err('Enter the ACME closing balance');
        if (rec.countedBy === me.id) return err('The verifier must be a different person from the one who counted the cash', 409);
        if (rec.variance && !rec.remarks) return err('Explain the cash variance in remarks');
        Object.assign(rec, { state: 'closed', verifiedBy: me.id, verifiedByName: me.name, closedAt: now() });
        if (rec.variance) await addAlert(s, { type: 'variance', title: `Cash ${rec.result} · ${counter} · ${shift}`, body: `${date} ${shift}: counted ₹${rec.gt.toLocaleString('en-IN')} vs ${shift === 'Morning' ? `carried-forward opening ₹${(+rec.expected).toLocaleString('en-IN')} (closing of ${rec.opening?.date})` : `ACME ₹${(+rec.acme).toLocaleString('en-IN')}`} → ${rec.variance > 0 ? '+' : ''}₹${rec.variance.toLocaleString('en-IN')}. ${rec.remarks}`, by: me.id });
        else await addAlert(s, { type: 'report', ok: true, title: `Cash ${rec.result === 'nobase' ? 'opening recorded' : 'tallied'} · ${counter} · ${shift}`, body: `${date} ${shift}: ₹${rec.gt.toLocaleString('en-IN')} counted by ${rec.countedByName}, verified by ${me.name}.`, by: me.id });
      }
      await s.setJSON(key, rec);
      return J({ ok: true, rec });
    }
    if (path === 'cash/reopen' && method === 'POST') {
      if (me.role !== 'admin') return err('Only admin can reopen a closed cash chit', 403);
      const date = String(body.date || ''); const id = String(body.id || '');
      const key = `cash/${date}/${id.split('_').slice(1).join('_')}`; const rec = await s.get(key, { type: 'json' });
      if (!rec) return err('Not found', 404);
      if (!String(body.reason || '').trim()) return err('Give a reason to reopen');
      rec.state = 'draft'; rec.log = [...(rec.log || []), { at: now(), by: me.id, name: me.name, act: 'reopen', reason: String(body.reason).slice(0, 200) }]; delete rec.verifiedBy; delete rec.verifiedByName; delete rec.closedAt;
      await s.setJSON(key, rec);
      await addAlert(s, { type: 'info', title: `Cash chit reopened · ${rec.counter}`, body: `${me.name} reopened ${rec.date} ${rec.shift}. Reason: ${body.reason}`, by: me.id });
      return J({ ok: true, rec });
    }
    // ----- v1.19 business documents (licences, GST, bank accounts, UPI QR) -----
    if (path === 'docs' && method === 'GET') {
      if (!can('docs') && !can('docsEdit')) need('docs');
      const { blobs } = await s.list({ prefix: 'doc/' });
      const docs = (await Promise.all(blobs.map((b: any) => s.get(b.key, { type: 'json' })))).filter((d: any) => d && !d.deleted).sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999) || String(a.title).localeCompare(String(b.title)));
      return J({ docs, canEdit: can('docsEdit') });
    }
    if (path === 'docs/save' && method === 'POST') {
      need('docsEdit');
      const D = body.doc || {}; const id = D.id && /^[\w-]{6,40}$/.test(D.id) ? D.id : 'd' + now().toString(36) + rid();
      const old = await s.get(`doc/${id}`, { type: 'json' });
      const str = (v: any, n = 120) => String(v ?? '').trim().slice(0, n);
      const doc: any = { id, type: str(D.type, 40) || 'Other', title: str(D.title, 80), number: str(D.number, 60), vehicle: str(D.vehicle, 20).toUpperCase().replace(/\s+/g, ' '), vehicleName: str(D.vehicleName, 60), remind: Math.max(1, Math.min(365, +D.remind || 30)), remindOff: !!D.remindOff, issuedBy: str(D.issuedBy, 80), issueDate: str(D.issueDate, 10), expiry: str(D.expiry, 10), notes: str(D.notes, 1000),
        bank: D.bank ? { holder: str(D.bank.holder, 80), bank: str(D.bank.bank, 60), account: str(D.bank.account, 30), ifsc: str(D.bank.ifsc, 15).toUpperCase(), branch: str(D.bank.branch, 80), kind: str(D.bank.kind, 30) } : null,
        upi: D.upi ? { id: str(D.upi.id, 80), name: str(D.upi.name, 80), gen: !!D.upi.gen } : null,
        place: D.place ? { name: str(D.place.name, 80), address: str(D.place.address, 300), mapUrl: /^https?:\/\//i.test(str(D.place.mapUrl, 500)) ? str(D.place.mapUrl, 500) : '', lat: Number.isFinite(+D.place.lat) && D.place.lat !== '' ? +(+D.place.lat).toFixed(6) : null, lng: Number.isFinite(+D.place.lng) && D.place.lng !== '' ? +(+D.place.lng).toFixed(6) : null, phone: str(D.place.phone, 40), hours: str(D.place.hours, 120), landmark: str(D.place.landmark, 120), reviewUrl: /^https?:\/\//i.test(str(D.place.reviewUrl, 300)) ? str(D.place.reviewUrl, 300) : '' } : null,
        files: (Array.isArray(D.files) ? D.files : []).slice(0, 12).map((f: any) => ({ key: String(f.key || '').replace(/[^a-z0-9-]/gi, ''), mime: str(f.mime, 40), label: str(f.label, 60) })).filter((f: any) => f.key),
        order: D.order ?? old?.order, createdAt: old?.createdAt || now(), createdBy: old?.createdBy || me.id, updatedAt: now(), updatedBy: me.id, updatedByName: me.name };
      if (!doc.title) doc.title = doc.vehicle ? `${doc.type.replace('Vehicle ', '')} · ${doc.vehicle}` : doc.type;
      await s.setJSON(`doc/${id}`, doc);
      return J({ ok: true, doc });
    }
    if (path === 'docs/remind-now' && method === 'POST') { if (me.role !== 'admin') return err('Admin only', 403); return J(await runDocReminders(s, { force: true })); }
    if (path === 'docs/delete' && method === 'POST') {
      need('docsEdit');
      const id = String(body.id || ''); const d = await s.get(`doc/${id}`, { type: 'json' }); if (!d) return err('Not found', 404);
      await s.delete(`doc/${id}`); for (const f of d.files || []) await s.delete(`img/${f.key}`);
      await addAlert(s, { type: 'info', title: `Document deleted · ${d.title}`, body: `${me.name} deleted ${d.type} “${d.title}”.`, by: me.id });
      return J({ ok: true });
    }
    // ----- v1.49 gold coin prices: Bhima Ernakulam benchmark → our price (same module as Price Check) -----
    if (path === 'coins' && method === 'GET') {
      if (!can('coins') && !can('coinSet')) need('coins');
      return J({ log: (await s.get('coin/log', { type: 'json' })) || [], set: (await s.get('coin/set', { type: 'json' })) || null });
    }
    if (path === 'coins/save' && method === 'POST') {
      need('coins');
      const E = body.entry || {}, n = (v: any, lo = 0, hi = 1e7) => { const x = Number(v); return Number.isFinite(x) && x > lo && x < hi ? Math.round(x * 100) / 100 : 0; };
      const W = ['1', '2', '4', '8'], p: any = {}, o: any = {};
      for (const w of W) { if (n(E.p?.[w])) p[w] = n(E.p[w]); if (n(E.o?.[w])) o[w] = n(E.o[w]); }
      if (!Object.keys(p).length) return err('Enter Bhima prices first');
      const entry = { id: 'c' + now().toString(36) + rid().slice(0, 4), at: now(), by: me.name, byId: me.id, br: n(E.br, 0, 1e6), r22: n(E.r22, 0, 1e6), mtype: ['pct', 'g', 'coin'].includes(E.mtype) ? E.mtype : 'pct', margin: Math.max(-100000, Math.min(100000, Number(E.margin) || 0)), round: [1, 5, 10, 50, 100].includes(+E.round) ? +E.round : 50, mode: E.mode === 'near' ? 'near' : 'up', gst: Math.max(0, Math.min(28, Number(E.gst) || 3)), p, o };
      const log = ((await s.get('coin/log', { type: 'json' })) as any[]) || [];
      const next = [entry, ...log].slice(0, 1000); await s.setJSON('coin/log', next);
      return J({ ok: true, entry, log: next });
    }
    if (path === 'coins/del' && method === 'POST') {
      need('coinSet');
      const log = ((await s.get('coin/log', { type: 'json' })) as any[]) || [];
      const next = log.filter((e: any) => e.id !== String(body.id || '')); await s.setJSON('coin/log', next);
      return J({ ok: true, log: next });
    }
    if (path === 'coins/set' && method === 'POST') {
      need('coinSet');
      const X = body.set || {};
      const set = { mtype: ['pct', 'g', 'coin'].includes(X.mtype) ? X.mtype : 'pct', margin: X.mtype === 'g' || X.mtype === 'coin' ? Math.max(-100000, Math.min(100000, Math.round(Number(X.margin) || 0))) : Math.max(-50, Math.min(100, Number(X.margin) || 0)), round: [1, 5, 10, 50, 100].includes(+X.round) ? +X.round : 50, mode: X.mode === 'near' ? 'near' : 'up',
        disc: (Array.isArray(X.disc) ? X.disc : []).map((t: any) => String(t || '').trim().slice(0, 140)).filter(Boolean).slice(0, 10), by: me.name, at: now() };
      await s.setJSON('coin/set', set);
      return J({ ok: true, set });
    }
    if (path === 'users') { need('users'); return J({ users: users.map(pubUser), perms: PERMS, roles: ROLE_PERMS }); }
    if (path === 'users/save' && method === 'POST') {
      need('users');
      const data = await s.get('cfg/users', { type: 'json' });
      const U = body.user || {};
      let u = data.users.find((x: any) => x.id === U.id);
      if (!u) {
        const id = String(U.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'user';
        let nid = id, i = 2; while (data.users.find((x: any) => x.id === nid)) nid = id + i++;
        if (!/^\d{4,6}$/.test(String(body.pin || ''))) return err('Set a 4–6 digit PIN');
        u = { id: nid, salt: rid() }; data.users.push(u);
      }
      if (u.id === 'admin' && (U.role && U.role !== 'admin' || U.active === false)) return err('The main admin cannot be demoted or disabled');
      if (U.name) u.name = String(U.name).slice(0, 40);
      if (U.role && ROLE_PERMS[U.role as keyof typeof ROLE_PERMS]) u.role = U.role;
      if (Array.isArray(U.perms)) u.perms = U.perms.filter((x: string) => x in PERMS);
      else if (!u.perms) u.perms = ROLE_PERMS[u.role as keyof typeof ROLE_PERMS];
      if (U.active != null) u.active = !!U.active;
      if (typeof U.phone === 'string') u.phone = U.phone.replace(/[^0-9]/g, '').slice(0, 15);
      if (body.pin) { if (!/^\d{4,6}$/.test(String(body.pin))) return err('PIN must be 4–6 digits'); u.salt = rid(); u.pinHash = hashPin(body.pin, u.salt); }
      await s.setJSON('cfg/users', data);
      return J({ ok: true, user: pubUser(u) });
    }
    if (path === 'me/pin' && method === 'POST') {
      if (hashPin(body.old, me.salt) !== me.pinHash) return err('Current PIN is wrong');
      if (!/^\d{4,6}$/.test(String(body.pin || ''))) return err('PIN must be 4–6 digits');
      const data = await s.get('cfg/users', { type: 'json' });
      const u = data.users.find((x: any) => x.id === me.id); u.salt = rid(); u.pinHash = hashPin(body.pin, u.salt);
      await s.setJSON('cfg/users', data);
      return J({ ok: true });
    }

    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message || 'Server error', e.status || 500);
  }
};
