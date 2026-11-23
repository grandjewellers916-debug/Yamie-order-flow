// Parser for the Yamie ERP "Locationwise Item Summary Report" (PDF text items).
// Each ornament has two printed lines: line 1 = Pc + Gross wt, line 2 = Lbl + Net wt.
// We take the CLOSING columns (last Pc/Lbl and last Gr/Net header on the page).
// Input: pages = [[{ str, x, y, w }]]  (pdf.js text items, y grows upward)

const num = (s) => { const t = s.replace(/,/g, '').trim(); return /^-?\d+(\.\d+)?$/.test(t) ? +t : null; };

export function parseErpPages(pages) {
  const rows = []; let total = null; let meta = {};
  for (const items of pages) {
    const its = items.filter((i) => i.str && i.str.trim());
    // header columns
    const hdr = its.filter((i) => /^Pc\/Lbl$|^Gr\/Net$/.test(i.str.trim()));
    if (!hdr.length) continue;
    const cols = hdr.map((h) => ({ kind: h.str.trim() === 'Pc/Lbl' ? 'pc' : 'wt', c: h.x + h.w / 2 })).sort((a, b) => a.c - b.c);
    const lastPc = [...cols].reverse().find((c) => c.kind === 'pc');
    const lastWt = [...cols].reverse().find((c) => c.kind === 'wt');
    const firstCol = cols[0].c - 40;
    const hdrY = Math.min(...hdr.map((h) => h.y));
    const rep = its.find((i) => /Between\s+\d/.test(i.str)); if (rep) meta.title = rep.str.trim();
    const loc = its.find((i) => /^\s*\d+\.\s+[A-Z ]+$/.test(i.str)); if (loc) meta.location = loc.str.trim();
    // group lines by y below the header
    const lines = new Map();
    for (const i of its) { if (i.y >= hdrY - 1) continue; const k = Math.round(i.y); const key = [...lines.keys()].find((y) => Math.abs(y - k) <= 2) ?? k; (lines.get(key) || lines.set(key, []).get(key)).push(i); }
    const ys = [...lines.keys()].sort((a, b) => b - a);
    const colOf = (i) => { const c = i.x + i.w / 2; let best = null, d = 1e9; for (const col of cols) { const dd = Math.abs(col.c - c); if (dd < d) { d = dd; best = col; } } return best; };
    const closingOf = (line) => { let pc = null, wt = null; for (const i of line) { const v = num(i.str); if (v == null || i.x < firstCol) continue; const col = colOf(i); if (col === lastPc) pc = v; else if (col === lastWt) wt = v; } return { pc, wt }; };
    for (let k = 0; k < ys.length; k++) {
      const line = lines.get(ys[k]).sort((a, b) => a.x - b.x);
      const nameParts = line.filter((i) => i.x < firstCol && num(i.str) == null).map((i) => i.str.trim());
      const name = nameParts.join(' ').replace(/\s+/g, ' ').trim();
      if (!name || /^Printed By|^Weight Error|^Ornament$/i.test(name)) continue;
      const a = closingOf(line);
      const nxt = ys[k + 1] != null ? lines.get(ys[k + 1]) : null;
      const nxtHasName = nxt && nxt.some((i) => i.x < firstCol && num(i.str) == null);
      const b = nxt && !nxtHasName ? closingOf(nxt) : { pc: null, wt: null };
      if (nxt && !nxtHasName) k++;
      const rec = { name, pcs: a.pc, lbl: b.pc, gr: a.wt, net: b.wt };
      if (/^Totals?$/i.test(name)) total = rec; else rows.push(rec);
    }
  }
  return { rows, total, meta };
}

/** Load a PDF (ArrayBuffer) with pdf.js and parse it. */
export async function parseErpPdf(data, pdfjs) {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    pages.push(tc.items.map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width })));
  }
  return parseErpPages(pages);
}

// ================= v1.37 ERP label-wise (product) report → pieces for the Grand-Yamie box =================
// Works from the column headers, so the exact layout does not matter: Label / Item / Purity / Gross / Net / Doc No / Doc Date / Supplier.
// Barcode = item code + label number (Bangle 14368 → BGL14368) using the label-code list.
const HDR = [
  ['label', /^(label|lbl|tag|barcode|bar code|lbl\s*no|label\s*no|tag\s*no|stock\s*no|sl\.?\s*no\.?\s*label)\b/i],
  ['code', /^(item\s*code|code|prefix)$/i],
  ['item', /^(item|item\s*name|ornament|product|description|particulars|category)\b/i],
  ['purity', /^(purity|touch|karat|kt|carat|fineness)\b/i],
  ['gross', /^(gross|gr\.?\s*wt|grwt|g\.?\s*wt|gross\s*wt|gross\s*weight|weight)\b/i],
  ['net', /^(net|nt\.?\s*wt|netwt|net\s*wt|net\s*weight)\b/i],
  ['docDate', /^(doc\.?\s*date|date|bill\s*date|vou\.?\s*date|inv\.?\s*date|voucher\s*date|invoice\s*date)\b/i],
  ['docNo', /^(doc|doc\.?\s*no|document|bill\s*no|voucher|vou\.?\s*no|inv|invoice|ref)\b/i],
  ['supplier', /^(supplier|party|vendor|from|supplier\s*name|party\s*name|account)\b/i],
];
const MON = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
export function normDate(v) {
  const t = String(v || '').trim(); let m;
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if ((m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  if ((m = t.match(/^(\d{1,2})[\s\-\/]([A-Za-z]{3})[A-Za-z]*[\s\-\/,]*(\d{2,4})/)) && MON[m[2].toUpperCase()]) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${String(MON[m[2].toUpperCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return t;
}
export function normPurity(v) {
  const t = String(v || '').toUpperCase().replace(/\s+/g, '');
  if (/^(22K|22KT|22CT|916|91\.6|22)$/.test(t)) return '22K'; if (/^(18K|18KT|18CT|750|75|18)$/.test(t)) return '18K';
  if (/^(14K|14KT|585|58\.5|14)$/.test(t)) return '14K'; if (/^(9K|9KT|375|37\.5|9)$/.test(t)) return '9K'; if (/^(24K|24KT|999|995)$/.test(t)) return t === '995' ? '995' : '999';
  return String(v || '').trim();
}
const numOf = (s) => { const t = String(s ?? '').replace(/,/g, '').trim(); return /^-?\d+(\.\d+)?$/.test(t) ? +t : null; };
/** codes = [{item, code}] → helpers */
export function codeHelpers(codes) {
  const byCode = new Map(codes.map((c) => [c.code.toUpperCase(), c.item]));
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  const itemCode = (name) => { const n = norm(name); if (!n) return ''; const exact = codes.find((c) => norm(c.item) === n); if (exact) return exact.code;
    const part = codes.filter((c) => n.includes(norm(c.item).replace(/s$/, '')) || norm(c.item).includes(n)).sort((a, b) => b.item.length - a.item.length)[0]; return part ? part.code : ''; };
  /** label + item → {barcode, code, item} */
  const barcode = (label, item, code) => { const L = String(label || '').toUpperCase().replace(/\s+/g, ''); let m;
    if ((m = L.match(/^([A-Z]{2,5})-?(\d+)$/)) && byCode.has(m[1])) return { barcode: m[1] + m[2], code: m[1], item: byCode.get(m[1]) };
    if ((m = L.match(/^([A-Z]{2,5})-?(\d+)$/))) return { barcode: m[1] + m[2], code: m[1], item: item || m[1] };
    const c = (code && byCode.has(String(code).toUpperCase()) ? String(code).toUpperCase() : '') || itemCode(item);
    if (/^\d+$/.test(L)) return { barcode: (c || '') + L, code: c, item: c ? byCode.get(c) : item };
    return { barcode: L, code: c, item: item || (c ? byCode.get(c) : '') }; };
  return { byCode, itemCode, barcode };
}
/** rows: array of {label, code, item, purity, gross, net, docNo, docDate, supplier} (strings) → clean pieces */
export function piecesFrom(rows, codes) {
  const H = codeHelpers(codes); const out = []; let curItem = '';
  for (const r of rows) {
    const gross = numOf(r.gross), net = numOf(r.net);
    if (!r.label && r.item && gross == null) { curItem = r.item; continue; }   // section heading line ("Bangle")
    if (!r.label || gross == null || /total/i.test(`${r.label} ${r.item}`)) continue;
    const b = H.barcode(r.label, r.item || curItem, r.code);
    out.push({ label: b.barcode, code: b.code, item: b.item || r.item || curItem, purity: normPurity(r.purity), wt: gross, net, docNo: String(r.docNo || '').trim(), docDate: normDate(r.docDate), party: String(r.supplier || '').trim(), warn: b.code ? '' : 'no item code' });
  }
  return out;
}
/** pasted table (tab separated, first row = headers) */
export function parsePasted(text, codes) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim()); if (lines.length < 2) return { pieces: [], cols: [] };
  const split = (l) => l.includes('\t') ? l.split('\t') : l.split(/\s{2,}|,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  const head = split(lines[0]).map((h) => h.replace(/"/g, '').trim()); const map = head.map((h) => (HDR.find(([, re]) => re.test(h)) || [null])[0]);
  if (map.filter(Boolean).length < 2) return { pieces: [], cols: head, error: 'Could not find the column headings (Label, Item, Purity, Gross, Net…) in the first row' };
  const rows = lines.slice(1).map((l) => { const c = split(l).map((x) => x.replace(/"/g, '').trim()); const r = {}; map.forEach((k, i) => { if (k && c[i] != null && !r[k]) r[k] = c[i]; }); return r; });
  return { pieces: piecesFrom(rows, codes), cols: map };
}
/** PDF text items → pieces, using the header line of each page */
export function parseLabelPages(pages, codes) {
  const rows = []; let cols = null; const found = new Set();
  for (const items of pages) {
    const its = items.filter((i) => i.str && i.str.trim()); const lines = [];
    for (const i of its.sort((a, b) => b.y - a.y || a.x - b.x)) { const L = lines.find((l) => Math.abs(l.y - i.y) <= 2.5); if (L) L.items.push(i); else lines.push({ y: i.y, items: [i] }); }
    lines.forEach((l) => l.items.sort((a, b) => a.x - b.x));
    // header = line with most heading words (≥3); join split headings like "Gross" + "Wt"
    let best = null, bestN = 0;
    for (const l of lines) { const hs = []; for (const i of l.items) { const t = i.str.trim(); const k = (HDR.find(([, re]) => re.test(t)) || [null])[0]; if (k) hs.push({ k, c: i.x + (i.w || 0) / 2, x0: i.x, x1: i.x + (i.w || 0) }); }
      const n = new Set(hs.map((h) => h.k)).size; if (n > bestN) { bestN = n; best = { y: l.y, hs }; } }
    if (best && bestN >= 3) { const seen = new Map(); for (const h of best.hs) if (!seen.has(h.k) || (h.k === 'docDate' && seen.get(h.k))) seen.set(h.k, h);
      // "Doc Date" may read as "date" twice; a lone "Date" next to Doc No is docDate
      cols = [...seen.values()].sort((a, b) => a.c - b.c); cols.forEach((c) => found.add(c.k)); }
    if (!cols) continue;
    const hy = best && bestN >= 3 ? best.y : Infinity;
    for (const l of lines) { if (l.y >= hy - 1) continue; const r = {};
      for (const i of l.items) { const c = i.x + (i.w || 0) / 2; let col = null, d = 1e9; for (const h of cols) { const dd = c >= h.x0 - 4 && c <= h.x1 + 4 ? 0 : Math.abs(h.c - c); if (dd < d) { d = dd; col = h; } }
        if (!col || d > 60) continue; r[col.k] = r[col.k] ? `${r[col.k]} ${i.str.trim()}` : i.str.trim(); }
      if (/printed|page\s*\d|^total/i.test(Object.values(r).join(' '))) continue;
      if (Object.keys(r).length) rows.push(r); }
  }
  return { pieces: piecesFrom(rows, codes), cols: [...found] };
}
export async function parseLabelPdf(data, pdfjs, codes) {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise; const pages = [];
  for (let p = 1; p <= doc.numPages; p++) { const tc = await (await doc.getPage(p)).getTextContent(); pages.push(tc.items.map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width }))); }
  return parseLabelPages(pages, codes);
}
