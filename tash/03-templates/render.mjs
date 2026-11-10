#!/usr/bin/env node
// TASH templates → PNG.
//   node 03-templates/render.mjs <template.html> <data.json> <out.png> [--guide]
//   node 03-templates/render.mjs --all [--only <text>]        (every job in 03-templates/examples.json)
// Paths may be relative to the current folder or to tash/. The page is served with tash/ as web root
// (same as _system/tools/render.mjs), so /_system/... imports work. Fonts and images are awaited.
// If the data has a "slides" array, one PNG is written per slide: out-<id or 01>.png.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../_system/tools/pw.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');                       // tash/

// Local static server. (_system/tools/render.mjs exports serve(), but importing that file runs its CLI and
// exits when --page is missing, so we keep an identical copy here.)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
function serve(root = ROOT) {
  return new Promise(res => {
    const srv = createServer(async (req, rsp) => {
      try {
        const p = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        if (!p.startsWith(root)) throw new Error('forbidden');
        const buf = await readFile(p);
        rsp.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
        rsp.end(buf);
      } catch { rsp.writeHead(404); rsp.end('not found'); }
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

let FROM_ROOT = false;                                  // --all: manifest paths are relative to tash/
function locate(p) {                                    // accept cwd-relative, tash-relative or absolute
  const cands = FROM_ROOT ? [resolve(ROOT, p)] : [resolve(process.cwd(), p), resolve(ROOT, p)];
  for (const c of cands) if (existsSync(c)) return c;
  throw new Error('not found: ' + p);
}
const outPath = p => (p.startsWith('/') ? p : !FROM_ROOT && existsSync(dirname(resolve(process.cwd(), p))) ? resolve(process.cwd(), p) : resolve(ROOT, p));

async function renderJob(browser, base, { tpl, data, out, guide = false }) {
  const tplAbs = locate(tpl);
  const url = base + '/' + relative(ROOT, tplAbs).split('\\').join('/');
  const json = typeof data === 'string' ? JSON.parse(await readFile(locate(data), 'utf8')) : data;
  const slides = Array.isArray(json.slides) ? json.slides : [null];
  const outs = [];
  for (let i = 0; i < slides.length; i++) {
    const d = { ...json, __index: i, __guide: guide || json.__guide || false };
    let file = outPath(out);
    if (slides[i]) file = file.replace(/\.png$/, `-${slides[i].id || String(i + 1).padStart(2, '0')}.png`);
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.addInitScript(x => { window.TPL_DATA = x; }, d);
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.TPL && window.TPL.ready, null, { timeout: 30000 });
    const info = await page.evaluate(async () => { await window.TPL.ready; await document.fonts.ready; return { w: window.TPL.width, h: window.TPL.height, warnings: window.TPL.warnings }; })
      .catch(e => ({ error: e.message }));
    if (info.error) { console.error(`✖ ${relative(ROOT, file)}  ${info.error}  ${errs.join(' | ')}`); await page.close(); continue; }
    await page.setViewportSize({ width: info.w, height: info.h });
    await mkdir(dirname(file), { recursive: true });
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: info.w, height: info.h }, animations: 'disabled' });
    await page.close();
    const warn = [...info.warnings, ...errs];
    console.log(`${warn.length ? '⚠' : '✔'} ${relative(ROOT, file)}  ${info.w}×${info.h}${warn.map(w => '\n    · ' + w).join('')}`);
    outs.push(file);
  }
  return outs;
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = k => argv.includes('--' + k);
  const opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
  let jobs;
  if (flag('all')) {
    FROM_ROOT = true;
    jobs = JSON.parse(await readFile(join(HERE, 'examples.json'), 'utf8')).jobs;
    const only = opt('only'); if (only) jobs = jobs.filter(j => (j.out + j.tpl + j.data).includes(only));
  } else {
    const pos = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] === '--only'));
    if (pos.length < 3) { console.error('usage: node 03-templates/render.mjs <template.html> <data.json> <out.png> [--guide]\n       node 03-templates/render.mjs --all [--only text]'); process.exit(1); }
    jobs = [{ tpl: pos[0], data: pos[1], out: pos[2], guide: flag('guide') }];
  }
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--force-color-profile=srgb', '--disable-lcd-text'] });
  try { for (const j of jobs) await renderJob(browser, base, j); }
  finally { await browser.close(); srv.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
