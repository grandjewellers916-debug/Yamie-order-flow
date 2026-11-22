// ======================================================================
// More: rates, vendors, pricing & policy, users, permissions, backup, my PIN
// ======================================================================
let sub = '';
function openSub(k) { sub = k; go('vSub'); }
function renderMore() {
  const items = [
    ['rates', 'Gold rates', S.rates.at ? `${S.rates.src === 'kiosk' ? 'From kiosk' : 'Typed in'} · ${ago(S.rates.at)}` : 'Not set yet', can('rates')],
    ['vendors', 'Vendors', `${vendors.length} vendor(s)`, can('vendors') || can('vendor')],
    ['policy', 'Pricing & policy', `GST ${S.gst}% · advance ${S.minAdv}% · ${S.leadDays} working days`, can('settings')],
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
  const fn = { rates: subRates, vendors: subVendors, policy: subPolicy, users: subUsers, perms: subPerms, backup: subBackup, links: subLinks, pin: subPin }[sub];
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
    <div class="field"><label>WhatsApp / phone</label><input ${edit ? '' : 'disabled'} value="${esc(v.phone)}" oninput="_vd[${i}].phone=this.value"></div></div>
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
    <div class="card"><h3>Pricing</h3><div class="two">${inp('gst', 'GST %')}${inp('roundTo', 'Round final price up to ₹')}</div>
      <label class="check"><input type="checkbox" id="po_mkOnStone" ${s.mkOnStone ? 'checked' : ''}><span>VA / making % applies to metal + stone (Price Check / Yamie workbook). Untick for metal only.</span></label>
      <div class="two">${inp('discLimit', 'Sales discount limit % (above needs manager)')}${inp('tol', 'Final price tolerance ±%')}</div>
      <p class="hint">Karat reference weights (same design in each karat; from the Karat Converter bangle):</p>
      <div class="two">${['k22', 'k18', 'k14', 'k9'].map((k) => `<div class="field"><label>${k.slice(1).toUpperCase()}K grams</label><input id="kr_${k}" inputmode="decimal" value="${s.karatRef[k]}"></div>`).join('')}</div>
      <label class="check"><input type="checkbox" id="po_k22w" ${s.karatRef22Weighed ? 'checked' : ''}><span>The 22K weight above is a real weighed reference (removes the * note)</span></label></div>
    <div class="card"><h3>Orders</h3><div class="two">${inp('minAdv', 'Minimum advance %')}${inp('leadDays', 'Minimum lead time (working days)')}</div>
      <div class="two">${inp('estValid', 'Estimate valid (days)')}${inp('qcBuffer', 'Receiving + QC days after ETD')}</div>
      <div class="field"><label>Weekly off</label><div class="choiceRow">${days.map((d, i) => `<button class="chip ${_off.includes(i) ? 'active' : ''}" onclick="this.classList.toggle('active');_off=_off.includes(${i})?_off.filter(x=>x!==${i}):_off.concat(${i})">${d}</button>`).join('')}</div></div>
      <div class="field"><label>Holidays</label><div class="choiceRow" id="holL"></div><div class="two" style="margin-top:8px"><input type="date" id="holD" class="search" style="margin:0"><button class="btn small soft" onclick="if($('holD').value&&!_hol.includes($('holD').value)){_hol.push($('holD').value);_hol.sort();holList()}">Add holiday</button></div></div></div>
    <div class="card"><h3>Reminders</h3><div class="two">${inp('approveDays', 'Follow up estimate after (days)')}${inp('etdWarnDays', 'Warn before vendor ETD (days)')}</div>
      <div class="two">${inp('collectDays', 'Not collected warning (days)')}${inp('autoLock', 'Auto-lock after (minutes, 0 = off)')}</div></div>
    <div class="card"><h3>Shop details (on cards & print)</h3>
      ${['shop', 'shopPhone', 'gstin', 'shopAddr', 'priceCheckUrl', 'repairUrl'].map((k) => `<div class="field"><label>${({ shop: 'Shop name', shopPhone: 'Phone', gstin: 'GSTIN', shopAddr: 'Address', priceCheckUrl: 'Price Check link', repairUrl: 'Repair Desk link' })[k]}</label><input id="po_${k}" value="${esc(s[k])}"></div>`).join('')}</div>
    <button class="btn block" onclick="savePolicy()">Save settings</button>`;
  holList();
}
function holList() { $('holL').innerHTML = _hol.map((h) => `<button class="chip" onclick="_hol=_hol.filter(x=>x!=='${h}');holList()">${dshort(h)} ✕</button>`).join('') || '<span class="hint">None</span>'; }
function savePolicy() {
  const st = clone(S);
  ['gst', 'roundTo', 'discLimit', 'tol', 'minAdv', 'leadDays', 'estValid', 'qcBuffer', 'approveDays', 'etdWarnDays', 'collectDays', 'autoLock'].forEach((k) => { st[k] = num($('po_' + k).value); });
  ['shop', 'shopPhone', 'gstin', 'shopAddr', 'priceCheckUrl', 'repairUrl'].forEach((k) => { st[k] = $('po_' + k).value.trim(); });
  st.mkOnStone = $('po_mkOnStone').checked; st.karatRef22Weighed = $('po_k22w').checked;
  ['k22', 'k18', 'k14', 'k9'].forEach((k) => { st.karatRef[k] = num($('kr_' + k).value) || st.karatRef[k]; });
  if (_off.length >= 7) return toast('Keep at least one working day');
  st.weeklyOff = _off; st.holidays = _hol;
  cfgCall('settings', { settings: st }, 'Settings saved');
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
    const r = await YBK.restore({ call: bkCall, progress: bkProg, replace: bkMode === 'replace', skip: (k) => k.startsWith('chg/') || k.startsWith('lock/') || k === 'meta/secret', last: (k) => k === 'cfg/users' }, bk);
    bkProg(`Restored ${r.records} records. Every device reloads now.`, 1);
    bkPicked = null; await pullAll(); toast('Backup restored');
  } catch (e) { bkProg('Restore stopped: ' + YBK.errText(e) + ' Run the restore again to finish it.', 0); }
  finally { bkBusy = false; }
}
