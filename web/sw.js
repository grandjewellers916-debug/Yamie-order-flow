const V = 'ysc-v48';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(V).then((c) => c.addAll(['./', 'core.mjs', 'icon.svg']))); });
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok && u.origin === location.origin) { const c = r.clone(); caches.open(V).then((x) => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request)));
});
