// ======================================================================
// Picture cards (customer estimate, vendor work order, final price, ready),
// WhatsApp sharing and A4 print. Vendor cards never show prices or customer details.
// ======================================================================
function loadImg(src) {
  return new Promise((res) => {
    if (!src) return res(null);
    const im = new Image();
    if (/^https?:/.test(src)) im.crossOrigin = 'anonymous';
    im.onload = () => res(im); im.onerror = () => res(null); im.src = src;
  });
}
function wrapT(x, text, w) {
  const out = [];
  String(text || '').split('\n').forEach((para) => {
    let line = '';
    para.split(' ').forEach((word) => {
      const t = line ? line + ' ' + word : word;
      if (x.measureText(t).width > w && line) { out.push(line); line = word; } else line = t;
    });
    out.push(line);
  });
  return out;
}
/** spec: {title, ref, sub, photos[], sections:[[title,[[k,v,bold]]]], big:[label,value], foot:[], dark} */
async function drawCard(spec) {
  const W = 1080, P = 64, F = '-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
  const c = document.createElement('canvas'), x = c.getContext('2d');
  c.width = W; c.height = 10;
  const [mk, wd, ...phs] = await Promise.all([loadImg(LOGO.markW), loadImg(LOGO.wordW)].concat((spec.photos || []).slice(0, 9).map((p) => loadImg(imgUrl(p)))));
  const photos = phs.filter(Boolean);
  const KW = 400, VW = W - 2 * P - KW - 20;
  x.font = `500 31px ${F}`;
  const secs = (spec.sections || []).map(([t, rows]) => [t, rows.map(([k, v, b]) => ({ k: wrapT(x, k, KW), v: wrapT(x, v, VW), b }))]);
  x.font = `400 27px ${F}`;
  const foot = (spec.foot || []).map((t) => wrapT(x, '• ' + t, W - 2 * P));
  const HW = W - 2 * P, hero = photos[0], heroH = hero ? Math.round(HW * Math.max(0.62, Math.min(1, hero.height / hero.width))) : 0;
  const thumbs = photos.slice(1), TG = 18, TS = Math.floor((HW - TG * 3) / 4), thRows = Math.ceil(thumbs.length / 4);
  const headH = 300, phH = hero ? heroH + 24 + (thRows ? thRows * (TS + TG) + 6 : 0) : 0, bigH = spec.big ? 150 : 0;
  const secH = secs.reduce((s, [, rows]) => s + 80 + rows.reduce((t, r) => t + Math.max(r.k.length, r.v.length) * 42 + 16, 0), 0);
  const footH = foot.reduce((t, l) => t + l.length * 37 + 8, 0) + 40;
  const H = headH + 40 + phH + bigH + secH + footH + 120;
  c.height = H;
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, W, headH);
  g.addColorStop(0, spec.dark ? '#2b2328' : '#5a1730'); g.addColorStop(1, spec.dark ? '#463a40' : '#8d2c4e');
  x.fillStyle = g; x.fillRect(0, 0, W, headH);
  if (mk) x.drawImage(mk, P, 40, 120, 80);
  if (wd) x.drawImage(wd, P + 140, 52, 230, 55);
  x.fillStyle = '#ffffffcc'; x.font = `700 20px ${F}`; x.fillText('FINE JEWELLERY · LEGACY 1986', P + 142, 135);
  x.fillStyle = '#fff'; x.font = `700 52px Georgia,serif`; x.fillText(spec.title, P, 222);
  x.font = `600 30px ${F}`; x.fillStyle = '#f5dbe5'; x.fillText(spec.sub || '', P, 270);
  x.textAlign = 'right'; x.font = `700 34px ${F}`; x.fillStyle = '#fff'; x.fillText(spec.ref || '', W - P, 92); x.textAlign = 'left';
  let y = headH + 40;
  if (photos.length) {
    // Large hero photo of the product, then the rest as thumbnails (cover-cropped).
    const cover = (im, px, py, w, h, r) => {
      const k = Math.max(w / im.width, h / im.height), sw = w / k, sh = h / k, sx = (im.width - sw) / 2, sy = (im.height - sh) / 2;
      x.save(); x.beginPath(); x.roundRect ? x.roundRect(px, py, w, h, r) : x.rect(px, py, w, h); x.clip(); x.fillStyle = '#f8ebf0'; x.fillRect(px, py, w, h); x.drawImage(im, sx, sy, sw, sh, px, py, w, h); x.restore();
    };
    cover(hero, P, y, HW, heroH, 26);
    thumbs.forEach((im, i) => cover(im, P + (i % 4) * (TS + TG), y + heroH + 24 + Math.floor(i / 4) * (TS + TG), TS, TS, 18));
    y += phH;
  }
  if (spec.big) {
    x.fillStyle = '#f8ebf0'; x.fillRect(P, y, W - 2 * P, 120);
    x.fillStyle = '#78213f'; x.font = `600 28px ${F}`; x.fillText(spec.big[0], P + 30, y + 48);
    x.font = `800 56px Georgia,serif`; x.textAlign = 'right'; x.fillText(spec.big[1], W - P - 30, y + 90); x.textAlign = 'left';
    if (spec.big[2]) {
      x.fillStyle = '#287b56'; x.beginPath(); x.roundRect ? x.roundRect(P + 30, y + 66, 300, 40, 20) : x.rect(P + 30, y + 66, 300, 40); x.fill();
      x.fillStyle = '#fff'; x.font = `800 24px ${F}`; x.fillText(spec.big[2], P + 48, y + 94);
    }
    y += bigH;
  }
  secs.forEach(([t, rows]) => {
    x.fillStyle = '#78213f'; x.font = `800 30px ${F}`; x.fillText(t, P, y + 40);
    x.fillStyle = '#e9e2e5'; x.fillRect(P, y + 58, W - 2 * P, 2);
    y += 80;
    rows.forEach((r) => {
      x.font = `500 31px ${F}`; x.fillStyle = '#83767d';
      r.k.forEach((l, i) => x.fillText(l, P, y + 30 + i * 42));
      x.font = `${r.b ? 800 : 500} 31px ${F}`; x.fillStyle = '#251f23'; x.textAlign = 'right';
      r.v.forEach((l, i) => x.fillText(l, W - P, y + 30 + i * 42)); x.textAlign = 'left';
      y += Math.max(r.k.length, r.v.length) * 42 + 16;
    });
  });
  y += 20;
  x.font = `400 27px ${F}`; x.fillStyle = '#6d6067';
  foot.forEach((ls) => { ls.forEach((l) => { x.fillText(l, P, y + 28); y += 37; }); y += 8; });
  x.fillStyle = '#f8ebf0'; x.fillRect(0, H - 100, W, 100);
  x.fillStyle = '#78213f'; x.font = `700 27px ${F}`; x.fillText(`${S.shop} · ${S.shopPhone}`, P, H - 58);
  x.font = `400 22px ${F}`; x.fillStyle = '#83767d'; x.fillText(S.shopAddr.slice(0, 90), P, H - 24);
  return c.toDataURL('image/jpeg', 0.9);
}

// How making is shown to the customer: 'type' (amount + VA %/₹ per g), 'amount' (amount only), 'hide' (inside the gold value).
const MK_SHOW = [['type', 'Show making type and amount'], ['amount', 'Show making amount only'], ['typeonly', 'Show making type only (amount in gold value)'], ['hide', 'Hide making (included in the gold value)']];
const mkShowOf = (o) => (o && o.mkShow) || S.mkShow || 'type';
const mkLabel = (it) => (it.mkMode === 'pg' ? `₹${num(it.mkPg)}/g` : it.mkMode === 'combo' ? `₹${num(it.mkPg)}/g + ${num(it.mk)}%` : it.mkMode === 'flat' ? `₹${num(it.mk)} flat` : `VA ${num(it.mk)}%`);
/** Customer saving from a discount (discount + the GST on it). */
const savingOf = (b) => saveOfB(b);
function itemRows(it, withPrice, line, mkShow) {
  const rows = [
    ['Design', (it.design === 'ours' ? 'Yamie design' : 'Customised') + (it.designNo ? ' #' + it.designNo : '') + ' · rev ' + (it.rev || 1)],
  ];
  if (it.model) rows.push([it.design === 'custom' ? 'Model reference' : 'Model no.', it.model]);
  if (it.details) rows.push(['Details', it.details]);
  if (it.custom) rows.push(['Customisation', it.custom]);
  rows.push(['Metal', purLabel(it.purity) + ' · ' + it.colour]);
  if (it.size) rows.push([sizeLabel(it.cat), it.size]);
  if (it.dims) rows.push(['Width / thickness', it.dims]);
  const spx = specText(it); if (spx) rows.push(['Details', spx]);
  (it.stones || []).forEach((s) => rows.push([stoneLabel(s.type) + (s.gem ? ' · ' + s.gem : ''), [s.shape, s.size ? s.size + ' mm' : '', s.ct ? s.ct + ' ct' : '', s.pcs ? s.pcs + ' pc' : '', s.quality, s.colour, s.setting].filter(Boolean).join(' · ')]));
  rows.push([withPrice ? 'Approx. net weight' : 'Target net weight', g3(line ? line.wt : it.wt)]);
  if (withPrice && line) {
    const mk = line.making + line.va, ms = mkShow || 'type';
    const fl = mkShowFlags(ms);
    if (!fl.amt) rows.push([fl.type ? `Gold value incl. making (${mkLabel(it)})` : 'Gold value incl. making', rupee(line.metal + mk)]);
    else rows.push(['Gold value', rupee(line.metal) + ' @ ' + rupee(line.rate) + '/g']);
    if (line.stone) rows.push(['Stones', rupee(line.stone)]);
    if (mk && fl.amt) rows.push([fl.type ? `Making (${mkLabel(it)})` : 'Making charges', rupee(mk)]);
    if (line.huid) rows.push([`HUID (${line.huidN} × ₹${num(S.huidRate)})`, rupee(line.huid)]);
    if (line.other) rows.push(['Other', rupee(line.other)]);
  } else if (!withPrice && it.prodNotes) rows.push(['Production notes', it.prodNotes]);
  return rows;
}
function vendorRows(it) {
  const rows = [['Item', [it.cat, it.product].filter(Boolean).join(' · ')], ['Quantity', String(it.qty || 1)], ['Purity', purLabel(it.purity)], ['Colour', it.colour]];
  if (it.size) rows.push([sizeLabel(it.cat), it.size]);
  rows.push(['Design no.', (it.designNo || '—') + (it.design === 'custom' ? ' (customised)' : '') + ' · rev ' + (it.rev || 1)]);
  if (it.model) rows.push([it.design === 'custom' ? 'Model reference' : 'Model no.', it.model]);
  rows.push(['Gross wt (target)', g3(it.gwt)], ['Net wt (target)', g3(it.wt)]);
  const sp = specText(it); if (sp) rows.push(['Details', sp]);
  if (it.dims) rows.push(['Width / other', it.dims]);
  if (it.details) rows.push(['Design details', it.details]);
  if (it.custom) rows.push(['Customisation', it.custom]);
  (it.stones || []).forEach((s, k) => rows.push([`Stone ${k + 1} · ${stoneLabel(s.type)}${s.gem ? ' · ' + s.gem : ''}`,
    [s.shape, s.size ? s.size + ' mm' : '', s.ct ? s.ct + ' ct' : '', s.pcs ? s.pcs + ' pc' : '', s.wtg ? s.wtg + ' g' : '', s.quality, s.colour ? 'colour ' + s.colour : '', s.setting].filter(Boolean).join(' · ')]));
  if (it.prodNotes) rows.push(['Production notes', it.prodNotes]);
  return rows;
}
const qtyName = (it, i) => `Item ${i + 1} · ${num(it.qty) > 1 ? it.qty + ' × ' : ''}${it.product || it.cat || 'Item'}`;
const allPhotos = (items) => items.reduce((a, it) => a.concat(it.photos || [], it.refs || []), []);

async function shareCard(o, spec, phone, caption, label, after) {
  toast('Making the card…');
  let url;
  try { url = spec.draw ? await spec.draw() : await drawCard(spec); } catch (e) { console.error(e); return toast('Could not draw the card'); }
  if (NATIVE && NATIVE.shareWhatsApp) {
    try { NATIVE.shareWhatsApp(waDigits(phone), caption, JSON.stringify([url])); } catch (e) { NATIVE.shareWhatsApp(waDigits(phone), caption, '[]'); }
  } else {
    window._cardUrl = url; window._cardCap = caption; window._cardPhone = phone;
    const fileName = (spec.ref || 'card').replace(/\s+/g, '_') + '.jpg';
    openSheet(`<h2>${esc(label)}</h2>
      <img src="${url}" style="width:100%;border-radius:12px;border:1px solid var(--line)" alt="">
      <div class="actions"><button class="btn ok" onclick="waSendCard(${esc(JSON.stringify(fileName))})">Send on WhatsApp</button>
      <a class="btn secondary" href="${url}" download="${esc(fileName)}" style="text-align:center;text-decoration:none">Download</a></div>
      <p class="hint">On a phone the card goes straight into WhatsApp. On a computer the card is copied and the customer's WhatsApp chat opens: press Ctrl+V to paste it.</p>`);
  }
  const r = await step(o.id, (x) => { if (after) after(x); }, 'Shared · ' + label + ' → ' + phone);
  return r;
}
async function waSendCard(fileName) {
  const url = window._cardUrl, cap = window._cardCap, phone = window._cardPhone;
  try {
    const blob = await (await fetch(url)).blob(), file = new File([blob], fileName, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) { await navigator.share({ files: [file], text: cap }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const ok = await copyImg(true);
  openWa(phone, cap);
  if (ok) toast('Card copied — press Ctrl+V in the chat');
}
async function copyImg(quiet) {
  try {
    const blob = await (await fetch(window._cardUrl)).blob();
    const png = await new Promise((res) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); c.toBlob(res, 'image/png'); }; im.src = URL.createObjectURL(blob); });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    if (!quiet) toast('Card copied — paste it in WhatsApp Web');
    return true;
  } catch (e) { if (!quiet) toast('Copy is not allowed here — use Download'); return false; }
}

function estimateSpec(o, est) {
  const ms = mkShowOf(o), save = savingOf(est);
  const sections = est.items.map((it, i) => [qtyName(it, i), itemRows(it, true, est.lines[i], ms)]);
  const sum = [['Value before tax', rupee(est.sub)]];
  if (est.disc) sum.push(['Discount', '−' + rupee(est.disc)]);
  sum.push([`GST ${est.gstPct}%`, rupee(est.gst)], ['Estimated total', rupee(est.total), true]);
  if (save) sum.push(['You save', rupee(save), true]);
  sum.push( [`Booking advance (min ${S.minAdv}%)`, rupee(est.minAdv)], ['Advance to lock the gold rate', rupee(est.lock)]);
  sections.push(['Estimate', sum]);
  return {
    title: 'Provisional estimate', ref: (est.no || 'EST') + (est.v > 1 ? ' v' + est.v : ''), sub: `${o.cust.name} · ${dt(est.at)} · valid till ${dshort(est.valid)}`,
    photos: allPhotos(est.items), big: ['Estimated total incl. GST', rupee(est.total), save ? 'You save ' + rupee(save) : ''], sections,
    foot: ['Weights are approximate. The final price uses the actual weight at delivery.',
      `Delivery: at least ${S.leadDays} working days from order confirmation.`,
      `A ${S.minAdv}% booking advance confirms the order but does not lock the gold rate. Paying the metal value locks it.`,
      `Gold rates as on ${dt(est.at)}: ` + GOLD.filter((p) => rateOf(p, est.rates) > 0).map((p) => `${purShort(p)} ${rupee(rateOf(p, est.rates))}`).join(' · '),
      `Not a tax invoice. GSTIN ${S.gstin}.`],
  };
}
function sendEstimate(id, v) {
  const o = orders.find((x) => x.id === id), est = v ? o.ests.find((e) => e.v === v) : lastOf(o.ests);
  const sv = savingOf(est);
  const cap = `Dear ${o.cust.name}, here is your Yamie estimate ${est.no || ''}: ${rupee(est.total)} incl. GST${sv ? ' (you save ' + rupee(sv) + ')' : ''}. Booking advance ${rupee(est.minAdv)}. Valid till ${dshort(est.valid)}. — ${S.shop}`;
  shareCard(o, { ref: est.no || 'Estimate', draw: () => cardEstimate(o, est) }, o.cust.phone, cap, 'Estimate ' + (est.no || ''));
}
function sendWorkOrder(id) {
  const o = orders.find((x) => x.id === id), v = o.vendor;
  const spec = { ref: o.ono || 'Work-order', draw: () => cardWork(o) };
  shareCard(o, spec, vendorPhone(v.name) || '', `Yamie work order ${o.ono} · ETD ${dt(v.etd)}`, 'Work order to ' + v.name, (x) => { if (!x.vendor.sentAt) x.vendor.sentAt = Date.now(); });
}
function sendFinal(id) {
  const o = orders.find((x) => x.id === id), fin = lastOf(o.finals);
  const ms = mkShowOf(o), save = savingOf(fin);
  const sum = [['Value before tax', rupee(fin.sub)]];
  if (fin.disc) sum.push(['Discount', '−' + rupee(fin.disc)]);
  sum.push([`GST ${fin.gstPct}%`, rupee(fin.gst)], ['Final price', rupee(fin.total), true]);
  if (save) sum.push(['You save', rupee(save), true]);
  sum.push( ['Paid', rupee(verified(o))], ['Balance', rupee(Math.max(0, fin.total - verified(o))), true]);
  const spec = { title: 'Final price', ref: o.ono, sub: o.cust.name + ' · ' + dt(Date.now()), big: ['Final price incl. GST', rupee(fin.total), save ? 'You save ' + rupee(save) : ''],
    sections: fin.items.map((it, i) => [qtyName(it, i), itemRows(it, true, fin.lines[i], ms)]).concat([['Summary', sum]]),
    foot: ['Please reply OK on WhatsApp to confirm this price.', fin.basis + '.', `Estimate was ${rupee(fin.estTotal)} (${fin.var >= 0 ? '+' : ''}${fin.varPct}%) — the difference comes from the actual weight${o.lock === 'full' ? '' : ' and today\'s gold rate'}.`] };
  shareCard(o, spec, o.cust.phone, `Dear ${o.cust.name}, the final price of your Yamie order ${o.ono} is ${rupee(fin.total)} incl. GST${save ? ' (you save ' + rupee(save) + ')' : ''} (balance ${rupee(Math.max(0, fin.total - verified(o)))}). Please reply OK to confirm. — ${S.shop}`, 'Final price (asked for OK)');
}
function sendReady(id, again) {
  const o = orders.find((x) => x.id === id), fin = lastOf(o.finals);
  const spec = { ref: o.ono || 'Order-ready', draw: () => cardReady(o) };
  const sv = savingOf(fin), sh = (fin && fin.shipInfo) || o.ship;
  const cap = `Dear ${o.cust.name}, your Yamie order ${o.ono} is ready. Final price ${rupee(fin.total)} incl. GST${sv ? ' (you save ' + rupee(sv) + ')' : ''}. Balance ${rupee(balance(o))}.${fin.valid ? ' Price valid till ' + dshort(fin.valid) + '.' : ''}${sh ? ' We will ship it by ' + sh.by + ' once the balance is paid.' : ' Please visit us to collect it.'} — ${S.shop}, ${S.shopPhone2 || S.shopPhone}`;
  shareCard(o, spec, o.cust.phone, cap, 'Order ready', again ? null : (x) => { if (x.status === 'final_ok') x.status = 'ready'; });
}

function printEstimate(id) {
  const o = orders.find((x) => x.id === id), est = lastOf(o.ests);
  const ms = mkShowOf(o), hideMk = !mkShowFlags(ms).amt, save = savingOf(est);
  const rows = est.items.map((it, i) => { const l = est.lines[i]; return `<tr><td>${i + 1}</td><td><b>${esc(it.product)}</b>${it.designNo ? ' #' + esc(it.designNo) : ''}<br>${esc(it.details || '')}${it.custom ? '<br>' + esc(it.custom) : ''}${(it.stones || []).map((s) => '<br>' + esc(stoneLabel(s.type) + ' ' + [s.shape, s.size, s.ct ? s.ct + ' ct' : '', s.quality].filter(Boolean).join(' '))).join('')}</td>
    <td>${purShort(it.purity)} ${esc(it.colour)}</td><td class="r">${it.qty}</td><td class="r">${fmtN(l.wt)}</td><td class="r">${rupee(l.rate)}</td><td class="r">${rupee2(hideMk ? l.metal + l.making + l.va : l.metal)}</td><td class="r">${rupee2(l.stone)}</td>${hideMk ? '' : `<td class="r">${rupee2(l.making + l.va)}${mkShowFlags(ms).type ? '<br><small>' + esc(mkLabel(it)) + '</small>' : ''}${l.mkSave ? '<br><small>was ' + rupee2(l.mkFull) + '</small>' : ''}</td>`}<td class="r">${rupee2(l.sub)}</td></tr>`; }).join('');
  const h = `<div class="pdoc"><table style="border:0"><tr><td style="border:0"><h1>${esc(S.shop)}</h1>${esc(S.shopAddr)}<br>${esc(S.shopPhone)} · GSTIN ${esc(S.gstin)}</td>
    <td style="border:0;text-align:right"><h1>Provisional estimate</h1><b>${esc(est.no || '')}${est.v > 1 ? ' v' + est.v : ''}</b><br>${dt(est.at)} · valid till ${dt(est.valid)}</td></tr></table>
    <p><b>Customer:</b> ${esc(o.cust.name)} · ${esc(o.cust.phone)}</p>
    <table><tr><th>#</th><th>Item</th><th>Metal</th><th class="r">Qty</th><th class="r">Net wt (g)</th><th class="r">Rate</th><th class="r">${hideMk ? 'Gold value incl. making' : 'Gold value'}</th><th class="r">Stones</th>${hideMk ? '' : '<th class="r">Making</th>'}<th class="r">Amount</th></tr>${rows}</table>
    <table style="width:50%;margin-left:auto"><tr><td>Value before tax</td><td class="r">${rupee2(est.sub)}</td></tr>${est.disc ? `<tr><td>Discount</td><td class="r">−${rupee2(est.disc)}</td></tr>` : ''}
    <tr><td>GST ${est.gstPct}%</td><td class="r">${rupee2(est.gst)}</td></tr><tr><th>Estimated total</th><th class="r">${rupee(est.total)}</th></tr>${save ? `<tr><th style="color:#287b56">You save</th><th class="r" style="color:#287b56">${rupee(save)}</th></tr>` : ''}<tr><td>Booking advance (min ${S.minAdv}%)</td><td class="r">${rupee(est.minAdv)}</td></tr></table>
    <p style="font-size:11px;color:#555">Weights are approximate; the final price uses the actual weight at delivery. Delivery at least ${S.leadDays} working days from confirmation. A ${S.minAdv}% advance confirms the order but does not lock the gold rate; paying the metal value (${rupee(est.lock)}) locks it. Not a tax invoice.</p>
    <p style="margin-top:40px">Customer signature ____________________ &nbsp;&nbsp; For ${esc(S.shop)} ____________________</p></div>`;
  if (NATIVE && NATIVE.printHtml) { NATIVE.printHtml('<!doctype html><html><head><meta charset="utf-8"><style>' + document.querySelector('style').textContent + ' #printArea{display:block}</style></head><body><div id="printArea">' + h + '</div></body></html>', 'Yamie estimate ' + (est.no || '')); return; }
  $('printArea').innerHTML = h; window.print(); setTimeout(() => { $('printArea').innerHTML = ''; }, 800);
}
