// Brand guide — exact-pixel rasters of the real logo (min sizes, avatar crops).
// Run from tash/:  node 01-brand-guide/src/prep-raster.mjs
// Every image is rendered by Chromium from /_system/brand/logo.mjs at deviceScaleFactor 1, i.e. the pixels a phone
// would actually show at that CSS size. The guide then shows them 1:1 and magnified (pixelated) side by side.
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../_system/tools/pw.mjs';
import * as L from '../../_system/brand/logo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'assets', 'px');
mkdirSync(OUT, { recursive: true });
const { ink, paper, lime } = L.COLORS;

const b = await chromium.launch({ args: ['--font-render-hinting=none', '--force-color-profile=srgb'] });
const page = await b.newPage({ deviceScaleFactor: 1 });

function sized(svg, w) {
  const vb = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  const h = Math.round(w * vb[3] / vb[2]);
  return { svg: svg.replace(/<svg /, `<svg width="${w}" height="${h}" `).replace(/ width="[\d.]+" height="[\d.]+"(?= width)/, ''), h };
}
// One PNG = the mark at exactly `w` CSS px on its ground, with a fixed margin so the 1:1 and zoomed views line up.
async function shot(name, svg, w, bg, m = 8, round = false) {
  const s = sized(svg, w);
  const W = w + 2 * m, H = s.h + 2 * m;
  await page.setViewportSize({ width: W, height: H });
  await page.setContent(`<html><body style="margin:0;background:${bg}"><div style="padding:${m}px;line-height:0">` +
    (round ? `<div style="width:${w}px;height:${w}px;border-radius:50%;overflow:hidden">${s.svg}</div>` : s.svg) + `</div></body></html>`);
  await page.screenshot({ path: join(OUT, name + '.png'), clip: { x: 0, y: 0, width: W, height: H } });
}

const wm = L.wordmarkSVG({ body: paper, dot: lime });
for (const w of [240, 160, 120, 96, 72, 48]) await shot(`wm-${w}`, wm, w, ink);
const wmInk = L.wordmarkSVG({ body: ink, dot: ink });
for (const w of [120, 72]) await shot(`wm-ink-${w}`, wmInk, w, paper);
const sym = L.symbolSVG({ pad: 0 });
for (const w of [48, 32, 24, 16]) await shot(`sym-${w}`, sym, w, ink);
const st = L.lockupStackedSVG({ pad: 0 });
for (const w of [400, 300, 200]) await shot(`stacked-${w}`, st, w, ink);
const lh = L.lockupHorizontalSVG({ pad: 0 });
for (const w of [600, 400, 280]) await shot(`lockup-h-${w}`, lh, w, ink);
// avatars, circle-cropped exactly as the platform does, on a light and a dark app background
for (const [k, svg] of Object.entries({ lime: L.avatarSVG({}), ink: L.avatarSVG({ bg: ink, body: paper, dot: lime }) })) {
  for (const w of [110, 40]) {
    await shot(`avatar-${k}-${w}-light`, svg, w, '#FFFFFF', 6, true);
    await shot(`avatar-${k}-${w}-dark`, svg, w, '#000000', 6, true);
  }
}
await b.close();
console.log('rasters →', OUT);
