// TASH boost ad v4, footage prep helper: re-render LAYL film frames from its own src with the plinth label hidden (0 credits).
// No LAYL file is changed: the browser's request for scene.js is intercepted and patched in memory (label.visible = false),
// so the label and its floor reflection are gone and every other pixel is the film's own render (checked: mean 0.93-1.08/255
// against the H.264 film outside the label, which is the film's compression). ?clean=1 also drops the end card from f335.
// About 3.5 s a frame on this container. Called by prep_swap.py when its --layl-clean folder is missing frames.
// usage: node layl_nolabel.mjs <outdir> <f0> <f1> [--label]   (film frame numbers, 30 fps; --label = unpatched control render)
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname, resolve, extname } from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');   // tash/
const TOOLS = join(ROOT, '_system/tools');
// same static server as _system/tools/render.mjs (that file cannot be imported: it exits without --page)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp4': 'video/mp4' };
const serve = () => new Promise(res => { const s = createServer(async (req, rsp) => { try { const p = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (!p.startsWith(ROOT)) throw 0;
  const buf = await readFile(p); rsp.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); rsp.end(buf); } catch { rsp.writeHead(404); rsp.end('nf'); } }).listen(0, '127.0.0.1', () => res(s)); });
const { chromium } = await import(TOOLS + '/pw.mjs');
const [out, a, b] = process.argv.slice(2); const keep = process.argv.includes('--label');
await mkdir(out, { recursive: true });
const srv = await serve();
const url = `http://127.0.0.1:${srv.address().port}/05-concept-ads/01-perfume-layl/src/index.html?clean=1`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--font-render-hinting=none', '--force-color-profile=srgb'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.error('[page error]', e.message));
let patched = 0;
if (!keep) await page.route('**/scene.js', async route => {
  const r = await route.fetch(); let body = await r.text();
  const n0 = body.length; body = body.replace('g.add(label);', 'label.visible = false; g.add(label);');
  if (body.length === n0) throw new Error('patch point not found'); patched++;
  await route.fulfill({ response: r, body, headers: { ...r.headers(), 'content-type': 'text/javascript' } });
});
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.TASH && window.TASH.seek, null, { timeout: 120000 });
await page.evaluate(async () => { await (window.TASH.ready || Promise.resolve()); await document.fonts.ready; });
if (!keep && !patched) throw new Error('scene.js was not intercepted');
const cdp = await page.context().newCDPSession(page);
const t0 = Date.now();
for (let f = +a; f <= +b; f++) {
  await page.evaluate(t => window.TASH.seek(t), f / 30);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(out, `${String(f).padStart(4, '0')}.png`), Buffer.from(data, 'base64'));
  console.log('frame', f, ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
await browser.close(); srv.close();
