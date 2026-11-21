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
  const [mk, wd, ...phs] = await Promise.all([loadImg(LOGO.markW), loadImg(LOGO.wordW)].concat((spec.photos || []).slice(0, 3).map((p) => loadImg(imgUrl(p)))));
  const photos = phs.filter(Boolean);
  const KW = 400, VW = W - 2 * P - KW - 20;
  x.font = `500 31px ${F}`;
  const secs = (spec.sections || []).map(([t, rows]) => [t, rows.map(([k, v, b]) => ({ k: wrapT(x, k, KW), v: wrapT(x, v, VW), b }))]);
  x.font = `400 27px ${F}`;
  const foot = (spec.foot || []).map((t) => wrapT(x, '• ' + t, W - 2 * P));
  const headH = 300, phH = photos.length ? 330 : 0, bigH = spec.big ? 150 : 0;
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
    const n = photos.length, gap = 20, sz = Math.min(300, (W - 2 * P - gap * (n - 1)) / n);
    photos.forEach((im, i) => {
      const s = Math.min(im.width, im.height), sx = (im.width - s) / 2, sy = (im.height - s) / 2, px = P + i * (sz + gap);
      x.save(); x.beginPath(); x.roundRect ? x.roundRect(px, y, sz, sz, 22) : x.rect(px, y, sz, sz); x.clip(); x.drawImage(im, sx, sy, s, s, px, y, sz, sz); x.restore();
    });
    y += phH;
  }
  if (spec.big) {
    x.fillStyle = '#f8ebf0'; x.fillRect(P, y, W - 2 * P, 120);
    x.fillStyle = '#78213f'; x.font = `600 28px ${F}`; x.fillText(spec.big[0], P + 30, y + 48);
    x.font = `800 56px Georgia,serif`; x.textAlign = 'right'; x.fillText(spec.big[1], W - P - 30, y + 90); x.textAlign = 'left';
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

function itemRows(it, withPrice, line) {
  const rows = [
    ['Design', (it.design === 'ours' ? 'Yamie design' : 'Customised') + (it.designNo ? ' #' + it.designNo : '') + ' · rev ' + (it.rev || 1)],
  ];
  if (it.model) rows.push(['Model no.', it.model]);
  if (it.details) rows.push(['Details', it.details]);
  if (it.custom) rows.push(['Customisation', it.custom]);
  rows.push(['Metal', purLabel(it.purity) + ' · ' + it.colour]);
  if (it.size) rows.push(['Size / length', it.size]);
  if (it.dims) rows.push(['Width / thickness', it.dims]);
  (it.stones || []).forEach((s) => rows.push([stoneLabel(s.type), [s.shape, s.size, s.ct ? s.ct + ' ct' : '', s.pcs ? s.pcs + ' pc' : '', s.quality, s.setting].filter(Boolean).join(' · ')]));
  rows.push([withPrice ? 'Approx. net weight' : 'Target net weight', g3(line ? line.wt : it.wt)]);
  if (withPrice && line) {
    rows.push(['Gold value', rupee(line.metal) + ' @ ' + rupee(line.rate) + '/g']);
    if (line.stone) rows.push(['Stones', rupee(line.stone)]);
    if (line.making + line.va) rows.push(['Making / VA', rupee(line.making + line.va)]);
    if (line.other) rows.push(['Other', rupee(line.other)]);
  } else if (!withPrice && it.prodNotes) rows.push(['Production notes', it.prodNotes]);
  return rows;
}
const qtyName = (it, i) => `Item ${i + 1} · ${num(it.qty) > 1 ? it.qty + ' × ' : ''}${it.product || it.cat || 'Item'}`;
const allPhotos = (items) => items.reduce((a, it) => a.concat(it.photos || []), []);

async function shareCard(o, spec, phone, caption, label, after) {
  toast('Making the card…');
  let url;
  try { url = await drawCard(spec); } catch (e) { return toast('Could not draw the card'); }
  if (NATIVE && NATIVE.shareWhatsApp) {
    try { NATIVE.shareWhatsApp(waDigits(phone), caption, JSON.stringify([url])); } catch (e) { NATIVE.shareWhatsApp(waDigits(phone), caption, '[]'); }
  } else {
    openSheet(`<h2>${esc(label)}</h2><p class="sub">Download or copy the card, then send it in WhatsApp with the message.</p>
      <img src="${url}" style="width:100%;border-radius:12px;border:1px solid var(--line)" alt="">
      <div class="actions"><a class="btn secondary" href="${url}" download="${esc((spec.ref || 'card').replace(/\s+/g, '_'))}.jpg" style="text-align:center;text-decoration:none">Download</a>
      <button class="btn secondary" onclick="copyImg()">Copy image</button>
      <button class="btn" onclick="openWa(${esc(JSON.stringify(phone))}, ${esc(JSON.stringify(caption))})">Open WhatsApp</button></div>`);
    window._cardUrl = url;
  }
  const r = await step(o.id, (x) => { if (after) after(x); }, 'Shared · ' + label + ' → ' + phone);
  return r;
}
async function copyImg() {
  try {
    const blob = await (await fetch(window._cardUrl)).blob();
    const png = await new Promise((res) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); c.toBlob(res, 'image/png'); }; im.src = URL.createObjectURL(blob); });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    toast('Card copied — paste it in WhatsApp Web');
  } catch (e) { toast('Copy is not allowed here — use Download'); }
}

function estimateSpec(o, est) {
  const sections = est.items.map((it, i) => [qtyName(it, i), itemRows(it, true, est.lines[i])]);
  const sum = [['Value before tax', rupee(est.sub)]];
  if (est.disc) sum.push(['Discount', '−' + rupee(est.disc)]);
  sum.push([`GST ${est.gstPct}%`, rupee(est.gst)], ['Estimated total', rupee(est.total), true], [`Booking advance (min ${S.minAdv}%)`, rupee(est.minAdv)], ['Advance to lock the gold rate', rupee(est.lock)]);
  sections.push(['Estimate', sum]);
  return {
    title: 'Provisional estimate', ref: (est.no || 'EST') + (est.v > 1 ? ' v' + est.v : ''), sub: `${o.cust.name} · ${dt(est.at)} · valid till ${dshort(est.valid)}`,
    photos: allPhotos(est.items), big: ['Estimated total incl. GST', rupee(est.total)], sections,
    foot: ['Weights are approximate. The final price uses the actual weight at delivery.',
      `Delivery: at least ${S.leadDays} working days from order confirmation.`,
      `A ${S.minAdv}% booking advance confirms the order but does not lock the gold rate. Paying the metal value locks it.`,
      `Gold rates as on ${dt(est.at)}: ` + GOLD.filter((p) => rateOf(p, est.rates) > 0).map((p) => `${purShort(p)} ${rupee(rateOf(p, est.rates))}`).join(' · '),
      `Not a tax invoice. GSTIN ${S.gstin}.`],
  };
}
function sendEstimate(id, v) {
  const o = orders.find((x) => x.id === id), est = v ? o.ests.find((e) => e.v === v) : lastOf(o.ests);
  const cap = `Dear ${o.cust.name}, here is your Yamie estimate ${est.no || ''}: ${rupee(est.total)} incl. GST. Booking advance ${rupee(est.minAdv)}. Valid till ${dshort(est.valid)}. — ${S.shop}`;
  shareCard(o, estimateSpec(o, est), o.cust.phone, cap, 'Estimate ' + (est.no || ''));
}
function sendWorkOrder(id) {
  const o = orders.find((x) => x.id === id), v = o.vendor;
  const spec = {
    title: 'Work order', ref: o.ono || '', sub: `To ${v.name} · ETD ${dt(v.etd)}`, dark: true, photos: allPhotos(o.items),
    sections: o.items.map((it, i) => [qtyName(it, i), itemRows(it, false)]),
    foot: ['BIS hallmark with HUID required.', 'Tell us about any weight or stone difference before dispatch.', `Quote ${o.ono} on the delivery challan.`],
  };
  shareCard(o, spec, vendorPhone(v.name) || '', `Yamie work order ${o.ono} · ETD ${dt(v.etd)}`, 'Work order to ' + v.name, (x) => { if (!x.vendor.sentAt) x.vendor.sentAt = Date.now(); });
}
function sendFinal(id) {
  const o = orders.find((x) => x.id === id), fin = lastOf(o.finals);
  const sum = [['Value before tax', rupee(fin.sub)]];
  if (fin.disc) sum.push(['Discount', '−' + rupee(fin.disc)]);
  sum.push([`GST ${fin.gstPct}%`, rupee(fin.gst)], ['Final price', rupee(fin.total), true], ['Paid', rupee(verified(o))], ['Balance', rupee(Math.max(0, fin.total - verified(o))), true]);
  const spec = { title: 'Final price', ref: o.ono, sub: o.cust.name + ' · ' + dt(Date.now()), big: ['Final price incl. GST', rupee(fin.total)],
    sections: fin.items.map((it, i) => [qtyName(it, i), itemRows(it, true, fin.lines[i])]).concat([['Summary', sum]]),
    foot: [fin.basis + '.', `Estimate was ${rupee(fin.estTotal)} (${fin.var >= 0 ? '+' : ''}${fin.varPct}%) — the difference comes from the actual weight${o.lock === 'full' ? '' : ' and today\'s gold rate'}.`] };
  shareCard(o, spec, o.cust.phone, `Dear ${o.cust.name}, the final price of your order ${o.ono} is ${rupee(fin.total)} incl. GST. Please confirm. — ${S.shop}`, 'Final price');
}
function sendReady(id, again) {
  const o = orders.find((x) => x.id === id), fin = lastOf(o.finals);
  const spec = { title: 'Your order is ready', ref: o.ono, sub: o.cust.name, photos: allPhotos(o.items),
    sections: [['Order', o.items.map((it, i) => [qtyName(it, i), purShort(it.purity) + ' · ' + it.colour])], ['Payment', [['Final price', rupee(fin.total)], ['Paid', rupee(verified(o))], ['Balance to pay', rupee(balance(o)), true]]]],
    foot: [`Please visit us to collect it: ${S.shopAddr}.`, 'Bring this message and your advance receipt.'] };
  const cap = `Dear ${o.cust.name}, your Yamie order ${o.ono} is ready for pickup. Balance ${rupee(balance(o))}. — ${S.shop}, ${S.shopPhone}`;
  shareCard(o, spec, o.cust.phone, cap, 'Order ready', again ? null : (x) => { if (x.status === 'final_ok') x.status = 'ready'; });
}

function printEstimate(id) {
  const o = orders.find((x) => x.id === id), est = lastOf(o.ests);
  const rows = est.items.map((it, i) => { const l = est.lines[i]; return `<tr><td>${i + 1}</td><td><b>${esc(it.product)}</b>${it.designNo ? ' #' + esc(it.designNo) : ''}<br>${esc(it.details || '')}${it.custom ? '<br>' + esc(it.custom) : ''}${(it.stones || []).map((s) => '<br>' + esc(stoneLabel(s.type) + ' ' + [s.shape, s.size, s.ct ? s.ct + ' ct' : '', s.quality].filter(Boolean).join(' '))).join('')}</td>
    <td>${purShort(it.purity)} ${esc(it.colour)}</td><td class="r">${it.qty}</td><td class="r">${fmtN(l.wt)}</td><td class="r">${rupee(l.rate)}</td><td class="r">${rupee2(l.metal)}</td><td class="r">${rupee2(l.stone)}</td><td class="r">${rupee2(l.making + l.va)}</td><td class="r">${rupee2(l.sub)}</td></tr>`; }).join('');
  const h = `<div class="pdoc"><table style="border:0"><tr><td style="border:0"><h1>${esc(S.shop)}</h1>${esc(S.shopAddr)}<br>${esc(S.shopPhone)} · GSTIN ${esc(S.gstin)}</td>
    <td style="border:0;text-align:right"><h1>Provisional estimate</h1><b>${esc(est.no || '')}${est.v > 1 ? ' v' + est.v : ''}</b><br>${dt(est.at)} · valid till ${dt(est.valid)}</td></tr></table>
    <p><b>Customer:</b> ${esc(o.cust.name)} · ${esc(o.cust.phone)}</p>
    <table><tr><th>#</th><th>Item</th><th>Metal</th><th class="r">Qty</th><th class="r">Net wt (g)</th><th class="r">Rate</th><th class="r">Gold value</th><th class="r">Stones</th><th class="r">Making</th><th class="r">Amount</th></tr>${rows}</table>
    <table style="width:50%;margin-left:auto"><tr><td>Value before tax</td><td class="r">${rupee2(est.sub)}</td></tr>${est.disc ? `<tr><td>Discount</td><td class="r">−${rupee2(est.disc)}</td></tr>` : ''}
    <tr><td>GST ${est.gstPct}%</td><td class="r">${rupee2(est.gst)}</td></tr><tr><th>Estimated total</th><th class="r">${rupee(est.total)}</th></tr><tr><td>Booking advance (min ${S.minAdv}%)</td><td class="r">${rupee(est.minAdv)}</td></tr></table>
    <p style="font-size:11px;color:#555">Weights are approximate; the final price uses the actual weight at delivery. Delivery at least ${S.leadDays} working days from confirmation. A ${S.minAdv}% advance confirms the order but does not lock the gold rate; paying the metal value (${rupee(est.lock)}) locks it. Not a tax invoice.</p>
    <p style="margin-top:40px">Customer signature ____________________ &nbsp;&nbsp; For ${esc(S.shop)} ____________________</p></div>`;
  if (NATIVE && NATIVE.printHtml) { NATIVE.printHtml('<!doctype html><html><head><meta charset="utf-8"><style>' + document.querySelector('style').textContent + ' #printArea{display:block}</style></head><body><div id="printArea">' + h + '</div></body></html>', 'Yamie estimate ' + (est.no || '')); return; }
  $('printArea').innerHTML = h; window.print(); setTimeout(() => { $('printArea').innerHTML = ''; }, 800);
}
