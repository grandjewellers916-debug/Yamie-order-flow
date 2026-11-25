// ======================================================================
// Start-up
// ======================================================================
document.querySelectorAll('[data-logo]').forEach((i) => { i.src = LOGO[i.dataset.logo]; });
$('phCam').addEventListener('change', onPhotoPicked);
$('phGal').addEventListener('change', onPhotoPicked);
$('bkFile').addEventListener('change', bkPick);

const deskMQ = window.matchMedia('(min-width:1024px) and (pointer:fine)');
function applyDesk() { document.body.classList.toggle('desk', deskMQ.matches); if (me) go(cur.view); }
applyDesk();
deskMQ.addEventListener ? deskMQ.addEventListener('change', applyDesk) : deskMQ.addListener(applyDesk);
document.addEventListener('keydown', (e) => {
  if (!me || e.target.matches('input,textarea,select')) return;
  if (e.key === 'n' && can('enquiry')) { e.preventDefault(); newEnquiry(); }
  if (e.key === '/') { e.preventDefault(); go('vOrders'); setTimeout(() => $('q') && $('q').focus(), 50); }
  if (e.key === 'Escape' && $('sheetBg').classList.contains('on')) closeSheet();
});

// Link from Price Check: /new?o=<order id> opens that enquiry (web, or the APK via app link)
function takeNewQuery(q) {
  const id = new URLSearchParams(q || '').get('o'); if (!id) return;
  if (!me) { pendingOpen = id; return; }
  pullChanges().then(() => { if (orders.find((o) => o.id === id)) openOrder(id); else { pendingOpen = id; toast('Opening the enquiry from Price Check…'); } });
}
window.onNativeNew = function (q) { takeNewQuery(q); return true; };
if (/^\/new/.test(location.pathname)) { takeNewQuery(location.search); try { history.replaceState(null, '', '/'); } catch (e) { /* ignore */ } }
(function boot() {
  try { const appV = NATIVE && NATIVE.version ? NATIVE.version() : ''; $('lockVer').textContent = appV ? 'App v' + APP_VERSION : 'Web v' + APP_VERSION; } catch (e) { /* ignore */ }
  showVersion();
  api('ping').then((d) => { serverVer = d.ver || '1.7'; UPD.apkMin = d.apkMin || ''; showVersion(); updCheck(false); }).catch(() => {});
  if (!token) return showLock();
  api('changes?since=' + (lastPull || 0) + '&cfgv=' + encodeURIComponent(cfgv)).then(async (d) => {
    me = d.me;
    if (!lastPull || (d.resetAt || '') !== resetAt) await pullAll();
    else { d.orders.forEach(mergeOrder); d.deleted.forEach((id) => { orders = orders.filter((o) => o.id !== id); }); if (d.users) applyCfg(d); lastPull = d.now; sortOrders(); cacheLocal(); setNet(true); }
    if (me.mustChange) { $('lock').hidden = false; return firstSetup(); }
    startSession();
  }).catch((e) => {
    if (isNet(e) && load('yod_me', null)) { me = load('yod_me', null); setNet(false); startSession(); }
    else showLock();
  });
})();
window.addEventListener('beforeunload', () => { if (me) store('yod_me', me); });
