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
function editOrder(id) {
  const o = orders.find((x) => x.id === id);
  if (!o || !EDITABLE.includes(o.status)) return toast('Items are locked after the order is confirmed');
  if (!can('enquiry')) return toast('Your role cannot edit enquiries');
  wiz.id = id; wiz.o = clone(o); if (!wiz.o.items.length) wiz.o.items = [newItem()];
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
function setIt(i, k, v) { wiz.o.items[i][k] = v; keepDraft(); }
function setSt(i, j, k, v) { wiz.o.items[i].stones[j][k] = v; keepDraft(); }
function addItem() { wiz.o.items.push(newItem()); wizItems(); }
function dupItem(i) { const c = clone(wiz.o.items[i]); c.id = uid(); c.rev = 1; wiz.o.items.splice(i + 1, 0, c); wizItems(); }
function delItem(i) { if (wiz.o.items.length === 1) return toast('An enquiry needs at least one item'); if (!confirm('Remove item ' + (i + 1) + '?')) return; wiz.o.items.splice(i, 1); wizItems(); }
function addStone(i) { wiz.o.items[i].stones.push({ type: 'diamond', shape: 'Round', size: '', ct: '', pcs: 1, quality: '', setting: '', charge: '' }); wizItems(); }
function delStone(i, j) { wiz.o.items[i].stones.splice(j, 1); wizItems(); }
function addItemPhoto(i, cam) { pickPhoto((ref) => { wiz.o.items[i].photos.push(ref); keepDraft(); if (cur.view === 'vNew' && wiz.step === 1) wizItems(); }, cam); }
function delItemPhoto(i, k) { wiz.o.items[i].photos.splice(k, 1); wizItems(); }
const opt = (list, val) => list.map((x) => Array.isArray(x) ? `<option value="${x[0]}" ${x[0] === val ? 'selected' : ''}>${esc(x[1])}</option>` : `<option ${x === val ? 'selected' : ''}>${esc(x)}</option>`).join('');

function wizItems() {
  const o = wiz.o;
  $('wizBody').innerHTML = o.items.map((it, i) => `
    <div class="item">
      <div class="itemHead"><b>Item ${i + 1}${it.rev > 1 ? ` <span class="badge">rev ${it.rev}</span>` : ''}</b>
        <span><button class="btn small soft" onclick="dupItem(${i})">Duplicate</button> <button class="btn small danger" onclick="delItem(${i})">Remove</button></span></div>
      <div class="two">
        <div class="field"><label>Category</label><select onchange="setIt(${i},'cat',this.value)"><option value="">—</option>${opt(CATS, it.cat)}</select></div>
        <div class="field"><label>Quantity</label><input inputmode="numeric" value="${esc(it.qty)}" oninput="setIt(${i},'qty',Math.max(1,parseInt(this.value)||1))"></div>
      </div>
      <div class="field"><label>Product / item <i class="req">*</i></label><input value="${esc(it.product)}" oninput="setIt(${i},'product',this.value)" placeholder="e.g. Solitaire ring"></div>
      <div class="field"><label>Design</label><div class="choiceRow">
        <button class="chip ${it.design === 'ours' ? 'active' : ''}" onclick="setIt(${i},'design','ours');wizItems()">Our design</button>
        <button class="chip ${it.design === 'custom' ? 'active' : ''}" onclick="setIt(${i},'design','custom');wizItems()">Customised</button></div></div>
      <div class="two">
        <div class="field"><label>${it.design === 'ours' ? 'Design number' : 'Reference design no.'}</label><input value="${esc(it.designNo)}" oninput="setIt(${i},'designNo',this.value)"></div>
        <div class="field"><label>Model number</label><input value="${esc(it.model)}" oninput="setIt(${i},'model',this.value)"></div>
      </div>
      <div class="field"><label>Design details</label><textarea oninput="setIt(${i},'details',this.value)" placeholder="Style, finish, setting…">${esc(it.details)}</textarea></div>
      ${it.design === 'custom' ? `<div class="field"><label>Customisation as per customer</label><textarea oninput="setIt(${i},'custom',this.value)">${esc(it.custom)}</textarea></div>` : ''}
      <div class="field"><label>Images</label><div class="thumbs">${(it.photos || []).map((p, k) => `<div class="th"><img src="${esc(imgUrl(p))}" alt=""><button onclick="delItemPhoto(${i},${k})">✕</button></div>`).join('')}
        <button class="addPh" onclick="addItemPhoto(${i},true)">📷<span>Camera</span></button><button class="addPh" onclick="addItemPhoto(${i},false)">🖼<span>Gallery</span></button></div></div>
      <div class="two">
        <div class="field"><label>Purity</label><select onchange="setIt(${i},'purity',this.value)">${opt(PURITIES.map((p) => [p[0], p[1]]), it.purity)}</select></div>
        <div class="field"><label>Metal colour</label><select onchange="setIt(${i},'colour',this.value)">${opt(COLOURS, it.colour)}</select></div>
      </div>
      <div class="two">
        <div class="field"><label>Approx. net weight (g) <i class="req">*</i></label><input inputmode="decimal" value="${esc(it.wt)}" oninput="setIt(${i},'wt',this.value)"></div>
        <div class="field"><label>Gross weight (g)</label><input inputmode="decimal" value="${esc(it.gwt)}" oninput="setIt(${i},'gwt',this.value)"></div>
      </div>
      <div class="two">
        <div class="field"><label>Size / length</label><input value="${esc(it.size)}" oninput="setIt(${i},'size',this.value)" placeholder="Ring size, 18 in…"></div>
        <div class="field"><label>Width / thickness</label><input value="${esc(it.dims)}" oninput="setIt(${i},'dims',this.value)"></div>
      </div>
      <div class="field"><label>Diamonds / precious stones / lab-grown</label>
        ${it.stones.map((s, j) => `<div class="stone">
          <div class="two"><div class="field"><label>Type</label><select onchange="setSt(${i},${j},'type',this.value)">${opt(STONES, s.type)}</select></div>
            <div class="field"><label>Shape</label><input value="${esc(s.shape)}" oninput="setSt(${i},${j},'shape',this.value)"></div></div>
          <div class="three"><div class="field"><label>Size</label><input value="${esc(s.size)}" oninput="setSt(${i},${j},'size',this.value)"></div>
            <div class="field"><label>Total ct</label><input inputmode="decimal" value="${esc(s.ct)}" oninput="setSt(${i},${j},'ct',this.value)"></div>
            <div class="field"><label>Pieces</label><input inputmode="numeric" value="${esc(s.pcs)}" oninput="setSt(${i},${j},'pcs',this.value)"></div></div>
          <div class="two"><div class="field"><label>Quality / grade</label><input value="${esc(s.quality)}" oninput="setSt(${i},${j},'quality',this.value)" placeholder="VS1 F, SI GH…"></div>
            <div class="field"><label>Setting</label><input value="${esc(s.setting)}" oninput="setSt(${i},${j},'setting',this.value)"></div></div>
          <div class="two"><div class="field"><label>Stone charge ₹ (per piece of jewellery)</label><input inputmode="decimal" value="${esc(s.charge)}" oninput="setSt(${i},${j},'charge',this.value)"></div>
            <div class="field" style="display:flex;align-items:flex-end"><button class="btn small danger" onclick="delStone(${i},${j})">Remove stone</button></div></div>
        </div>`).join('')}
        <button class="btn small soft" onclick="addStone(${i})">+ Add stone</button></div>
      <div class="two">
        <div class="field"><label>Preferred vendor</label><select onchange="setIt(${i},'vendor',this.value)"><option value="">Decide later</option>${opt(vendors.filter((v) => v.active !== false).map((v) => v.name), it.vendor)}</select></div>
        <div class="field"><label>Production notes (internal)</label><input value="${esc(it.prodNotes)}" oninput="setIt(${i},'prodNotes',this.value)"></div>
      </div>
    </div>`).join('') + `<button class="btn soft block" onclick="addItem()">+ Add another item</button>`;
}

// ---------------- 3. price ----------------
function wizPrice() {
  const o = wiz.o, r = S.rates || {};
  const missing = [...new Set(o.items.map((it) => it.purity))].filter((p) => !(rateOf(p) > 0));
  $('wizBody').innerHTML = `
    <div class="card"><h3>Today's rates <span class="badge">${r.at ? ago(r.at) : 'not set'}</span></h3>
      <p class="sub" style="margin:0">${PURITIES.map((p) => `${purShort(p[0])} ${rupee(rateOf(p[0]))}`).join(' · ')}</p>
      ${missing.length ? `<div class="badBox">No rate set for ${missing.map(purShort).join(', ')}. ${can('rates') ? '<a href="#" onclick="openSub(\'rates\');return false">Set rates</a>' : 'Ask a manager to set the rates.'}</div>` : ''}</div>
    ${o.items.map((it, i) => `<div class="card"><h3>Item ${i + 1} · ${esc(it.product || 'Item')} <span class="badge">${purShort(it.purity)} · ${g3(it.wt)}</span></h3>
      <div class="two">
        <div class="field"><label>Making charge</label><select onchange="setIt(${i},'mkMode',this.value);wizPrice()">${opt(MK_MODES, it.mkMode)}</select></div>
        ${it.mkMode === 'pct' || it.mkMode === 'combo' ? `<div class="field"><label>VA / wastage %</label><input inputmode="decimal" value="${esc(it.mk)}" oninput="setIt(${i},'mk',this.value);priceLive()"></div>` : ''}
        ${it.mkMode === 'flat' ? `<div class="field"><label>₹ per piece</label><input inputmode="decimal" value="${esc(it.mk)}" oninput="setIt(${i},'mk',this.value);priceLive()"></div>` : ''}
        ${it.mkMode === 'pg' || it.mkMode === 'combo' ? `<div class="field"><label>₹ per gram</label><input inputmode="decimal" value="${esc(it.mkPg)}" oninput="setIt(${i},'mkPg',this.value);priceLive()"></div>` : ''}
      </div>
      <div class="field"><label>Other approved charges ₹ (this item)</label><input inputmode="decimal" value="${esc(it.other)}" oninput="setIt(${i},'other',this.value);priceLive()"></div>
      <div id="kq${i}"></div>
    </div>`).join('')}
    <div class="card"><h3>Estimate</h3>
      <div class="field"><label>Discount ₹</label><input inputmode="decimal" value="${esc(o.disc || '')}" oninput="wiz.o.disc=this.value;keepDraft();priceLive()"></div>
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
    o.log = (o.log || []).concat([{ t: Date.now(), by: me.name, a: was.status === 'enquiry' ? 'Enquiry edited' : 'Revised — needs a new estimate and customer approval' }]);
    saved = await saveOrder(o);
    if (!saved) return;
  }
  if (issue) saved = await issueEstimate(saved.id) || saved;
  else toast('Saved');
  openOrder(saved.id);
}
async function issueEstimate(id) {
  return step(id, (o) => {
    if (o.status === 'hold') return toast('Resume the enquiry first'), false;
    o.ests = (o.ests || []).concat([makeEstimate(o)]);
    o.status = 'estimate'; o.approval = null;
  }, 'Estimate issued', 'Estimate issued — send it to the customer');
}
