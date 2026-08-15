let adminPin = null;

function fmtMoney(n){ if(n===undefined||n===null||n==='') return '—'; return '₹' + Number(n).toLocaleString('en-IN'); }
function fmtDate(d){ if(!d) return '—'; const dt = new Date(d); if(isNaN(dt)) return d; return dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); }

async function checkPin(){
  const pin = document.getElementById('pin_input').value.trim();
  const errEl = document.getElementById('pinError');
  errEl.textContent = '';
  try{
    const res = await fetch('/api/admin-check-pin', {
      method: 'POST',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({pin})
    });
    if(!res.ok){
      errEl.textContent = 'Incorrect PIN.';
      return;
    }
    adminPin = pin;
    document.getElementById('pinScreen').style.display = 'none';
    loadAdminOrders();
  } catch(err){
    errEl.textContent = 'Something went wrong. Try again.';
  }
}

async function loadAdminOrders(){
  const res = await fetch('/api/orders');
  const { orders } = await res.json();
  const table = document.getElementById('adminTable');
  let html = '<thead><tr style="text-align:left;border-bottom:2px solid var(--line);background:var(--ivory);">' +
    '<th style="padding:8px;">Order #</th><th style="padding:8px;">Type</th><th style="padding:8px;">Customer</th>' +
    '<th style="padding:8px;">Status</th><th style="padding:8px;">Amount</th><th style="padding:8px;">Date</th></tr></thead><tbody>';
  if(orders.length === 0){
    html += '<tr><td colspan="6" style="padding:16px;color:var(--muted);">No orders yet.</td></tr>';
  } else {
    orders.forEach(o => {
      const amount = o.finalAmount || o.quote || o.approxPrice || 0;
      html += '<tr style="border-bottom:1px solid var(--line);">' +
        '<td style="padding:8px;">' + o.id + '</td>' +
        '<td style="padding:8px;">' + o.type + '</td>' +
        '<td style="padding:8px;">' + (o.customer || '—') + '</td>' +
        '<td style="padding:8px;">' + (o.isProforma ? 'Proforma' : o.status) + '</td>' +
        '<td style="padding:8px;">' + fmtMoney(amount) + '</td>' +
        '<td style="padding:8px;">' + fmtDate(o.createdAt) + '</td>' +
        '</tr>';
    });
  }
  html += '</tbody>';
  table.innerHTML = html;
}

async function clearAllData(){
  if(!confirm('Delete ALL orders and repairs? This cannot be undone.')) return;
  const res = await fetch('/api/admin-clear', {
    method: 'POST',
    headers: {'content-type':'application/json'},
    body: JSON.stringify({pin: adminPin})
  });
  const body = await res.json().catch(() => ({}));
  if(!res.ok){
    alert(body.error || 'Failed to clear data. Your PIN may be incorrect.');
    return;
  }
  alert('All data cleared.');
  loadAdminOrders();
}
