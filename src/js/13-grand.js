// ======================================================================
// Grand module — vendor orders for Grand Jewellers (permission: grand; lists: grandcfg)
// ======================================================================
const GDEF = {
  staff: [], recvStaff: [], qcStaff: [], markStaff: [], labelStaff: [], packStaff: [], copyTo: [], vendors: [],
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
const G_ST = { sent: ['Sent to vendor', 'b'], partial: ['Incomplete · items pending', 'w'], received: ['Received · in work', 'v'], closed: ['Closed', 'g'], cancelled: ['Cancelled', 'r'] };
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
  const pass = (o) => (!gFil || (gFil === 'urgent' ? gUrgent(o) && ['sent', 'partial'].includes(o.status) : o.status === gFil)) &&
    (!q || [o.no, o.vendor, o.by, o.type === 'custom' ? 'customised' : 'stock'].concat((o.lines || []).map((l) => l.item + ' ' + l.model)).join(' ').toLowerCase().includes(q));
  const list = gOrders.filter(pass), cnt = (f) => gOrders.filter((o) => !f || (f === 'urgent' ? gUrgent(o) && ['sent', 'partial'].includes(o.status) : o.status === f)).length;
  $('vGrand').innerHTML = `<div class="gHead"><img src="${LOGO.gMarkK}" alt=""><div><p class="kicker" style="margin:0">Order management</p><h1 class="h1" style="margin:0">Grand orders</h1></div></div>
    <p class="sub">Vendor orders for Grand Jewellers. Each order makes an image card for the vendor, with a copy to the Grand order staff.</p>
    <div class="actions" style="margin:0 0 10px"><button class="btn" onclick="gNew()">+ New Grand order</button>${can('grandcfg') || can('settings') ? '<button class="btn secondary" onclick="openSub(\'grand\')">Grand lists</button>' : ''}</div>
    <input class="search" placeholder="Search GJO no., vendor, item, model" value="${esc(gQ)}" oninput="gQ=this.value;renderGrand();const e=$('vGrand').querySelector('.search');e.focus();e.setSelectionRange(e.value.length,e.value.length)">
    <div class="filters">${[['', 'All'], ['urgent', '🚨 Emergency'], ['sent', 'Sent'], ['partial', 'Incomplete'], ['received', 'In work'], ['closed', 'Closed'], ['cancelled', 'Cancelled']].map(([k, l]) => `<button class="chip ${gFil === k ? 'active' : ''}" onclick="gFil='${k}';renderGrand()">${l}<em>${cnt(k)}</em></button>`).join('')}</div>
    ${list.length ? list.map((o) => `<button class="row" onclick="gShow('${o.id}')"><span style="flex:1;min-width:0"><b>${esc(o.no)} · ${esc(o.vendor)}</b>${gUrgent(o) && ['sent', 'partial'].includes(o.status) ? ' <span class="badge r">EMERGENCY</span>' : ''}<br>
      <small class="hint" style="margin:0">${o.type === 'custom' ? 'Customised' : 'Regular stock'} · ${o.qty} pc · ${fmtN(o.wt)} g · ${esc(o.purity || '')} · by ${esc(o.by)} · ${dshort(o.at)}${gDue(o) ? ' · due ' + dshort(gDue(o)) : ''}${o.status === 'partial' ? ' · <b>' + gPendAll(o) + ' pc pending</b>' : ''}${(o.batches || []).some((b) => !['sent', 'failed'].includes(b.stage)) ? ' · ' + esc(G_STAGE[(o.batches || []).find((b) => !['sent', 'failed'].includes(b.stage)).stage]) : ''}</small></span>
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
const gIsSub = (i) => i > 0 && GF.lines[i].sub && GF.lines[i - 1].item === GF.lines[i].item && GF.lines[i - 1].model === GF.lines[i].model;
const gGroupEnd = (i) => { let j = i; while (j + 1 < GF.lines.length && gIsSub(j + 1)) j++; return j; };
// after item, model, weight and quantity are filled: ask for more of the same design in other weights / lengths
function gAskHtml(i) {
  const l = GF.lines[i]; if (!l || gGroupEnd(i) !== i || l._noMore || !l.item || !l.model || !(num(l.wt) > 0) || !(num(l.qty) > 0)) return '';
  return `<div class="gAsk"><span>More <b>${esc(l.item)} · ${esc(l.model)}</b> in another weight, length or quantity?</span><span><button class="btn small" onclick="gAddVariant(${i})">Yes, add</button><button class="btn small secondary" onclick="GF.lines[${i}]._noMore=1;gAsk(${i})">No</button></span></div>`;
}
function gAsk(i) { const el = $('gAsk' + i); if (el) el.innerHTML = gAskHtml(i); }
function gAddVariant(i) {
  const l = GF.lines[i], n = Object.assign(gBlankLine(), { item: l.item, model: l.model, img: l.ownImg ? '' : l.img, purity: l.purity, sub: 1 });
  GF.lines.splice(i + 1, 0, n); gForm();
  setTimeout(() => { const el = document.querySelectorAll('.gLine')[i + 1]; if (el) { el.scrollIntoView({ block: 'center' }); const w = el.querySelector('input'); if (w) w.focus(); } }, 50);
}
function gSyncSubs(i) { const l = GF.lines[i]; for (let j = i + 1; j < GF.lines.length && GF.lines[j].sub; j++) Object.assign(GF.lines[j], { item: l.item, model: l.model, purity: l.purity }, GF.lines[j].ownImg ? {} : { img: l.ownImg ? '' : l.img }); }
function gLineHtml(l, i, c) {
  const it = gItem(l.item), models = it.models || [];
  const sizes = (it.sizes || []), custom = l.size && !sizes.includes(l.size), sub = gIsSub(i);
  const wq = `<div class="two"><div class="field"><label>f. Weight per piece (g)</label><input inputmode="decimal" value="${esc(l.wt)}" oninput="gL(${i},'wt',this.value);gLineTot(${i});gAsk(${i})"></div>
      <div class="field"><label>h. Quantity</label><input inputmode="numeric" value="${esc(l.qty)}" oninput="gL(${i},'qty',this.value);gLineTot(${i});gAsk(${i})"></div></div>`;
  const rmB = GF.lines.length > 1 ? ` <button class="btn small secondary" style="float:right" onclick="GF.lines.splice(${i},${sub ? 1 : gGroupEnd(i) - i + 1});gForm()">Remove</button>` : '';
  if (sub) return `<div class="card gLine gSub ${l.urgent ? 'urg' : ''}"><h3>↳ ${esc(l.item)} · ${esc(l.model)} <small class="hint">same design, another weight / length</small>${rmB}</h3>${wq}
    <div class="field"><label>g. Length / size</label><div class="choiceRow">${sizes.map((s) => `<button class="chip ${l.size === s ? 'active' : ''}" onclick="gL(${i},'size',${esc(JSON.stringify(s))});gForm()">${esc(s)}</button>`).join('')}<button class="chip ${custom ? 'active' : ''}" onclick="GF.lines[${i}]._cs=1;gForm()">Custom length / size</button></div>
      ${custom || l._cs ? `<input style="margin-top:6px" value="${esc(custom ? l.size : '')}" placeholder="e.g. 8 pidi, first length 15 inches" oninput="gL(${i},'size',this.value)">` : ''}</div>
    <div class="kv tot"><span>i. Line weight</span><span id="gLt${i}">${fmtN(gLineWt(l))} g</span></div>
    <label class="check" style="margin-top:8px"><input type="checkbox" ${l.urgent ? 'checked' : ''} onchange="gL(${i},'urgent',this.checked);gForm()"><span>j. 🚨 Emergency order</span></label>
    ${l.urgent ? `<div class="field"><label>Delivery date <i class="req">*</i></label><input type="date" value="${esc(l.due)}" min="${today()}" onchange="gL(${i},'due',this.value)"></div>` : ''}
    <div class="field"><label>Note</label><input value="${esc(l.note)}" oninput="gL(${i},'note',this.value)" placeholder="Optional"></div>
    <div id="gAsk${i}">${gAskHtml(i)}</div></div>`;
  return `<div class="card gLine ${l.urgent ? 'urg' : ''}"><h3>Item ${GF.lines.slice(0, i + 1).filter((x, j) => !gIsSub(j)).length}${rmB}</h3>
    <div class="field"><label>d. Item <i class="req">*</i></label><div class="choiceRow">${c.items.map((x) => `<button class="chip ${l.item === x.name ? 'active' : ''}" onclick="gL(${i},'item',${esc(JSON.stringify(x.name))});GF.lines[${i}].model='';GF.lines[${i}].img='';GF.lines[${i}].size='';gSyncSubs(${i});gForm()">${esc(x.name)}</button>`).join('')}</div></div>
    ${l.item ? gModelField(l, i, models) : ''}
    ${wq}
    <div class="field"><label>g. Length / size</label><div class="choiceRow">${sizes.map((s) => `<button class="chip ${l.size === s ? 'active' : ''}" onclick="gL(${i},'size',${esc(JSON.stringify(s))});gForm()">${esc(s)}</button>`).join('')}<button class="chip ${custom ? 'active' : ''}" onclick="GF.lines[${i}]._cs=1;gForm()">Custom length / size</button></div>
      ${custom || l._cs ? `<input style="margin-top:6px" value="${esc(custom ? l.size : '')}" placeholder="e.g. 8 pidi, first length 15 inches" oninput="gL(${i},'size',this.value)">` : ''}</div>
    ${GF.lockPur ? '' : `<div class="field"><label>Purity for this item</label><select onchange="gL(${i},'purity',this.value)">${opt(c.purities.map((p) => [p.name, p.name]), l.purity || GF.purity)}</select></div>`}
    <div class="kv tot"><span>i. Line weight (${fmtN(l.wt) || 0} g × ${Math.max(1, num(l.qty) || 1)})</span><span id="gLt${i}">${fmtN(gLineWt(l))} g</span></div>
    <label class="check" style="margin-top:8px"><input type="checkbox" ${l.urgent ? 'checked' : ''} onchange="gL(${i},'urgent',this.checked);gForm()"><span>j. 🚨 Emergency order</span></label>
    ${l.urgent ? `<div class="field"><label>Delivery date <i class="req">*</i></label><input type="date" value="${esc(l.due)}" min="${today()}" onchange="gL(${i},'due',this.value)"></div>` : ''}
    <div class="field"><label>Photo of item</label><div class="phRow">${l.img ? `<span class="ph"><img src="${esc(imgUrl(l.img))}" alt=""><button onclick="gL(${i},'img','');gL(${i},'ownImg',0);gForm()">✕</button></span>` : ''}<button class="addPh" onclick="pickPhoto((r)=>{gL(${i},'img',r);gL(${i},'ownImg',1);gForm()},true)">📷 Camera</button><button class="addPh" onclick="pickPhoto((r)=>{gL(${i},'img',r);gL(${i},'ownImg',1);gForm()})">＋ Gallery</button></div></div>
    <div class="field"><label>Note</label><input value="${esc(l.note)}" oninput="gL(${i},'note',this.value)" placeholder="Optional"></div>
    <div id="gAsk${i}">${gAskHtml(i)}</div>
  </div>`;
}
function gL(i, k, v) { GF.lines[i][k] = v; }
const gSortM = (a) => a.slice().sort((x, y) => String(x.name).localeCompare(String(y.name), 'en', { numeric: true, sensitivity: 'base' }));
// Model: drop-down (A–Z, the selected vendor's designs first), photo browser folded away
function gModelField(l, i, models) {
  const ms = gSortM(models.filter((m) => m.name)), v = GF.vendor, mine = v ? ms.filter((m) => (m.vendors || []).includes(v)) : [], rest = ms.filter((m) => !mine.includes(m));
  const o = (m) => `<option value="${esc(m.name)}" ${l.model === m.name ? 'selected' : ''}>${esc(m.name)}${(m.vendors || []).length && !mine.includes(m) ? ' · ' + esc(m.vendors.join(', ')) : ''}</option>`;
  const known = ms.find((m) => m.name === l.model), pic = known && known.img;
  return `<div class="field"><label>e. Model</label>
    ${ms.length ? `<div class="gmSel">${pic ? `<img src="${esc(imgUrl(pic))}" alt="">` : ''}<select onchange="gPickModel(${i},this.value)"><option value="">Select model (${ms.length})</option>${mine.length ? `<optgroup label="${esc(v)} designs">${mine.map(o).join('')}</optgroup><optgroup label="Other designs">${rest.map(o).join('')}</optgroup>` : ms.map(o).join('')}<option value="__other" ${l.model && !known ? 'selected' : ''}>Other — type below</option></select></div>
    <details class="sec gmBrowse"><summary>Browse models with photos</summary><div class="in"><div class="gModels">${(mine.length ? mine.concat(rest) : ms).map((m) => `<button class="gModel ${l.model === m.name ? 'on' : ''}" onclick='gPickModel(${i},${esc(JSON.stringify(m.name))})'>${m.img ? `<img src="${esc(imgUrl(m.img))}" alt="" loading="lazy">` : '<i>No photo</i>'}<b>${esc(m.name)}</b></button>`).join('')}</div></div></details>` : ''}
    ${!ms.length || (l.model && !known) || l._om ? `<input style="margin-top:6px" value="${esc(known ? '' : l.model)}" placeholder="Model no. / name" oninput="GF.lines[${i}].model=this.value;GF.lines[${i}].img=GF.lines[${i}].ownImg?GF.lines[${i}].img:'';gSyncSubs(${i});gAsk(${i})">` : ''}</div>`;
}
function gPickModel(i, name) {
  const l = GF.lines[i];
  if (name === '__other') { l.model = ''; l._om = 1; if (!l.ownImg) l.img = ''; return gForm(); }
  const m = (gItem(l.item).models || []).find((x) => x.name === name);
  l.model = name; l._om = 0; if (!l.ownImg) l.img = m && m.img ? m.img : '';
  gSyncSubs(i);
  if (m && !GF.vendor && (m.vendors || []).length === 1) gSetVendor(m.vendors[0]); else gForm();
}
function gLineTot(i) { const el = $('gLt' + i); if (el) el.textContent = fmtN(gLineWt(GF.lines[i])) + ' g'; const t = gTotals(), tt = document.querySelector('.gTot'); if (tt) tt.innerHTML = `<div class="kv"><span>Items</span><span>${t.n}</span></div><div class="kv"><span>Total quantity</span><span>${t.qty} pc</span></div><div class="kv tot"><span>Total weight</span><span>${fmtN(t.wt)} g</span></div>`; }
function gSetVendor(n) { const v = gVendors().find((x) => x.name === n); GF.vendor = n; GF.vphone = v ? v.phone || '' : ''; gForm(); }
function gSetPur(p) { GF.purity = p; gForm(); }
async function gSave() {
  const g = clone(GF);
  g.lines = g.lines.filter((l) => l.item).map((l) => { delete l._cs; delete l._om; delete l.ownImg; delete l._noMore; if (GF.lockPur || !l.purity) l.purity = g.purity; return l; });
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
    ${o.status !== 'cancelled' ? gWorkHtml(o) : ''}
    <details class="sec" ${(o.batches || []).length ? '' : 'open'}><summary>Order card</summary><div class="in">
    <label class="check" style="margin:0 0 8px"><input type="checkbox" ${o.photos !== false ? 'checked' : ''} onchange="gPhotos('${id}',this.checked)"><span>Show item photos on the card</span></label>
    <div id="gCardBox"><p class="hint">Making the card…</p></div>
    <div class="actions" style="flex-wrap:wrap">${o.vphone ? `<button class="btn ok" onclick="gSend('${id}','vendor')">Send to vendor · ${esc(o.vendor)}</button>` : `<p class="hint">No WhatsApp number for ${esc(o.vendor)} — add it in Grand lists or Vendors. You can still download the card.</p>`}
      ${GC().copyTo.filter((x) => x.phone).map((x, k) => `<button class="btn secondary" onclick="gSend('${id}',${k})">Copy to ${esc(x.name || x.phone)}</button>`).join('')}</div></div></details>
    <div class="actions" style="flex-wrap:wrap">${o.status === 'sent' && !(o.batches || []).length ? `<button class="btn small soft" onclick="gEdit('${id}')">Edit</button>` : ''}${['sent', 'partial'].includes(o.status) && !(o.batches || []).length ? `<button class="btn small secondary" onclick="gStatus('${id}','cancelled')">Cancel order</button>` : ''}${o.status === 'cancelled' ? `<button class="btn small soft" onclick="gStatus('${id}','sent')">Re-open</button>` : ''}
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
  try { const d = await api('grand/save', { o: Object.assign(clone(o), { status: st }), log: st === 'cancelled' ? 'Cancelled' : 'Re-opened' }); gOrders = gOrders.map((x) => (x.id === id ? d.o : x)); closeSheet(); renderGrand(); toast(G_ST[st][0]); } catch (e) { toast(e.message); }
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
  let grp = -1;
  lines.forEach((l, r) => {
    const same = r > 0 && lines[r - 1].item === l.item && lines[r - 1].model === l.model;
    if (!same) grp++;
    const wrapC = (i, txt, wt) => k.wrap(String(txt || '—'), cols[i][1] - 2 * pad, 24, wt);
    const it = same ? [] : wrapC(ti, l.item, 700), md = same ? [] : wrapC(ti + 1, l.model, 500), sz = wrapC(ti + 3, l.size, 500);
    const extra = (l.urgent ? 1 : 0) + (l.note ? 1 : 0);
    const pic = ims[r] && !(same && lines[r - 1].img === l.img) ? ims[r] : null;
    let h = Math.max(it.length, md.length, sz.length, 1) * 32 + 30 + extra * 28; if (pic) h = Math.max(h, 116);
    x.fillStyle = grp % 2 ? T.soft2 : '#fff'; x.fillRect(P, y, W - 2 * P, h);
    if (same) { x.fillStyle = T.line; x.fillRect(cx[ti] + pad, y - 1, W - P - cx[ti] - pad, 1); k.t('↳', cx[ti] + pad, y + 40, 24, 600, T.mute); }
    if (l.urgent) { x.fillStyle = T.red; x.fillRect(P, y, 6, h); }
    if (showPh && pic) { k.box(cx[0] + 10, y + 10, cols[0][1] - 20, 96, 10, T.soft); k.contain(pic, cx[0] + 10, y + 10, cols[0][1] - 20, 96, 2); }
    const ty = y + 40;
    it.forEach((ln, j) => cell(ti, ln, ty + j * 32, 24, 700, T.txt));
    md.forEach((ln, j) => cell(ti + 1, ln, ty + j * 32, 24, 500, T.txt));
    cell(ti + 2, fmtN(l.wt), ty, 24, 600, T.txt);
    sz.forEach((ln, j) => cell(ti + 3, ln, ty + j * 32, 24, 500, T.txt));
    cell(ti + 4, String(l.qty), ty, 24, 600, T.txt);
    cell(ti + 5, fmtN(Math.round(l.wt * l.qty * 1000) / 1000), ty, 24, 800, T.ink);
    let ny = y + Math.max(it.length, md.length, sz.length, 1) * 32 + 34;
    if (l.urgent) { k.t(`🚨 Emergency · by ${dshort(l.due)}`, cx[ti] + pad, ny, 20, 800, T.red); ny += 28; }
    if (l.note) k.t(('Note: ' + l.note).slice(0, 70), cx[ti] + pad, ny, 20, 400, T.mute);
    y += h; const nx = lines[r + 1], nsame = nx && nx.item === l.item && nx.model === l.model;
    if (!nsame) { x.fillStyle = T.line; x.fillRect(P, y - 1, W - 2 * P, 1); }
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
    <div class="card"><h3>Work staff (after the vendor delivers)</h3><p class="sub">The first name in each list is the main person and is picked by default.</p>${G_ROLES.map(([k, l]) => `<div class="field"><label>${l}</label>${arr(k, 'Staff name')}</div>`).join('')}</div>
    <div class="card"><h3>Copy to Grand order staff (WhatsApp)</h3><p class="sub">Each order card gets a "Copy to" button for these numbers.</p><div id="gcCopy"></div><button class="btn small soft" onclick="_gc.copyTo.push({name:'',phone:''});gcPaint()">+ Add number</button></div>
    <div class="card"><h3>Grand vendors</h3><p class="sub">Leave empty to use the Order Desk vendor list.</p><div id="gcVend"></div><button class="btn small soft" onclick="_gc.vendors.push({name:'',phone:''});gcPaint()">+ Add vendor</button></div>
    <div class="card"><h3>Purities</h3><p class="sub">Tap ★ to set the standard purity (selected by default).</p><div id="gcPur"></div><div class="two" style="margin-top:6px"><input id="gci_pur" placeholder="e.g. 22K (916)"><button class="btn small soft" onclick="const v=$('gci_pur').value.trim();if(v){_gc.purities.push({name:v});$('gci_pur').value='';gcPaint()}">Add</button></div></div>
    <div class="card"><h3>Items, standard sizes & models</h3><div id="gcItems"></div><div class="two" style="margin-top:6px"><input id="gci_item" placeholder="New item, e.g. Mangalsutra"><button class="btn small soft" onclick="const v=$('gci_item').value.trim();if(v){_gc.items.push({name:v,sizes:[],models:[]});$('gci_item').value='';gcPaint()}">Add item</button></div></div>
    ${edit ? '<button class="btn block" onclick="gcSave()">Save Grand lists</button>' : ''}`;
  gcPaint();
}
function gcPaint() {
  const c = _gc, rm = (expr) => `onclick="${expr};gcPaint()"`;
  ['staff'].concat(G_ROLES.map((r) => r[0])).forEach((key) => { c[key] = c[key] || []; $('gcl_' + key).innerHTML = c[key].map((n, i) => `<button class="chip" ${rm(`_gc.${key}.splice(${i},1)`)}>${i === 0 && key !== 'staff' ? '★ ' : ''}${esc(n)} ✕</button>`).join('') || '<span class="hint">None yet</span>'; });
  const pr = (list, key) => list.map((r, i) => `<div class="two" style="margin-bottom:6px"><input value="${esc(r.name)}" placeholder="Name" oninput="_gc.${key}[${i}].name=this.value"><div class="wtRow" style="margin:0"><input value="${esc(r.phone)}" placeholder="WhatsApp" inputmode="tel" oninput="_gc.${key}[${i}].phone=this.value">${canPickContact() ? `<button class="btn small soft" onclick="pickContact((n,p)=>{_gc.${key}[${i}].name=_gc.${key}[${i}].name||n;_gc.${key}[${i}].phone=p;gcPaint()})">📇</button>` : ''}<button class="btn small secondary" ${rm(`_gc.${key}.splice(${i},1)`)}>✕</button></div></div>`).join('');
  $('gcCopy').innerHTML = pr(c.copyTo, 'copyTo'); $('gcVend').innerHTML = pr(c.vendors, 'vendors');
  $('gcPur').innerHTML = c.purities.map((p, i) => `<div class="kv"><span><button class="btn small ${p.std ? '' : 'soft'}" ${rm(`_gc.purities.forEach((x,j)=>x.std=j===${i})`)}>${p.std ? '★ Standard' : '☆'}</button> ${esc(p.name)}</span><button class="btn small secondary" ${rm(`_gc.purities.splice(${i},1)`)}>✕</button></div>`).join('');
  c.items.forEach((it) => { const ms = it.models || []; it.models = gSortM(ms.filter((m) => m.name)).concat(ms.filter((m) => !m.name)); });
  const vn = (c.vendors.filter((v) => v.name).length ? c.vendors.filter((v) => v.name) : vendors.filter((v) => v.active !== false)).map((v) => v.name);
  const openK = new Set([...document.querySelectorAll('#gcItems details[open]')].map((d) => d.dataset.k));
  $('gcItems').innerHTML = c.items.map((it, i) => `<details class="sec" data-k="i${i}"><summary>${esc(it.name)} <span class="hint">· ${(it.sizes || []).length} sizes · ${(it.models || []).length} models</span></summary><div class="in">
    <div class="two"><input value="${esc(it.name)}" oninput="_gc.items[${i}].name=this.value"><button class="btn small secondary" ${rm(`_gc.items.splice(${i},1)`)}>Remove item</button></div>
    <div class="field"><label>Standard sizes / lengths (comma separated)</label><input value="${esc((it.sizes || []).join(', '))}" oninput="_gc.items[${i}].sizes=this.value.split(',').map(s=>s.trim()).filter(Boolean)"></div>
    <details class="sec gcModels" data-k="m${i}"><summary>Models (${(it.models || []).length}) — A to Z</summary><div class="in">
      ${(it.models || []).map((m, j) => `<div class="gcM"><button class="gmPh" onclick="pickPhoto((r)=>{_gc.items[${i}].models[${j}].img=r;gcPaint()})">${m.img ? `<img src="${esc(imgUrl(m.img))}" alt="">` : '<i>＋ Photo</i>'}</button>
        <div style="flex:1;min-width:0"><div class="wtRow" style="margin:0"><input value="${esc(m.name)}" placeholder="Model no. / name" onchange="_gc.items[${i}].models[${j}].name=this.value.trim();gcPaint()"><button class="btn small secondary" ${rm(`_gc.items[${i}].models.splice(${j},1)`)}>✕</button></div>
        ${vn.length ? `<div class="choiceRow gcVn">${vn.map((v) => `<button class="chip ${(m.vendors || []).includes(v) ? 'active' : ''}" onclick='gcVend(${i},${j},${esc(JSON.stringify(v))})'>${esc(v)}</button>`).join('')}</div>` : ''}</div></div>`).join('') || '<p class="hint">No models yet.</p>'}
      <div class="two" style="margin-top:8px"><button class="btn small soft" onclick="(_gc.items[${i}].models=_gc.items[${i}].models||[]).push({name:'',img:'',vendors:[]});window._gcNew=${i};gcPaint()">+ Add model</button>
        ${c.items.length > 1 ? `<select onchange="gcCopy(${i},this.value)"><option value="">Copy models from…</option>${c.items.map((x, n) => n === i || !(x.models || []).length ? '' : `<option value="${n}">${esc(x.name)} (${x.models.length})</option>`).join('')}</select>` : ''}</div>
      ${vn.length ? '<p class="hint">Tap a vendor under a model to assign that design to the vendor. Assigned designs show first when that vendor is selected.</p>' : ''}</div></details></div></div></details>`).join('');
  if (window._gcNew != null) { openK.add('i' + window._gcNew); openK.add('m' + window._gcNew); window._gcNew = null; }
  document.querySelectorAll('#gcItems details').forEach((d) => { if (openK.has(d.dataset.k)) d.open = true; });
}
function gcVend(i, j, v) { const m = _gc.items[i].models[j], a = m.vendors = m.vendors || []; if (a.includes(v)) a.splice(a.indexOf(v), 1); else a.push(v); gcPaint(); }
function gcCopy(i, from) {
  if (from === '') return; const src = _gc.items[num(from)], dst = _gc.items[i], have = new Set((dst.models || []).map((m) => m.name.toLowerCase()));
  const add = (src.models || []).filter((m) => m.name && !have.has(m.name.toLowerCase())).map((m) => clone(m));
  dst.models = (dst.models || []).concat(add); window._gcNew = i; gcPaint(); toast(add.length ? `${add.length} model(s) copied from ${src.name}` : 'All those models are already here');
}
async function gcSave() {
  const c = clone(_gc);
  c.staff = c.staff.filter(Boolean); G_ROLES.forEach(([k]) => { c[k] = (c[k] || []).filter(Boolean); }); c.copyTo = c.copyTo.filter((x) => x.phone); c.vendors = c.vendors.filter((x) => x.name);
  c.items = c.items.filter((x) => x.name).map((x) => ({ name: x.name, sizes: x.sizes || [], models: gSortM((x.models || []).filter((m) => m.name)).map((m) => ({ name: m.name, img: m.img || '', vendors: (m.vendors || []).filter(Boolean) })) }));
  if (!c.purities.some((p) => p.std) && c.purities[0]) c.purities[0].std = true;
  try { await api('grand/cfg', { grand: c }); S.grand = c; toast('Grand lists saved'); } catch (e) { toast(e.message); }
}

// ======================================================================
// Grand work flow: receive from vendor → QC → laser marking → labelling → box with report → sent to Grand
// ======================================================================
const G_ROLES = [['recvStaff', 'Receiving (checks the vendor delivery)'], ['qcStaff', 'QC'], ['markStaff', 'Laser marking'], ['labelStaff', 'Labelling'], ['packStaff', 'Boxing & sending to Grand']];
const G_STAGE = { qc: 'Waiting for QC', mark: 'Waiting for laser marking', label: 'Waiting for labelling', ready: 'Labelled · box it with the report', packed: 'Boxed · send to Grand', sent: 'Sent to Grand', failed: 'QC failed · back to vendor' };
const gPend = (l) => Math.max(0, num(l.qty) - num(l.rq));
const gPendAll = (o) => (o.lines || []).reduce((t, l) => t + gPend(l), 0);
const gW3 = (v) => Math.round(num(v) * 1000) / 1000;
function gStaffSel(role, id) {
  const list = (GC()[role] || []).filter(Boolean), mine = list.includes(me.name) ? me.name : list[0] || '';
  return list.length ? `<select id="${id}">${list.map((n, i) => `<option ${n === mine ? 'selected' : ''}>${esc(n)}${i === 0 ? ' (main)' : ''}</option>`).join('')}</select>` : `<input id="${id}" value="${esc(me.name)}" placeholder="Staff name">`;
}
const gStaffVal = (id) => { const e = $(id); return e ? e.value.replace(/ \(main\)$/, '').trim() : ''; };
async function gStep(id, act, data, msg) {
  const o = gOrders.find((x) => x.id === id); if (!o) return false;
  try { const d = await api('grand/step', { id, rev: o.rev, act, data }); gOrders = gOrders.map((x) => (x.id === id ? d.o : x)); toast(msg || 'Saved'); closeSheet(); gShow(id); return true; }
  catch (e) { toast(isNet(e) ? 'No internet — not saved' : e.message); if (e.status === 409) gLoad(true); return false; }
}
function gWorkHtml(o) {
  const L = o.lines || [], pend = gPendAll(o), open = !['closed', 'cancelled'].includes(o.status);
  const rows = L.map((l, i) => { const p = gPend(l), done = !p; return `<tr class="${l.nr && p ? 'nr' : ''}"><td><b>${esc(l.item)}</b>${l.model ? ' · ' + esc(l.model) : ''}${l.size ? '<br><small>' + esc(l.size) + '</small>' : ''}</td>
      <td class="r">${l.qty}<br><small>${fmtN(gW3(l.wt * l.qty))} g</small></td><td class="r">${num(l.rq)}<br><small>${fmtN(num(l.rw))} g</small></td>
      <td class="r">${done ? '<span class="ok">✓</span>' : `<b>${p}</b>${l.nr ? '<br><small class="bad">not received</small>' : ''}`}</td></tr>`; }).join('');
  const bs = (o.batches || []).map((b) => gBatchHtml(o, b)).join('');
  return `<div class="card gWork"><h3>Receipt & work <span class="badge ${G_ST[o.status][1]}">${G_ST[o.status][0]}</span></h3>
    <table class="gTbl"><tr><th>Item</th><th class="r">Ordered</th><th class="r">Received</th><th class="r">Pending</th></tr>${rows}</table>
    ${o.closedShort ? `<div class="warnBox">Closed with items short by ${esc(o.closedShort.by)} · ${dshort(o.closedShort.at)}${o.closedShort.note ? ': ' + esc(o.closedShort.note) : ''}</div>` : ''}
    <div class="actions" style="flex-wrap:wrap">${open && pend ? `<button class="btn" onclick="gRecv('${o.id}')">Receive from vendor${(o.batches || []).length ? ' (pending ' + pend + ' pc)' : ''}</button>` : ''}
      ${(o.batches || []).length ? `<button class="btn secondary" onclick="gReport('${o.id}')">🖨 Print report</button>` : ''}
      ${open && pend && (o.batches || []).length ? `<button class="btn small secondary" onclick="gCloseShort('${o.id}')">Close with items short</button>` : ''}
      ${o.status === 'closed' && o.closedShort ? `<button class="btn small soft" onclick="gStep('${o.id}','reopen',{},'Re-opened')">Re-open</button>` : ''}</div></div>${bs}`;
}
function gBatchHtml(o, b) {
  const L = o.lines || [], steps = [['recv', 'Received'], ['qc', 'QC'], ['mark', 'Laser marking'], ['label', 'Labelling'], ['pack', 'Boxed'], ['dispatch', 'Sent to Grand']];
  const items = b.items.map((it) => { const l = L[it.i] || {}, dw = gW3(it.wt - it.exp), pc = it.exp ? Math.round((dw / it.exp) * 1000) / 10 : 0;
    return `<div class="gBi"><span><b>${esc(l.item)}${l.model ? ' · ' + esc(l.model) : ''}</b>${l.size ? ' · ' + esc(l.size) : ''} — ${it.qty} pc${it.qc === 'fail' ? ' <span class="badge r">QC failed</span>' : it.qc === 'pass' ? ' <span class="badge g">QC ✓</span>' : ''}${it.note || it.qcNote ? `<br><small class="hint" style="margin:0">${esc([it.note, it.qcNote].filter(Boolean).join(' · '))}</small>` : ''}</span>
      <span>${fmtN(it.wt)} g${dw ? `<br><small class="${Math.abs(pc) > 2 ? 'bad' : 'hint'}" style="margin:0">${dw > 0 ? '+' : ''}${fmtN(dw)} g (${dw > 0 ? '+' : ''}${pc}%) vs ${fmtN(it.exp)}</small>` : '<br><small class="hint" style="margin:0">as ordered</small>'}</span></div>`; }).join('');
  const nxt = { qc: ['QC check', `gQc('${o.id}',${b.n})`], mark: ['Laser marking done', `gDo('${o.id}',${b.n},'mark')`], label: ['Labelling done', `gDo('${o.id}',${b.n},'label')`], ready: ['Box it with the printed report', `gDo('${o.id}',${b.n},'pack')`], packed: ['Sent to Grand', `gDo('${o.id}',${b.n},'dispatch')`] }[b.stage];
  return `<div class="card gBatch"><h3>Receipt ${b.n} <span class="badge ${b.stage === 'sent' ? 'g' : b.stage === 'failed' ? 'r' : 'w'}">${esc(G_STAGE[b.stage])}</span></h3>${items}
    <div class="gSteps">${steps.map(([k, l]) => { const s = b[k]; return `<span class="${s ? 'on' : ''}"><b>${l}</b>${s ? `<small>${esc(s.by)} · ${dshort(s.at)}</small>` : '<small>—</small>'}</span>`; }).join('')}</div>
    ${nxt && !['closed', 'cancelled'].includes(o.status) ? `<button class="btn block" style="margin-top:10px" onclick="${nxt[1]}">${nxt[0]}</button>` : ''}
    ${['ready', 'packed'].includes(b.stage) ? `<button class="btn small secondary" style="margin-top:8px" onclick="gReport('${o.id}',${b.n})">🖨 Print box report for receipt ${b.n}</button>` : ''}</div>`;
}
// 1. receive the vendor delivery against the order, item by item
function gRecv(id) {
  const o = gOrders.find((x) => x.id === id); if (!o) return;
  window._gr = (o.lines || []).map((l, i) => ({ i, qty: gPend(l), wt: '', note: '', nr: false })).filter((r) => r.qty > 0);
  openSheet(`<h2>Receive · ${esc(o.no)}</h2><p class="sub">${esc(o.vendor)}. Check each item against the order. Enter what actually came, and mark items that did not come as <b>Not received</b> — they stay pending on the order.</p>
    <div id="grRows"></div>
    <div class="field"><label>Checked by</label>${gStaffSel('recvStaff', 'grBy')}</div>
    <div class="field"><label>Note</label><input id="grNote" placeholder="e.g. Vendor bill no., packet seal OK"></div>
    <div id="grSum"></div>
    <button class="btn block" onclick="gRecvSave('${id}')">Approve receipt</button>`);
  gRecvPaint(o);
}
function gRecvPaint(o) {
  const L = o.lines; let tq = 0, tw = 0, te = 0, nr = 0;
  $('grRows').innerHTML = _gr.map((r, k) => { const l = L[r.i], exp = gW3(num(l.wt) * num(r.qty)), dw = r.wt !== '' ? gW3(num(r.wt) - exp) : null, pc = exp && dw != null ? Math.round((dw / exp) * 1000) / 10 : 0;
    if (r.nr) nr++; else { tq += num(r.qty); tw += num(r.wt); te += exp; }
    return `<div class="card gRcv ${r.nr ? 'nr' : ''}"><h3>${esc(l.item)}${l.model ? ' · ' + esc(l.model) : ''}${l.size ? ' · ' + esc(l.size) : ''}${l.urgent ? ' <span class="badge r">🚨</span>' : ''}</h3>
      <p class="hint" style="margin:0 0 8px">Ordered ${l.qty} pc × ${fmtN(l.wt)} g${num(l.rq) ? ` · already received ${l.rq}` : ''} · pending <b>${gPend(l)}</b></p>
      <div class="choiceRow" style="margin-bottom:8px"><button class="chip ${r.nr ? '' : 'active'}" onclick="_gr[${k}].nr=false;gRecvPaint(gOrders.find(x=>x.id==='${o.id}'))">✓ Received</button><button class="chip ${r.nr ? 'active' : ''}" onclick="_gr[${k}].nr=true;gRecvPaint(gOrders.find(x=>x.id==='${o.id}'))">✗ Not received</button></div>
      ${r.nr ? '' : `<div class="two"><div class="field"><label>Qty received</label><input inputmode="numeric" value="${esc(r.qty)}" onchange="_gr[${k}].qty=this.value;gRecvPaint(gOrders.find(x=>x.id==='${o.id}'))"></div>
        <div class="field"><label>Weight received (g, total)</label><input inputmode="decimal" value="${esc(r.wt)}" placeholder="expected ${fmtN(exp)}" onchange="_gr[${k}].wt=this.value;gRecvPaint(gOrders.find(x=>x.id==='${o.id}'))"></div></div>
        ${num(r.qty) > gPend(l) ? `<div class="warnBox">More than ordered (pending ${gPend(l)})</div>` : ''}
        ${dw != null ? `<div class="kv"><span>Discrepancy</span><span class="${Math.abs(pc) > 2 ? 'bad' : dw ? '' : 'ok'}">${dw ? `${dw > 0 ? '+' : ''}${fmtN(dw)} g (${dw > 0 ? '+' : ''}${pc}%)` : 'None ✓'}</span></div>` : ''}`}
      <div class="field" style="margin:8px 0 0"><input value="${esc(r.note)}" placeholder="${r.nr ? 'Reason / when expected' : 'Note (optional)'}" onchange="_gr[${k}].note=this.value"></div></div>`; }).join('');
  $('grSum').innerHTML = `<div class="card"><div class="kv"><span>Receiving now</span><span>${tq} pc · ${fmtN(gW3(tw))} g</span></div><div class="kv"><span>Expected for these</span><span>${fmtN(gW3(te))} g</span></div>${tw ? `<div class="kv tot"><span>Difference</span><span>${gW3(tw - te) > 0 ? '+' : ''}${fmtN(gW3(tw - te))} g</span></div>` : ''}${nr ? `<div class="kv"><span>Not received</span><span>${nr} item(s) stay pending</span></div>` : ''}</div>`;
}
function gRecvSave(id) {
  const by = gStaffVal('grBy'); if (!by) return toast('Who checked the receipt?');
  const miss = _gr.find((r) => !r.nr && num(r.qty) > 0 && !(num(r.wt) > 0)); if (miss) return toast('Enter the weight received for each item (or mark it not received)');
  const lines = _gr.map((r) => ({ i: r.i, qty: r.nr ? 0 : num(r.qty), wt: num(r.wt), note: r.note, nr: r.nr }));
  if (!lines.some((r) => r.qty > 0 || r.nr)) return toast('Nothing to receive');
  gStep(id, 'receive', { by, note: f('grNote'), lines }, 'Receipt approved');
}
// 2. QC, item by item
function gQc(id, n) {
  const o = gOrders.find((x) => x.id === id), b = o && o.batches.find((x) => x.n === n); if (!b) return;
  window._gq = b.items.map((it) => ({ i: it.i, ok: true, note: '' }));
  openSheet(`<h2>QC · Receipt ${n}</h2><p class="sub">${esc(o.no)} · ${esc(o.vendor)}. Failed items go back to the vendor and stay pending on the order.</p>
    ${b.items.map((it, k) => { const l = o.lines[it.i]; return `<div class="card"><h3>${esc(l.item)}${l.model ? ' · ' + esc(l.model) : ''}${l.size ? ' · ' + esc(l.size) : ''} <small class="hint">${it.qty} pc · ${fmtN(it.wt)} g</small></h3>
      <div class="choiceRow"><button class="chip active" onclick="_gq[${k}].ok=true;this.classList.add('active');this.nextElementSibling.classList.remove('active')">✓ QC passed</button><button class="chip" onclick="_gq[${k}].ok=false;this.classList.add('active');this.previousElementSibling.classList.remove('active')">✗ QC failed</button></div>
      <div class="field" style="margin:8px 0 0"><input placeholder="QC note / reason if failed" onchange="_gq[${k}].note=this.value"></div></div>`; }).join('')}
    <div class="field"><label>QC done by</label>${gStaffSel('qcStaff', 'gqBy')}</div>
    <button class="btn block" onclick="gQcSave('${id}',${n})">Save QC · send passed items to laser marking</button>`);
}
function gQcSave(id, n) {
  const by = gStaffVal('gqBy'); if (!by) return toast('Who did the QC?');
  const bad = _gq.find((x) => !x.ok && !x.note.trim()); if (bad) return toast('Give the reason for each failed item');
  gStep(id, 'qc', { b: n, by, items: _gq }, 'QC saved');
}
// 3–6. marking, labelling, boxing, sent to Grand
function gDo(id, n, act) {
  const o = gOrders.find((x) => x.id === id); if (!o) return;
  const meta = { mark: ['Laser marking done', 'markStaff', 'Marked by', 'Sent to labelling'], label: ['Labelling done', 'labelStaff', 'Labelled by', 'Ready to box'], pack: ['Box with the printed report', 'packStaff', 'Boxed by', 'Boxed'], dispatch: ['Sent to Grand', 'packStaff', 'Sent by', 'Sent to Grand'] }[act];
  openSheet(`<h2>${meta[0]} · Receipt ${n}</h2><p class="sub">${esc(o.no)} · ${esc(o.vendor)}</p>
    ${act === 'pack' ? `<div class="warnBox">Print the report and keep it in the box with the items.</div><button class="btn secondary block" style="margin-bottom:10px" onclick="gReport('${id}',${n})">🖨 Print box report</button>` : ''}
    ${act === 'dispatch' && gPendAll(o) ? `<div class="warnBox">${gPendAll(o)} pc are still pending from the vendor — the order stays open after this box is sent.</div>` : ''}
    <div class="field"><label>${meta[2]}</label>${gStaffSel(meta[1], 'gdBy')}</div>
    <button class="btn block" onclick="const b=gStaffVal('gdBy');if(!b)return toast('Pick the staff name');gStep('${id}','${act}',{b:${n},by:b},'${meta[3]}')">Confirm</button>`);
}
function gCloseShort(id) {
  const o = gOrders.find((x) => x.id === id); if (!o) return;
  openSheet(`<h2>Close ${esc(o.no)} with items short</h2><p class="sub">${gPendAll(o)} pc never came from ${esc(o.vendor)}. The order is closed; the short items are listed on the report.</p>
    <div class="field"><label>Closed by</label>${gStaffSel('packStaff', 'gsBy')}</div>
    <div class="field"><label>Reason</label><input id="gsNote" placeholder="e.g. Vendor discontinued the model"></div>
    <button class="btn danger block" onclick="if(!f('gsNote'))return toast('Give the reason');gStep('${id}','closeShort',{by:gStaffVal('gsBy'),note:f('gsNote')},'Closed')">Close order</button>`);
}
// printed report (kept in the box going to Grand)
function gReport(id, n) {
  const o = gOrders.find((x) => x.id === id); if (!o) return;
  const L = o.lines || [], bs = (o.batches || []).filter((b) => n == null || b.n === n), dd = (s) => (s ? `${esc(s.by)}<br><small>${dt(s.at)} ${new Date(s.at).toTimeString().slice(0, 5)}</small>` : '—');
  const h = `<div class="pdoc gRep"><table style="border:0"><tr><td style="border:0"><img src="${LOGO.gMarkK}" style="height:54px"></td><td style="border:0"><h1 style="margin:0">Grand Jewellers · Order report</h1>${esc(o.no)} · ${o.type === 'custom' ? 'Customised' : 'Regular stock'} · ${esc(o.purity)}${n != null ? ' · Box for receipt ' + n : ''}</td>
    <td style="border:0;text-align:right">Vendor <b>${esc(o.vendor)}</b><br>Ordered ${dt(o.at)} by ${esc(o.by)}<br>Status: <b>${G_ST[o.status][0]}</b></td></tr></table>
    <h3>Items</h3><table><tr><th>#</th><th>Item / model</th><th>Length / size</th><th class="r">Ordered</th><th class="r">Exp. wt (g)</th><th class="r">Received</th><th class="r">Recd wt (g)</th><th class="r">Pending</th></tr>
    ${L.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.item)}${l.model ? ' · ' + esc(l.model) : ''}${l.urgent ? ' 🚨' : ''}</td><td>${esc(l.size || '')}</td><td class="r">${l.qty}</td><td class="r">${fmtN(gW3(l.wt * l.qty))}</td><td class="r">${num(l.rq)}</td><td class="r">${fmtN(num(l.rw))}</td><td class="r">${gPend(l) ? '<b>' + gPend(l) + '</b>' + (l.nr ? ' (not recd)' : '') : '✓'}</td></tr>`).join('')}
    <tr><th colspan="3">Total</th><th class="r">${o.qty}</th><th class="r">${fmtN(o.wt)}</th><th class="r">${L.reduce((t, l) => t + num(l.rq), 0)}</th><th class="r">${fmtN(gW3(L.reduce((t, l) => t + num(l.rw), 0)))}</th><th class="r">${gPendAll(o)}</th></tr></table>
    ${bs.map((b) => `<h3>Receipt ${b.n} · ${dt(b.at)}${b.note ? ' · ' + esc(b.note) : ''}</h3><table><tr><th>Item</th><th class="r">Qty</th><th class="r">Expected (g)</th><th class="r">Received (g)</th><th class="r">Difference</th><th>QC</th><th>Note</th></tr>
      ${b.items.map((it) => { const l = L[it.i] || {}, dw = gW3(it.wt - it.exp); return `<tr><td>${esc(l.item)}${l.model ? ' · ' + esc(l.model) : ''}${l.size ? ' · ' + esc(l.size) : ''}</td><td class="r">${it.qty}</td><td class="r">${fmtN(it.exp)}</td><td class="r">${fmtN(it.wt)}</td><td class="r">${dw ? (dw > 0 ? '+' : '') + fmtN(dw) : '—'}</td><td>${it.qc === 'fail' ? 'FAILED' : it.qc === 'pass' ? 'Passed' : '—'}</td><td>${esc([it.note, it.qcNote].filter(Boolean).join(' · '))}</td></tr>`; }).join('')}</table>
      <table><tr><th>Received / checked</th><th>QC</th><th>Laser marking</th><th>Labelling</th><th>Boxed</th><th>Sent to Grand</th></tr><tr><td>${dd(b.recv)}</td><td>${dd(b.qc)}</td><td>${dd(b.mark)}</td><td>${dd(b.label)}</td><td>${dd(b.pack)}</td><td>${dd(b.dispatch)}</td></tr>
      <tr><td style="height:40px">Sign</td><td></td><td></td><td></td><td></td><td></td></tr></table>`).join('')}
    ${o.closedShort ? `<p><b>Closed with items short</b> by ${esc(o.closedShort.by)} on ${dt(o.closedShort.at)}: ${esc(o.closedShort.note || '')}</p>` : ''}
    <p style="font-size:11px;color:#555">Printed ${dt(Date.now())} by ${esc(me.name)} · Order Desk ${APP_VERSION}</p></div>`;
  if (NATIVE && NATIVE.printHtml) { NATIVE.printHtml('<!doctype html><html><head><meta charset="utf-8"><style>' + document.querySelector('style').textContent + ' #printArea{display:block}</style></head><body><div id="printArea">' + h + '</div></body></html>', 'Grand ' + o.no); return; }
  $('printArea').innerHTML = h; window.print(); setTimeout(() => { $('printArea').innerHTML = ''; }, 800);
}
