// TASH — launch ad «هذا منتجك. / وهذا إعلانه.» — the edit, as a pure function of t.
// Footage = JPEG sequences drawn by frame index on #pic; Arabic type + UI are DOM (Chromium shapes it);
// the signature is the official createSting (/_system/motion/endcard.js). Timing: ./cues.json (shared with audio.py).
// URL: ?fmt=45 (1080×1350 feed cut, re-laid out) · ?poster=1 (reel cover) · ?guides=1 (safe zones, review only)
import { boot, E, tw, prog, clamp, lerp, css, words, spring, typing, grain, rng } from '/_system/motion/kit.js';
import { createSting } from '/_system/motion/endcard.js';
import * as L from '/_system/brand/logo.mjs';
import * as F from './footage.js';

const C = await (await fetch('./cues.json')).json();
const q = new URLSearchParams(location.search);
const FMT = q.get('fmt') === '45' ? '45' : '916';
const V = FMT === '916';
const POSTER = q.has('poster');
const W = 1080, H = V ? 1920 : 1350;
const stage = document.getElementById('stage');
stage.style.setProperty('--H', H + 'px');
const S = Object.fromEntries(C.shots.map(s => [s.id, s]));
const EV = C.ev, T0 = C.sting.t0, SNAP = C.sting.snap;
const COL = { ink: '#0B0B0B', paper: '#F5F5E9', lime: '#C6FF00', smoke: '#8E9088', char: '#1A1A18', line: '#2C2C29' };
const shotAt = t => { let s = C.shots[0]; for (const x of C.shots) if (t >= x.at) s = x; return s; };
const clipT = (s, t) => s.in + (t - s.at) * (s.speed ?? 1) - (s.srcAt ?? 0);   // seconds from the clip's first frame
const ease = (t, a, d, e = E.outExpo) => tw(t, a, d, e);
const f2 = n => n.toFixed(2);

// ---------------------------------------------------------------------------------------------- layout per format
// 9:16 keeps key text in x 72–1008, y 220–1500 (reel UI), right-rail clearance in the lower half.
// 4:5 is a feed post: no platform chrome, 72 px margins, everything re-centred for the shorter frame.
const LY = V ? {
  heroTop: 232, hero: 128, askSize: 120, slateTop: 1404, stepsTop: 222, card: { x: 100, y: 560 }, viewer: { cx: 540, cy: 760 },
  ed: { x: 72, y: 1180, w: 936, h: 300 }, fmtTop: 1236, sizesTop: 1300, phone: { cx: 540, cy: 900, w: 520 },
  bubBottom: 1452, bubR: 888, bubL: 120, askTop: 1080, replyCy: 962, subTop: 1112, pillTop: 1214, logoHdr: { cy: 468, s: 0.5 }, logoCta: { cy: 640, s: 0.5 }, typeLow: 1250,
  sting: { logoW: 640, cy: 0.46 },
} : {
  heroTop: 96, hero: 120, askSize: 120, slateTop: 1176, stepsTop: 62, card: { x: 100, y: 268 }, viewer: { cx: 540, cy: 560 },
  ed: { x: 72, y: 980, w: 936, h: 280 }, fmtTop: 1010, sizesTop: 1066, phone: { cx: 540, cy: 690, w: 410 },
  bubBottom: 1262, bubR: 1008, bubL: 72, askTop: 820, replyCy: 662, subTop: 790, pillTop: 884, logoHdr: { cy: 238, s: 0.42 }, logoCta: { cy: 382, s: 0.42 }, typeLow: 1010,
  sting: { logoW: 560, cy: 0.42 },
};
// vertical focus used when 1080×1920 footage is cover-cropped into 4:5 (0 = keep top, 1 = keep bottom)
const FY = { HOOK: 0.20, GLORY: 0.52, BURGER: 0.62, COFFEE: 0.26, RING: 0.36, SPRAY: 0.40, PROD: 0.52, EDIT: 0.5, DIWAN: 0.22, CAFE: 0.30, CAR: 0.24, ASK: 0.12 };
const fy = id => (V ? 0.5 : FY[id] ?? 0.5);

// ---------------------------------------------------------------------------------------------- canvas helpers
const cv = document.getElementById('pic'); cv.width = W; cv.height = H;
const g = cv.getContext('2d', { alpha: false });
g.imageSmoothingQuality = 'high';
function cover(img, x, y, w, h, { fx = 0.5, fy: fyy = 0.5, zoom = 1 } = {}) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const s = Math.max(w / iw, h / ih) * zoom, sw = w / s, sh = h / s;
  g.drawImage(img, (iw - sw) * fx, (ih - sh) * fyy, sw, sh, x, y, w, h);
}
const full = (img, id, o = {}) => cover(img, 0, 0, W, H, { fy: fy(id), ...o });
// Canvas filters (blur/saturate) are run on a software-rasterised canvas (willReadFrequently), then composited: on the
// main canvas their result depended on seek history (≈50k px differed at 22.4 s between forward and reverse renders).
const flt = document.createElement('canvas'); flt.width = W; flt.height = H;
const fg = flt.getContext('2d', { alpha: false, willReadFrequently: true }); fg.imageSmoothingQuality = 'high';
function fullFiltered(img, id, filter, o = {}) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, z = o.zoom ?? 1;
  const s = Math.max(W / iw, H / ih) * z, sw = W / s, sh = H / s;
  fg.filter = filter; fg.drawImage(img, (iw - sw) * (o.fx ?? 0.5), (ih - sh) * (o.fy ?? fy(id)), sw, sh, 0, 0, W, H); fg.filter = 'none';
  g.drawImage(flt, 0, 0);
}
/** horizontal smear: running average of n shifted copies (directional blur for whips); overscanned so edges never show */
function smear(img, id, shift, spread, n = 11) {
  const os = 0.14, ow = W * (1 + 2 * os), oh = H * (1 + 2 * os);
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0 : i / (n - 1) - 0.5;
    g.globalAlpha = 1 / (i + 1);
    cover(img, -W * os + shift + k * spread, -H * os, ow, oh, { fy: fy(id) });
  }
  g.globalAlpha = 1;
}
function rrect(x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
const ink = (a = 1) => { g.fillStyle = `rgba(11,11,11,${a})`; g.fillRect(0, 0, W, H); };
// shared grade for the AI people footage: warm, slightly lifted blacks (CD note)
function gradeAI(a = 1) {
  g.globalCompositeOperation = 'screen'; g.fillStyle = `rgba(34,27,20,${0.16 * a})`; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'soft-light'; g.fillStyle = `rgba(255,200,140,${0.10 * a})`; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
}
// "phone photo" sensor noise for the hook (seeded, per frame)
const noiseCv = new OffscreenCanvas(W / 3, H / 3);
function phoneNoise(frame, a) {
  const c = noiseCv.getContext('2d'), d = c.createImageData(noiseCv.width, noiseCv.height), r = rng(frame * 131 + 5);
  for (let i = 0; i < d.data.length; i += 4) { const v = 128 + (r() - 0.5) * 120; d.data[i] = v; d.data[i + 1] = v + (r() - 0.5) * 30; d.data[i + 2] = v; d.data[i + 3] = 255; }
  c.putImageData(d, 0, 0);
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = a; g.imageSmoothingEnabled = true; g.drawImage(noiseCv, 0, 0, W, H);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}
async function clip(s, t) { return F.frame(s.src, clipT(s, t)); }

// ---------------------------------------------------------------------------------------------- DOM helpers
const ui = document.getElementById('ui'), top = document.getElementById('top');
function el(tag, cls, parent = ui, text = null) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; parent.appendChild(e); return e; }
const show = (e, on) => css(e, { visibility: on ? 'visible' : 'hidden' });
await Promise.all([
  document.fonts.load('800 150px Alexandria'), document.fonts.load('700 96px Alexandria'), document.fonts.load('600 44px Alexandria'),
  document.fonts.load('600 50px "IBM Plex Sans Arabic"'), document.fonts.load('500 22px "IBM Plex Sans Arabic"'),
  document.fonts.load('600 22px "JetBrains Mono"'), document.fonts.load('700 34px "JetBrains Mono"'), document.fonts.load('500 30px "JetBrains Mono"'),
]);

// hook + glory headline (same place: the contrast is the hook)
const hookT = el('div', 'hero ar'); hookT.textContent = 'هذا منتجك.';
css(hookT, { top: LY.heroTop + 'px', fontSize: LY.hero + 'px', color: COL.ink });
const hookW = words(hookT);
const gloT = el('div', 'hero ar');
css(gloT, { top: LY.heroTop + 'px', fontSize: LY.hero + 'px', color: COL.paper });
const gW1 = el('span', 'w', gloT, 'وهذا'); gloT.appendChild(document.createTextNode(' '));
const gW2 = el('span', 'w', gloT, 'إعلانه.');
for (const w of [gW1, gW2]) css(w, { display: 'inline-block' });
css(gW2, { color: COL.lime, transformOrigin: '100% 62%' }); // grows out of the gap next to «وهذا», never over it
// 4:5: the feed crop puts the office chair under the left end of a centred hook line → set both lines from the RTL
// start side (right margin) so the contrast pair still sits in the same place
for (const e of [hookT, gloT]) css(e, { textAlign: 'right', left: '72px', right: (V ? 80 : 72) + 'px' });

// montage slate (category + the honesty line)
const slate = el('div', 'slate'); css(slate, { top: LY.slateTop + 'px' });
const slCat = el('div', 'cat', slate);
const slAr = el('span', 'ar', slCat); el('i', '', slCat); const slEn = el('span', 'mono', slCat);
const slNote = el('div', 'note', slate); el('span', 'ar', slNote, 'نماذج تجريبية'); el('i', '', slNote).style.cssText = 'width:5px;height:5px;border-radius:50%;background:#8E9088;display:inline-block'; el('span', 'mono', slNote, 'CONCEPT WORK');
const CAT = { BURGER: ['مطاعم', 'FOOD'], COFFEE: ['قهوة', 'COFFEE'], RING: ['مجوهرات', 'JEWELLERY'], SPRAY: ['عطور', 'PERFUME'] };

// process step bar «فكرة ← سيناريو ← إنتاج ← تسليم»
const steps = el('div', 'steps'); css(steps, { top: LY.stepsTop + 'px' });
const STEP = ['فكرة', 'سيناريو', 'إنتاج', 'تسليم'].map((w, i, a) => {
  const s = el('span', 's', steps, w); const dot = el('b', '', s);
  if (i < a.length - 1) el('span', 'arw', steps, '←');
  return { s, dot };
});
const stepsBg = el('div', ''); stepsBg.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);height:84px;border-radius:999px;background:rgba(11,11,11,.78)';
ui.insertBefore(stepsBg, steps);

// script card: the idea line + storyboard panels
const card = el('div', 'card');
const CW = 880, CH = 840; css(card, { width: CW + 'px', height: CH + 'px' });
const hdr = el('div', 'hdr', card, 'LAYL · NO.07 — SCRIPT V3'); css(hdr, { right: '48px', top: '40px' });
const line = el('div', 'line', card); css(line, { right: '56px', top: '96px', fontSize: '80px' });
const mark = el('div', 'mark', card);
line.textContent = 'تمشي… ويبقى ليل.'; const ideaW = words(line);
line.insertBefore(mark, line.firstChild); // marker sits behind the words (z below via order)
css(mark, { position: 'absolute', zIndex: '0' }); ideaW.forEach(w => css(w, { position: 'relative', zIndex: '1' }));
const PW = 240, PH = 427, PG = 26, PX0 = (CW - (3 * PW + 2 * PG)) / 2, PY = 300;
const panels = [0, 1, 2].map(i => { // RTL: SC 01 on the right
  const x = PX0 + (2 - i) * (PW + PG);
  const p = el('div', 'pan', card); css(p, { left: x + 'px', top: PY + 'px', width: PW + 'px', height: PH + 'px' });
  const im = el('img', '', p); im.src = `./assets/sketch-sc0${i + 1}.jpg`;
  const lb = el('div', 'lab', card, `SC 0${i + 1}`); css(lb, { left: x + 'px', width: PW + 'px', top: (PY + PH + 22) + 'px' });
  return { p, im, lb, x };
});
await Promise.all(panels.map(p => p.im.decode()));

// production pass labels
const passes = el('div', 'fmtlab passes'); css(passes, { top: (V ? 1420 : 1236) + 'px' });
const PASS = ['WIRE', 'CLAY', 'FINAL'].map(n => el('span', '', passes, n));

// timeline editor
const ed = el('div', 'ed'); css(ed, { left: LY.ed.x + 'px', top: LY.ed.y + 'px', width: LY.ed.w + 'px', height: LY.ed.h + 'px' });
const edTC = el('div', 'tc', ed); css(edTC, { left: '28px', top: '20px' });
const edName = el('div', 'tl', ed, 'TASH_LAUNCH_v12 · 9:16 · 30P'); css(edName, { right: '28px', top: '26px' });
const TRK = { v2: 78, v1: 120, a1: 206 }, TH = { v2: 30, v1: 72, a1: 64 }, TX0 = 92, TW = LY.ed.w - TX0 - 28;
for (const [k, lab] of [['v2', 'V2'], ['v1', 'V1'], ['a1', 'A1']]) { const l = el('div', 'tl', ed, lab); css(l, { left: '28px', top: (TRK[k] + TH[k] / 2 - 9) + 'px' }); }
const ED_CLIPS = [ // the montage, as clips on V1 (widths ∝ duration)
  ['layl-final_3.00-6.00', 30, 2.0], ['stakk-crown_7.80-9.60', 40, 1.5], ['habba-pour_5.00-6.60', 44, 1.0], ['ring', 20, 1.25], ['layl-spray_6.00-8.00', 30, 2.25],
  ['layl-wire_3.00-6.00', 20, 0.9], ['layl-clay_3.00-6.00', 30, 0.9], ['layl-final_10.50-12.60', 30, 1.4],
];
const edTot = ED_CLIPS.reduce((a, c) => a + c[2], 0);
let ex = TX0;
const edThumbs = [];
for (const [clipName, fr, d] of ED_CLIPS) {
  const w = TW * d / edTot - 4, c = el('div', 'clip', ed); css(c, { left: ex + 'px', top: TRK.v1 + 'px', width: w + 'px', height: TH.v1 + 'px' });
  if (F.MANIFEST[clipName]) { const im = el('img', '', c); im.src = `/review/launch-footage/${clipName}/${String(fr).padStart(4, '0')}.jpg`; edThumbs.push(im.decode().catch(() => 0)); }
  ex += w + 4;
}
await Promise.all(edThumbs);
for (const [a, b] of [[0.0, 0.16], [0.22, 0.44], [0.52, 0.66], [0.74, 0.97]]) { // type layer clips on V2
  const c = el('div', 'clip', ed); css(c, { left: (TX0 + TW * a) + 'px', top: TRK.v2 + 'px', width: (TW * (b - a)) + 'px', height: TH.v2 + 'px', background: '#3A3B36' });
}
const wave = el('canvas', '', ed); wave.width = TW; wave.height = TH.a1; css(wave, { position: 'absolute', left: TX0 + 'px', top: TRK.a1 + 'px' });
let WAVE = null; try { WAVE = await (await fetch('./assets/wave.json')).json(); } catch { WAVE = null; }
{ // waveform of OUR soundtrack (assets/wave.json, written by audio.py); deterministic fallback before the first mix
  const wc = wave.getContext('2d'); wc.fillStyle = '#6E7067'; const n = Math.floor(TW / 4);
  for (let i = 0; i < n; i++) {
    const v = WAVE ? WAVE[Math.floor(i / n * WAVE.length)] : 0.25 + 0.2 * Math.abs(Math.sin(i * 0.37) * Math.sin(i * 0.11));
    const h = Math.max(2, v * TH.a1 * 0.92); wc.fillRect(i * 4, (TH.a1 - h) / 2, 2.5, h);
  }
}
const ph = el('div', 'ph', ed); css(ph, { top: '64px', height: (LY.ed.h - 80) + 'px' }); el('i', '', ph);

// format switch labels
const fmtL = el('div', 'fmtlab'); css(fmtL, { top: LY.fmtTop + 'px' });
const FMTS = ['9:16', '1:1', '16:9'].map(n => el('span', '', fmtL, n));
const sizesT = el('div', 'sup ar', ui, 'كل المقاسات'); css(sizesT, { top: LY.sizesTop + 'px', fontSize: '54px', color: COL.paper });

// chat bubbles (dramatised; no names, no numbers)
// chat tail: a curl that flows out of the bubble's bottom corner (mirrored for the left side)
function tail(parent, side, fill, k = 1) {
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  t.setAttribute('class', 'tail'); t.setAttribute('width', 46 * k); t.setAttribute('height', 42 * k); t.setAttribute('viewBox', '0 0 46 42');
  t.innerHTML = `<path d="M0 0 H24 C24 16 31 31 46 40 C27 42 11 36 0 26 Z" fill="${fill}"/>`;
  css(t, side === 'r' ? { right: 4 * k + 'px', bottom: -12 * k + 'px' } : { left: 4 * k + 'px', bottom: -12 * k + 'px', transform: 'scaleX(-1)' });
  parent.appendChild(t); return t;
}
const BUB = [['منو مسوي هالإعلان؟!', 'r'], ['شفتوا إعلانهم؟', 'l'], ['وين مكانهم؟', 'r']].map(([txt, side], i) => {
  const b = el('div', 'bub ' + side, ui, txt); b.style.setProperty('--ox', side === 'r' ? '92%' : '8%'); tail(b, side, COL.paper);
  return { b, side, at: EV.bubbles[i], w: 0, h: 0 };
});
for (const B of BUB) { B.w = B.b.offsetWidth; B.h = B.b.offsetHeight; }

// sting (official) + ASK / CTA
const stingRoot = document.getElementById('sting');
const sting = createSting(stingRoot, { width: W, height: H, logoW: LY.sting.logoW, cy: LY.sting.cy, theme: 'ink', background: false });
const [stSvg, stTag, stHd] = sting.el.children;
const askT = el('div', 'hero ar', top); askT.textContent = 'عندك مشروع؟'; css(askT, { top: LY.askTop + 'px', fontSize: LY.askSize + 'px', color: COL.paper, right: (V ? 24 : 0) + 'px' });
const askW = words(askT);
const reply = el('div', 'reply ar', top); reply.textContent = 'خلّ إعلانك علينا.';
css(reply, { fontSize: (V ? 90 : 88) + 'px' });
const ctaW = words(reply); tail(reply, 'l', COL.lime, 1.3);
const RW = reply.offsetWidth, RH = reply.offsetHeight;
css(reply, { left: ((W - RW) / 2 - (V ? 14 : 0)) + 'px', top: (LY.replyCy - RH / 2) + 'px' }); // 9:16: right edge clear of the action rail
const subT = el('div', 'sup ar', top, 'اطلب إعلانك بالخاص'); css(subT, { top: LY.subTop + 'px', fontSize: '58px', color: '#D9DACF' });
const subW = words(subT);
const pill = el('div', 'handle', top, '@tash.creative.kw'); css(pill, { top: LY.pillTop + 'px' });

// finish
const vignetteEl = document.getElementById('vignette');
const grainCv = document.getElementById('grain'); grainCv.width = W; grainCv.height = H;
if (q.has('guides')) {
  const gd = el('div', 'guides', document.getElementById('stage'));
  gd.innerHTML = V ? `<div style="position:absolute;left:72px;right:72px;top:220px;bottom:420px;outline:2px dashed rgba(255,0,170,.8)"></div><div style="position:absolute;right:72px;width:120px;top:960px;bottom:420px;background:rgba(255,0,170,.18)"></div>`
    : `<div style="position:absolute;left:72px;right:72px;top:72px;bottom:72px;outline:2px dashed rgba(255,0,170,.8)"></div>`;
}

// determinism: kit's words() marks spans will-change:transform; Chromium then keeps a layer's raster scale from when it
// was created, so a scaled word could rasterise differently depending on seek history. Turn it off: every frame
// rasterises from its own state.
for (const sp of document.querySelectorAll('.w')) sp.style.willChange = 'auto';

// ---------------------------------------------------------------------------------------------- word animation helpers
function riseIn(ws, t, t0, { gap = 0.1, dur = 0.42, rise = 64, blur = 9 } = {}) { // rise + unblur, RTL order (DOM order)
  ws.forEach((w, i) => {
    const k = tw(t, t0 + i * gap, dur, E.outCubic);
    css(w, { transform: `translateY(${f2((1 - k) * rise)}px)`, opacity: f2(clamp(k * 2.2)), filter: k < 1 ? `blur(${f2((1 - k) * blur)}px)` : 'none' });
  });
}
function exitUp(ws, t, t0, { gap = 0.033, dur = 0.16, lift = 70 } = {}) {
  ws.forEach((w, i) => {
    const k = tw(t, t0 + i * gap, dur, E.inCubic); if (k <= 0) return;
    css(w, { transform: `translateY(${f2(-k * lift)}px)`, opacity: f2(1 - k), filter: `blur(${f2(k * 6)}px)` });
  });
}

// ---------------------------------------------------------------------------------------------- sections
async function drawHook(t) {
  const s = S.HOOK, img = await clip(s, t);
  fullFiltered(img, 'HOOK', 'saturate(0.82) contrast(0.93) brightness(1.03)', { zoom: 1.09, fx: 0.92 }); // chair slides out from under the line
  phoneNoise(Math.round(t * 30), 0.10);
  // the shutter: a fast white blink on the phone's screen on the frames before the cut
  const k = t >= EV.shutter ? [0.55, 1, 0.75][Math.min(2, Math.round((t - EV.shutter) * 30))] : 0;
  if (k > 0) {
    const z = 1.09, s = Math.max(W / 1080, H / 1920) * z, sw = W / s, sh = H / s, sx = (1080 - sw) * 0.92, sy = (1920 - sh) * fy('HOOK');
    g.fillStyle = `rgba(255,255,255,${k})`; rrect((536 - sx) * s, (742 - sy) * s, 316 * s, 418 * s, 10 * s); g.fill();
  }
}
async function drawGlory(t) {
  const s = S.GLORY, img = await clip(s, t);
  const z = 1.06 - 0.06 * E.outExpo(prog(t, s.at, 0.45)); // scale-cut tail on the drop
  if (t > s.end - 0.1) smear(img, 'GLORY', -lerp(0, 90, E.inCubic(prog(t, s.end - 0.1, 0.1))), lerp(0, 220, prog(t, s.end - 0.1, 0.1)));
  else full(img, 'GLORY', { zoom: z });
}
async function drawBurger(t) {
  const s = S.BURGER, img = await clip(s, t);
  const kIn = prog(t, s.at, 0.2); // whip landing: starts smeared, resolves over 6 f
  if (kIn < 1) smear(img, 'BURGER', lerp(110, 0, E.outCubic(kIn)), lerp(240, 0, E.outCubic(kIn)));
  else full(img, 'BURGER');
  const b = burn(t); if (b > 0) burnFx(b);
}
async function drawCoffee(t) {
  const s = S.COFFEE, img = await clip(s, t);
  full(img, 'COFFEE');
  const b = burn(t); if (b > 0) burnFx(b);
}
function burn(t) { const [a, m, z] = EV.burn; return t < m ? E.inQuad(prog(t, a, m - a)) : 1 - E.outCubic(prog(t, m, z - m)); }
function burnFx(k) { // light-sweep burn: the frame burns out (brighter, flatter, warm) rather than having light pasted on
  g.globalCompositeOperation = 'screen'; g.fillStyle = `rgba(255,214,160,${0.62 * k})`; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'soft-light'; g.fillStyle = `rgba(255,245,225,${0.5 * k})`; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
}
async function drawRing(t) {
  const s = S.RING;
  try { full(await clip(s, t), 'RING'); } catch { ink(); g.fillStyle = '#c9a24a'; g.beginPath(); g.arc(540, 570, 390, 0, 7); g.lineWidth = 60; g.strokeStyle = '#c9a24a'; g.stroke(); }
}
async function drawSpray(t) {
  const s = S.SPRAY, img = await clip(s, t);
  full(img, 'SPRAY', { zoom: 1 + 0.035 * prog(t, s.at, s.end - s.at) });
}
const fxc = document.createElement('canvas'); fxc.width = W; fxc.height = H; fxc.id = 'fx';
stage.insertBefore(fxc, document.getElementById('vignette')); const fx = fxc.getContext('2d');
/** the brand transition (once): three lime dots, right→left, cover the frame, then exit leftward.
 *  Drawn ABOVE the type/UI; returns the x left of which the frame is still covered (the UI is revealed right of it). */
function dotsWipe(t) {
  fx.clearRect(0, 0, W, H);
  const [a, m, z] = EV.dotsWipe, born = a - 0.2; if (t < born || t >= z) return -1;
  const cy = H * 0.5, R = Math.hypot(W, H) * 0.58;
  fx.fillStyle = COL.lime; let edge = -1;
  [1, 0, -1].forEach((k, i) => {   // i = 0 is the rightmost dot (reading order)
    const app = spring(clamp((t - born - i * 0.033) / 0.4), { freq: 2, damp: 12 });
    const bob = t < a ? typing(t - born, i, { period: 0.36, phase: 0.08, amp: 16 }) : 0;
    const grow = E.inCubic(prog(t, a + i * 0.05, m - a - 0.1 + 0.02));
    const out = E.inQuad(prog(t, m - 0.03 + i * 0.035, z - m - 0.02));
    const r = Math.max(0, lerp(26 * app, R, grow) * (1 - out));
    const x = 540 + k * 82 * (1 - grow) - out * 900, y = cy + bob * (1 - grow);
    if (r <= 0.5) return;
    fx.beginPath(); fx.arc(x, y, r, 0, Math.PI * 2); fx.fill();
    edge = Math.max(edge, x + r);
  });
  return t >= m ? Math.max(0, edge) : W;
}
// IDEA + BOARD: the script card on ink
function cardPose(t) {
  const [p0, p1] = EV.boardPush; const k = E.inOutCubic(prog(t, p0, p1 - p0));
  const pan = panels[1], Sx = W / PW, Sy = H / PH, Smax = V ? Sx : Math.max(Sx, Sy);
  const s = Math.exp(lerp(0, Math.log(Smax), k));
  const drift = 1 - 0.025 * (1 - E.outCubic(prog(t, S.IDEA.at, 2.0)));
  const c0 = { x: LY.card.x + CW * (1 - drift) / 2, y: LY.card.y + CH * (1 - drift) / 2 };
  const P0 = { x: c0.x + drift * pan.x, y: c0.y + drift * PY }, P1 = { x: 0, y: (H - PH * Smax) / 2 };
  const u = (s - 1) / (Smax - 1 || 1), sc = s * drift;
  const px = lerp(P0.x, P1.x, u), py = lerp(P0.y, P1.y, u);
  return { x: px - sc * pan.x, y: py - sc * PY, s: sc, k };
}
async function drawCard(t) {
  ink();
  const p = cardPose(t);
  css(card, { transform: `translate(${f2(p.x)}px, ${f2(p.y)}px) scale(${p.s.toFixed(4)})`, boxShadow: p.k > 0.6 ? 'none' : '' });
  ideaW.forEach((w, i) => {
    const k = tw(t, EV.ideaWords[i], 0.4, E.outCubic);
    css(w, { transform: `translateY(${f2((1 - k) * 40)}px)`, opacity: f2(clamp(k * 2.2)), filter: k < 1 ? `blur(${f2((1 - k) * 8)}px)` : 'none' });
  });
  // lime marker band behind «ليل.» drawn right→left
  const lw = ideaW[2], mk = tw(t, EV.ideaWords[2] + 0.2, 0.28, E.outCubic);
  css(mark, { left: f2(lw.offsetLeft - 10 + (lw.offsetWidth + 20) * (1 - mk)) + 'px', width: f2((lw.offsetWidth + 20) * mk) + 'px', top: f2(lw.offsetTop + lw.offsetHeight * 0.42) + 'px', height: f2(lw.offsetHeight * 0.36) + 'px', opacity: mk > 0 ? '1' : '0' });
  panels.forEach((P, i) => {
    const k = tw(t, EV.panels[i], 0.36, E.outExpo);
    css(P.p, { transform: `translateY(${f2((1 - k) * 14)}px)`, opacity: '1' });
    const d = tw(t, EV.panels[i] + 0.04, 0.34, E.outCubic); // the sketch draws on right→left
    css(P.im, { clipPath: `inset(0 0 0 ${f2((1 - d) * 100)}%)` });
    css(P.lb, { opacity: f2(1 - clamp(p.k * 2)) });
  });
}
async function drawProd(t) {
  const s = S.PROD, st = clipT(s, t);
  const [w, c, f] = await Promise.all(['layl-wire_3.00-6.00', 'layl-clay_3.00-6.00', 'layl-final_3.00-6.00'].map(n => F.frame(n, st)));
  full(w, 'PROD');
  for (const [img, at] of [[c, EV.wipeClay], [f, EV.wipeFinal]]) { // RTL wipe (the pen direction), edge crosses in 9 f
    const k = E.inOutCubic(prog(t, at - 0.15, 0.3)); if (k <= 0) continue;
    const xe = W * (1 - k);
    g.save(); g.beginPath(); g.rect(xe, 0, W - xe, H); g.clip(); full(img, 'PROD'); g.restore();
    if (k < 1) { g.fillStyle = COL.paper; g.fillRect(xe - 1.5, 0, 3, H); }
  }
}
function viewerRect(t) { // the frame that becomes a viewer, changes size, then becomes a phone screen
  const vc = LY.viewer, R = { '916': [V ? 440 : 330, V ? 782 : 587], '11': [V ? 700 : 560, V ? 700 : 560], '169': [936, 527] };
  const [a1, a2, a3] = EV.sizes, [p0, p1] = EV.toPhone;
  const ph = LY.phone, phH = ph.w * 19.5 / 9;
  const lerpR = (A, B, k) => [lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k), lerp(A[3], B[3], k)];
  const at = (sz, cx = vc.cx, cy = vc.cy) => [cx - sz[0] / 2, cy - sz[1] / 2, sz[0], sz[1]];
  let r = [0, 0, W, H];
  const ks = E.outExpo(prog(t, EV.shrink[0], EV.shrink[1] - EV.shrink[0]));
  r = lerpR(r, at(R['916']), ks);
  if (t >= a1) r = lerpR(at(R['916']), at(R['11']), E.outExpo(prog(t, a1, 0.3)));
  if (t >= a2) r = lerpR(at(R['11']), at(R['169']), E.outExpo(prog(t, a2, 0.3)));
  if (t >= a3) r = lerpR(at(R['169']), at(R['916']), E.outExpo(prog(t, a3, 0.26)));
  if (t >= p0 + 0.08) r = lerpR(at(R['916']), at([ph.w, phH], ph.cx, ph.cy), E.inOutCubic(prog(t, p0 + 0.08, p1 - p0 - 0.08)));
  return r;
}
function phoneBody(r, k) { // generic phone: no brand cues, a punch-hole camera, thin bezel
  if (k <= 0) return;
  const b = 20 * k, [x, y, w, h] = r;
  g.fillStyle = COL.char; rrect(x - b, y - b, w + 2 * b, h + 2 * b, 64 * k + 6); g.fill();
  g.strokeStyle = '#34342F'; g.lineWidth = 2; rrect(x - b, y - b, w + 2 * b, h + 2 * b, 64 * k + 6); g.stroke();
  g.fillStyle = '#26261F'; g.fillRect(x + w + b - 1, y + h * 0.22, 4 * k, h * 0.09); g.fillRect(x + w + b - 1, y + h * 0.34, 4 * k, h * 0.14);
}
async function drawEdit(t) {
  ink();
  const r = viewerRect(t), [p0, p1] = EV.toPhone;
  const useEnd = t >= EV.sizes[0];
  const img = useEnd ? await F.frame('layl-final_10.50-12.60', 10.5 + (t - EV.sizes[0]) - 10.5) : await F.frame('layl-final_3.00-6.00', clipT(S.PROD, t));
  const pk = E.inOutCubic(prog(t, p0 + 0.08, p1 - p0 - 0.08));
  phoneBody(r, pk);
  g.save(); rrect(r[0], r[1], r[2], r[3], lerp(t < EV.shrink[0] + 0.01 ? 0 : 14, 48, pk)); g.clip();
  cover(img, r[0], r[1], r[2], r[3], { fy: 0.5 }); g.restore();
  if (pk > 0) { g.fillStyle = COL.ink; g.beginPath(); g.arc(r[0] + r[2] / 2, r[1] + 26, 9 * pk, 0, 7); g.fill(); }
}
async function drawPhone(t) {
  ink();
  const s = S.PHONE, ph = LY.phone, z = 1 + 0.035 * prog(t, s.at, 0.9);
  const w = ph.w * z, h = w * 19.5 / 9, r = [ph.cx - w / 2, ph.cy - h / 2, w, h];
  const img = await F.frame('layl-final_10.50-12.60', 1.0 + (t - s.at));
  phoneBody(r, 1);
  g.save(); rrect(...r, 48); g.clip(); cover(img, ...r, { fy: 0.5 }); g.restore();
  g.fillStyle = COL.ink; g.beginPath(); g.arc(r[0] + w / 2, r[1] + 26, 9, 0, 7); g.fill();
}
async function drawPeople(s, t) {
  const img = await clip(s, t);
  full(img, s.id, { zoom: 1.04 + 0.02 * prog(t, s.at, s.end - s.at) }); gradeAI();
  if (s.id === 'CAR') { const k = E.inOutSine(prog(t, EV.toInk[0], EV.toInk[1] - EV.toInk[0])); if (k > 0) ink(k); }
}
async function drawAsk(t) {
  const s = S.ASK, img = await clip(s, t);
  const kin = E.outCubic(prog(t, s.at, 0.5)), kout = E.inOutSine(prog(t, s.end - 0.12, 0.3));
  fullFiltered(img, 'ASK', 'blur(5px) saturate(0.85)', { zoom: 1.08 + 0.03 * prog(t, s.at, 1.5) });
  gradeAI(); ink(lerp(1, 0.5, kin) + 0.5 * kout);
  const gr = g.createLinearGradient(0, 0, 0, H * 0.62); gr.addColorStop(0, 'rgba(11,11,11,.94)'); gr.addColorStop(0.55, 'rgba(11,11,11,.78)'); gr.addColorStop(1, 'rgba(11,11,11,0)');
  g.fillStyle = gr; g.globalAlpha = kin; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
}

// the sting's typing bubble appears where he is typing (his phone), then rises to the logo position (done before converge)
function typeOffset(t) { const k = E.inOutCubic(prog(t, T0 + 0.28, 0.42)); return (LY.typeLow - (H * LY.sting.cy - 10)) * (1 - k); }

// ---------------------------------------------------------------------------------------------- UI per frame
function uiFrame(t, sh) {
  // hook / glory headline
  const hookOn = t < S.GLORY.at;
  show(hookT, hookOn); if (hookOn) riseIn(hookW, t, EV.hookText, { gap: 0.1, dur: 0.4, rise: 58, blur: 8 });
  const gOn = t >= S.GLORY.at && t < S.GLORY.end;
  show(gloT, gOn);
  if (gOn) {
    css(gW1, { transform: 'none', opacity: '1', filter: 'none' });
    const k = tw(t, EV.gloryText - 0.033, 0.5, E.outExpo); // the thesis word arrives from oversize, ON the drop frame
    css(gW2, { transform: `scale(${(1.45 - 0.45 * k).toFixed(4)})`, filter: k < 0.98 ? `blur(${f2((1 - k) * 9)}px)` : 'none', opacity: f2(clamp(k * 4)) });
    exitUp([gW1, gW2], t, EV.gloryTextOut);
  }
  // montage slate
  const cat = CAT[sh.id]; const slOn = !!cat && !(t >= EV.dotsWipe[0] - 0.02);
  show(slate, slOn);
  if (slOn) {
    if (slAr.textContent !== cat[0]) { slAr.textContent = cat[0]; slEn.textContent = cat[1]; }
    const k = tw(t, sh.at, 0.2, E.outCubic);
    css(slCat, { transform: `scale(${(0.94 + 0.06 * k).toFixed(3)})`, opacity: f2(clamp(k * 2)) });
    css(slNote, { opacity: f2(tw(t, S.BURGER.at + 0.1, 0.3, E.outCubic)) });
  }
  // process step bar
  const stOn = t >= S.IDEA.at && t < S.PHONE.at;
  show(steps, stOn); show(stepsBg, stOn);
  if (stOn) {
    const act = t < S.BOARD.at ? 0 : t < S.PROD.at ? 1 : t < S.EDIT.at ? 2 : 3;
    const out = E.inCubic(prog(t, EV.toPhone[0], 0.25));
    STEP.forEach((x, i) => {
      css(x.s, { color: i === act ? COL.paper : i < act ? '#B9BAB2' : '#6E7067' });
      css(x.dot, { opacity: i === act ? '1' : '0', transform: `scale(${i === act ? f2(0.4 + 0.6 * E.outExpo(prog(t, [S.IDEA, S.BOARD, S.PROD, S.EDIT][i].at, 0.3))) : 1})` });
    });
    const kin = E.outExpo(prog(t, S.IDEA.at + 0.12, 0.4));
    css(steps, { opacity: f2(kin * (1 - out)), transform: `translateY(${f2((1 - kin) * -20 - out * 30)}px)` });
    css(stepsBg, { opacity: f2(kin * (1 - out)), top: (LY.stepsTop - 8) + 'px', width: (steps.firstChild ? 760 : 0) + 'px', transform: `translateX(-50%) translateY(${f2((1 - kin) * -20 - out * 30)}px)` });
  }
  // script card
  show(card, t >= S.IDEA.at && t < S.PROD.at);
  // production pass labels
  const pOn = t >= S.PROD.at && t < S.EDIT.at; show(passes, pOn);
  if (pOn) {
    const a = t < EV.wipeClay ? 0 : t < EV.wipeFinal ? 1 : 2;
    PASS.forEach((p, i) => css(p, { color: i === a ? COL.paper : '#6A6C64' }));
    css(passes, { opacity: f2(tw(t, S.PROD.at + 0.05, 0.25) * (1 - prog(t, S.EDIT.at - 0.12, 0.12))) });
  }
  // editor
  const eOn = t >= S.EDIT.at && t < EV.sizes[0] + 0.3; show(ed, eOn);
  if (eOn) {
    const kin = E.outExpo(prog(t, EV.shrink[0] + 0.08, 0.45)), out = E.inCubic(prog(t, EV.sizes[0], 0.28));
    css(ed, { transform: `translateY(${f2((1 - kin) * 160 + out * 260)}px)`, opacity: f2(clamp(kin * 1.6) * (1 - out)) });
    const pk = prog(t, S.EDIT.at, EV.sizes[0] + 0.3 - S.EDIT.at);
    css(ph, { left: f2(TX0 + TW * lerp(0.08, 0.66, pk)) + 'px' });
    const fr = Math.round(t * 30); edTC.textContent = `00:00:${String(Math.floor(fr / 30)).padStart(2, '0')}:${String(fr % 30).padStart(2, '0')}`;
  }
  // formats
  const fOn = t >= EV.sizes[0] && t < S.PHONE.at; show(fmtL, fOn); show(sizesT, fOn);
  if (fOn) {
    const a = t < EV.sizes[1] ? 1 : t < EV.sizes[2] ? 2 : 0;
    FMTS.forEach((x, i) => css(x, { color: i === (t < EV.sizes[1] ? 1 : t < EV.sizes[2] ? 2 : 0) ? COL.paper : '#55574F' }));
    const kin = E.outExpo(prog(t, EV.sizes[0] + 0.1, 0.4)), out = E.inCubic(prog(t, EV.toPhone[0], 0.2));
    css(fmtL, { opacity: f2(kin * (1 - out)) });
    css(sizesT, { opacity: f2(clamp(kin * 1.5) * (1 - out)), transform: `translateY(${f2((1 - kin) * 40 - out * 30)}px)`, filter: kin < 1 ? `blur(${f2((1 - kin) * 6)}px)` : 'none' });
  }
  // bubbles: a chat that stacks up from the bottom, then collapses into the one typing bubble
  const [c0, c1] = EV.collapse;
  const stOff = typeOffset(t);
  BUB.forEach((B, i) => {
    const on = t >= B.at && t < c1; show(B.b, on); if (!on) return;
    let y = LY.bubBottom - B.h; // push up by the bubbles that arrived after this one
    for (let j = i + 1; j < BUB.length; j++) y -= (BUB[j].h + 20) * E.outExpo(prog(t, BUB[j].at, 0.32));
    const x = B.side === 'r' ? LY.bubR - B.w : LY.bubL;
    const pop = t < B.at + 0.6 ? spring(clamp((t - B.at) / 0.6), { freq: 2, damp: 12 }) : 1;
    const ck = E.inOutCubic(prog(t, c0 + (BUB.length - 1 - i) * 0.04, c1 - c0 - 0.08));
    const tx = lerp(x, W / 2 - B.w / 2, ck), ty = lerp(y, H * LY.sting.cy - 10 + stOff - B.h / 2, ck);
    css(B.b, { left: f2(tx) + 'px', top: f2(ty) + 'px', transform: `scale(${f2(lerp(0.55 + 0.45 * pop, 0.18, ck))})`, opacity: f2(clamp((t - B.at) / 0.08) * (1 - ck * ck)) });
  });
  // sting + ASK + CTA
  const sOn = t >= T0; show(stingRoot, sOn);
  if (sOn) {
    css(stingRoot, { transform: `translateY(${f2(stOff)}px)` });
    const PULSE2 = C.duration - 1.25; // the dots type once more in the final hold (the one living thing)
    const st = t - T0 < 3.6 ? t - T0 : (t >= PULSE2 && t < PULSE2 + 0.92 ? 2.9 + (t - PULSE2) : 3.6);
    sting.render(st);
    const k = E.inOutCubic(prog(t, S.ASK.at, 0.45)), kc = E.inOutCubic(prog(t, S.CTA.at + 0.02, 0.5)), hd = LY.logoHdr, hc = LY.logoCta;
    const creep = 1 + 0.03 * prog(t, SNAP + 0.1, S.ASK.at - SNAP - 0.1) + 0.02 * prog(t, S.CTA.at + 0.5, C.duration - S.CTA.at - 0.5);
    const lc = { x: W / 2, y: sting.logoBox.y + sting.logoBox.h / 2 };
    const ty = (lerp(hd.cy, hc.cy, kc) - lc.y) * k, sc = lerp(1, hd.s, k) * creep;
    css(stSvg, { transformOrigin: `${lc.x}px ${f2(lc.y)}px`, transform: `translateY(${f2(ty)}px) scale(${sc.toFixed(4)})` });
    css(stTag, { transformOrigin: `540px ${f2(lc.y)}px`, transform: `scale(${creep.toFixed(4)})` }); css(stHd, { transformOrigin: `540px ${f2(lc.y)}px`, transform: `scale(${creep.toFixed(4)})` });
    const tk = E.inCubic(prog(t, S.ASK.at, 0.2));
    css(stTag, { opacity: f2(1 - tk) }); css(stHd, { opacity: f2((t < S.ASK.at ? clamp((t - T0 - 2.1) / 0.7) : 1) * (1 - tk)) });
  }
  const aOn = t >= S.ASK.at && t < S.CTA.at + 0.3; show(askT, aOn);
  if (aOn) { riseIn(askW, t, EV.ask, { gap: 0.12, dur: 0.45, rise: 60, blur: 9 }); exitUp(askW, t, S.CTA.at - 0.21); }
  const cOn = t >= S.CTA.at; show(reply, cOn); show(subT, cOn); show(pill, cOn);
  if (cOn) { // the reply pops like a sent message (from its tail), then its words resolve
    const pk = spring(clamp((t - EV.ctaLine) / 0.7), { freq: 2, damp: 12 });
    const cc = 1 + 0.02 * prog(t, S.CTA.at + 0.5, C.duration - S.CTA.at - 0.5); // slow creep of the end card
    css(reply, { transform: `scale(${(cc * (0.4 + 0.6 * pk)).toFixed(4)})`, opacity: t >= EV.ctaLine ? '1' : '0' }); // visible ON the cut frame (no empty-ink frame)
    riseIn(ctaW, t, EV.ctaLine - 0.02, { gap: 0.07, dur: 0.4, rise: 24, blur: 6 }); // words already resolving as the bubble pops (no blank-lime frame)
    riseIn(subW, t, EV.ctaSub, { gap: 0.07, dur: 0.45, rise: 30, blur: 6 });
    const hk = tw(t, EV.ctaHandle, 0.6, E.outExpo);
    css(pill, { opacity: f2(clamp(hk * 2)), letterSpacing: `${(0.34 - 0.12 * hk).toFixed(3)}em` });
  }
}

// ---------------------------------------------------------------------------------------------- poster (reel cover)
// Before / after, split at the middle; the brand's three dots sit on the seam. All key content inside the centre 3:4
// (y 240–1680) so the profile-grid crop still tells the whole idea.
async function drawPoster() {
  for (const e of ui.querySelectorAll(':scope > *')) show(e, false);
  for (const e of top.querySelectorAll(':scope > *')) show(e, false);
  show(stingRoot, false);
  const a = await F.frame('ai-s1_hook', 0.9), b = await F.frame('layl-final_10.50-12.60', 0.2);
  const half = H / 2;
  g.save(); g.beginPath(); g.rect(0, 0, W, half); g.clip();
  g.filter = 'saturate(0.8) contrast(0.93) brightness(1.03)'; cover(a, 0, -10, W, 1920); g.filter = 'none'; phoneNoise(3, 0.08); g.restore();
  g.save(); g.beginPath(); g.rect(0, half, W, H - half); g.clip(); ink();
  const sc = 0.8, bx = 418 - 540 * sc, by = 1212 - 840 * sc; cover(b, bx, by, W * sc, 1920 * sc);
  for (const [x0, x1] of [[bx, bx + 90], [bx + W * sc, bx + W * sc - 90]]) { const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, COL.ink); gr.addColorStop(1, 'rgba(11,11,11,0)'); g.fillStyle = gr; g.fillRect(Math.min(x0, x1), half, 90, H - half); }
  g.restore();
  g.fillStyle = COL.ink; g.fillRect(0, half - 3, W, 6);
  const P = el('div', '', top); P.style.cssText = 'position:absolute;inset:0';
  const t1 = el('div', 'hero ar', P, 'هذا منتجك.'); css(t1, { top: '236px', fontSize: '128px', color: COL.ink, textAlign: 'right', left: '72px', right: '80px' });
  const t2 = el('div', 'hero ar', P); css(t2, { top: (half + 44) + 'px', fontSize: '128px', color: COL.paper, textAlign: 'right', left: '72px', right: '80px' });
  el('span', '', t2, 'وهذا '); const w2 = el('span', '', t2, 'إعلانه.'); css(w2, { color: COL.lime });
  // the dots on the seam: "someone is typing…"
  const d = el('div', '', P); d.style.cssText = `position:absolute;left:50%;top:${half - 44}px;transform:translateX(-50%);width:236px;height:88px;border-radius:44px;background:${COL.char};display:flex;align-items:center;justify-content:center;gap:22px`;
  for (let i = 0; i < 3; i++) { const c = el('i', '', d); c.style.cssText = `width:30px;height:30px;border-radius:50%;background:${COL.lime};display:block;transform:translateY(${[-6, 0, 4][i]}px)`; }
  const mk = el('div', '', P); mk.style.cssText = 'position:absolute;right:84px;top:1438px;display:flex;flex-direction:column;align-items:flex-end;gap:12px';
  mk.innerHTML = L.wordmarkSVG({ width: 170 });
  const h = el('div', 'mono', mk, '@TASH.CREATIVE.KW'); css(h, { fontSize: '20px', color: COL.paper, letterSpacing: '.24em', textTransform: 'none' }); h.textContent = '@tash.creative.kw';
  const n = el('div', 'slate', mk); css(n, { position: 'static', transform: 'none', alignItems: 'flex-end', marginTop: '6px' }); const nn = el('div', 'note', n); el('span', 'ar', nn, 'نماذج تجريبية'); el('i', '', nn).style.cssText = 'width:5px;height:5px;border-radius:50%;background:#8E9088;display:inline-block'; el('span', 'mono', nn, 'CONCEPT WORK');
  g.fillStyle = 'rgba(0,0,0,0)';
}

// ---------------------------------------------------------------------------------------------- frame
async function seek(t) {
  if (POSTER) { await drawPoster(); grain(grainCv, 7, { amount: 26, scale: 2 }); return; }
  const sh = shotAt(t);
  const cover_ = dotsWipe(t); // UI under the wipe is revealed only where the dots have already passed
  { const m = EV.dotsWipe[1], vk = clamp(prog(t, m - 0.14, 0.1)) * (1 - clamp(prog(t, m + 0.06, 0.12))); vignetteEl.style.opacity = f2(1 - vk); }
  css(ui, { clipPath: cover_ < 0 ? 'none' : `inset(0 0 0 ${f2(Math.min(W, cover_))}px)` });
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
  switch (sh.id) {
    case 'HOOK': await drawHook(t); break;
    case 'GLORY': await drawGlory(t); break;
    case 'BURGER': await drawBurger(t); break;
    case 'COFFEE': await drawCoffee(t); break;
    case 'RING': await drawRing(t); break;
    case 'SPRAY': await drawSpray(t); break;
    case 'IDEA': case 'BOARD': await drawCard(t); break;
    case 'PROD': await drawProd(t); break;
    case 'EDIT': case 'SIZES': await drawEdit(t); break;
    case 'PHONE': await drawPhone(t); break;
    case 'DIWAN': case 'CAFE': case 'CAR': await drawPeople(sh, t); break;
    case 'STING': ink(); break;
    case 'ASK': await drawAsk(t); break;
    case 'CTA': ink(); break;
  }
  uiFrame(t, sh);
  grain(grainCv, Math.round(t * 30), { amount: 26, scale: 2 });
}

// seeks are serialised: kit's boot() fires its own seek(0) on ready, and a seek awaits image decodes, so without a
// queue a render worker's first frame could interleave with it. Each frame is drawn by exactly one finished seek.
let queue = Promise.resolve();
const seekQ = t => (queue = queue.then(() => seek(t)));
boot({ width: W, height: H, fps: 30, duration: C.duration, seek: seekQ });
