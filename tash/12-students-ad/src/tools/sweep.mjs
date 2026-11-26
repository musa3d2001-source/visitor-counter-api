// Per-frame text sweep of the students film (lead, fix rounds 1-2; run from anywhere):
//   node 12-students-ad/src/tools/sweep.mjs [fromFrame] [toFrame] [step]      → "issues: 0" is the pass
// For every frame: every [data-safe] element that is actually visible (display, and the PRODUCT of its own and its
// ancestors' opacity >= 0.05) is checked against
//   A. the brief's safe area x 64-1016, y 250-1620
//   B. the platform map: key ink must end at y <= 1540; nothing readable at x > 950 over y 1100-1750
//   C. the right-rail rule for key lines: right edge <= 920 for y 900-1650 (centre of the box inside that band)
//   D. its text must be a script.json string, a word of one, or an LTR file chip / handle part
//   E. (fix round 2) no chip, pill, file chip, label, CTA, underline, guide or handle ([data-ink]) may touch an Arabic
//      line's real glyph ink (canvas glyph metrics per text run: the dots below the baseline are inside)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));        // tash/
const { chromium } = await import(join(ROOT, '_system/tools/pw.mjs'));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf' };
const srv = await new Promise(res => { const s = createServer(async (q, r) => { try { const p = join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); const b = await readFile(p); r.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); r.end(b); } catch { r.writeHead(404); r.end(); } }).listen(0, '127.0.0.1', () => res(s)); });
const port = srv.address().port;
const S = JSON.parse(await readFile(join(ROOT, '12-students-ad/script.json'), 'utf8'));
const allowed = new Set();
const add = t => { allowed.add(t); for (const w of t.split(' ')) allowed.add(w); };
for (const l of S.lines) for (const o of l.onscreen) add(o);
for (const e of S.endcard) add(e);
for (const u of S.ui_strings) { const m = u.match(/^([a-z_]+)(?: \(([^)]*)\))?: (.*)$/); if (m) add(m[3]); }
const [from = 0, to = 890, step = 1] = process.argv.slice(2).map(Number);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--font-render-hinting=none'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('pageerror', e => console.error('[page error]', e.message));
await page.goto(`http://127.0.0.1:${port}/12-students-ad/src/index.html`);
await page.waitForFunction(() => window.TASH && window.TASH.seek);
await page.evaluate(async () => { await window.TASH.ready; await document.fonts.ready; });
const issues = []; let n = 0;
for (let f = from; f <= to; f += step) {
  const res = await page.evaluate(async f => {
    await window.TASH.seek(f / 30);
    const out = [];
    // ---- E. ink overlap (fix round 2): no boxed element (chip, pill, file chip, label, CTA, underline, guide, handle) may
    // touch an Arabic line's real glyph ink, dots below the baseline included (canvas glyph metrics on each text run)
    const AR = /[\u0600-\u06FF]/;
    const visible = e => { let o = 1, el = e; while (el && el.nodeType === 1) { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= parseFloat(cs.opacity); el = el.parentElement; } return o; };
    const cv = window.__inkcv || (window.__inkcv = document.createElement('canvas').getContext('2d'));
    const lines = [], boxes = [];
    for (const e of document.querySelectorAll('[data-safe]')) {
      if (/k-chip|k-file|k-label|s3-chip|s7-chip|s7-cta/.test(e.className || '') || !AR.test(e.textContent)) continue;
      if (visible(e) < 0.05) continue;
      let ink = null;
      const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        if (!n.textContent.trim() || visible(n.parentElement) < 0.05) continue;
        const rg = document.createRange(); rg.selectNodeContents(n); const r = rg.getBoundingClientRect(); if (r.width < 0.5) continue;
        const cs = getComputedStyle(n.parentElement); cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; cv.direction = 'rtl';
        const m = cv.measureText(n.textContent), sc = r.height / (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent);
        const base = r.top + m.fontBoundingBoxAscent * sc;
        const b = [r.left, base - m.actualBoundingBoxAscent * sc - 2, r.right, base + m.actualBoundingBoxDescent * sc + 2];
        ink = ink ? [Math.min(ink[0], b[0]), Math.min(ink[1], b[1]), Math.max(ink[2], b[2]), Math.max(ink[3], b[3])] : b;
      }
      if (ink) lines.push({ e, t: e.textContent.trim().slice(0, 30), ink });
    }
    for (const e of document.querySelectorAll('.k-chip, .k-file, .k-label, .s3-chip, .s7-chip, .s7-cta, [data-ink]')) {
      if (visible(e) < 0.05) continue;
      const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
      const box = [r.left, r.top, r.right, r.bottom];
      const clip = e.closest('[data-inkclip]'); if (clip) box[3] = Math.min(box[3], +clip.dataset.inkclip);
      if (box[3] > box[1]) boxes.push({ e, t: (e.textContent || '').trim().slice(0, 24) || String(e.className.baseVal ?? e.className).slice(0, 24), box });
    }
    const ov = [];
    for (const a of lines) for (const b of boxes) {
      if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
      // a mark in a HIGHER scene over a line in a lower one is behind that scene's opaque layer (s3's bubble over the dimmed
      // s2 app): not an overlap on screen. The global samples label is checked against everything.
      const sa = a.e.closest('.scene'), sb = b.e.closest('.scene');
      if (sa && sb && sa !== sb) continue;
      const A = a.ink, B = b.box, ix = Math.min(A[2], B[2]) - Math.max(A[0], B[0]), iy = Math.min(A[3], B[3]) - Math.max(A[1], B[1]);
      if (ix > 1 && iy > 1) ov.push({ line: a.t, over: b.t, ix: Math.round(ix), iy: Math.round(iy), A: A.map(Math.round), B: B.map(Math.round) });
    }
    for (const e of document.querySelectorAll('[data-safe]')) {
      let o = 1, el = e, shown = true;
      while (el && el.nodeType === 1) { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') { shown = false; break; } o *= parseFloat(cs.opacity); el = el.parentElement; }
      if (!shown || o < 0.05) continue;
      const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
      // tighten to the glyph ink a little: line boxes carry ~0.28 em of air above and below
      const fs = parseFloat(getComputedStyle(e).fontSize) || 0;
      out.push({ t: e.textContent.trim(), x0: r.left, x1: r.right, y0: r.top + 0.18 * fs, y1: r.bottom - 0.18 * fs, o: +o.toFixed(2), cls: e.className || e.tagName });
    }
    return { out, ov };
  }, f);
  for (const o of res.ov) issues.push({ f, t: o.line, x0: o.A[0], x1: o.A[2], y0: o.A[1], y1: o.A[3], o: 1, cls: 'ink', why: 'E ink-overlap with «' + o.over + '»', det: o.ix + 'x' + o.iy + ' box ' + o.B.join(',') });
  for (const b of res.out) {
    const why = [];
    if (b.x0 < 63 || b.x1 > 1017 || b.y0 < 249 || b.y1 > 1621) why.push('A safe');
    if (b.y1 > 1541) why.push('B y>1540');
    if (b.x1 > 951 && b.y1 > 1100 && b.y0 < 1750) why.push('B x>950@1100-1750');
    const cy = (b.y0 + b.y1) / 2;
    if (b.x1 > 921 && cy > 900 && cy < 1650) why.push('C x>920@900-1650');
    const t = b.t.replace(/\s+/g, ' ');
    const ok = allowed.has(t) || t.split(' ').every(w => allowed.has(w)) || /^\.(pptx|docx|xlsx|pdf|mp4)$/.test(t) || /^‎?@tash\.creative(\.kw)?$/.test(t) || /^(إنستقرام|تيك توك):/.test(t);
    if (!ok) why.push('D string');
    if (why.length) issues.push({ f, ...b, why: why.join(', ') });
  }
  n++;
}
await browser.close(); srv.close();
const by = {};
for (const i of issues) { const k = `${i.why} | ${i.t.slice(0, 40)}`; (by[k] ||= []).push(i.f); }
console.log(`frames swept: ${n} (${from}-${to} step ${step}); issues: ${issues.length}`);
for (const [k, fs] of Object.entries(by)) console.log(`${k}  frames ${fs[0]}-${fs[fs.length - 1]} (${fs.length})`);
const sample = {};
for (const i of issues) { const k = `${i.why} | ${i.t.slice(0, 40)}`; if (!sample[k]) sample[k] = i; }
for (const [k, i] of Object.entries(sample)) console.log('  e.g.', `f${i.f}`, JSON.stringify({ x0: Math.round(i.x0), x1: Math.round(i.x1), y0: Math.round(i.y0), y1: Math.round(i.y1), o: i.o, cls: i.cls, det: i.det }));
