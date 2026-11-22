// Stand-in for the Yamie Price Check shared database (tests only).
import http from 'node:http';
import { readFileSync } from 'node:fs';
const img = 'data:image/jpeg;base64,' + readFileSync('/tmp/pc1.jpg').toString('base64');
const rows = [
  { key: 'YR1042', barcode: 'YR1042', label: 'YR1042', item: 'Ring', category: 'Diamond ring', carat: '18KT', gw: 3.42, nw: 3.2, dw: 0.32, dq: 12, sa: 28000, size: '12', mcol: 'White gold', pname: '', model: 'SR-6P' },
  { key: 'STD2201', barcode: 'STD2201', label: 'STD2201', item: 'Stud', category: 'Earrings', carat: '14K', gw: 2.1, nw: 1.9 },
];
http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x'), op = u.searchParams.get('op');
  r.setHeader('content-type', 'application/json');
  if (q.headers['x-shop-key'] !== 'testkey') { r.statusCode = 401; return r.end('{"error":"bad_key"}'); }
  const out = { meta: { stock: 5, imgs: 7, pattrs: 1, pnames: 1 }, stock: { rows }, imgidx: { idx: { YR1042: 1 }, n: { YR1042: 2 } },
    pattrs: { map: { YR1042: { jt: 'Six-prong solitaire with pavé shank', sc: [] } } }, pnames: { map: { YR1042: 'Aurora Solitaire Ring' } },
    img: { img: u.searchParams.get('k') === 'YR1042' ? img : null } }[op];
  r.end(JSON.stringify(out || {}));
}).listen(8792, () => console.log('pc mock 8792'));
