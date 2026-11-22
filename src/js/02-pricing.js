// ======================================================================
// Pricing — same flow as Yamie Price Check:
// metal = net wt × rate × qty; stones; making as % (of metal + stone, or metal only),
// ₹ per gram, both, or flat; other charges; discount; GST; round UP to ₹50.
// ======================================================================
const PURITIES = [
  ['22k', '22K (916)', 'k22'], ['18k', '18K (750)', 'k18'], ['14k', '14K (585)', 'k14'], ['9k', '9K (375)', 'k9'],
  ['pt', 'Platinum (950)', 'pt'], ['ag', 'Silver (925)', 'ag'],
];
const GOLD = ['22k', '18k', '14k', '9k'];
const purLabel = (p) => (PURITIES.find((x) => x[0] === p) || [p, p])[1];
const purShort = (p) => ({ '22k': '22K', '18k': '18K', '14k': '14K', '9k': '9K', pt: 'PT', ag: 'Silver' })[p] || p;
const rateKey = (p) => (PURITIES.find((x) => x[0] === p) || [0, 0, 'k18'])[2];
const rateOf = (p, rates) => num((rates || S.rates)[rateKey(p)]);
const COLOURS = ['Yellow', 'Rose', 'White', 'Two-tone'];
const STONES = [['diamond', 'Natural diamond'], ['labgrown', 'Lab-grown diamond'], ['precious', 'Precious / colour stone'], ['synthetic', 'Synthetic / CZ'], ['other', 'Other']];
const stoneLabel = (t) => (STONES.find((x) => x[0] === t) || [t, t])[1];
const MK_MODES = [['pct', 'VA / making %'], ['pg', '₹ per gram'], ['combo', '₹/g + VA %'], ['flat', 'Flat ₹ per piece']];
const CATS = ['Ring', 'Earrings', 'Pendant', 'Necklace', 'Chain', 'Bangle', 'Bracelet', 'Nose pin', 'Mangalsutra', 'Set', 'Other'];

function newItem() {
  return { id: uid(), cat: 'Ring', product: '', qty: 1, design: 'ours', designNo: '', model: '', details: '', custom: '', purity: '18k', colour: 'Yellow',
    wt: '', gwt: '', size: '', dims: '', spec: {}, stones: [], mkMode: 'pct', mk: 14, mkPg: 0, other: 0, vendor: '', prodNotes: '', photos: [], refs: [], rev: 1 };
}
/** Stone charge for ONE piece of jewellery: carats × rate, pieces × rate or grams × rate (older records: fixed charge). */
function stoneCharge(s) {
  if (s.rate === '' || s.rate == null) return num(s.charge);
  const u = s.unit || 'ct', q = u === 'ct' ? num(s.ct) : u === 'pc' ? num(s.pcs) : num(s.wtg);
  return Math.round(q * num(s.rate) * 100) / 100;
}

function priceLine(it, rates, wt) {
  const qty = Math.max(1, Math.round(num(it.qty) || 1));
  const w = num(wt != null ? wt : it.wt), rate = rateOf(it.purity, rates);
  const metal = r2(w * rate * qty);
  const stone = r2((it.stones || []).reduce((t, s) => t + stoneCharge(s), 0) * qty);
  const base = S.mkOnStone ? metal + stone : metal;
  let making = 0, va = 0;
  if (it.mkMode === 'pct') va = r2(base * num(it.mk) / 100);
  else if (it.mkMode === 'pg') making = r2(num(it.mkPg) * w * qty);
  else if (it.mkMode === 'combo') { making = r2(num(it.mkPg) * w * qty); va = r2(base * num(it.mk) / 100); }
  else if (it.mkMode === 'flat') making = r2(num(it.mk) * qty);
  const other = r2(num(it.other));
  return { id: it.id, purity: it.purity, rate, wt: w, qty, metal, stone, making, va, other, sub: r2(metal + stone + making + va + other) };
}

/** Whole-order price. `wts` = actual weights by item id (final price). */
function priceOrder(items, rates, disc, extra, wts, roundTo) {
  const lines = items.map((it) => priceLine(it, rates, wts ? wts[it.id] : null));
  const sub = r2(lines.reduce((t, l) => t + l.sub, 0) + num(extra));
  const d = r2(Math.min(Math.max(0, num(disc)), sub));
  const pre = r2(sub - d);
  const gst = r2(pre * num(S.gst) / 100);
  const raw = r2(pre + gst);
  const step = num(roundTo != null ? roundTo : S.roundTo) || 1;
  const total = Math.ceil(raw / step - 1e-9) * step;
  const metal = r2(lines.reduce((t, l) => t + l.metal, 0));
  return { lines, extra: r2(num(extra)), sub, disc: d, pre, gstPct: num(S.gst), gst, raw, round: r2(total - raw), roundTo: step, total,
    metal, minAdv: Math.ceil(total * num(S.minAdv) / 100), lock: Math.ceil(metal) };
}

/** The same item quoted in every gold karat, with weight scaled by the karat reference weights. */
function karatQuotes(it, rates) {
  const ref = S.karatRef || {}, src = num(ref[rateKey(it.purity)]);
  return GOLD.filter((p) => rateOf(p, rates) > 0).map((p) => {
    const w = p === it.purity || !src || !num(ref[rateKey(p)]) ? num(it.wt) : Math.round(num(it.wt) * num(ref[rateKey(p)]) / src * 1000) / 1000;
    const tot = priceOrder([Object.assign({}, it, { purity: p, wt: w })], rates, 0).total;
    return { p, w, rate: rateOf(p, rates), total: tot, cur: p === it.purity, est: p !== it.purity && (p === '22k' || it.purity === '22k') && !S.karatRef22Weighed };
  });
}
function karatTable(it, rates) {
  if (!GOLD.includes(it.purity) || !(num(it.wt) > 0)) return '';
  const q = karatQuotes(it, rates);
  if (q.length < 2) return '';
  return `<table class="ktab"><tr><th>Karat</th><th>Weight</th><th>Rate</th><th>Price incl. GST</th></tr>${q.map((x) =>
    `<tr class="${x.cur ? 'cur' : ''}"><td>${purShort(x.p)}${x.est ? ' *' : ''}</td><td>${g3(x.w)}</td><td>${rupee(x.rate)}</td><td>${rupee(x.total)}</td></tr>`).join('')}</table>
    ${q.some((x) => x.est) ? '<p class="hint">* 22K weight uses an estimated reference. Weigh a reference piece and enter it in Settings → Pricing.</p>' : ''}`;
}

function breakdownHtml(b, items, opt = {}) {
  const rows = [];
  b.lines.forEach((l, i) => {
    const it = items[i] || {};
    const nm = items.length > 1 ? `Item ${i + 1} ` : '';
    rows.push([`${nm}Metal · ${g3(l.wt)} × ${rupee(l.rate)}${l.qty > 1 ? ' × ' + l.qty : ''}`, rupee2(l.metal)]);
    if (l.stone) rows.push([`${nm}Stones`, rupee2(l.stone)]);
    if (l.making) rows.push([`${nm}Making`, rupee2(l.making)]);
    if (l.va) rows.push([`${nm}VA / making ${num(it.mk)}%${S.mkOnStone ? ' (metal + stone)' : ''}`, rupee2(l.va)]);
    if (l.other) rows.push([`${nm}Other`, rupee2(l.other)]);
  });
  if (b.extra) rows.push(['Extra charges', rupee2(b.extra)]);
  rows.push(['Value before tax', rupee2(b.sub)]);
  if (b.disc) rows.push([`Discount${b.discOk ? '' : opt.discNote || ''}`, '−' + rupee2(b.disc)]);
  rows.push([`GST ${b.gstPct}%`, rupee2(b.gst)]);
  if (b.round) rows.push([`Rounded up to ₹${b.roundTo || S.roundTo}`, '+' + rupee2(b.round)]);
  return rows.map((r) => `<div class="kv"><span>${esc(r[0])}</span><span>${r[1]}</span></div>`).join('') +
    `<div class="kv tot"><span>${opt.label || 'Estimated total'}</span><span>${rupee(b.total)}</span></div>` +
    (num(b.disc) ? `<div class="kv"><span style="color:var(--ok);font-weight:700">Customer saves</span><span style="color:var(--ok);font-weight:800">${rupee(Math.round(num(b.disc) * (1 + num(b.gstPct) / 100)))}</span></div>` : '');
}

// ---------------- working days (same rule as the server) ----------------
function addWorkDays(from, n) {
  const off = S.weeklyOff || [0], hol = new Set(S.holidays || []);
  if (off.length >= 7) return from;
  const d = new Date(from + 'T00:00:00Z'); let left = Math.max(0, Math.round(n));
  while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); const y = d.toISOString().slice(0, 10); if (!off.includes(d.getUTCDay()) && !hol.has(y)) left--; }
  return d.toISOString().slice(0, 10);
}
