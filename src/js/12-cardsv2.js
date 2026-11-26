// ======================================================================
// V1.8 picture cards: Provisional estimate (maroon), Work order (purple, no prices),
// Your order is ready (light, with the final price). 1080 px wide, drawn on canvas.
// ======================================================================
const CI = {
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0a4 4 0 1 1 8 0',
  cal: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01',
  gem: 'M6 3h12l4 6-10 13L2 9zM2 9h20M12 22L8 9l4-6 4 6z',
  code: 'M4 5v14M7 5v14M11 5v14M14 5v14M18 5v14M21 5v14',
  bars: 'M2 20h9l-1.6-5H3.6zM13 20h9l-1.6-5h-5.8zM7.5 14h9l-1.6-5H9.1z',
  oval: 'M2 12a10 4.5 0 1 0 20 0a10 4.5 0 1 0-20 0',
  layers: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  bag: 'M6 8h12l2 13H4zM9 8V6a3 3 0 0 1 6 0v2M10.5 14h3',
  gear: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6zM12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l13-4v4M16 13.5h2',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4M12 15v2',
  info: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20zM12 16v-5M12 8h.01',
  wa: 'M3.5 20.5l1.4-4.2A8.6 8.6 0 1 1 8 19.3zM9 8.6c0 3.2 3 6.4 6.4 6.4l1.2-1.4-2.1-1-1 1c-1.1-.5-2.4-1.9-2.9-2.9l1-1-1-2.1z',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2a19.8 19.8 0 0 1-8.6-3.1a19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01',
  hash: 'M4 9h16M4 15h16M10 3L8 21M16 3l-2 18',
  palette: 'M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-1.2-1-1.6-1-2.6 0-1.1.9-2 2-2h2.4A5.6 5.6 0 0 0 22 10.6C22 5.8 17.5 2 12 2zM7.5 11h.01M9.5 7h.01M14.5 7h.01',
  clip: 'M9 3h6v3H9zM8 4.5H5V21h14V4.5h-3M8 11h8M8 15h8M8 19h5',
  ruler: 'M2 8h20v8H2zM6 8v3M10 8v4M14 8v3M18 8v4',
  ring: 'M12 8.5a6.5 6.5 0 1 0 .01 0zM9 3.5h6L12 8z',
  stone: 'M7 3h10l4 5-9 13L3 8zM3 8h18',
  truck: 'M2 6h12v10H2zM14 9h4l3 3v4h-7M6 19a2 2 0 1 0 0-4a2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4a2 2 0 0 0 0 4z',
  check: 'M6.5 12.5l3.6 3.6L17.5 8.5',
};
const CARD_F = '-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
const THEMES = {
  est: { a: '#5c0f2b', b: '#8e2350', ink: '#6e1533', soft: '#f8ecef', soft2: '#fcf6f7', line: '#ead7dd', txt: '#2a2024', mute: '#6b5d62', dark: true },
  work: { a: '#3d0f63', b: '#8f34bd', ink: '#4b1676', soft: '#f1e8f9', soft2: '#f8f3fc', line: '#e0d1ee', txt: '#231d29', mute: '#625a6a', dark: true },
  ready: { a: '#6e1533', b: '#8e2350', ink: '#7a1a3a', soft: '#f9edea', soft2: '#fcf6f4', line: '#eddcd6', txt: '#2a2024', mute: '#6b5d62', dark: false },
};

function cardKit(T) {
  const W = 1080, c = document.createElement('canvas'), x = c.getContext('2d');
  c.width = W; c.height = 4200;
  const fnt = (sz, wt) => `${wt || 400} ${sz}px ${CARD_F}`;
  const k = {
    W, c, x, T, fnt,
    rr(px, py, w, h, r) { x.beginPath(); if (x.roundRect) x.roundRect(px, py, w, h, r); else x.rect(px, py, w, h); },
    box(px, py, w, h, r, fill, stroke, lw) { k.rr(px, py, w, h, r); if (fill) { x.fillStyle = fill; x.fill(); } if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw || 2; x.stroke(); } },
    t(s, px, py, sz, wt, col, al) { x.font = fnt(sz, wt); x.fillStyle = col || T.txt; x.textAlign = al || 'left'; x.fillText(String(s == null ? '' : s), px, py); const w = x.measureText(String(s == null ? '' : s)).width; x.textAlign = 'left'; return w; },
    wrap(s, maxW, sz, wt) { x.font = fnt(sz, wt); return wrapT(x, s, maxW); },
    tw(s, sz, wt) { x.font = fnt(sz, wt); return x.measureText(String(s)).width; },
    icon(n, px, py, sz, col, lw) { if (!CI[n] || typeof Path2D === 'undefined') return; x.save(); x.translate(px, py); x.scale(sz / 24, sz / 24); x.strokeStyle = col || T.ink; x.lineWidth = (lw || 1.8); x.lineCap = 'round'; x.lineJoin = 'round'; x.stroke(new Path2D(CI[n])); x.restore(); },
    contain(im, px, py, w, h, pad) { if (!im) return; const p = pad || 0, s = Math.min((w - 2 * p) / im.width, (h - 2 * p) / im.height), dw = im.width * s, dh = im.height * s; x.drawImage(im, px + (w - dw) / 2, py + (h - dh) / 2, dw, dh); },
    grad(x0, y0, x1, y1, a, b) { const g = x.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; },
  };
  return k;
}
/** Header band with logo, reference and a wave on its lower edge. */
async function cardHead(k, ref, pillRef) {
  const { x, W, T } = k;
  const [mk, wd] = await Promise.all([loadImg(T.dark ? LOGO.markW : LOGO.markM), loadImg(T.dark ? LOGO.wordW : LOGO.wordM)]);
  if (T.dark) {
    x.fillStyle = k.grad(0, 0, W, 140, T.a, T.b);
    x.beginPath(); x.moveTo(0, 0); x.lineTo(W, 0); x.lineTo(W, 92); x.bezierCurveTo(W * 0.82, 96, W * 0.7, 132, W * 0.52, 134); x.lineTo(0, 134); x.closePath(); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.22)';
    x.beginPath(); x.moveTo(W * 0.52, 134); x.bezierCurveTo(W * 0.7, 132, W * 0.82, 96, W, 92); x.lineTo(W, 108); x.bezierCurveTo(W * 0.84, 110, W * 0.72, 140, W * 0.56, 142); x.closePath(); x.fill();
  } else {
    x.fillStyle = T.soft2; x.fillRect(0, 0, W, 260);
    x.strokeStyle = 'rgba(214,164,120,0.55)'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(W * 0.6, 250); x.bezierCurveTo(W * 0.78, 200, W * 0.88, 130, W, 100); x.stroke();
    x.fillStyle = 'rgba(232,196,170,0.25)'; x.beginPath(); x.moveTo(W * 0.62, 260); x.bezierCurveTo(W * 0.8, 210, W * 0.9, 140, W, 112); x.lineTo(W, 260); x.closePath(); x.fill();
  }
  if (mk) k.contain(mk, 52, 28, 96, 70);
  if (wd) { const h = 50, w = wd.width * h / wd.height; x.drawImage(wd, 164, 30, w, h); }
  k.t('FINE JEWELLERY · LEGACY 1986', 168, 103, 17, 600, T.dark ? 'rgba(255,255,255,0.88)' : T.ink);
  if (pillRef) {
    const w = k.tw(ref, 28, 700) + 52, px = W - 52 - w;
    if (!T.dark) { x.strokeStyle = T.line; x.lineWidth = 2; x.beginPath(); x.moveTo(px - 40, 28); x.lineTo(px - 40, 98); x.stroke(); }
    k.box(px, 34, w, 54, 27, null, T.dark ? 'rgba(255,255,255,0.85)' : T.ink, 2.5);
    k.t(ref, px + w / 2, 71, 28, 700, T.dark ? '#fff' : T.ink, 'center');
  } else k.t(ref, W - 56, 72, 30, 700, '#fff', 'right');
}
/** Footer band with wave, shop name, address and phone numbers. */
function cardFoot(k, y, phones) {
  const { x, W, T } = k, H = 150;
  x.fillStyle = k.grad(0, y, W, y + H, T.a, T.b);
  x.beginPath(); x.moveTo(0, y + 14); x.bezierCurveTo(W * 0.3, y - 4, W * 0.7, y - 4, W, y + 14); x.lineTo(W, y + H); x.lineTo(0, y + H); x.closePath(); x.fill();
  x.strokeStyle = 'rgba(232,196,150,0.55)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(W * 0.62, y + H); x.bezierCurveTo(W * 0.78, y + H - 40, W * 0.9, y + 60, W, y + 40); x.stroke();
  k.t(S.shop || 'Yamie Fine Jewellery', 58, y + 58, 29, 700, '#fff');
  const ad = k.wrap(S.shopAddr || '', 440, 19, 400);
  ad.slice(0, 2).forEach((l, i) => k.t(l, 58, y + 90 + i * 27, 19, 400, 'rgba(255,255,255,0.88)'));
  x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(520, y + 40); x.lineTo(520, y + 125); x.stroke();
  const ph = phones.filter((p) => p && p.n);
  ph.slice(0, 3).forEach((p, i) => {
    const py = ph.length > 1 ? y + 56 + i * 44 : y + 80;
    k.icon(p.ic || 'wa', 552, py - 24, 32, '#fff', 2);
    k.t(p.n, 596, py, ph.length > 1 ? 25 : 28, 700, '#fff');
  });
  return y + H;
}
/** Hero photo + up to 3 thumbnails in a soft rounded panel. */
/** Photos tagged with their item number; for several items every item gets at least its first photo. */
function itemPhotos(items, extra, tag) {
  const per = items.map((it, i) => (it.photos || []).concat(it.refs || []).map((p) => ({ p, n: String(i + 1) })));
  const ex = (extra || []).map((p) => ({ p, n: tag || '★' }));
  const groups = per.concat(ex.length ? [ex] : []).filter((g) => g.length), MAX = 12, pick = [];
  groups.forEach((g) => pick.push(g[0]));
  for (let r = 1; pick.length < MAX && groups.some((g) => g[r]); r++) groups.forEach((g) => { if (g[r] && pick.length < MAX) pick.push(g[r]); });
  const order = new Map(groups.flat().map((x, i) => [x, i]));
  return pick.sort((a, b) => order.get(a) - order.get(b));
}
/** Several items: all photos in a grid at the top, each with its item number. */
async function cardPhotoGrid(k, list, px, py, w) {
  const { T } = k;
  const ims = (await Promise.all(list.map((x) => loadImg(imgUrl(x.p))))).map((im, i) => (im ? { im, n: list[i].n } : null)).filter(Boolean);
  if (!ims.length) return py;
  const n = ims.length, cols = n <= 4 ? n : n <= 6 ? 3 : 4, rows = Math.ceil(n / cols), gap = 16, pad = 16;
  const tw = (w - 2 * pad - (cols - 1) * gap) / cols, th = Math.min(Math.round(tw * 0.9), 340);
  const H = pad * 2 + rows * th + (rows - 1) * gap;
  k.box(px, py, w, H, 24, k.grad(px, py, px, py + H, '#fbfbfc', T.soft2), T.line, 1.5);
  ims.forEach((x, i) => {
    const r = Math.floor(i / cols), inRow = Math.min(cols, n - r * cols), x0 = px + (w - (inRow * tw + (inRow - 1) * gap)) / 2;
    const tx = x0 + (i % cols) * (tw + gap), ty = py + pad + r * (th + gap);
    k.box(tx, ty, tw, th, 14, '#fff', T.line, 1.5); k.contain(x.im, tx, ty, tw, th, 8);
    const bw = Math.max(44, k.tw(x.n, 22, 800) + 24);
    k.box(tx + 8, ty + 8, bw, 38, 19, k.grad(tx, ty, tx + bw, ty, T.a, T.b), null); k.t(x.n, tx + 8 + bw / 2, ty + 35, 22, 800, '#fff', 'center');
  });
  return py + H;
}
async function cardPhotos(k, photos, px, py, w, heroH) {
  const { T } = k;
  if (photos && photos.length && typeof photos[0] === 'object') {
    if (new Set(photos.filter((x) => /^\d+$/.test(x.n)).map((x) => x.n)).size > 1) return cardPhotoGrid(k, photos, px, py, w);
    photos = photos.map((x) => x.p);
  }
  const ims = (await Promise.all((photos || []).slice(0, 4).map((p) => loadImg(imgUrl(p))))).filter(Boolean);
  if (!ims.length) return py;
  const thumbs = ims.slice(1, 4), th = thumbs.length ? Math.round((w - 80) / 3 * 0.78) : 0;
  const H = heroH + (th ? th + 46 : 30);
  k.box(px, py, w, H, 24, k.grad(px, py, px, py + H, '#fbfbfc', T.soft2), T.line, 1.5);
  k.contain(ims[0], px + 16, py + 12, w - 32, heroH, 6);
  if (th) {
    const tw = (w - 80) / 3, tot = thumbs.length * tw + (thumbs.length - 1) * 16, x0 = px + (w - tot) / 2;
    thumbs.forEach((im, i) => { const tx = x0 + i * (tw + 16), ty = py + heroH + 20; k.box(tx, ty, tw, th, 14, '#fff', T.line, 1.5); k.contain(im, tx, ty, tw, th, 10); });
  }
  return py + H;
}
/** A labelled section with a tab-shaped title (work order, ready card). */
function tabSection(k, y, title, icon, bodyH) {
  const { T, W } = k, tw = k.tw(title, 30, 700) + 120;
  k.box(28, y + 20, W - 56, bodyH + 62, 22, T.soft2, T.line, 1.5);
  k.box(28, y + 20, W - 56, 50, 22, T.soft, null);
  k.box(28, y, tw, 58, 22, k.grad(28, y, 28 + tw, y, T.a, T.b), null);
  k.icon(icon, 54, y + 13, 32, '#fff', 2);
  k.t(title, 102, y + 40, 30, 700, '#fff');
  return y + 72;
}
const stShort = (s) => ({ diamond: 'Diamond', labgrown: 'Lab diamond', precious: s.gem || 'Colour stone', synthetic: s.gem || 'CZ' })[s.type] || s.gem || 'Stone';
const stColour = (s) => { const c = s.colour || (s.type === 'diamond' || s.type === 'labgrown' ? 'White' : ''), n = stShort(s); return c && c.toLowerCase() !== n.toLowerCase() ? `${c} (${n})` : n; };
const mkShowFlags = (ms) => ({ type: ms === 'type' || ms === 'typeonly', amt: ms === 'type' || ms === 'amount' });

// ---------------- 1. Provisional estimate ----------------
async function cardEstimate(o, est) {
  const T = THEMES.est, k = cardKit(T), { x, W } = k;
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, k.c.height);
  await cardHead(k, (est.no || 'EST') + (est.v > 1 ? ' v' + est.v : ''), false);
  k.t('Provisional Estimate', 56, 212, 54, 800, T.ink);
  let cx = 58; k.icon('user', cx, 232, 28, T.mute); cx += 40; cx += k.t(o.cust.name, cx, 256, 25, 600, T.txt) + 46;
  k.icon('cal', cx, 232, 28, T.mute); cx += 40; cx += k.t(dt(est.at), cx, 256, 25, 400, T.txt) + 26;
  k.t('|', cx, 255, 25, 300, T.mute); k.t('Valid till ' + dshort(est.valid), cx + 30, 256, 25, 400, T.txt);
  let y = 300;
  const ms = mkShowOf(o), fl = mkShowFlags(ms), items = est.items, one = items.length === 1;
  const detRows = (it, l) => {
    const r = [['gem', 'Design', (it.design === 'custom' ? 'Customised' : 'Yamie design') + (it.designNo ? ' #' + it.designNo : '') + ' · rev ' + (it.rev || 1)]];
    if (it.model) r.push(['code', it.design === 'custom' ? 'Model ref.' : 'Model no.', it.model]);
    r.push(['bars', 'Metal', purLabel(it.purity) + ' · ' + it.colour]);
    if (it.size) r.push(['oval', sizeLabel(it.cat), it.size]);
    const d = [num(it.qty) > 1 ? 'Qty: ' + it.qty : 'Pieces: 1', specText(it)].filter(Boolean).join(' · '); r.push(['layers', 'Details', d]);
    (it.stones || []).forEach((s) => r.push(['stone', stShort(s), [s.shape, s.ct ? s.ct + ' ct' : '', s.pcs ? s.pcs + ' pc' : '', s.quality].filter(Boolean).join(' · ')]));
    r.push(['bag', 'Net wt. (approx.)', g3(l.wt)]);
    return r;
  };
  const drawDetails = (it, l, i, px, py, w) => {
    k.t(`Item ${i + 1} – ${it.product || it.cat}`, px + 8, py + 30, 30, 700, T.ink);
    const rows = detRows(it, l), vw = w - 210;
    const lay = rows.map((r) => ({ r, kl: k.wrap(r[1], 126, 20, 400), lines: k.wrap(r[2], vw, 20, 600) }));
    lay.forEach((q) => { q.n = Math.max(q.kl.length, q.lines.length); });
    const h = lay.reduce((t, q) => t + Math.max(46, 20 + q.n * 26), 0) + 16;
    k.box(px, py + 48, w, h, 20, T.soft2, T.line, 1.5);
    let ry = py + 56;
    lay.forEach((q, n) => {
      const rh = Math.max(46, 20 + q.n * 26);
      k.icon(q.r[0], px + 18, ry + rh / 2 - 13, 26, T.ink, 1.6);
      q.kl.forEach((ln, j) => k.t(ln, px + 58, ry + rh / 2 + 7 - (q.kl.length - 1) * 13 + j * 26, 20, 400, T.txt));
      q.lines.forEach((ln, j) => k.t(ln, px + 196, ry + rh / 2 + 7 - (q.lines.length - 1) * 13 + j * 26, 20, 600, T.txt));
      if (n < lay.length - 1) { x.strokeStyle = T.line; x.lineWidth = 1; x.beginPath(); x.moveTo(px + 58, ry + rh); x.lineTo(px + w - 16, ry + rh); x.stroke(); }
      ry += rh;
    });
    return py + 48 + h;
  };
  if (one) {
    const pEnd = await cardPhotos(k, allPhotos(items), 38, y, 520, 290);
    const dEnd = drawDetails(items[0], est.lines[0], 0, 576, y, W - 576 - 30);
    y = Math.max(pEnd, dEnd) + 32;
  } else {
    y = await cardPhotos(k, itemPhotos(items), 38, y, W - 76, 420) + 24;
    items.forEach((it, i) => { y = drawDetails(it, est.lines[i], i, 38, y, W - 76) + 24; });
    y += 8;
  }
  // price breakdown + estimated total box
  const pr = [];
  est.lines.forEach((l, i) => {
    const it = items[i], pre = items.length > 1 ? `Item ${i + 1} · ` : '', mk = l.making + l.va;
    if (fl.amt) pr.push(['bars', pre + 'Gold value', rupee(l.metal), `${rupee(l.metal)} @ ${rupee(l.rate)}/g`]);
    else pr.push(['bars', pre + 'Gold value incl. making', rupee(l.metal + mk), fl.type ? `Making ${mkLabel(Object.assign({}, it, { mk: it.mkD !== '' && it.mkD != null ? it.mkD : it.mk, mkPg: it.mkPgD !== '' && it.mkPgD != null ? it.mkPgD : it.mkPg }))} included` : '']);
    if (l.stone) pr.push(['stone', pre + 'Stones', rupee(l.stone)]);
    if (fl.amt && mk) {
      const lbl = fl.type ? `Making (${mkLabel(Object.assign({}, it, { mk: l.mkSave && it.mkD !== '' && it.mkD != null ? it.mkD : it.mk, mkPg: l.mkSave && it.mkPgD !== '' && it.mkPgD != null ? it.mkPgD : it.mkPg }))})` : 'Making charges';
      pr.push(['gear', pre + lbl, rupee(mk), l.mkSave ? `was ${rupee(l.mkFull)}` : '']);
    }
    if (l.huid) pr.push(['tag', pre + `HUID (${l.huidN} × ₹${num(S.huidRate)})`, rupee(l.huid)]);
    if (l.other) pr.push(['tag', pre + 'Other charges', rupee(l.other)]);
  });
  const sum = [['Value before tax', rupee(est.sub)]];
  if (est.disc) sum.push(['Discount', '−' + rupee(est.disc)]);
  sum.push([`GST (${est.gstPct}%)`, rupee(est.gst)]);
  const bw = 600, rowH = (r) => (r[3] ? 64 : 50);
  const bh = 74 + pr.reduce((t, r) => t + rowH(r), 0) + 20 + sum.length * 44 + 18;
  k.box(30, y, bw, bh, 24, T.soft2, T.line, 1.5);
  k.box(30, y, bw, 62, 24, T.soft, null); k.box(30, y + 30, bw, 32, 0, T.soft, null);
  k.t('Price Breakdown', 58, y + 42, 30, 700, T.ink);
  let py = y + 74;
  pr.forEach((r) => {
    k.icon(r[0], 58, py + 6, 28, T.ink, 1.6);
    k.t(r[1], 112, py + 28, 23, 400, T.txt); k.t(r[2], bw + 6, py + 28, 24, 500, T.txt, 'right');
    if (r[3]) k.t(r[3], 112, py + 54, 19, 400, T.mute);
    py += rowH(r);
  });
  x.strokeStyle = T.line; x.lineWidth = 1.5; x.beginPath(); x.moveTo(58, py + 6); x.lineTo(bw + 6, py + 6); x.stroke(); py += 20;
  sum.forEach((r) => { k.t(r[0], 62, py + 30, 24, 400, T.txt); k.t(r[1], bw + 6, py + 30, 24, 500, T.txt, 'right'); py += 44; });
  const save = savingOf(est);
  const tx = 30 + bw + 22, tw = W - 30 - tx, th = Math.min(bh, Math.max(290, save ? 330 : 290));
  k.box(tx, y, tw, th, 24, k.grad(tx, y, tx + tw, y + th, T.b, T.a), null);
  k.t('Estimated Total', tx + tw / 2, y + 74, 30, 600, '#fff', 'center');
  k.t('(incl. GST)', tx + tw / 2, y + 112, 24, 400, 'rgba(255,255,255,0.85)', 'center');
  k.t(rupee(est.total), tx + tw / 2, y + 196, 66, 800, '#fff', 'center');
  if (save) { const sw = k.tw('You save ' + rupee(save), 22, 700) + 40; k.box(tx + (tw - sw) / 2, y + 230, sw, 44, 22, '#2f8a5b', null); k.t('You save ' + rupee(save), tx + tw / 2, y + 260, 22, 700, '#fff', 'center'); }
  y += bh + 28;
  // advance strip
  k.box(30, y, W - 60, 92, 22, T.soft, null);
  k.icon('wallet', 64, y + 26, 40, T.txt, 1.6); k.t('Booking advance', 136, y + 40, 22, 400, T.txt); k.t(`(min ${S.minAdv}%)`, 136, y + 68, 22, 400, T.txt);
  k.t(rupee(est.minAdv), 482, y + 58, 32, 700, T.ink, 'right');
  x.strokeStyle = T.line; x.lineWidth = 1.5; x.beginPath(); x.moveTo(540, y + 18); x.lineTo(540, y + 74); x.stroke();
  k.icon('lock', 590, y + 26, 40, T.txt, 1.6); k.t('Advance to lock the', 662, y + 40, 22, 400, T.txt); k.t('gold rate', 662, y + 68, 22, 400, T.txt);
  k.t(rupee(est.lock), W - 60, y + 58, 32, 700, T.ink, 'right');
  y += 92 + 26;
  // gold rates + notes
  const notes = ['Weights are approximate. Final price uses the actual weight at delivery.', `Delivery: at least ${S.leadDays} working days from order confirmation.`,
    `A ${S.minAdv}% booking advance confirms the order but does not lock the gold rate.`, `Not a tax invoice. GSTIN ${S.gstin}.`];
  const nl = notes.map((n) => k.wrap(n, 400, 18, 400));
  const nh = 64 + nl.reduce((t, l) => t + l.length * 23 + 4, 0) + 14;
  const gh = Math.max(nh, 170);
  k.box(30, y, W - 60, gh, 22, '#fff', T.line, 1.5);
  k.box(40, y + 12, 470, gh - 24, 18, '#fdf6ea', null);
  k.icon('bars', 60, y + 30, 34, '#c8962c', 1.8);
  const gr = GOLD.filter((p) => rateOf(p, est.rates) > 0).slice(0, 4);
  k.t('Gold Rates', 110, y + 56, 25, 700, T.ink); k.t(`(${dshort(String(new Date(est.at).toISOString()).slice(0, 10))})`, 110 + k.tw('Gold Rates ', 25, 700), y + 56, 20, 600, T.ink);
  const cw = 440 / Math.max(1, gr.length);
  gr.forEach((p, i) => {
    const cx0 = 54 + i * cw + cw / 2;
    k.t(purShort(p), cx0, y + 104, 21, 400, T.txt, 'center'); k.t(rupee(rateOf(p, est.rates)), cx0, y + 140, 23, 700, T.txt, 'center');
    if (i) { x.strokeStyle = '#ead9b8'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(54 + i * cw, y + 84); x.lineTo(54 + i * cw, y + 150); x.stroke(); }
  });
  x.strokeStyle = T.line; x.beginPath(); x.moveTo(546, y + 22); x.lineTo(546, y + gh - 22); x.stroke();
  k.icon('info', 580, y + 26, 30, T.ink, 1.8); k.t('Notes', 622, y + 50, 23, 700, T.ink);
  let ny = y + 82; nl.forEach((ls) => { ls.forEach((ln, j) => { if (!j) k.t('•', 584, ny, 18, 700, T.txt); k.t(ln, 602, ny, 18, 400, T.txt); ny += 23; }); ny += 4; });
  y += gh + 36;
  const end = cardFoot(k, y, [{ ic: 'wa', n: S.shopPhone }]);
  return finishCard(k, end);
}

// ---------------- 2. Work order (vendor, no prices) ----------------
async function cardWork(o) {
  const T = THEMES.work, k = cardKit(T), { x, W } = k, v = o.vendor || {};
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, k.c.height);
  await cardHead(k, o.ono || '', true);
  k.t('Work Order', 56, 212, 56, 800, T.ink);
  let cx = 58; k.icon('user', cx, 228, 30, T.ink); cx += 44; cx += k.t('To ' + v.name, cx, 254, 27, 500, T.txt) + 30;
  k.t('|', cx, 252, 27, 300, T.mute); cx += 34; k.icon('cal', cx, 228, 30, T.ink); cx += 44; cx += k.t('ETD:', cx, 254, 27, 500, T.txt) + 10;
  const ew = k.tw(dt(v.etd), 29, 700) + 30; k.box(cx, 220, ew, 48, 16, T.soft, null); k.t(dt(v.etd), cx + 15, 254, 29, 700, T.ink);
  let y = await cardPhotos(k, itemPhotos(o.items, v.photos, 'Ref'), 72, 296, W - 144, 300);
  y += 30;
  for (let i = 0; i < o.items.length; i++) {
    const it = o.items[i];
    const L = [['ring', 'Item', it.product || it.cat], ['bars', 'Purity', purLabel(it.purity)], ['palette', 'Colour', it.colour], ['ruler', sizeLabel(it.cat), it.size || 'Standard']];
    const st = (it.stones || []).map(stColour);
    if (st.length) L.push(['gem', 'Stone colour', st.join(', ')]);
    const R = [['hash', it.design === 'custom' ? 'Model ref.' : 'Model No.', it.model || '—'], ['layers', 'Quantity', String(it.qty || 1)], ['hash', 'Design no.', (it.designNo || '—') + ' · rev ' + (it.rev || 1)]];
    const det = [specText(it), it.dims, it.details, it.custom ? 'Customise: ' + it.custom : ''].filter(Boolean).join(' · ');
    R.push(['info', 'Details', det || '—']);
    const lw = 220, rw = 230;
    const lay = (arr, vw) => arr.map((r) => ({ r, lines: k.wrap(r[2], vw, 23, 700) }));
    const LL = lay(L, lw), RR = lay(R, rw);
    const hh = (arr) => arr.reduce((t, q) => t + Math.max(50, 18 + q.lines.length * 28), 0);
    const bodyH = Math.max(hh(LL), hh(RR)) + 10;
    y = tabSection(k, y, o.items.length > 1 ? `Item ${i + 1} Details` : 'Item Details', 'tag', bodyH);
    const col = (arr, x0, kx, vx, x1) => { let ry = y; arr.forEach((q, n) => { const rh = Math.max(50, 18 + q.lines.length * 28); k.icon(q.r[0], x0, ry + 10, 30, T.ink, 1.8); k.t(q.r[1], kx, ry + 34, 22, 400, T.txt); q.lines.forEach((ln, j) => k.t(ln, vx, ry + 34 + j * 28, 23, j ? 400 : 700, T.txt)); if (n < arr.length - 1) { x.strokeStyle = T.line; x.lineWidth = 1; x.beginPath(); x.moveTo(kx, ry + rh); x.lineTo(x1, ry + rh); x.stroke(); } ry += rh; }); };
    col(LL, 62, 122, 278, 486); col(RR, 548, 606, 746, W - 56);
    x.strokeStyle = T.line; x.lineWidth = 2; x.beginPath(); x.moveTo(512, y); x.lineTo(512, y + bodyH - 10); x.stroke();
    y += bodyH + 60;
    y = tabSection(k, y, 'Weight Details', 'bag', 96);
    k.t('Gross wt. (target)', W / 4 + 20, y + 26, 22, 400, T.txt, 'center'); k.t(g3(it.gwt), W / 4 + 20, y + 76, 42, 800, T.ink, 'center');
    k.t('Net wt. (target)', W * 3 / 4 - 20, y + 26, 22, 400, T.txt, 'center'); k.t(g3(it.wt), W * 3 / 4 - 20, y + 76, 42, 800, T.ink, 'center');
    x.strokeStyle = T.ink; x.lineWidth = 1.5; x.beginPath(); x.moveTo(W / 2, y + 8); x.lineTo(W / 2, y + 84); x.stroke();
    y += 96 + 60;
    if ((it.stones || []).length) {
      const sl = it.stones.map((s, n) => k.wrap(`${n + 1}. ${stShort(s)}: ` + [s.shape, s.size ? s.size + ' mm' : '', s.ct ? s.ct + ' ct' : '', s.pcs ? s.pcs + ' pc' : '', s.wtg ? s.wtg + ' g' : '', s.quality, s.colour ? 'colour ' + s.colour : ''].filter(Boolean).join(' · '), W - 160, 22, 400));
      y = tabSection(k, y, 'Stone Details', 'gem', sl.reduce((t, l) => t + l.length * 30 + 6, 0) + 6);
      sl.forEach((ls) => ls.forEach((ln) => { k.t(ln, 74, y + 26, 22, 400, T.txt); y += 30; }));
      y += 66;
    }
    if (it.prodNotes) { const pl = k.wrap(it.prodNotes, W - 160, 22, 400); y = tabSection(k, y, 'Production Notes', 'clip', pl.length * 30 + 12); pl.forEach((ln) => { k.t(ln, 74, y + 26, 22, 400, T.txt); y += 30; }); y += 66; }
  }
  const other = ['BIS hallmark with HUID required.', 'Tell us about any weight or stone difference before dispatch.', `Quote ${o.ono} on the delivery challan.`];
  const ol = other.map((t) => k.wrap(t, W - 170, 23, 400));
  y = tabSection(k, y, 'Other Details', 'clip', ol.reduce((t, l) => t + l.length * 32, 0) + 12);
  ol.forEach((ls) => ls.forEach((ln, j) => { if (!j) { x.fillStyle = T.ink; x.beginPath(); x.arc(84, y + 18, 5, 0, 7); x.fill(); } k.t(ln, 104, y + 26, 23, 400, T.txt); y += 32; }));
  y += 86;
  const end = cardFoot(k, y, [{ ic: 'wa', n: S.woPhone || S.shopPhone }]);
  return finishCard(k, end);
}

// ---------------- 3. Your order is ready (with the final price) ----------------
async function cardReady(o) {
  const T = THEMES.ready, k = cardKit(T), { x, W } = k, fin = lastOf(o.finals) || lastOf(o.ests);
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, k.c.height);
  await cardHead(k, o.ono || '', true);
  x.fillStyle = T.ink; x.beginPath(); x.arc(92, 172, 34, 0, 7); x.fill(); k.icon('check', 70, 150, 44, '#fff', 3);
  k.t('Your Order is Ready', 150, 192, 54, 800, T.ink);
  k.icon('user', 150, 212, 28, T.ink); k.t(o.cust.name, 190, 236, 28, 500, T.ink);
  let y = await cardPhotos(k, itemPhotos(o.items), 38, 280, W - 76, 300);
  y += 32;
  // order details: a 4-column row per item
  const cols = (it) => [['Item', it.product || it.cat], ['Purity', purLabel(it.purity)], ['Colour', it.colour], [sizeLabel(it.cat).replace(/ \/.*/, ''), it.size || 'Standard']];
  const CW = [0.34, 0.22, 0.2, 0.24].map((f) => f * (W - 120));
  const rowsI = o.items.map((it) => cols(it).map(([lb, v], j) => ({ lb, vl: k.wrap(v, CW[j] - 20, 28, 700).slice(0, 2) })));
  const rh = (r) => 54 + Math.max(...r.map((c) => c.vl.length)) * 34;
  y = tabSection(k, y, 'Order Details', 'ring', rowsI.reduce((t, r) => t + rh(r), 0));
  rowsI.forEach((r) => {
    let x0 = 60; const h = rh(r);
    r.forEach((c, j) => {
      const cx0 = x0 + CW[j] / 2;
      if (j === 3) k.icon('ruler', cx0 - k.tw(c.lb, 22) / 2 - 44, y + 4, 32, T.txt, 1.6);
      k.t(c.lb, cx0, y + 26, 22, 400, T.txt, 'center');
      c.vl.forEach((ln, n) => k.t(ln, cx0, y + 66 + n * 34, 28, 700, T.ink, 'center'));
      if (j) { x.strokeStyle = T.line; x.lineWidth = 1.5; x.beginPath(); x.moveTo(x0, y + 4); x.lineTo(x0, y + h - 12); x.stroke(); }
      x0 += CW[j];
    });
    y += h;
  });
  y += 72;
  // payment summary with the final price breakdown
  const ms = mkShowOf(o), fl = mkShowFlags(ms), det = [];
  if (fin && fin.lines) {
    const metal = fin.lines.reduce((t, l) => t + l.metal, 0), mk = fin.lines.reduce((t, l) => t + l.making + l.va, 0), stone = fin.lines.reduce((t, l) => t + l.stone, 0);
    const huid = fin.lines.reduce((t, l) => t + (l.huid || 0), 0), other = fin.lines.reduce((t, l) => t + l.other, 0) + num(fin.extra);
    if (fl.amt) { det.push(['Gold value', rupee(metal)]); if (mk) det.push([fl.type && o.items.length === 1 ? `Making (${mkLabel(Object.assign({}, fin.items[0], { mk: fin.lines[0].mkSave && fin.items[0].mkD !== '' && fin.items[0].mkD != null ? fin.items[0].mkD : fin.items[0].mk }))})` : 'Making charges', rupee(mk)]); }
    else det.push(['Gold value incl. making', rupee(metal + mk)]);
    if (stone) det.push(['Stones', rupee(stone)]);
    if (huid) det.push(['HUID charges', rupee(huid)]);
    if (other) det.push(['Other charges', rupee(other)]);
    if (fin.ship) det.push([`Delivery${fin.shipBy ? ' · ' + fin.shipBy : ''}`, rupee(fin.ship)]);
    if (fin.disc) det.push(['Discount', '−' + rupee(fin.disc)]);
    det.push([`GST (${fin.gstPct}%)`, rupee(fin.gst)]);
  }
  const save = fin ? savingOf(fin) : 0, paid = verified(o), bal = Math.max(0, num(fin && fin.total) - paid);
  const bodyH = det.length * 40 + 16 + 60 + (save ? 44 : 0) + 56 + 70;
  y = tabSection(k, y, 'Payment Summary', 'wallet', bodyH);
  det.forEach(([a, b]) => { k.t(a, 104, y + 28, 22, 400, T.mute); k.t(b, W - 104, y + 28, 22, 500, T.mute, 'right'); y += 40; });
  y += 10;
  k.box(78, y, W - 156, 54, 14, '#f6e1e4', null); k.t('Final Price (Incl. GST)', 104, y + 37, 26, 500, T.txt); k.t(rupee(fin ? fin.total : 0), W - 104, y + 41, 40, 800, T.ink, 'right'); y += 64;
  if (save) { k.t('You save', 104, y + 28, 24, 600, '#2f8a5b'); k.t(rupee(save), W - 104, y + 28, 26, 700, '#2f8a5b', 'right'); y += 44; }
  k.t('Paid', 104, y + 32, 26, 500, T.txt); k.t(rupee(paid), W - 104, y + 34, 32, 700, T.txt, 'right'); y += 56;
  k.box(78, y, W - 156, 58, 14, k.grad(78, y, W - 78, y, T.a, T.b), null); k.t('Balance to Pay', 104, y + 40, 30, 600, '#fff'); k.t(rupee(bal), W - 104, y + 44, 42, 800, '#fff', 'right');
  y += 58 + 76;
  // info box: collect, or shipping address
  const sh = (fin && fin.shipInfo) || o.ship;
  const info = sh ? [`We will ship it by ${sh.by} to: ${sh.addr}.`, 'Pay the balance before dispatch. We will share the tracking number.'] : [`Please visit us to collect it: ${S.shopAddr}.`, 'Bring this message and your advance receipt.'];
  if (fin && fin.valid) info.push(`This final price is valid till ${dshort(fin.valid)}.`);
  const il = info.map((t) => k.wrap(t, W - 330, 24, 400));
  const ih = Math.max(150, il.reduce((t, l) => t + l.length * 32 + 6, 0) + 48);
  k.box(32, y, W - 64, ih, 24, T.soft, null);
  k.icon(sh ? 'truck' : 'info', 74, y + ih / 2 - 28, 56, T.ink, 1.6);
  x.strokeStyle = T.ink; x.lineWidth = 1.5; x.beginPath(); x.moveTo(168, y + 24); x.lineTo(168, y + ih - 24); x.stroke();
  let iy = y + 50 - 6; il.forEach((ls) => { ls.forEach((ln, j) => { if (!j) { x.fillStyle = T.txt; x.beginPath(); x.arc(204, iy - 8, 5, 0, 7); x.fill(); } k.t(ln, 226, iy, 24, 400, T.txt); iy += 32; }); iy += 6; });
  y += ih + 40;
  const ph = [S.shopPhone2 || S.shopPhone].filter(Boolean).map((n) => ({ ic: 'wa', n }));
  if (S.shopLandline) ph.push({ ic: 'phone', n: S.shopLandline });
  const end = cardFoot(k, y, ph);
  return finishCard(k, end);
}
function finishCard(k, h) {
  const out = document.createElement('canvas'); out.width = k.W; out.height = Math.ceil(h);
  out.getContext('2d').drawImage(k.c, 0, 0);
  return out.toDataURL('image/jpeg', 0.92);
}
