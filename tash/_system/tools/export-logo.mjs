// Exports every logo/lockup/avatar variant to SVG + PNG into tash/02-logo/
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from './pw.mjs';
import * as L from '../brand/logo.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, '02-logo');
const { ink, paper, lime } = L.COLORS;
for (const d of ['svg', 'png', 'avatar']) mkdirSync(join(OUT, d), { recursive: true });

const files = {
  // name: [svg, pngWidth, transparent?]
  'tash-wordmark--paper-lime': [L.wordmarkSVG({ body: paper, dot: lime }), 2400],
  'tash-wordmark--ink': [L.wordmarkSVG({ body: ink, dot: ink }), 2400],
  'tash-wordmark--lime': [L.wordmarkSVG({ body: lime, dot: lime }), 2400],
  'tash-wordmark--paper': [L.wordmarkSVG({ body: paper, dot: paper }), 2400],
  'tash-wordmark--on-ink': [L.wordmarkSVG({ body: paper, dot: lime, bg: ink, pad: 420 }), 2400],
  'tash-wordmark--on-lime': [L.wordmarkSVG({ body: ink, dot: ink, bg: lime, pad: 420 }), 2400],
  'tash-wordmark--on-paper': [L.wordmarkSVG({ body: ink, dot: ink, bg: paper, pad: 420 }), 2400],
  'tash-lockup-h--paper-lime': [L.lockupHorizontalSVG({}), 3000],
  'tash-lockup-h--ink': [L.lockupHorizontalSVG({ body: ink, dot: ink, latin: ink, sub: '#55574F', rule: '#D9D9CC' }), 3000],
  'tash-lockup-h--on-ink': [L.lockupHorizontalSVG({ bg: ink }), 3000],
  'tash-lockup-stacked--paper-lime': [L.lockupStackedSVG({}), 2000],
  'tash-lockup-stacked--on-ink': [L.lockupStackedSVG({ bg: ink }), 2000],
  'tash-lockup-stacked--on-lime': [L.lockupStackedSVG({ bg: lime, body: ink, dot: ink, latin: ink, sub: '#3A4A00' }), 2000],
  'tash-symbol-dots--lime': [L.symbolSVG({}), 1200],
  'tash-symbol-dots--ink': [L.symbolSVG({ dot: ink }), 1200],
};
const avatars = {
  'tash-avatar--lime': L.avatarSVG({}),                                   // primary: max feed contrast
  'tash-avatar--ink': L.avatarSVG({ bg: ink, body: paper, dot: lime }),   // alternate / dark contexts
};

const b = await chromium.launch();
const page = await b.newPage({ deviceScaleFactor: 1 });
async function raster(svg, width, out, transparent = true) {
  const vb = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  const h = Math.round(width * vb[3] / vb[2]);
  const sized = svg.replace('<svg ', `<svg width="${width}" height="${h}" `).replace(/ width="[\d.]+" height="[\d.]+"(?= width)/, '');
  await page.setViewportSize({ width, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
  await page.screenshot({ path: out, omitBackground: transparent, clip: { x: 0, y: 0, width, height: h } });
}
for (const [name, [svg, w]] of Object.entries(files)) {
  writeFileSync(join(OUT, 'svg', name + '.svg'), svg);
  await raster(svg, w, join(OUT, 'png', name + '.png'));
}
for (const [name, svg] of Object.entries(avatars)) {
  writeFileSync(join(OUT, 'avatar', name + '.svg'), svg);
  await raster(svg, 1080, join(OUT, 'avatar', name + '-1080.png'), false);
  await raster(svg, 320, join(OUT, 'avatar', name + '-320.png'), false);
}
await b.close();
console.log('exported', Object.keys(files).length + Object.keys(avatars).length, 'variants →', OUT);
