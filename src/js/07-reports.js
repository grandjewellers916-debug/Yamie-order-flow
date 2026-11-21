// ======================================================================
// Reports. Each enquiry is one record that may become one order, so a quote
// and its order are never counted twice. Invoiced sales is a separate figure.
// ======================================================================
const rp = { k: 'month' };
function rRange() {
  const t = new Date(), to = today();
  const from = rp.k === 'today' ? to : rp.k === 'week' ? ymd(new Date(t - 6 * 864e5)) : rp.k === 'month' ? to.slice(0, 8) + '01' : rp.k === '90' ? ymd(new Date(t - 89 * 864e5)) : '2000-01-01';
  return [from, to];
}
function renderReports() {
  if (!can('reports')) { $('vReports').innerHTML = '<div class="empty"><b>🔒</b>Your role has no access to reports.</div>'; return; }
  const [from, to] = rRange(), inR = (t) => t && ymd(t) >= from && ymd(t) <= to;
  const made = orders.filter((o) => inR(o.createdAt));
  const quoted = made.filter((o) => o.ests && o.ests.length);
  const conv = made.filter((o) => o.ono);
  const confirmed = orders.filter((o) => inR(o.confirmedAt) && o.status !== 'lost');
  const confVal = confirmed.reduce((t, o) => t + num(lastOf(o.ests).total), 0);
  const invoiced = orders.filter((o) => o.inv && inR(o.inv.at));
  const invVal = invoiced.reduce((t, o) => t + num(o.inv.amt), 0);
  const open = orders.filter((o) => ['ord', 'ready'].includes(stage(o)) && o.status !== 'hold');
  const advHeld = open.reduce((t, o) => t + verified(o), 0);
  const balDue = orders.filter((o) => stage(o) === 'ready').reduce((t, o) => t + balance(o), 0);
  const qcRej = orders.reduce((t, o) => t + (o.qc || []).filter((q) => !q.ok && inR(q.at)).length, 0);
  const avgQ = quoted.length ? quoted.reduce((t, o) => t + num(lastOf(o.ests).total), 0) / quoted.length : 0;
  const byStatus = {}; orders.forEach((o) => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });
  const maxS = Math.max(1, ...Object.values(byStatus));
  const vend = {}; open.filter((o) => o.vendor).forEach((o) => { const v = vend[o.vendor.name] = vend[o.vendor.name] || { act: 0, late: 0, days: [] }; v.act++; if (isOverdue(o)) v.late++; });
  orders.filter((o) => o.vendor && o.vendor.sentAt && (o.recv || []).length).forEach((o) => { const v = vend[o.vendor.name] = vend[o.vendor.name] || { act: 0, late: 0, days: [] }; v.days.push((o.recv[0].at - o.vendor.sentAt) / 864e5); });
  const byStaff = {}; made.forEach((o) => { const s = byStaff[o.createdBy] = byStaff[o.createdBy] || { n: 0, c: 0, v: 0 }; s.n++; if (o.ono) { s.c++; s.v += num(lastOf(o.ests).total); } });
  const byPur = {}; confirmed.forEach((o) => lastOf(o.ests).lines.forEach((l) => { byPur[l.purity] = (byPur[l.purity] || 0) + l.sub; }));
  let margin = '';
  if (can('viewcost')) {
    const withCost = invoiced.filter((o) => o.vendor && o.vendor.cost);
    const m = withCost.reduce((t, o) => t + num(o.inv.amt) - num((lastOf(o.finals) || {}).gst) - num(o.vendor.cost), 0);
    margin = `<div class="kv"><span>Gross margin excl. GST (${withCost.length} of ${invoiced.length} invoiced have vendor cost)</span><span>${rupee(m)}</span></div>`;
  }
  $('vReports').innerHTML = `
    <p class="kicker">Reports</p><h1 class="h1">${dt(from)} – ${dt(to)}</h1>
    <div class="filters">${[['today', 'Today'], ['week', '7 days'], ['month', 'This month'], ['90', '90 days'], ['all', 'All time']].map(([k, l]) => `<button class="chip ${rp.k === k ? 'active' : ''}" onclick="rp.k='${k}';renderReports()">${l}</button>`).join('')}</div>
    <div class="stats"><div class="stat"><b>${made.length}</b><span>ENQUIRIES</span></div><div class="stat"><b>${made.length ? Math.round(conv.length * 100 / made.length) : 0}%</b><span>CONVERTED</span></div>
      <div class="stat"><b>${confirmed.length}</b><span>ORDERS</span></div><div class="stat ${orders.filter(isOverdue).length ? 'red' : ''}"><b>${orders.filter(isOverdue).length}</b><span>OVERDUE</span></div></div>
    <div class="homeGrid"><div>
    <div class="card"><h3>Money</h3>
      <div class="kv"><span>Confirmed order value</span><span><b>${rupee(confVal)}</b></span></div>
      <div class="kv"><span>Average estimate</span><span>${rupee(avgQ)}</span></div>
      <div class="kv"><span>Invoiced sales (separate figure)</span><span>${rupee(invVal)}</span></div>
      <div class="kv"><span>Advances held on open orders</span><span>${rupee(advHeld)}</span></div>
      <div class="kv"><span>Balance due on ready orders</span><span>${rupee(balDue)}</span></div>
      <div class="kv"><span>QC rejections</span><span>${qcRej}</span></div>${margin}</div>
    <div class="card"><h3>Orders by stage</h3>${Object.keys(ST).filter((k) => byStatus[k]).map((k) => `<div class="kv"><span>${esc(stLabel(k))}</span><span>${byStatus[k]}</span></div><div class="bar"><i style="width:${byStatus[k] * 100 / maxS}%"></i></div>`).join('') || '<p class="hint">No records.</p>'}</div>
    </div><div>
    <div class="card"><h3>Vendors</h3>${Object.keys(vend).map((v) => { const x = vend[v]; return `<div class="kv"><span>${esc(v)}</span><span>${x.act} active · <b class="${x.late ? 'overdue' : ''}">${x.late} late</b>${x.days.length ? ' · avg ' + Math.round(x.days.reduce((a, b) => a + b, 0) / x.days.length) + ' days' : ''}</span></div>`; }).join('') || '<p class="hint">No vendor work.</p>'}</div>
    <div class="card"><h3>Staff</h3>${Object.keys(byStaff).map((s) => `<div class="kv"><span>${esc(s)}</span><span>${byStaff[s].n} enquiries · ${byStaff[s].c} orders · ${rupee(byStaff[s].v)}</span></div>`).join('') || '<p class="hint">—</p>'}</div>
    <div class="card"><h3>Confirmed value by purity</h3>${Object.keys(byPur).map((p) => `<div class="kv"><span>${purLabel(p)}</span><span>${rupee(byPur[p])}</span></div>`).join('') || '<p class="hint">—</p>'}</div>
    <div class="card"><h3>Overdue</h3>${orders.filter(isOverdue).map(rowHtml).join('') || '<p class="hint">None.</p>'}</div>
    </div></div>
    <button class="btn block" onclick="exportCsv()">Export CSV (Excel)</button>`;
}
function exportCsv() {
  const q = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const head = ['Order no', 'Estimate no', 'Customer', 'WhatsApp', 'Source', 'Status', 'Created', 'Created by', 'Confirmed', 'Promised', 'Items', 'Estimate total', 'Final total', 'Verified paid', 'Balance', 'Vendor', 'ETD', 'Invoice', 'Invoiced'];
  if (can('viewcost')) head.push('Vendor cost');
  const rows = orders.map((o) => {
    const r = [o.ono, o.estNo, o.cust.name, o.cust.phone, o.cust.src, stLabel(o.status), ymd(o.createdAt), o.createdBy, o.confirmedAt ? ymd(o.confirmedAt) : '', o.promise,
      itemsText(o), (lastOf(o.ests) || {}).total, (lastOf(o.finals) || {}).total, verified(o), balance(o), (o.vendor || {}).name, (o.vendor || {}).etd, (o.inv || {}).no, (o.inv || {}).amt];
    if (can('viewcost')) r.push((o.vendor || {}).cost);
    return r.map(q).join(',');
  });
  saveText(`yamie-orders-${today()}.csv`, 'text/csv', '﻿' + [head.map(q).join(',')].concat(rows).join('\n'));
}
function saveText(name, mime, text) {
  if (NATIVE && NATIVE.saveFile) { try { NATIVE.saveFile(name, mime, btoa(unescape(encodeURIComponent(text)))); return; } catch (e) { /* fall through */ } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; a.click();
}
