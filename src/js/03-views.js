// ======================================================================
// Status model, navigation, home dashboard, order list, tasks
// ======================================================================
const ST = {
  enquiry: ['Enquiry · draft', 'p-enq', 'enq'], estimate: ['Estimate sent', 'p-est', 'enq'], approved: ['Approved · take advance', 'p-est', 'enq'],
  confirmed: ['Order confirmed', 'p-ord', 'ord'], vendor: ['With vendor', 'p-ord', 'ord'], production: ['In production', 'p-ord', 'ord'],
  received: ['Received · QC pending', 'p-qc', 'ord'], qc_fail: ['QC rejected', 'p-bad', 'ord'], rework: ['Rework at vendor', 'p-bad', 'ord'],
  qc_ok: ['QC passed', 'p-qc', 'ord'], final: ['Final price · approve', 'p-qc', 'ord'], final_ok: ['Final price approved', 'p-qc', 'ord'],
  ready: ['Ready · customer told', 'p-ready', 'ready'], closed: ['Closed', 'p-done', 'closed'], hold: ['On hold', 'p-done', 'enq'], lost: ['Lost / cancelled', 'p-done', 'lost'],
};
const stLabel = (s) => (ST[s] || [s])[0];
const stage = (o) => (o.status === 'hold' ? (o.ono ? 'ord' : 'enq') : (ST[o.status] || [0, 0, 'enq'])[2]);
const pill = (o) => `<span class="pill ${(ST[o.status] || [0, 'p-enq'])[1]}">${esc(stLabel(o.status))}</span>`;
const refOf = (o) => o.ono || o.estNo || 'Draft ' + o.id.slice(-4);
const orderValue = (o) => (o.inv ? num(o.inv.amt) : lastOf(o.finals) ? num(lastOf(o.finals).total) : lastOf(o.ests) ? num(lastOf(o.ests).total) : 0);
const verified = (o, kind) => (o.pays || []).filter((p) => p.ok && (!kind || p.kind === kind)).reduce((t, p) => t + (p.kind === 'refund' ? -num(p.amt) : num(p.amt)), 0);
const balance = (o) => Math.max(0, orderValue(o) - verified(o));
function isOverdue(o) {
  if (stage(o) !== 'ord' || o.status === 'hold') return false;
  const t = today();
  if (o.promise && t > o.promise) return true;
  const v = o.vendor;
  return !!(v && v.etd && t > v.etd && ['vendor', 'production', 'rework'].includes(o.status));
}
const itemsText = (o) => (o.items || []).map((it) => `${num(it.qty) > 1 ? it.qty + '× ' : ''}${it.product || it.cat || 'Item'} ${purShort(it.purity)}`).join(', ') || 'No items yet';
const firstPhoto = (o) => { for (const it of o.items || []) if ((it.photos || [])[0]) return it.photos[0]; return ''; };

// ---------------- navigation ----------------
const cur = { view: 'vHome', id: null, filter: 'all', q: '', tab: 'next', step: 0 };
function go(v) {
  cur.view = v;
  const desk = document.body.classList.contains('desk');
  const split = desk && (v === 'vOrders' || v === 'vDetail');
  $('main').classList.toggle('split', split);
  document.querySelectorAll('.view').forEach((el) => el.classList.toggle('active', el.id === v));
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('on', b.dataset.v === v || (v === 'vDetail' && b.dataset.v === 'vOrders') || (v === 'vSub' && b.dataset.v === 'vMore')));
  render(v);
  if (split) render(v === 'vOrders' ? 'vDetail' : 'vOrders');
  window.scrollTo(0, 0);
}
function render(v) {
  if (!me) return;
  ({ vHome: renderHome, vOrders: renderList, vDetail: renderDetail, vNew: renderWizard, vReports: renderReports, vMore: renderMore, vSub: renderSub })[v]();
  updateBell();
}
function refresh() {
  if (!me) return;
  const a = document.querySelector('.view.active');
  if (!a || a.id === 'vNew') { updateBell(); return; }    // never redraw the form being typed in
  if ($('sheetBg').classList.contains('on')) { updateBell(); return; }
  render(a.id);
  if ($('main').classList.contains('split')) render(a.id === 'vOrders' ? 'vDetail' : 'vOrders');
  syncNative();
}
window.onNativeBack = function () {
  if ($('sheetBg').classList.contains('on')) { closeSheet(); return true; }
  if (!me) return false;
  if (cur.view === 'vNew') { if (wiz.step > 0) { wizGo(wiz.step - 1); return true; } go(wiz.id ? 'vDetail' : 'vHome'); return true; }
  if (cur.view === 'vSub') { go('vMore'); return true; }
  if (cur.view === 'vDetail') { go('vOrders'); return true; }
  if (cur.view !== 'vHome') { go('vHome'); return true; }
  return false;
};
let pendingOpen = null;
window.onNativeOpen = function (id) { if (me && orders.find((o) => o.id === id)) openOrder(id); else pendingOpen = id; return true; };
function openOrder(id) { cur.id = id; cur.tab = 'next'; go('vDetail'); }

// ---------------- tasks / reminders ----------------
function tasksFor(o) {
  const t = reviewTasks(o), now = Date.now(), dayMs = 864e5, est = lastOf(o.ests), fin = lastOf(o.finals);
  const on = remOn, n = remN;
  if (o.status === 'estimate' && est && on('estFollow') && now - est.at > n('estFollow') * dayMs) t.push(['Follow up estimate · no reply in ' + Math.floor((now - est.at) / dayMs) + ' days', 'w', est.at + n('estFollow') * dayMs]);
  if (['estimate', 'approved'].includes(o.status) && est && est.valid && on('estExpiry')) { const v = new Date(est.valid + 'T18:00:00').getTime(); if (today() > est.valid) t.push(['Estimate expired ' + dshort(est.valid) + ' · re-issue at today\'s rates', 'r', v]); else if (v - now < n('estExpiry') * dayMs) t.push(['Estimate valid till ' + dshort(est.valid), 'w', v - n('estExpiry') * dayMs]); }
  const apAt = o.approval ? o.approval.at : now;
  if (o.status === 'approved' && on('advance') && verified(o, 'advance') < num(est && est.minAdv) && now >= apAt + n('advance') * dayMs) t.push(['Take advance (min ' + rupee(est && est.minAdv) + ')', 'w', apAt + n('advance') * dayMs]);
  if (on('verify') && can('verify') && (o.pays || []).some((p) => !p.ok)) t.push(['Verify payment', 'r', now]);
  if (on('confirm') && o.status === 'approved' && verified(o, 'advance') >= num(est && est.minAdv) && can('confirm')) t.push(['Advance verified · confirm the order', 'g', now]);
  if (on('assignVendor') && o.status === 'confirmed' && now >= (o.confirmedAt || 0) + n('assignVendor') * dayMs) t.push(['Assign vendor', 'w', (o.confirmedAt || now) + n('assignVendor') * dayMs]);
  if (on('workOrder') && o.status === 'vendor' && !o.vendor.sentAt) t.push(['Send work order to ' + o.vendor.name, 'w', now]);
  if (['vendor', 'production', 'rework'].includes(o.status) && o.vendor && o.vendor.etd) {
    const etd = new Date(o.vendor.etd + 'T10:00:00').getTime();
    if (today() > o.vendor.etd) { if (on('etdPassed')) t.push(['Vendor ETD passed (' + dshort(o.vendor.etd) + ') · follow up', 'r', etd]); }
    else if (on('etdWarn') && etd - now < n('etdWarn') * dayMs) t.push(['Vendor ETD ' + dshort(o.vendor.etd) + ' · check progress', 'w', etd - n('etdWarn') * dayMs]);
  }
  const fu = lastOf(o.fu);
  if (on('vendorFollow') && fu && fu.next && fu.next <= today() && stage(o) === 'ord' && ['vendor', 'production', 'rework'].includes(o.status)) t.push(['Vendor follow-up due', 'w', new Date(fu.next + 'T10:00:00').getTime()]);
  if (on('qc')) { if (o.status === 'received') t.push(['QC inspection pending', 'w', now]); if (o.status === 'qc_fail') t.push(['QC rejected · send for rework', 'r', now]); }
  if (on('finalCalc')) { if (o.status === 'qc_ok') t.push(['Calculate final price', 'w', now]); if (o.status === 'final' && fin && fin.cust) t.push(['Final price to approve', 'w', now]); }
  if (on('custOk') && o.status === 'final' && fin && !fin.cust) { const at = (fin.at || now) + n('custOk') * dayMs; t.push([now >= at ? 'No customer OK on final price · follow up' : 'Waiting for customer OK on final price', now >= at ? 'r' : 'w', at]); }
  if (on('ready') && o.status === 'final_ok') t.push(['Tell the customer: ready', 'g', now]);
  if (on('collect') && o.status === 'ready' && o.readyAt && now - o.readyAt > n('collect') * dayMs) t.push(['Not collected for ' + Math.floor((now - o.readyAt) / dayMs) + ' days', 'r', o.readyAt + n('collect') * dayMs]);
  if (on('promise') && o.promise && stage(o) === 'ord' && today() > o.promise) t.push(['Promised delivery passed (' + dshort(o.promise) + ')', 'r', new Date(o.promise + 'T10:00:00').getTime()]);
  return t;
}
function allTasks() {
  const out = [];
  orders.forEach((o) => tasksFor(o).forEach((x) => out.push({ o, text: x[0], c: x[1], at: x[2] })));
  return out.sort((a, b) => (a.c === 'r' ? 0 : 1) - (b.c === 'r' ? 0 : 1) || a.at - b.at);
}
function updateBell() { const n = me ? allTasks().length : 0; const el = $('bellN'); if (!el) return; el.hidden = !n; el.textContent = n; }
function syncNative() {
  if (!NATIVE || !NATIVE.setReminders || !me) return;
  const it = [];
  orders.forEach((o) => tasksFor(o).forEach((x) => it.push({ key: o.id + ':' + x[0].split(' · ')[0], job: o.id, at: x[2] || Date.now(), title: x[0], body: `${refOf(o)} · ${(o.cust || {}).name || ''} · ${itemsText(o)}` })));
  try { NATIVE.setReminders(JSON.stringify(it)); } catch (e) { /* older APK */ }
}

// ---------------- home ----------------
function renderHome() {
  const enq = orders.filter((o) => stage(o) === 'enq').length, act = orders.filter((o) => stage(o) === 'ord').length;
  const rdy = orders.filter((o) => stage(o) === 'ready').length, od = orders.filter(isOverdue).length;
  const tasks = allTasks();
  const r = S.rates || {};
  $('vHome').innerHTML = `
    <p class="kicker">${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    <h1 class="h1">Hello ${esc((me.name || '').split(' ')[0])}</h1>
    <p class="sub">Gold 22K ${rupee(r.k22)} · 18K ${rupee(r.k18)} · 14K ${rupee(r.k14)}${r.at ? ' · ' + (r.src === 'kiosk' ? 'kiosk' : 'typed') + ' ' + ago(r.at) : ' · <b class="overdue">rates not set</b>'}</p>
    <div class="stats">
      <div class="stat" onclick="cur.filter='enq';go('vOrders')"><b>${enq}</b><span>ENQUIRIES</span></div>
      <div class="stat" onclick="cur.filter='ord';go('vOrders')"><b>${act}</b><span>ACTIVE</span></div>
      <div class="stat green" onclick="cur.filter='ready';go('vOrders')"><b>${rdy}</b><span>READY</span></div>
      <div class="stat ${od ? 'red' : ''}" onclick="cur.filter='overdue';go('vOrders')"><b>${od}</b><span>OVERDUE</span></div>
    </div>
    <div class="homeGrid">
      <div class="card"><h3>To do <span class="badge">${tasks.length}</span></h3>
        ${tasks.length ? tasks.slice(0, 30).map((t) => `<div class="task" onclick="openOrder('${t.o.id}')"><i class="${t.c === 'r' ? 'r' : t.c === 'g' ? 'g' : ''}"></i><div><b>${esc(t.text)}</b><small>${esc(refOf(t.o))} · ${esc((t.o.cust || {}).name)} · ${esc(itemsText(t.o))}</small></div></div>`).join('') : '<div class="empty"><b>✓</b>Nothing waiting.</div>'}
      </div>
      <div>
        <div class="actions" style="margin:0 0 12px">${can('enquiry') ? '<button class="btn" onclick="newEnquiry()">+ New enquiry</button>' : ''}
          <button class="btn secondary" onclick="openLink('priceCheckUrl')">Price Check</button><button class="btn secondary" onclick="openLink('repairUrl')">Repair Desk</button></div>
        <div class="card"><h3>Recent</h3>${orders.slice(0, 8).map(rowHtml).join('') || '<div class="empty">No enquiries yet.</div>'}</div>
      </div>
    </div>`;
}
function openLink(k) {
  const u = S[k]; if (!u) return toast('Set the link in Settings');
  if (NATIVE && NATIVE.openUrl) NATIVE.openUrl(u); else window.open(u, '_blank', 'noopener');
}

// ---------------- list ----------------
const FILTERS = [['all', 'All open'], ['enq', 'Enquiries'], ['estimate', 'Awaiting approval'], ['approved', 'Advance / confirm'], ['ord', 'In progress'],
  ['vendorq', 'With vendor'], ['qcq', 'QC & final price'], ['ready', 'Ready'], ['overdue', 'Overdue'], ['mine', 'Mine'], ['pc', 'From Price Check'], ['closed', 'Closed'], ['lost', 'Lost / hold']];
function passFilter(o, f) {
  const s = stage(o);
  switch (f) {
    case 'all': return s !== 'closed' && s !== 'lost' && o.status !== 'hold';
    case 'enq': return s === 'enq' && o.status !== 'hold';
    case 'estimate': return o.status === 'estimate';
    case 'approved': return o.status === 'approved';
    case 'ord': return s === 'ord' && o.status !== 'hold';
    case 'vendorq': return ['vendor', 'production', 'rework'].includes(o.status);
    case 'qcq': return ['received', 'qc_fail', 'qc_ok', 'final', 'final_ok'].includes(o.status);
    case 'ready': return s === 'ready';
    case 'overdue': return isOverdue(o);
    case 'pc': return !!o.fromPc && s !== 'closed' && s !== 'lost';
    case 'mine': return o.createdBy === me.name && s !== 'closed' && s !== 'lost';
    case 'closed': return s === 'closed';
    case 'lost': return s === 'lost' || o.status === 'hold';
  }
  return true;
}
function rowHtml(o) {
  const ph = firstPhoto(o), c = o.cust || {};
  return `<button class="row ${cur.id === o.id && cur.view === 'vDetail' ? 'sel' : ''}" onclick="openOrder('${o.id}')">
    ${ph ? `<img src="${esc(imgUrl(ph))}" loading="lazy" alt="">` : `<div class="ph">${esc((c.name || '?')[0].toUpperCase())}</div>`}
    <div class="rt"><strong>${esc(c.name || '—')}</strong><small>${esc(refOf(o))} · ${esc(itemsText(o))}</small>
    <small class="${isOverdue(o) ? 'overdue' : ''}">${o.promise && stage(o) === 'ord' ? 'Due ' + dshort(o.promise) : 'Updated ' + ago(o.updatedAt || o.createdAt)}</small></div>
    <div class="rr"><b>${orderValue(o) ? rupee(orderValue(o)) : ''}</b>${pill(o)}</div></button>`;
}
function renderList() {
  const q = cur.q.trim().toLowerCase();
  const list = orders.filter((o) => passFilter(o, cur.filter)).filter((o) => !q || [refOf(o), o.estNo, o.ono, (o.cust || {}).name, (o.cust || {}).phone, itemsText(o)]
    .concat((o.items || []).map((it) => it.designNo + ' ' + it.model)).join(' ').toLowerCase().includes(q));
  if (cur.filter === 'ord' || cur.filter === 'overdue') list.sort((a, b) => (a.promise || '9') < (b.promise || '9') ? -1 : 1);
  const count = (f) => orders.filter((o) => passFilter(o, f)).length;
  $('vOrders').innerHTML = `
    <input class="search" id="q" placeholder="Search name, phone, EST / YOR no., design no." value="${esc(cur.q)}" oninput="cur.q=this.value;renderListBody()">
    <div class="filters">${FILTERS.map(([k, l]) => `<button class="chip ${cur.filter === k ? 'active' : ''}" onclick="cur.filter='${k}';renderList()">${l}<em>${count(k)}</em></button>`).join('')}</div>
    <div id="listBody"></div>`;
  renderListBody(list);
}
function renderListBody(list) {
  if (!list) {
    const q = cur.q.trim().toLowerCase();
    list = orders.filter((o) => passFilter(o, cur.filter)).filter((o) => !q || [refOf(o), (o.cust || {}).name, (o.cust || {}).phone, itemsText(o)].concat((o.items || []).map((it) => it.designNo + ' ' + it.model)).join(' ').toLowerCase().includes(q));
  }
  $('listBody').innerHTML = list.length ? list.map(rowHtml).join('') : `<div class="empty"><b>∅</b>Nothing here.${can('enquiry') ? '<br><br><button class="btn small" onclick="newEnquiry()">+ New enquiry</button>' : ''}</div>`;
}
