// ======================================================================
// Enquiry wizard: 1 Customer · 2 Items · 3 Price · 4 Review
// Also used to revise an existing enquiry / estimate.
// ======================================================================
const wiz = { id: null, step: 0, o: null };
const SOURCES = ['Walk-in', 'WhatsApp', 'Instagram', 'Phone', 'Website', 'Referral', 'Other'];
const EDITABLE = ['enquiry', 'estimate', 'approved', 'hold'];

function newEnquiry(prefill) {
  if (!can('enquiry')) return toast('Your role cannot create enquiries');
  const d = load('yod_draft', null);
  if (d && !d.id && !prefill && confirm('Continue the unsaved enquiry for ' + ((d.cust || {}).name || 'a customer') + '?')) { wiz.o = d; }
  else wiz.o = { cust: { name: '', phone: '', src: 'Walk-in', notes: '' }, items: [prefill || newItem()], disc: 0, owner: me.name };
  wiz.id = null; wiz.step = 0; go('vNew');
}
function editOrder(id, force) {
  const o = orders.find((x) => x.id === id);
  const reviewer = force && (o.reviews || []).some((r) => !r.ans && canAnswer(r));
  if (!o || (!EDITABLE.includes(o.status) && !(force && me.role === 'admin'))) return toast('Items are locked after the order is confirmed');
  if (!can('enquiry') && !reviewer && me.role !== 'admin') return toast('Your role cannot edit enquiries');
  wiz.id = id; wiz.admin = !EDITABLE.includes(o.status); wiz.o = clone(o); if (!wiz.o.items.length) wiz.o.items = [newItem()];
  wiz.step = 1; go('vNew');
}
function keepDraft() { if (!wiz.id) store('yod_draft', wiz.o); }
function wizGo(n) {
  if (n > wiz.step) { const e = wizCheck(wiz.step); if (e) return toast(e); }
  wiz.step = n; keepDraft(); renderWizard(); window.scrollTo(0, 0);
}
function wizCheck(stp) {
  const o = wiz.o;
  if (stp === 0) {
    if (!o.cust.name.trim()) return 'Enter the customer name';
    if (!/^[6-9]\d{9}$/.test(normPhone(o.cust.phone))) return 'Enter a valid 10-digit WhatsApp number';
  }
  if (stp === 1) {
    for (let i = 0; i < o.items.length; i++) {
      const it = o.items[i];
      if (!it.product.trim()) return `Item ${i + 1}: enter the product`;
      if (!(num(it.wt) > 0)) return `Item ${i + 1}: enter the approximate weight`;
    }
  }
  return '';
}
function normPhone(p) { let d = String(p || '').replace(/\D/g, ''); if (d.length === 12 && d.startsWith('91')) d = d.slice(2); if (d.length === 11 && d[0] === '0') d = d.slice(1); return d; }
const waDigits = (p) => { const d = normPhone(p); return d.length === 10 ? '91' + d : d; };

function renderWizard() {
  const o = wiz.o; if (!o) return go('vHome');
  const names = ['Customer', 'Items', 'Price', 'Review'];
  $('vNew').innerHTML = `
    <p class="kicker">${wiz.id ? 'Revise ' + esc(refOf(orders.find((x) => x.id === wiz.id) || {})) : 'New enquiry'}</p>
    <div class="track">${names.map((n, i) => `<div class="${i <= wiz.step ? 'done' : ''}"></div>`).join('')}</div>
    <div class="stepnames">${names.map((n, i) => `<span class="${i === wiz.step ? 'on' : ''}" onclick="${i < wiz.step || wiz.id ? `wizGo(${i})` : ''}" style="cursor:pointer">${i + 1}. ${n}</span>`).join('')}</div>
    <div id="wizBody"></div>
    <div class="actions">
      ${wiz.step > 0 ? `<button class="btn secondary" onclick="wizGo(${wiz.step - 1})">‹ Back</button>` : `<button class="btn secondary" onclick="cancelWizard()">Cancel</button>`}
      ${wiz.step < 3 ? `<button class="btn" onclick="wizGo(${wiz.step + 1})">Next: ${names[wiz.step + 1]} ›</button>` : ''}
    </div>`;
  [wizCustomer, wizItems, wizPrice, wizReview][wiz.step]();
}
function cancelWizard() { if (!wiz.id && !confirm('Discard this enquiry?')) return; if (!wiz.id) store('yod_draft', null); go(wiz.id ? 'vDetail' : 'vHome'); }

// ---------------- 1. customer ----------------
function knownCustomers() {
  const m = new Map();
  orders.forEach((o) => { const c = o.cust || {}; const k = normPhone(c.phone); if (k && !m.has(k)) m.set(k, { name: c.name, phone: c.phone, n: 0 }); if (k) m.get(k).n++; });
  return [...m.values()];
}
function wizCustomer() {
  const c = wiz.o.cust;
  $('wizBody').innerHTML = `
    <div class="card"><h3>Customer</h3>
      <div class="field"><label>Full name <i class="req">*</i></label><input id="cName" value="${esc(c.name)}" oninput="wiz.o.cust.name=this.value;custSuggest()" autocomplete="off"></div>
      <div class="field"><label>WhatsApp number <i class="req">*</i></label><input id="cPhone" inputmode="tel" value="${esc(c.phone)}" oninput="wiz.o.cust.phone=this.value;custSuggest()" placeholder="10-digit mobile"></div>
      <div id="custSug"></div>
    </div>
    <div class="card"><h3>Enquiry</h3>
      <div class="field"><label>Source</label><div class="choiceRow">${SOURCES.map((s) => `<button class="chip ${c.src === s ? 'active' : ''}" onclick="wiz.o.cust.src='${s}';wizCustomer()">${s}</button>`).join('')}</div></div>
      <div class="field"><label>Assigned sales staff</label><select onchange="wiz.o.owner=this.value">${users.filter((u) => u.active).map((u) => `<option ${u.name === (wiz.o.owner || me.name) ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Notes</label><textarea oninput="wiz.o.cust.notes=this.value">${esc(c.notes || '')}</textarea></div>
      <p class="hint">Date: ${dt(Date.now())}</p>
    </div>`;
  custSuggest();
}
function custSuggest() {
  const c = wiz.o.cust, q = c.name.trim().toLowerCase(), p = normPhone(c.phone), el = $('custSug'); if (!el) return;
  const all = knownCustomers();
  const same = p.length === 10 ? all.find((x) => normPhone(x.phone) === p) : null;
  const m = same ? [] : all.filter((x) => (q.length >= 2 && (x.name || '').toLowerCase().includes(q)) || (p.length >= 4 && normPhone(x.phone).includes(p))).slice(0, 5);
  el.innerHTML = (same ? `<div class="okBox">Existing customer: <b>${esc(same.name)}</b> · ${same.n} earlier enquiry/order${same.n > 1 ? 's' : ''}.${same.name !== c.name ? ` <a href="#" onclick="wiz.o.cust.name=${esc(JSON.stringify(same.name))};wizCustomer();return false">Use this name</a>` : ''}</div>` : '') +
    (m.length ? `<p class="hint">Earlier customers:</p><div class="choiceRow">${m.map((x) => `<button class="chip" onclick='wiz.o.cust.name=${esc(JSON.stringify(x.name))};wiz.o.cust.phone=${esc(JSON.stringify(x.phone))};wizCustomer()'>${esc(x.name)} · ${esc(x.phone)}</button>`).join('')}</div>` : '') +
    (p && p.length === 10 && !/^[6-9]/.test(p) ? '<div class="badBox">This does not look like an Indian mobile number.</div>' : '');
}

// ---------------- 2. items ----------------
const PK = {};                    // click handlers for picture cards, by id
const pk = (id, fn) => { PK[id] = fn; return `PK[${esc(JSON.stringify(id))}]`; };
function setIt(i, k, v) { wiz.o.items[i][k] = v; keepDraft(); }
function setSpec(i, k, v) { const it = wiz.o.items[i]; it.spec = it.spec || {}; it.spec[k] = v; keepDraft(); }
function setSt(i, j, k, v) { const s = wiz.o.items[i].stones[j]; s[k] = v; keepDraft(); const el = $(`stc${i}_${j}`); if (el) el.textContent = rupee(stoneCharge(s)); }
function addItem() { wiz.o.items.push(newItem()); wizItems(); }
function dupItem(i) { const c = clone(wiz.o.items[i]); c.id = uid(); c.rev = 1; wiz.o.items.splice(i + 1, 0, c); wizItems(); }
function delItem(i) { if (wiz.o.items.length === 1) return toast('An enquiry needs at least one item'); if (!confirm('Remove item ' + (i + 1) + '?')) return; wiz.o.items.splice(i, 1); wizItems(); }
function addStone(i, type) { wiz.o.items[i].stones.push({ type: type || 'diamond', gem: type === 'precious' ? '' : '', shape: 'Round', size: '', ct: '', pcs: 1, wtg: '', quality: '', colour: '', setting: '', unit: stoneUnitDefault(type || 'diamond'), rate: '', charge: '' }); wizItems(); }
function delStone(i, j) { wiz.o.items[i].stones.splice(j, 1); wizItems(); }
function addItemPhoto(i, cam) { pickPhoto((ref) => { wiz.o.items[i].photos.push(ref); keepDraft(); if (cur.view === 'vNew' && wiz.step === 1) wizItems(); }, cam); }
function delItemPhoto(i, k) { wiz.o.items[i].photos.splice(k, 1); wizItems(); }
const opt = (list, val) => list.map((x) => Array.isArray(x) ? `<option value="${x[0]}" ${x[0] === val ? 'selected' : ''}>${esc(x[1])}</option>` : `<option ${x === val ? 'selected' : ''}>${esc(x)}</option>`).join('');
const COLOUR_SW = { Yellow: '#e2b44c', Rose: '#e7a58f', White: '#e6e6e6', 'Two-tone': 'linear-gradient(90deg,#e2b44c 50%,#e6e6e6 50%)' };
const sizeLabel = (c) => ({ Ring: 'Ring size', Bangle: 'Bangle size', Bracelet: 'Length (in)', Chain: 'Length (in)', Necklace: 'Length (in)', Anklet: 'Length (in)', Mangalsutra: 'Length (in)' })[c] || 'Size / length';

function stoneEditor(i, j, s) {
  const t = s.type, unit = s.unit || stoneUnitDefault(t);
  const qtyField = unit === 'ct' ? ['ct', 'Total carat (ct)'] : unit === 'pc' ? ['pcs', 'Pieces'] : ['wtg', 'Weight (g)'];
  return `<div class="stone">
    <div class="itemHead" style="margin-bottom:6px"><b>${esc(stoneLabel(t))}${s.gem ? ' · ' + esc(s.gem) : ''}</b><button class="btn small danger" onclick="delStone(${i},${j})">Remove</button></div>
    <div class="choiceRow" style="margin-bottom:10px">${STONE_TYPES.map(([k, l, u]) => `<button class="chip ${t === k ? 'active' : ''}" onclick="setSt(${i},${j},'type','${k}');setSt(${i},${j},'unit','${u}');wizItems()">${l}</button>`).join('')}</div>
    <div class="two">${t === 'precious' || t === 'synthetic' ? picField('Stone', 'gems', s.gem, pk('g' + i + '_' + j, (n) => { setSt(i, j, 'gem', n); if (n && !s.colour) setSt(i, j, 'colour', n); wizItems(); })) : ''}
      ${picField('Shape', 'shapes', s.shape, pk('sh' + i + '_' + j, (n) => { setSt(i, j, 'shape', n); wizItems(); }))}</div>
    <div class="three"><div class="field"><label>Size (mm)</label><input value="${esc(s.size)}" oninput="setSt(${i},${j},'size',this.value)"></div>
      <div class="field"><label>Total ct</label><input inputmode="decimal" value="${esc(s.ct)}" oninput="setSt(${i},${j},'ct',this.value)"></div>
      <div class="field"><label>Pieces</label><input inputmode="numeric" value="${esc(s.pcs)}" oninput="setSt(${i},${j},'pcs',this.value)"></div></div>
    <div class="two"><div class="field"><label>${t === 'diamond' || t === 'labgrown' ? 'Quality (clarity)' : 'Quality / grade'}</label><input value="${esc(s.quality)}" oninput="setSt(${i},${j},'quality',this.value)" placeholder="${t === 'diamond' || t === 'labgrown' ? 'VVS, VS1, SI…' : 'AAA, AA…'}"></div>
      <div class="field"><label>${t === 'diamond' || t === 'labgrown' ? 'Colour grade' : 'Stone colour'}</label><input value="${esc(s.colour)}" oninput="setSt(${i},${j},'colour',this.value)" placeholder="${t === 'diamond' || t === 'labgrown' ? 'D–F, G–H, I–J' : 'Red, blue…'}"></div></div>
    <div class="two"><div class="field"><label>Priced</label><select onchange="setSt(${i},${j},'unit',this.value);wizItems()">${opt(t === 'synthetic' ? [['pc', 'Per piece'], ['g', 'Per gram']] : [['ct', 'Per carat'], ['pc', 'Per piece']], unit)}</select></div>
      ${unit === 'g' ? `<div class="field"><label>Weight (g)</label><input inputmode="decimal" value="${esc(s.wtg)}" oninput="setSt(${i},${j},'wtg',this.value)"></div>` : ''}
      <div class="field"><label>Rate ₹ ${UNIT_LABEL[unit]}</label><input inputmode="decimal" value="${esc(s.rate)}" oninput="setSt(${i},${j},'rate',this.value)"></div></div>
    <p class="hint">Stone charge per piece of jewellery: <b id="stc${i}_${j}">${rupee(stoneCharge(s))}</b> (${esc(qtyField[1])} × rate)</p>
  </div>`;
}

function itemEditor(it, i) {
  const spec = SPEC[it.cat] || [];
  const sp = it.spec || {};
  return `<div class="item">
    <div class="itemHead"><b>Item ${i + 1}${it.rev > 1 ? ` <span class="badge">rev ${it.rev}</span>` : ''}</b>
      <span><button class="btn small soft" onclick="dupItem(${i})">Duplicate</button> <button class="btn small danger" onclick="delItem(${i})">Remove</button></span></div>
    <div class="two">${picField('1. Category', 'cat', it.cat, pk('cat' + i, (n) => { setIt(i, 'cat', n); wizItems(); }))}
      ${picField('2. Item type', 'prod', listItems('prod', it.cat).some((e) => e.name === it.product) ? it.product : '', pk('prod' + i, (n) => { setIt(i, 'product', n); wizItems(); }), it.cat)}</div>
    <div class="field" style="margin-top:-4px"><label>Product name on estimate <i class="req">*</i></label><input value="${esc(it.product)}" oninput="setIt(${i},'product',this.value)" placeholder="Pick an item type above, or type a name"></div>
    <div class="two">
      <div class="field"><label>3. Purity</label><select onchange="setIt(${i},'purity',this.value)">${opt(PURITIES.map((p) => [p[0], p[1]]), it.purity)}</select></div>
      <div class="field"><label>Quantity</label><input inputmode="numeric" value="${esc(it.qty)}" oninput="setIt(${i},'qty',Math.max(1,parseInt(this.value)||1))"></div>
    </div>
    <div class="field"><label>4. Colour</label><div class="choiceRow">${COLOURS.map((c) => `<button class="chip ${it.colour === c ? 'active' : ''}" onclick="setIt(${i},'colour','${c}');wizItems()"><i style="display:inline-block;width:11px;height:11px;border-radius:6px;margin-right:6px;vertical-align:-1px;background:${COLOUR_SW[c]}"></i>${c}</button>`).join('')}</div></div>
    <div class="wtRow"><div class="field"><label>5. Approx. gross weight (g)</label><input inputmode="decimal" value="${esc(it.gwt)}" oninput="setIt(${i},'gwt',this.value)"></div><button class="btn small soft" onclick="showKaratWeights(${i},'gwt')">Karat-wise</button></div>
    <div class="wtRow"><div class="field"><label>6. Approx. net weight (g) <i class="req">*</i></label><input inputmode="decimal" value="${esc(it.wt)}" oninput="setIt(${i},'wt',this.value)"></div><button class="btn small soft" onclick="showKaratWeights(${i},'wt')">Karat-wise</button></div>
    <div class="field"><label>7. ${sizeLabel(it.cat)}</label><input value="${esc(it.size)}" oninput="setIt(${i},'size',this.value)" placeholder="${it.cat === 'Ring' ? 'e.g. IN 12' : it.cat === 'Bangle' ? 'e.g. 2-6' : 'e.g. 18'}"></div>
    <details class="sec" ${Object.keys(sp).length ? 'open' : ''}><summary>8. ${esc(it.cat || 'Item')} details${specText(it) ? ' · ' + esc(specText(it)) : ''}</summary><div class="in">
      ${spec.length ? spec.map(([k, l, type, data]) => type === 'num' ? `<div class="field"><label>${l}</label><input inputmode="decimal" value="${esc(sp[k] || '')}" oninput="setSpec(${i},'${k}',this.value)"></div>`
        : type === 'chips' ? `<div class="field"><label>${l}</label><div class="choiceRow">${data.map((x) => `<button class="chip ${sp[k] === x ? 'active' : ''}" onclick='setSpec(${i},"${k}",${esc(JSON.stringify(x))});wizItems()'>${esc(x)}</button>`).join('')}</div></div>`
        : picField(l, data, sp[k], pk('sp' + i + k, (n) => { setSpec(i, k, n); wizItems(); }), null, { clear: true })).join('') : '<p class="hint">Choose a category with specific options (Ring, Earrings…), or write details below.</p>'}
      <div class="field"><label>Width / thickness / other</label><input value="${esc(it.dims)}" oninput="setIt(${i},'dims',this.value)"></div>
    </div></details>
    <details class="sec" ${it.stones.length ? 'open' : ''}><summary>9. Stones${it.stones.length ? ' · ' + it.stones.map((s) => esc(s.gem || stoneLabel(s.type))).join(', ') : ''}</summary><div class="in">
      ${it.stones.map((s, j) => stoneEditor(i, j, s)).join('')}
      <div class="choiceRow">${STONE_TYPES.map(([k, l]) => `<button class="btn small soft" onclick="addStone(${i},'${k}')">+ ${l}</button>`).join('')}</div>
    </div></details>
    <div class="field"><label>10. Design</label><div class="choiceRow">
      <button class="chip ${it.design === 'ours' ? 'active' : ''}" onclick="setIt(${i},'design','ours');wizItems()">Our design</button>
      <button class="chip ${it.design === 'custom' ? 'active' : ''}" onclick="setIt(${i},'design','custom');wizItems()">Customised</button></div></div>
    <div class="wtRow"><div class="field"><label>11. ${it.design === 'ours' ? 'Design number / label (Price Check)' : 'Reference design no.'}</label><input id="dn${i}" value="${esc(it.designNo)}" oninput="setIt(${i},'designNo',this.value)" placeholder="e.g. YR1042 or tag label"></div>
      <button class="btn small soft" onclick="pcBrowse(${i})">Search designs</button></div>
    <div class="two"><div class="field"><label>Model number</label><input value="${esc(it.model)}" oninput="setIt(${i},'model',this.value)"></div>
      <div class="field"><label>Preferred vendor</label><select onchange="setIt(${i},'vendor',this.value)"><option value="">Decide later</option>${opt(vendors.filter((v) => v.active !== false).map((v) => v.name), it.vendor)}</select></div></div>
    <div class="field"><label>Design details</label><textarea oninput="setIt(${i},'details',this.value)" placeholder="Style, finish, anything special…">${esc(it.details)}</textarea></div>
    ${it.design === 'custom' ? `<div class="field"><label>Customisation as per customer</label><textarea oninput="setIt(${i},'custom',this.value)">${esc(it.custom)}</textarea></div>` : ''}
    <div class="field"><label>12–13. Images${it.pcImgs ? ' · ' + it.pcImgs + ' in Price Check' : ''}</label><div class="thumbs">${(it.photos || []).map((p, k) => `<div class="th"><img src="${esc(imgUrl(p))}" alt=""><button onclick="delItemPhoto(${i},${k})">✕</button></div>`).join('')}
      ${it.designNo ? `<button class="addPh" onclick="pcPhotos(${i})">🗂<span>From Price Check</span></button>` : ''}
      <button class="addPh" onclick="addItemPhoto(${i},true)">📷<span>Camera</span></button><button class="addPh" onclick="addItemPhoto(${i},false)">🖼<span>Gallery</span></button></div></div>
    <div class="field"><label>Production notes (internal, for the vendor)</label><input value="${esc(it.prodNotes)}" oninput="setIt(${i},'prodNotes',this.value)"></div>
  </div>`;
}
function wizItems() {
  const y = window.scrollY;
  $('wizBody').innerHTML = wiz.o.items.map(itemEditor).join('') + `<button class="btn soft block" onclick="addItem()">+ Add another item</button>`;
  window.scrollTo(0, y);
}

// ---------------- Price Check link ----------------
const PC_PUR = (c) => { const s = String(c || '').toUpperCase(); if (/PT|PLAT|950/.test(s)) return 'pt'; if (/925|SIL/.test(s)) return 'ag'; if (/22|916/.test(s)) return '22k'; if (/18|750/.test(s)) return '18k'; if (/14|585/.test(s)) return '14k'; if (/\b9|375/.test(s)) return '9k'; return ''; };
async function pcFind(i) {
  const q = (wiz.o.items[i].designNo || '').trim();
  if (q.length < 2) return toast('Type the design number or tag label first');
  toast('Searching Price Check…');
  let d;
  try { d = await api('pc/find?q=' + encodeURIComponent(q)); } catch (e) { return toast(isNet(e) ? 'No internet' : e.message); }
  if (!d.rows.length) return toast('Not found in Price Check stock');
  window._pcRows = d.rows;
  openSheet(`<h2>Price Check · ${esc(q)}</h2><p class="sub">${d.rows.length} match${d.rows.length > 1 ? 'es' : ''}. Stock as of ${dtt(d.at)}.</p>
    ${d.rows.map((r, k) => `<div class="pcRes">${r.thumb ? `<img src="${esc(r.thumb)}" alt="">` : '<img alt="">'}<div style="flex:1;min-width:0"><b>${esc(r.label)}</b> · ${esc(r.name || r.item || '')}<br>
      <small class="hint" style="margin:0">${esc([r.category, r.carat, r.gw ? 'GW ' + r.gw : '', r.nw ? 'NW ' + r.nw : '', r.dw ? 'Dia ' + r.dw + ' ct' : '', r.imgs ? r.imgs + ' photo(s)' : ''].filter(Boolean).join(' · '))}</small></div>
      <button class="btn small" onclick="pcUse(${i},${k})">Use</button></div>`).join('')}`);
}
// Search list of designs available in Price Check (photos, category filter, paging).
const PCB = { i: 0, q: '', cat: '', off: 0, rows: [], total: 0, cats: [], t: 0, thumbs: {}, f: { pur: '', wmin: '', wmax: '', st: '', ph: '', sort: '' } };
function pcBrowse(i) {
  const it = wiz.o.items[i];
  Object.assign(PCB, { i, q: (it.designNo || '').trim(), cat: '', off: 0, rows: [], total: 0 });
  openSheet(`<h2>Designs in Price Check</h2><p class="sub" id="pcbSub">Search by design number, tag, model or name. Tap a design to use it.</p>
    <input class="search" id="pcbQ" value="${esc(PCB.q)}" placeholder="e.g. YR1042, solitaire, bangle" oninput="clearTimeout(PCB.t);PCB.t=setTimeout(()=>{PCB.q=this.value.trim();PCB.off=0;pcbLoad()},350)">
    <details class="sec" id="pcbF"><summary>Filters <span id="pcbFn"></span></summary><div class="in">
      <div class="field"><label>Purity</label><div class="choiceRow">${[['', 'Any']].concat(PURITIES.map((p) => [p[0], purShort(p[0])])).map(([k, l]) => `<button class="chip ${PCB.f.pur === k ? 'active' : ''}" onclick="pcbSet('pur','${k}',this)">${esc(l)}</button>`).join('')}</div></div>
      <div class="field"><label>Stones</label><div class="choiceRow">${[['', 'Any'], ['diamond', 'Diamond'], ['colour', 'Colour stone'], ['plain', 'Plain gold']].map(([k, l]) => `<button class="chip ${PCB.f.st === k ? 'active' : ''}" onclick="pcbSet('st','${k}',this)">${l}</button>`).join('')}</div></div>
      <div class="field"><label>Weight (g) from – to</label><div class="two" style="gap:6px"><input id="pcbW1" inputmode="decimal" placeholder="0" value="${esc(PCB.f.wmin)}" oninput="clearTimeout(PCB.t);PCB.t=setTimeout(()=>{PCB.f.wmin=$('pcbW1').value;PCB.f.wmax=$('pcbW2').value;PCB.off=0;pcbLoad()},450)"><input id="pcbW2" inputmode="decimal" placeholder="no limit" value="${esc(PCB.f.wmax)}" oninput="clearTimeout(PCB.t);PCB.t=setTimeout(()=>{PCB.f.wmin=$('pcbW1').value;PCB.f.wmax=$('pcbW2').value;PCB.off=0;pcbLoad()},450)"></div></div>
      <div class="two"><div class="field"><label>Sort</label><select onchange="PCB.f.sort=this.value;PCB.off=0;pcbLoad()">${opt([['', 'With photo first'], ['wlo', 'Weight: low to high'], ['whi', 'Weight: high to low'], ['label', 'Design number']], PCB.f.sort)}</select></div>
        <label class="check" style="align-self:end"><input type="checkbox" ${PCB.f.ph ? 'checked' : ''} onchange="PCB.f.ph=this.checked?'1':'';PCB.off=0;pcbLoad()"><span>Only with photos</span></label></div>
      <button class="btn small secondary" onclick="PCB.f={pur:'',wmin:'',wmax:'',st:'',ph:'',sort:''};PCB.cat='';closeSheet();pcBrowse(PCB.i)">Clear filters</button></div></details>
    <div class="choiceRow" id="pcbCats" style="margin:8px 0"></div><div id="pcbList"><p class="hint">Loading…</p></div>`);
  pcbLoad();
}
async function pcbLoad(more) {
  let d;
  const fq = Object.entries(PCB.f).filter(([, v]) => v).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
  const nf = Object.values(PCB.f).filter((v) => v && v !== '').length - (PCB.f.sort ? 1 : 0);
  if ($('pcbFn')) $('pcbFn').textContent = nf ? `· ${nf} on` : '';
  try { d = await api(`pc/list?q=${encodeURIComponent(PCB.q)}&cat=${encodeURIComponent(PCB.cat)}&off=${PCB.off}${fq}`); }
  catch (e) { if ($('pcbList')) $('pcbList').innerHTML = `<div class="badBox">${esc(isNet(e) ? 'No internet' : e.message)}</div>`; return; }
  if (!$('pcbList')) return;
  PCB.rows = more ? PCB.rows.concat(d.rows) : d.rows; PCB.total = d.total; PCB.cats = d.cats;
  $('pcbSub').textContent = `${d.total} design${d.total === 1 ? '' : 's'} available · stock as of ${dtt(d.at)}`;
  $('pcbCats').innerHTML = [['', 'All']].concat(d.cats.slice(0, 14).map((c) => [c.name, `${c.name} (${c.n})`])).map(([k, l]) => `<button class="chip ${PCB.cat === k ? 'active' : ''}" onclick='PCB.cat=${esc(JSON.stringify(k))};PCB.off=0;pcbLoad()'>${esc(l)}</button>`).join('');
  $('pcbList').innerHTML = PCB.rows.length ? `<div class="pcGrid">${PCB.rows.map((r, k) => `<button class="pcCard" onclick="pcbUse(${k})"><span class="pcImg" id="pcb_${esc(r.k)}">${PCB.thumbs[r.k] ? `<img src="${esc(PCB.thumbs[r.k])}" alt="">` : r.imgs ? '<i>…</i>' : '<i>No photo</i>'}</span>
      <b>${esc(r.label)}</b><small>${esc([r.name || r.item, r.model ? 'Model ' + r.model : '', r.carat, r.nw ? 'NW ' + r.nw + ' g' : r.gw ? 'GW ' + r.gw + ' g' : '', r.dw ? 'Dia ' + r.dw + ' ct' : '', r.stock > 1 ? r.stock + ' in stock' : ''].filter(Boolean).join(' · '))}</small></button>`).join('')}</div>
    ${PCB.rows.length < PCB.total ? '<button class="btn secondary block" style="margin-top:10px" onclick="PCB.off=PCB.rows.length;pcbLoad(true)">Show more</button>' : ''}` : '<p class="hint">No designs match.</p>';
  pcbThumbs();
}
async function pcbThumbs() {
  const todo = PCB.rows.filter((r) => r.imgs && !PCB.thumbs[r.k]);
  for (let n = 0; n < todo.length; n += 4) {
    await Promise.all(todo.slice(n, n + 4).map(async (r) => {
      try { const d = await api('pc/thumb?k=' + encodeURIComponent(r.k)); PCB.thumbs[r.k] = d.img || ''; const el = $('pcb_' + r.k); if (el) el.innerHTML = d.img ? `<img src="${esc(d.img)}" alt="">` : '<i>No photo</i>'; } catch (e) { /* skip */ }
    }));
    if (!$('pcbList')) return;
  }
}
function pcbSet(k, v, el) { PCB.f[k] = v; PCB.off = 0; el.parentNode.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === el)); pcbLoad(); }
function pcbUse(k) { window._pcRows = PCB.rows; pcUse(PCB.i, k); }
function pcUse(i, k) {
  const r = window._pcRows[k], it = wiz.o.items[i];
  it.designNo = r.label; it.design = 'ours';
  if (r.model) it.model = r.model;
  if (r.name || r.item) it.product = r.name || r.item;
  const p = PC_PUR(r.carat); if (p) it.purity = p;
  if (num(r.gw)) it.gwt = r.gw; if (num(r.nw)) it.wt = r.nw;
  const cat = CATS2.find((c) => (r.category || '').toLowerCase().includes(c.toLowerCase().replace(/s$/, '')) || (r.item || '').toLowerCase().includes(c.toLowerCase().replace(/s$/, '')));
  if (cat) it.cat = cat;
  if (num(r.dw) && !it.stones.some((s) => s.type === 'diamond')) it.stones.push({ type: 'diamond', shape: 'Round', size: '', ct: r.dw, pcs: r.dq || 1, quality: '', colour: '', setting: '', unit: 'ct', rate: '', charge: num(r.sa) || '' });
  if (r.attrs) { if (r.attrs.size && !it.size) it.size = r.attrs.size; if (r.attrs.mc) { const c = COLOURS.find((x) => String(r.attrs.mc).toLowerCase().includes(x.toLowerCase().split('-')[0])); if (c) it.colour = c; } if (r.attrs.jt && !it.details) it.details = r.attrs.jt; }
  it.pcImgs = r.imgs || 0;
  keepDraft(); closeSheet(); wizItems();
  if (r.imgs) pcPhotos(i);
}
async function pcPhotos(i) {
  const it = wiz.o.items[i];
  if (!it.designNo) return toast('Enter the design number first');
  toast('Copying photos from Price Check…');
  try {
    const d = await api('pc/photos', { k: it.designNo });
    if (!d.keys.length) return toast('No photos for ' + it.designNo + ' in Price Check');
    d.keys.forEach((k) => { if (!it.photos.includes('img:' + k)) it.photos.push('img:' + k); });
    keepDraft(); wizItems(); toast(d.keys.length + ' photo(s) added');
  } catch (e) { toast(isNet(e) ? 'No internet' : e.message); }
}

// ---------------- 3. price ----------------
function wizPrice() {
  const o = wiz.o, r = S.rates || {};
  o.items.forEach(autoMaking);
  const missing = [...new Set(o.items.map((it) => it.purity))].filter((p) => !(rateOf(p) > 0));
  $('wizBody').innerHTML = `
    <div class="card"><h3>Today's rates <span class="badge">${r.at ? ago(r.at) : 'not set'}</span></h3>
      <p class="sub" style="margin:0">${PURITIES.map((p) => `${purShort(p[0])} ${rupee(rateOf(p[0]))}`).join(' · ')}</p>
      ${missing.length ? `<div class="badBox">No rate set for ${missing.map(purShort).join(', ')}. ${can('rates') ? '<a href="#" onclick="openSub(\'rates\');return false">Set rates</a>' : 'Ask a manager to set the rates.'}</div>` : ''}</div>
    ${o.items.map((it, i) => `<div class="card"><h3>Item ${i + 1} · ${esc(it.product || 'Item')} <span class="badge">${purShort(it.purity)} · ${g3(it.wt)}</span></h3>
      <div class="two">
        <div class="field"><label>Making charge</label><select onchange="setIt(${i},'mkMode',this.value);setIt(${i},'mkManual',true);wizPrice()">${opt(MK_MODES, it.mkMode)}</select></div>
        ${it.mkMode === 'pct' || it.mkMode === 'combo' ? `<div class="field"><label>VA / wastage %</label><input inputmode="decimal" value="${esc(it.mk)}" oninput="setIt(${i},'mk',this.value);setIt(${i},'mkManual',true);priceLive()"></div>` : ''}
        ${it.mkMode === 'flat' ? `<div class="field"><label>₹ per piece</label><input inputmode="decimal" value="${esc(it.mk)}" oninput="setIt(${i},'mk',this.value);setIt(${i},'mkManual',true);priceLive()"></div>` : ''}
        ${it.mkMode === 'pg' || it.mkMode === 'combo' ? `<div class="field"><label>₹ per gram</label><input inputmode="decimal" value="${esc(it.mkPg)}" oninput="setIt(${i},'mkPg',this.value);setIt(${i},'mkManual',true);priceLive()"></div>` : ''}
      </div>
      <div class="actions" style="margin:-4px 0 10px"><button class="btn small soft" onclick="showMkHelper(${i})">Making charge helper${mkMatches(it).length ? ' (' + mkMatches(it).length + ')' : ''}</button>
        ${it.mkRule && !it.mkManual ? `<span class="hint" style="align-self:center;margin:0">Default from rule: ${esc(it.mkRule)}</span>` : it.mkManual && mkMatches(it)[0] ? `<button class="btn small secondary" onclick="wiz.o.items[${i}].mkManual=false;wizPrice()">Back to default</button>` : ''}</div>
      <div class="field"><label>Other approved charges ₹ (this item)</label><input inputmode="decimal" value="${esc(it.other)}" oninput="setIt(${i},'other',this.value);priceLive()"></div>
      <div id="kq${i}"></div>
    </div>`).join('')}
    <div class="card"><h3>Estimate</h3>
      <div class="field"><label>Discount ₹</label><input inputmode="decimal" value="${esc(o.disc || '')}" oninput="wiz.o.disc=this.value;keepDraft();priceLive()"></div>
      <div class="field"><label>Making charge on the customer card</label><select onchange="wiz.o.mkShow=this.value;keepDraft()"><option value="">Default (${esc((MK_SHOW.find((m) => m[0] === (S.mkShow || 'type')) || [])[1] || '')})</option>${opt(MK_SHOW, o.mkShow || '')}</select></div>
      <div id="pTot"></div></div>`;
  priceLive();
}
function priceLive() {
  const o = wiz.o, b = priceOrder(o.items, S.rates, o.disc);
  o.items.forEach((it, i) => { const el = $('kq' + i); if (el) el.innerHTML = karatTable(it, S.rates); });
  const pct = b.sub ? num(o.disc) * 100 / b.sub : 0;
  $('pTot').innerHTML = breakdownHtml(b, o.items) +
    `<div class="kv"><span>Booking advance (min ${S.minAdv}%)</span><span>${rupee(b.minAdv)}</span></div>
     <div class="kv"><span>Advance to lock the gold rate (metal value)</span><span>${rupee(b.lock)}</span></div>` +
    (num(o.disc) > 0 && pct > num(S.discLimit) && !can('discount') ? '<div class="warnBox">This discount is above the sales limit. A manager must approve it before the estimate can be issued.</div>' : '');
}

// ---------------- 4. review ----------------
function wizReview() {
  const o = wiz.o, b = priceOrder(o.items, S.rates, o.disc), c = o.cust;
  const promise = addWorkDays(today(), S.leadDays);
  $('wizBody').innerHTML = `
    <div class="card"><h3>${esc(c.name)} <span class="badge">${esc(c.src)}</span></h3><div class="kv"><span>WhatsApp</span><span>${esc(c.phone)}</span></div><div class="kv"><span>Sales</span><span>${esc(o.owner || me.name)}</span></div></div>
    ${o.items.map((it, i) => `<div class="card"><h3>Item ${i + 1}: ${num(it.qty) > 1 ? it.qty + ' × ' : ''}${esc(it.product)}</h3>
      <div class="kv"><span>Design</span><span>${it.design === 'ours' ? 'Our design' : 'Customised'}${it.designNo ? ' #' + esc(it.designNo) : ''}${it.model ? ' · model ' + esc(it.model) : ''}</span></div>
      <div class="kv"><span>Metal</span><span>${purLabel(it.purity)} · ${esc(it.colour)} · ${g3(it.wt)}</span></div>
      ${it.size ? `<div class="kv"><span>Size / length</span><span>${esc(it.size)}</span></div>` : ''}
      ${it.stones.length ? `<div class="kv"><span>Stones</span><span>${it.stones.map((s) => stoneLabel(s.type) + (s.ct ? ' ' + s.ct + ' ct' : '')).join(', ')}</span></div>` : ''}
      <div class="kv"><span>Images</span><span>${(it.photos || []).length}</span></div></div>`).join('')}
    <div class="card"><h3>Estimate</h3>${breakdownHtml(b, o.items)}
      <div class="kv"><span>Booking advance (min ${S.minAdv}%)</span><span>${rupee(b.minAdv)}</span></div>
      <p class="hint">Delivery: at least ${S.leadDays} working days from order confirmation (about ${dt(promise)} if confirmed today). Estimate valid ${S.estValid} days.</p></div>
    <div class="actions">
      <button class="btn secondary" onclick="wizSave(false)">Save as draft</button>
      <button class="btn soft" onclick="wizSave('review')">Not sure? Save & ask for review</button>
      ${can('estimate') ? `<button class="btn" onclick="wizSave(true)">${wiz.id && (orders.find((x) => x.id === wiz.id) || {}).estNo ? 'Re-issue estimate' : 'Issue estimate'}</button>` : ''}
    </div>`;
}

function makeEstimate(o) {
  const b = priceOrder(o.items, S.rates, o.disc);
  const prev = lastOf(o.ests);
  return Object.assign({ v: (prev ? prev.v : 0) + 1, rates: clone(S.rates), items: clone(o.items), discIn: num(o.disc) }, b);
}
async function wizSave(issue) {
  for (const s of [0, 1]) { const e = wizCheck(s); if (e) { wizGo(s); return toast(e); } }
  const o = clone(wiz.o);
  o.cust.phone = '+91 ' + normPhone(o.cust.phone);
  let saved;
  if (!wiz.id) {
    try {
      o.log = [{ t: Date.now(), by: me.name, a: 'Enquiry created', d: `${o.cust.src} · ${o.items.length} item(s)` }];
      const r = await api('order', { order: o, create: true });
      mergeOrder(r.order); saved = r.order; store('yod_draft', null); setNet(true);
    } catch (e) { return toast(isNet(e) ? 'No internet — enquiry kept on this phone. Try again when online.' : e.message); }
    wiz.id = saved.id;
  } else {
    const was = orders.find((x) => x.id === wiz.id);
    const lastEst = lastOf(was.ests);
    if (lastEst) o.items.forEach((it) => { const old = (lastEst.items || []).find((x) => x.id === it.id); if (old && was.approval && JSON.stringify(Object.assign({}, old, { rev: 0 })) !== JSON.stringify(Object.assign({}, it, { rev: 0 }))) it.rev = (old.rev || 1) + 1; });
    if (['estimate', 'approved'].includes(was.status)) { o.status = 'enquiry'; o.approval = null; }
    o.log = (o.log || []).concat([{ t: Date.now(), by: me.name, a: !EDITABLE.includes(was.status) ? 'Admin edited items / price (status kept: ' + stLabel(was.status) + ')' : was.status === 'enquiry' ? 'Enquiry edited' : 'Revised — needs a new estimate and customer approval' }]);
    saved = await saveOrder(o);
    if (!saved) return;
  }
  if (issue === 'review') { toast('Saved'); openOrder(saved.id); shReview(); return; }
  if (issue) saved = await issueEstimate(saved.id) || saved;
  else toast('Saved');
  openOrder(saved.id);
}
async function issueEstimate(id) {
  const oo = orders.find((x) => x.id === id);
  if (oo && openReviews(oo).length && !confirm('A review request is still open. Issue the estimate anyway?')) return null;
  return step(id, (o) => {
    if (o.status === 'hold') return toast('Resume the enquiry first'), false;
    o.ests = (o.ests || []).concat([makeEstimate(o)]);
    o.status = 'estimate'; o.approval = null;
  }, 'Estimate issued', 'Estimate issued — send it to the customer');
}
