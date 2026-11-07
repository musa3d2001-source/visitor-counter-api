// specialty dose «ناقصك دوز.» — unofficial spec STORY ad by TASH (not commissioned by specialty dose). The page is a
// pure function of time. Picture: the five CD-reviewed AI clips (../footage/ai/), fixed and conformed to the edit as
// 30 fps JPEG sequences (tools/extract.sh: prep.py → conform.py), drawn by frame index, one shared grade (grade.js).
// The hook is the grinders' first frame held grey, dark and out of focus under the low mood battery; the first dose
// brings focus and colour back. The wall sign in d5b is dose's real mark (tools/fx_sign.py), and the end card is a
// graphic match: the world dissolves to white plaster while the mark stays put, then the lockup settles.
// Type, the mood widget, the tag, the end-card mark, the slate and the TASH tail: overlay.js.
// URL: ?clean=1 (no type) · ?poster=1 (story cover) · ?t=… / ?play (preview) · ?info=1 (HUD)
import { boot, grain, clamp, lerp, tw, E } from '/_system/motion/kit.js';
import { C } from './cues.js';
import * as F from './footage.js';
import { makeMatch, makeGrader } from './grade.js';
import { LY } from './layout.js';

const q = new URLSearchParams(location.search);
const CLEAN = q.has('clean'), POSTER = q.has('poster'), INFO = q.has('info');
const W = LY.W, H = LY.H, FPS = 30;
const EV = C.ev, SEGS = C.footage.segs;

const cv = document.getElementById('pic');
const g = cv.getContext('2d', { alpha: false, willReadFrequently: true });
g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
const grainCv = document.getElementById('grain');
const grade = makeGrader(W, H);

// ---------------------------------------------------------------- per-clip match (→ one warm afternoon) and framing
const MATCH = {
  d1_grinders: makeMatch({ black: [4, 3, 2], stops: 0.0, wb: [1.0, 0.99, 0.97], sat: 1.0, contrast: 1.05 }),
  d2d_carafe: makeMatch({ black: [7, 5, 4], stops: -0.06, wb: [1.0, 0.975, 0.95], sat: 1.0, contrast: 1.12 }),     // coffee deeper, less amber
  d3_iced: makeMatch({ black: [6, 6, 6], stops: -0.04, wb: [1.045, 1.0, 0.91], sat: 1.05, contrast: 1.06 }),       // the cool one, warmed
  d4_cake: makeMatch({ black: [4, 3, 2], stops: 0.0, wb: [1.0, 0.99, 0.97], sat: 1.0, contrast: 1.05 }),
  d5b_terrace: makeMatch({ black: [4, 3, 2], stops: -0.04, wb: [1.0, 0.995, 0.99], sat: 0.98, contrast: 1.03 }),
};
const SEG = Object.fromEntries(SEGS.map(s => [s.id, s]));
const segAt = f => { for (let i = SEGS.length - 1; i >= 0; i--) if (f >= Math.round(SEGS[i].t0 * FPS)) return SEGS[i]; return SEGS[0]; };

/** framing of a segment at time t: screen = (source − [sx, sy]) · z */
export function framing(id, t) {
  const s = SEG[id], f = LY.frame[id], u = clamp((t - s.t0) / (s.t1 - s.t0));
  const z = lerp(f.z0, f.z1, u);
  if (f.anchor === 'tr') return { z, sx: W - W / z, sy: 0 };
  return { z, sx: f.fx - f.fx / z, sy: f.fy - f.fy / z };
}

// the hook's soft focus: a cheap, deterministic blur (box downscale to 1/16, then a ladder of 2x bilinear upscales,
// which is smooth where a single 16x upscale would show the grid)
const LAD = [[540, 960], [270, 480], [135, 240], [68, 120]].map(([w, h]) => { const c = new OffscreenCanvas(w, h), x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; return { c, x, w, h }; });
function softFocus(amount) {
  if (amount <= 0.001) return;
  let src = cv;
  for (const L of LAD) { L.x.drawImage(src, 0, 0, L.w, L.h); src = L.c; }                 // down
  for (let i = LAD.length - 2; i >= 0; i--) { LAD[i].x.drawImage(LAD[i + 1].c, 0, 0, LAD[i].w, LAD[i].h); }   // up
  g.save(); g.globalAlpha = Math.min(1, amount); g.drawImage(LAD[0].c, 0, 0, W, H); g.restore();
}

async function drawFootage(t) {
  const f = Math.round(t * FPS), seg = segAt(f);
  const img = await F.frame(seg.id, f);
  const { z, sx, sy } = framing(seg.id, t);
  g.drawImage(img, sx, sy, W / z, H / z, 0, 0, W, H);
  // HOOK: grey, dark, out of focus; the first dose (1.8 s) brings focus, light and colour back
  const on = tw(t, EV.dose1 - 0.06, 0.5, E.inOutSine);
  softFocus(1 - tw(t, EV.dose1 - 0.04, 0.34, E.outCubic));
  const flash = t > EV.dose1 ? 0.16 * Math.exp(-(t - EV.dose1) * 7) : 0;
  grade(g, { match: MATCH[seg.clip], exp: lerp(0.4, 1, on) * (1 + flash), satMul: lerp(0.1, 1, on) });
  return { seg, f };
}

// ---------------------------------------------------------------- the end card: dose's mark from the wall
const SIGN = await (await fetch(new URL('./assets/sign.json', import.meta.url))).json();
/** the mark's screen affine [a b c; d e f] (logo.png px → screen px) while the d5b shot runs (fractional source frame) */
export function signAffine(t) {
  const segE = SEG.E, f = Math.min(Math.round(t * FPS), Math.round(segE.t1 * FPS) - 1);
  const p = F.srcPos('E', f), k0 = Math.floor(p), k1 = Math.min(120, k0 + 1), w = p - k0;
  const A = SIGN.frames[k0].logo_affine, B = (SIGN.frames[k1] || SIGN.frames[k0]).logo_affine;
  const M = A.map((v, i) => v + (B[i] - v) * w);
  const { z, sx, sy } = framing('E', f / FPS);
  return [M[0] * z, M[1] * z, (M[2] - sx) * z, M[3] * z, M[4] * z, (M[5] - sy) * z];
}
function paper() {
  g.fillStyle = '#F6F0E8'; g.fillRect(0, 0, W, H);
  const rg = g.createRadialGradient(W / 2, H * 0.46, 200, W / 2, H * 0.46, 1250);
  rg.addColorStop(0, 'rgba(255,252,247,0.55)'); rg.addColorStop(1, 'rgba(214,200,184,0.32)');
  g.fillStyle = rg; g.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- the frame
const stage = document.getElementById('stage');
let overlay = { render() {} };
if (!CLEAN) { const m = await import('./overlay.js'); overlay = await m.makeOverlay(stage, { W, H, LY, poster: POSTER, signAffine }); }
const hud = INFO ? Object.assign(document.createElement('div'), { style: 'position:absolute;left:8px;top:8px;font:600 22px "JetBrains Mono";color:#fff;background:#000a;padding:4px 8px;z-index:9' }) : null;
if (hud) stage.appendChild(hud);

const { POSTER_T = 0 } = POSTER ? await import('./poster.js') : {};
const DISS = 0.32;                                     // footage → plaster dissolve at the match
async function seek(t) {
  const tt = POSTER ? POSTER_T : t;
  let info = null;
  if (tt >= EV.sting) { g.fillStyle = '#0B0B0B'; g.fillRect(0, 0, W, H); }
  else if (tt >= EV.match + DISS) paper();
  else {
    info = await drawFootage(tt);
    if (tt >= EV.match) {                              // the wall dissolves to white plaster; the mark stays (overlay)
      const k = tw(tt, EV.match, DISS, E.inOutSine);
      g.save(); g.globalAlpha = k; paper(); g.restore();
    }
  }
  grain(grainCv, Math.round(tt * FPS), { amount: 24, scale: 2 });
  overlay.render(tt);
  if (hud) hud.textContent = `t ${tt.toFixed(3)}  f ${Math.round(tt * FPS)}` + (info ? `  ${info.seg.id} ${info.seg.clip}  src f ${F.srcPos(info.seg.id, info.f).toFixed(2)}` : '');
}
let queue = Promise.resolve();
const seekQ = t => (queue = queue.then(() => seek(t)));
boot({ width: W, height: H, fps: FPS, duration: C.duration, seek: seekQ });
