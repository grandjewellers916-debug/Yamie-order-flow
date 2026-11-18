// Shared stock logic — used by the browser app and the server function.
export const SECTIONS = [
  { key: 'counter', label: 'Counter display', short: 'Counter' },
  { key: 'tray', label: 'Buffer trays', short: 'Trays' },
  { key: 'box', label: 'Boxes', short: 'Boxes' },
];
export const DEFAULT_SETTINGS = {
  shopName: 'Yamie Fine Jewellery',
  itemTypes: ['Ring', 'Stud', 'Pendant', 'Set', 'Bracelet', 'Necklace', 'Bangle', 'Chain', 'Nosepin', 'Coin', 'Mixed'],
  purities: ['22K', '18K', '14K', '9K', 'PT950', 'Silver', 'Mixed'],
  categories: ['Gold', 'Diamond', 'Platinum', 'Lab-grown', 'Kids', 'Gents', 'Silver'],
  wtTol: 0.010,        // grams allowed either way on box weight checks
  blind: false,        // hide expected counts from staff while counting
  waNumber: '',        // admin WhatsApp number for reports
  erpBasis: 'lbl',     // app count is matched against ERP labels ('lbl') or pieces ('pcs')
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
  users: 'Manage users',
};
export const ROLE_PERMS = {
  admin: Object.keys(PERMS),
  manager: ['count', 'move', 'setup', 'accept', 'close', 'reports', 'alerts', 'erp'],
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

/** ERP Pc/Lbl comparison against app closing (expected) by item type. */
export function erpCompare(erp, sm, settings) {
  const basis = settings?.erpBasis || 'lbl';
  const rows = {}; let app = 0, erpT = 0;
  for (const [t, B] of Object.entries(sm.byType)) { const v = Object.values(B).reduce((a, x) => a + x.exp, 0); if (v) rows[t] = { app: v, cnt: Object.values(B).reduce((a, x) => a + x.cnt, 0) }; }
  for (const [t, x] of Object.entries(erp?.lines || {})) (rows[t] ||= { app: 0, cnt: 0 }).erp = x;
  const hasLines = Object.values(erp?.lines || {}).some((x) => x && (x.pcs || x.lbl));
  for (const r of Object.values(rows)) { app += r.app; r.basis = r.erp ? +(r.erp[basis] || 0) : null; r.diff = r.basis == null ? null : r.app - r.basis; }
  const total = { app, pcs: hasLines ? Object.values(rows).reduce((a, r) => a + (+r.erp?.pcs || 0), 0) : +(erp?.total?.pcs || 0), lbl: hasLines ? Object.values(rows).reduce((a, r) => a + (+r.erp?.lbl || 0), 0) : +(erp?.total?.lbl || 0) };
  if (erp?.total && !hasLines) { total.pcs = +erp.total.pcs || 0; total.lbl = +erp.total.lbl || 0; }
  erpT = total[basis];
  total.diff = erp ? app - erpT : null;
  return { rows, total, basis, entered: !!erp, matched: !!erp && total.diff === 0 };
}

export function istDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
