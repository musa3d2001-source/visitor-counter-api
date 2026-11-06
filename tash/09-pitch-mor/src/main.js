// MOR «مور» — spec pitch ad (unofficial; not commissioned by MOR). The page is a pure function of time.
// Picture: the seven CD-approved AI clips (../footage/ai/), conformed to the edit as 30 fps JPEG sequences (src/footage/,
// tools/extract.sh) and drawn by frame index, one shared grade (grade.js). MOR's keyhole emblem is the door we go through
// (the hook) and come back out of (the end card): its silhouette and outline are keyed from footage/ai/frames/logo_plate.png
// (tools/key_logo.py → assets/), never redrawn. Type, end-card wordmark, slate and TASH tail: overlay.js.
// URL: ?fmt=45 (1080×1350 re-layout) · ?clean=1 (no type) · ?poster=1 (cover) · ?t=… / ?play (preview) · ?info=1 (HUD)
import { boot, grain, clamp, lerp, tw, E, rng } from '/_system/motion/kit.js';
import { C } from './cues.js';
import * as F from './footage.js';
import { makeMatch, makeGrader } from './grade.js';
import { LAYOUT } from './layout.js';

const q = new URLSearchParams(location.search);
const FMT = q.get('fmt') === '45' ? '45' : '916';
const CLEAN = q.has('clean'), POSTER = q.has('poster'), INFO = q.has('info');
const LY = LAYOUT[FMT];
const W = 1080, H = LY.H, FPS = 30, SH = 1920;     // SH: height of the conformed source frames
const EV = C.ev, SEGS = C.footage.segs;

const stage = document.getElementById('stage');
stage.style.height = H + 'px';
const cv = document.getElementById('pic'); cv.width = W; cv.height = H; cv.style.height = H + 'px';
const g = cv.getContext('2d', { alpha: false, willReadFrequently: true });
g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
const grainCv = document.getElementById('grain'); grainCv.width = W; grainCv.height = H; grainCv.style.height = H + 'px';
const grade = makeGrader(W, H);

// ---------------------------------------------------------------- per-clip match (→ one warm night) and framing
const MATCH = {
  m1_exterior: makeMatch({ black: [6, 6, 8], stops: -0.05, wb: [1.0, 0.99, 1.0], sat: 0.95 }),
  m2_pour: makeMatch({ black: [8, 5, 4], stops: -0.1, wb: [1.0, 0.99, 0.97], sat: 0.95 }),
  m3_iced: makeMatch({ black: [8, 5, 4], stops: 0.0, wb: [1.0, 1.0, 0.98], sat: 0.98 }),
  m4_espresso: makeMatch({ black: [8, 5, 3], stops: -0.05, wb: [1.0, 0.99, 0.98], sat: 0.95 }),
  m5_red: makeMatch({ black: [6, 4, 3], stops: -0.25, wb: [1.0, 0.98, 0.97], sat: 0.92 }),
  m6_pecan: makeMatch({ black: [8, 5, 4], stops: 0.05, wb: [1.0, 0.99, 0.98], sat: 0.95 }),
  m7_mirror: makeMatch({ black: [8, 5, 4], stops: -0.2, wb: [1.0, 0.99, 0.97], sat: 0.95 }),
};
const SEG = Object.fromEntries(SEGS.map(s => [s.id, s]));
const segAt = f => { for (let i = SEGS.length - 1; i >= 0; i--) if (f >= Math.round(SEGS[i].t0 * FPS)) return SEGS[i]; return SEGS[0]; };

// the sign on the corner (m1 wide, source px): the hook's keyhole is centred on it, and the push-through zooms about it
const SIGN = { x: 552, y: 600 };
// framing: z (≥1.03 crops AI edge noise), focus (fx, fy) in source px that stays put on screen while z changes,
// oy = the 4:5 cut's crop offset (source y at the top of the 1350 window at z = 1)
function framing(id, t) {
  const s = SEG[id], u = (t - s.t0) / (s.t1 - s.t0);
  const f = LY.frame[id];
  switch (id) {
    case 'A': {   // hook + S1: one continuous shot. Creep in the hook, a push through the keyhole, then a slow creep
      const zp = t < EV.push ? lerp(1.03, 1.045, t / EV.push)
        : t < EV.through ? lerp(1.045, 1.09, E.inQuad((t - EV.push) / (EV.through - EV.push)))
          : lerp(1.09, 1.13, E.outQuad(clamp((t - EV.through) / 2.67)));
      return { z: zp, fx: SIGN.x, fy: SIGN.y, oy: f.oy };
    }
    case 'G': return { z: lerp(1.03, 1.07, clamp(u)), fx: 540, fy: 960, oy: f.oy };
    default: return { z: lerp(f.z0 ?? 1.03, f.z1 ?? 1.06, u), fx: f.fx ?? 540, fy: f.fy ?? 960,
      oy: f.oy1 == null ? f.oy : lerp(f.oy, f.oy1, E.inCubic(clamp(u))) };   // oy1: a slow tilt (4:5 m3: holds for the line, then accelerates down to the wordmark into the cut)
  }
}
// shades seat the type in shadow (rows only; graduated): per shot, per format (layout.js)
async function drawFootage(t, extra = {}) {
  const f = Math.round(t * FPS);
  const seg = segAt(f);
  const img = await F.frame(seg.id, f);
  const { z, fx, fy, oy } = framing(seg.id, t);
  const sw = W / z, sh = H / z;
  const fsx = fx, fsy = fy - oy;                         // the focus point's screen position
  const sx = clamp(fx - fsx / z, 0, W - sw), sy = clamp(fy - fsy / z, 0, SH - sh);
  g.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
  softenPrint(seg.id, f - Math.round(seg.t0 * FPS), (x, y) => [(x - sx) * z, (y - sy) * z], z);
  grade(g, { match: MATCH[seg.clip], shades: CLEAN ? [] : (LY.shades[seg.id] || []), ...extra });
  return { seg, f, map: { sx, sy, z } };
}

// ---------------------------------------------------------------- the cups' small printed Arabic (CD review)
// The AI misprinted it (m3: garbled; m7: «الكميت» for «الكويت»). tools/track_patch.py tracks the block per frame;
// here it is softened past legibility with a feathered, deterministic box blur. English and «مور MOR» stay sharp.
const PATCH = await (await fetch(new URL('./assets/patches.json', import.meta.url))).json();
const PAD = { C: [44, 14, 24, 30], G: [24, 22, 26, 24] };            // left, top, right, bottom (source px)
function blurBox(d, w, h, r) {                                     // 3-pass separable box blur, in place (RGB)
  const tmp = new Float32Array(Math.max(w, h) * 3);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {                                  // horizontal
      for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
        let a = 0, n = 0;
        for (let k = -r; k <= r; k++) { const xx = Math.min(w - 1, Math.max(0, x + k)); a += d[(y * w + xx) * 4 + c]; n++; }
        tmp[x * 3 + c] = a / n;
      }
      for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) d[(y * w + x) * 4 + c] = tmp[x * 3 + c];
    }
    for (let x = 0; x < w; x++) {                                  // vertical
      for (let y = 0; y < h; y++) for (let c = 0; c < 3; c++) {
        let a = 0, n = 0;
        for (let k = -r; k <= r; k++) { const yy = Math.min(h - 1, Math.max(0, y + k)); a += d[(yy * w + x) * 4 + c]; n++; }
        tmp[y * 3 + c] = a / n;
      }
      for (let y = 0; y < h; y++) for (let c = 0; c < 3; c++) d[(y * w + x) * 4 + c] = tmp[y * 3 + c];
    }
  }
}
function softenPrint(segId, i, toScreen, scale, ctx = g) {
  const T = PATCH[segId]; if (!T) return;
  const [bx, by, bw, bh] = T[Math.max(0, Math.min(T.length - 1, i))], [pl, pt, pr, pb] = PAD[segId];
  const [x0, y0] = toScreen(bx - pl, by - pt), [x1, y1] = toScreen(bx + bw + pr, by + bh + pb);
  const fe = Math.round(12 * scale), X = Math.max(0, Math.floor(x0) - fe), Y = Math.max(0, Math.floor(y0) - fe);
  const Wd = Math.min(ctx.canvas.width, Math.ceil(x1) + fe) - X, Hd = Math.min(ctx.canvas.height, Math.ceil(y1) + fe) - Y;
  if (Wd <= 2 || Hd <= 2) return;
  const im = ctx.getImageData(X, Y, Wd, Hd), orig = new Uint8ClampedArray(im.data);
  blurBox(im.data, Wd, Hd, Math.max(3, Math.round(6 * scale)));
  for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {      // feathered rectangle: blur inside, original outside
    const dx = Math.min(x, Wd - 1 - x) / fe, dy = Math.min(y, Hd - 1 - y) / fe;
    let m = Math.min(1, dx, dy); m = m * m * (3 - 2 * m);
    const p = (y * Wd + x) * 4;
    for (let c = 0; c < 3; c++) im.data[p + c] = orig[p + c] + (im.data[p + c] - orig[p + c]) * m;
  }
  ctx.putImageData(im, X, Y);
}

// ---------------------------------------------------------------- MOR's keyhole (from the logo plate)
const LOGO = await (await fetch(new URL('./assets/logo.json', import.meta.url))).json();
const loadImg = n => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = new URL(`./assets/${n}.png`, import.meta.url).href; });
const IMG = Object.fromEntries(await Promise.all(['hole', 'ring', 'rosette', 'plant', 'word_ar', 'word_lat'].map(async n => [n, await loadImg(n)])));
await Promise.all(Object.values(IMG).map(i => i.decode()));
const LB = LOGO.layers;
const PLATE = `rgb(${LOGO.bg.join(',')})`;
// the round top of the keyhole: its width is the silhouette's width → centre and radius in plate px
const CIRC = { x: LB.hole.x + LB.hole.w / 2, y: LB.hole.y + LB.hole.w / 2, r: LB.hole.w / 2 };
// the end card: the plate's own composition, scaled; the mark block's centre sits at LY.card.cy
const MARK = { cx: LOGO.plate[0] / 2, cy: (LB.ring.y + LB.word_lat.y + LB.word_lat.h) / 2 };
const cardS = LY.card.s;
const cardAnchor = { x: W / 2 + (CIRC.x - MARK.cx) * cardS, y: LY.card.cy + (CIRC.y - MARK.cy) * cardS };

const door = document.createElement('canvas'); door.width = W; door.height = H;
const dg = door.getContext('2d');
// a lacquered burgundy door: fine vertical grain (seeded, made once), drawn so it scales with the door
const grainTex = document.createElement('canvas'); grainTex.width = 1200; grainTex.height = 2200;
{
  const c = grainTex.getContext('2d'), r = rng(7);
  c.fillStyle = '#3d121a'; c.fillRect(0, 0, 1200, 2200);
  for (let i = 0; i < 520; i++) {
    const x = r() * 1200, w = 0.6 + r() * 3.2, a = 0.025 + r() * 0.06, wav = r() * 6;
    c.strokeStyle = r() < 0.5 ? `rgba(18,4,7,${a})` : `rgba(120,52,52,${a * 0.7})`; c.lineWidth = w;
    c.beginPath(); c.moveTo(x, 0);
    for (let y = 0; y <= 2200; y += 100) c.lineTo(x + Math.sin(y / 380 + wav) * 5, y);
    c.stroke();
  }
}
const plateT = (ctx, ax, ay, S) => ctx.setTransform(S, 0, 0, S, ax - CIRC.x * S, ay - CIRC.y * S);
/** the door: everything but the keyhole is burgundy; the cream outline sits on the hole's edge.
 *  mode 'door' = lacquered burgundy door with light falloff (hook); 'plate' = MOR's flat plate colour (end card). */
function drawDoor(ax, ay, S, { mode = 'door', shake = [0, 0], fill = 0 } = {}) {
  dg.setTransform(1, 0, 0, 1, 0, 0); dg.globalCompositeOperation = 'source-over'; dg.globalAlpha = 1;
  dg.clearRect(0, 0, W, H);
  if (mode === 'door') {
    const k = S / LY.hook.s;
    dg.fillStyle = '#3d121a'; dg.fillRect(0, 0, W, H);
    dg.setTransform(k, 0, 0, k, ax + shake[0] - 600 * k, ay + shake[1] - 1100 * k);
    dg.drawImage(grainTex, 0, 0);
    dg.setTransform(1, 0, 0, 1, 0, 0);
    const rg = dg.createRadialGradient(ax, ay, 40 * S, ax, ay, 1300 * Math.max(1, S / LY.hook.s * 0.6));
    rg.addColorStop(0, 'rgba(120,40,50,0.30)'); rg.addColorStop(0.45, 'rgba(60,15,22,0)'); rg.addColorStop(1, 'rgba(8,2,4,0.62)');
    dg.fillStyle = rg; dg.fillRect(0, 0, W, H);
  } else { dg.fillStyle = PLATE; dg.fillRect(0, 0, W, H); }
  const ox = ax + shake[0], oy = ay + shake[1];
  plateT(dg, ox, oy, S);
  if (fill < 1) {
    dg.globalCompositeOperation = 'destination-out'; dg.globalAlpha = 1 - fill;
    dg.drawImage(IMG.hole, LB.hole.x, LB.hole.y);
    dg.globalCompositeOperation = 'source-over'; dg.globalAlpha = 1;
  }
  dg.drawImage(IMG.ring, LB.ring.x, LB.ring.y);
  dg.setTransform(1, 0, 0, 1, 0, 0);
}
/** the emblem's inner art (rosette + plant), blooming in; and the wordmark written right→left */
const wm = document.createElement('canvas'); wm.width = W; wm.height = H;
const wg = wm.getContext('2d');
function drawEmblemArt(ax, ay, S, t) {
  // rosette: turns in by 24° and settles (outCubic, no overshoot: calm brand); plant: grows up from its base
  const kr = tw(t, EV.bloom, 0.75, E.outCubic), kp = tw(t, EV.bloom + 0.1, 0.7, E.outCubic);
  plateT(g, ax, ay, S);
  if (kr > 0) {
    const r = LB.rosette, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    g.save(); g.globalAlpha = clamp(kr * 1.8);
    g.translate(cx, cy); g.rotate((1 - kr) * -0.42); g.scale(lerp(0.86, 1, kr), lerp(0.86, 1, kr));
    g.drawImage(IMG.rosette, -r.w / 2, -r.h / 2); g.restore();
  }
  if (kp > 0) {
    const p = LB.plant, top = p.y + p.h * (1 - kp);
    g.save(); g.beginPath(); g.rect(p.x - 10, top - 30, p.w + 20, p.h + 60); g.clip();
    g.globalAlpha = clamp(kp * 2); g.drawImage(IMG.plant, p.x, p.y + (1 - kp) * 26); g.restore();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  // wordmark: «مور» then MOR, revealed by a feathered edge travelling right→left (Arabic's direction), 12 px drift
  const kw = tw(t, EV.word, 0.8, E.outCubic);
  if (kw > 0) {
    wg.setTransform(1, 0, 0, 1, 0, 0); wg.globalCompositeOperation = 'source-over'; wg.clearRect(0, 0, W, H);
    plateT(wg, ax - (1 - kw) * 12, ay, S);
    wg.drawImage(IMG.word_ar, LB.word_ar.x, LB.word_ar.y); wg.drawImage(IMG.word_lat, LB.word_lat.x, LB.word_lat.y);
    wg.setTransform(1, 0, 0, 1, 0, 0);
    const x1 = ax + (LB.word_ar.x + LB.word_ar.w - CIRC.x) * S + 20, x0 = ax + (LB.word_lat.x - CIRC.x) * S - 20;
    const fe = 0.18, pos = lerp(-fe, 1 + fe, kw);
    const gr = wg.createLinearGradient(x1, 0, x0, 0);
    gr.addColorStop(clamp(pos - fe), 'rgba(0,0,0,1)'); gr.addColorStop(clamp(pos), 'rgba(0,0,0,0)');
    wg.globalCompositeOperation = 'destination-in'; wg.fillStyle = gr; wg.fillRect(0, 0, W, H);
    g.drawImage(wm, 0, 0);
  }
}

// ---------------------------------------------------------------- the frame
let overlay = { render() {} };
if (!CLEAN) { const m = await import('./overlay.js'); overlay = await m.makeOverlay(stage, { W, H, LY, poster: POSTER, cardAnchor, cardS, CIRC, LB }); }
const hud = INFO ? Object.assign(document.createElement('div'), { style: 'position:absolute;left:8px;top:8px;font:600 22px "JetBrains Mono";color:#fff;background:#000a;padding:4px 8px;z-index:9' }) : null;
if (hud) stage.appendChild(hud);

/** hook geometry at time t: the keyhole centred on the sign, creeping, a key-turn shake, then the push through */
function hookAt(t) {
  const s0 = LY.hook.s;
  const ax = LY.hook.x, ay = LY.hook.y;
  let S = s0 * (1 + 0.05 * clamp(t / EV.push));
  if (t >= EV.push) {
    const u = clamp((t - EV.push) / (EV.through - EV.push));
    S = Math.exp(lerp(Math.log(s0 * 1.05), Math.log(s0 * 20), E.inCubic(u)));
  }
  const st = t - EV.unlock;                              // the lock gives: a small knock through the door, ~6 frames
  const amp = st > 0 && st < 0.25 ? 6 * Math.exp(-st * 22) : 0;
  return { ax, ay, S, shake: [Math.sin(st * 70) * amp * 0.4, Math.cos(st * 61) * amp] };
}
function cardAt(t) {
  const u = tw(t, EV.pullBack, EV.pullBackDur, E.outCubic);
  const S = Math.exp(lerp(Math.log(cardS * 24), Math.log(cardS), u)) * (1 + 0.012 * clamp((t - EV.pullBack - EV.pullBackDur) / 2));
  const ax = lerp(W / 2, cardAnchor.x, E.outCubic(clamp(u * 1.4))), ay = lerp(H / 2, cardAnchor.y, E.outCubic(clamp(u * 1.4)));
  return { ax, ay, S };
}

const { POSTER_T = 0, POSTER_PIC = null } = POSTER ? await import('./poster.js') : {};
async function seek(t) {
  if (POSTER) t = POSTER_T;
  let info = null;
  const tail = !POSTER && t >= EV.sting + 0.2;        // the ink TASH tail covers the frame from here
  if (tail) { g.fillStyle = '#0B0B0B'; g.fillRect(0, 0, W, H); }
  else if (POSTER) {                                  // COVER: the keyhole frames MOR's cup (correct mark), not the AI sign
    const P = POSTER_PIC, seg = SEG[P.seg], img = await F.frame(P.seg, Math.round(seg.t0 * FPS) + P.i);
    const X0 = P.at[0] - P.src[0] * P.k, Y0 = P.at[1] - P.src[1] * P.k;
    g.fillStyle = '#14080B'; g.fillRect(0, 0, W, H);
    g.drawImage(img, 0, 0, 1080, SH, X0, Y0, 1080 * P.k, SH * P.k);
    softenPrint(P.seg, P.i, (x, y) => [X0 + x * P.k, Y0 + y * P.k], P.k);
    grade(g, { match: MATCH[seg.clip], exp: 1.1 });
    const h = hookAt(t); drawDoor(h.ax, h.ay, h.S); g.drawImage(door, 0, 0);
  } else if (t < EV.through) {                          // HOOK: through the keyhole
    const h = hookAt(t);
    const unlockLift = 1 + 0.28 * tw(t, EV.unlock, 0.18, E.outCubic);  // the lock gives and the light inside comes up
    info = await drawFootage(t, { exp: unlockLift * lerp(0.82, 1, tw(t, EV.push, 0.6, E.inOutSine)) });
    drawDoor(h.ax, h.ay, h.S, { shake: h.shake }); g.drawImage(door, 0, 0);
  } else if (t < EV.pullBack) {
    info = await drawFootage(t);
  } else {                                            // END CARD: back out through the keyhole onto MOR's plate
    const c = cardAt(t);
    const fill = tw(t, EV.bloom - 0.08, 0.42, E.inOutSine);
    if (fill < 1) info = await drawFootage(Math.min(t, C.footage.segs.at(-1).t1 - 1 / FPS));
    else { g.fillStyle = PLATE; g.fillRect(0, 0, W, H); }
    drawDoor(c.ax, c.ay, c.S, { mode: 'plate', fill }); g.drawImage(door, 0, 0);
    drawEmblemArt(c.ax, c.ay, c.S, t);
  }
  grain(grainCv, Math.round(t * FPS), { amount: 24, scale: 2 });
  overlay.render(t);
  if (hud) hud.textContent = `t ${t.toFixed(3)}  f ${Math.round(t * FPS)}` + (info ? `  ${info.seg.id} ${info.seg.clip}  src f ${F.srcPos(info.seg.id, info.f).toFixed(2)}` : '');
}
let queue = Promise.resolve();
const seekQ = t => (queue = queue.then(() => seek(t)));
boot({ width: W, height: H, fps: FPS, duration: C.duration, seek: seekQ });
