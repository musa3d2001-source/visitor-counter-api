// Build the TASH brand guide: brand-guide.html → TASH-Brand-Guide.pdf + pages/page-NN.png
// Run from tash/:  node 01-brand-guide/src/build.mjs [--no-pdf] [--only 3,7]
// Fails loudly on page errors, missing images or file-index paths that don't exist; prints layout diagnostics.
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../_system/tools/pw.mjs';
import { serve, ROOT } from './serve.mjs';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',').map(Number) : null;
const DIR = join(ROOT, '01-brand-guide');
const PAGES = join(DIR, 'pages');

const srv = await serve();
const url = `http://127.0.0.1:${srv.address().port}/01-brand-guide/brand-guide.html`;
const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--force-color-profile=srgb'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push('[page error] ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
page.on('requestfailed', r => errors.push('[request failed] ' + r.url()));
page.on('response', r => { if (r.status() >= 400) errors.push(`[${r.status()}] ${r.url()}`); });
await page.goto(url, { waitUntil: 'load' });
try { await page.waitForFunction(() => window.GUIDE_READY === true, null, { timeout: 90000 }); }
catch (e) { console.error(errors.join('\n')); throw e; }
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

// ---- diagnostics -------------------------------------------------------------
const diag = await page.evaluate(() => {
  const out = [], fontsMissing = [];
  document.querySelectorAll('.page').forEach((p, i) => {
    const pr = p.getBoundingClientRect(), b = p.querySelector('.b'), br = b ? b.getBoundingClientRect() : pr;
    p.querySelectorAll('*').forEach(el => {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') return;
      const r = el.getBoundingClientRect(); if (!r.width && !r.height) return;
      const box = b && b.contains(el) ? br : pr, tol = 1.5;
      const d = { r: r.right - box.right, l: box.left - r.left, b: r.bottom - box.bottom, t: box.top - r.top };
      const worst = Object.entries(d).filter(([, v]) => v > tol);
      if (worst.length) out.push({ page: i + 1, el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : ''), txt: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50), over: worst.map(([k, v]) => k + Math.round(v)).join(' ') });
      const cs = getComputedStyle(el);
      if (cs.overflow === 'hidden' && !el.matches('.page,.fig,.tile') && (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2))
        out.push({ page: i + 1, el: el.tagName.toLowerCase() + '.' + el.className, txt: 'CLIPPED CONTENT', over: `${el.scrollWidth}x${el.scrollHeight} > ${el.clientWidth}x${el.clientHeight}` });
    });
  });
  for (const f of ['800 20px Alexandria', '400 12px "IBM Plex Sans Arabic"', '600 12px "IBM Plex Sans Arabic"', '800 12px Archivo', '600 12px "JetBrains Mono"'])
    if (!document.fonts.check(f)) fontsMissing.push(f);
  const paths = [...document.querySelectorAll('[data-path]')].map(e => e.dataset.path);
  return { out, fontsMissing, paths, guide: window.GUIDE };
});
const missing = diag.paths.filter(p => !existsSync(join(ROOT, p)));
console.log('pages:', diag.guide.pages, '| stem', diag.guide.stemDeg.toFixed(2) + '°', '| D', diag.guide.D, '| gap', diag.guide.gap);
if (diag.fontsMissing.length) { console.error('FONTS NOT LOADED:', diag.fontsMissing); process.exit(1); }
if (missing.length) { console.error('FILE INDEX PATHS MISSING:', missing); process.exit(1); }
const seen = new Set();
for (const o of diag.out) { const k = o.page + o.txt + o.over; if (seen.has(k)) continue; seen.add(k); console.log(`  overflow p${o.page} ${o.el} [${o.over}] ${o.txt}`); }
if (!diag.out.length) console.log('  no overflow');

// ---- PDF ----------------------------------------------------------------------
if (!args.includes('--no-pdf')) {
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: join(DIR, 'TASH-Brand-Guide.pdf'), preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  console.log('pdf →', join(DIR, 'TASH-Brand-Guide.pdf'));
}

// ---- page PNGs (2× = 2245 × 1587) ----------------------------------------------
if (!only) { rmSync(PAGES, { recursive: true, force: true }); }
mkdirSync(PAGES, { recursive: true });
const els = await page.$$('.page');
for (let i = 0; i < els.length; i++) {
  if (only && !only.includes(i + 1)) continue;
  const f = join(PAGES, `page-${String(i + 1).padStart(2, '0')}.png`);
  await els[i].screenshot({ path: f });
}
console.log('pngs →', PAGES);
await browser.close(); srv.close();
