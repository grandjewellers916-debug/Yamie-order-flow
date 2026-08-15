const STATUSES = [
  {key:'proforma', label:'Proforma'}, {key:'booked', label:'Booked'}, {key:'confirmed', label:'Confirmed'},
  {key:'progress', label:'In progress'}, {key:'ready', label:'Ready'}, {key:'delivered', label:'Delivered'}
];
const REPAIR_STATUSES = [
  {key:'received', label:'Received'}, {key:'with_smith', label:'With smith'},
  {key:'ready', label:'Ready'}, {key:'delivered', label:'Delivered'}
];

let orders = [];
let activeTab = 'orders';
let activeId = null;

function fmtMoney(n){ if(n===undefined||n===null||n==='') return '—'; return '₹' + Number(n).toLocaleString('en-IN'); }
function fmtDate(d){ if(!d) return '—'; const dt = new Date(d); if(isNaN(dt)) return d; return dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); }

async function api(path, opts = {}){
  const headers = Object.assign({'content-type':'application/json'}, opts.headers || {});
  const res = await fetch(path, Object.assign({}, opts, {headers}));
  const body = await res.json().catch(() => ({}));
  if(!res.ok) throw Object.assign(new Error(body.error || 'Request failed'), {status: res.status, body});
  return body;
}

function openOverlay(id){ document.getElementById(id).classList.add('show'); }
function closeOverlay(id){ document.getElementById(id).classList.remove('show'); }

/* ---------- Orders / board ---------- */

async function loadOrders(){
  const { orders: list } = await api('/api/orders');
  orders = list;
  render();
}

function setTab(tab){
  activeTab = tab;
  document.getElementById('tabOrders').classList.toggle('active', tab === 'orders');
  document.getElementById('tabRepairs').classList.toggle('active', tab === 'repairs');
  render();
}

function statusLabelFor(o){
  if(o.isProforma) return 'Proforma';
  const ref = o.type === 'repair' ? REPAIR_STATUSES : STATUSES;
  const found = ref.find(s => s.key === o.status);
  return found ? found.label : o.status;
}

function render(){
  const board = document.getElementById('board');
  board.innerHTML = '';
  const filtered = orders.filter(o => activeTab === 'repairs' ? o.type === 'repair' : o.type !== 'repair');
  const statusSet = activeTab === 'repairs' ? REPAIR_STATUSES : STATUSES;

  statusSet.forEach(s => {
    const col = document.createElement('div');
    col.className = 'column';
    const items = filtered.filter(o => o.status === s.key);
    col.innerHTML = `<div class="column-head"><span>${s.label}</span><span class="count">${items.length}</span></div>`;
    if(items.length === 0){
      col.innerHTML += `<div class="empty-col">No ${activeTab === 'repairs' ? 'repairs' : 'orders'}</div>`;
    } else {
      items.forEach(o => col.appendChild(renderCard(o)));
    }
    board.appendChild(col);
  });
}

function renderCard(o){
  const card = document.createElement('div');
  card.className = 'card type-' + o.type;
  card.onclick = () => openDetail(o.id);
  const balance = (o.finalAmount || o.quote || 0) - (o.advance || 0);
  card.innerHTML = `
    <div class="card-id">${o.id}</div>
    <div class="card-name">${o.customer || 'Unnamed'}</div>
    <div class="card-desc">${[o.purity, o.colour, o.item].filter(Boolean).join(' · ') || 'No item details'}</div>
    <div class="card-desc" style="margin-top:4px;">Due ${fmtDate(o.expectedDate)} · ${fmtMoney(balance)} due</div>
  `;
  return card;
}

/* ---------- New order ---------- */

function openNewOrder(){
  ['f_customer','f_phone','f_item','f_weight','f_rate','f_making','f_quote','f_staff'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f_stoneCharges').value = 0;
  document.getElementById('f_advance').value = 0;
  document.getElementById('f_type').value = activeTab === 'repairs' ? 'repair' : 'custom';
  document.getElementById('f_date').value = '';
  document.getElementById('newOrderTitle').textContent = activeTab === 'repairs' ? 'New repair' : 'New order';
  onTypeChange();
  openOverlay('newOrderOverlay');
}

function onTypeChange(){
  const isRepair = document.getElementById('f_type').value === 'repair';
  document.getElementById('pricingRow2').style.display = isRepair ? 'none' : 'grid';
  updateApproxPrice();
}

function calcApprox(){
  const w = parseFloat(document.getElementById('f_weight').value) || 0;
  const r = parseFloat(document.getElementById('f_rate').value) || 0;
  const m = parseFloat(document.getElementById('f_making').value) || 0;
  const s = parseFloat(document.getElementById('f_stoneCharges').value) || 0;
  const metal = w * r;
  const making = metal * (m / 100);
  return (metal + making + s) * 1.03;
}

function updateApproxPrice(){
  document.getElementById('f_approxPrice').value = fmtMoney(Math.round(calcApprox()));
}
['f_weight','f_rate','f_making','f_stoneCharges'].forEach(id => {
  document.getElementById(id).addEventListener('input', updateApproxPrice);
});

async function submitNewOrder(){
  const type = document.getElementById('f_type').value;
  const payload = {
    type,
    customer: document.getElementById('f_customer').value.trim(),
    phone: document.getElementById('f_phone').value.trim(),
    item: document.getElementById('f_item').value.trim(),
    purity: document.getElementById('f_purity').value,
    weight: document.getElementById('f_weight').value,
    rate: document.getElementById('f_rate').value,
    making: document.getElementById('f_making').value,
    stoneCharges: document.getElementById('f_stoneCharges').value || 0,
    approxPrice: type === 'repair' ? 0 : calcApprox(),
    quote: document.getElementById('f_quote').value || 0,
    advance: document.getElementById('f_advance').value || 0,
    paymentMode: document.getElementById('f_paymentMode').value,
    expectedDate: document.getElementById('f_date').value,
    staff: document.getElementById('f_staff').value.trim(),
  };
  if(!payload.customer){ alert('Enter a customer name.'); return; }
  await api('/api/orders-create', {method:'POST', body: JSON.stringify(payload)});
  closeOverlay('newOrderOverlay');
  loadOrders();
}

/* ---------- Detail / status ---------- */

function openDetail(id){
  activeId = id;
  const o = orders.find(x => x.id === id);
  if(!o) return;

  document.getElementById('d_title').textContent = (o.isProforma ? 'PROFORMA · ' : '') + o.id + ' — ' + o.customer;
  document.getElementById('d_sub').textContent = o.type + ' · ' + (o.isProforma ? 'awaiting confirmation' : statusLabelFor(o));

  const balance = (o.finalAmount || o.quote || 0) - (o.advance || 0);
  document.getElementById('d_grid').innerHTML = `
    <div class="k">Phone</div><div class="v">${o.phone || '—'}</div>
    <div class="k">Item</div><div class="v">${o.item || '—'} (${o.purity || '—'})</div>
    <div class="k">Weight / Rate</div><div class="v">${o.weight || '—'}g @ ${fmtMoney(o.rate)}</div>
    <div class="k">Making %</div><div class="v">${o.making || '—'}</div>
    <div class="k">Approx. price</div><div class="v">${fmtMoney(Math.round(o.approxPrice || 0))}</div>
    <div class="k">Quoted</div><div class="v">${fmtMoney(o.quote)}</div>
    <div class="k">Advance</div><div class="v">${fmtMoney(o.advance)} ${o.paymentMode ? '('+o.paymentMode+')' : ''}</div>
    <div class="k">Balance due</div><div class="v">${fmtMoney(balance)}</div>
    <div class="k">Expected date</div><div class="v">${fmtDate(o.expectedDate)}</div>
    <div class="k">Staff</div><div class="v">${o.staff || '—'}</div>
  `;

  const statusRow = document.getElementById('d_statusRow');
  statusRow.innerHTML = '';
  if(o.isProforma){
    const btn = document.createElement('button');
    btn.className = 'btn-primary'; btn.textContent = 'Confirm order & assign number';
    btn.onclick = confirmOrder;
    statusRow.appendChild(btn);
  } else {
    const set = o.type === 'repair' ? REPAIR_STATUSES : STATUSES.filter(s => s.key !== 'proforma');
    set.forEach(s => {
      const btn = document.createElement('button');
      btn.className = 'btn-sm ' + (o.status === s.key ? 'btn-primary' : 'btn-outline');
      btn.textContent = s.label;
      btn.onclick = () => setStatus(s.key);
      statusRow.appendChild(btn);
    });
  }

  const tl = document.getElementById('d_timeline');
  tl.innerHTML = '';
  (o.timeline || []).slice().reverse().forEach(t => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="t-date">${fmtDate(t.date)}</span> — ${t.text}`;
    tl.appendChild(li);
  });

  openOverlay('detailOverlay');
}

async function setStatus(status){
  try{
    await api('/api/orders-update', {method:'PATCH', body: JSON.stringify({id: activeId, action:'setStatus', status})});
    await loadOrders();
    openDetail(activeId);
  } catch(err){ alert(err.message); }
}

async function confirmOrder(){
  if(!confirm('Confirm this order? A permanent order number will be generated.')) return;
  try{
    const { id } = await api('/api/orders-update', {method:'PATCH', body: JSON.stringify({id: activeId, action:'confirm'})});
    activeId = id;
    await loadOrders();
    openDetail(id);
  } catch(err){ alert(err.message); }
}

async function addNote(){
  const text = document.getElementById('d_note').value.trim();
  if(!text) return;
  await api('/api/orders-update', {method:'PATCH', body: JSON.stringify({id: activeId, action:'addNote', text})});
  document.getElementById('d_note').value = '';
  await loadOrders();
  openDetail(activeId);
}

loadOrders();
