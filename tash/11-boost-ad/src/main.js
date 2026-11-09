// TASH boost ad «نقاط مشروعك» (The Dots on Your Project): 20.000 s master + variants. Everything is a pure function of t.
// Idea: the ش in «مشروعك» carries TASH's three typing dots. When nobody talks, the dots fall off and the word stops reading
// («مسروعك»); TASH brings them back as studio lamps, the word lights up, and the talk turns out to be «طشّ».
// Variants: ?hook=A|B  ?plat=ig|tt  ?fmt=916|45  ?len=20|14   (+ ?no3d for a fast 2D-only preview)
// Locked treatment: ../TREATMENT.md · timing: ./cues.json (shared with audio.py) · camera: ./rig.js (shared with scene3d.js)
import { boot, clamp, lerp, E, typing, rng, grain } from '/_system/motion/kit.js';
import D from '/_system/brand/logo-data.mjs';
import { makeRig } from './rig.js';

const Q = new URLSearchParams(location.search);
const FMT = Q.get('fmt') === '45' ? '45' : '916';
const PLAT = Q.get('plat') === 'tt' ? 'tt' : 'ig';
const HOOK = Q.get('hook') === 'B' ? 'B' : 'A';
const LEN14 = Q.get('len') === '14';
const C0 = await (await fetch('./cues.json')).json();
const C = LEN14 ? { ...C0, duration: C0.len14.duration, studio: C0.len14.studio, hero3: C0.len14.hero3, cta: C0.len14.cta } : C0;
const WORD = await (await fetch('./assets/word.json')).json();
const W = 1080, H = FMT === '45' ? 1350 : 1920, DY = FMT === '45' ? C.dy45 : 0, FPS = C.fps, DUR = C.duration;
const A = { x: C.A[0], y: C.A[1] + DY };
const BL = C.baseline + DY;
const S = C.studio, H3 = C.hero3, CT = C.cta;
const COL = { ink: '#0B0B0B', paper: '#F5F5E9', lime: '#C6FF00', smoke: '#8E9088', char: '#1A1A18' };

// ------------------------------------------------------------------ helpers
const fp = (f, a, b) => clamp((f - a) / (b - a));
const ef = (f, a, b, e = E.outExpo) => e(fp(f, a, b));
const T = C.typing;
const typ = (t, i, amp) => -typing(t + T.lead, i, { period: T.period, phase: T.phase, amp });   // px up (≥ 0)
/** Height + landing squash of a typing dot. */
function typState(t, i, amp) {
  const local = (((t + T.lead - i * T.phase) % T.period) + T.period) % T.period / T.period;
  const h = typ(t, i, amp);
  const sq = local >= 0.5 && local < 0.58 ? 0.08 * (1 - (local - 0.5) / 0.08) * clamp(amp / 24) : 0;
  return { h, sq };
}
const shake = (t, t0, amp) => { const s = t - t0; if (s < 0 || s > 0.4) return [0, 0]; const a = amp * Math.exp(-s / 0.055); return [Math.sin(s * 90) * a, Math.cos(s * 77) * a]; };
const hex = h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16));
const mix = (a, b, k) => { const x = hex(a), y = hex(b); return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], k))).join(',')})`; };

// ------------------------------------------------------------------ canvases
const $ = id => document.getElementById(id);
const stage = $('stage'); stage.style.height = H + 'px';
const cv = {};
for (const id of ['bg', 'gl', 'c2', 'fx', 'grain']) { cv[id] = $(id); cv[id].width = W; cv[id].height = H; }
$('vig').style.cssText += `;width:${W}px;height:${H}px;background:radial-gradient(ellipse 72% 58% at 50% 46%, rgba(0,0,0,0) 58%, rgba(0,0,0,.12) 100%)`;
const c2 = cv.c2.getContext('2d'), fx = cv.fx.getContext('2d');
// one grade over the studio (screen space, so every camera move keeps it): a soft top and bottom falloff
const grade = document.createElement('div'); grade.className = 'layer'; cv.gl.after(grade);
grade.style.cssText += `;width:${W}px;height:${H}px;visibility:hidden;pointer-events:none;background:linear-gradient(to bottom, rgba(8,8,7,.25) 0%, rgba(8,8,7,0) 20%, rgba(8,8,7,0) 52%, rgba(8,8,7,.5) 100%)`;

// background: Ink with a soft top falloff to Char, dithered ±1.5 levels (no banding after encode)
{
  const g = cv.bg.getContext('2d'), img = g.createImageData(W, H), d = img.data, r = rng(11);
  const ink = hex(COL.ink), ch = hex(COL.char);
  for (let y = 0; y < H; y++) {
    const k = Math.pow(clamp(1 - y / (H * 0.62)), 1.6);
    for (let x = 0; x < W; x++) {
      const n = (r() + r() - 1) * 1.5, o = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) d[o + c] = clamp(lerp(ink[c], ch[c], k) + n, 0, 255);
      d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

// ------------------------------------------------------------------ word bodies (dotless, from word.json) + wordmark
const BODY = {};
for (const [k, w] of Object.entries(WORD.words)) BODY[k] = { path: new Path2D(w.d), ox: A.x - w.slot[0], ink: w.ink, slot: w.slot };
const MS = C.markScale;
const MID = { x: D.DOTS.cx + D.TX, y: D.DOTS.cy + D.TY };
const MARK = { lx: A.x - MID.x * MS, ly: A.y - MID.y * MS, body: new Path2D(D.BODY), shadda: new Path2D(D.SHADDA) };

function withGroup(ctx, G, fn) { ctx.save(); ctx.translate(A.x + G.dx, A.y + G.dy); ctx.scale(G.k, G.k); ctx.translate(-A.x, -A.y); fn(); ctx.restore(); }
function drawBody(ctx, key, { color = COL.paper, alpha = 1, dy = 0, blur = 0 } = {}) {
  if (alpha <= 0) return;
  const b = BODY[key];
  ctx.save(); ctx.globalAlpha = alpha; if (blur > 0.05) ctx.filter = `blur(${blur.toFixed(2)}px)`;
  ctx.translate(b.ox, BL + dy); ctx.fillStyle = color; ctx.fill(b.path); ctx.restore();
}
function drawMark(ctx, { alpha = 1, dy = 0, blur = 0, shaddaDY = 0, shaddaAlpha = 1, wipe = 1 } = {}) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha; if (blur > 0.05) ctx.filter = `blur(${blur.toFixed(2)}px)`;
  if (wipe < 1) { const x0 = MARK.lx - 20, w = D.W * MS + 40; ctx.beginPath(); ctx.rect(x0 + (1 - wipe) * w, 0, wipe * w + 2, H); ctx.clip(); }
  ctx.translate(MARK.lx, MARK.ly + dy); ctx.scale(MS, MS);
  ctx.fillStyle = COL.paper;
  ctx.save(); ctx.translate(D.TX, D.TY); ctx.fill(MARK.body); ctx.restore();
  if (shaddaAlpha > 0) { ctx.globalAlpha = alpha * shaddaAlpha; ctx.translate(D.TX + D.SHADDA_DX, D.TY + D.SHADDA_DY + shaddaDY); ctx.fill(MARK.shadda); }
  ctx.restore();
}
/** Contact shadows: each resting dot casts a soft Ink ellipse on the letter tops beneath it (multiply, masked by the word). */
function contactShadows(ctx, key, row, dy = 0) {
  const b = BODY[key];
  ctx.save();
  ctx.translate(b.ox, BL + dy); ctx.clip(b.path); ctx.translate(-b.ox, -(BL + dy));
  ctx.globalCompositeOperation = 'multiply'; ctx.filter = 'blur(3px)';
  for (const d of row) {
    const o = lerp(0.30, 0.08, clamp(d.h / 24)) * (d.a ?? 1);
    ctx.fillStyle = `rgba(11,11,11,${o.toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(d.x, 525 + DY + dy, 1.1 * d.r, 4, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ text lines (canvas, shaped by the browser; per WORD)
const F = { l2: '800 84px Alexandria', l3: '800 80px Alexandria', tag: '700 64px Alexandria', cta: '700 64px Alexandria', handle: '600 40px "JetBrains Mono"' };
function makeLine(text, font, cx, base, opts = {}) {
  c2.font = font;
  const words = text.split(' ');
  return { text, font, cx, base: base + DY, words, ws: words.map(w => c2.measureText(w).width), sp: c2.measureText(' ').width, total: c2.measureText(text).width, ...opts };
}
function drawLine(ctx, L, fxw) {
  ctx.save(); ctx.font = L.font; ctx.textBaseline = 'alphabetic';
  if (L.ltr) {
    const e = fxw(0); if (e.alpha > 0) { ctx.direction = 'ltr'; ctx.textAlign = 'center'; ctx.globalAlpha = e.alpha; if (e.blur > 0.05) ctx.filter = `blur(${e.blur.toFixed(2)}px)`; ctx.fillStyle = e.color || L.color || COL.paper; ctx.fillText(L.text, L.cx, L.base + (e.dy || 0)); }
    ctx.restore(); return;
  }
  ctx.direction = 'rtl'; ctx.textAlign = 'right';
  let xr = L.cx + L.total / 2;
  L.words.forEach((w, i) => {
    const e = fxw(i);
    if (e.alpha > 0) {
      ctx.save(); ctx.globalAlpha = e.alpha; if (e.blur > 0.05) ctx.filter = `blur(${e.blur.toFixed(2)}px)`;
      ctx.fillStyle = e.color || (L.lime === i ? COL.lime : COL.paper); ctx.fillText(w, xr, L.base + (e.dy || 0)); ctx.restore();
    }
    xr -= L.ws[i] + L.sp;
  });
  ctx.restore();
}
const on = () => ({ alpha: 1, blur: 0, dy: 0 });
const rise = (f, starts, dur = 6, r = 34, b = 9) => i => { const k = ef(f, starts[i], starts[i] + dur); return { alpha: clamp(k * 1.6), blur: (1 - k) * b, dy: (1 - k) * r }; };
const exitUp = (f, f0, inner) => i => { const e = inner(i), k = ef(f, f0 + i, f0 + i + 3, E.inExpo); return { ...e, alpha: e.alpha * (1 - k), dy: (e.dy || 0) - 30 * k, blur: (e.blur || 0) + 6 * k }; };
await Promise.all([F.l2, F.tag, F.handle, '800 80px Alexandria'].map(f => document.fonts.load(f, 'طشّ @tash')));
const LINE = {
  hilu: makeLine('حلو…', F.l2, 470, 775),
  q: makeLine('محد يسولف عنه؟', F.l2, 497, 775),
  prop: makeLine('خلّ إعلانك علينا', F.l3, 620, 815),
  talk: makeLine('من وين طلبتيه؟!', F.l2, 490, 400),
  tag: makeLine('خلّهم يسولفون عنك!', F.tag, 620, 815),
  cta: PLAT === 'tt' ? makeLine('دزّ لنا بالخاص', F.cta, 506, 755, { lime: 2 }) : makeLine('اطلب إعلانك بالخاص', F.cta, 506, 755, { lime: 2 }),
  handle: makeLine(PLAT === 'tt' ? '@tash.creative' : '@tash.creative.kw', F.handle, 506, 840, { ltr: true }),
};

// ------------------------------------------------------------------ 3D studio
const rig = makeRig(C, { W, H, A });
let studio = null;
if (!Q.has('no3d')) {
  const { createStudio } = await import('./scene3d.js');
  studio = await createStudio(cv.gl, { W, H, A, word: WORD.words.mashrou3ak, baseline: BL, rig, tune: JSON.parse(Q.get('tune') || '{}') });
}

// ------------------------------------------------------------------ the dots (screen space)
const P0 = C.dot.pitch, R0 = C.dot.d / 2, PM = C.dot.pitchMark, RM = C.dot.dMark / 2;
const ZEND = 1.03 * 1.10;                               // the studio's final zoom (creep × punch)
const rowX = (i, pitch) => A.x + (1 - i) * pitch;
function ctaAmp(t) {
  const t0 = CT.swap[0] / FPS;
  if (t < t0) return 0;
  let a = 16 * E.inOutCubic(clamp((t - t0) / (CT.calm - t0)));
  if (t > CT.full - 1) a = lerp(16, 24, E.inOutCubic(clamp(t - (CT.full - 1))));
  return a;
}
/** Group transform about A (slams, creeps, shakes, jolts) for the 2D word and its dots. */
function group(t) {
  const f = t * FPS;
  let k = 1, dx = 0, dy = 0;
  const sh = (t0, a) => { const s = shake(t, t0, a); dx += s[0]; dy += s[1]; };
  if (f < 30) {
    k = lerp(1.06, 1, ef(f, 0, 3)); sh(2 / FPS, 4);       // the shake starts on the landing (f2), so f0 stays crisp
    if (HOOK === 'B' && f >= 15) { k = lerp(1.025, 1, ef(f, 15, 17)); }
  } else if (f < 90) {
    if (HOOK === 'B' && f < 33) k = lerp(1.035, 1, ef(f, 30, 32));
    for (const e of C.break.exit) if (f >= e && f < e + 4) dy += 6 * (1 - fp(f, e, e + 4)) ** 2;
  } else if (f < S.cut) {
    k = lerp(1.12, 1, ef(f, 90, 96)) * lerp(1, 1.02, fp(f, 90, S.cut)); sh(3, 4);
  } else if (f >= H3.snap && f < CT.swap[0]) {
    k = lerp(1.10, 1, ef(f, H3.snap, H3.snap + 6)) * lerp(1, 1.015, fp(f, H3.snap, CT.swap[0])); sh(H3.snap / FPS, 4);
  } else if (f >= CT.windup) {
    k = 1 + 0.10 * E.inCubic(fp(f, CT.windup, DUR * FPS));
  }
  return { k, dx, dy };
}
const applyG = (G, p) => ({ ...p, x: A.x + G.dx + (p.x - A.x) * G.k, y: A.y + G.dy + (p.y - A.y) * G.k, r: p.r * G.k });

/** The three dots at time t (screen px). Each: {x, y, r, sq (+squash / −stretch), glow (0..1)}. */
function dotsAt(t) {
  const f = t * FPS, G = group(t);
  const row = (pitch, r, amp) => [0, 1, 2].map(i => { const s = typState(t, i, amp); return applyG(G, { x: rowX(i, pitch), y: A.y - s.h, r, sq: s.sq, h: s.h }); });
  if (f < 30) return row(P0, R0, T.amp);
  if (f < 45) {                                                   // the talk breaks: crack, jolt, fall toward the camera
    return [0, 1, 2].map(i => {
      const h0 = typ(1.0, i, T.amp), x0 = rowX(i, P0), y0 = A.y - h0;
      const fs = C.break.fall[i];
      let sq = f < 32 ? 0.25 * (1 - fp(f, 30, 32)) : 0;
      if (f < fs) return applyG(G, { x: x0, y: y0, r: R0, sq });
      const p = fp(f, fs, fs + C.break.fallDur);
      if (p >= 1) return null;
      const q = E.inQuad(p), tip = -16 * Math.sin(Math.PI * clamp(p / 0.4)) * (p < 0.4 ? 1 : 0);
      return { x: lerp(x0, x0 + [170, 50, -110][i], q), y: lerp(y0, H + 125, q) + tip, r: lerp(R0, C.break.fallDMax / 2, q), sq: -0.12 * q };
    });
  }
  if (f < C.ret.enter[2]) return [];
  if (f < 90) {                                                    // the return: big, from below right, arcing left
    const order = [2, 1, 0];
    return [0, 1, 2].map(i => {
      const fe = C.ret.enter[i];
      if (f < fe) return null;
      const o = order.indexOf(i);
      const end = { x: rowX(i, P0), y: A.y - 60 };
      const p = E.outCubic(fp(f, fe, C.ret.row));
      const p0 = { x: 958 + 30 * o, y: H + 95 }, p1 = { x: 1062, y: A.y + 10 };    // clear of the question's right end (x 864)
      let x = (1 - p) ** 2 * p0.x + 2 * p * (1 - p) * p1.x + p * p * end.x;
      let y = (1 - p) ** 2 * p0.y + 2 * p * (1 - p) * p1.y + p * p * end.y;
      let r = lerp(54, R0, E.outCubic(fp(f, fe, C.ret.row))), sq = 0;
      if (f >= C.ret.compress[0] && f < C.ret.compress[1]) sq = 0.08 * Math.sin(Math.PI * fp(f, C.ret.compress[0], C.ret.compress[1]));
      if (f >= 87.5) { y = lerp(end.y, A.y, E.inQuad(fp(f, 87.5, 90))); sq = -0.1 * fp(f, 87.5, 90); }
      return { x, y, r, sq };
    });
  }
  if (f < S.cut) {                                                 // HERO 1: the dots sit in «طشّ»
    const g = ef(f, 90, 96);
    const pitch = lerp(P0, PM, g), r = lerp(R0, RM, g);
    const amp = t >= 3.75 && t < 4.62 ? C.typing.ampMark : 0;
    return [0, 1, 2].map(i => { const s = typState(t, i, amp); return applyG(G, { x: rowX(i, pitch), y: A.y - s.h, r, sq: (f < 94 ? 0.2 * (1 - fp(f, 90, 94)) : 0) + s.sq }); });
  }
  if (f < S.fallAway[0]) {                                        // the studio: projected through the shared rig
    const cam = rig.camera(f);
    return [0, 1, 2].map(i => {
      const d = rig.dot3(f, i), p = rig.project(cam, d.pos, d.r);
      return { x: p.x, y: p.y, r: p.r, sq: d.sq, glow: d.lamp };
    });
  }
  if (f < H3.snap) {                                               // the world falls away; a hop into the snap
    const hop = 22 * Math.sin(Math.PI * fp(f, S.fallAway[0] + 3, H3.snap));
    return [0, 1, 2].map(i => ({ x: rowX(i, P0 * ZEND), y: A.y - hop, r: R0 * ZEND, sq: f >= S.fallAway[0] + 3 && f < S.fallAway[0] + 5 ? 0.08 : 0 }));
  }
  if (f < CT.swap[0]) {                                            // HERO 3: «طشّ» snaps around the dots
    const g = ef(f, H3.snap, H3.snap + 6);
    const pitch = lerp(P0 * ZEND, PM, g), r = lerp(R0 * ZEND, RM, g) * (1 + 0.012 * Math.sin(t * Math.PI * 2));
    return [0, 1, 2].map(i => applyG(G, { x: rowX(i, pitch), y: A.y, r, sq: f < H3.snap + 4 ? 0.2 * (1 - fp(f, H3.snap, H3.snap + 4)) : 0 }));
  }
  const g = ef(f, CT.swap[0], CT.swap[1], E.outCubic);           // hand-back + CTA hold + wind-up
  return row(lerp(PM, P0, g), lerp(RM, R0, g), ctaAmp(t));
}

// the crowd: 18 small typing triplets bloom on the lit sweep, one per clap, then stream into the ش
const CROWD = (() => {
  if (!S.crowd) return [];
  const r = rng(29), out = [], band = FMT === '45' ? [988, 1290] : [900, 1450];
  const n = 18, [c0, c1] = S.crowd, [s0, s1] = S.stream;
  for (let k = 0; k < n; k++) {
    let x, y, tries = 0;
    do { x = 150 + r() * 780; y = band[0] + r() * (band[1] - band[0]); tries++; } while (tries < 60 && out.some(o => Math.hypot(o.x - x, o.y - y) < 120));
    out.push({ x, y, d: 10 + r() * 4, ph: r(), born: c0 + k * (c1 - c0) / (n - 1), leave: s0 + (k / (n - 1)) * (s1 - s0 - 6), seed: k });
  }
  return out;
})();
function crowdAt(t) {
  const f = t * FPS, out = [];
  if (!S.crowd || f < S.crowd[0] - 1 || f >= S.stream[1] + 1) return out;
  for (const c of CROWD) {
    if (f < c.born) { out.push(null, null, null); continue; }
    const pop = Math.min(1, 1 - Math.exp(-6 * fp(f, c.born, c.born + 6)) * Math.cos(2.5 * fp(f, c.born, c.born + 6) * Math.PI));
    const merge = E.inOutCubic(fp(f, c.leave - 3, c.leave + 1));      // the triplet folds into one dot, then streams
    const pitch = c.d * 1.25 * (1 - merge), rr = c.d / 2 * clamp(pop, 0, 1.15) * (1 + 0.45 * merge);
    const go = E.inCubic(fp(f, c.leave, c.leave + 7));
    for (let i = 0; i < 3; i++) {
      const h = -typing(t + c.ph, i, { period: 0.5, phase: 1 / 12, amp: c.d * 0.9 }) * (1 - merge);
      const x0 = c.x + (1 - i) * pitch, y0 = c.y - h;
      const tx = rowX(i, P0 * ZEND), ty = A.y;
      const cx = (x0 + tx) / 2 + (c.x < A.x ? -80 : 80), cy = Math.min(y0, ty) - 40;
      const x = (1 - go) ** 2 * x0 + 2 * go * (1 - go) * cx + go * go * tx;
      const y = (1 - go) ** 2 * y0 + 2 * go * (1 - go) * cy + go * go * ty;
      out.push({ x, y, r: rr * (1 - 0.6 * go), sq: 0, a: 1 - Math.max(0, (go - 0.85) / 0.15) });
    }
  }
  return out;
}

/** One dot over the shutter: a disc when still (with squash), a smear (two circles + their tangent hull) when moving. */
function smear(ctx, p, q) {
  if (!p && !q) return;
  if (!p || !q) { const d = p || q; disc(ctx, d); return; }
  const dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy);
  if (L < 0.75) { disc(ctx, { ...q, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }); return; }
  const r0 = Math.max(0.2, p.r), r1 = Math.max(0.2, q.r), nx = -dy / L, ny = dx / L;
  ctx.globalAlpha = (q.a ?? 1) * clamp(1.08 - 0.05 * L / (r0 + r1), 0.72, 1);
  const P = [[p.x + nx * r0, p.y + ny * r0], [q.x + nx * r1, q.y + ny * r1], [q.x - nx * r1, q.y - ny * r1], [p.x - nx * r0, p.y - ny * r0]];
  const area = P.reduce((s2, a, k) => { const b = P[(k + 1) % 4]; return s2 + a[0] * b[1] - b[0] * a[1]; }, 0);
  const ccw = area < 0;                                  // circles wound like the hull, so nonzero fill has no holes
  ctx.beginPath();
  ctx.moveTo(...P[0]); for (let k = 1; k < 4; k++) ctx.lineTo(...P[k]); ctx.closePath();
  ctx.moveTo(p.x + r0, p.y); ctx.arc(p.x, p.y, r0, 0, Math.PI * 2, ccw);
  ctx.moveTo(q.x + r1, q.y); ctx.arc(q.x, q.y, r1, 0, Math.PI * 2, ccw);
  ctx.fill('nonzero');
}
function disc(ctx, d) {
  if (!d || d.r <= 0.2) return;
  const sq = d.sq || 0;
  ctx.globalAlpha = d.a ?? 1;
  ctx.beginPath(); ctx.ellipse(d.x, d.y + d.r * sq * 0.9, d.r * (1 + sq * 0.6), d.r * (1 - sq), 0, 0, Math.PI * 2); ctx.fill();
}
function drawDots(t) {
  fx.clearRect(0, 0, W, H);
  const main = dotsAt(t);
  // lamp glows (2D: 3.5×Ø)
  for (const d of main) {
    if (!d || !d.glow) continue;
    const R = d.r * 3.5, g = fx.createRadialGradient(d.x, d.y, d.r * 0.6, d.x, d.y, R);
    g.addColorStop(0, `rgba(232,255,170,${(0.2 * d.glow).toFixed(3)})`); g.addColorStop(1, 'rgba(232,255,170,0)');
    fx.fillStyle = g; fx.fillRect(d.x - R, d.y - R, 2 * R, 2 * R);
  }
  // shutter 180°: each dot is smeared between its positions at shutter open and close (crisp, bright, on-brand)
  const sh = 0.25 / FPS, a0 = dotsAt(t - sh), a1 = dotsAt(t + sh), c0 = crowdAt(t - sh), c1 = crowdAt(t + sh);
  fx.fillStyle = COL.lime;
  for (let i = 0; i < Math.max(a0.length, a1.length); i++) smear(fx, a0[i], a1[i]);
  for (let i = 0; i < Math.max(c0.length, c1.length); i++) smear(fx, c0[i], c1[i]);
  fx.globalAlpha = 1;
}

// ------------------------------------------------------------------ the frame
function seek(t) {
  const f = t * FPS;
  const in3D = studio && f >= S.cut && f < S.fallAway[1];
  // 3D layer
  if (in3D) {
    studio.render(f);
    cv.gl.style.visibility = 'visible';
    const p = fp(f, S.fallAway[0], S.fallAway[1]);
    cv.gl.style.transformOrigin = `${A.x}px ${A.y}px`;
    cv.gl.style.transform = p > 0 ? `scale(${lerp(1, 0.94, E.inCubic(p)).toFixed(4)})` : 'none';
    cv.gl.style.filter = p > 0 ? `blur(${(14 * p).toFixed(2)}px)` : 'none';
    cv.gl.style.opacity = String(1 - E.inQuad(p));
    grade.style.visibility = 'visible'; grade.style.opacity = cv.gl.style.opacity;
  } else { cv.gl.style.visibility = 'hidden'; grade.style.visibility = 'hidden'; }

  // 2D word + text
  c2.clearRect(0, 0, W, H);
  const G = group(t);
  const d0 = dotsAt(t);
  if (f < 90) {
    let key = 'mashrou3ak';
    if (HOOK === 'B') key = f < 15 ? 'mashawi' : f < 30 ? 'rmoosh' : 'mashrou3ak';
    const dim = ef(f, C.break.dim[0], C.break.dim[1], E.inOutCubic);
    const color = mix(COL.paper, COL.smoke, dim);
    const alpha = lerp(1, 0.85, ef(f, C.break.dim[1], 72, E.outCubic));
    const sink = 8 * E.outQuad(fp(f, C.break.dim[0], 80));
    withGroup(c2, G, () => {
      drawBody(c2, key, { color, alpha, dy: sink });
      if (f < 30) contactShadows(c2, key, d0.map(d => ({ x: A.x + (d.x - A.x - G.dx) / G.k, r: d.r / G.k, h: d.h })));
    });
    if (HOOK === 'A') {
      if (f < 30) drawLine(c2, LINE.hilu, on);
      else if (f < 33) { const p = fp(f, 30, 33); drawLine(c2, LINE.hilu, () => ({ alpha: 1 - p, dy: 40 * E.outQuad(p), blur: 4 * p })); }
    }
    if (f >= C.break.question) drawLine(c2, LINE.q, on);
  } else if (f < S.cut) {
    withGroup(c2, G, () => drawMark(c2));
    drawLine(c2, LINE.prop, rise(f, C.hero1.prop));
  } else if (f < H3.snap) {
    if (S.talk) drawLine(c2, LINE.talk, exitUp(f, S.talkOut, rise(f, S.talk, 6, 30, 8)));
    if (!studio) withGroup(c2, G, () => drawBody(c2, 'mashrou3ak', { color: '#3a3a36' }));
  } else if (f < CT.swap[1] + 1) {
    const p = ef(f, CT.swap[0], CT.swap[1], E.inOutCubic);
    const wipe = ef(f, H3.snap - 1, H3.snap + 4, E.outCubic);
    const sk = f < H3.shadda ? 0 : 1 - Math.exp(-7.5 * (f - H3.shadda) / FPS) * Math.cos(2 * Math.PI * 2.4 * (f - H3.shadda) / FPS);
    withGroup(c2, G, () => {
      drawMark(c2, { wipe, alpha: 1 - p, dy: 60 * E.inCubic(p), blur: 10 * p, shaddaDY: (1 - sk) * -260, shaddaAlpha: f < H3.shadda ? 0 : clamp((f - H3.shadda) / 2.4) });
      if (f >= CT.swap[0]) drawBody(c2, 'mashrou3ak', { alpha: p, dy: 60 * (1 - p), blur: 10 * (1 - p) });
    });
    if (H3.tag) drawLine(c2, LINE.tag, exitUp(f, H3.tagOut, rise(f, H3.tag, 6, 30, 8)));
    if (f >= CT.swap[0]) drawLine(c2, LINE.cta, i => { const k = ef(f, CT.words[i], CT.words[i] + 4, E.outCubic); return { alpha: k, blur: 14 * (1 - k), dy: 8 * (1 - k) }; });
  } else {
    const wind = f >= CT.windup ? fp(f, CT.windup, DUR * FPS) : 0;
    withGroup(c2, G, () => {
      drawBody(c2, 'mashrou3ak', { blur: 4 * wind });
      contactShadows(c2, 'mashrou3ak', d0.map(d => ({ x: A.x + (d.x - A.x - G.dx) / G.k, r: d.r / G.k, h: d.h })));
    });
    drawLine(c2, LINE.cta, on);
  }
  if (f >= CT.handle[0]) { const k = ef(f, CT.handle[0], CT.handle[1], E.outCubic); drawLine(c2, LINE.handle, () => ({ alpha: k, blur: 8 * (1 - k), dy: 0 })); }

  drawDots(t);
  grain(cv.grain, Math.round(f), { amount: 22, scale: 2 });
}

boot({ width: W, height: H, fps: FPS, duration: DUR, seek });
