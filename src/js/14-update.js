// ======================================================================
// Reload app: pick up a new version without installing a new APK.
// The APK downloads the live web page (same build as the website) and reloads;
// the website just reloads. A new APK is only needed when the server says so (apkMin).
// ======================================================================
const verCmp = (a, b) => { const x = String(a || '0').split('.').map(Number), y = String(b || '0').split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
const UPD = { busy: false, ready: '', apkMin: '', manual: false, apkUrl: '' };
const nativeVer = () => { try { return NATIVE && NATIVE.version ? NATIVE.version() : ''; } catch (e) { return ''; } };
const canLiveUpdate = () => !!(NATIVE && NATIVE.updateWeb && NATIVE.reloadApp);
function updCheck(manual) {
  UPD.manual = !!manual;
  if (!serverVer) { if (manual) api('ping').then((d) => { serverVer = d.ver; UPD.apkMin = d.apkMin || ''; showVersion(); updCheck(true); }).catch(() => toast('No internet — try again')); return; }
  const nv = nativeVer();
  if (nv && UPD.apkMin && verCmp(nv, UPD.apkMin) < 0) { updBar(); if (manual) apkDownload(); return; }
  if (verCmp(serverVer, APP_VERSION) <= 0) { UPD.ready = ''; updBar(); if (manual) toast('Order Desk ' + APP_VERSION + ' is the latest'); return; }
  if (canLiveUpdate()) {
    if (UPD.ready === serverVer) { updBar(); if (manual) reloadApp(); return; }
    if (UPD.busy) return; UPD.busy = true; if (manual) toast('Downloading version ' + serverVer + '…');
    try { NATIVE.updateWeb(serverVer); } catch (e) { UPD.busy = false; }
  } else { UPD.ready = serverVer; updBar(); if (manual) reloadApp(); }
}
window.onWebUpdate = function (ok, v, msg) {
  UPD.busy = false;
  if (ok && verCmp(v, APP_VERSION) > 0) { UPD.ready = v; updBar(); if (UPD.manual) reloadApp(); }
  else if (!ok && UPD.manual) toast('Could not download the update: ' + msg);
  return true;
};
function updBar() {
  const el = $('updBar'); if (!el) return;
  const nv = nativeVer(), needApk = nv && UPD.apkMin && verCmp(nv, UPD.apkMin) < 0;
  const oldApk = nv && !canLiveUpdate() && serverVer && verCmp(serverVer, APP_VERSION) > 0;
  if (needApk || oldApk) { el.hidden = false; el.innerHTML = `<span>New app ${esc(UPD.apkMin || serverVer)} — install it once to get automatic updates</span><button onclick="apkDownload()">Download</button>`; return; }
  if (UPD.ready && verCmp(UPD.ready, APP_VERSION) > 0) { el.hidden = false; el.innerHTML = `<span>Version ${esc(UPD.ready)} is ready</span><button onclick="reloadApp()">Reload app</button>`; return; }
  el.hidden = true;
}
function reloadApp() {
  if (cur.view === 'vNew' && !confirm('You have an unsaved enquiry open. Reload anyway?')) return;
  if (canLiveUpdate()) { NATIVE.reloadApp(); return; }
  if (NATIVE && NATIVE.version) { location.reload(); return; }
  location.replace(location.pathname + '?r=' + Date.now());
}
async function apkDownload() {
  try {
    if (!UPD.apkUrl) {
      const r = await fetch('https://api.github.com/repos/grandjewellers916-debug/Yamie-order-flow/releases?per_page=15');
      const rel = (await r.json()).find((x) => /^order-desk-v/.test(x.tag_name));
      const a = rel && rel.assets.find((x) => /\.apk$/.test(x.name)); if (!a) throw new Error('no app file found');
      UPD.apkUrl = a.browser_download_url;
    }
    if (NATIVE && NATIVE.openUrl) NATIVE.openUrl(UPD.apkUrl); else window.open(UPD.apkUrl, '_blank');
  } catch (e) { toast('Could not find the new app: ' + e.message); }
}
// check when the app opens, every 30 minutes, and when it comes back to the front
setInterval(() => updCheck(false), 30 * 60e3);
document.addEventListener('visibilitychange', () => { if (!document.hidden) api('ping').then((d) => { serverVer = d.ver || serverVer; UPD.apkMin = d.apkMin || ''; showVersion(); updCheck(false); }).catch(() => {}); });
