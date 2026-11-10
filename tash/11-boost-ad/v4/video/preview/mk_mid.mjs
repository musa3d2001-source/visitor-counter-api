// Middle-section preview, timeline f135-284 (5 s at 30 fps): the four worlds on the beat, from the real clips with the zero-credit fixes.
// Beat rows: BUILD-SPEC section 7 with R3-17..R3-23. Silent (audio is built later).
// usage: node mk_mid.mjs <out spec.json>
import { writeFileSync } from 'node:fs';
const out = process.argv[2];
const SLOT = [715, 352], DOT_X = [623, 715, 807], DOT_Y = 342, LIME = 'lime';
const pulse = (f, f0) => f - f0 === 0 ? 1.04 : f - f0 === 1 ? 1.025 : f - f0 === 2 ? 1.01 : 1;
const word = (f, f0, ink) => ({ t: 'word', key: 'mashrou3ak', size: 172 * pulse(f, f0), slot: SLOT, fill: ink ? 'ink' : 'paper', stroke: ink ? 'paper' : 'ink', lw: ink ? 12 : 16, shadow: ink ? null : { dx: 8, dy: 8, color: 'ink' }, dots: false });
const typing = f => DOT_X.map((_, j) => -Math.round(22 * Math.max(0, Math.sin(2 * Math.PI * (f / 15) - j * 2 * Math.PI / 3))));
const dots = (f, ink) => typing(f).flatMap((o, j) => { const x = DOT_X[j], y = DOT_Y + o;
  return ink ? [{ t: 'dot', x, y, r: 40, fill: 'ink', ring: { color: 'paper', lw: 8 } }]
             : [{ t: 'dot', x: x + 6, y: y + 6, r: 44, fill: 'ink' }, { t: 'dot', x, y, r: 40, fill: LIME, ring: { color: 'ink', lw: 8 } }]; });
const tag = (s, size, ink, k = 1) => ink ? { t: 'text', s, size: size * k, x: 540, y: 757, w: 800, fill: 'ink', shadow: { dx: 10, dy: 10, color: 'paper' }, rot: -4 }
                                        : { t: 'text', s, size: size * k, x: 540, y: 757, w: 800, fill: LIME, stroke: 'ink', lw: 20, shadow: { dx: 10, dy: 10, color: 'ink' }, rot: -4 };
const src = (p, n) => '/_stills/' + p + String(n).padStart(4, '0') + '.png';
const full = (p, n, o = {}) => ({ t: 'still', src: src(p, n), ...o });
const punch = (p, n, s, o = {}) => ({ t: 'still', src: src(p, n), scale: s, cx: 0.5, cy: 900 / 1920, ...o });
// lens L: circle r at (cx,cy); the source point (sx,sy) of the footage lands on the lens centre (per-shot framing so the product sits centred and whole)
const lens = (p, n, scale, cx = 540, cy = 1270, r = 340, sx = 540, sy = 1270) => [{ t: 'still', src: src(p, n), clip: { type: 'circle', x: cx, y: cy, r }, scale, cx: sx / 1080, cy: sy / 1920, ax: cx, ay: cy },
  { t: 'dot', x: cx, y: cy, r: r - 6, fill: null, ring: { color: 'ink', lw: 12 } }];
const frames = [];
const add = (f, layers, note) => frames.push({ id: String(f), tc: 'f' + f, note: note || '', layers });
for (let f = 135; f <= 284; f++) {
  let L;
  if (f < 150) L = [full('c', f - 135 + 4), tag('قهوة؟', 200, false), word(f, 135, false), ...dots(f, false)];
  else if (f < 165) { const s = f < 153 ? [1.08, 1.05, 1.02][f - 150] : 1; L = [{ t: 'fill', color: LIME }, ...lens('c', f - 150 + 68, 1.3, 540, 1270, 340 * s, 523, 1405), tag('قهوة؟', 200, true), word(f, 150, true), ...dots(f, true)]; }
  else if (f < 180) L = [full('o', f - 165), tag('عطر؟', 200, false), word(f, 165, false), ...dots(f, false)];
  else if (f < 195) { const k = f < 183 ? [1.08, 1.05, 1.02][f - 180] : 1; L = [punch('o', f - 180 + 15, 1.25), tag('عطر؟', 200, false, k), word(f, 180, false), ...dots(f, false)]; }
  else if (f < 210) { const x = f < 198 ? [540 - 340, 540 - 120, 540 - 20][f - 195] : 540; L = [{ t: 'fill', color: LIME }, ...lens('o', f - 195 + 30, 0.95, x, 1270, 340, 538, 1370), tag('عطر؟', 200, true), word(f, 195, true), ...dots(f, true)]; }
  else if (f < 225) { const n = f <= 218 ? 11 : 12 + 2 * (f - 219); L = [{ t: 'fill', color: '#20A8FC' }, full('b', n, { dy: 30 }), tag('برجر؟', 200, false), word(f, 210, false), ...dots(f, false)]; }
  else if (f < 240) { const n = 25 + 2 * (f - 225), bump = f === 225 ? -10 : f === 226 ? -5 : 0; L = [{ t: 'fill', color: '#20A8FC' }, punch('b', n, 1.2, { dy: bump }), tag('برجر؟', 200, false), word(f, 225, false), ...dots(f, false)]; }
  else if (f < 255) { const dy = f < 245 ? [-400, -150, 25, -8, 0][f - 240] : 0; L = [{ t: 'fill', color: LIME }, ...lens('b', f - 240 + 54, 0.72, 540, 1270 + dy), tag('برجر؟', 200, true), word(f, 240, true), ...dots(f, true)]; }
  else if (f < 270) L = [full('k', f - 255 + 30), tag('حلويات؟', 180, false), word(f, 255, false), ...dots(f, false)];
  else L = [{ t: 'fill', color: LIME }, ...lens('k', f - 270 + 45, 1.0), tag('حلويات؟', 180, true), word(f, 270, true), ...dots(f, true)];
  add(f, L);
}
writeFileSync(out, JSON.stringify({ title: 'middle section f135-284', frames }));
console.log('frames', frames.length);
