// V1.9.12 Netlify build step: writes web/ota.json (version, build, SHA-256 of every file) for automatic app updates.
// The phone app downloads only the files whose hash changed; the website reloads when the build changes.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
const root = 'web', files = {};
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else { const r = relative(root, p).split(sep).join('/'); if (r === 'ota.json') continue; files[r] = createHash('sha256').update(readFileSync(p)).digest('hex'); } } };
walk(root);
const html = readFileSync(join(root, 'index.html'), 'utf8');
const pick = (re, d) => (html.match(re) || [])[1] || d;
const out = { v: pick(/APP_VERSION='([^']+)'/, ''), build: pick(/APP_BUILD='([^']+)'/, ''), nativeApi: +pick(/NATIVE_API=(\d+)/, '1'), at: new Date().toISOString(), files };
writeFileSync(join(root, 'ota.json'), JSON.stringify(out));
console.log('ota.json', out.v, out.build, 'nativeApi', out.nativeApi, Object.keys(files).length, 'files');
