#!/usr/bin/env node
// TASH 07-ops — render the order form and rate card to PNG/PDF.
// Usage (from the tash/ folder):  node 07-ops/src/render.mjs
// Outputs (in 07-ops/): order-form.png (1080×1350), order-form.pdf (A4),
//                       rate-card.png (1080×1350), rate-card-story.png (1080×1920)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../_system/tools/pw.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');          // tash/
const OUT = resolve(HERE, '..');              // tash/07-ops/
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };

function serve() {
  return new Promise(res => {
    const srv = createServer(async (req, rsp) => {
      try {
        const p = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        if (!p.startsWith(ROOT)) throw new Error('forbidden');
        const buf = await readFile(p);
        rsp.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
        rsp.end(buf);
      } catch { rsp.writeHead(404); rsp.end('not found'); }
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

async function settle(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    const fams = ['700 40px Alexandria', '400 30px "IBM Plex Sans Arabic"', '900 40px Archivo', '600 20px "JetBrains Mono"'];
    const fonts = Object.fromEntries(fams.map(f => [f, document.fonts.check(f, 'طشّ 123')]));
    const loaded = [...document.fonts].filter(f => f.status === 'loaded').map(f => `${f.family} ${f.weight}`);
    // anything spilling outside the sheet?
    const sheet = document.querySelector('.sheet').getBoundingClientRect();
    const spill = [...document.querySelectorAll('.sheet *')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width && (r.bottom > sheet.bottom + 0.5 || r.right > sheet.right + 0.5 || r.left < sheet.left - 0.5);
    }).map(el => el.className || el.tagName).slice(0, 8);
    const last = document.querySelector('.sheet > :last-child').getBoundingClientRect();
    return { fonts, loaded, spill, contentBottom: Math.round(last.bottom), sheetBottom: Math.round(sheet.bottom) };
  });
}

const srv = await serve();
const base = `http://127.0.0.1:${srv.address().port}/07-ops/`;
const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--force-color-profile=srgb'] });

async function shot(file, query, w, h, out) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('[page error]', e.message));
  await page.goto(base + file + query, { waitUntil: 'networkidle' });
  const info = await settle(page);
  await page.screenshot({ path: join(OUT, out), clip: { x: 0, y: 0, width: w, height: h } });
  console.log(out, JSON.stringify(info));
  return page;
}

const form = await shot('order-form.html', '', 1080, 1350, 'order-form.png');
await form.emulateMedia({ media: 'print' });
console.log('order-form.pdf (print)', JSON.stringify(await settle(form)));
await form.pdf({ path: join(OUT, 'order-form.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
await form.close();

await (await shot('rate-card.html', '?format=post', 1080, 1350, 'rate-card.png')).close();
await (await shot('rate-card.html', '?format=story', 1080, 1920, 'rate-card-story.png')).close();

await browser.close();
srv.close();
