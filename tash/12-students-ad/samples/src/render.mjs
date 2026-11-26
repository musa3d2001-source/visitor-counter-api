// Render one standalone sample HTML to a PNG at an exact pixel size.
// Usage: node render.mjs <name|path.html> <width> <height> [out.png]
//   node render.mjs deck-school-01-title 1920 1080
// <name> resolves to ./<name>.html and writes ../<name>.png unless [out.png] is given.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const [, , nameArg, wArg, hArg, outArg] = process.argv;
if (!nameArg || !wArg || !hArg) {
  console.error('usage: node render.mjs <name|path.html> <width> <height> [out.png]');
  process.exit(2);
}
const htmlPath = nameArg.endsWith('.html') ? path.resolve(nameArg) : path.join(here, `${nameArg}.html`);
const base = path.basename(htmlPath, '.html');
const outPath = outArg ? path.resolve(outArg) : path.join(here, '..', `${base}.png`);
const width = parseInt(wArg, 10);
const height = parseInt(hArg, 10);
if (!fs.existsSync(htmlPath)) {
  console.error(`not found: ${htmlPath}`);
  process.exit(2);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const failed = [];
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`));
  const notLoaded = fonts.filter((f) => !f.endsWith('loaded'));
  if (notLoaded.length) console.error('fonts declared but not used/loaded:', notLoaded.join(' | '));
  if (failed.length) console.error('failed requests:', failed.join(' | '));
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width, height }, type: 'png' });
  console.log(`${outPath}  ${width}x${height}`);
} finally {
  await browser.close();
}
