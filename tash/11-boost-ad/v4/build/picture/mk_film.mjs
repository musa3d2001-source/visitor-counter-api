// TASH boost ad v4 «نقاط مشروعك»: the whole film as compositor specs (one layer list per frame), for sb/compose.mjs.
// Rows: BUILD-SPEC.md sections 5, 7, 11 and section 15 (Revision 3, R3-1..R3-24, which wins). Footage = frames prepared by prep_all.py.
// usage: node mk_film.mjs --len 20|14 --plat ig|tt --fmt 916|45 [--sweet kunafa|cake] --out <dir> [--chunks 3]
// Worlds (owner's note, 10 Nov): footage from earlier TASH works per swap_manifest.json (HABBA coffee, LAYL perfume, STAKK burger;
// sweet = kunafa by default, DOSE cake only with the owner's written yes). Frames prepared by prep_swap.py.
//   -> <dir>/film.json (all frames) and <dir>/film.<i>.json (chunks for parallel renders). Frame ids are 4-digit frame numbers.
// Pure function of the frame number: no state between frames; seeded tables only.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const A = process.argv.slice(2), arg = (k, d) => { const i = A.indexOf('--' + k); return i >= 0 ? A[i + 1] : d; };
const LEN = +arg('len', 20), PLAT = arg('plat', 'ig'), FMT = arg('fmt', '916'), OUT = arg('out'), CHUNKS = +arg('chunks', 1), SWEET = arg('sweet', 'kunafa');
if (!['kunafa', 'cake'].includes(SWEET)) throw new Error('--sweet kunafa|cake');
if (!OUT || ![20, 14].includes(LEN) || !['ig', 'tt'].includes(PLAT) || !['916', '45'].includes(FMT)) throw new Error('usage: --len 20|14 --plat ig|tt --fmt 916|45 --out dir');
const R45 = FMT === '45', N = LEN === 20 ? 600 : 420;

// ---------------- palette, geometry ----------------
const TANG = '#FF7A1A', PINK = '#FF4F9A', AZURE = '#1EA7FF', GREY = '#DCDCD0', CLEAR = 'rgba(0,0,0,0)';
const T = R45 ? -208 : 0;                 // type layer offset (4:5: every y in the spec minus 208)
const FD = R45 ? -285 : 0;                // footage offset (4:5: source rows 285-1635)
const HH = R45 ? 1350 : 1920;             // visible height
const DROP = HH - FD;                     // a third has left the frame after this many px
const RMAX = R45 ? 1800 : 2300;           // iris / shockwave end radius
const SLOT = [715, 352 + T], DOT_X = [623, 715, 807], DOT_Y = 342 + T, AMP = R45 ? 18 : 22;
const TAG_Y = R45 ? 530 : 757, TAG_K = R45 ? 0.85 : 1;            // 4:5 tag 170 px (153 for «حلويات؟»), baseline 530 (R3-10)
const LENS = R45 ? { x: 540, y: 985, r: 300, k: 0.88 } : { x: 540, y: 1270, r: 340, k: 1 };
const FLOOR_Y = R45 ? 962 : 1170;          // drained dots (R3-4)
const PORT_Y = 1125 + T;
const RS = R45 ? 30 : 35, PS = R45 ? 70 : 80;   // dot radius and pitch at the 81 step (4:5 is shorter: Ø60)

// ---------------- easing ----------------
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutBack = (t, c1 = 1.70158) => { const c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };
const easeOutCubic = t => 1 - (1 - t) ** 3;
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const pop = d => d === 0 ? 1.12 : d === 1 ? 1.04 : 1;                       // per-word entrance (word appears whole, never per letter)

// ---------------- W «مشروعك», its dots, type ----------------
const pulseAt = (f, cuts) => { for (const c of cuts) { const d = f - c; if (d === 0) return 1.025; if (d === 1) return 1.015; if (d === 2) return 1.005; } return 1; };   // R3-24 cap
const word = (k = 1, o = {}) => ({ t: 'word', key: 'mashrou3ak', size: 172 * k, slot: SLOT, fill: 'paper', stroke: 'ink', lw: 16, shadow: { dx: 8, dy: 8, color: 'ink' }, dots: false, ...o });
const wordInk = (k = 1, o = {}) => word(k, { fill: 'ink', stroke: 'paper', lw: 12, shadow: null, ...o });
const wordHollow = (o = {}) => word(1, { fill: CLEAR, stroke: 'ink', lw: 8, shadow: null, ...o });
const typing = (f, amp = AMP) => [0, 1, 2].map(j => -Math.round(amp * Math.max(0, Math.sin(2 * Math.PI * (f / 15) - j * 2 * Math.PI / 3))));   // period 15 f, 5 f lag (R3-24)
const disc = (x, y, r = 40, o = {}) => [{ t: 'dot', x: x + 6, y: y + 6, r: r + 4, fill: 'ink', ...o }, { t: 'dot', x, y, r, fill: 'lime', ring: { color: 'ink', lw: 8 }, ...o }];
const dotsLime = (f, o = {}) => typing(f).flatMap((d, j) => disc(DOT_X[j], DOT_Y + d, 40, o));
const dotsInk = f => typing(f).map((d, j) => ({ t: 'dot', x: DOT_X[j], y: DOT_Y + d, r: 40, fill: 'ink', ring: { color: 'paper', lw: 8 } }));
const dashed = js => js.map(j => ({ t: 'dot', x: DOT_X[j], y: DOT_Y, r: 40, fill: null, ring: { color: 'ink', lw: 5, dash: [8, 7] } }));
const tagLime = (s, size = 200, k = 1, o = {}) => ({ t: 'text', s, size: size * TAG_K * k, x: 540, y: TAG_Y, w: 800, fill: 'lime', stroke: 'ink', lw: 20, shadow: { dx: 10, dy: 10, color: 'ink' }, rot: -4, ...o });
const tagInk = (s, size = 200, k = 1) => ({ t: 'text', s, size: size * TAG_K * k, x: 540, y: TAG_Y, w: 800, fill: 'ink', shadow: { dx: 10, dy: 10, color: 'paper' }, rot: -4 });
const text = (s, size, y, o = {}) => ({ t: 'text', s, size, x: 540, y, w: 800, fill: 'ink', ...o });      // y absolute
const handle = (s, y, o = {}) => ({ t: 'text', s, size: 60, x: 540, y, w: 600, font: '"JetBrains Mono"', dir: 'ltr', fill: 'ink', ...o });

// ---------------- footage ----------------
const src = (p, n) => '/_stills/' + p + String(n).padStart(4, '0') + '.png';
const full = (p, n, o = {}) => ({ t: 'still', src: src(p, n), ...o, dy: FD + (o.dy ?? 0) });
const punch = (p, n, s, o = {}) => ({ t: 'still', src: src(p, n), scale: s, cx: 0.5, cy: 900 / 1920, ax: 540, ay: 900 + FD, ...o });   // about source (540,900)
// lens L: source point (sx,sy) lands on the lens centre; dx/dy = entrance offset (9:16 px), k = entrance size factor (lens and picture pop together), push = slow push-in
const lens = (p, n, scale, sx, sy, { dx = 0, dy = 0, k = 1, push = 1 } = {}) => { const x = LENS.x + dx * LENS.k, y = LENS.y + dy * LENS.k, r = LENS.r * k;
  return [{ t: 'still', src: src(p, n), clip: { type: 'circle', x, y, r }, scale: scale * LENS.k * k * push, cx: sx / 1080, cy: sy / 1920, ax: x, ay: y },
    { t: 'dot', x, y, r: r - 6, fill: null, ring: { color: 'ink', lw: 12 } }]; };
const pushIn = (f, f0) => 1 + 0.04 * (f - f0) / 14;

// ---------------- footage per use, from swap_manifest.json (one place to swap worlds) ----------------
const MAN = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'swap_manifest.json'), 'utf8'));
const USES = new Map([...MAN.uses.coffee, ...MAN.uses.perfume, ...MAN.uses.burger, ...MAN.sweet[SWEET]].map(u => [u.id, u]));
const VK = LEN === 20 ? 'A20' : 'A14';
// native frame of use `id` at timeline frame f (or at offset i into the use when f is null)
function nat(id, f, i = null) {
  const u = USES.get(id); if (!u) throw new Error('no use ' + id);
  const R = u[VK]; if (!R && !u.rule.includes('frozen')) throw new Error(`use ${id} has no ${VK} range`);
  const list = (R && R.n) || u.n, f0 = R && R.f ? R.f[0] : 0, k = i ?? (f - f0);
  if (k < 0 || k >= list.length) throw new Error(`use ${id}: frame ${f} (index ${k}) outside its range`);
  return list[k];
}
const geo = id => USES.get(id)[FMT];
// one footage layer of a use: full (final canvas dy), punch, band; lens and porthole are built by their own helpers
function useLayer(id, f, o = {}, i = null) {
  const u = USES.get(id), g = geo(id), n = nat(id, f, i), s = src(u.prefix, n);
  if (u.kind === 'full') return { t: 'still', src: s, ...o, dy: (g.dy ?? 0) + (o.dy ?? 0) };
  if (u.kind === 'punch') return { t: 'still', src: s, scale: g.scale * (o.push ?? 1), cx: g.sx / 1080, cy: g.sy / 1920, ax: g.ax, ay: g.ay, dy: o.dy ?? 0 };
  if (u.kind === 'band') return { t: 'still', src: s, ...o, dy: g.dy };
  throw new Error('useLayer: ' + u.kind);
}
const useLens = (id, f, o) => { const u = USES.get(id), g = geo(id); return lens(u.prefix, nat(id, f), g.scale, g.sx, g.sy, o); };
const SH = {
  hook: f => f < 15 ? useLayer('opener-full', f) : useLayer('opener-punch', f),   // f0-14 wide, f15-29 punch-in on the clap
  drain: (f, o) => useLayer('drain', f, o),          // f30-44, the thirds (the sweet)
  ret: (f, o) => useLayer('return', f, o),           // f78-89, inside the repaint circles
  hold: () => useLayer('hold', 90),                  // f90-92, outside the shockwave
  iris: f => useLayer('iris', f),                    // f131-134, the centre porthole opens onto the first world
  loop: (o = {}) => useLayer('loop', null, o, 0),    // wind-up iris and the end = the f0 picture frozen
};

// ---------------- TASH wordmark M: box top-left (x0,y0), width w; k scales it about the box centre ----------------
const MH = 1461 / 2579;
const mark = (x0, y0, w, o = {}) => { const s = w / 2579; return { t: 'mark', x: x0 + 1080 * s, y: y0 + 437 * s, scale: s, fill: 'ink', dotFill: 'ink', ...o }; };
const markK = (x0, y0, w, k, o = {}) => { const cx = x0 + w / 2, cy = y0 + w * MH / 2, w2 = w * k; return mark(cx - w2 / 2, cy - w2 * MH / 2, w2, o); };
const markDots = (x0, y0, w) => { const s = w / 2579, cx = x0 + 1080 * s, cy = y0 + 437 * s; return { cx, cy, pitch: 212 * s, r: 90 * s }; };
const markTyping = (x0, y0, w, offs, o = {}) => { const d = markDots(x0, y0, w);
  return [mark(x0, y0, w, { dots: false, ...o }), ...[-1, 0, 1].map((n, j) => ({ t: 'dot', x: d.cx + n * d.pitch, y: d.cy + offs[j], r: d.r, fill: 'ink', ...o }))]; };

// ---------------- seeded tables ----------------
const lcg = seed => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
const inRail = (x, y, r = 0) => !R45 && x + r > 960 && y + r > 1100 && y - r < 1750;
// burst (R3-8): n triplets in the three world colours on rays from C, clear of `box` (+70 px) and of the TikTok rail; final positions
function burstTable(seed, n, C, box) {
  const rnd = lcg(seed), cols = [TANG, PINK, AZURE], placed = [], out = []; let k = 0, guard = 0;
  const hitsBox = (x, y, r) => x + r > box.x0 && x - r < box.x1 && y + r > box.y0 && y - r < box.y1;
  while (k < n && guard++ < 200000) {
    const ang = rnd() * Math.PI * 2, d0 = 250 + rnd() * 1150, R = 22 + rnd() * 26, ux = Math.cos(ang), uy = Math.sin(ang);
    let d = d0; const pts = [0.78, 0.89, 1].map(q => { const r = R * q, p = { d, r }; d += r * 2.42; return p; });
    const xy = p => ({ x: C.x + ux * p.d, y: C.y + uy * p.d, r: p.r });
    const P = pts.map(xy), P2 = pts.map(p => xy({ d: p.d + 45, r: p.r }));    // + room for the slow drift after f400
    if ([...P, ...P2].some(p => hitsBox(p.x, p.y, p.r) || inRail(p.x, p.y, p.r + 30) || (R45 ? p.y < 30 : p.x < p.r * 0.3 || p.x > 1080 - p.r * 0.3 || p.y < 40 || p.y > HH - 30))) continue;   // 4:5: dots may fly off the frame
    if (P.some(p => placed.some(q => Math.hypot(p.x - q.x, p.y - q.y) < p.r + q.r + 26))) continue;
    placed.push(...P); out.push({ ux, uy, pts, c: cols[k % 3] }); k++;
  }
  if (k < n) throw new Error(`burst: placed ${k} of ${n}`);
  return out;
}
// multiplication rows: exact copies of W's dot row (R3-7)
const ROWS27 = [[290, 930], [720, 970], [400, 1100], [800, 1140], [280, 1270], [700, 1310], [410, 1440], [790, 1480]].map(([x, y]) => [x, y + T]);
const ROWS9 = [ROWS27[2], ROWS27[5]];
function rows81() {                       // 18 more rows (Ø70, pitch 80) seeded over the free frame: clear of W, the talk line, the rail and every other dot
  const rnd = lcg(81081), dots = [], out = [];
  ROWS27.forEach(([x, y]) => [-1, 0, 1].forEach(n => dots.push({ x: x + n * 92, y: y - 11, r: 51 })));
  const boxes = [{ x0: 130, y0: 262 + T, x1: 950, y1: 565 + T }, { x0: 110, y0: 612 + T, x1: 970, y1: 802 + T }];
  const hitBox = (x, y, r) => boxes.some(b => x + r > b.x0 && x - r < b.x1 && y + r > b.y0 && y - r < b.y1);
  for (let gap = 24; gap >= 2 && out.length < 18; gap -= 2) for (let g = 0; g < 60000 && out.length < 18; g++) {
    const x = 125 + rnd() * 830, y = 40 + rnd() * (HH - 80), D = [-PS, 0, PS].map(o => ({ x: x + o, y: y - 8, r: RS + 8 }));
    if (D.some(d => hitBox(d.x, d.y, d.r) || inRail(d.x, d.y + 8, RS) || d.x - RS < 12 || d.x + RS > 1068 || d.y - d.r < 24 || d.y + d.r > HH - 12)) continue;
    if (D.some(d => dots.some(q => Math.hypot(d.x - q.x, d.y - q.y) < d.r + q.r + gap))) continue;
    dots.push(...D); out.push([Math.round(x), Math.round(y)]);
  }
  if (out.length < 18) console.error(`rows81: only ${out.length} of 18 rows fit (${3 + 3 * (8 + out.length)} dots)`);
  return out;
}
const R81 = rows81();
const row = (cx, cy, offs, r = 40, pitch = 92, o = {}) => [-1, 0, 1].flatMap((n, j) => disc(cx + n * pitch, cy + offs[j], r, o));

// ---------------- variant timing ----------------
const V = LEN === 20 ? {
  cats: [
    { f0: 135, use: 'coffee-a', tag: 'قهوة؟' },
    { f0: 150, use: 'coffee-b-lens', tag: 'قهوة؟', enter: 'pop' },
    { f0: 165, use: 'oud-a', tag: 'عطر؟' },
    { f0: 180, use: 'oud-b', tag: 'عطر؟', tagPop: true },
    { f0: 195, use: 'oud-c-lens', tag: 'عطر؟', enter: 'slide' },
    { f0: 210, use: 'burger-a', tag: 'برجر؟' },
    { f0: 225, use: 'burger-b', tag: 'برجر؟', bump: true },
    { f0: 240, use: 'burger-c-lens', tag: 'برجر؟', enter: 'drop' },
    { f0: 255, use: 'sweet-a', tag: 'حلويات؟', size: 180 },
    { f0: 270, use: 'sweet-lens', tag: 'حلويات؟', size: 180 }],
  talk: 285, talk2: 291, mult: [330, 345, 360], grounds: [TANG, PINK, AZURE], flood: 375,
  snap: 390, shrink: true, tagline: [402, 404, 406], cta: 450, ctaIn: [453, 457, 461, 463],
  band: [{ f0: 450, f1: 479, use: 'sweet-band' }, { f0: 480, f1: 509, use: 'burger-band' }, { f0: 510, f1: 539, use: 'oud-band' }, { f0: 540, f1: 587, use: 'coffee-band' }],
  wind: 588, irisLen: 6,
} : {
  cats: [
    { f0: 135, use: 'coffee-a', tag: 'قهوة؟' },
    { f0: 150, use: 'coffee-b-lens', tag: 'قهوة؟', enter: 'pop' },
    { f0: 165, use: 'oud-a', tag: 'عطر؟' },
    { f0: 180, use: 'oud-c-lens', tag: 'عطر؟', enter: 'slide' },
    { f0: 195, use: 'burger-a', tag: 'برجر؟' },
    { f0: 210, use: 'burger-b', tag: 'برجر؟', bump: true },
    { f0: 225, use: 'sweet-a', tag: 'حلويات؟', size: 180 },
    { f0: 240, use: 'sweet-lens', tag: 'حلويات؟', size: 180 }],
  talk: 255, talk2: 260, mult: [270, 275, 280], grounds: [TANG, TANG, TANG], flood: 285,
  snap: 300, shrink: false, tagline: null, cta: 315, ctaIn: [316, 318, 320, 321],
  band: [{ f0: 315, f1: 344, use: 'sweet-band' }, { f0: 345, f1: 374, use: 'burger-band' }, { f0: 375, f1: 413, use: 'coffee-band' }],
  wind: 414, irisLen: 3,
};
const CATS_END = V.talk, CUTS = [15, 30, ...V.cats.map(c => c.f0), V.talk, ...new Set(V.mult)];

// ---------------- sections ----------------
const frames = [];
const add = (f, sec, layers) => frames.push({ id: String(f).padStart(4, '0'), tc: `f${f}`, note: sec, layers });

// f0-29 hook: n2-n16 wide; f15-27 n6-n18 in the 1.25x punch-in, n18 held f28-29 (R3-22b). «حلو…» slams in at f3, pulses on f15.
const hookTag = f => f < 3 ? 0 : f === 3 ? 230 : f === 4 ? 212 : f >= 15 && f <= 17 ? [216, 208, 202][f - 15] : 200;
function hook(f) {
  const L = [SH.hook(f)];
  if (hookTag(f)) L.push(tagLime('حلو…', hookTag(f)));
  return [...L, word(pulseAt(f, [15])), ...dotsLime(f)];
}
// f30-44 drain (R3-2, R3-3, R3-14): kunafa n30-44; dots fall at f32/34/36 dragging the right, middle, left thirds; W hollow third by third
const FALL = [{ j: 2, f0: 32, x0: 720 }, { j: 1, f0: 34, x0: 360 }, { j: 0, f0: 36, x0: 0 }];
const drop = (f, f0) => f < f0 ? 0 : Math.round(DROP * clamp((f - f0) / 9) ** 2);
function drain(f) {
  const L = [{ t: 'fill', color: GREY }];
  for (const F of FALL) if (drop(f, F.f0) < DROP) L.push(SH.drain(f, { clip: { x: F.x0, y: 0, w: 360, h: 1920 }, dy: drop(f, F.f0) }));
  if (f <= 33) L.push(tagLime('حلو…', 200, f === 32 ? 0.84 : f === 33 ? 0.62 : 1, { alpha: f === 32 ? 0.6 : f === 33 ? 0.22 : 1 }));   // own 2-frame exit
  for (const F of FALL) L.push(f >= F.f0 ? wordHollow({ clip: { x: F.x0, y: 0, w: 360, h: 1920 } }) : word(pulseAt(f, [30]), { clip: { x: F.x0, y: 0, w: 360, h: 1920 } }));
  L.push(...dashed(FALL.filter(F => f >= F.f0).map(F => F.j)));
  const ty = typing(f);
  for (const F of FALL) if (f < F.f0) L.push(...disc(DOT_X[F.j], DOT_Y + ty[F.j]));
  for (const F of FALL) if (f >= F.f0) { const t = clamp((f - F.f0) / 9), y = DOT_Y + drop(f, F.f0), r = 40 + 90 * t;
    const x = lerp(DOT_X[F.j], F.x0 + 180, easeOutCubic(clamp((f - F.f0) / 3)));   // each dot moves over the third it drags (review m10)
    if (y - r < HH) L.push({ t: 'dot', x: x + 8, y: y + 8, r: r + 4, fill: 'ink' }, { t: 'dot', x, y, r, fill: 'lime', ring: { color: 'ink', lw: 8 } }); }
  return L;
}
// f45-89 dead beat and return (R3-4, R3-14): drained Smoke dots drop onto the floor f45-50, turn Lime f72, jump and land right to left f78/81/84
const FLOOR = [{ x: 660, j: 2, land: 78 }, { x: 540, j: 1, land: 81 }, { x: 420, j: 0, land: 84 }];
const FLOOR_IN = [-170, -100, -30, 0, -12, 0];
const deadLine = f => text('محد يسولف؟', 126 * pop(f - 45), 740 + T, f >= 78 ? { stroke: 'paper', lw: 12 } : {});   // Paper keyline once the coffee returns under it
function dead(f) {
  const L = [{ t: 'fill', color: GREY }, wordHollow()];
  const landed = FLOOR.filter(D => f >= D.land);
  for (const D of landed) { const r = (f - D.land) * 260; if (r <= 0) continue; const C = { type: 'circle', x: DOT_X[D.j], y: DOT_Y, r };
    L.push(SH.ret(f, { clip: C }), word(1, { clip: C })); }
  for (const D of landed) { const r = (f - D.land) * 260; if (r <= 0) continue;
    L.push({ t: 'dot', x: DOT_X[D.j], y: DOT_Y, r: r - 5, fill: null, ring: { color: 'lime', lw: 10 } }, { t: 'dot', x: DOT_X[D.j], y: DOT_Y, r: r + 3, fill: null, ring: { color: 'ink', lw: 6 } }); }
  L.push(...dashed(FLOOR.filter(D => f < D.land).map(D => D.j)));
  const ty = typing(f);
  for (const D of FLOOR) {
    const start = D.land - 6;
    if (f < start) {                                             // on the floor: Smoke until f72, then Lime
      const y = FLOOR_Y + (f - 45 < FLOOR_IN.length ? FLOOR_IN[f - 45] : 0);
      if (f < 72) L.push({ t: 'dot', x: D.x, y, r: 50, fill: 'smoke', ring: { color: 'ink', lw: 8 } }); else L.push(...disc(D.x, y, 50));
    } else if (f < D.land) { const t = (f - start) / 6;                         // the jump onto the ش (overshoot 2 px)
      const JF = [0, 0.38, 0.785, 0.964, 1.005, 1.0];                    // no frame inside the line band (review m5)
      L.push(...disc(lerp(D.x, DOT_X[D.j], t), lerp(FLOOR_Y, DOT_Y, JF[f - start]), lerp(50, 40, t)));
    } else { const k = clamp((f - D.land) / 3); L.push(...disc(DOT_X[D.j], DOT_Y + Math.round(ty[D.j] * k))); }
  }
  L.push(deadLine(f));                                            // the line stays on top: the jumping dots pass behind it, never over it
  return L;
}
// f90-134 offer card: shockwave from the middle dot, M slams, offer line; three copies of M's dots drop and open as portholes; centre iris onto the coffee
const OM = { x0: 320, y0: 290 + T, w: 440 };
const IR = Math.hypot(540, Math.max(PORT_Y, HH - PORT_Y)) + 12;    // the iris covers the frame exactly on f134
const shockR = f => (R45 ? 1800 : 1744) * (1 - (1 - clamp((f - 89) / 4)) ** 2);   // front visible for 3 frames (review m9)
const PORTS = [   // right to left (swap_manifest): perfume, coffee (becomes the iris), burger
  { fo: 105, use: 'porthole-right' }, { fo: 108, use: 'porthole-centre' }, { fo: 111, use: 'porthole-left' }].map(P => ({ ...P, x: geo(P.use).x }));
function offer(f) {
  const L = [];
  if (f < 93) {                                                   // outside the wave: the f89 picture held
    L.push(SH.hold(), word(), ...dotsLime(89), deadLine(89));
    const r = shockR(f); L.push({ t: 'fill', color: 'lime', clip: { type: 'circle', x: 715, y: DOT_Y, r } }, { t: 'dot', x: 715, y: DOT_Y, r: r + 12, fill: null, ring: { color: 'ink', lw: 24 } });
  } else L.push({ t: 'fill', color: 'lime' });
  if (f >= 134) return [SH.iris(f), word(), ...dotsLime(f)];        // iris complete: the world, W and its dots (review m3)
  const k = f < 94 ? 1 + 0.3 * (1 - easeOutBack((f - 90) / 4)) : 1;
  const md = markDots(OM.x0, OM.y0, OM.w);
  for (const P of PORTS) {                                        // drop f(fo-4)..fo, open fo..fo+6 (easeOutBack)
    if (f < P.fo - 1) continue;
    const y = PORT_Y;
    if (f < P.fo) { if (f === P.fo - 1) L.push({ t: 'dot', x: P.x, y: y - 45, r: 20, fill: 'ink' }); continue; }   // never inside the text block (review m4)
    if (P.x === 540 && f >= 131) continue;                         // the centre porthole becomes the iris
    const r = 22 + 88 * easeOutBack(clamp((f - P.fo) / 6));
    if (r < 34) { L.push({ t: 'dot', x: P.x, y, r, fill: 'ink' }); continue; }
    const g = geo(P.use), u = USES.get(P.use);
    L.push({ t: 'still', src: src(u.prefix, nat(P.use, f)), clip: { type: 'circle', x: P.x, y, r }, scale: g.scale, cx: g.sx / 1080, cy: g.sy / 1920, ax: P.x, ay: y },
      { t: 'dot', x: P.x, y, r: r - 6, fill: null, ring: { color: 'ink', lw: 12 } });
  }
  if (f >= 131) { const r = 110 + (IR - 110) * ((f - 130) / 4) ** 2, C = { type: 'circle', x: 540, y: PORT_Y, r };   // under the offer line: it stays clean to f133 (review T3)
    L.push({ ...SH.iris(f), clip: C }, { t: 'dot', x: 540, y: PORT_Y, r: r - 12, fill: null, ring: { color: 'ink', lw: 24 } }); }
  L.push(markK(OM.x0, OM.y0, OM.w, k));                           // M and the offer line stay on top of the iris to f133
  L.push(text('خلّ إعلانك', 120 * pop(f - 90), 720 + T));
  if (f >= 93) L.push(text('علينا', 150 * pop(f - 93), 945 + T));
  return L;
}
// categories (R3-23, R3-24): worlds on the beat, lens beats on Lime
function cats(f) {
  const i = V.cats.findLastIndex(c => f >= c.f0), C = V.cats[i], d = f - C.f0, size = C.size ?? 200, pw = pulseAt(f, [C.f0]);
  const kind = USES.get(C.use).kind, onLime = kind === 'lens';
  let L;
  if (kind === 'lens') {
    const o = { push: pushIn(f, C.f0) };
    if (C.enter === 'pop' && d < 3) o.k = [1.08, 1.05, 1.02][d];
    if (C.enter === 'slide' && d < 3) o.dx = [-340, -120, -20][d];
    if (C.enter === 'drop' && d < 5) o.dy = [-74, -46, -12, -3, 0][d];          // settles downward only (review m8: no upward rebound)
    L = [{ t: 'fill', color: 'lime' }, ...useLens(C.use, f, o)];
  } else if (kind === 'punch') L = [useLayer(C.use, f, { push: C.bump ? pushIn(f, C.f0) : 1, dy: C.bump && d < 2 ? [-10, -5][d] : 0 })];
  else L = [useLayer(C.use, f)];
  const tk = C.tagPop && d < 3 ? [1.05, 1.03, 1.01][d] : 1;
  if (onLime) L.push(tagInk(C.tag, size, tk), wordInk(pw), ...dotsInk(f)); else L.push(tagLime(C.tag, size, tk), word(pw), ...dotsLime(f));
  return L;
}
// talk + multiplication + flood (R3-7)
const TALK = 'شنو حسابهم؟!', TALK_Y = 740 + T, SPLIT = 695;      // «شنو» is the right-hand word: measured gap x 674-716 at 114 px
function talkLine(f, o = {}) {
  const L = [], d1 = f - V.talk, d2 = f - V.talk2, rise = d => d === 0 ? 10 : d === 1 ? 3 : 0;
  L.push(text(TALK, 114, TALK_Y + rise(d1), { clip: { x: SPLIT, y: 0, w: 1080 - SPLIT, h: 1920 }, ...o }));
  if (d2 >= 0) L.push(text(TALK, 114, TALK_Y + rise(d2), { clip: { x: 0, y: 0, w: SPLIT, h: 1920 }, ...o }));
  return L;
}
const ARC = (x0, y0, x1, y1, t) => { const x = lerp(x0, x1, t), y = lerp(y0, y1, t), dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, b = Math.sin(Math.PI * t) * 70;
  return [x - dy / len * b, y + dx / len * b]; };
function multRows(f) {                                           // all loose rows present at frame f, with their arc state
  const [m1, m2, m3] = V.mult, L = [];
  const step = (rows, f0, r, pitch, idx0) => rows.forEach(([cx, cy], i) => {
    const d = f - f0, id = idx0 + i, ph = typing(f + 5 * (id % 3) + 3 * id, r === 40 ? AMP : 16);
    if (d < 0) return;
    if (d < 2) { const t = (d + 1) / 3, [x, y] = ARC(715, DOT_Y, cx, cy, t), [xp, yp] = ARC(715, DOT_Y, cx, cy, d / 3);
      if (d === 1) [-1, 0, 1].forEach(n => L.push({ t: 'dot', x: xp + n * pitch, y: yp, r: r * 0.8, fill: 'lime', alpha: 0.35 }));   // trail: no shadow, never on W's own dots (review m6/T2)
      L.push(...row(x, y, [0, 0, 0], r * lerp(0.7, 1, t), pitch)); }
    else L.push(...row(cx, cy, ph, r, pitch));
  });
  const big = f >= m3;
  step(ROWS9, m1, big ? RS : 40, big ? PS : 92, 0);
  step(ROWS27.filter(r => !ROWS9.includes(r)), m2, big ? RS : 40, big ? PS : 92, 2);
  step(R81, m3, RS, PS, 8);
  return L;
}
function talk(f) {
  const g = f < V.mult[0] ? 'paper' : V.grounds[f < V.mult[1] ? 0 : f < V.mult[2] ? 1 : 2];
  const onColour = f >= V.mult[0];
  return [{ t: 'fill', color: g }, ...multRows(f), wordInk(pulseAt(f, [V.talk, ...V.mult])), ...dotsLime(f), ...talkLine(f, onColour ? { stroke: 'paper', lw: 12 } : {})];   // rows under the word and the line (review T2)
}
function flood(f) {
  const t = clamp((f - V.flood) / 12), e = easeInOut(t), ring = 1 - clamp((f - V.flood) / 6);
  if (t >= 1) return [{ t: 'fill', color: 'lime' }];
  const L = [{ t: 'fill', color: V.grounds[2] }, wordInk(), ...talkLine(f, { stroke: 'paper', lw: 12 })];
  const grow = (x, y, r0, r1) => { const r = r0 + e * (r1 - r0); if (ring > 0) L.push({ t: 'dot', x: x + 6, y: y + 6, r: r + 4, fill: 'ink', alpha: ring });
    L.push({ t: 'dot', x, y, r, fill: 'lime' }); if (ring > 0) L.push({ t: 'dot', x, y, r, fill: null, ring: { color: 'ink', lw: 8 }, alpha: ring }); };
  const ty = typing(f, 16);
  [...ROWS27, ...R81].forEach(([cx, cy], i) => [-1, 0, 1].forEach((n, j) => grow(cx + n * PS, cy + ty[(j + i) % 3], RS, RS + 190)));
  typing(f).forEach((d, j) => grow(DOT_X[j], DOT_Y + d, 40, 1150));
  return L;
}
// snap + tagline (R3-8): M 840 slams on Lime, its dots solid Ink; 81 burst dots on rays; A-20: M shrinks to 440 at f400-402, tagline per word
const BIG = { x0: 120, y0: 300 + T, w: 840 }, SMALL = { x0: 320, y0: 290 + T, w: 440 };
const BURST = burstTable(20261110, 27, { x: 540, y: 538 + T }, { x0: 50 - 70, y0: 230 + T - 70, x1: 1030 + 70, y1: (V.tagline ? 960 : 846) + T + 40 });
function burst(f) {
  const d = f - V.snap, e = easeOutCubic(clamp(d / 10)), drift = Math.max(0, d - 10) * 0.8, C = { x: 540, y: 538 + T };
  return BURST.flatMap(b => b.pts.map(p => ({ t: 'dot', x: +(C.x + b.ux * (p.d * e + drift)).toFixed(1), y: +(C.y + b.uy * (p.d * e + drift)).toFixed(1), r: +(p.r * lerp(0.5, 1, e)).toFixed(1), fill: b.c })));
}
function snap(f) {
  const d = f - V.snap, L = [{ t: 'fill', color: 'lime' }, ...(d > 0 ? burst(f) : [])];   // the slam frame is the wordmark alone (review T6)
  if (d < 4) L.push(markK(BIG.x0, BIG.y0, BIG.w, 1 + 0.3 * (1 - easeOutBack(d / 4))));
  else if (!V.shrink || d < 10) L.push(mark(BIG.x0, BIG.y0, BIG.w));
  else { const t = easeInOut(clamp((d - 9) / 3)); L.push(mark(lerp(BIG.x0, SMALL.x0, t), lerp(BIG.y0, SMALL.y0, t), lerp(BIG.w, SMALL.w, t))); }
  if (V.tagline) { const [a, b, c] = V.tagline;
    if (f >= a) { // «خلّهم» then «يسولفون»: one line, the left word revealed second (clip at the space)
      L.push(text('خلّهم يسولفون', 104 * (f < b ? pop(f - a) : 1), 700 + T, { clip: { x: TAG_SPLIT, y: 0, w: 1080 - TAG_SPLIT, h: 1920 } }));
      if (f >= b) L.push(text('خلّهم يسولفون', 104, 700 + T + (f - b === 0 ? 8 : f - b === 1 ? 3 : 0), { clip: { x: 0, y: 0, w: TAG_SPLIT, h: 1920 } }));
    }
    if (f >= c) L.push(text('عنك!', 170 * pop(f - c), 900 + T));
  }
  return L;
}
const TAG_SPLIT = 650;     // the space between «خلّهم» (right) and «يسولفون» (left): measured gap x 631-669 at 104 px
// CTA (R3-9, R3-10) and wind-up
const CTA = R45 ? { panel: 800, b: [202, 422, 562], m: [420, 616, 240] } : { panel: 1060, b: [PLAT === 'tt' ? 414 : 400, 620, 760], m: [380, 836, 320] };
const L1 = PLAT === 'tt' ? 'دزّ لنا' : 'اطلب إعلانك', HANDLE = PLAT === 'tt' ? '@tash.creative' : '@tash.creative.kw';
function cta(f) {
  const B = V.band.find(b => f >= b.f0 && f <= b.f1) ?? V.band[V.band.length - 1], bdy = geo(B.use).dy, bi = Math.min(f, B.f1);
  const band = { x: 0, y: CTA.panel, w: 1080, h: 1920 - CTA.panel };
  const L = [...(bdy < 0 ? [{ ...useLayer(B.use, bi, { clip: band }), dy: 0 }] : []),          // unshifted copy under the shifted one: no empty rows at the bottom
    useLayer(B.use, bi, { clip: band }),
    { t: 'rect', x: 0, y: 0, w: 1080, h: CTA.panel, fill: 'lime' }, { t: 'rect', x: 0, y: CTA.panel - 10, w: 1080, h: 10, fill: 'ink' }];
  const [a, b, c, m] = V.ctaIn, wd = f - V.wind, tip = wd >= 0 ? clamp((wd + 1) / (V.irisLen === 6 ? 5 : 3)) : 0;
  const PANEL = { x: 0, y: 0, w: 1080, h: CTA.panel - 10 };
  const fall = o => tip > 0 ? { ...o, y: o.y + DROP * tip * tip, rot: 14 * tip, clip: PANEL } : o;   // the lines drop behind the Ink edge (review M2)
  if (f >= a) L.push(fall(text(L1, 120 * pop(f - a), CTA.b[0])));
  if (f >= b) L.push(fall(text('بالخاص', 160 * pop(f - b), CTA.b[1], { shadow: { dx: 8, dy: 8, color: 'paper' } })));
  if (f >= c) L.push(fall(handle(HANDLE, CTA.b[2], { size: 60 * pop(f - c) })));
  if (f >= m) { const [x0, y0, w] = CTA.m, k = pop(f - m); const w2 = w * k, X = x0 + (w - w2) / 2, Y = y0 + (w - w2) * MH / 2; L.push(...markTyping(X, Y, w2, typing(f, R45 ? 5 : 7))); }   // keeps the middle dot off the shadda (review T5)
  // M (and the tagline) fall out over the first 6 frames
  const d = f - V.cta, FO = V.shrink ? 6 : 3; if (d < FO) { const t = (d + 1) / FO, dy = DROP * t * t;   // M and the tagline fall out behind the panel edge, never over the band (review M2)
    const M = V.shrink ? SMALL : BIG; L.push(mark(M.x0, M.y0 + dy, M.w, { clip: PANEL }));
    if (V.tagline) L.push(text('خلّهم يسولفون', 104, 700 + T + dy, { rot: 6 * t, clip: PANEL }), text('عنك!', 170, 900 + T + dy * 1.1, { rot: -8 * t, clip: PANEL })); }
  // wind-up: iris from the wordmark's middle dot onto the frozen opener frame n2, with W and its dots
  if (wd >= 0) { const md = markDots(...CTA.m), r = 15 + (RMAX - 15) * ((wd + 1) / V.irisLen) ** 2, C = { type: 'circle', x: md.cx, y: md.cy, r };
    L.push(SH.loop({ clip: C }), word(1, { clip: C }), ...dotsLime(f, { clip: C }), { t: 'dot', x: md.cx, y: md.cy, r: r + 6, fill: null, ring: { color: 'ink', lw: 16 } }); }
  return L;
}
const loopEnd = f => [SH.loop(), word(), ...dotsLime(f)];

for (let f = 0; f < N; f++) {
  let L, s;
  if (f < 30) [L, s] = [hook(f), 'hook'];
  else if (f < 45) [L, s] = [drain(f), 'drain'];
  else if (f < 90) [L, s] = [dead(f), f < 78 ? 'dead' : 'return'];
  else if (f < 135) [L, s] = [offer(f), 'offer'];
  else if (f < CATS_END) [L, s] = [cats(f), 'worlds'];
  else if (f < V.flood) [L, s] = [talk(f), f < V.mult[0] ? 'talk' : 'multiply'];
  else if (f < V.snap) [L, s] = [flood(f), 'flood'];
  else if (f < V.cta) [L, s] = [snap(f), 'snap'];
  else if (f < V.wind + V.irisLen) [L, s] = [cta(f), f < V.wind ? 'cta' : 'wind-up'];
  else [L, s] = [loopEnd(f), 'loop'];
  add(f, s, L);
}
mkdirSync(OUT, { recursive: true });
const title = `A-${LEN} ${PLAT} ${FMT}`;
writeFileSync(join(OUT, 'film.json'), JSON.stringify({ title, frames }));
const per = Math.ceil(frames.length / CHUNKS);
for (let c = 0; c < CHUNKS; c++) writeFileSync(join(OUT, `film.${c}.json`), JSON.stringify({ title, frames: frames.slice(c * per, (c + 1) * per) }));
console.log(title, frames.length, 'frames,', CHUNKS, 'chunks; rows81', JSON.stringify(R81));
