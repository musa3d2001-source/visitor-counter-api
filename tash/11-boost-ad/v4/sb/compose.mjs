// Storyboard compositor: frames.json (stills + code-drawn overlays) -> PNG per frame + contact sheets.
// usage: node compose.mjs --frames frames.json --out outdir [--ui ig|tt|none] [--cols 4] [--only id,id]
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../../_system/tools/pw.mjs';
const HERE = dirname(fileURLToPath(import.meta.url)), TASH = resolve(HERE, '../../..');
const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const framesPath = resolve(arg('frames')), out = resolve(arg('out')), ui = arg('ui', 'none'), cols = +arg('cols', 4), only = arg('only', ''), stills = resolve(arg('stills', join(HERE, 'stills')));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf' };
const srv = await new Promise(res => { const s = createServer(async (req, rsp) => { try {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname); const [root, rel] = u.startsWith('/_sb/') ? [HERE, u.slice(5)] : u.startsWith('/_stills/') ? [stills, u.slice(9)] : [TASH, u];
  const p = join(root, rel); if (!p.startsWith(root)) throw 0; const buf = await readFile(p); rsp.writeHead(200, { 'content-type': MIME[extname(p).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' }); rsp.end(buf);
} catch { rsp.writeHead(404); rsp.end('nf'); } }).listen(0, '127.0.0.1', () => res(s)); });
const spec = JSON.parse(await readFile(framesPath, 'utf8')); let frames = spec.frames; if (only) frames = frames.filter(f => only.split(',').includes(f.id));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--force-color-profile=srgb'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
let bad = 0; page.on('pageerror', e => { bad++; console.error('[page error]', e.message); }); page.on('console', m => { if (m.type() === 'error') { bad++; console.error('[console]', m.text()); } });
await page.goto(`http://127.0.0.1:${srv.address().port}/_sb/page.html`, { waitUntil: 'load' }); await page.waitForFunction(() => window.SB); await page.evaluate(() => window.SB.ready);
for (const F of frames) { const b64 = await page.evaluate(([F, ui]) => window.SB.render(F, ui), [F, F.ui ?? ui]); await writeFile(join(out, `${F.id}.png`), Buffer.from(b64, 'base64')); console.log('frame', F.id); }
for (const [name, u] of [['sheet', 'none'], ['sheet-ui', ui === 'none' ? 'ig' : ui]]) { const b64 = await page.evaluate(([fr, o]) => window.SB.sheet(fr, o), [frames, { cols, ui: u, title: spec.title ?? '' }]); await writeFile(join(out, `${name}.jpg`), Buffer.from(b64, 'base64')); console.log(name); }
await browser.close(); srv.close(); if (bad) process.exit(1);
