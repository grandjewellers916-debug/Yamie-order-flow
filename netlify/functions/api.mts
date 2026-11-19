// Yamie Repair Desk — shared database for all phones (APK and web).
// Netlify Blobs store "yamie-repair" (strong consistency):
//   jobs/<YR-id>         one repair job (photos stored separately as img/<key>)
//   img/<key>            photo bytes
//   seq/<YR|YS>/<n>      voucher numbers, created once (onlyIfNew) so two phones never get the same number
//   chg/<day>/<ts>-<r>   change log used by phones to pull only what changed
//   cfg/users|smiths|settings|roleperms, meta/cfgv, meta/secret, lock/<uid>
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

export const config = { path: '/api/*' };

const PERM_KEYS = ['intake', 'issue', 'receive', 'qc', 'inform', 'delay', 'price', 'close', 'reports', 'smiths', 'delete', 'settings'];
const DEF_ROLE_PERMS: Record<string, string[]> = {
  manager: ['intake', 'issue', 'receive', 'qc', 'inform', 'delay', 'price', 'close', 'reports', 'smiths', 'delete'],
  staff: ['intake', 'issue', 'receive', 'inform'],
};
const DEF_SETTINGS = { shop: 'Yamie Fine Jewellery', shopPhone: '+91 87141 22750', shopAddr: 'Grand Business Center, K K Road, Kadavanthra, Kochi', margin: 150, issueDays: 2, informDays: 1, pickupDays: 7, delayDays: 7, tol: 0.05, autoMsg: true };

// The Android app runs from its own local origin, so the API answers cross-origin calls.
// Access is guarded by user PIN logins and signed session tokens, not by origin.
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-max-age': '86400' };
const J = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });
const err = (msg: string, status = 400, extra: any = {}) => J({ error: msg, ...extra }, status);
const store = () => getStore({ name: 'yamie-repair', consistency: 'strong' });
const rid = () => crypto.randomBytes(5).toString('hex');
const now = () => Date.now();
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
class HttpError extends Error { status: number; extra: any; constructor(m: string, s: number, extra: any = {}) { super(m); this.status = s; this.extra = extra; } }

// ---------- auth ----------
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
async function getCfg(s: any) {
  const [users, smiths, settings, rp, cfgv] = await Promise.all([
    getUsers(s), s.get('cfg/smiths', { type: 'json' }), s.get('cfg/settings', { type: 'json' }), s.get('cfg/roleperms', { type: 'json' }), s.get('meta/cfgv'),
  ]);
  return { users: users.map(pubUser), smiths: smiths || [], settings: { ...DEF_SETTINGS, ...(settings || {}) }, rolePerms: rp || DEF_ROLE_PERMS, cfgv: cfgv || '0' };
}
const bumpCfg = (s: any) => s.set('meta/cfgv', String(now()) + rid());

// ---------- voucher numbers ----------
async function nextNo(s: any, p: 'YR' | 'YS') {
  let n = +((await s.get(`seqhint/${p}`)) || 0);
  for (let i = 0; i < 500; i++) {
    n++;
    const r = await s.setJSON(`seq/${p}/${n}`, { at: now() }, { onlyIfNew: true });
    if (r?.modified !== false) { await s.set(`seqhint/${p}`, String(n)); return `${p}-${String(n).padStart(6, '0')}`; }
  }
  throw new HttpError('Could not allocate a voucher number', 500);
}
async function claimNo(s: any, id: string) {
  const m = /^(YR|YS)-(\d+)$/.exec(id || '');
  if (!m) return;
  const n = +m[2];
  await s.setJSON(`seq/${m[1]}/${n}`, { at: now(), imported: true }, { onlyIfNew: true });
  const hint = +((await s.get(`seqhint/${m[1]}`)) || 0);
  if (n > hint) await s.set(`seqhint/${m[1]}`, String(n));
}

// ---------- jobs ----------
async function logChange(s: any, id: string, del = false) {
  const t = now();
  await s.setJSON(`chg/${day(t)}/${String(t).padStart(13, '0')}-${rid()}`, { id, del, t });
}
async function allJobs(s: any) {
  const { blobs } = await s.list({ prefix: 'jobs/' });
  const out = await Promise.all(blobs.map((b: any) => s.get(b.key, { type: 'json' })));
  return out.filter(Boolean);
}
async function changesSince(s: any, since: number) {
  const ids = new Map<string, boolean>();
  const from = since - 10000; // overlap so writes landing during the last pull are not missed
  for (let t = Date.parse(day(from)); t <= now(); t += 864e5) {
    const { blobs } = await s.list({ prefix: `chg/${day(t)}/` });
    for (const b of blobs) {
      const ts = +b.key.split('/')[2].split('-')[0];
      if (ts >= from) ids.set(b.key, true);
    }
  }
  const recs = await Promise.all([...ids.keys()].map((k) => s.get(k, { type: 'json' })));
  const touched = [...new Set(recs.filter(Boolean).map((r: any) => r.id))];
  const jobs: any[] = []; const deleted: string[] = [];
  await Promise.all(touched.map(async (id) => { const j = await s.get(`jobs/${id}`, { type: 'json' }); if (j) jobs.push(j); else deleted.push(id); }));
  return { jobs, deleted };
}
function cleanJob(j: any) {
  // photos must already be uploaded (img:<key>); data URLs are refused to keep job records small
  for (const [k, v] of Object.entries(j.photos || {})) if (typeof v === 'string' && v.startsWith('data:')) throw new HttpError(`Photo "${k}" was not uploaded`, 400);
  return j;
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
    // ----- public -----
    if (path === 'ping') return J({ ok: true, now: now() });
    if (path === 'login-list') {
      const users = await getUsers(s);
      const settings = { ...DEF_SETTINGS, ...((await s.get('cfg/settings', { type: 'json' })) || {}) };
      const setup = users.length === 1 && users[0].id === 'admin' && users[0].mustChange;
      return J({ users: users.filter((u) => u.active !== false).map((u) => ({ id: u.id, name: u.name, role: u.role })), shop: settings.shop, setup });
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

    if (path === 'state') {
      const [jobs, cfg] = await Promise.all([allJobs(s), getCfg(s)]);
      return J({ now: now(), jobs, ...cfg, me: pubUser(me) });
    }
    if (path === 'changes') {
      const since = +(url.searchParams.get('since') || 0);
      const t = now();
      const ch = await changesSince(s, since);
      const cfgv = (await s.get('meta/cfgv')) || '0';
      const out: any = { now: t, ...ch, cfgv, me: pubUser(me) };
      if (cfgv !== url.searchParams.get('cfgv')) Object.assign(out, await getCfg(s));
      return J(out);
    }

    if (path === 'job' && method === 'POST') {
      const job = cleanJob({ ...(body.job || {}) });
      if (body.create) {
        need('intake');
        job.id = await nextNo(s, 'YR');
        job.rev = 1; job.updatedAt = now(); job.updatedBy = me.name;
        await s.setJSON(`jobs/${job.id}`, job, { onlyIfNew: true });
        await logChange(s, job.id);
        return J({ job });
      }
      if (!job.id) return err('Missing job id');
      const cur = await s.getWithMetadata(`jobs/${job.id}`, { type: 'json' });
      if (cur === null) {
        if (!body.import) return err('This repair was deleted on another phone', 404, { deleted: true });
        admin();
        await claimNo(s, job.id);
        if (job.issue?.no) await claimNo(s, job.issue.no);
        job.rev = 1; job.updatedAt = now(); job.updatedBy = me.name;
        await s.setJSON(`jobs/${job.id}`, job, { onlyIfNew: true });
        await logChange(s, job.id);
        return J({ job });
      }
      const old: any = cur.data;
      if ((old.rev || 0) !== (body.baseRev || 0)) return err('This repair was changed on another phone', 409, { job: old });
      if (job.issue && !job.issue.no) job.issue.no = await nextNo(s, 'YS');
      job.rev = (old.rev || 0) + 1; job.updatedAt = now(); job.updatedBy = me.name;
      const r = await s.setJSON(`jobs/${job.id}`, job, { onlyIfMatch: cur.etag });
      if (r?.modified === false) return err('This repair was changed on another phone', 409, { job: await s.get(`jobs/${job.id}`, { type: 'json' }) });
      await logChange(s, job.id);
      return J({ job });
    }
    if (path === 'job-delete' && method === 'POST') {
      need('delete');
      await s.delete(`jobs/${body.id}`);
      await logChange(s, body.id, true);
      return J({ ok: true });
    }

    if (path === 'smiths' && method === 'POST') {
      if (!can('smiths') && !can('issue')) throw new HttpError('Your role does not have permission for this', 403);
      await s.setJSON('cfg/smiths', (body.smiths || []).map((x: any) => ({ name: String(x.name || '').trim(), phone: String(x.phone || '').trim(), spec: String(x.spec || '').trim() })).filter((x: any) => x.name));
      await bumpCfg(s);
      return J(await getCfg(s));
    }
    if (path === 'settings' && method === 'POST') {
      need('settings');
      const st = { ...DEF_SETTINGS, ...(body.settings || {}) };
      if (Array.isArray(st.services)) st.services = st.services.slice(0, 80).map((x: any) => ({ name: String(x.name || '').trim().slice(0, 60), min: Math.max(0, Math.round(+x.min || 0)), note: String(x.note || '').trim().slice(0, 80), unit: x.unit === 'piece' ? 'piece' : 'job', active: x.active !== false })).filter((x: any) => x.name);
      else delete st.services;
      await s.setJSON('cfg/settings', st);
      await bumpCfg(s);
      return J(await getCfg(s));
    }
    if (path === 'roleperms' && method === 'POST') {
      admin();
      const rp: any = {};
      for (const r of ['manager', 'staff']) rp[r] = (body.rolePerms?.[r] || []).filter((x: string) => PERM_KEYS.includes(x));
      await s.setJSON('cfg/roleperms', rp);
      await bumpCfg(s);
      return J(await getCfg(s));
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
      return J(await getCfg(s));
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
    return err('Not found', 404);
  } catch (e: any) {
    return err(e.message || 'Server error', e.status || 500, e.extra || {});
  }
};
