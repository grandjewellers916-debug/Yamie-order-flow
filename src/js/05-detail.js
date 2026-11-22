// ======================================================================
// Order details: header, stage track, next steps, tabs, action sheets
// ======================================================================
const MILESTONES = [['Enquiry', ['enquiry']], ['Estimate', ['estimate']], ['Approved', ['approved']], ['Confirmed', ['confirmed']],
  ['Vendor', ['vendor', 'production', 'rework']], ['QC', ['received', 'qc_fail', 'qc_ok']], ['Final price', ['final', 'final_ok']], ['Ready', ['ready']], ['Closed', ['closed']]];
const QC_CHECKS = ['Approved design revision matches', 'Purity & hallmark (HUID) verified', 'Weight & dimensions within tolerance',
  'Stones: type, count, size, setting, condition', 'Size / length & workmanship', 'Polish & finish, no damage, complete'];
const getO = () => orders.find((o) => o.id === cur.id);

function openSheet(html) { $('sheet').innerHTML = '<button class="x" onclick="closeSheet()">✕</button>' + html; $('sheetBg').classList.add('on'); }
function closeSheet() { $('sheetBg').classList.remove('on'); refresh(); }

function nextActions(o) {
  const a = [], s = o.status, est = lastOf(o.ests);
  const add = (perm, label, fn, cls) => { if (!perm || can(perm)) a.push([label, fn, cls || '']); };
  if (s === 'enquiry') { add('enquiry', 'Edit items & price', `editOrder('${o.id}')`); add('estimate', 'Issue estimate', `issueEstimate('${o.id}')`, 'main'); }
  if (s === 'estimate') {
    add('', 'Send estimate card (WhatsApp)', `sendEstimate('${o.id}')`, 'main');
    add('approve', 'Record customer approval', 'shApprove()');
    add('', 'Print / PDF estimate', `printEstimate('${o.id}')`);
    add('estimate', 'Making on card: ' + ({ type: 'amount + type', amount: 'amount only', hide: 'hidden' })[mkShowOf(o)], 'shMkShow()');
    add('estimate', "Re-issue at today's rates", `issueEstimate('${o.id}')`);
    add('enquiry', 'Revise items', `editOrder('${o.id}')`);
  }
  if (s === 'approved') {
    if (verified(o, 'advance') < num(est.minAdv) || !(o.pays || []).length) add('advance', 'Record advance', "shPay('advance')", 'main');
    add('confirm', 'Confirm order', 'shConfirm()', verified(o, 'advance') >= num(est.minAdv) ? 'main' : '');
    add('enquiry', 'Revise items (needs re-approval)', `editOrder('${o.id}')`);
  }
  if (s === 'confirmed') add('vendor', 'Assign vendor & ETD', 'shVendor()', 'main');
  if (s === 'vendor') {
    add('', 'Send work order to vendor', 'shWorkOrder()', o.vendor.sentAt ? '' : 'main');
    add('production', 'Vendor acknowledged · in production', 'shAck()', o.vendor.sentAt ? 'main' : '');
    add('vendor', 'Change vendor / ETD', 'shVendor()');
  }
  if (['production', 'rework'].includes(s)) {
    add('receive', 'Receive in store', 'shReceive()', 'main');
    add('production', 'Log vendor follow-up', 'shFollow()');
    add('vendor', 'Change ETD', 'shEtd()');
    if (!o.vendor.dispAt) add('production', 'Vendor dispatched', `markDispatched('${o.id}')`);
  }
  if (s === 'received') add('qc', 'QC inspection', 'shQC()', 'main');
  if (s === 'qc_fail') add('production', 'Send for rework', 'shRework()', 'main');
  if (s === 'qc_ok') add('finalprice', 'Calculate final price', 'shFinal()', 'main');
  if (s === 'final') {
    const fin = lastOf(o.finals);
    if (!fin.cust) { add('', 'Send final price card (ask for OK)', `sendFinal('${o.id}')`, 'main'); add('finalprice', 'Customer replied OK', 'shCustOk()'); }
    add('approvefinal', 'Approve final price', 'shApproveFinal()', fin.cust ? 'main' : '');
    add('finalprice', 'Recalculate / discount', 'shFinal()');
  }
  if (s === 'final_ok') add('ready', 'Tell customer: order ready', `sendReady('${o.id}')`, 'main');
  if (s === 'ready') {
    if (!o.inv) add('advance', 'Link ERP invoice', 'shInvoice()', 'main');
    if (o.inv && balance(o) > 1) add('advance', 'Record balance payment', "shPay('balance')", 'main');
    add('close', 'Hand over & close', 'shClose()', o.inv && balance(o) <= 1 ? 'main' : '');
    if (o.inv) add('advance', 'Edit invoice', 'shInvoice()');
  }
  if (stage(o) === 'ord' && o.ono && s !== 'hold') add('', 'Update customer (WhatsApp)', 'shUpdate()');
  if (s === 'hold') add(o.ono ? 'cancel' : 'enquiry', 'Resume', `resumeOrder('${o.id}')`, 'main');
  else if (!['closed', 'lost'].includes(s) && !['received', 'qc_fail', 'qc_ok', 'final', 'final_ok', 'ready'].includes(s)) add(o.ono ? 'cancel' : 'enquiry', o.ono ? 'Hold / cancel order' : 'Hold / mark lost', 'shOutcome()');
  return a;
}

function renderDetail() {
  const o = getO();
  if (!o) { $('vDetail').innerHTML = '<div class="empty"><b>←</b>Choose an enquiry or order.</div>'; return; }
  const c = o.cust || {}, est = lastOf(o.ests), fin = lastOf(o.finals);
  const curM = MILESTONES.findIndex((m) => m[1].includes(o.status));
  const acts = nextActions(o);
  const tabs = [['next', 'Overview'], ['items', 'Items'], ['pay', 'Payments'], ['vendor', 'Vendor & QC'], ['docs', 'Documents'], ['log', 'History']];
  $('vDetail').innerHTML = `
    ${document.body.classList.contains('desk') ? '' : '<button class="btn small secondary" onclick="go(\'vOrders\')" style="margin-bottom:10px">‹ Orders</button>'}
    <div class="card">
      <div class="dHead"><div class="ref">${esc(refOf(o))}${o.ono && o.estNo ? `<small>from ${esc(o.estNo)}${est && est.v > 1 ? ' v' + est.v : ''}</small>` : ''}</div>${pill(o)}</div>
      <h3 style="margin:10px 0 2px">${esc(c.name)}</h3>
      <p class="sub" style="margin:0 0 8px">${esc(c.phone)} · ${esc(c.src || '')} · by ${esc(o.createdBy || '')} ${dshort(o.createdAt)}</p>
      <div class="kv"><span>${fin ? 'Final amount' : 'Estimated amount'}</span><span><b>${orderValue(o) ? rupee(orderValue(o)) : '—'}</b></span></div>
      ${o.promise ? `<div class="kv"><span>Promised delivery</span><span class="${isOverdue(o) ? 'overdue' : ''}">${dt(o.promise)}</span></div>` : ''}
      ${o.vendor && o.vendor.etd ? `<div class="kv"><span>Vendor ETD</span><span>${dt(o.vendor.etd)} · ${esc(o.vendor.name)}</span></div>` : ''}
      ${o.fromPc && !o.fromPc.seen ? `<div class="okBox">Sent from Price Check by ${esc(o.fromPc.by)} · ${dtt(o.fromPc.at)}${o.cust.notes ? ' · ' + esc(o.cust.notes) : ''}${can('enquiry') ? ` <button class="btn small" style="margin-left:8px" onclick="step(cur.id,(x)=>{x.fromPc.seen=true},'Taken up from Price Check','Taken up')">Take it up</button>` : ''}</div>` : ''}
      ${['hold', 'lost'].includes(o.status) && o.outcome ? `<div class="warnBox">${esc(stLabel(o.status))}: ${esc(o.outcome.reason)}</div>` : ''}
      <div class="actions"><button class="btn small soft" onclick="waChat('${o.id}')">WhatsApp</button><button class="btn small soft" onclick="callCust('${o.id}')">Call</button>
        ${can('delete') && !o.ono && me.role !== 'admin' ? `<button class="btn small danger" onclick="delOrder('${o.id}')">Delete</button>` : ''}
        ${!['closed', 'lost'].includes(o.status) ? `<button class="btn small soft" onclick="shReview()">Ask for review${openReviews(o).length ? ' (' + openReviews(o).length + ' open)' : ''}</button>` : ''}
        ${me.role === 'admin' ? `<button class="btn small secondary" onclick="shAdmin()">Admin: edit / reset / delete</button>` : ''}</div>
      <div class="stage">${MILESTONES.map((m, i) => `<span class="${i < curM ? 'done' : i === curM ? 'now' : ''}">${i < curM ? '✓ ' : ''}${m[0]}</span>`).join('')}</div>
    </div>
    ${acts.length ? `<div class="card"><h3>Next step</h3><div class="next">${acts.map(([l, f, cl]) => `<button class="btn ${cl === 'main' ? '' : 'secondary'}" onclick="${f}">${esc(l)}</button>`).join('')}</div>
      ${tasksFor(o).length ? `<p class="hint">${tasksFor(o).map((t) => esc(t[0])).join(' · ')}</p>` : ''}</div>` : ''}
    <div class="tabs">${tabs.map(([k, l]) => `<button class="chip ${cur.tab === k ? 'active' : ''}" onclick="cur.tab='${k}';renderDetail()">${l}</button>`).join('')}</div>
    <div id="dTab"></div>`;
  ({ next: tabOverview, items: tabItems, pay: tabPay, vendor: tabVendor, docs: tabDocs, log: tabLog })[cur.tab](o);
}

function tabOverview(o) {
  const est = lastOf(o.ests), fin = lastOf(o.finals);
  let h = reviewCard(o);
  if (fin) h += `<div class="card"><h3>Final price v${fin.v} <span class="badge">${fin.ok ? 'approved' : 'to approve'}</span></h3>${breakdownHtml(fin, fin.items || o.items, { label: 'Final price' })}
    <div class="kv"><span>Basis</span><span>${esc(fin.basis)}</span></div>
    <div class="kv"><span>Difference from estimate</span><span class="${fin.needCust ? 'overdue' : ''}">${fin.var >= 0 ? '+' : ''}${rupee(fin.var)} (${fin.varPct}%)</span></div></div>`;
  if (est) h += `<div class="card"><h3>Estimate ${esc(est.no || '')}${est.v > 1 ? ' v' + est.v : ''} <span class="badge">${dshort(est.at)}${est.valid ? ' · valid till ' + dshort(est.valid) : ''}</span></h3>${breakdownHtml(est, est.items)}
    <div class="kv"><span>Booking advance (min ${S.minAdv}%)</span><span>${rupee(est.minAdv)}</span></div>
    <div class="kv"><span>Advance to lock the gold rate</span><span>${rupee(est.lock)}</span></div></div>`;
  else if (o.items.length) { const b = priceOrder(o.items, S.rates, o.disc); h += `<div class="card"><h3>Draft price <span class="badge">today's rates</span></h3>${breakdownHtml(b, o.items)}</div>`; }
  if (o.approval) h += `<div class="card"><h3>Customer approval</h3><div class="kv"><span>When</span><span>${dtt(o.approval.at)} · ${esc(o.approval.ch)}</span></div><div class="kv"><span>Evidence</span><span>${esc(o.approval.ev)}</span></div><div class="kv"><span>Recorded by</span><span>${esc(o.approval.by)}</span></div></div>`;
  if (o.ono) h += `<div class="card"><h3>Order</h3><div class="kv"><span>Confirmed</span><span>${dtt(o.confirmedAt)} · ${esc(o.confirmedBy)}</span></div>
    <div class="kv"><span>Gold rate</span><span>${o.lock === 'full' ? 'Locked at ' + rupee(rateOf(o.items[0].purity, o.lockRates)) + '/g (' + purShort(o.items[0].purity) + ')' : 'Not locked — final price at the rate on delivery'}</span></div>
    <div class="kv"><span>Verified paid</span><span>${rupee(verified(o))}</span></div><div class="kv"><span>Balance</span><span>${rupee(balance(o))}</span></div></div>`;
  if (o.cust && o.cust.notes) h += `<div class="card"><h3>Notes</h3><p class="sub" style="margin:0">${esc(o.cust.notes)}</p></div>`;
  $('dTab').innerHTML = h || '<div class="empty">Nothing yet.</div>';
}
function tabItems(o) {
  $('dTab').innerHTML = o.items.map((it, i) => `<div class="card"><h3>Item ${i + 1}: ${num(it.qty) > 1 ? it.qty + ' × ' : ''}${esc(it.product)} <span class="badge">rev ${it.rev || 1}</span></h3>
    ${(it.refs || []).length ? `<p class="hint" style="margin:0 0 4px">Customer's reference images</p><div class="thumbs" style="margin-bottom:10px">${it.refs.map((p) => `<div class="th"><img src="${esc(imgUrl(p))}" onclick="zoomImg(this.src,'Reference')" alt=""></div>`).join('')}</div>` : ''}
    ${(it.photos || []).length ? `<div class="thumbs" style="margin-bottom:10px">${it.photos.map((p) => `<div class="th"><img src="${esc(imgUrl(p))}" onclick="window.open(this.src)" alt=""></div>`).join('')}</div>` : ''}
    ${[['Category', it.cat], ['Design', (it.design === 'ours' ? 'Our design' : 'Customised') + (it.designNo ? ' #' + it.designNo : '')], ['Model no.', it.model], ['Details', it.details], ['Customisation', it.custom],
      ['Metal', purLabel(it.purity) + ' · ' + it.colour], ['Approx. net / gross', g3(it.wt) + ' / ' + g3(it.gwt)], ['Size / length', it.size], ['Width / thickness', it.dims],
      ['Preferred vendor', it.vendor], ['Production notes', it.prodNotes]].filter((r) => r[1]).map((r) => `<div class="kv"><span>${r[0]}</span><span>${esc(r[1])}</span></div>`).join('')}
    ${(it.stones || []).map((s) => `<div class="kv"><span>${esc(stoneLabel(s.type))}</span><span>${esc([s.shape, s.size, s.ct ? s.ct + ' ct' : '', s.pcs ? s.pcs + ' pc' : '', s.quality, s.setting].filter(Boolean).join(' · '))}${num(s.charge) ? ' · ' + rupee(s.charge) : ''}</span></div>`).join('')}
    ${karatTable(it, lastOf(o.ests) ? lastOf(o.ests).rates : S.rates)}
  </div>`).join('') + (EDITABLE.includes(o.status) && can('enquiry') ? `<button class="btn soft block" onclick="editOrder('${o.id}')">Edit items</button>` : '');
}
function tabPay(o) {
  const est = lastOf(o.ests);
  $('dTab').innerHTML = `<div class="card"><h3>Payments</h3>
    ${est ? `<div class="kv"><span>Minimum booking advance</span><span>${rupee(est.minAdv)}</span></div><div class="kv"><span>Advance to lock the gold rate</span><span>${rupee(est.lock)}</span></div>` : ''}
    <div class="kv"><span>Verified advance</span><span><b>${rupee(verified(o, 'advance'))}</b></span></div>
    ${est && o.status === 'approved' && verified(o, 'advance') < est.minAdv ? `<div class="warnBox">Short by ${rupee(est.minAdv - verified(o, 'advance'))} (verified payments only).</div>` : ''}
    ${(o.pays || []).map((p) => `<div class="pay"><div><b>${p.kind === 'refund' ? '−' : ''}${rupee2(p.amt)}</b> · ${esc(p.kind)} · ${esc(p.mode)}<small>${esc(p.ref || '')} · ${dtt(p.at)} · ${esc(p.by || '')}</small>
      <small style="color:${p.ok ? 'var(--ok)' : 'var(--warn)'}">${p.ok ? '✓ verified by ' + esc(p.ok.by) : 'Not verified yet'}</small></div>
      ${!p.ok && can('verify') ? `<button class="btn small ok" onclick="verifyPay('${o.id}','${p.id}')">Verify</button>` : ''}</div>`).join('') || '<p class="hint">No payments yet.</p>'}
    <div class="kv"><span>Verified total</span><span>${rupee(verified(o))}</span></div><div class="kv tot"><span>Balance</span><span>${rupee(balance(o))}</span></div>
    ${o.inv ? `<div class="kv"><span>ERP invoice</span><span>${esc(o.inv.no)} · ${rupee2(o.inv.amt)}</span></div>` : ''}
    ${o.handover && o.handover.to ? `<div class="kv"><span>Handed over</span><span>${esc(o.handover.to)} · ${dtt(o.handover.at)}</span></div>` : ''}
    ${(o.approval || o.ono) && !['closed', 'lost'].includes(o.status) && can('advance') ? `<div class="actions"><button class="btn small soft" onclick="shPay('${o.ono ? 'balance' : 'advance'}')">+ Record payment</button>${me.role === 'admin' ? '<button class="btn small soft" onclick="shPay(\'refund\')">Refund</button>' : ''}</div>` : ''}</div>`;
}
function tabVendor(o) {
  const v = o.vendor;
  let h = v ? `<div class="card"><h3>${esc(v.name)} <span class="badge">ETD ${dshort(v.etd)}</span></h3>
    <div class="kv"><span>Internal due</span><span>${dt(v.due)}</span></div>
    <div class="kv"><span>Work order sent</span><span>${v.sentAt ? dtt(v.sentAt) : '—'}</span></div>
    <div class="kv"><span>Vendor acknowledged</span><span>${v.ackAt ? dtt(v.ackAt) + ' ' + esc(v.ref || '') : '—'}</span></div>
    <div class="kv"><span>Dispatched</span><span>${v.dispAt ? dtt(v.dispAt) : '—'}</span></div>
    ${can('viewcost') ? `<div class="kv"><span>Vendor cost (restricted)</span><span>${v.cost ? rupee(v.cost) : '—'}</span></div>` : ''}
    ${vendorPhone(v.name) ? `<div class="actions"><button class="btn small soft" onclick="callNo('${esc(vendorPhone(v.name))}')">Call vendor</button></div>` : ''}</div>` : '<div class="empty">No vendor assigned yet.</div>';
  if ((o.fu || []).length) h += `<div class="card"><h3>Follow-ups</h3><div class="log">${o.fu.slice().reverse().map((f) => `<div><b>${esc(f.note)}</b><small>${dtt(f.at)} · ${esc(f.ch)} · ${esc(f.by)}${f.next ? ' · next ' + dshort(f.next) : ''}</small></div>`).join('')}</div></div>`;
  (o.recv || []).forEach((r, k) => { h += `<div class="card"><h3>Received ${k ? '(after rework)' : ''} <span class="badge">${r.date ? dshort(r.date) : dshort(r.at)}</span></h3>
    ${r.vendor || r.vinv ? `<div class="kv"><span>Vendor · invoice</span><span>${esc(r.vendor || '')} · ${esc(r.vinv || '—')}</span></div>` : ''}
    ${o.items.map((it, i) => `<div class="kv"><span>Item ${i + 1} ${r.purs ? purShort(r.purs[it.id]) : ''} G / N</span><span>${g3(r.gwts && r.gwts[it.id])} / ${g3(r.wts && r.wts[it.id])} <small>(est. ${g3(it.wt)})</small></span></div>`).join('')}
    ${(r.photos || []).length ? `<div class="thumbs" style="margin:8px 0">${r.photos.map((p) => `<div class="th"><img src="${esc(imgUrl(p))}" onclick="window.open(this.src)" alt=""></div>`).join('')}</div>` : ''}
    <div class="kv"><span>Pieces · by</span><span>${r.pcs} · ${esc(r.by || '')}</span></div>${r.dev ? `<div class="kv"><span>Deviations</span><span>${esc(r.dev)}</span></div>` : ''}</div>`; });
  if ((o.qc || []).length) h += `<div class="card"><h3>QC</h3><div class="log">${o.qc.map((q) => `<div><b style="color:${q.ok ? 'var(--ok)' : 'var(--bad)'}">${q.ok ? '✓ Approved' : '✕ Rejected'}</b>${q.note ? ' · ' + esc(q.note) : ''}<small>${dtt(q.at)} · ${esc(q.by || '')}</small></div>`).join('')}</div></div>`;
  $('dTab').innerHTML = h;
}
function tabDocs(o) {
  const c = o.cust || {};
  $('dTab').innerHTML = `<div class="card"><h3>Cards & documents</h3><div class="next">
    ${(o.ests || []).slice().reverse().map((e) => `<button class="btn secondary" onclick="sendEstimate('${o.id}',${e.v})">Estimate ${esc(e.no || '')}${e.v > 1 ? ' v' + e.v : ''} · ${rupee(e.total)} — share</button>`).join('')}
    ${o.ests && o.ests.length ? `<button class="btn secondary" onclick="printEstimate('${o.id}')">Print / PDF estimate</button>` : ''}
    ${o.vendor ? `<button class="btn secondary" onclick="sendWorkOrder('${o.id}')">Vendor work order card (no prices)</button>` : ''}
    ${lastOf(o.finals) ? `<button class="btn secondary" onclick="sendFinal('${o.id}')">Final price card</button>` : ''}
    ${['ready', 'closed'].includes(o.status) ? `<button class="btn secondary" onclick="sendReady('${o.id}',true)">Order ready card</button>` : ''}
  </div></div>
  <div class="card"><h3>Shared</h3><div class="log">${(o.log || []).filter((l) => /^Shared/.test(l.a)).reverse().map((l) => `<div><b>${esc(l.a)}</b><small>${dtt(l.t)} · ${esc(l.by)} · share opened, delivery not confirmed</small></div>`).join('') || '<p class="hint">Nothing shared yet.</p>'}</div></div>`;
}
function tabLog(o) {
  $('dTab').innerHTML = `<div class="card"><div class="log">${(o.log || []).slice().reverse().map((l) => `<div><b>${esc(l.a)}</b>${l.d ? ' · ' + esc(l.d) : ''}<small>${dtt(l.t)} · ${esc(l.by)}</small></div>`).join('')}</div></div>`;
}

// ---------------- simple actions ----------------
const vendorPhone = (name) => (vendors.find((v) => v.name === name) || {}).phone || '';
function callNo(n) { if (NATIVE && NATIVE.callNumber) NATIVE.callNumber(n); else location.href = 'tel:' + n.replace(/[^\d+]/g, ''); }
function callCust(id) { const o = orders.find((x) => x.id === id); callNo((o.cust || {}).phone || ''); }
function openWa(phone, text) {
  const u = 'https://wa.me/' + waDigits(phone) + (text ? '?text=' + encodeURIComponent(text) : '');
  if (NATIVE && NATIVE.openUrl) NATIVE.openUrl(u); else window.open(u, '_blank', 'noopener');
}
function waChat(id) { const o = orders.find((x) => x.id === id); openWa(o.cust.phone, ''); }
async function delOrder(id) { if (!confirm('Delete this enquiry for good?')) return; try { await api('order-delete', { id }); orders = orders.filter((o) => o.id !== id); cacheLocal(); cur.id = null; go('vOrders'); toast('Deleted'); } catch (e) { toast(e.message); } }
function verifyPay(id, pid) { step(id, (o) => { const p = o.pays.find((x) => x.id === pid); p.ok = { by: me.name, at: Date.now() }; const est = lastOf(o.ests); }, 'Payment verified', 'Payment verified'); }
function markDispatched(id) { step(id, (o) => { o.vendor.dispAt = Date.now(); }, 'Vendor dispatched', 'Marked dispatched'); }
function resumeOrder(id) { step(id, (o) => { o.status = (o.outcome && o.outcome.prev) || 'enquiry'; }, 'Resumed', 'Resumed'); }

// ---------------- sheets ----------------
const f = (id) => ($(id) ? $(id).value.trim() : '');
function shApprove() {
  const o = getO(), est = lastOf(o.ests);
  openSheet(`<h2>Customer approval</h2><p class="sub">Approves estimate ${esc(est.no || '')}${est.v > 1 ? ' v' + est.v : ''} (${rupee(est.total)}) and design ${o.items.map((it) => 'rev ' + (it.rev || 1)).join(', ')}. Approved designs can only change through a new revision and approval.</p>
    <div class="field"><label>How did the customer approve?</label><select id="apCh">${opt(['WhatsApp', 'In store', 'Phone call'], 'WhatsApp')}</select></div>
    <div class="field"><label>Evidence <i class="req">*</i></label><textarea id="apEv" placeholder="Their reply, 'signed estimate copy', call note…"></textarea></div>
    <button class="btn block" onclick="doApprove()">Record approval</button>`);
}
function doApprove() {
  if (!f('apEv')) return toast('Note the approval evidence');
  step(cur.id, (o) => { o.approval = { v: lastOf(o.ests).v, ch: f('apCh'), ev: f('apEv') }; o.status = 'approved'; }, 'Customer approved', 'Approval recorded — take the advance').then((r) => r && closeSheet());
}
function shPay(kind) {
  const o = getO(), est = lastOf(o.ests);
  const sugg = kind === 'advance' ? Math.max(0, num(est && est.minAdv) - verified(o, 'advance')) : kind === 'balance' ? balance(o) : '';
  openSheet(`<h2>${kind === 'refund' ? 'Refund' : kind === 'balance' ? 'Balance payment' : 'Advance'}</h2>
    ${est && kind === 'advance' ? `<p class="sub">Minimum booking advance ${rupee(est.minAdv)} (${S.minAdv}%). Paying the metal value ${rupee(est.lock)} locks today's gold rate.</p>` : ''}
    <div class="field"><label>Amount ₹</label><input id="pyAmt" inputmode="decimal" value="${sugg || ''}"></div>
    ${kind === 'advance' && est ? `<div class="choiceRow" style="margin:-4px 0 12px"><button class="chip" onclick="$('pyAmt').value=${Math.max(0, est.minAdv - verified(o, 'advance'))}">Minimum ${rupee(est.minAdv)}</button><button class="chip" onclick="$('pyAmt').value=${Math.max(0, est.lock - verified(o, 'advance'))}">Lock rate ${rupee(est.lock)}</button></div>` : ''}
    <div class="two"><div class="field"><label>Mode</label><select id="pyMode">${opt(['UPI', 'Cash', 'Card', 'Bank transfer', 'Old gold', 'Other'], 'UPI')}</select></div>
    <div class="field"><label>Receipt / UTR no.</label><input id="pyRef"></div></div>
    <p class="hint">${can('verify') ? 'You can verify it at once.' : 'A manager verifies the payment before it counts toward the advance.'}</p>
    <div class="actions"><button class="btn" onclick="doPay('${kind}',false)">Record</button>${can('verify') ? `<button class="btn ok" onclick="doPay('${kind}',true)">Record & verify</button>` : ''}</div>`);
}
function doPay(kind, ok) {
  const amt = num(f('pyAmt')); if (!(amt > 0)) return toast('Enter the amount');
  step(cur.id, (o) => { o.pays = (o.pays || []).concat([{ id: uid(), kind, amt, mode: f('pyMode'), ref: f('pyRef'), ok: ok ? { by: me.name } : null }]); },
    `Payment recorded · ${kind} ${rupee2(amt)} ${f('pyMode')}${ok ? ' · verified' : ''}`, 'Payment recorded').then((r) => r && closeSheet());
}
function shConfirm() {
  const o = getO(), est = lastOf(o.ests), adv = verified(o, 'advance');
  const canLock = adv >= est.lock;
  openSheet(`<h2>Confirm order</h2>
    <div class="kv"><span>Estimate</span><span>${esc(est.no || '')} · ${rupee(est.total)}</span></div>
    <div class="kv"><span>Verified advance</span><span><b>${rupee(adv)}</b></span></div>
    <div class="kv"><span>Minimum (${S.minAdv}%)</span><span style="color:${adv >= est.minAdv ? 'var(--ok)' : 'var(--bad)'}">${rupee(est.minAdv)}</span></div>
    <div class="kv"><span>Promised delivery</span><span>${dt(addWorkDays(today(), S.leadDays))} (${S.leadDays} working days)</span></div>
    ${adv < est.minAdv ? `<div class="badBox">The verified advance is below ${S.minAdv}%. Record and verify the advance first.</div>` : ''}
    <label class="check"><input type="checkbox" id="cfLock" ${canLock ? '' : 'disabled'}><span><b>Lock the gold rate</b><br>${canLock ? 'The customer has paid the metal value; the final price uses today\'s rate.' : `Needs ${rupee(est.lock)} verified (metal value). Without it the final price uses the rate on delivery.`}</span></label>
    <button class="btn block" ${adv < est.minAdv ? 'disabled' : ''} onclick="doConfirm()">Confirm & issue order number</button>`);
}
function doConfirm() {
  const lock = $('cfLock') && $('cfLock').checked;
  step(cur.id, (o) => { o.status = 'confirmed'; o.lock = lock ? 'full' : 'none'; }, 'Order confirmed' + (lock ? ' · gold rate locked' : ''), 'Order confirmed').then((r) => { if (r) { closeSheet(); toast('Order ' + r.ono + ' confirmed · due ' + dshort(r.promise)); } });
}
function shVendor() {
  const o = getO(), v = o.vendor || {}, pref = v.name || (o.items.find((it) => it.vendor) || {}).vendor || '';
  const vd = vendors.find((x) => x.name === pref);
  const etd = v.etd || addWorkDays(today(), vd ? vd.lead : 15);
  openSheet(`<h2>Vendor & ETD</h2>
    <div class="field"><label>Vendor</label><select id="vdName" onchange="vdChanged()"><option value="">Choose…</option>${opt(vendors.filter((x) => x.active !== false).map((x) => x.name), pref)}</select>
      ${can('vendors') ? '<p class="hint"><a href="#" onclick="closeSheet();openSub(\'vendors\');return false">Add vendors in Settings</a></p>' : ''}</div>
    <div class="two"><div class="field"><label>Vendor ETD</label><input type="date" id="vdEtd" value="${etd}" oninput="vdWarn()"></div>
    <div class="field"><label>Internal due (optional)</label><input type="date" id="vdDue" value="${v.due || ''}"></div></div>
    ${can('viewcost') ? `<div class="field"><label>Vendor cost ₹ (restricted)</label><input id="vdCost" inputmode="decimal" value="${v.cost || ''}"></div>` : ''}
    <div id="vdWarn"></div>
    <button class="btn block" onclick="doVendor()">${o.status === 'confirmed' ? 'Assign vendor' : 'Save'}</button>`);
  vdWarn();
}
function vdChanged() { const vd = vendors.find((x) => x.name === f('vdName')); if (vd && getO().status === 'confirmed') $('vdEtd').value = addWorkDays(today(), vd.lead); vdWarn(); }
function vdWarn() {
  const o = getO(), e = f('vdEtd'); if (!e) return;
  const need = addWorkDays(e, S.qcBuffer);
  $('vdWarn').innerHTML = o.promise && need > o.promise ? `<div class="warnBox">ETD + ${S.qcBuffer} QC days = ${dt(need)}, after the promised ${dt(o.promise)}. Saving moves the promise (your approval is logged). Update the customer.</div>` : '';
}
function doVendor() {
  const name = f('vdName'), etd = f('vdEtd'); if (!name || !etd) return toast('Choose the vendor and ETD');
  step(cur.id, (o) => {
    o.vendor = Object.assign({}, o.vendor || {}, { name, etd, due: f('vdDue') || addWorkDays(etd, S.qcBuffer) });
    if ($('vdCost')) o.vendor.cost = num(f('vdCost')) || null;
    o.status = o.status === 'confirmed' ? 'vendor' : o.status;
  }, 'Vendor: ' + name + ' · ETD ' + dshort(etd), 'Saved').then((r) => r && closeSheet());
}
function shWorkOrder() {
  const o = getO(), v = o.vendor;
  window._woPh = (v.photos || []).slice();
  openSheet(`<h2>Work order · ${esc(v.name)}</h2><p class="sub">The card shows item, purity, colour, size, quantity, design no., weights and stones — no prices, advances or customer details.</p>
    <div class="field"><label>Extra photos for the vendor (sketch, CAD, reference)</label><div class="thumbs" id="woPh"></div></div>
    <div class="actions"><button class="btn" onclick="saveWoPhotos(true)">Send card on WhatsApp</button>${v.sentAt ? '' : '<button class="btn secondary" onclick="saveWoPhotos(false,true)">Mark as sent</button>'}</div>`);
  woPhotos();
}
function woPhotos() {
  $('woPh').innerHTML = _woPh.map((p, k) => `<div class="th"><img src="${esc(imgUrl(p))}" alt=""><button onclick="_woPh.splice(${k},1);woPhotos()">✕</button></div>`).join('') +
    '<button class="addPh" onclick="pickPhoto((r)=>{_woPh.push(r);woPhotos()},true)">📷<span>Camera</span></button><button class="addPh" onclick="pickPhoto((r)=>{_woPh.push(r);woPhotos()},false)">🖼<span>Gallery</span></button>';
}
async function saveWoPhotos(send, markOnly) {
  const o = getO();
  if (JSON.stringify(_woPh) !== JSON.stringify(o.vendor.photos || []) || markOnly) {
    const r = await step(o.id, (x) => { x.vendor.photos = _woPh.slice(); if (markOnly && !x.vendor.sentAt) x.vendor.sentAt = Date.now(); }, markOnly ? 'Work order marked as sent' : 'Vendor photos updated');
    if (!r) return;
  }
  closeSheet();
  if (send) sendWorkOrder(o.id);
}
function shAck() {
  openSheet(`<h2>Vendor acknowledged</h2><div class="field"><label>Vendor job / reference no.</label><input id="akRef"></div><button class="btn block" onclick="doAck()">Mark in production</button>`);
}
function doAck() { step(cur.id, (o) => { o.vendor.ackAt = Date.now(); o.vendor.ref = f('akRef'); if (!o.vendor.sentAt) o.vendor.sentAt = Date.now(); o.status = 'production'; }, 'Vendor acknowledged · in production', 'In production').then((r) => r && closeSheet()); }
function shFollow() {
  openSheet(`<h2>Vendor follow-up</h2>
    <div class="field"><label>How</label><div class="choiceRow">${['WhatsApp', 'Call', 'Visit'].map((x, i) => `<button class="chip ${i ? '' : 'active'}" onclick="document.querySelectorAll('#fuCh .chip,.fuc').forEach(b=>b.classList.remove('active'));this.classList.add('active');window._fuCh='${x}'" >${x}</button>`).join('')}</div></div>
    <div class="field"><label>Progress / note</label><textarea id="fuNote"></textarea></div>
    <div class="field"><label>Next follow-up</label><input type="date" id="fuNext" value="${addWorkDays(today(), 2)}"></div>
    <div class="actions">${vendorPhone(getO().vendor.name) ? `<button class="btn secondary" onclick="callNo('${esc(vendorPhone(getO().vendor.name))}')">Call vendor</button>` : ''}<button class="btn" onclick="doFollow()">Save</button></div>`);
  window._fuCh = 'WhatsApp';
}
function doFollow() {
  if (!f('fuNote')) return toast('Add a note');
  step(cur.id, (o) => { o.fu = (o.fu || []).concat([{ at: Date.now(), by: me.name, ch: window._fuCh, note: f('fuNote'), next: f('fuNext') }]); }, 'Vendor follow-up · ' + f('fuNote'), 'Follow-up saved').then((r) => r && closeSheet());
}
function shEtd() {
  const o = getO();
  openSheet(`<h2>Change ETD</h2><div class="field"><label>New vendor ETD</label><input type="date" id="vdEtd" value="${o.vendor.etd}" oninput="vdWarn()"></div>
    <div class="field"><label>Reason <i class="req">*</i></label><textarea id="etReason"></textarea></div><div id="vdWarn"></div><button class="btn block" onclick="doEtd()">Save</button>`);
}
function doEtd() {
  if (!f('etReason')) return toast('Give the reason');
  const e = f('vdEtd');
  step(cur.id, (o) => { o.vendor.etd = e; }, `ETD changed to ${dshort(e)} · ${f('etReason')}`, 'ETD changed — consider updating the customer').then((r) => r && closeSheet());
}
function shReceive() {
  const o = getO(), v = o.vendor || {};
  window._rcPh = [];
  openSheet(`<h2>Receive in store</h2>
    <div class="two"><div class="field"><label>Vendor</label><select id="rcVen">${opt(vendors.map((x) => x.name).concat(vendors.some((x) => x.name === v.name) ? [] : [v.name || '']).filter(Boolean), v.name)}</select></div>
    <div class="field"><label>Date</label><input type="date" id="rcDate" value="${today()}"></div></div>
    <div class="two"><div class="field"><label>Vendor invoice / challan no.</label><input id="rcInv" value="${esc(v.ref || '')}"></div>
    <div class="field"><label>Pieces received</label><input id="rcPcs" inputmode="numeric" value="${o.items.reduce((t, it) => t + Math.max(1, num(it.qty)), 0)}"></div></div>
    ${o.items.map((it, i) => `<div class="stone"><b>Item ${i + 1}: ${esc([it.cat, it.product].filter(Boolean).join(' · '))}</b> <span class="hint">ordered ${purShort(it.purity)} · G ${g3(it.gwt)} · N ${g3(it.wt)}</span>
      <div class="three" style="margin-top:8px"><div class="field"><label>Purity</label><select id="rcP${i}">${opt(PURITIES.map((p) => [p[0], purShort(p[0])]), it.purity)}</select></div>
      <div class="field"><label>Gross wt (g)</label><input id="rcG${i}" inputmode="decimal"></div>
      <div class="field"><label>Net wt (g) *</label><input id="rcW${i}" inputmode="decimal"></div></div></div>`).join('')}
    <div class="field"><label>Photos of the piece as received</label><div class="thumbs" id="rcPh"></div></div>
    <div class="field"><label>Deviations from the order</label><textarea id="rcDev"></textarea></div>
    <button class="btn block" onclick="doReceive()">Receive & send to QC</button>`);
  rcPhotos();
}
function rcPhotos() {
  $('rcPh').innerHTML = _rcPh.map((p, k) => `<div class="th"><img src="${esc(imgUrl(p))}" alt=""><button onclick="_rcPh.splice(${k},1);rcPhotos()">✕</button></div>`).join('') +
    '<button class="addPh" onclick="pickPhoto((r)=>{_rcPh.push(r);rcPhotos()},true)">📷<span>Camera</span></button><button class="addPh" onclick="pickPhoto((r)=>{_rcPh.push(r);rcPhotos()},false)">🖼<span>Gallery</span></button>';
}
function doReceive() {
  const o = getO(), wts = {}, gwts = {}, purs = {}, dev = [];
  for (let i = 0; i < o.items.length; i++) {
    const it = o.items[i], w = num(f('rcW' + i));
    if (!(w > 0)) return toast('Enter the net weight of item ' + (i + 1));
    wts[it.id] = w; gwts[it.id] = num(f('rcG' + i)) || null; purs[it.id] = $('rcP' + i).value;
    if (purs[it.id] !== it.purity) dev.push(`Item ${i + 1} received in ${purShort(purs[it.id])}, ordered ${purShort(it.purity)}`);
  }
  const note = [f('rcDev')].concat(dev).filter(Boolean).join('; ');
  step(cur.id, (x) => { x.recv = (x.recv || []).concat([{ vendor: f('rcVen'), date: f('rcDate'), vinv: f('rcInv'), ref: f('rcInv'), wts, gwts, purs, photos: _rcPh.slice(), pcs: num(f('rcPcs')), dev: note }]); x.status = 'received'; },
    'Received in store' + (f('rcInv') ? ' · vendor invoice ' + f('rcInv') : '') + ' · QC pending', 'Received — QC pending').then((r) => r && closeSheet());
}
function shQC() {
  openSheet(`<h2>QC inspection</h2>${QC_CHECKS.map((c, i) => `<label class="check"><input type="checkbox" id="qc${i}" onchange="qcState()"><span>${esc(c)}</span></label>`).join('')}
    <div class="field" style="margin-top:10px"><label>Notes / rejection reason</label><textarea id="qcNote"></textarea></div>
    <div class="actions"><button class="btn danger" onclick="doQC(false)">Reject</button><button class="btn ok" id="qcOk" disabled onclick="doQC(true)">Approve</button></div>
    <p class="hint">Signed as ${esc(me.name)}.</p>`);
}
function qcState() { $('qcOk').disabled = !QC_CHECKS.every((c, i) => $('qc' + i).checked); }
function doQC(ok) {
  if (!ok && !f('qcNote')) return toast('Write the rejection reason');
  const checks = {}; QC_CHECKS.forEach((c, i) => { checks[c] = $('qc' + i).checked; });
  step(cur.id, (o) => { o.qc = (o.qc || []).concat([{ ok, checks, note: f('qcNote') }]); o.status = ok ? 'qc_ok' : 'qc_fail'; }, ok ? 'QC approved' : 'QC rejected · ' + f('qcNote'), ok ? 'QC approved' : 'QC rejected').then((r) => r && closeSheet());
}
function shRework() {
  const q = lastOf(getO().qc);
  openSheet(`<h2>Send for rework</h2><div class="field"><label>Instructions for the vendor</label><textarea id="rwNote">${esc(q ? q.note : '')}</textarea></div>
    <div class="field"><label>New ETD</label><input type="date" id="rwEtd" value="${addWorkDays(today(), 5)}"></div><button class="btn block" onclick="doRework()">Send back to vendor</button>`);
}
function doRework() {
  const e = f('rwEtd');
  step(cur.id, (o) => { o.status = 'rework'; o.vendor.dispAt = null; if (e) o.vendor.etd = e; }, 'Sent for rework · ' + f('rwNote'), 'Sent for rework').then((r) => r && closeSheet());
}
function finalCalc(o, extra, disc) {
  const lock = o.lock === 'full', rates = lock ? o.lockRates : S.rates;
  const rc = lastOf(o.recv) || {}, wts = rc.wts || {}, purs = rc.purs || {};
  const items = o.items.map((it) => Object.assign({}, it, { wt: wts[it.id] || it.wt, gwt: (rc.gwts || {})[it.id] || it.gwt, purity: purs[it.id] || it.purity }));
  const dsc = disc == null ? num(o.disc) : num(disc);
  const b = priceOrder(items, rates, dsc, extra, null, num(S.finalRoundTo) || 100);
  const est = lastOf(o.ests), v = b.total - num(est.total), pct = est.total ? Math.round(v * 10000 / est.total) / 100 : 0;
  const discPct = b.sub ? b.disc * 100 / b.sub : 0;
  return Object.assign(b, { rates: clone(rates), items, discIn: dsc, discNeedsOk: b.disc > 0 && discPct > num(S.discLimit), basis: lock ? 'Gold rate locked at confirmation' : "Today's rate · " + dtt(S.rates.at),
    estTotal: est.total, var: v, varPct: pct, needCust: Math.abs(pct) > num(S.tol) });
}
function shFinal() {
  const o = getO(), last = lastOf(o.finals);
  openSheet(`<h2>Final price</h2><p class="sub">${esc(finalCalc(o, 0).basis)} · actual weights${(lastOf(o.recv) || {}).purs ? ' and purity' : ''} from the receipt · rounded up to ₹${S.finalRoundTo || 100}.</p>
    <div class="two"><div class="field"><label>Additional approved charges ₹</label><input id="fnEx" inputmode="decimal" value="${last ? last.extra || '' : ''}" oninput="fnLive()"></div>
    <div class="field"><label>Discount ₹</label><input id="fnDisc" inputmode="decimal" value="${last ? last.discIn || '' : num(o.disc) || ''}" oninput="fnLive()"></div></div>
    <div class="field"><label>Making charge on the customer card</label><select id="fnMk"><option value="">Default (${esc((MK_SHOW.find((m) => m[0] === (S.mkShow || 'type')) || [])[1] || '')})</option>${opt(MK_SHOW, o.mkShow || '')}</select></div>
    <div id="fnBox"></div>
    <button class="btn block" onclick="doFinal()">Save final price</button>`);
  fnLive();
}
function fnLive() {
  const b = finalCalc(getO(), num(f('fnEx')), f('fnDisc'));
  $('fnBox').innerHTML = breakdownHtml(b, b.items, { label: 'Final price' }) + `<div class="kv"><span>Estimate</span><span>${rupee(b.estTotal)}</span></div>
    <div class="kv"><span>Difference</span><span class="${b.needCust ? 'overdue' : ''}">${b.var >= 0 ? '+' : ''}${rupee(b.var)} (${b.varPct}%)</span></div>
    ${b.discNeedsOk ? `<div class="warnBox">Discount is above the ${S.discLimit}% sales limit — the manager approves it with the final price.</div>` : ''}
    <div class="okBox">Next: send the final price card and ask the customer to reply <b>OK</b>.</div>`;
}
function doFinal() {
  step(cur.id, (o) => { const b = finalCalc(o, num(f('fnEx')), f('fnDisc')); b.v = (o.finals || []).length + 1; b.at = Date.now(); o.finals = (o.finals || []).concat([b]); o.status = 'final'; o.mkShow = $('fnMk').value; },
    'Final price calculated', 'Final price saved — send it to the customer').then((r) => r && closeSheet());
}
function shCustOk() {
  const o = getO(), fin = lastOf(o.finals);
  openSheet(`<h2>Customer's OK</h2><p class="sub">Final price ${rupee(fin.total)} for ${esc(o.cust.name)}.</p>
    <div class="field"><label>How did they confirm? <i class="req">*</i></label><textarea id="coEv" placeholder="e.g. Replied 'OK' on WhatsApp at 11:20"></textarea></div>
    <button class="btn block" onclick="doCustOk()">Record OK</button>`);
}
function doCustOk() {
  if (!f('coEv')) return toast('Note how the customer confirmed');
  step(cur.id, (o) => { lastOf(o.finals).cust = { ev: f('coEv') }; }, 'Customer OK on final price · ' + f('coEv'), 'Customer OK recorded').then((r) => r && closeSheet());
}
function shApproveFinal() {
  const o = getO(), fin = lastOf(o.finals);
  openSheet(`<h2>Approve final price</h2>${breakdownHtml(fin, fin.items, { label: 'Final price' })}
    <div class="kv"><span>Estimate · difference</span><span>${rupee(fin.estTotal)} · ${fin.var >= 0 ? '+' : ''}${fin.varPct}%</span></div>
    <div class="kv"><span>Verified paid · balance</span><span>${rupee(verified(o))} · ${rupee(Math.max(0, fin.total - verified(o)))}</span></div>
    ${fin.discNeedsOk ? `<div class="warnBox">Includes a discount of ${rupee(fin.disc)} above the ${S.discLimit}% sales limit — approving also approves the discount.</div>` : ''}
    ${fin.cust ? `<div class="okBox">Customer OK: ${esc(fin.cust.ev)} · ${esc(fin.cust.by || '')} ${dtt(fin.cust.at)}</div>` : `<div class="badBox">No customer OK yet. Send the final price card and record their reply first.</div>`}
    <div class="actions"><button class="btn secondary" onclick="sendFinal('${o.id}')">Send card</button><button class="btn" ${fin.cust ? '' : 'disabled'} onclick="doApproveFinal()">Approve</button></div>`);
}
function doApproveFinal() {
  step(cur.id, (o) => { o.status = 'final_ok'; }, 'Final price approved' + (lastOf(getO().finals).discNeedsOk ? ' (with discount)' : ''), 'Final price approved').then((r) => r && closeSheet());
}
function shInvoice() {
  const o = getO();
  openSheet(`<h2>ERP invoice</h2><div class="field"><label>Invoice number</label><input id="ivNo" value="${esc((o.inv || {}).no || '')}"></div>
    <div class="field"><label>Invoiced amount ₹</label><input id="ivAmt" inputmode="decimal" value="${(o.inv || {}).amt || lastOf(o.finals).total}"></div><p class="hint">Entered by hand — no ERP connection yet.</p>
    <button class="btn block" onclick="doInvoice()">Save</button>`);
}
function doInvoice() {
  if (!f('ivNo') || !(num(f('ivAmt')) > 0)) return toast('Enter the invoice number and amount');
  step(cur.id, (o) => { o.inv = { no: f('ivNo'), amt: num(f('ivAmt')), at: Date.now(), by: me.name }; }, 'ERP invoice ' + f('ivNo') + ' · ' + rupee2(num(f('ivAmt'))), 'Invoice linked').then((r) => r && closeSheet());
}
function shClose() {
  const o = getO(), gaps = [];
  if (!o.inv) gaps.push('ERP invoice not linked');
  if (o.inv && balance(o) > 1) gaps.push('Balance ' + rupee(balance(o)) + ' not received / verified');
  if ((o.pays || []).some((p) => !p.ok)) gaps.push('Unverified payments');
  openSheet(`<h2>Hand over & close</h2>
    <div class="field"><label>Delivered to</label><input id="hoTo" value="${esc(o.cust.name)}"></div>
    <div class="field"><label>Acknowledgement</label><input id="hoEv" placeholder="Signed receipt, OTP, photo…"></div>
    ${gaps.length ? `<div class="badBox">${gaps.map(esc).join('<br>')}</div>${me.role === 'admin' || can('cancel') ? '<div class="field"><label>Manager exception — reason to close anyway</label><textarea id="hoEx"></textarea></div>' : ''}` : '<div class="okBox">Invoice, payment and handover all in order.</div>'}
    <button class="btn block" onclick="doClose()">Close order</button>`);
}
function doClose() {
  if (!f('hoTo')) return toast('Who collected it?');
  step(cur.id, (o) => { o.handover = { to: f('hoTo'), ev: f('hoEv'), exception: f('hoEx') }; o.status = 'closed'; }, 'Handed over to ' + f('hoTo') + ' · closed', 'Order closed').then((r) => r && closeSheet());
}
function shUpdate() {
  const o = getO();
  const t = `Dear ${o.cust.name}, an update on your Yamie order ${o.ono}: ${stLabel(o.status).toLowerCase()}. Expected delivery ${dt(o.promise)}. Thank you — ${S.shop}`;
  openSheet(`<h2>Update customer</h2><div class="field"><label>Message</label><textarea id="upTx" style="min-height:120px">${esc(t)}</textarea></div><button class="btn block" onclick="doUpdate()">Open WhatsApp</button>`);
}
function doUpdate() { const o = getO(), t = f('upTx'); openWa(o.cust.phone, t); step(o.id, () => {}, 'Shared · customer update'); closeSheet(); }
function shOutcome() {
  const o = getO(), opts = o.ono ? [['hold', 'Put on hold'], ['lost', 'Cancel order']] : [['hold', 'Put on hold'], ['lost', 'Lost / declined']];
  openSheet(`<h2>${o.ono ? 'Hold / cancel order' : 'Hold / mark lost'}</h2><div class="field"><label>Outcome</label><select id="ocT">${opt(opts, 'hold')}</select></div>
    <div class="field"><label>Reason <i class="req">*</i></label><textarea id="ocR"></textarea></div>
    ${o.ono && verified(o) > 0 ? `<div class="warnBox">${rupee(verified(o))} has been paid. Refund or adjust it and record that under Payments.</div>` : ''}
    <button class="btn block danger" onclick="doOutcome()">Save</button>`);
}
function doOutcome() {
  if (!f('ocR')) return toast('Give the reason');
  const t = f('ocT');
  step(cur.id, (o) => { o.outcome = { reason: f('ocR') }; o.status = t; }, (t === 'hold' ? 'On hold · ' : 'Lost / cancelled · ') + f('ocR'), 'Saved').then((r) => r && closeSheet());
}

function shMkShow() {
  const o = getO();
  openSheet(`<h2>Making charge on customer cards</h2><p class="sub">For this ${o.ono ? 'order' : 'estimate'} only. Default: ${esc((MK_SHOW.find((m) => m[0] === (S.mkShow || 'type')) || [])[1] || '')}.</p>
    ${MK_SHOW.map(([k, l]) => `<button class="btn ${mkShowOf(o) === k ? '' : 'secondary'} block" style="margin-bottom:8px" onclick="step(cur.id,(x)=>{x.mkShow='${k}'},'Making on card: ${esc(l)}','Saved').then((r)=>r&&closeSheet())">${esc(l)}</button>`).join('')}`);
}
