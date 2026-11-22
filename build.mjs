// Builds web/index.html (one file) from src/: style.css + body.html + logos.js + js/*.js.
// JavaScript is transpiled to ES2017 so older Android WebViews run it. Usage: node build.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { transformSync } from 'esbuild';
const r = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const js = ['logos.js', ...readdirSync(new URL('src/js/', import.meta.url)).sort().map((f) => 'js/' + f)].map((f) => r('src/' + f)).join('\n;\n');
const out = transformSync(js, { loader: 'js', target: 'es2017', charset: 'utf8' }).code;
const icon = 'data:image/png;base64,' + readFileSync(new URL('web/icon-192.png', import.meta.url)).toString('base64');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#78213f"><meta name="mobile-web-app-capable" content="yes"><title>Yamie Order Desk</title><link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="${icon}"><link rel="apple-touch-icon" href="icon-192.png"><style>
${r('src/style.css')}</style></head><body>
${r('src/body.html').split('%ICON%').join(icon)}
<script src="ybk.js"></script>
<script>
${out}</script>
</body></html>
`;
writeFileSync(new URL('web/index.html', import.meta.url), html);
console.log('web/index.html', (html.length / 1024).toFixed(0) + ' KB');
