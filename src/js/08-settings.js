// ======================================================================
// More: rates, vendors, pricing & policy, users, permissions, backup, my PIN
// ======================================================================
let sub = '';
function openSub(k) { sub = k; go('vSub'); }
function renderMore() {
  const items = [
    ['rates', 'Gold rates', S.rates.at ? `${S.rates.src === 'kiosk' ? 'From kiosk' : 'Typed in'} · ${ago(S.rates.at)}` : 'Not set yet', can('rates')],
    ['vendors', 'Vendors', `${vendors.length} vendor(s)`, can('vendors') || can('vendor')],
    ['validity', 'Validity & rounding', `Estimate valid ${S.estValid} ${S.validCount === 'work' ? 'working ' : ''}day(s) · ${roundTxt(S.roundTo, S.roundMode)}`, can('settings')],
    ['grand', 'Grand lists', `Grand module: ${(GC().staff || []).length} staff · ${GC().items.length} items · ${GC().items.reduce((t, i) => t + (i.models || []).length, 0)} models`, can('grandcfg') || can('settings')],
    ['policy', 'Pricing & policy', `GST ${S.gst}% · advance ${S.minAdv}% · ${S.leadDays} working days`, can('settings')],
    ['lists', 'Picture lists', 'Categories, item types, settings, shanks, finishes, stones, shapes — with real photos', can('settings')],
    ['mk', 'Making charge helper', `${(S.mkRules || []).length} default rule(s) by vendor, purity and weight`, can('rates') || can('settings')],
    ['rem', 'Reminders', 'Switch reminders on or off and set their timing', can('settings')],
    ['review', 'Review desks', `${desks().map((d) => d.name).join(', ')} · ${(S.reviewTopics || []).length} topics`, can('settings')],
    ['users', 'Staff logins', `${users.filter((u) => u.active).length} active`, me.role === 'admin'],
    ['perms', 'Role permissions', 'What managers and staff can do', me.role === 'admin'],
    ['backup', 'Backup & restore', 'One file with every order, photo and setting', me.role === 'admin'],
    ['links', 'Price Check & Repair Desk', 'Open the other Yamie apps', true],
    ['pin', 'Change my PIN', me.name, true],
  ];
  $('vMore').innerHTML = `<p class="kicker">More</p><h1 class="h1">${esc(me.name)}</h1><p class="sub">${esc(me.role)} · Order Desk ${APP_VERSION}${NATIVE && NATIVE.version ? ' · app ' + esc(NATIVE.version()) : ''}</p>
    <div class="menu">${items.filter((x) => x[3]).map(([k, t, d]) => `<button onclick="openSub('${k}')"><span>${t}<small>${esc(d)}</small></span>›</button>`).join('')}
    <button onclick="logout()"><span>Log out<small>Back to the PIN screen</small></span>›</button></div>`;
}
function renderSub() {
  const back = '<button class="btn small secondary" onclick="go(\'vMore\')" style="margin-bottom:12px">‹ More</button>';
  const fn = { gems: subLists, lists: subLists, mk: subMk, rem: subRem, review: subReviewCfg, rates: subRates, vendors: subVendors, grand: subGrand, policy: subPolicy, validity: subValidity, users: subUsers, perms: subPerms, backup: subBackup, links: subLinks, pin: subPin }[sub];
  $('vSub').innerHTML = back + '<div id="subBody"></div>';
  if (fn) fn();
}
async function cfgCall(path, body, msg) {
  try { const d = await api(path, body); applyCfg(d); cacheLocal(); toast(msg || 'Saved'); renderSub(); return true; }
  catch (e) { toast(isNet(e) ? 'No internet — not saved' : e.message); return false; }
}

function rateSrc(r) { return r.src === 'kiosk' ? 'Kiosk' + (r.kioskAt ? ' (kiosk updated ' + esc(String(r.kioskAt).replace('T', ' ').slice(0, 16)) + ')' : '') : r.src === 'manual' ? 'Typed in by hand' : '—'; }
function subRates() {
  const r = S.rates;
  $('subBody').innerHTML = `<div class="card"><h3>Gold rates per gram (selling) <span class="badge">${r.src === 'kiosk' ? 'KIOSK' : r.src === 'manual' ? 'MANUAL' : 'NOT SET'}</span></h3>
    <p class="sub">Used for every new estimate and for final prices of orders without a rate lock. Estimates keep the rates they were issued with.</p>
    <div class="okBox" style="margin-top:0">Source: <b>${rateSrc(r)}</b>${r.at ? ' · saved ' + dtt(r.at) + ' by ' + esc(r.by) : ''}</div>
    <button class="btn block" onclick="kioskNow()">Get rates from kiosk now</button>
    <label class="check"><input type="checkbox" id="kAuto" ${S.kioskAuto ? 'checked' : ''} ${can('settings') ? '' : 'disabled'} onchange="kioskAuto(this.checked)"><span><b>Use kiosk rates automatically</b><br>Checked every 10 minutes while the app is open. On a day when rates are typed in below, the typed rates are kept until the next day.</span></label>
    <h3 style="margin-top:14px">Or type today's rates</h3>
    ${PURITIES.map((p) => `<div class="field"><label>${p[1]}</label><input id="rt_${p[2]}" inputmode="decimal" value="${r[p[2]] || ''}"></div>`).join('')}
    <button class="btn secondary block" onclick="saveRates()">Save typed rates</button>
    <p class="hint">Kiosk feed: ${esc(S.kioskUrl || '')} (the same rates as the Grand Jewellers kiosk and Price Check).</p></div>`;
}
async function kioskNow() {
  try { const d = await api('rates-kiosk', {}); applyCfg(d); cacheLocal(); toast(d.changed ? 'Kiosk rates loaded' : 'Already the latest kiosk rates'); renderSub(); }
  catch (e) { toast(isNet(e) ? 'No internet' : e.message); }
}
function saveRates() { const rates = {}; PURITIES.forEach((p) => { rates[p[2]] = num($('rt_' + p[2]).value); }); cfgCall('rates', { rates }, 'Typed rates saved for today'); }
function kioskAuto(on) { const st = clone(S); st.kioskAuto = on; cfgCall('settings', { settings: st }, on ? 'Kiosk rates on' : 'Kiosk rates off'); }
function subVendors() {
  const edit = can('vendors');
  window._vd = clone(vendors);
  $('subBody').innerHTML = `<div class="card"><h3>Vendors</h3><div id="vdList"></div>
    ${edit ? '<button class="btn soft block" onclick="_vd.push({name:\'\',phone:\'\',lead:15,spec:\'\',active:true});vdList()">+ Add vendor</button><div class="actions"><button class="btn" onclick="saveVendors()">Save vendors</button></div>' : '<p class="hint">Only managers can edit vendors.</p>'}</div>`;
  vdList();
}
function vdList() {
  const edit = can('vendors');
  $('vdList').innerHTML = _vd.map((v, i) => `<div class="stone"><div class="two"><div class="field"><label>Name</label><input ${edit ? '' : 'disabled'} value="${esc(v.name)}" oninput="_vd[${i}].name=this.value"></div>
    <div class="field"><label>WhatsApp / phone</label><div class="wtRow" style="margin:0"><input ${edit ? '' : 'disabled'} value="${esc(v.phone)}" oninput="_vd[${i}].phone=this.value">${edit && canPickContact() ? `<button class="btn small soft" title="Pick from phone contacts" onclick="pickContact((c)=>{_vd[${i}].phone=c.phone;if(!_vd[${i}].name)_vd[${i}].name=c.name;vdList()})">📇</button>` : ''}${v.phone ? `<button class="btn small soft" title="Save to phone contacts" onclick="saveToContacts(_vd[${i}].name,_vd[${i}].phone,'Yamie vendor')">＋</button>` : ''}</div></div></div>
    <div class="two"><div class="field"><label>Usual lead time (working days)</label><input ${edit ? '' : 'disabled'} inputmode="numeric" value="${v.lead}" oninput="_vd[${i}].lead=parseInt(this.value)||15"></div>
    <div class="field"><label>Speciality</label><input ${edit ? '' : 'disabled'} value="${esc(v.spec || '')}" oninput="_vd[${i}].spec=this.value"></div></div>
    <label class="check"><input type="checkbox" ${edit ? '' : 'disabled'} ${v.active !== false ? 'checked' : ''} onchange="_vd[${i}].active=this.checked"><span>Active</span></label></div>`).join('') || '<p class="hint">No vendors yet.</p>';
}
function saveVendors() { cfgCall('vendors', { vendors: _vd }, 'Vendors saved'); }

function subPolicy() {
  const s = S, inp = (k, l, h) => `<div class="field"><label>${l}</label><input id="po_${k}" inputmode="decimal" value="${esc(s[k])}">${h ? `<p class="hint">${h}</p>` : ''}</div>`;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  window._off = (s.weeklyOff || []).slice(); window._hol = (s.holidays || []).slice();
  $('subBody').innerHTML = `
    <div class="card"><h3>Pricing</h3><div class="field">${inp('gst', 'GST %')}</div>
      <div class="field"><label>Making charge on customer cards & print (default)</label>
        <label class="check" style="margin:4px 0"><input type="checkbox" id="po_mkT" ${mkShowFlags(s.mkShow || 'type').type ? 'checked' : ''}><span>Show the making type (VA % / ₹ per gram)</span></label>
        <label class="check" style="margin:4px 0"><input type="checkbox" id="po_mkA" ${mkShowFlags(s.mkShow || 'type').amt ? 'checked' : ''}><span>Show the making amount (otherwise it is included in the gold value)</span></label>
        <p class="hint">Staff can change it for each estimate / final price.</p></div>
      <div class="two">${inp('huidRate', 'HUID charge ₹ per piece')}<div class="field"><label>Payments</label><label class="check" style="margin:6px 0"><input type="checkbox" id="po_verifyPay" ${s.verifyPay !== false ? 'checked' : ''}><span>Manager must verify each payment</span></label></div></div>
      <label class="check"><input type="checkbox" id="po_mkOnStone" ${s.mkOnStone ? 'checked' : ''}><span>VA / making % applies to metal + stone (Price Check / Yamie workbook). Untick for metal only.</span></label>
      <div class="two">${inp('discLimit', 'Sales discount limit % (above needs manager)')}${inp('tol', 'Final price tolerance ±%')}</div>
      <p class="hint">Karat reference weights (same design in each karat; from the Karat Converter bangle):</p>
      <div class="two">${['k22', 'k18', 'k14', 'k9'].map((k) => `<div class="field"><label>${k.slice(1).toUpperCase()}K grams</label><input id="kr_${k}" inputmode="decimal" value="${s.karatRef[k]}"></div>`).join('')}</div>
      <label class="check"><input type="checkbox" id="po_k22w" ${s.karatRef22Weighed ? 'checked' : ''}><span>The 22K weight above is a real weighed reference (removes the * note)</span></label></div>
    <div class="card"><h3>Orders</h3><div class="two">${inp('minAdv', 'Minimum advance %')}${inp('leadDays', 'Minimum lead time (working days)')}</div>
      <div class="two">${inp('qcBuffer', 'Receiving + QC days after ETD')}</div>
      <div class="field"><label>Weekly off</label><div class="choiceRow">${days.map((d, i) => `<button class="chip ${_off.includes(i) ? 'active' : ''}" onclick="this.classList.toggle('active');_off=_off.includes(${i})?_off.filter(x=>x!==${i}):_off.concat(${i})">${d}</button>`).join('')}</div></div>
      <div class="field"><label>Holidays</label><div class="choiceRow" id="holL"></div><div class="two" style="margin-top:8px"><input type="date" id="holD" class="search" style="margin:0"><button class="btn small soft" onclick="if($('holD').value&&!_hol.includes($('holD').value)){_hol.push($('holD').value);_hol.sort();holList()}">Add holiday</button></div></div></div>
    <div class="card"><h3>Delivery charges</h3><p class="sub">Rates you pay the courier / post office. Staff pick one when the customer wants the item shipped; the charge is added to the final price.</p><div id="shipL"></div>
      <button class="btn small soft" onclick="_ship.push({name:'',rate:''});shipList()">+ Add provider / rate</button></div>
    <div class="card"><h3>Security</h3><div class="two">${inp('autoLock', 'Auto-lock after (minutes, 0 = off)')}</div><p class="hint">Reminder timings are in More → Reminders.</p></div>
    <div class="card"><h3>Shop details (on cards & print)</h3>
      ${SHOP_KEYS.map((k) => `<div class="field"><label>${SHOP_LBL[k]}</label><input id="po_${k}" value="${esc(s[k] || '')}"></div>`).join('')}</div>
    <button class="btn block" onclick="savePolicy()">Save settings</button>`;
  holList(); window._ship = clone(s.shipRates || []); shipList();
}
const SHOP_KEYS = ['shop', 'shopPhone', 'shopPhone2', 'shopLandline', 'woPhone', 'gstin', 'shopAddr', 'priceCheckUrl', 'repairUrl'];
const SHOP_LBL = { shop: 'Shop name', shopPhone: 'WhatsApp on estimate cards', shopPhone2: 'WhatsApp on "order ready" cards (two numbers: separate with  | )', shopLandline: 'Landline on "order ready" cards', woPhone: 'Phone on vendor work orders', gstin: 'GSTIN', shopAddr: 'Address', priceCheckUrl: 'Price Check link', repairUrl: 'Repair Desk link' };
function shipList() {
  $('shipL').innerHTML = _ship.map((r, i) => `<div class="two" style="margin-bottom:8px"><input value="${esc(r.name)}" placeholder="Provider / zone, e.g. DTDC Kerala" oninput="_ship[${i}].name=this.value"><div class="wtRow" style="margin:0"><input inputmode="decimal" value="${esc(r.rate)}" placeholder="₹" oninput="_ship[${i}].rate=this.value"><button class="btn small danger" onclick="_ship.splice(${i},1);shipList()">✕</button></div></div>`).join('') || '<p class="hint">No delivery rates yet.</p>';
}
function holList() { $('holL').innerHTML = _hol.map((h) => `<button class="chip" onclick="_hol=_hol.filter(x=>x!=='${h}');holList()">${dshort(h)} ✕</button>`).join('') || '<span class="hint">None</span>'; }
function savePolicy() {
  const st = clone(S);
  ['gst', 'discLimit', 'tol', 'minAdv', 'leadDays', 'qcBuffer', 'autoLock', 'huidRate'].forEach((k) => { st[k] = num($('po_' + k).value); });
  SHOP_KEYS.forEach((k) => { st[k] = $('po_' + k).value.trim(); });
  const mT = $('po_mkT').checked, mA = $('po_mkA').checked;
  st.mkOnStone = $('po_mkOnStone').checked; st.mkShow = mT && mA ? 'type' : mA ? 'amount' : mT ? 'typeonly' : 'hide'; st.verifyPay = $('po_verifyPay').checked;
  st.shipRates = _ship.filter((r) => String(r.name).trim()).map((r) => ({ name: String(r.name).trim(), rate: num(r.rate) })); st.karatRef22Weighed = $('po_k22w').checked;
  ['k22', 'k18', 'k14', 'k9'].forEach((k) => { st.karatRef[k] = num($('kr_' + k).value) || st.karatRef[k]; });
  if (_off.length >= 7) return toast('Keep at least one working day');
  st.weeklyOff = _off; st.holidays = _hol;
  cfgCall('settings', { settings: st }, 'Settings saved');
}

let _lk = 'cat', _lc = 'Ring', _le = [];
function subLists() {
  const keys = Object.keys(LISTS);
  $('subBody').innerHTML = `<div class="card"><h3>Picture lists</h3><p class="sub">These are the picture cards staff choose from when adding an item. Add a real photo to any card — it shows large in the pop-up and on cards.</p>
    <div class="two"><div class="field"><label>List</label><select onchange="_lk=this.value;loadList()">${opt(keys.map((k) => [k, LISTS[k].title]), _lk)}</select></div>
    ${_lk === 'prod' ? `<div class="field"><label>For category</label><select onchange="_lc=this.value;loadList()">${opt(listItems('cat').map((e) => e.name), _lc)}</select></div>` : ''}</div>
    <div id="leList"></div>
    <button class="btn soft block" onclick="_le.push({name:''});leList()">+ Add card</button>
    <div class="actions"><button class="btn secondary" onclick="if(confirm('Go back to the starting list?')){_le=LISTS[_lk].def(_lc).map((n)=>_lk==='gems'?Object.assign({},DEF_GEMS.find((g)=>g.name===n)):{name:n});leList()}">Reset list</button><button class="btn" onclick="saveList()">Save list</button></div></div>`;
  _le = clone(listItems(_lk, _lc)); leList();
}
function loadList() { subLists(); }
function leList() {
  const g = _lk === 'gems';
  $('leList').innerHTML = _le.map((e, i) => `<div class="listEd"><span class="pdImg" title="Add photo" onclick="pickPhoto((r)=>{_le[${i}].img=r;leList()},false)">${picHtml(_lk, e, _lc)}</span>
      <input type="text" value="${esc(e.name)}" placeholder="Name" oninput="_le[${i}].name=this.value">
      ${g ? `<input type="color" value="${esc(e.color || '#b3122e')}" oninput="_le[${i}].color=this.value;leList()">` : ''}
      <button class="btn small soft" onclick="pickPhoto((r)=>{_le[${i}].img=r;leList()},false)">Photo</button>
      ${e.img ? `<button class="btn small secondary" onclick="_le[${i}].img='';leList()" title="Remove photo">⌫</button>` : ''}
      <button class="btn small secondary" onclick="if(${i}>0){_le.splice(${i - 1},0,_le.splice(${i},1)[0]);leList()}">↑</button>
      <button class="btn small danger" onclick="_le.splice(${i},1);leList()">✕</button></div>`).join('') || '<p class="hint">No cards yet.</p>';
}
function saveList() {
  const st = clone(S); st.lists = Object.assign({}, S.lists || {});
  st.lists[listKey(_lk, _lc)] = _le.filter((e) => e.name.trim()).map((e) => { const o = { name: e.name.trim() }; if (e.img) o.img = e.img; if (_lk === 'gems') o.color = e.color || '#999999'; return o; });
  if (_lk === 'gems') st.gems = st.lists.gems;
  cfgCall('settings', { settings: st }, LISTS[_lk].title + ' saved');
}
let _mr = [];
function subMk() {
  _mr = clone(S.mkRules || []);
  $('subBody').innerHTML = `<div class="card"><h3>Making charge helper</h3><p class="sub">Default making charge by vendor, item, purity and weight range. The most specific matching rule fills the making charge on the Price step; staff can still change it, and the "Making charge helper" button shows every matching rule.</p>
    <div id="mrList"></div><button class="btn soft block" onclick="_mr.push({vendor:'',cat:'',purity:'',min:'',max:'',mode:'pct',mk:14,mkPg:0,note:''});mrList()">+ Add rule</button>
    <div class="actions"><button class="btn" onclick="saveMk()">Save rules</button></div></div>`;
  mrList();
}
function mrList() {
  const vn = vendors.filter((v) => v.active !== false).map((v) => v.name);
  $('mrList').innerHTML = _mr.map((r, i) => { const set = (k) => `oninput="_mr[${i}].${k}=this.value"`, ch = (k) => `onchange="_mr[${i}].${k}=this.value;mrList()"`;
    return `<div class="mkRule"><div class="two">
      <div class="field"><label>Vendor</label><select ${ch('vendor')}><option value="">Any vendor</option>${opt(vn, r.vendor)}</select></div>
      <div class="field"><label>Category</label><select ${ch('cat')}><option value="">Any item</option>${opt(listItems('cat').map((e) => e.name), r.cat)}</select></div>
      <div class="field"><label>Purity</label><select ${ch('purity')}><option value="">Any purity</option>${opt(PURITIES.map((p) => [p[0], p[1]]), r.purity)}</select></div>
      <div class="field"><label>Net weight from – to (g)</label><div class="two" style="gap:6px"><input inputmode="decimal" placeholder="0" value="${esc(r.min)}" ${set('min')}><input inputmode="decimal" placeholder="no limit" value="${esc(r.max)}" ${set('max')}></div></div>
      <div class="field"><label>Making</label><select ${ch('mode')}>${opt(MK_MODES, r.mode)}</select></div>
      <div class="field"><label>${r.mode === 'pg' ? '₹ per gram' : r.mode === 'flat' ? 'Flat ₹' : r.mode === 'combo' ? '₹/g  ·  VA %' : 'VA / making %'}</label>${r.mode === 'combo' ? `<div class="two" style="gap:6px"><input inputmode="decimal" value="${esc(r.mkPg)}" ${set('mkPg')}><input inputmode="decimal" value="${esc(r.mk)}" ${set('mk')}></div>` : r.mode === 'pg' ? `<input inputmode="decimal" value="${esc(r.mkPg)}" ${set('mkPg')}>` : `<input inputmode="decimal" value="${esc(r.mk)}" ${set('mk')}>`}</div></div>
      <div class="field"><label>Note (optional)</label><input value="${esc(r.note || '')}" ${set('note')} placeholder="e.g. Kolkata work, light weight"></div>
      <button class="btn small danger" onclick="_mr.splice(${i},1);mrList()">Remove rule</button></div>`; }).join('') || '<p class="hint">No rules yet — making charge stays as typed.</p>';
}
function saveMk() {
  const rules = _mr.map((r) => ({ vendor: r.vendor || '', cat: r.cat || '', purity: r.purity || '', min: num(r.min) || '', max: num(r.max) || '', mode: r.mode || 'pct', mk: num(r.mk), mkPg: num(r.mkPg), note: String(r.note || '').trim() }));
  cfgCall('mkrules', { rules }, 'Making rules saved');
}
function subUsers() {
  $('subBody').innerHTML = `<div class="card"><h3>Staff logins</h3>${users.map((u) => `<div class="pay"><div><b>${esc(u.name)}</b> · ${esc(u.role)}${u.active ? '' : ' · <span class="overdue">disabled</span>'}<small>${esc(u.phone || '')}</small></div>
    <button class="btn small soft" onclick="userSheet('${u.id}')">Edit</button></div>`).join('')}
    <button class="btn soft block" style="margin-top:10px" onclick="userSheet('')">+ Add staff</button></div>`;
}
function userSheet(id) {
  const u = users.find((x) => x.id === id) || { name: '', role: 'staff', phone: '', active: true };
  openSheet(`<h2>${id ? 'Edit ' + esc(u.name) : 'Add staff'}</h2>
    <div class="field"><label>Name</label><input id="usN" value="${esc(u.name)}"></div>
    <div class="field"><label>Phone</label><input id="usP" value="${esc(u.phone)}"></div>
    <div class="field"><label>Role</label><select id="usR" ${id === me.id ? 'disabled' : ''}>${opt([['staff', 'Staff'], ['manager', 'Manager'], ['admin', 'Admin']], u.role)}</select></div>
    <div class="field"><label>${id ? 'New PIN (leave empty to keep)' : '4-digit PIN'}</label><input id="usPin" inputmode="numeric" maxlength="4"></div>
    ${id && id !== me.id ? `<label class="check"><input type="checkbox" id="usA" ${u.active ? 'checked' : ''}><span>Active (can log in)</span></label>` : ''}
    <button class="btn block" onclick="saveUser('${id}')">Save</button>`);
}
async function saveUser(id) {
  const b = { id: id || undefined, name: f('usN'), phone: f('usP'), role: $('usR').value, pin: f('usPin') };
  if ($('usA')) b.active = $('usA').checked;
  if (await cfgCall('user', { user: b }, 'Saved')) closeSheet();
}
function subPerms() {
  const rpL = clone(rolePerms);
  window._rp = rpL;
  $('subBody').innerHTML = `<div class="card"><h3>Role permissions</h3><p class="sub">Admins can do everything. The server checks these on every step.</p>
    <table class="perm"><tr><th></th><th>Manager</th><th>Staff</th></tr>${PERMS.map(([k, l]) => `<tr><td>${esc(l)}</td>${['manager', 'staff'].map((r) => `<td><input type="checkbox" ${(rpL[r] || []).includes(k) ? 'checked' : ''} onchange="_rp['${r}']=this.checked?(_rp['${r}']||[]).concat('${k}'):(_rp['${r}']||[]).filter(x=>x!=='${k}')"></td>`).join('')}</tr>`).join('')}</table>
    <button class="btn block" style="margin-top:12px" onclick="cfgCall('roleperms',{rolePerms:_rp},'Permissions saved')">Save permissions</button></div>`;
}
function subLinks() {
  $('subBody').innerHTML = `<div class="card"><h3>Other Yamie apps</h3><p class="sub">Price a tag (photo reading, live Shopify rates) in Price Check; customer repairs stay in Repair Desk. They use their own logins.</p>
    <div class="next"><button class="btn" onclick="openLink('priceCheckUrl')">Open Price Check</button><button class="btn secondary" onclick="openLink('repairUrl')">Open Repair Desk</button></div></div>`;
}
function subPin() {
  $('subBody').innerHTML = `<div class="card"><h3>Change my PIN</h3><div class="field"><label>New 4-digit PIN</label><input id="myPin" inputmode="numeric" maxlength="4"></div>
    <button class="btn block" onclick="changePin()">Save</button></div>`;
}
async function changePin() { const p = f('myPin'); if (!/^\d{4}$/.test(p)) return toast('4 digits'); try { await api('mypin', { pin: p }); toast('PIN changed'); go('vMore'); } catch (e) { toast(e.message); } }

// ---------------- backup & restore (shared engine ybk.js, same as Repair Desk) ----------------
let bkBusy = false, bkPicked = null, bkMode = 'replace';
const bkCall = (op, body) => api('bk/' + op, body || {});
function subBackup() {
  const last = load('yod_bklast', null);
  $('subBody').innerHTML = `<div class="card"><h3>Backup & restore</h3>
    <p class="sub">One .zip file with every order, photo, document number, user (PINs stay hashed), vendor and setting. Keep it on a computer or Google Drive.</p>
    <div class="next"><button class="btn" id="bkMakeB" onclick="bkMake()">Make backup</button><button class="btn secondary" onclick="$('bkFile').click()">Restore…</button></div>
    <p class="hint" id="bkLast">${last ? `Last backup on this device: ${dtt(last.at)} · ${last.records} records, ${last.photos} photos` : 'No backup made on this device yet.'}</p>
    <div id="bkProg" hidden><p class="hint" id="bkTxt"></p><div class="bar"><i id="bkBar" style="width:0"></i></div></div><div id="bkRs"></div></div>`;
}
function bkProg(t, fr) { const p = $('bkProg'); if (!p) return; p.hidden = false; $('bkTxt').textContent = t; $('bkBar').style.width = Math.round(Math.max(0, Math.min(1, fr)) * 100) + '%'; }
async function bkMake() {
  if (bkBusy) return; if (me.role !== 'admin') return toast('Admin only');
  bkBusy = true; $('bkMakeB').disabled = true;
  try {
    const r = await YBK.backup({ app: 'Yamie Order Desk', appId: 'order-desk', fileBase: 'yamie-order-desk', version: APP_VERSION, by: me.name, call: bkCall, progress: bkProg });
    bkProg('Saving the file…', 1);
    const how = await YBK.save(r.blob, r.name, NATIVE);
    store('yod_bklast', { at: Date.now(), records: r.manifest.totals.records, photos: r.manifest.totals.photos });
    bkProg(`Backup ready: ${r.name} · ${r.manifest.totals.records} records, ${r.manifest.totals.photos} photos, ${YBK.fmtMB(r.blob.size)}${how === 'native' ? ' · saved to Downloads' : ''}.`, 1);
  } catch (e) { bkProg('Backup failed: ' + YBK.errText(e), 0); }
  finally { bkBusy = false; if ($('bkMakeB')) $('bkMakeB').disabled = false; }
}
async function bkPick(e) {
  const fl = e.target.files && e.target.files[0]; if (!fl) return;
  bkProg('Reading the backup…', 0);
  try {
    const bk = await YBK.read(fl), m = bk.manifest; e.target.value = '';
    if (m.appId !== 'order-desk') throw new Error(`This backup is from ${m.app || 'another app'}, not Order Desk.`);
    bkPicked = bk; $('bkProg').hidden = true;
    const n = m.shared.filter((x) => x.key.startsWith('orders/')).length;
    $('bkRs').innerHTML = `<div class="bkrs"><h3 style="margin:0;color:#9a5b00">Restore this backup?</h3><dl><dt>Made</dt><dd>${esc(dtt(m.created))}${m.by ? ' · ' + esc(m.by) : ''}</dd><dt>Holds</dt><dd>${n} orders · ${m.totals.photos} photos · ${m.shared.length} records</dd><dt>File</dt><dd>${esc(fl.name)} · ${YBK.fmtMB(fl.size)}</dd></dl>
      <label class="agree"><input type="radio" name="bkm" checked onchange="bkMode='replace'"><span><b>Replace everything</b><br>The shared database becomes exactly the backup.</span></label>
      <label class="agree"><input type="radio" name="bkm" onchange="bkMode='merge'"><span><b>Add & update only</b><br>Orders in the backup are put back as they were. Anything added later is kept.</span></label>
      <div class="field"><label>Type RESTORE to confirm</label><input id="bkConf" autocomplete="off" oninput="$('bkGo').disabled=this.value.trim().toUpperCase()!=='RESTORE'"></div>
      <div class="actions"><button class="btn danger" id="bkGo" disabled onclick="bkRun()">Restore now</button><button class="btn secondary" onclick="bkPicked=null;$('bkRs').innerHTML=''">Cancel</button></div></div>`;
    bkMode = 'replace';
  } catch (er) { e.target.value = ''; bkPicked = null; bkProg(YBK.errText(er), 0); }
}
async function bkRun() {
  const bk = bkPicked; if (!bk || bkBusy) return; if (me.role !== 'admin') return toast('Admin only');
  bkBusy = true; $('bkRs').innerHTML = '';
  try {
    const r = await YBK.restore({ call: bkCall, progress: bkProg, replace: bkMode === 'replace', skip: (k) => k.startsWith('chg/') || k.startsWith('lock/') || k === 'meta/secret' || k === 'pc/cache', last: (k) => k === 'cfg/users' }, bk);
    bkProg(`Restored ${r.records} records. Every device reloads now.`, 1);
    bkPicked = null; await pullAll(); toast('Backup restored');
  } catch (e) { bkProg('Restore stopped: ' + YBK.errText(e) + ' Run the restore again to finish it.', 0); }
  finally { bkBusy = false; }
}

// Validity & rounding (admin / Settings permission)
const canValid = () => !!me && (me.role === 'admin' || can('settings'));
function subValidity() {
  const s = S, inp = (k, l, h) => `<div class="field"><label>${l}</label><input id="vr_${k}" inputmode="numeric" value="${esc(s[k] != null ? s[k] : '')}">${h ? `<p class="hint">${h}</p>` : ''}</div>`;
  const steps = (k, def) => `<select id="vr_${k}">${[1, 10, 50, 100, 500, 1000].map((v) => `<option value="${v}" ${num(s[k] || def) === v ? 'selected' : ''}>${v === 1 ? 'No rounding (whole ₹)' : '₹' + v}</option>`).join('')}</select>`;
  const modes = (k) => `<select id="vr_${k}">${opt(ROUND_MODES, s[k] || 'up')}</select>`;
  $('subBody').innerHTML = `
    <div class="card"><h3>Validity dates</h3>
      <div class="two">${inp('estValid', 'Estimate valid for (days)', '0 = valid today only')}
        <div class="field"><label>Count the days as</label><select id="vr_validCount">${opt([['cal', 'Calendar days'], ['work', 'Working days']], s.validCount || 'cal')}</select></div></div>
      <div class="field"><label>When a customer approves after the estimate expired</label><select id="vr_estExpired">${opt([['block', 'Block — issue a new estimate at today\'s rates'], ['manager', 'Only a manager / admin can approve it'], ['allow', 'Allow, and note it in the history']], s.estExpired || 'block')}</select></div>
      ${inp('finalValid', 'Final price valid for (days after approval)', '0 = no date. When set, the date is printed on the order-ready card and a reminder shows if the balance is still unpaid.')}
      <p class="hint">Working days skip the weekly off and holidays set in Pricing & policy. Admins can change the date on a single estimate or final price from the order screen.</p></div>
    <div class="card"><h3>Rounding off</h3>
      <div class="two"><div class="field"><label>Estimates: round to</label>${steps('roundTo', 50)}</div><div class="field"><label>Estimates: direction</label>${modes('roundMode')}</div></div>
      <div class="two"><div class="field"><label>Final price: round to</label>${steps('finalRoundTo', 100)}</div><div class="field"><label>Final price: direction</label>${modes('finalRoundMode')}</div></div>
      <div class="field"><label>Minimum booking advance: round up to</label>${steps('advRound', 1)}</div>
      <p class="hint" id="vrEx"></p></div>
    <button class="btn block" onclick="saveValidity()">Save validity & rounding</button>`;
  const ex = () => { const r = 123456.4; $('vrEx').textContent = `Example: ₹1,23,456.40 → estimate ${rupee(roundBy(r, $('vr_roundTo').value, $('vr_roundMode').value))} · final price ${rupee(roundBy(r, $('vr_finalRoundTo').value, $('vr_finalRoundMode').value))}`; };
  ['roundTo', 'roundMode', 'finalRoundTo', 'finalRoundMode'].forEach((k) => { $('vr_' + k).onchange = ex; }); ex();
}
function saveValidity() {
  const st = clone(S);
  ['estValid', 'finalValid', 'roundTo', 'finalRoundTo', 'advRound'].forEach((k) => { st[k] = Math.max(0, Math.round(num($('vr_' + k).value))); });
  ['validCount', 'estExpired', 'roundMode', 'finalRoundMode'].forEach((k) => { st[k] = $('vr_' + k).value; });
  cfgCall('settings', { settings: st }, 'Validity & rounding saved');
}
// change the valid-till date of the latest estimate or final price on one order
function shValid(arr) {
  const o = getO(), x = o && lastOf(o[arr]); if (!x || !canValid()) return;
  const lbl = arr === 'ests' ? 'estimate' : 'final price';
  openSheet(`<h2>Change ${lbl} validity</h2><p class="sub">${esc(refOf(o))} · now ${x.valid ? 'valid till ' + dt(x.valid) : 'no date'}</p>
    <div class="field"><label>Valid till</label><input type="date" id="vlD" value="${esc(x.valid || today())}" min="${today()}"></div>
    <div class="choiceRow" style="margin:-4px 0 12px">${[1, 3, 7, 15].map((d) => `<button class="chip" onclick="$('vlD').value=addDaysYmd('${x.valid && x.valid > today() ? x.valid : today()}',${d})">+${d} day${d > 1 ? 's' : ''}</button>`).join('')}</div>
    <button class="btn block" onclick="doValid('${arr}')">Save</button>`);
}
const addDaysYmd = (ymd, n) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function doValid(arr) {
  const v = $('vlD').value; if (!v) return toast('Pick a date');
  step(cur.id, (o) => { lastOf(o[arr]).valid = v; }, `${arr === 'ests' ? 'Estimate' : 'Final price'} validity changed to ${v}`);
  closeSheet();
}
