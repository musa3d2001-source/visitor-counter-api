// Bidi audit for the guide: for every <bdi> (and .k / .en LTR runs) checks that characters are laid out
// left→right on screen, i.e. visual x increases with logical order. Run from tash/: node 01-brand-guide/src/bidi-check.mjs
import { chromium } from '../../_system/tools/pw.mjs';
import { serve } from './serve.mjs';

const srv = await serve();
const b = await chromium.launch({ args: ['--font-render-hinting=none'] });
const page = await b.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto(`http://127.0.0.1:${srv.address().port}/01-brand-guide/brand-guide.html`);
await page.waitForFunction(() => window.GUIDE_READY === true, null, { timeout: 90000 });
const bad = await page.evaluate(() => {
  const out = [];
  const pages = [...document.querySelectorAll('.page')];
  const els = document.querySelectorAll('bdi, .k, .en, .lbl');
  for (const el of els) {
    if (el.closest('svg')) continue;
    const pg = pages.findIndex(p => p.contains(el)) + 1;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const xs = [];
    let n;
    while ((n = walker.nextNode())) {
      for (let i = 0; i < n.length; i++) {
        const ch = n.data[i];
        if (/\s/.test(ch) || /[؀-ۿ]/.test(ch)) continue;      // skip spaces and Arabic letters
        const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
        const rc = r.getClientRects()[0]; if (!rc) continue;
        xs.push({ ch, x: rc.left, y: Math.round(rc.top) });
      }
    }
    // within each visual line, logical order must be left→right
    for (let i = 1; i < xs.length; i++) {
      if (xs[i].y === xs[i - 1].y && xs[i].x < xs[i - 1].x - 0.5) {
        out.push({ page: pg, text: el.textContent.trim().slice(0, 60), at: xs[i - 1].ch + xs[i].ch });
        break;
      }
    }
  }
  return out;
});
console.log(bad.length ? bad.map(o => `p${o.page}  [${o.at}]  ${o.text}`).join('\n') : 'all LTR runs read left→right');
await b.close(); srv.close();
