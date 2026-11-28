// ======================================================================
// Confirm without advance — special (trusted) customers only, staff with the
// "noadvance" permission ask, an admin approves. The server checks all three.
// ======================================================================
const isSpecialCust = (phone) => { const k = normPhone(phone); return !!k && (S.specialCust || []).some((c) => normPhone(c.phone) === k); };
const specialOf = (phone) => (S.specialCust || []).find((c) => normPhone(c.phone) === normPhone(phone));
/** 'ok' approved for this estimate, 'wait' asked, 'rej' rejected, '' nothing. */
function noAdvState(o) {
  const na = o.noAdv, est = lastOf(o.ests); if (!na || !na.req) return '';
  const v = num(est && est.v);
  if (na.ok && num(na.ok.v) === v) return 'ok';
  if (num(na.req.v) !== v) return '';
  if (na.rej) return 'rej';
  return 'wait';
}
const noAdvWaived = (o) => noAdvState(o) === 'ok' && isSpecialCust(o.cust.phone);
function noAdvHtml(o) {
  const est = lastOf(o.ests); if (o.status !== 'approved' || !est || verified(o, 'advance') >= num(est.minAdv)) return o.noAdvUsed ? `<div class="okBox">Confirmed without the minimum advance · approved by ${esc(o.noAdvUsed.by)}</div>` : '';
  const st = noAdvState(o), na = o.noAdv || {}, sp = isSpecialCust(o.cust.phone);
  if (st === 'ok') return `<div class="okBox">⭐ Admin ${esc(na.ok.by)} approved confirming without advance · ${dshort(na.ok.at)}</div>`;
  if (st === 'wait') return `<div class="warnBox">Waiting for admin approval to confirm without advance — asked by ${esc(na.req.by)}: “${esc(na.req.reason)}”${me.role === 'admin' ? `<div class="actions" style="margin-top:8px"><button class="btn small" onclick="noAdvApprove()">Approve</button><button class="btn small secondary" onclick="noAdvReject()">Reject</button></div>` : ''}</div>`;
  if (st === 'rej') return `<div class="badBox">Admin ${esc(na.rej.by)} said no to confirming without advance${na.rej.why ? ': ' + esc(na.rej.why) : ''}.</div>`;
  return sp ? '' : '';
}
function shNoAdv() {
  const o = getO(), est = lastOf(o.ests), sp = specialOf(o.cust.phone);
  if (!sp) return toast('Only special customers can be confirmed without advance');
  openSheet(`<h2>Confirm without advance</h2><p class="sub">⭐ Special customer: <b>${esc(o.cust.name)}</b>${sp.note ? ' · ' + esc(sp.note) : ''}</p>
    <div class="kv"><span>Estimate</span><span>${esc(est.no || '')} · ${rupee(est.total)}</span></div>
    <div class="kv"><span>Verified advance</span><span>${rupee(verified(o, 'advance'))} of ${rupee(est.minAdv)} minimum</span></div>
    <div class="field"><label>Reason <i class="req">*</i></label><input id="naWhy" placeholder="e.g. Regular customer, pays on delivery"></div>
    <p class="hint">${me.role === 'admin' ? 'You are an admin — this approves it straight away.' : 'An admin has to approve. The gold rate cannot be locked without advance.'}</p>
    <button class="btn block" onclick="noAdvAsk()">${me.role === 'admin' ? 'Approve without advance' : 'Ask admin to approve'}</button>`);
}
function noAdvAsk() {
  const why = f('naWhy'); if (!why) return toast('Give the reason');
  step(cur.id, (o) => { o.noAdv = { req: { reason: why, at: Date.now() } }; if (me.role === 'admin') o.noAdv.ok = { at: Date.now() }; },
    me.role === 'admin' ? 'Approved: confirm without advance' : 'Asked admin: confirm without advance', me.role === 'admin' ? 'Approved' : 'Sent for admin approval').then((r) => { if (r) closeSheet(); });
}
function noAdvApprove() { step(cur.id, (o) => { o.noAdv.ok = { at: Date.now() }; o.noAdv.rej = null; }, 'Approved: confirm without advance', 'Approved'); }
function noAdvReject() {
  openSheet(`<h2>Reject confirming without advance</h2><div class="field"><label>Reason</label><input id="naRej" placeholder="e.g. Take at least 10%"></div>
    <button class="btn danger block" onclick="step(cur.id,(o)=>{o.noAdv.rej={why:f('naRej'),at:Date.now()};o.noAdv.ok=null},'Rejected: confirm without advance','Rejected').then((r)=>{if(r)closeSheet()})">Reject</button>`);
}
// special customer mark on the order screen / settings (admin only)
async function setSpecial(phone, name, on, note) {
  try { const d = await api('special', { phone, name, on, note }); S = Object.assign(S, { specialCust: d.settings.specialCust }); toast(on === false ? 'Removed from special customers' : '⭐ Marked as special customer'); return true; }
  catch (e) { toast(e.message); return false; }
}
function shSpecial() {
  const o = getO(), sp = specialOf(o.cust.phone);
  openSheet(sp ? `<h2>⭐ Special customer</h2><p class="sub">${esc(o.cust.name)} · ${esc(o.cust.phone)}${sp.note ? '<br>' + esc(sp.note) : ''}<br>Marked by ${esc(sp.by)}${sp.at ? ' · ' + dshort(sp.at) : ''}</p>
      <button class="btn danger block" onclick="setSpecial(getO().cust.phone,'',false).then((ok)=>{if(ok){closeSheet();renderDetail()}})">Remove from special customers</button>`
    : `<h2>Mark as special customer</h2><p class="sub">${esc(o.cust.name)} · ${esc(o.cust.phone)}. Special customers can be confirmed without advance — with admin approval each time.</p>
      <div class="field"><label>Note</label><input id="spNote" placeholder="e.g. Family friend, regular since 2019"></div>
      <button class="btn block" onclick="setSpecial(getO().cust.phone,getO().cust.name,true,f('spNote')).then((ok)=>{if(ok){closeSheet();renderDetail()}})">⭐ Mark as special</button>`);
}
// Settings → Special customers (admin)
function subSpecial() {
  const L = (S.specialCust || []);
  $('subBody').innerHTML = `<div class="card"><h3>Special customers (${L.length})</h3><p class="sub">These customers can be confirmed without the minimum advance — a staff member with the “Ask to confirm orders without advance” permission asks, and an admin approves each order.</p>
    ${L.length ? L.map((c) => `<div class="gRow"><span class="no">⭐</span><span class="t"><b>${esc(c.name || '—')}</b> · ${esc(c.phone)}<small>${esc(c.note || '')}${c.by ? (c.note ? ' · ' : '') + 'by ' + esc(c.by) : ''}</small></span><span class="a"><button class="btn small secondary" onclick="setSpecial(${esc(JSON.stringify(c.phone))},'',false).then(()=>subSpecial())">Remove</button></span></div>`).join('') : '<p class="hint">None yet. Mark a customer from the order screen, or add one below.</p>'}</div>
    <div class="card"><h3>Add a special customer</h3>
      <div class="two"><div class="field"><label>Name</label><input id="spN"></div><div class="field"><label>Phone <i class="req">*</i></label><input id="spP" inputmode="tel" placeholder="10-digit or +country code"></div></div>
      ${canPickContact() ? `<button class="btn small soft" style="margin-bottom:10px" onclick="pickContact((n,p)=>{$('spN').value=n;$('spP').value=p})">📇 Pick from phone contacts</button>` : ''}
      <div class="field"><label>Note</label><input id="spT" placeholder="Why special"></div>
      <button class="btn block" onclick="if(!phoneOk(f('spP')))return toast('Enter a valid phone number');setSpecial(fmtPhone(f('spP')),f('spN'),true,f('spT')).then(()=>subSpecial())">⭐ Add</button></div>`;
}
