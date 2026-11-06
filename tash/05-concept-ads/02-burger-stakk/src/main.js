// STAKK photoreal: the edit as a pure function of t.
// Picture = graded, retimed JPEG sequences (src/footage, baked by tools/conform.py from the approved Higgsfield clips),
// drawn by frame index on #pic with one camera per shot (push, impact punch/shake, the S02→S03 whip strip).
// Type, end card, slates and the TASH signature are DOM (overlay.js). Timing: cues.json (shared with audio.py).
// URL: ?clean=1 (picture only, same timeline, hero keeps rolling to 13.8) · ?poster (reel cover) · ?t= / ?play
import { boot, E, clamp, lerp, grain } from '/_system/motion/kit.js';
import * as F from './footage.js';
import { createOverlay, createPoster } from './overlay.js';

const C = await (await fetch(new URL('./cues.json', import.meta.url))).json();
const q = new URLSearchParams(location.search);
const CLEAN = q.get('clean') === '1', POSTER = q.has('poster');
const W = 1080, H = 1920, D = C.drops;
const cv = document.getElementById('pic'); cv.width = W; cv.height = H;
const g = cv.getContext('2d', { alpha: false }); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
const tg = tmp.getContext('2d', { alpha: POSTER });   // the poster composites a feathered plate; the film never needs alpha
tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
const S = Object.fromEntries(C.shots.map(s => [s.id, s]));
const shotAt = t => { let s = C.shots[0]; for (const x of C.shots) if (t >= x.at - 1e-6) s = x; return s; };

// ------------------------------------------------------------------------------------------- camera
const BASE = 1.03;                       // constant overscan: hides AI edge artefacts, leaves room for shake
// whole-frame impacts (≤3 per piece, ≥16 beats apart): the smash and the crown only
const IMPACTS = [C.smash, D.crown];
function shake(t) {
  let x = 0, y = 0;
  for (const ti of IMPACTS) { const a = t - ti; if (a >= 0 && a < 0.35) { const k = 11 * Math.exp(-a / 0.055); x += Math.sin(a * 83 + 1) * k; y += Math.cos(a * 71) * k; } }
  return [x, y];
}
function punch(t, at, amt, rate = 9) { const a = t - at; return a >= 0 && a < 0.9 ? amt * Math.exp(-a * rate) * Math.sin(Math.min(a * 16, Math.PI / 2)) : 0; }
function bump(t, at, amt = 0.006) { const a = t - at; return a >= 0 && a < 0.6 ? amt * Math.exp(-a * 9) * Math.sin(a * 26) : 0; }

/** camera for a sequence at time t: scale s about focal point (fx, fy) + offset (x, y) in px */
export function camera(id, t) {
  const sh = { S07a: 'S07', S07b: 'S07' }[id] ?? id;
  const k = (a, b) => clamp((t - a) / (b - a));
  let s = BASE, fx = 540, fy = 960, x = 0, y = 0;
  switch (id) {
    case 'S01': s += 0.03 * E.outCubic(k(0, 0.9)) + punch(t, C.smash, 0.035); fy = 1150; break;
    case 'S02': s += 0.02 * E.inOutCubic(k(0.9, 1.95)); fy = 1300; break;
    case 'S03': s += 0.022 * E.inOutCubic(k(2.4, 3.9)) + bump(t, D.patty); fy = 1420; break;
    case 'S04': x = lerp(18, -18, E.inOutCubic(k(3.9, 4.25))); fy = 600; break;
    case 'S05': s += 0.016 * k(4.25, 4.9) + bump(t, D.cheese, 0.004); fy = 1400; break;
    case 'S06': s += 0.04 * E.inOutCubic(k(4.9, 5.75)); fx = 300; fy = 1250; break;
    case 'S07a': { // two punch-ins on the beat: «دبل!» (patty2) and the second cheese
      const st = (at, amt) => (t >= at ? amt * (1 - Math.exp(-(t - at) * 22) * Math.cos((t - at) * 18)) : 0);
      s += st(D.patty2, 0.05) + st(D.cheese2, 0.035); fx = 520; fy = 1300; break; }
    case 'S07b': s += 0.01 * k(D.pickles, S.S08.at) + bump(t, D.onions, 0.004); fy = 900; break;
    case 'S08': s += 0.045 * E.inOutCubic(k(S.S08.at, 7.9)); fx = 600; fy = 300; break;   // one top-down take: flat pickles + onion, then the pour;
                                                     // the push grows from the top so the bun's rim moves down, away from the labels
    case 'S09': s += -0.01 * k(7.9, D.crown) + punch(t, D.crown, 0.04) + 0.015 * E.inOutSine(k(D.crown, C.endcard)) + 0.02 * E.inOutSine(k(C.endcard, C.duration)); fy = 1100; break;
  }
  if (sh === 'S01' || sh === 'S09') { const [a, b] = shake(t); x += a; y += b; }
  return { s, fx, fy, x, y };
}
/** frame-space point → screen (same transform the picture gets) */
export function toScreen(id, t, px, py) {
  const c = camera(id, t); const [x0, y0] = origin(c);
  return [x0 + px * c.s, y0 + py * c.s];
}
function origin(c) {
  let x0 = c.fx * (1 - c.s) + c.x, y0 = c.fy * (1 - c.s) + c.y;
  x0 = Math.min(0, Math.max(W - W * c.s, x0)); y0 = Math.min(0, Math.max(H - H * c.s, y0)); // never show an edge
  return [x0, y0];
}
function drawCam(ctx, img, c, dy = 0) { const [x0, y0] = origin(c); ctx.drawImage(img, x0, y0 + dy, W * c.s, H * c.s); }

// ------------------------------------------------------------------------------------------- the whip (S02 → S03)
// One continuous vertical camera move: S03's plate rides in above S02's (the camera tilts up off the griddle onto the
// red stage). Accelerates into the cut (2.15, seam at mid-frame, peak speed), decelerates and lands on the heel at
// 2.40 with a short bounce: the heel "drops" into place on its beat. Blur = per-frame displacement (smear grammar).
const WH = { a: C.whip[0], cut: S.S03.at, land: D.heel };
function whipU(t) {
  if (t < WH.a) return 0;
  if (t < WH.cut) { const p = (t - WH.a) / (WH.cut - WH.a); return 0.5 * Math.pow(p, 2.08); }
  if (t < WH.land) { // Hermite 0.5 → 1, speed 5.2 → 2.0 (units of plate height per second)
    const h = WH.land - WH.cut, p = (t - WH.cut) / h, m0 = 5.2 * h, m1 = 2.0 * h;
    return (2 * p ** 3 - 3 * p ** 2 + 1) * 0.5 + (p ** 3 - 2 * p ** 2 + p) * m0 + (-2 * p ** 3 + 3 * p ** 2) * 1 + (p ** 3 - p ** 2) * m1;
  }
  const a = t - WH.land; return a < 0.5 ? 1 + (2.0 / 40) * Math.exp(-a * 18) * Math.sin(a * 40) : 1;
}
const CB = { s: BASE, fx: 540, fy: 960, x: 0, y: 0 };      // S03's plate at home
const CA = () => camera('S02', WH.a);                       // S02's plate as the whip starts
// plate pitch: S03's plate sits directly above S02's (its bottom edge on S02's top edge) and is home when u = 1
function pitch() { const [, yA0] = origin(CA()); const [, yB0] = origin(CB); return yB0 + H * BASE - yA0; }
/** vertical travel of the S02 plate at t (the title rides it) */
export function whipShift(t) { return t < WH.a ? 0 : whipU(t) * pitch(); }
async function drawWhip(t) {
  const u = whipU(t), L = pitch(), cA = CA();
  const before = t < WH.cut - 1e-6;
  // before the cut: S02's plate slides down and S03's red stage enters above it (the camera tilts up);
  // from the cut on: only S03's plate, still travelling; the floor it reveals below is its own red floor, stretched
  const [A, B] = await Promise.all([before ? F.frame('S02', t) : null, F.frame('S03', t)]);
  const yA = u * L, yB = yA - L;
  const v = Math.abs(whipU(t + 1 / 60) - whipU(t - 1 / 60)) * L;   // px travelled in one frame
  const len = Math.min(300, 0.85 * v), n = len < 3 ? 1 : Math.min(56, Math.ceil(len / 5));
  for (let i = 0; i < n; i++) {
    const o = n === 1 ? 0 : (i / (n - 1) - 0.5) * len;
    if (before) { drawCam(tg, A, cA, yA + o); drawCam(tg, B, CB, yB + o); }
    else {
      drawCam(tg, B, CB, yB + o);
      const [x0, y0] = origin(CB), bottom = y0 + H * CB.s + yB + o;
      if (bottom < H) tg.drawImage(B, 0, H - 3, W, 3, x0, bottom - 1, W * CB.s, H - bottom + 2);
    }
    g.globalAlpha = 1 / (i + 1); g.drawImage(tmp, 0, 0);   // running average = box blur along the travel axis
  }
  g.globalAlpha = 1;
}

// ------------------------------------------------------------------------------------------- per-shot picture
function seqFor(t) {
  const id = shotAt(t).id;
  if (id === 'S07') return t < D.pickles - 1e-6 ? 'S07a' : 'S07b';   // cut on the pickle's contact frame; S07b ends on the onion ring's contact frame (S08 at 6.55)
  if (id === 'S09' || id === 'S10' || id === 'S11' || id === 'S12') return 'S09';
  return id;
}
async function drawPicture(t) {
  if (t >= WH.a && t < WH.land) return drawWhip(t);
  const id = seqFor(t);
  const img = await F.frame(id, t);
  const c = camera(id, t);
  if (id === 'S03' && t >= WH.land && t < WH.land + 0.5) c.y += (whipU(t) - 1) * pitch(); // landing bounce
  drawCam(g, img, c);
}

// ------------------------------------------------------------------------------------------- poster
// A still: the hero frame scaled into its own seamless. The stage is graded to the client red, so the backdrop is
// continued with the frame's own edge colour and a wide feather (no visible seam under grain + vignette).
async function drawPoster() {
  const PT = parseFloat(q.get('poster')) || 10.3667, img = await F.frame('S09', PT);
  const k = 0.62, cx = 540, cy = 1036, sx = 556, sy = 1102;          // burger centre in the frame → poster centre
  const ec = document.createElement('canvas'); ec.width = 8; ec.height = 8; const eg = ec.getContext('2d');
  eg.drawImage(img, 0, 40, W, 200, 0, 0, 8, 8); const d = eg.getImageData(0, 0, 8, 8).data;
  let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4; g.fillStyle = `rgb(${Math.round(r / n)},${Math.round(gg / n)},${Math.round(b / n)})`; g.fillRect(0, 0, W, H);
  const x0 = cx - sx * k, y0 = cy - sy * k, w = W * k, h = H * k;
  tg.clearRect(0, 0, W, H); tg.drawImage(img, x0, y0, w, h);
  tg.globalCompositeOperation = 'destination-in';                       // feather the plate's edges into the backdrop
  const f = 110, mk = document.createElement('canvas'); mk.width = W; mk.height = H; const m = mk.getContext('2d');
  const gx = m.createLinearGradient(x0, 0, x0 + w, 0); gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(f / w, 'rgba(0,0,0,1)'); gx.addColorStop(1 - f / w, 'rgba(0,0,0,1)'); gx.addColorStop(1, 'rgba(0,0,0,0)');
  m.fillStyle = gx; m.fillRect(0, 0, W, H); m.globalCompositeOperation = 'destination-in';
  const gy = m.createLinearGradient(0, y0, 0, y0 + h); gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(f / h, 'rgba(0,0,0,1)'); gy.addColorStop(1 - 1.6 * f / h, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
  m.fillStyle = gy; m.fillRect(0, 0, W, H);
  tg.drawImage(mk, 0, 0); tg.globalCompositeOperation = 'source-over';
  g.drawImage(tmp, 0, 0);
}

// ------------------------------------------------------------------------------------------- finish + boot
const gc = document.getElementById('grain'); gc.width = W; gc.height = H;
let overlay = null;
const ready = (async () => {
  await Promise.all([
    document.fonts.load('900 160px Alexandria', 'ستاك'), document.fonts.load('700 50px Alexandria', 'ستاك'),
    document.fonts.load('500 32px "IBM Plex Sans Arabic"', 'إعلان'), document.fonts.load('600 22px "JetBrains Mono"', 'A'),
    document.fonts.load('900 66px Archivo', 'S'),
  ]);
  if (POSTER) { await drawPoster(); await createPoster(document.getElementById('ui')); }
  else overlay = createOverlay(document.getElementById('ui'), C, { W, H, toScreen, whipShift, seqFor, clean: CLEAN, layers: { ec: document.getElementById('ec'), sig: document.getElementById('sig') } });
})();

async function seek(t) {
  if (POSTER) { grain(gc, 7, { amount: 26, scale: 2 }); return; }
  const tail = !CLEAN && t >= C.endcard;           // the client card + signature are opaque: no picture under them
  if (!tail) await drawPicture(t);
  overlay.render(t);
  grain(gc, Math.round(t * C.fps), { amount: 26, scale: 2 });
}
let queue = Promise.resolve();
const seekQ = t => (queue = queue.then(() => seek(t)));
boot({ width: W, height: H, fps: C.fps, duration: C.duration, ready, seek: seekQ });
