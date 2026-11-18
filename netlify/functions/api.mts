import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import { buildSeed } from '../lib/seed.mjs';
import {
  DEFAULT_SETTINGS, ROLE_PERMS, PERMS, SECTIONS, summarize, closingVerified, computeExpected, erpCompare,
  latestCounts, locStatus, sumLines, istDate, r3,
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
async function getUsers(s: any) {
  let u = await s.get('cfg/users', { type: 'json' });
  if (!u) {
    const salt = rid();
    u = { users: [{ id: 'admin', name: 'Admin', role: 'admin', perms: ROLE_PERMS.admin, salt, pinHash: hashPin(process.env.ADMIN_PIN || '1986', salt), active: true }] };
    await s.setJSON('cfg/users', u, { onlyIfNew: true });
    u = await s.get('cfg/users', { type: 'json' });
  }
  return u.users as any[];
}
const pubUser = (u: any) => ({ id: u.id, name: u.name, role: u.role, perms: u.perms, active: u.active !== false, phone: u.phone || '' });
async function getSettings(s: any) { return { ...DEFAULT_SETTINGS, ...((await s.get('cfg/settings', { type: 'json' })) || {}) }; }
async function getLocs(s: any) {
  let l = await s.get('cfg/locs', { type: 'json' });
  if (!l) {
    const seed = buildSeed();
    const today = istDate();
    await s.setJSON(`day/${today}`, { date: today, opening: seed.opening, status: 'open', createdAt: now(), seeded: true }, { onlyIfNew: true });
    await s.setJSON('cfg/locs', { locs: seed.locs }, { onlyIfNew: true });
    l = await s.get('cfg/locs', { type: 'json' });
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
async function loadDay(s: any, date: string) {
  const [day, mvs, counts] = await Promise.all([
    s.get(`day/${date}`, { type: 'json' }), listJSON(s, `mv/${date}/`), listJSON(s, `ct/${date}/`),
  ]);
  mvs.sort((a: any, b: any) => a.at - b.at);
  return { day, mvs, counts };
}
function daySummaryLine(locs: any[], day: any, mvs: any[], counts: any[], settings: any) {
  const sm = summarize(locs, day.opening, mvs, counts, settings);
  return { opening: sm.total.opening, closing: sm.total.expected, in: sm.total.in, out: sm.total.out, checked: sm.total.locs - sm.total.pending, locs: sm.total.locs, variances: sm.total.var + sm.total.stale, sec: Object.fromEntries(Object.entries(sm.sec).map(([k, v]: any) => [k, { opening: v.opening, closing: v.expected, var: v.var + v.stale, checked: v.locs - v.pending, locs: v.locs, wt: v.wtExpected }])) };
}
async function closeDay(s: any, date: string, by: string, auto = false) {
  const locs = await getLocs(s); const settings = await getSettings(s);
  const { day, mvs, counts } = await loadDay(s, date);
  if (!day || day.status === 'closed') return day;
  day.closing = closingVerified(locs, day.opening, mvs, counts, settings);
  day.summary = daySummaryLine(locs, day, mvs, counts, settings);
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
      return new Response(e.data as ArrayBuffer, { headers: { 'content-type': (e.metadata as any)?.type || 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' } });
    }

    if (path === 'state') {
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
      return J({ today, date, day: d.day, mvs: d.mvs, counts: d.counts, sessions, erp, locs, settings, me: pubUser(me), alerts, days, userNames: Object.fromEntries(users.map((u) => [u.id, u.name])) });
    }

    // helpers needing an open day
    const openDay = async (date: string) => {
      if (date !== today) throw Object.assign(new Error('Only today can be changed'), { status: 400 });
      const day = await ensureToday(s);
      if (day.status === 'closed') throw Object.assign(new Error('Today is closed. Ask admin to reopen.'), { status: 400 });
      return day;
    };

    if (path === 'count' && method === 'POST') {
      need('count');
      await openDay(body.date);
      const locs = await getLocs(s); const settings = await getSettings(s);
      const loc = locs.find((l) => l.id === body.locId); if (!loc) return err('Unknown location');
      const { day, mvs, counts } = await loadDay(s, today);
      const exp = computeExpected(day.opening, mvs)[loc.id] || { lines: {}, wt: 0 };
      const prev = latestCounts(counts)[loc.id];
      if (prev && !can('accept')) {
        const pst = locStatus(exp, prev, mvs, loc.id, settings);
        if (pst.state !== 'stale' && !prev.recountAllowed) return err(`Already verified by ${users.find((u) => u.id === prev.by)?.name || prev.by}. Changes need a manager correction.`, 409);
      }
      const mode = loc.sec === 'box' ? (body.mode || 'both') : 'count';
      const lines: any = {}; for (const [t, n] of Object.entries(body.lines || {})) if (+(n as any) > 0) lines[t] = Math.round(+(n as any));
      const rec: any = { id: `${now()}-${rid()}`, date: today, locId: loc.id, sec: loc.sec, mode, lines: mode === 'weight' ? null : lines, wt: mode === 'count' ? null : r3(body.wt), note: String(body.note || '').slice(0, 300), by: me.id, at: now(), expected: exp, sessionId: String(body.sessionId || '').slice(0, 40), reasons: {} as any };
      for (const [t, r] of Object.entries(body.reasons || {})) rec.reasons[String(t).slice(0, 30)] = String(r).slice(0, 80);
      const st = locStatus(exp, rec, [], loc.id, settings);
      rec.result = st.state; rec.diff = st.diff; rec.wtDiff = st.wtDiff;
      await s.setJSON(`ct/${today}/${loc.id}/${rec.id}`, rec);
      if (st.state === 'var') {
        const parts = Object.entries(st.diff).map(([t, d]: any) => `${t} ${d > 0 ? '+' : ''}${d}${rec.reasons[t] ? ` (${rec.reasons[t]})` : ''}`);
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
      const existing = (await listJSON(s, `ss/${today}/`)).find((x: any) => x.by === me.id && x.scope === scope && x.status === 'active');
      if (existing) return J({ session: existing, resumed: true });
      const rec = { id: `${now()}-${rid()}`, date: today, scope, by: me.id, at: now(), status: 'active' };
      await s.setJSON(`ss/${today}/${rec.id}`, rec);
      return J({ session: rec });
    }
    if (path === 'session/finish' && method === 'POST') {
      need('count');
      const key = `ss/${today}/${String(body.id).replace(/[^a-z0-9-]/gi, '')}`;
      const ses: any = await s.get(key, { type: 'json' }); if (!ses) return err('Session not found');
      const locs = await getLocs(s); const settings = await getSettings(s);
      const { day, mvs, counts } = await loadDay(s, today);
      const sm = summarize(locs, day.opening, mvs, counts, settings);
      const inScope = locs.filter((l) => l.active !== false && (ses.scope === 'all' || l.sec === ses.scope));
      let exp = 0, act = 0, short = 0, excess = 0, pend = 0, done = 0, wtVar = 0;
      const lines: string[] = [];
      for (const l of inScope) {
        const st = sm.status[l.id]; const c = sm.last[l.id];
        if (st.state === 'pending') continue; done++;
        if (c.mode !== 'weight') { exp += Object.values(sm.exp[l.id]?.lines || {}).reduce((a: number, b: any) => a + b, 0); act += Object.values(c.lines || {}).reduce((a: number, b: any) => a + b, 0); }
        for (const d of Object.values(st.diff) as number[]) { if (d < 0) short -= d; else excess += d; }
        if (st.state === 'var' || st.state === 'stale') { pend++; if (Math.abs(st.wtDiff) > settings.wtTol) wtVar++; lines.push(`${l.name}: ${Object.entries(st.diff).map(([t, d]: any) => `${t} ${d > 0 ? '+' : ''}${d}`).join(', ') || `weight ${st.wtDiff > 0 ? '+' : ''}${st.wtDiff} g`}`); }
      }
      ses.summary = { locs: inScope.length, done, expected: exp, actual: act, short, excess, pending: pend, wtVar };
      ses.status = done >= inScope.length ? 'done' : 'active'; ses.finishedAt = now();
      await s.setJSON(key, ses);
      const label = ses.scope === 'all' ? 'Full stock count' : SECTIONS.find((x) => x.key === ses.scope)?.label + ' count';
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
        const loc = { id: 'B' + now().toString(36) + rid().slice(0, 3), sec: 'box', group: 'Loose stock (weight only)', name: nice, erpName: x.name, purity, cat: 'Gold', itemType: /finding/i.test(x.name) ? 'Findings' : '', mode: 'weight', images: [], active: true, order: data.locs.length + 1, note: 'Added from ERP (weight only, no count)' };
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

    if (path === 'move' && method === 'POST') {
      need(body.kind === 'set' ? 'setup' : 'move');
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
        legs = [{ locId: body.locId, lines: neg(lines), wt: -wt }, { locId: body.toLocId, lines, wt: r3(body.toWt ?? wt) }];
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
      const mv = { id: `${now()}-${rid()}`, date: today, kind: body.kind, reason: String(body.reason || '').slice(0, 60), ref: String(body.ref || '').slice(0, 60), note: String(body.note || '').slice(0, 300), legs, by: me.id, at: now(), ...(body.kind === 'accept' ? { countId: body.countId } : {}) };
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
      const fields = ['sec', 'group', 'name', 'purity', 'cat', 'itemType', 'boxNo', 'insert', 'qty', 'mode', 'images', 'note', 'order', 'erpName'];
      let loc = data.locs.find((l: any) => l.id === L.id);
      if (L.active === false && loc) {
        const day = await ensureToday(s); const { mvs } = await loadDay(s, today);
        const e = computeExpected(day.opening, mvs)[loc.id];
        if (e && (sumLines(e.lines) || e.wt)) return err('Move or set this location to zero before removing it');
        loc.active = false;
      } else if (loc) { for (const f of fields) if (f in L) loc[f] = L[f]; loc.active = true; }
      else {
        if (!SECTIONS.find((x) => x.key === L.sec) || !L.name) return err('Section and name are required');
        loc = { id: (L.sec === 'counter' ? 'C' : L.sec === 'tray' ? 'T' : 'B') + now().toString(36), active: true, images: [] };
        for (const f of fields) if (f in L) loc[f] = L[f];
        loc.order = loc.order ?? data.locs.length + 1;
        data.locs.push(loc);
      }
      await s.setJSON('cfg/locs', data);
      return J({ ok: true, loc });
    }

    if (path === 'img' && method === 'POST') {
      need('setup');
      const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(body.dataUrl || '');
      if (!m) return err('Bad image');
      const buf = Buffer.from(m[2], 'base64'); if (buf.length > 1_500_000) return err('Image too large');
      const key = crypto.randomUUID();
      await s.set(`img/${key}`, buf, { metadata: { type: m[1], by: me.id, at: now() } });
      return J({ key });
    }

    if (path === 'close' && method === 'POST') {
      need('close');
      if (body.date !== today) return err('Only today can be closed');
      {
        const locs = await getLocs(s); const settings = await getSettings(s); const d = await loadDay(s, today);
        const erp = await s.get(`erp/${today}`, { type: 'json' });
        const ec = erpCmp(erp, locs, d.day, d.mvs, d.counts, settings);
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
      if (typeof b.waNumber === 'string') next.waNumber = b.waNumber.replace(/[^0-9]/g, '').slice(0, 15);
      await s.setJSON('cfg/settings', next);
      return J({ ok: true, settings: next });
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
