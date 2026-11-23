// ======================================================================
// Grand module — vendor orders for Grand Jewellers (permission: grand; lists: grandcfg)
// ======================================================================
const GDEF = {
  staff: [], copyTo: [], vendors: [],
  purities: [{ name: '22K (916)', std: true }, { name: '18K (750)' }, { name: '14K (585)' }],
  items: [
    { name: 'Ring', sizes: ['8', '10', '12', '14', '16', '18', '20'], models: [] },
    { name: 'Chain', sizes: ['16 in', '18 in', '20 in', '22 in', '24 in'], models: [] },
    { name: 'Bangle', sizes: ['2-2', '2-4', '2-6', '2-8', '2-10'], models: [] },
    { name: 'Bracelet', sizes: ['6.5 in', '7 in', '7.5 in', '8 in'], models: [] },
    { name: 'Necklace', sizes: ['16 in', '18 in'], models: [] },
    { name: 'Earring', sizes: [], models: [] },
    { name: 'Pendant', sizes: [], models: [] },
    { name: 'Anklet', sizes: ['9 in', '10 in', '10.5 in', '11 in'], models: [] },
    { name: 'Waist Chain', sizes: ['26 in', '28 in', '30 in', '32 in'], models: [] },
  ],
};
const GC = () => Object.assign(clone(GDEF), S.grand || {});
const gItem = (name) => GC().items.find((i) => i.name === name) || { name, sizes: [], models: [] };
const gVendors = () => { const v = GC().vendors.filter((x) => x.name); return v.length ? v : vendors.filter((x) => x.active !== false).map((x) => ({ name: x.name, phone: x.phone })); };
const gStdPur = () => { const p = GC().purities; return (p.find((x) => x.std) || p[0] || { name: '' }).name; };
const G_ST = { sent: ['Sent', 'b'], received: ['Received', 'g'], cancelled: ['Cancelled', 'r'] };
let gOrders = [], gLoaded = 0, GF = null, gQ = '', gFil = '';

async function gLoad(force) {
  if (!force && gLoaded && Date.now() - gLoaded < 20000) return;
  try { const d = await api('grand/list'); gOrders = d.orders || []; gLoaded = Date.now(); } catch (e) { toast(isNet(e) ? 'No internet' : e.message); }
}
function openGrand() { GF = null; go('vGrand'); gLoad(true).then(() => { if (cur.view === 'vGrand' && !GF) renderGrand(); }); }
const gUrgent = (o) => (o.lines || []).some((l) => l.urgent);
const gDue = (o) => [o.due].concat((o.lines || []).filter((l) => l.urgent).map((l) => l.due)).filter(Boolean).sort()[0] || '';

function renderGrand() {
  if (!can('grand')) { $('vGrand').innerHTML = '<p class="hint">Your role does not have the Grand module.</p>'; return; }
  if (GF) return gForm();
  const q = gQ.toLowerCase();
  const pass = (o) => (!gFil || (gFil === 'urgent' ? gUrgent(o) && o.status === 'sent' : o.status === gFil)) &&
    (!q || [o.no, o.vendor, o.by, o.type === 'custom' ? 'customised' : 'stock'].concat((o.lines || []).map((l) => l.item + ' ' + l.model)).join(' ').toLowerCase().includes(q));
  const list = gOrders.filter(pass), cnt = (f) => gOrders.filter((o) => !f || (f === 'urgent' ? gUrgent(o) && o.status === 'sent' : o.status === f)).length;
  $('vGrand').innerHTML = `<div class="gHead"><img src="${LOGO.gMarkK}" alt=""><div><p class="kicker" style="margin:0">Order management</p><h1 class="h1" style="margin:0">Grand orders</h1></div></div>
    <p class="sub">Vendor orders for Grand Jewellers. Each order makes an image card for the vendor, with a copy to the Grand order staff.</p>
    <div class="actions" style="margin:0 0 10px"><button class="btn" onclick="gNew()">+ New Grand order</button>${can('grandcfg') || can('settings') ? '<button class="btn secondary" onclick="openSub(\'grand\')">Grand lists</button>' : ''}</div>
    <input class="search" placeholder="Search GJO no., vendor, item, model" value="${esc(gQ)}" oninput="gQ=this.value;renderGrand();const e=$('vGrand').querySelector('.search');e.focus();e.setSelectionRange(e.value.length,e.value.length)">
    <div class="filters">${[['', 'All'], ['urgent', '🚨 Emergency'], ['sent', 'Sent'], ['received', 'Received'], ['cancelled', 'Cancelled']].map(([k, l]) => `<button class="chip ${gFil === k ? 'active' : ''}" onclick="gFil='${k}';renderGrand()">${l}<em>${cnt(k)}</em></button>`).join('')}</div>
    ${list.length ? list.map((o) => `<button class="row" onclick="gShow('${o.id}')"><span style="flex:1;min-width:0"><b>${esc(o.no)} · ${esc(o.vendor)}</b>${gUrgent(o) && o.status === 'sent' ? ' <span class="badge r">EMERGENCY</span>' : ''}<br>
      <small class="hint" style="margin:0">${o.type === 'custom' ? 'Customised' : 'Regular stock'} · ${o.qty} pc · ${fmtN(o.wt)} g · ${esc(o.purity || '')} · by ${esc(o.by)} · ${dshort(o.at)}${gDue(o) ? ' · due ' + dshort(gDue(o)) : ''}</small></span>
      <span class="badge ${G_ST[o.status][1]}">${G_ST[o.status][0]}</span></button>`).join('') : `<div class="empty"><b>∅</b>${gLoaded ? 'No Grand orders yet.' : 'Loading…'}</div>`}`;
}

// ---------- new / edit ----------
function gBlankLine() { return { item: '', model: '', img: '', purity: '', wt: '', size: '', qty: 1, urgent: false, due: '', note: '' }; }
function gNew() {
  const c = GC();
  GF = { type: 'stock', vendor: '', vphone: '', by: c.staff.includes(me.name) ? me.name : (c.staff.length === 1 ? c.staff[0] : ''), purity: gStdPur(), lockPur: true, photos: true, due: '', note: '', refs: [], lines: [gBlankLine()] };
  renderGrand(); window.scrollTo(0, 0);
}
function gEdit(id) { const o = gOrders.find((x) => x.id === id); if (!o) return; closeSheet(); GF = clone(o); go('vGrand'); }
const gLineWt = (l) => Math.round(num(l.wt) * Math.max(1, num(l.qty) || 1) * 1000) / 1000;
function gTotals() { const ls = GF.lines.filter((l) => l.item); return { n: ls.length, qty: ls.reduce((t, l) => t + (Math.max(1, num(l.qty) || 1)), 0), wt: Math.round(ls.reduce((t, l) => t + gLineWt(l), 0) * 1000) / 1000 }; }
function gForm() {
  const c = GC(), vs = gVendors(), t = gTotals();
  const chips = (list, val, on) => list.map((x) => `<button class="chip ${val === x ? 'active' : ''}" onclick="${on}(${esc(JSON.stringify(x))})">${esc(x)}</button>`).join('');
  $('vGrand').innerHTML = `<div class="gHead"><img src="${LOGO.gMarkK}" alt=""><div><p class="kicker" style="margin:0">Grand module</p><h1 class="h1" style="margin:0">${GF.id ? 'Edit ' + esc(GF.no) : 'New Grand order'}</h1></div></div>
    <div class="card"><h3>Order</h3>
      <div class="field"><label>Order type</label><div class="choiceRow">${[['stock', 'Regular stock item'], ['custom', 'Customised order']].map(([k, l]) => `<button class="chip ${GF.type === k ? 'active' : ''}" onclick="GF.type='${k}';gForm()">${l}</button>`).join('')}</div></div>
      <div class="two"><div class="field"><label>a. Vendor <i class="req">*</i></label><select onchange="gSetVendor(this.value)"><option value="">Select vendor</option>${vs.map((v) => `<option ${GF.vendor === v.name ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>${GF.vphone ? `<p class="hint">WhatsApp ${esc(GF.vphone)}</p>` : ''}</div>
        <div class="field"><label>b. Order sent by <i class="req">*</i></label>${c.staff.length ? `<select onchange="GF.by=this.value"><option value="">Select staff</option>${c.staff.map((n) => `<option ${GF.by === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>` : `<input value="${esc(GF.by)}" placeholder="Staff name" oninput="GF.by=this.value"><p class="hint">Add staff names in Grand lists.</p>`}</div></div>
      <div class="field"><label>c. Purity</label><div class="choiceRow">${chips(c.purities.map((p) => p.name), GF.purity, 'gSetPur')}</div>
        <label class="check" style="margin-top:6px"><input type="checkbox" ${GF.lockPur ? 'checked' : ''} onchange="GF.lockPur=this.checked;gForm()"><span>Same purity for the whole order (locked for this document)</span></label></div>
      <div class="field"><label>Delivery date for the order</label><input type="date" value="${esc(GF.due)}" min="${today()}" onchange="GF.due=this.value"></div>
      ${GF.type === 'custom' ? `<div class="field"><label>Reference photos (customer / design)</label><div class="phRow">${GF.refs.map((r, i) => `<span class="ph"><img src="${esc(imgUrl(r))}" alt=""><button onclick="GF.refs.splice(${i},1);gForm()">✕</button></span>`).join('')}<button class="addPh" onclick="pickPhoto((r)=>{GF.refs.push(r);gForm()})">＋ Photo</button></div></div>` : ''}
      <label class="check" style="margin:4px 0 10px"><input type="checkbox" ${GF.photos !== false ? 'checked' : ''} onchange="GF.photos=this.checked"><span>Show item photos on the order card</span></label>
      <div class="field"><label>Note to vendor</label><textarea rows="2" oninput="GF.note=this.value" placeholder="e.g. Hallmark with HUID, polish finish">${esc(GF.note)}</textarea></div></div>
    ${GF.lines.map((l, i) => gLineHtml(l, i, c)).join('')}
    <button class="btn soft block" onclick="GF.lines.push(gBlankLine());gForm()">+ Add item</button>
    <div class="card gTot"><div class="kv"><span>Items</span><span>${t.n}</span></div><div class="kv"><span>Total quantity</span><span>${t.qty} pc</span></div><div class="kv tot"><span>Total weight</span><span>${fmtN(t.wt)} g</span></div></div>
    <div class="actions"><button class="btn secondary" onclick="GF=null;renderGrand()">Cancel</button><button class="btn" onclick="gSave()">${GF.id ? 'Save & make card' : 'Create order & make card'}</button></div>`;
}
function gLineHtml(l, i, c) {
  const it = gItem(l.item), models = it.models || [];
  const sizes = (it.sizes || []), custom = l.size && !sizes.includes(l.size);
  return `<div class="card gLine ${l.urgent ? 'urg' : ''}"><h3>Item ${i + 1}${GF.lines.length > 1 ? ` <button class="btn small secondary" style="float:right" onclick="GF.lines.splice(${i},1);gForm()">Remove</button>` : ''}</h3>
    <div class="field"><label>d. Item <i class="req">*</i></label><div class="choiceRow">${c.items.map((x) => `<button class="chip ${l.item === x.name ? 'active' : ''}" onclick="gL(${i},'item',${esc(JSON.stringify(x.name))});GF.lines[${i}].model='';GF.lines[${i}].img='';GF.lines[${i}].size='';gForm()">${esc(x.name)}</button>`).join('')}</div></div>
    ${l.item ? `<div class="field"><label>e. Model</label>${models.length ? `<div class="gModels">${models.map((m) => `<button class="gModel ${l.model === m.name ? 'on' : ''}" onclick="GF.lines[${i}].model=${esc(JSON.stringify(m.name))};GF.lines[${i}].img=${esc(JSON.stringify(m.img || ''))};gForm()">${m.img ? `<img src="${esc(imgUrl(m.img))}" alt="" loading="lazy">` : '<i>No photo</i>'}<b>${esc(m.name)}</b></button>`).join('')}</div>` : ''}
      <input value="${esc(models.some((m) => m.name === l.model) ? '' : l.model)}" placeholder="${models.length ? 'Or type another model no.' : 'Model no. / name'}" oninput="GF.lines[${i}].model=this.value;GF.lines[${i}].img=''"></div>` : ''}
    <div class="two"><div class="field"><label>f. Weight per piece (g)</label><input inputmode="decimal" value="${esc(l.wt)}" oninput="gL(${i},'wt',this.value);gLineTot(${i})"></div>
      <div class="field"><label>h. Quantity</label><input inputmode="numeric" value="${esc(l.qty)}" oninput="gL(${i},'qty',this.value);gLineTot(${i})"></div></div>
    <div class="field"><label>g. Length / size</label><div class="choiceRow">${sizes.map((s) => `<button class="chip ${l.size === s ? 'active' : ''}" onclick="gL(${i},'size',${esc(JSON.stringify(s))});gForm()">${esc(s)}</button>`).join('')}<button class="chip ${custom ? 'active' : ''}" onclick="GF.lines[${i}]._cs=1;gForm()">Custom length / size</button></div>
      ${custom || l._cs ? `<input style="margin-top:6px" value="${esc(custom ? l.size : '')}" placeholder="e.g. 8 pidi, first length 15 inches" oninput="gL(${i},'size',this.value)">` : ''}</div>
    ${GF.lockPur ? '' : `<div class="field"><label>Purity for this item</label><select onchange="gL(${i},'purity',this.value)">${opt(c.purities.map((p) => [p.name, p.name]), l.purity || GF.purity)}</select></div>`}
    <div class="kv tot"><span>i. Line weight (${fmtN(l.wt) || 0} g × ${Math.max(1, num(l.qty) || 1)})</span><span id="gLt${i}">${fmtN(gLineWt(l))} g</span></div>
    <label class="check" style="margin-top:8px"><input type="checkbox" ${l.urgent ? 'checked' : ''} onchange="gL(${i},'urgent',this.checked);gForm()"><span>j. 🚨 Emergency order</span></label>
    ${l.urgent ? `<div class="field"><label>Delivery date <i class="req">*</i></label><input type="date" value="${esc(l.due)}" min="${today()}" onchange="gL(${i},'due',this.value)"></div>` : ''}
    <div class="field"><label>Photo of item</label><div class="phRow">${l.img ? `<span class="ph"><img src="${esc(imgUrl(l.img))}" alt=""><button onclick="gL(${i},'img','');gForm()">✕</button></span>` : ''}<button class="addPh" onclick="pickPhoto((r)=>{gL(${i},'img',r);gForm()},true)">📷 Camera</button><button class="addPh" onclick="pickPhoto((r)=>{gL(${i},'img',r);gForm()})">＋ Gallery</button></div></div>
    <div class="field"><label>Note</label><input value="${esc(l.note)}" oninput="gL(${i},'note',this.value)" placeholder="Optional"></div>
  </div>`;
}
function gL(i, k, v) { GF.lines[i][k] = v; }
function gLineTot(i) { const el = $('gLt' + i); if (el) el.textContent = fmtN(gLineWt(GF.lines[i])) + ' g'; const t = gTotals(), tt = document.querySelector('.gTot'); if (tt) tt.innerHTML = `<div class="kv"><span>Items</span><span>${t.n}</span></div><div class="kv"><span>Total quantity</span><span>${t.qty} pc</span></div><div class="kv tot"><span>Total weight</span><span>${fmtN(t.wt)} g</span></div>`; }
function gSetVendor(n) { const v = gVendors().find((x) => x.name === n); GF.vendor = n; GF.vphone = v ? v.phone || '' : ''; gForm(); }
function gSetPur(p) { GF.purity = p; gForm(); }
async function gSave() {
  const g = clone(GF);
  g.lines = g.lines.filter((l) => l.item).map((l) => { delete l._cs; if (GF.lockPur || !l.purity) l.purity = g.purity; return l; });
  if (!g.vendor) return toast('Select the vendor');
  if (!g.by) return toast('Select who is sending the order');
  if (!g.lines.length) return toast('Add at least one item');
  const bad = g.lines.findIndex((l) => !(num(l.wt) > 0)); if (bad >= 0) return toast(`Item ${bad + 1}: enter the weight`);
  const ub = g.lines.findIndex((l) => l.urgent && !l.due); if (ub >= 0) return toast(`Item ${ub + 1}: give the emergency delivery date`);
  try {
    const d = await api('grand/save', { o: g });
    gOrders = [d.o].concat(gOrders.filter((x) => x.id !== d.o.id)); GF = null; renderGrand(); gShow(d.o.id, true);
  } catch (e) { toast(isNet(e) ? 'No internet — not saved' : e.message); }
}

// ---------- view / send ----------
async function gShow(id, send) {
  const o = gOrders.find((x) => x.id === id); if (!o) return;
  openSheet(`<h2>${esc(o.no)} <span class="badge ${G_ST[o.status][1]}">${G_ST[o.status][0]}</span></h2><p class="sub">${esc(o.vendor)} · ${o.qty} pc · ${fmtN(o.wt)} g · by ${esc(o.by)} · ${dt(o.at)}</p>
    <label class="check" style="margin:0 0 8px"><input type="checkbox" ${o.photos !== false ? 'checked' : ''} onchange="gPhotos('${id}',this.checked)"><span>Show item photos on the card</span></label>
    <div id="gCardBox"><p class="hint">Making the card…</p></div>
    <div class="actions" style="flex-wrap:wrap">${o.vphone ? `<button class="btn ok" onclick="gSend('${id}','vendor')">Send to vendor · ${esc(o.vendor)}</button>` : `<p class="hint">No WhatsApp number for ${esc(o.vendor)} — add it in Grand lists or Vendors. You can still download the card.</p>`}
      ${GC().copyTo.filter((x) => x.phone).map((x, k) => `<button class="btn secondary" onclick="gSend('${id}',${k})">Copy to ${esc(x.name || x.phone)}</button>`).join('')}</div>
    <div class="actions" style="flex-wrap:wrap">${o.status === 'sent' ? `<button class="btn small soft" onclick="gEdit('${id}')">Edit</button><button class="btn small soft" onclick="gStatus('${id}','received')">Mark received</button><button class="btn small secondary" onclick="gStatus('${id}','cancelled')">Cancel order</button>` : `<button class="btn small soft" onclick="gStatus('${id}','sent')">Re-open</button>`}
      ${me.role === 'admin' || can('delete') ? `<button class="btn small danger" onclick="gDelete('${id}')">Delete</button>` : ''}</div>
    <details class="sec"><summary>History</summary><div class="in">${(o.log || []).slice().reverse().map((l) => `<div class="kv"><span>${esc(l.t)}</span><span>${esc(l.by)} · ${dshort(l.at)}</span></div>`).join('')}</div></details>`);
  try { window._gCard = { id, url: await gCard(o) }; if ($('gCardBox')) $('gCardBox').innerHTML = `<img src="${window._gCard.url}" style="width:100%;border-radius:12px;border:1px solid var(--line)" alt=""><a class="btn small secondary" style="margin-top:8px;display:inline-block;text-decoration:none" href="${window._gCard.url}" download="${esc(o.no)}.jpg">Download card</a>`; }
  catch (e) { console.error(e); if ($('gCardBox')) $('gCardBox').innerHTML = '<div class="badBox">Could not draw the card</div>'; }
}
function gCaption(o) {
  const urg = (o.lines || []).filter((l) => l.urgent);
  return `Grand Jewellers order ${o.no} (${o.type === 'custom' ? 'Customised' : 'Regular stock'}): ${o.qty} pc, ${fmtN(o.wt)} g, ${o.purity}.` + (urg.length ? ` 🚨 EMERGENCY: ${urg.map((l) => `${l.item}${l.model ? ' ' + l.model : ''} by ${dshort(l.due)}`).join('; ')}.` : '') + (o.due ? ` Delivery by ${dshort(o.due)}.` : '') + ` Sent by ${o.by}.`;
}
async function gSend(id, to) {
  const o = gOrders.find((x) => x.id === id); if (!o) return;
  const url = window._gCard && window._gCard.id === id ? window._gCard.url : await gCard(o);
  const c = GC(), tgt = to === 'vendor' ? { name: o.vendor, phone: o.vphone } : c.copyTo[to];
  const cap = (to === 'vendor' ? '' : `Copy · to ${o.vendor}. `) + gCaption(o);
  if (NATIVE && NATIVE.shareWhatsApp) { try { NATIVE.shareWhatsApp(waDigits(tgt.phone), cap, JSON.stringify([url])); } catch (e) { NATIVE.shareWhatsApp(waDigits(tgt.phone), cap, '[]'); } }
  else { window._cardUrl = url; window._cardCap = cap; window._cardPhone = tgt.phone; await waSendCard(o.no + '.jpg'); }
  try { const d = await api('grand/log', { id, t: `Card sent to ${to === 'vendor' ? 'vendor ' : ''}${tgt.name || tgt.phone}` }); gOrders = gOrders.map((x) => (x.id === id ? d.o : x)); } catch (e) { /* offline: the card still went */ }
}
async function gPhotos(id, on) {
  const o = gOrders.find((x) => x.id === id); if (!o) return;
  try { const d = await api('grand/save', { o: Object.assign(clone(o), { photos: on }), log: on ? 'Photos shown on card' : 'Photos hidden on card' }); gOrders = gOrders.map((x) => (x.id === id ? d.o : x)); gShow(id); } catch (e) { toast(e.message); }
}
async function gStatus(id, st) {
  const o = gOrders.find((x) => x.id === id); if (!o) return;
  if (st === 'cancelled' && !confirm('Cancel ' + o.no + '?')) return;
  try { const d = await api('grand/save', { o: Object.assign(clone(o), { status: st }), log: 'Status: ' + G_ST[st][0] }); gOrders = gOrders.map((x) => (x.id === id ? d.o : x)); closeSheet(); renderGrand(); toast(G_ST[st][0]); } catch (e) { toast(e.message); }
}
async function gDelete(id) {
  const o = gOrders.find((x) => x.id === id); if (!o || !confirm('Delete ' + o.no + ' for good?')) return;
  try { await api('grand/delete', { id }); gOrders = gOrders.filter((x) => x.id !== id); closeSheet(); renderGrand(); toast('Deleted'); } catch (e) { toast(e.message); }
}

// ---------- image card: violet gradient, minimal branding, order table ----------
async function gCard(o) {
  const T = { a: '#4a1a8c', b: '#8b5cf6', ink: '#4a1a8c', txt: '#211b2c', mute: '#6b6478', soft: '#f3eefe', soft2: '#faf8ff', line: '#e2d8f7', red: '#c0262d' };
  const k = cardKit(T), { x, W } = k, P = 48, lines = o.lines || [], showPh = o.photos !== false && lines.some((l) => l.img);
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, k.c.height);
  // slim header: small logo left, order no. right
  x.fillStyle = k.grad(0, 0, W, 0, T.a, T.b); x.fillRect(0, 0, W, 128);
  const [mk, wd] = await Promise.all([loadImg(LOGO.gMarkW), loadImg(LOGO.gWordW)]);
  if (mk) k.contain(mk, P, 26, 76, 76);
  if (wd) k.contain(wd, P + 92, 30, 250, 68);
  k.t(o.type === 'custom' ? 'CUSTOMISED ORDER' : 'STOCK ORDER', W - P, 56, 20, 700, 'rgba(255,255,255,.8)', 'right');
  k.t(o.no, W - P, 96, 38, 800, '#fff', 'right');
  let y = 168;
  // details: two columns of label · value
  const det = [['Vendor', o.vendor], ['Date', dt(o.at)], ['Sent by', o.by], ['Purity', o.purity + (o.lockPur ? '' : ' (see items)')]];
  if (o.due) det.push(['Delivery by', dt(o.due)]);
  if (o.status !== 'sent') det.push(['Status', G_ST[o.status][0]]);
  det.forEach(([l, v], i) => { const cx = P + (i % 2) * ((W - 2 * P) / 2), cy = y + Math.floor(i / 2) * 44; k.t(l, cx, cy, 22, 500, T.mute); k.t(String(v || '—').slice(0, 26), cx + 140, cy, 24, 700, T.txt); });
  y += Math.ceil(det.length / 2) * 44 + 10;
  if (gUrgent(o)) { k.box(P, y, W - 2 * P, 58, 14, T.red); k.t(`🚨 EMERGENCY ORDER · deliver by ${dt(gDue(o))}`, W / 2, y + 39, 26, 800, '#fff', 'center'); y += 76; }
  // table
  const cols = (showPh ? [['', 104, 'l']] : []).concat([['Item', showPh ? 178 : 220, 'l'], ['Model', showPh ? 168 : 200, 'l'], ['Weight (g)', 128, 'r'], ['Length / size', showPh ? 178 : 210, 'l'], ['Qty', 74, 'r'], ['Total (g)', 0, 'r']]);
  const fixed = cols.reduce((t, c) => t + c[1], 0); cols[cols.length - 1][1] = W - 2 * P - fixed;
  const cx = []; cols.reduce((t, c) => { cx.push(t); return t + c[1]; }, P);
  const pad = 14, cell = (i, txt, yy, sz, wt, col) => { const [, w, al] = cols[i]; k.t(txt, al === 'r' ? cx[i] + w - pad : cx[i] + pad, yy, sz, wt, col, al === 'r' ? 'right' : 'left'); };
  k.box(P, y, W - 2 * P, 58, [16, 16, 0, 0], k.grad(P, y, W - P, y, T.a, T.b));
  cols.forEach((c, i) => cell(i, c[0], y + 37, 20, 700, '#fff')); y += 58;
  const ims = showPh ? await Promise.all(lines.map((l) => loadImg(l.img ? imgUrl(l.img) : ''))) : [];
  const ti = showPh ? 1 : 0;
  lines.forEach((l, r) => {
    const wrapC = (i, txt, wt) => k.wrap(String(txt || '—'), cols[i][1] - 2 * pad, 24, wt);
    const it = wrapC(ti, l.item, 700), md = wrapC(ti + 1, l.model, 500), sz = wrapC(ti + 3, l.size, 500);
    const extra = (l.urgent ? 1 : 0) + (l.note ? 1 : 0);
    let h = Math.max(it.length, md.length, sz.length) * 32 + 30 + extra * 28; if (showPh) h = Math.max(h, 116);
    x.fillStyle = r % 2 ? T.soft2 : '#fff'; x.fillRect(P, y, W - 2 * P, h);
    if (l.urgent) { x.fillStyle = T.red; x.fillRect(P, y, 6, h); }
    if (showPh && ims[r]) { k.box(cx[0] + 10, y + 10, cols[0][1] - 20, 96, 10, T.soft); k.contain(ims[r], cx[0] + 10, y + 10, cols[0][1] - 20, 96, 2); }
    const ty = y + 40;
    it.forEach((ln, j) => cell(ti, ln, ty + j * 32, 24, 700, T.txt));
    md.forEach((ln, j) => cell(ti + 1, ln, ty + j * 32, 24, 500, T.txt));
    cell(ti + 2, fmtN(l.wt), ty, 24, 600, T.txt);
    sz.forEach((ln, j) => cell(ti + 3, ln, ty + j * 32, 24, 500, T.txt));
    cell(ti + 4, String(l.qty), ty, 24, 600, T.txt);
    cell(ti + 5, fmtN(Math.round(l.wt * l.qty * 1000) / 1000), ty, 24, 800, T.ink);
    let ny = y + Math.max(it.length, md.length, sz.length) * 32 + 34;
    if (l.urgent) { k.t(`🚨 Emergency · by ${dshort(l.due)}`, cx[ti] + pad, ny, 20, 800, T.red); ny += 28; }
    if (l.note) k.t(('Note: ' + l.note).slice(0, 70), cx[ti] + pad, ny, 20, 400, T.mute);
    y += h; x.fillStyle = T.line; x.fillRect(P, y - 1, W - 2 * P, 1);
  });
  // total row
  k.box(P, y, W - 2 * P, 70, [0, 0, 16, 16], T.soft);
  cell(ti, 'Total', y + 45, 26, 800, T.ink); cell(ti + 4, String(o.qty), y + 45, 26, 800, T.ink); cell(ti + 5, fmtN(o.wt), y + 45, 28, 800, T.ink);
  k.t(`${lines.length} item${lines.length === 1 ? '' : 's'}`, cx[ti + 1] + pad, y + 45, 22, 500, T.mute);
  y += 70;
  y += 30;
  if (o.note) { k.wrap('Note: ' + o.note, W - 2 * P, 24, 400).forEach((ln) => { k.t(ln, P, y + 10, 24, 400, T.txt); y += 34; }); y += 6; }
  if (o.photos !== false && o.refs && o.refs.length) {
    const rim = await Promise.all(o.refs.map((r) => loadImg(imgUrl(r)))), sz = (W - 2 * P - 20 * 3) / 4;
    k.t('Reference photos', P, y + 16, 22, 700, T.mute); y += 34;
    rim.forEach((im, i) => { const px = P + (i % 4) * (sz + 20), py = y + Math.floor(i / 4) * (sz + 20); k.box(px, py, sz, sz, 14, T.soft); if (im) k.contain(im, px, py, sz, sz, 4); });
    y += Math.ceil(rim.length / 4) * (sz + 20) + 4;
  }
  x.fillStyle = k.grad(P, y, W - P, y, T.a, T.b); x.fillRect(P, y, W - 2 * P, 2); y += 40;
  k.t('Please confirm receipt and delivery date on WhatsApp · Grand Jewellers, Koothattukulam', W / 2, y, 20, 500, T.mute, 'center'); y += 36;
  return finishCard(k, y);
}

// ---------- Grand lists (settings) ----------
function subGrand() {
  window._gc = GC();
  const edit = can('grandcfg') || can('settings');
  const arr = (k, ph) => `<div class="field"><div class="choiceRow" id="gcl_${k}"></div><div class="two" style="margin-top:6px"><input id="gci_${k}" placeholder="${ph}"><button class="btn small soft" onclick="const v=$('gci_${k}').value.trim();if(v&&!_gc.${k}.includes(v)){_gc.${k}.push(v);$('gci_${k}').value='';gcPaint()}">Add</button></div></div>`;
  $('subBody').innerHTML = `<div class="gHead"><img src="${LOGO.gMarkK}" alt=""><h1 class="h1" style="margin:0">Grand lists</h1></div>
    ${edit ? '' : '<div class="warnBox">Only roles with "Edit Grand module lists" can change these.</div>'}
    <div class="card"><h3>Order sent by — staff names</h3>${arr('staff', 'Staff name')}</div>
    <div class="card"><h3>Copy to Grand order staff (WhatsApp)</h3><p class="sub">Each order card gets a "Copy to" button for these numbers.</p><div id="gcCopy"></div><button class="btn small soft" onclick="_gc.copyTo.push({name:'',phone:''});gcPaint()">+ Add number</button></div>
    <div class="card"><h3>Grand vendors</h3><p class="sub">Leave empty to use the Order Desk vendor list.</p><div id="gcVend"></div><button class="btn small soft" onclick="_gc.vendors.push({name:'',phone:''});gcPaint()">+ Add vendor</button></div>
    <div class="card"><h3>Purities</h3><p class="sub">Tap ★ to set the standard purity (selected by default).</p><div id="gcPur"></div><div class="two" style="margin-top:6px"><input id="gci_pur" placeholder="e.g. 22K (916)"><button class="btn small soft" onclick="const v=$('gci_pur').value.trim();if(v){_gc.purities.push({name:v});$('gci_pur').value='';gcPaint()}">Add</button></div></div>
    <div class="card"><h3>Items, standard sizes & models</h3><div id="gcItems"></div><div class="two" style="margin-top:6px"><input id="gci_item" placeholder="New item, e.g. Mangalsutra"><button class="btn small soft" onclick="const v=$('gci_item').value.trim();if(v){_gc.items.push({name:v,sizes:[],models:[]});$('gci_item').value='';gcPaint()}">Add item</button></div></div>
    ${edit ? '<button class="btn block" onclick="gcSave()">Save Grand lists</button>' : ''}`;
  gcPaint();
}
function gcPaint() {
  const c = _gc, rm = (expr) => `onclick="${expr};gcPaint()"`;
  $('gcl_staff').innerHTML = c.staff.map((n, i) => `<button class="chip" ${rm(`_gc.staff.splice(${i},1)`)}>${esc(n)} ✕</button>`).join('') || '<span class="hint">None yet</span>';
  const pr = (list, key) => list.map((r, i) => `<div class="two" style="margin-bottom:6px"><input value="${esc(r.name)}" placeholder="Name" oninput="_gc.${key}[${i}].name=this.value"><div class="wtRow" style="margin:0"><input value="${esc(r.phone)}" placeholder="WhatsApp" inputmode="tel" oninput="_gc.${key}[${i}].phone=this.value">${canPickContact() ? `<button class="btn small soft" onclick="pickContact((n,p)=>{_gc.${key}[${i}].name=_gc.${key}[${i}].name||n;_gc.${key}[${i}].phone=p;gcPaint()})">📇</button>` : ''}<button class="btn small secondary" ${rm(`_gc.${key}.splice(${i},1)`)}>✕</button></div></div>`).join('');
  $('gcCopy').innerHTML = pr(c.copyTo, 'copyTo'); $('gcVend').innerHTML = pr(c.vendors, 'vendors');
  $('gcPur').innerHTML = c.purities.map((p, i) => `<div class="kv"><span><button class="btn small ${p.std ? '' : 'soft'}" ${rm(`_gc.purities.forEach((x,j)=>x.std=j===${i})`)}>${p.std ? '★ Standard' : '☆'}</button> ${esc(p.name)}</span><button class="btn small secondary" ${rm(`_gc.purities.splice(${i},1)`)}>✕</button></div>`).join('');
  $('gcItems').innerHTML = c.items.map((it, i) => `<details class="sec"><summary>${esc(it.name)} <span class="hint">· ${(it.sizes || []).length} sizes · ${(it.models || []).length} models</span></summary><div class="in">
    <div class="two"><input value="${esc(it.name)}" oninput="_gc.items[${i}].name=this.value"><button class="btn small secondary" ${rm(`_gc.items.splice(${i},1)`)}>Remove item</button></div>
    <div class="field"><label>Standard sizes / lengths (comma separated)</label><input value="${esc((it.sizes || []).join(', '))}" oninput="_gc.items[${i}].sizes=this.value.split(',').map(s=>s.trim()).filter(Boolean)"></div>
    <div class="field"><label>Models (with photo)</label><div class="gModels">${(it.models || []).map((m, j) => `<div class="gModel"><button class="gmPh" onclick="pickPhoto((r)=>{_gc.items[${i}].models[${j}].img=r;gcPaint()})">${m.img ? `<img src="${esc(imgUrl(m.img))}" alt="">` : '<i>＋ Photo</i>'}</button><input value="${esc(m.name)}" placeholder="Model no." oninput="_gc.items[${i}].models[${j}].name=this.value"><button class="btn small secondary" ${rm(`_gc.items[${i}].models.splice(${j},1)`)}>✕</button></div>`).join('')}</div>
      <button class="btn small soft" style="margin-top:6px" onclick="(_gc.items[${i}].models=_gc.items[${i}].models||[]).push({name:'',img:''});gcPaint();this.closest('details').open=true">+ Add model</button></div></div></details>`).join('');
  document.querySelectorAll('#gcItems details').forEach((d, i) => { d.ontoggle = () => { window._gcOpen = d.open ? i : window._gcOpen === i ? -1 : window._gcOpen; }; if (window._gcOpen === i) d.open = true; });
}
async function gcSave() {
  const c = clone(_gc);
  c.staff = c.staff.filter(Boolean); c.copyTo = c.copyTo.filter((x) => x.phone); c.vendors = c.vendors.filter((x) => x.name);
  c.items = c.items.filter((x) => x.name).map((x) => ({ name: x.name, sizes: x.sizes || [], models: (x.models || []).filter((m) => m.name || m.img) }));
  if (!c.purities.some((p) => p.std) && c.purities[0]) c.purities[0].std = true;
  try { await api('grand/cfg', { grand: c }); S.grand = c; toast('Grand lists saved'); } catch (e) { toast(e.message); }
}
