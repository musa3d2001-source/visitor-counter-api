// Minimal static server with tash/ as web root (same contract as _system/tools/render.mjs, which can't be imported
// without --page). Shared by build.mjs and shoot.mjs.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav' };

export function serve(root = ROOT) {
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

// CLI: node shoot.mjs <path-under-tash> <out.png> [width] [height]  — quick full-page screenshot for tests
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , path, out, w = 1200, h = 800] = process.argv;
  const { chromium } = await import('../../_system/tools/pw.mjs');
  const srv = await serve();
  const b = await chromium.launch({ args: ['--font-render-hinting=none', '--force-color-profile=srgb'] });
  const page = await b.newPage({ viewport: { width: +w, height: +h } });
  page.on('pageerror', e => console.error('[page error]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('[console]', m.text()); });
  await page.goto(`http://127.0.0.1:${srv.address().port}/${path}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, fullPage: true });
  await b.close(); srv.close();
  console.log(out);
}
