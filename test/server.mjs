// Local test server: serves web/ and runs the real netlify/functions/api.mts on an in-memory store.
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { buildSync } from 'esbuild';
import path from 'node:path';
const root = path.resolve(new URL('..', import.meta.url).pathname);
globalThis.Netlify = { env: { get: (k) => process.env[k] } };
buildSync({ entryPoints: [root + '/netlify/functions/api.mts'], bundle: true, platform: 'node', format: 'esm', outfile: root + '/test/.api.mjs', alias: { '@netlify/blobs': root + '/test/blobs-mock.mjs' }, loader: { '.mts': 'ts' } });
const { default: handler } = await import(root + '/test/.api.mjs?' + Date.now());
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/json' };
http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await handler(new Request('http://x' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : Buffer.concat(chunks) }));
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
  }
  let p = root + '/web' + (req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]);
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
}).listen(process.env.PORT || 8788, () => console.log('test server on', process.env.PORT || 8788));
