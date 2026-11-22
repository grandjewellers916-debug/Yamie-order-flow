// ======================================================================
// Reminders (all customisable) and review requests to Owner / Design desk
// ======================================================================
// [key, label, unit ('days' | 'hours' | ''), default number, default on, old settings key]
const REMS = [
  ['fromPc', 'New enquiry sent from Price Check', '', 0, true],
  ['review', 'Review request waiting — reviewer reminder (red after)', 'hours', 4, true],
  ['reviewAns', 'Review answered — tell the person who asked', '', 0, true],
  ['estFollow', 'Follow up estimate with no reply after', 'days', 2, true, 'approveDays'],
  ['estExpiry', 'Estimate validity ends within', 'days', 1, true],
  ['advance', 'Take advance after approval within', 'days', 0, true],
  ['verify', 'Payments to verify', '', 0, true],
  ['confirm', 'Advance verified — confirm the order', '', 0, true],
  ['assignVendor', 'Assign vendor after confirmation within', 'days', 0, true],
  ['workOrder', 'Send work order to vendor', '', 0, true],
  ['etdWarn', 'Warn before vendor ETD', 'days', 2, true, 'etdWarnDays'],
  ['etdPassed', 'Vendor ETD passed', '', 0, true],
  ['vendorFollow', 'Vendor follow-up due', '', 0, true],
  ['qc', 'QC inspection pending', '', 0, true],
  ['finalCalc', 'Calculate / approve final price', '', 0, true],
  ['custOk', 'No customer OK on final price after', 'days', 1, true],
  ['ready', 'Tell the customer the order is ready', '', 0, true],
  ['collect', 'Not collected warning after', 'days', 7, true, 'collectDays'],
  ['promise', 'Promised delivery date passed', '', 0, true],
];
function remCfg(k) {
  const d = REMS.find((r) => r[0] === k) || [k, '', '', 0, true];
  const c = (S.rem || {})[k] || {};
  return { on: c.on == null ? d[4] : !!c.on, n: c.n == null || c.n === '' ? (d[5] && S[d[5]] != null ? num(S[d[5]]) : d[3]) : num(c.n) };
}
const remOn = (k) => remCfg(k).on;
const remN = (k) => remCfg(k).n;

function subRem() {
  $('subBody').innerHTML = `<div class="card"><h3>Reminders</h3><p class="sub">Each reminder shows in To do, on the bell, and as a phone notification in the app. Switch off what you don't need and set the timing.</p>
    ${REMS.map(([k, l, u]) => { const c = remCfg(k); return `<div class="pay"><label class="check" style="margin:0;flex:1"><input type="checkbox" id="rm_on_${k}" ${c.on ? 'checked' : ''}><span>${esc(l)}</span></label>
      ${u ? `<span style="display:flex;align-items:center;gap:6px"><input id="rm_n_${k}" inputmode="decimal" value="${c.n}" style="width:64px"> <small>${u}</small></span>` : ''}</div>`; }).join('')}
    <div class="actions"><button class="btn" onclick="saveRem()">Save reminders</button></div></div>`;
}
function saveRem() {
  const st = clone(S); st.rem = {};
  REMS.forEach(([k, , u, , , old]) => { st.rem[k] = { on: $('rm_on_' + k).checked }; if (u) { st.rem[k].n = num($('rm_n_' + k).value); if (old) st[old] = st.rem[k].n; } });
  cfgCall('settings', { settings: st }, 'Reminders saved');
}

// ---------------- review requests ----------------
const desks = () => (S.reviewDesks && S.reviewDesks.length ? S.reviewDesks : DEF_SETTINGS.reviewDesks);
const deskOf = (name) => desks().find((d) => d.name === name) || { name, users: [] };
/** Is the logged-in user one of the reviewers for this desk? (No names set = all admins.) */
const onDesk = (name) => { const d = deskOf(name); return d.users && d.users.length ? d.users.includes(me.name) : me.role === 'admin'; };
const canAnswer = (rv) => onDesk(rv.desk) || can('review') || me.role === 'admin';
const openReviews = (o) => (o.reviews || []).filter((r) => !r.ans);

function reviewTasks(o) {
  const t = [], now = Date.now();
  if (o.fromPc && !o.fromPc.seen && o.status === 'enquiry' && remOn('fromPc')) t.push([`New from Price Check (${o.fromPc.by}) · check items & price`, 'g', o.fromPc.at]);
  (o.reviews || []).forEach((rv) => {
    if (!rv.ans) {
      if (remOn('review') && onDesk(rv.desk)) t.push([`Review for ${rv.desk}: ${rv.topics.join(', ')}${rv.note ? ' — ' + rv.note.slice(0, 60) : ''}`, now - rv.at > remN('review') * 36e5 ? 'r' : 'w', rv.at]);
      else if (rv.by === me.name) t.push([`Waiting for ${rv.desk} review (${rv.topics.join(', ')})`, '', rv.at + remN('review') * 36e5]);
    } else if (remOn('reviewAns') && rv.by === me.name && !rv.ans.seen) t.push([`${rv.ans.by} answered your review: ${rv.ans.note.slice(0, 70)}`, 'g', rv.ans.at]);
  });
  return t;
}

function shReview(itemIdx) {
  const o = getO(); if (!o) return;
  window._rvT = [];
  openSheet(`<h2>Ask for review</h2><p class="sub">Not sure about the price or the design? Send it to the Owner or the Design desk. They get a reminder and can edit the items and price.</p>
    <div class="field"><label>Send to</label><select id="rvDesk">${opt(desks().map((d) => d.name), desks()[0].name)}</select></div>
    <div class="field"><label>About <i class="req">*</i></label><div class="choiceRow">${(S.reviewTopics || []).map((x) => `<button class="chip" onclick='this.classList.toggle("active");_rvT=_rvT.includes(${esc(JSON.stringify(x))})?_rvT.filter(y=>y!==${esc(JSON.stringify(x))}):_rvT.concat(${esc(JSON.stringify(x))})'>${esc(x)}</button>`).join('')}</div></div>
    ${o.items.length > 1 ? `<div class="field"><label>Item</label><select id="rvItem"><option value="">All items</option>${o.items.map((it, i) => `<option value="${i}" ${itemIdx === i ? 'selected' : ''}>${i + 1}. ${esc(it.product || it.cat)}</option>`).join('')}</select></div>` : ''}
    <div class="field"><label>Question / what you are unsure about <i class="req">*</i></label><textarea id="rvNote" placeholder="e.g. Customer wants a thinner shank — is 14% VA right? Which setting suits a 0.5 ct oval?"></textarea></div>
    <button class="btn block" onclick="doReview()">Send for review</button>`);
}
function doReview() {
  if (!_rvT.length) return toast('Choose what the review is about');
  if (!f('rvNote')) return toast('Write the question');
  const desk = $('rvDesk').value, it = $('rvItem') ? $('rvItem').value : '';
  step(cur.id, (o) => { o.reviews = (o.reviews || []).concat([{ id: uid(), desk, topics: _rvT.slice(), item: it === '' ? null : num(it), note: f('rvNote'), by: me.name, at: Date.now(), ans: null }]); },
    `Review asked · ${desk} · ${_rvT.join(', ')}`, 'Sent for review to ' + desk).then((r) => r && closeSheet());
}
function shAnswer(rid) {
  const o = getO(), rv = (o.reviews || []).find((r) => r.id === rid); if (!rv) return;
  openSheet(`<h2>Review · ${esc(rv.topics.join(', '))}</h2><p class="sub">Asked by ${esc(rv.by)} · ${dtt(rv.at)} · to ${esc(rv.desk)}${rv.item != null && o.items[rv.item] ? ' · item ' + (rv.item + 1) + ' ' + esc(o.items[rv.item].product) : ''}</p>
    <div class="warnBox">${esc(rv.note)}</div>
    ${EDITABLE.includes(o.status) || me.role === 'admin' ? `<button class="btn soft block" style="margin:10px 0" onclick="closeSheet();editOrder('${o.id}',1)">Edit items & making / price</button>` : ''}
    <div class="field"><label>Your answer <i class="req">*</i></label><textarea id="rvAns" placeholder="e.g. Use 16% VA and prong setting — I updated item 1."></textarea></div>
    <button class="btn block" onclick="doAnswer('${rid}')">Send answer</button>`);
}
function doAnswer(rid) {
  if (!f('rvAns')) return toast('Write the answer');
  step(cur.id, (o) => { const rv = o.reviews.find((r) => r.id === rid); rv.ans = { by: me.name, at: Date.now(), note: f('rvAns'), seen: false }; }, 'Review answered · ' + f('rvAns'), 'Answer sent').then((r) => r && closeSheet());
}
function seenAnswer(rid) { step(cur.id, (o) => { const rv = o.reviews.find((r) => r.id === rid); if (rv && rv.ans) rv.ans.seen = true; }, '', 'Noted'); }
function reviewCard(o) {
  const list = o.reviews || []; if (!list.length) return '';
  return `<div class="card"><h3>Reviews <span class="badge">${openReviews(o).length} open</span></h3>${list.slice().reverse().map((rv) => `<div class="pay" style="align-items:flex-start"><div style="flex:1"><b>${esc(rv.topics.join(', '))} → ${esc(rv.desk)}</b><small>${esc(rv.by)} · ${dtt(rv.at)}${rv.item != null && o.items[rv.item] ? ' · item ' + (rv.item + 1) : ''}</small><div>${esc(rv.note)}</div>
    ${rv.ans ? `<div class="okBox" style="margin-top:6px"><b>${esc(rv.ans.by)}:</b> ${esc(rv.ans.note)} <small>${dtt(rv.ans.at)}</small></div>` : ''}</div>
    ${!rv.ans && canAnswer(rv) ? `<button class="btn small" onclick="shAnswer('${rv.id}')">Answer</button>` : rv.ans && rv.by === me.name && !rv.ans.seen ? `<button class="btn small soft" onclick="seenAnswer('${rv.id}')">Got it</button>` : ''}</div>`).join('')}</div>`;
}

// ---------------- review settings (desks, reviewers, topics) ----------------
let _dk = [], _tp = [];
function subReviewCfg() {
  _dk = clone(desks()); _tp = (S.reviewTopics || []).slice();
  $('subBody').innerHTML = `<div class="card"><h3>Review desks</h3><p class="sub">Staff send pricing / design questions to a desk. The people ticked get the reminder and can answer. No one ticked = all admins.</p><div id="dkList"></div>
    <button class="btn soft block" onclick="_dk.push({name:'',users:[]});dkList()">+ Add desk</button></div>
    <div class="card"><h3>Topics</h3><div class="choiceRow" id="tpList"></div><div class="two" style="margin-top:8px"><input id="tpNew" class="search" style="margin:0" placeholder="New topic"><button class="btn small soft" onclick="if(f('tpNew')){_tp.push(f('tpNew'));$('tpNew').value='';tpList()}">Add topic</button></div></div>
    <button class="btn block" onclick="saveReviewCfg()">Save</button>`;
  dkList(); tpList();
}
function dkList() {
  const names = users.filter((u) => u.active !== false).map((u) => u.name);
  $('dkList').innerHTML = _dk.map((d, i) => `<div class="mkRule"><div class="two"><input value="${esc(d.name)}" placeholder="Desk name, e.g. Design desk" oninput="_dk[${i}].name=this.value"><button class="btn small danger" onclick="_dk.splice(${i},1);dkList()">Remove desk</button></div>
    <div class="choiceRow" style="margin-top:8px">${names.map((n) => `<button class="chip ${d.users.includes(n) ? 'active' : ''}" onclick='_dk[${i}].users=_dk[${i}].users.includes(${esc(JSON.stringify(n))})?_dk[${i}].users.filter(x=>x!==${esc(JSON.stringify(n))}):_dk[${i}].users.concat(${esc(JSON.stringify(n))});dkList()'>${esc(n)}</button>`).join('') || '<span class="hint">Add staff logins first</span>'}</div></div>`).join('');
}
function tpList() { $('tpList').innerHTML = _tp.map((t, i) => `<button class="chip" onclick="_tp.splice(${i},1);tpList()">${esc(t)} ✕</button>`).join(''); }
function saveReviewCfg() {
  const st = clone(S); st.reviewDesks = _dk.filter((d) => d.name.trim()).map((d) => ({ name: d.name.trim(), users: d.users })); st.reviewTopics = _tp;
  if (!st.reviewDesks.length) return toast('Keep at least one desk');
  cfgCall('settings', { settings: st }, 'Review desks saved');
}

// ---------------- admin tools ----------------
function shAdmin() {
  const o = getO(); if (!o || me.role !== 'admin') return;
  openSheet(`<h2>Admin · ${esc(refOf(o))}</h2><p class="sub">Every change here is written to the history.</p>
    <button class="btn soft block" onclick="closeSheet();editOrder('${o.id}',1)">Edit customer, items & price</button>
    <div class="field" style="margin-top:12px"><label>Reset / change status</label><select id="adSt">${opt(Object.keys(ST).map((k) => [k, ST[k][0]]), o.status)}</select></div>
    <div class="field"><label>Reason <i class="req">*</i></label><input id="adWhy" placeholder="e.g. Customer changed design after confirmation"></div>
    <button class="btn block" onclick="doAdminStatus()">Change status</button>
    <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
    <div class="field"><label>Delete this ${o.ono ? 'order' : 'enquiry'} — type <b>DELETE</b> to confirm</label><input id="adDel" autocomplete="off"></div>
    <button class="btn danger block" onclick="doAdminDelete()">Delete for good</button>`);
}
function doAdminStatus() {
  const to = $('adSt').value, why = f('adWhy');
  if (!why) return toast('Write the reason');
  step(cur.id, (o) => { if (o.status === to) return toast('Already in that status'), false; if (['enquiry', 'estimate'].includes(to)) o.approval = to === 'enquiry' ? null : o.approval; o.status = to; }, `Admin: status → ${ST[to][0]} · ${why}`, 'Status changed').then((r) => r && closeSheet());
}
async function doAdminDelete() {
  if (f('adDel') !== 'DELETE') return toast('Type DELETE to confirm');
  try { await api('order-delete', { id: cur.id }); orders = orders.filter((o) => o.id !== cur.id); cacheLocal(); closeSheet(); cur.id = null; go('vOrders'); toast('Deleted'); } catch (e) { toast(e.message); }
}
