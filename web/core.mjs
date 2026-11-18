// Shared stock logic — used by the browser app and the server function.
export const SECTIONS = [
  { key: 'counter', label: 'Counter display', short: 'Counter' },
  { key: 'tray', label: 'Buffer trays', short: 'Trays' },
  { key: 'box', label: 'Boxes', short: 'Boxes' },
];
export const DEFAULT_SETTINGS = {
  shopName: 'Yamie Fine Jewellery',
  itemTypes: ['Ring', 'Stud', 'Pendant', 'Set', 'Bracelet', 'Necklace', 'Bangle', 'Chain', 'Nosepin', 'Coin', 'Findings', 'Mixed'],
  purities: ['22K', '18K', '14K', '9K', 'PT950', 'Silver', 'Mixed'],
  categories: ['Gold', 'Diamond', 'Platinum', 'Lab-grown', 'Kids', 'Gents', 'Silver'],
  wtTol: 0.010,        // grams allowed either way on box weight checks
  blind: false,
  reqPhotos: false,    // require one photo per piece for each item before submit        // hide expected counts from staff while counting
  waNumber: '',        // admin WhatsApp number for reports
  erpBasis: 'lbl',
  erpItemMap: { Ring: 'G-Ring', Stud: 'G-Earring', Pendant: 'G-Pendant', Set: 'G- Jewellery Set', Bracelet: 'G-Bracelet', Necklace: 'G-Necklace', Bangle: 'G-Bangle', Chain: 'G-Chain', Nosepin: 'G-Nosepins', Coin: 'G-Gold Coin', Findings: 'Findings', Mixed: 'G-Diamond Jewellery' },
  erpCatMap: { Diamond: 'G-Diamond Jewellery', 'Lab-grown': 'Tanih - CVD Jewellery', Platinum: '-' },     // app count is matched against ERP labels ('lbl') or pieces ('pcs')
  reasons: ['Item sold, not updated', 'Moved to another tray', 'Sent for repair / approval', 'Label missing / wrong tag', 'Found extra item', 'Other'],
};
export const PERMS = {
  count: 'Count / verify stock',
  move: 'Stock in / out / move',
  setup: 'Set up locations & set counts',
  accept: 'Accept count variances',
  close: 'Close day',
  reports: 'Consolidated & history',
  alerts: 'Receive alerts & reports',
  erp: 'Enter ERP closing (Pc / Lbl)',
  verifyAll: 'Use “Verify all” (mark every item Yes)',
  users: 'Manage users',
};
export const ROLE_PERMS = {
  admin: Object.keys(PERMS),
  manager: ['count', 'move', 'setup', 'accept', 'close', 'reports', 'alerts', 'erp', 'verifyAll'],
  staff: ['count'],
};
export const REASONS = {
  in: ['New stock', 'Sales return', 'Transfer in', 'Repair back', 'Other in'],
  out: ['Sale', 'Transfer out', 'Repair / Melt', 'Approval out', 'Other out'],
};

export const sumLines = (l) => Object.values(l || {}).reduce((a, b) => a + (+b || 0), 0);
export const r3 = (n) => Math.round((+n || 0) * 1000) / 1000;
const blank = () => ({ lines: {}, wt: 0 });
const clone = (s) => ({ lines: { ...(s?.lines || {}) }, wt: +(s?.wt || 0) });

export function applyLeg(st, leg) {
  for (const [t, n] of Object.entries(leg.lines || {})) {
    const v = (st.lines[t] || 0) + (+n || 0);
    if (v) st.lines[t] = v; else delete st.lines[t];
  }
  st.wt = r3(st.wt + (+leg.wt || 0));
}

/** expected[locId] = opening + all non-void legs */
export function computeExpected(opening, mvs) {
  const exp = {};
  for (const [id, s] of Object.entries(opening || {})) exp[id] = clone(s);
  for (const mv of mvs || []) {
    if (mv.void) continue;
    for (const leg of mv.legs || []) applyLeg(exp[leg.locId] ||= blank(), leg);
  }
  return exp;
}

/** in/out totals per loc per item type */
export function flows(mvs) {
  const f = {};
  for (const mv of mvs || []) {
    if (mv.void) continue;
    for (const leg of mv.legs || []) {
      const x = (f[leg.locId] ||= { in: {}, out: {}, wtIn: 0, wtOut: 0 });
      for (const [t, n] of Object.entries(leg.lines || {})) {
        if (n > 0) x.in[t] = (x.in[t] || 0) + n; else if (n < 0) x.out[t] = (x.out[t] || 0) - n;
      }
      if (leg.wt > 0) x.wtIn = r3(x.wtIn + leg.wt); else if (leg.wt < 0) x.wtOut = r3(x.wtOut - leg.wt);
    }
  }
  return f;
}

export function latestCounts(counts) {
  const m = {};
  for (const c of counts || []) if (!m[c.locId] || c.at > m[c.locId].at) m[c.locId] = c;
  return m;
}

/** status of one location: pending | ok | var | stale */
export function locStatus(exp, count, mvs, locId, settings) {
  const e = exp || blank();
  if (!count) return { state: 'pending', diff: {}, diffTotal: 0, wtDiff: 0 };
  const tol = +(settings?.wtTol ?? DEFAULT_SETTINGS.wtTol);
  const mode = count.mode || 'count';
  const diff = {}; let diffTotal = 0, absTotal = 0, wtDiff = 0, bad = false;
  if (mode !== 'weight') {
    const keys = new Set([...Object.keys(e.lines), ...Object.keys(count.lines || {})]);
    for (const t of keys) {
      const d = (+(count.lines || {})[t] || 0) - (e.lines[t] || 0);
      if (d) { diff[t] = d; diffTotal += d; absTotal += Math.abs(d); bad = true; }
    }
  }
  if (mode !== 'count' && (e.wt || 0) > 0) {   // no weight baseline yet → first verified weight becomes the baseline
    wtDiff = r3((+count.wt || 0) - (e.wt || 0));
    if (Math.abs(wtDiff) > tol + 1e-9) bad = true;
  }
  const stale = (mvs || []).some((mv) => !mv.void && mv.at > count.at && mv.countId !== count.id && (mv.legs || []).some((l) => l.locId === locId));
  return { state: stale ? 'stale' : bad ? 'var' : 'ok', diff, diffTotal, absTotal, wtDiff, mode };
}

/** Full picture of a day. */
export function summarize(locs, opening, mvs, counts, settings) {
  const exp = computeExpected(opening, mvs);
  const fl = flows(mvs);
  const last = latestCounts(counts);
  const status = {};
  const sec = {};
  const byType = {};   // type -> {counter:{op,in,out,exp,cnt,chkExp}, ...}
  const byPurity = {}; const byCat = {};
  const all = locs.filter((l) => l.active !== false || sumLines(exp[l.id]?.lines));
  for (const s of SECTIONS) sec[s.key] = { locs: 0, ok: 0, var: 0, stale: 0, pending: 0, opening: 0, in: 0, out: 0, expected: 0, counted: 0, checkedExp: 0, wtOpening: 0, wtExpected: 0 };
  for (const l of all) {
    const e = exp[l.id] || blank(); const o = opening?.[l.id] || blank(); const f = fl[l.id] || { in: {}, out: {} };
    const st = locStatus(e, last[l.id], mvs, l.id, settings); status[l.id] = st;
    const S = sec[l.sec]; if (!S) continue;
    S.locs++; S[st.state]++;
    S.opening += sumLines(o.lines); S.expected += sumLines(e.lines); S.in += sumLines(f.in); S.out += sumLines(f.out);
    S.wtOpening = r3(S.wtOpening + (o.wt || 0)); S.wtExpected = r3(S.wtExpected + (e.wt || 0));
    const c = last[l.id]; const counted = c && c.mode !== 'weight';
    if (counted) { S.counted += sumLines(c.lines); S.checkedExp += sumLines(e.lines); }
    const types = new Set([...Object.keys(e.lines), ...Object.keys(o.lines), ...Object.keys(f.in), ...Object.keys(f.out), ...Object.keys(counted ? c.lines || {} : {})]);
    for (const t of types) {
      const B = ((byType[t] ||= {})[l.sec] ||= { op: 0, in: 0, out: 0, exp: 0, cnt: 0, chkExp: 0 });
      B.op += o.lines[t] || 0; B.in += f.in[t] || 0; B.out += f.out[t] || 0; B.exp += e.lines[t] || 0;
      if (counted) { B.cnt += +(c.lines || {})[t] || 0; B.chkExp += e.lines[t] || 0; }
    }
    const pk = l.purity || '—'; const ck = l.cat || '—';
    byPurity[pk] = (byPurity[pk] || 0) + sumLines(e.lines);
    byCat[ck] = (byCat[ck] || 0) + sumLines(e.lines);
  }
  const total = { locs: 0, ok: 0, var: 0, stale: 0, pending: 0, opening: 0, in: 0, out: 0, expected: 0, counted: 0, checkedExp: 0 };
  for (const S of Object.values(sec)) for (const k of Object.keys(total)) total[k] += S[k];
  return { exp, flows: fl, last, status, sec, total, byType, byPurity, byCat };
}

export function closingOf(opening, mvs) {
  const exp = computeExpected(opening, mvs);
  for (const k of Object.keys(exp)) if (!sumLines(exp[k].lines) && !exp[k].wt) delete exp[k];
  return exp;
}

/** Closing for the day: book stock, but a box whose weight was verified within tolerance
 *  carries the verified weight forward (absorbs polishing / scale drift). */
export function closingVerified(locs, opening, mvs, counts, settings) {
  const close = closingOf(opening, mvs);
  const last = latestCounts(counts);
  for (const l of locs || []) {
    if (l.sec !== 'box') continue;
    const c = last[l.id]; if (!c || c.mode === 'count' || c.wt == null) continue;
    const st = locStatus(close[l.id] || blank(), c, mvs, l.id, settings);
    if (st.state === 'ok') (close[l.id] ||= blank()).wt = r3(c.wt);
  }
  return close;
}

/** ERP match. ERP rows are per ornament (e.g. "G-Ring", "G-Diamond Jewellery").
 *  App stock is mapped: category map wins (Diamond, Lab-grown, Platinum), else item-type map.
 *  A category mapped to '-' is not in the ERP report and is kept out of the match.
 *  ERP rows without Pc/Lbl (weight-only) are omitted — those live in Boxes as weight-only stock.
 *  which: 'closing' (app expected) or 'opening' (when the ERP report is for the previous day). */
export const erpKey = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function erpNameFor(loc, type, settings) {
  const cm = settings?.erpCatMap || DEFAULT_SETTINGS.erpCatMap; const im = settings?.erpItemMap || DEFAULT_SETTINGS.erpItemMap;
  if (loc.cat && cm[loc.cat] != null) return cm[loc.cat];
  return im[type] ?? type;
}
export function erpCompare(erp, locs, sm, settings, which = 'closing', opening = null) {
  const basis = settings?.erpBasis || 'lbl';
  const rows = new Map(); const get = (name) => { const k = erpKey(name); if (!rows.has(k)) rows.set(k, { name, app: 0, cnt: 0, pcs: null, lbl: null, gr: null, net: null, erp: false }); return rows.get(k); };
  let excluded = 0;
  for (const l of locs || []) {
    const st = which === 'opening' ? (opening?.[l.id] || { lines: {} }) : (sm.exp[l.id] || { lines: {} });
    const c = sm.last[l.id]; const counted = which === 'closing' && c && c.mode !== 'weight';
    const types = new Set([...Object.keys(st.lines || {}), ...(counted ? Object.keys(c.lines || {}) : [])]);
    for (const t of types) {
      const name = erpNameFor(l, t, settings); const n = st.lines?.[t] || 0;
      if (name === '-' || name === '') { excluded += n; continue; }
      const r = get(name); r.app += n; if (counted) r.cnt += +(c.lines?.[t] || 0);
    }
  }
  for (const x of erp?.rows || []) {
    if (x.pcs == null && x.lbl == null) continue;            // weight-only → boxes
    const r = get(x.name); r.name = x.name; Object.assign(r, { pcs: x.pcs, lbl: x.lbl, gr: x.gr, net: x.net, erp: true });
  }
  const list = [...rows.values()].filter((r) => r.erp || r.app);
  for (const r of list) { const bv = r[basis]; r.basisVal = r.erp ? +(bv || 0) : null; r.diff = r.erp ? r.app - r.basisVal : null; }
  list.sort((a, b) => (b.erp - a.erp) || a.name.localeCompare(b.name));
  const app = list.reduce((a, r) => a + r.app, 0);
  const sumOf = (k) => list.reduce((a, r) => a + (+r[k] || 0), 0);
  const total = { app, pcs: erp?.total?.pcs ?? sumOf('pcs'), lbl: erp?.total?.lbl ?? sumOf('lbl'), gr: erp?.total?.gr ?? null, net: erp?.total?.net ?? null };
  total.diff = erp ? app - (+total[basis] || 0) : null;
  return { rows: list, total, basis, excluded, which, entered: !!erp, matched: !!erp && total.diff === 0 };
}

export function istDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
