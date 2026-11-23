// Shared stock logic — used by the browser app and the server function.
export const SECTIONS = [
  { key: 'counter', label: 'Counter display', short: 'Counter' },
  { key: 'tray', label: 'Buffer trays', short: 'Trays' },
  { key: 'box', label: 'Boxes', short: 'Boxes' },
];
export const DEFAULT_SETTINGS = {
  shopName: 'Yamie Fine Jewellery',
  itemTypes: ['Ring', 'Stud', 'Pendant', 'Set', 'Bracelet', 'Necklace', 'Bangle', 'Chain', 'Nosepin', 'Coin', 'Findings', 'Mixed'],
  purities: ['22K', '18K', '14K', '9K', 'PT950', '925', 'Silver', 'Mixed'],
  categories: ['Gold', 'Diamond', 'Platinum', 'Lab-grown', 'Kids', 'Gents', 'Silver'],
  wtTol: 0.010,        // grams allowed either way on box weight checks
  blind: false,
  reqPhotos: false,    // require one photo per piece for each item before submit
  waNumber: '',        // admin WhatsApp number for reports
  erpBasis: 'lbl',
  erpItemMap: { Ring: 'G-Ring', Stud: 'G-Earring', Pendant: 'G-Pendant', Set: 'G- Jewellery Set', Bracelet: 'G-Bracelet', Necklace: 'G-Necklace', Bangle: 'G-Bangle', Chain: 'G-Chain', Nosepin: 'G-Nosepins', Coin: 'G-Gold Coin', Findings: 'Findings', Mixed: 'G-Diamond Jewellery' },
  erpCatMap: { Diamond: 'G-Diamond Jewellery', 'Lab-grown': 'Tanih - CVD Jewellery' },
  erpTanih: 'Tanih - CVD Jewellery', erpSilver: 'Silver Jewellery', erpPlatinum: 'YFJ - PLATINUM MM',   // ERP ornament for all Platinum jewellery
  // Location model (v1.8)
  // v1.37 ERP label code per item: barcode = code + label number (e.g. Bangle 14368 → BGL14368)
  labelCodes: [['Bangle', 'BGL'], ['Birthstone Ring', 'BRS'], ['Bracelet', 'BCL'], ['Chain', 'CHN'], ['Designer Set', 'DSS'], ['Diamond Ornament', 'DIA'], ['Hooks & Findings', 'ACC'], ['Locket', 'LKT'], ['Navaratna Ring', 'JWL'], ['Necklace', 'NCL'], ['Nosepins (18K)', 'NSP'], ['Ring', 'RNG'], ['Stud', 'STD'], ['Thali', 'TLY']].map(([item, code]) => ({ item, code })),
  // v1.29 main locations → sub locations; kind = counter / tray / box (how it is counted; weight for boxes only)
  mainLocs: [
    { name: 'Counter Display', kind: 'counter', subs: [{ name: 'Counter' }, { name: 'Shelves' }] },
    { name: 'Buffer Tray', kind: 'tray', subs: [] },
    { name: 'Buffer Boxes', kind: 'box', subs: [{ name: 'Gold boxes' }, { name: 'Mixed' }, { name: 'Sales Return' }, { name: 'Samples/Repairs' }, { name: 'Partner Drawings' }, { name: 'Photoshoot items' }] },
    { name: 'Grand Jewellers', kind: 'box', subs: [{ name: 'Mixed items' }, { name: 'Trays', kind: 'tray' }] },
  ],
  areas: ['Counter Display', 'Buffer Tray', 'Buffer Boxes', 'Grand Jewellers'],
  subDisplays: ['Counter', 'Shelves'],
  spots: ['Cash Counter Area', 'Locker Area', 'Platinum Area', 'Free standing counter'],   // physical position (before v1.29 this was the main location)
  jtypes: ['Plain Gold Jewellery', 'Diamond Jewellery', 'Platinum', 'Tanih - CVD Jewellery', 'Silver', 'Mixed'],     // app count is matched against ERP labels ('lbl') or pieces ('pcs')
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
  cash: 'Cash closing — count & save draft',
  cashVerify: 'Cash closing — verify & close',
  docs: 'View business documents & bank details',
  docsEdit: 'Add / edit business documents',
  share: 'Share & download reports (Excel, PDF, WhatsApp)',
  docsShare: 'Share business documents (WhatsApp, print, download, copy)',
  special: 'Bullion boxes & Grand-Yamie stock (view, receipts, issues)',
  grandBul: 'Grand staff — Grand bullion at Grand (entries, day-end balance)',
};
// v1.17 Cash closing
export const CASH_DENOMS = [500, 200, 100, 50, 20, 10];
export const CASH_COUNTERS = ['Cash / Billing', 'Counter 1', 'Counter 2', 'Counter 3', 'Other'];
// v1.18: two cash counts a day — Morning (checked against the previous evening closing, carried forward) and Evening (closing, checked against ACME)
export const CASH_SHIFTS = ['Morning', 'Evening'];
export const isMorning = (r) => r?.shift === 'Morning';
/** Totals of a cash count: A = bundles of 100 notes, B = loose notes + coins.
 *  Morning: expected = carried-forward opening (previous evening closing). Evening: expected = ACME closing balance.
 *  variance = counted − expected (null when there is nothing to compare). */
export function cashCalc(r) {
  let a = 0, b = 0;
  for (const d of CASH_DENOMS) { const x = (r.denoms || []).find((y) => +y.note === d) || {}; a += Math.max(0, Math.floor(+x.bundles || 0)) * 100 * d; b += Math.max(0, Math.floor(+x.loose || 0)) * d; }
  b += Math.max(0, Math.round((+r.coins || 0) * 100) / 100);
  const gt = Math.round((a + b) * 100) / 100;
  let expected = null;
  if (isMorning(r)) expected = r.opening ? +r.opening.gt : null;
  else if (r.acme !== '' && r.acme != null && !isNaN(+r.acme)) expected = +r.acme;
  const variance = expected == null ? null : Math.round((gt - expected) * 100) / 100;
  const result = variance == null ? (isMorning(r) ? 'nobase' : 'pending') : variance === 0 ? 'tallied' : variance > 0 ? 'excess' : 'short';
  return { a, b, gt, expected, variance, result };
}
/** Notes per denomination (bundles × 100 + loose) — to compare a morning count with the carried-forward closing. */
export const cashNotes = (r, d) => { const x = (r?.denoms || []).find((y) => +y.note === d) || {}; return Math.floor(+x.bundles || 0) * 100 + Math.floor(+x.loose || 0); };
// v1.19 Business documents (credentials vault)
// v1.20 motor vehicle documents (grouped by vehicle number)
export const VEHICLE_DOC_TYPES = ['Vehicle RC', 'Vehicle Insurance', 'Vehicle PUC', 'Vehicle Road Tax', 'Vehicle Permit / Fitness', 'Driving Licence'];
export const DOC_TYPES = ['Shop Location', 'GST Certificate', 'Trade Licence', 'Shop & Establishment', 'BIS Hallmarking', 'PAN Card', 'Udyam / MSME', 'Insurance', 'Bank Account', 'UPI QR Code', ...VEHICLE_DOC_TYPES, 'Other'];
export const isVehicleDoc = (d) => VEHICLE_DOC_TYPES.includes(d?.type);
/** Expiry reminders (v1.20). remind = days before expiry for the first reminder (default 30).
 *  Reminder days: remind, 15, 7, 3, 1, 0 (expiry day), then every 7 days while expired. */
export const DOC_REMIND_DEFAULT = 30;
export function docDaysLeft(d, today) { if (!d?.expiry) return null; return Math.round((Date.parse(d.expiry + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 864e5); }
export function docReminderDue(d, today) {
  const n = docDaysLeft(d, today); if (n == null || d.remindOff) return false;
  const first = +d.remind || DOC_REMIND_DEFAULT;
  if (n < 0) return (-n) % 7 === 0;
  return [first, 15, 7, 3, 1, 0].filter((x) => x <= first).includes(n);
}
export const docWatch = (d, today) => { const n = docDaysLeft(d, today); return n != null && !d.remindOff && n <= (+d.remind || DOC_REMIND_DEFAULT); };
export const ROLE_PERMS = {
  admin: Object.keys(PERMS),
  manager: ['count', 'move', 'setup', 'accept', 'close', 'reports', 'alerts', 'erp', 'verifyAll', 'cash', 'cashVerify', 'docs', 'docsShare', 'share', 'special'],
  staff: ['count', 'cash'],
};
// End-of-day transaction types. dir +1 = stock in, −1 = stock out. admin: only admin may enter.
export const TXN_TYPES = [
  { k: 'sale', label: 'Sales', dir: -1 },
  { k: 'salesReturn', label: 'Sales returns', dir: 1 },
  { k: 'newStock', label: 'New stock in', dir: 1 },
  { k: 'withdrawal', label: 'Stock withdrawal', dir: -1, admin: true },
  { k: 'smithReceipt', label: 'Smith receipts', dir: 1 },
  { k: 'smithIssue', label: 'Smith issues', dir: -1 },
  { k: 'repairIssue', label: 'Repair issues', dir: -1 },
  { k: 'partnerDrawing', label: 'Partner drawings', dir: -1 },
  { k: 'sample', label: 'Samples', dir: -1 },
  { k: 'grandApproval', label: 'Grand approval sales', dir: -1 },
];
export const REASONS = {
  in: TXN_TYPES.filter((t) => t.dir > 0).map((t) => t.label),
  out: TXN_TYPES.filter((t) => t.dir < 0).map((t) => t.label),
};
export const roundOf = (day) => day?.round || 'morning';
export const roundCounts = (counts, round) => (counts || []).filter((c) => (c.round || 'morning') === round);

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
  const byType = {};   // item type -> {counter:{op,in,out,exp,cnt,chkExp}, ...}
  const byJt = {};     // jewellery type -> same
  const lines = [];    // one record per location × item line (with jewellery type and metal)
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
      const it = itemOf(t), jt = jtOfLine(l, t);
      const rec = { locId: l.id, sec: l.sec, key: t, item: it, jt, purity: purOfLine(l, t), metal: jtMetal(jt), op: o.lines[t] || 0, in: f.in[t] || 0, out: f.out[t] || 0, exp: e.lines[t] || 0, cnt: counted ? +(c.lines || {})[t] || 0 : 0, chkExp: counted ? e.lines[t] || 0 : 0, counted: !!counted };
      lines.push(rec);
      for (const [map, k] of [[byType, it], [byJt, jt]]) {
        const B = ((map[k] ||= {})[l.sec] ||= { op: 0, in: 0, out: 0, exp: 0, cnt: 0, chkExp: 0 });
        B.op += rec.op; B.in += rec.in; B.out += rec.out; B.exp += rec.exp; B.cnt += rec.cnt; B.chkExp += rec.chkExp;
      }
    }
    const pk = l.purity || '—'; const ck = l.cat || '—';
    byPurity[pk] = (byPurity[pk] || 0) + sumLines(e.lines);
    byCat[ck] = (byCat[ck] || 0) + sumLines(e.lines);
  }
  const total = { locs: 0, ok: 0, var: 0, stale: 0, pending: 0, opening: 0, in: 0, out: 0, expected: 0, counted: 0, checkedExp: 0 };
  for (const S of Object.values(sec)) for (const k of Object.keys(total)) total[k] += S[k];
  return { exp, flows: fl, last, status, sec, total, byType, byJt, lines, byPurity, byCat };
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
// ---- Jewellery type per item line (v1.9) ----
// A location (tray / box / counter tray) has a jewellery type: Plain Gold, Diamond, Platinum or Mixed.
// Each stock line key is an item type, optionally with a jewellery type code: "Ring" or "Ring@D".
// A plain key means the location's own type (Plain Gold when the location is Mixed).
// v1.13: Tanih - CVD Jewellery (code T, lab-grown diamond, gold metal) and Silver (code S) added.
export const JTYPES = ['Plain Gold Jewellery', 'Diamond Jewellery', 'Platinum', 'Tanih - CVD Jewellery', 'Silver', 'Mixed'];
export const LINE_JTYPES = ['Plain Gold Jewellery', 'Diamond Jewellery', 'Platinum', 'Tanih - CVD Jewellery', 'Silver'];   // v1.26 order: Gold, Diamond Jewellery, Platinum, Lab Grown, Silver
export const JT_CODE = { 'Plain Gold Jewellery': 'G', 'Diamond Jewellery': 'D', 'Tanih - CVD Jewellery': 'T', Platinum: 'P', Silver: 'S' };
export const JT_SHORT = { 'Plain Gold Jewellery': 'Gold', 'Diamond Jewellery': 'Diamond', 'Tanih - CVD Jewellery': 'Lab Grown', Platinum: 'Platinum', Silver: 'Silver' };
// v1.26 names shown to users (stored values unchanged): Gold, Diamond Jewellery, Platinum, Lab Grown, Silver
export const JT_LABEL = { 'Plain Gold Jewellery': 'Gold', 'Diamond Jewellery': 'Diamond Jewellery', 'Tanih - CVD Jewellery': 'Lab Grown', Platinum: 'Platinum', Silver: 'Silver', Mixed: 'Mixed' };
export const JT_CLS = { 'Plain Gold Jewellery': 'g', 'Diamond Jewellery': 'd', 'Tanih - CVD Jewellery': 't', Platinum: 'p', Silver: 's' };
// Report metal of a jewellery type (Tanih CVD is set in gold → Gold).
export const METALS = ['Gold', 'Platinum', 'Silver'];
export const JT_METAL = { 'Plain Gold Jewellery': 'Gold', 'Diamond Jewellery': 'Gold', 'Tanih - CVD Jewellery': 'Gold', Platinum: 'Platinum', Silver: 'Silver' };
export const jtMetal = (jt) => JT_METAL[jt] || 'Gold';
/** v1.28 admin-managed jewellery types. settings.jtLabels {stored name: label}, settings.jtShort {name: short}, settings.jtHidden [names],
 *  settings.jtCustom [{ name, code (one letter, not G D P T S), label, short, metal }]. Mutates the shared lists/maps in place. */
const JT_BUILTIN = { order: ['Plain Gold Jewellery', 'Diamond Jewellery', 'Platinum', 'Tanih - CVD Jewellery', 'Silver'], code: { ...JT_CODE }, short: { ...JT_SHORT }, label: { ...JT_LABEL }, cls: { ...JT_CLS }, metal: { ...JT_METAL } };
export const JT_FREE_CODES = 'ABCEFHIJKLMNOQRUVWXYZ'.split('');
export function applyJewelleryTypes(st) {
  const custom = (st?.jtCustom || []).filter((c) => c && c.name && /^[A-Z]$/.test(c.code) && !'GDPTS'.includes(c.code));
  const hidden = st?.jtHidden || [];
  for (const o of [JT_CODE, JT_SHORT, JT_LABEL, JT_CLS, JT_METAL]) for (const k of Object.keys(o)) delete o[k];
  Object.assign(JT_CODE, JT_BUILTIN.code); Object.assign(JT_SHORT, JT_BUILTIN.short); Object.assign(JT_LABEL, JT_BUILTIN.label); Object.assign(JT_CLS, JT_BUILTIN.cls); Object.assign(JT_METAL, JT_BUILTIN.metal);
  for (const c of custom) { JT_CODE[c.name] = c.code; JT_SHORT[c.name] = c.short || c.label || c.name; JT_LABEL[c.name] = c.label || c.name; JT_CLS[c.name] = 'cu'; JT_METAL[c.name] = ['Gold', 'Platinum', 'Silver'].includes(c.metal) ? c.metal : 'Gold'; }
  for (const [k, v] of Object.entries(st?.jtLabels || {})) if (JT_CODE[k] && v) JT_LABEL[k] = String(v);
  for (const [k, v] of Object.entries(st?.jtShort || {})) if (JT_CODE[k] && v) JT_SHORT[k] = String(v);
  const order = [...JT_BUILTIN.order, ...custom.map((c) => c.name)].filter((j) => !hidden.includes(j) || j === 'Plain Gold Jewellery');
  const ord2 = Array.isArray(st?.jtOrder) ? [...st.jtOrder.filter((j) => order.includes(j)), ...order.filter((j) => !st.jtOrder.includes(j))] : order;
  LINE_JTYPES.length = 0; LINE_JTYPES.push(...ord2);
  JTYPES.length = 0; JTYPES.push(...ord2, 'Mixed');
  JT_LABEL.Mixed = 'Mixed';
}
// v1.10: key may also carry purity: "Ring@D#18K" (jewellery type D, purity 18K). "#-" = no purity.
export const itemOf = (k) => String(k).split(/[@#]/)[0];
export const defaultPur = (loc) => loc?.purity || '';
export function purOfLine(loc, k) { const m = /#(.*)$/.exec(String(k)); if (!m) return defaultPur(loc); return m[1] === '-' ? '' : m[1]; }
export const defaultJt = (loc) => (loc?.jtype && loc.jtype !== 'Mixed' && JT_CODE[loc.jtype] ? loc.jtype : 'Plain Gold Jewellery');
export function jtOfLine(loc, k) {
  const code = (/@([A-Z])/.exec(String(k)) || [])[1];
  if (code) return Object.keys(JT_CODE).find((n) => JT_CODE[n] === code) || 'Plain Gold Jewellery';
  return defaultJt(loc);
}
// v1.14: a location can hold several jewellery types (loc.jtypes). jtype = the single type, or 'Mixed' when 2+.
// Returns the ticked types; [] for an old 'Mixed' location without a list (any type).
export const locJts = (loc) => { const a = (loc?.jtypes || []).filter((j) => JT_CODE[j]); if (a.length) return LINE_JTYPES.filter((j) => a.includes(j)); return loc?.jtype && JT_CODE[loc.jtype] ? [loc.jtype] : []; };
export const normJts = (arr) => LINE_JTYPES.filter((j) => (arr || []).includes(j));
export const lineKey = (loc, item, jt, pur) => {
  let k = jt === defaultJt(loc) || !jt ? item : `${item}@${JT_CODE[jt] || 'G'}`;
  if (pur !== undefined && (pur || '') !== defaultPur(loc)) k += `#${pur || '-'}`;
  return k;
};
export const keyText = (loc, k) => { const p = purOfLine(loc, k); return `${JT_SHORT[jtOfLine(loc, k)]}${p && !/^mixed$/i.test(p) ? ' ' + p : ''} ${itemOf(k)}`; };   // v1.38: 'Mixed' purity is not an item name
export const lineMetal = (loc, k) => jtMetal(jtOfLine(loc, k));
export const metalOf = (loc) => (loc?.jtype ? jtMetal(loc.jtype) : loc?.cat === 'Platinum' ? 'Platinum' : loc?.cat === 'Silver' ? 'Silver' : 'Gold');
export const erpMetal = (name) => (/platinum/i.test(name || '') ? 'Platinum' : /silver/i.test(name || '') ? 'Silver' : 'Gold');
// ---- v1.32 shop holidays: Sundays + special holidays (no counts / reports expected) ----
export function holidayOf(st, date) {
  const H = st?.holidays || {}; const d = String(date || '');
  const sp = (H.dates || []).find((x) => x.date === d); if (sp) return sp.name || 'Holiday';
  if (H.sunday !== false && /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(d + 'T12:00:00Z').getUTCDay() === 0) return 'Sunday';
  return '';
}
// ---- v1.29 main / sub locations ----
export const LOC_KINDS = { counter: 'Counter', tray: 'Tray', box: 'Box' };
export const mainLocsOf = (st) => (Array.isArray(st?.mainLocs) && st.mainLocs.length ? st.mainLocs : DEFAULT_SETTINGS.mainLocs);
export const mainOf = (st, name) => mainLocsOf(st).find((m) => m.name === name);
export const subKind = (m, sub) => (m?.subs || []).find((x) => x.name === sub)?.kind || m?.kind || 'box';
/** places (main + sub) that hold a section, e.g. box → Buffer Boxes › Gold boxes …, Grand Jewellers › Mixed items */
export function placesFor(st, sec) { const out = []; for (const m of mainLocsOf(st)) { if (m.subs?.length) { for (const x of m.subs) if (!sec || (x.kind || m.kind) === sec) out.push({ area: m.name, sub: x.name }); } else if (!sec || m.kind === sec) out.push({ area: m.name, sub: '' }); } return out; }
export const defaultPlace = (st, sec) => placesFor(st, sec)[0] || { area: '', sub: '' };
/** move a pre-v1.29 location to the new main / sub locations (old physical area kept as spot) */
export function placeLoc29(l, st) {
  const mains = mainLocsOf(st); const g = `${l.group || ''} ${l.name || ''} ${l.area || ''}`.toLowerCase();
  const ok = mains.some((m) => m.name === l.area && (!m.subs?.length || m.subs.some((x) => x.name === l.sub)));
  if (ok) return null;
  const spot = l.area && !mains.some((m) => m.name === l.area) && !/^(grand|partners?|repairs?|samples?)$/i.test(l.area) ? l.area : (l.spot || '');
  const find = (re, sec) => placesFor(st, sec).find((p) => re.test(`${p.area} ${p.sub}`));
  let p;
  if (/grand/.test(g)) p = find(new RegExp(l.sec === 'tray' ? 'grand.*tray' : 'grand.*mixed', 'i'), l.sec) || find(/grand/i);
  if (!p && l.sec === 'counter') p = /wall|shel/.test(`${l.sub || ''} ${g}`.toLowerCase()) ? find(/shel/i, 'counter') : find(/counter display.*counter$/i, 'counter');
  if (!p && l.sec === 'box') p = /\bmix/.test(g) ? find(/buffer boxes › mixed$|buffer boxes mixed$/i, 'box') || find(/gold box/i, 'box') : /return/.test(g) ? find(/return/i, 'box') : /sample|repair/.test(g) ? find(/sample|repair/i, 'box') : /partner/.test(g) ? find(/partner/i, 'box') : /photo/.test(g) ? find(/photo/i, 'box') : find(/gold box/i, 'box');
  p ||= defaultPlace(st, l.sec);
  return { area: p.area, sub: p.sub, spot };
}
/** Best guess of Main location / Sub display / Jewellery type for locations created before v1.8 */
export function deriveLocMeta(l) {
  const g = `${l.group || ''} ${l.name || ''}`.toLowerCase();
  const jtype = l.cat === 'Platinum' || /platinum/.test(g) ? 'Platinum' : l.cat === 'Silver' || /silver/.test(g) ? 'Silver' : l.cat === 'Lab-grown' || /\bcvd\b|tanih|lab.?grown/.test(g) ? 'Tanih - CVD Jewellery' : (l.cat === 'Diamond' || /diamond|\bdia\b/.test(g)) ? 'Diamond Jewellery' : 'Plain Gold Jewellery';
  let spot = '';
  if (l.sec === 'counter') spot = /platinum/.test(g) ? 'Platinum Area' : /locker/.test(g) ? 'Locker Area' : /cvd|green shelf|free/.test(g) ? 'Free standing counter' : 'Cash Counter Area';
  else spot = 'Locker Area';
  const p = placeLoc29({ ...l, area: '', sub: /wall|shelf/.test(g) ? 'Shelves' : '' }, DEFAULT_SETTINGS);
  return { area: p.area, sub: p.sub, spot, jtype };
}
export const erpKey = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function erpNameFor(loc, key, settings) {
  const jt = jtOfLine(loc, key); const type = itemOf(key);
  if (jt === 'Platinum') return settings?.erpPlatinum || DEFAULT_SETTINGS.erpPlatinum;
  if (jt === 'Silver') return settings?.erpSilver || DEFAULT_SETTINGS.erpSilver;
  const cm = settings?.erpCatMap || DEFAULT_SETTINGS.erpCatMap; const im = settings?.erpItemMap || DEFAULT_SETTINGS.erpItemMap;
  if (jt === 'Tanih - CVD Jewellery') return settings?.erpTanih || cm['Lab-grown'] || DEFAULT_SETTINGS.erpTanih;
  if (loc.cat && loc.cat !== 'Diamond' && cm[loc.cat] != null && jt === defaultJt(loc)) return cm[loc.cat];   // e.g. Lab-grown → Tanih
  if (jt === 'Diamond Jewellery') return cm.Diamond || 'G-Diamond Jewellery';
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
