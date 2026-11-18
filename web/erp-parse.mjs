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
