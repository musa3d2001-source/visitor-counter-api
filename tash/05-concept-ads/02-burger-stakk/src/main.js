// STAKK photoreal: the edit as a pure function of t.
// Picture = graded, retimed JPEG sequences (src/footage, baked by tools/conform.py from the approved Higgsfield clips),
// drawn by frame index on #pic with one camera per shot (push, impact punch/shake; the red stage shares one camera).
// Type, end card, slates and the TASH signature are DOM (overlay.js). Timing: cues.json (shared with audio.py).
// URL: ?clean=1 (picture only, same timeline, hero keeps rolling to 13.8) · ?poster (reel cover) · ?t= / ?play
import { boot, E, clamp, grain } from '/_system/motion/kit.js';
import * as F from './footage.js';
import { createOverlay, createPoster } from './overlay.js';

const C = await (await fetch(new URL('./cues.json', import.meta.url))).json();
const q = new URLSearchParams(location.search);
const CLEAN = q.get('clean') === '1', POSTER = q.has('poster');
const W = 1080, H = 1920, D = C.drops;
const cv = document.getElementById('pic'); cv.width = W; cv.height = H;
const g = cv.getContext('2d', { alpha: false }); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
const tg = tmp.getContext('2d', { alpha: POSTER });   // the poster composites a feathered plate
tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
const S = Object.fromEntries(C.shots.map(s => [s.id, s]));

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

// The red stage (2.40 → 7.90) is ONE locked-off shot of one burger, cut from four chained clips: every wide sequence
// shares one camera, so the jump cuts on the grid read as the stack growing, not as new shots. It lands on the heel
// (2.40: a 4.5 % scale settle in ~0.1 s, the heel is "set down" on its beat), pushes in slowly while the burger builds,
// and eases back out during the pour so it meets S09's framing (s = BASE, focus 540/1100) on the 7.90 join.
// The two punch-ins (S04 lace, S06 melt) are baked 1.31x crops of the same take with their own slow creep.
const WIDE = new Set(['S03a', 'S03b', 'S05', 'S07a', 'S07b', 'S08a', 'S08b', 'S08c']);
const STAGE = { from: S.S03.at, peak: 6.9, to: S.S09.at };
/** camera for a sequence at time t: scale s about focal point (fx, fy) + offset (x, y) in px */
export function camera(id, t) {
  const k = (a, b) => clamp((t - a) / (b - a));
  let s = BASE, fx = 540, fy = 960, x = 0, y = 0;
  if (WIDE.has(id)) {
    s += 0.024 * E.outQuad(k(STAGE.from, STAGE.peak)) - 0.024 * E.inOutSine(k(STAGE.peak, STAGE.to))
      + 0.045 * (1 - E.outExpo(k(D.heel, D.heel + 0.35)))          // lands on the heel
      + bump(t, D.patty, 0.005) + bump(t, D.patty2, 0.005);         // the two heavy drops
    fy = 1100;
  } else switch (id) {
    case 'S01': s += 0.03 * E.outCubic(k(0, 0.9)) + punch(t, C.smash, 0.035); fy = 1150; break;
    case 'S02': s += 0.02 * E.inOutCubic(k(0.9, 2.15)) + 0.014 * E.inQuad(k(2.15, S.S03.at)); fy = 1300; break;   // pulls into the 2.40 cut
    case 'S04': s += 0.012 * E.inOutSine(k(S.S04.at, S.S05.at)); fx = 130; fy = 1262; break;                        // creeps in on the lace
    case 'S06': s += 0.04 * E.inOutCubic(k(S.S06.at, S.S07.at)); fx = 602; fy = 1270; break;                         // half-time push on the drip
    case 'S09': s += -0.01 * k(7.9, D.crown) + punch(t, D.crown, 0.04) + 0.015 * E.inOutSine(k(D.crown, C.endcard)) + 0.02 * E.inOutSine(k(C.endcard, C.duration)); fy = 1100; break;
  }
  if (id === 'S01' || id === 'S09') { const [a, b] = shake(t); x += a; y += b; }
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
function drawCam(ctx, img, c) { const [x0, y0] = origin(c); ctx.drawImage(img, x0, y0, W * c.s, H * c.s); }

// ------------------------------------------------------------------------------------------- per-shot picture
// the baked sequence on screen at t (src/footage/manifest.json: each sequence owns frames n0 … n0 + frames − 1)
const SEQS = Object.entries(F.MANIFEST).map(([id, m]) => ({ id, n0: m.n0, n1: m.n0 + m.frames })).sort((a, b) => a.n0 - b.n0);
function seqFor(t) {
  const N = Math.round(t * C.fps + 1e-6);
  let id = SEQS[0].id;
  for (const q of SEQS) if (N >= q.n0) id = q.id;
  return id;
}
async function drawPicture(t) {
  const id = seqFor(t);
  drawCam(g, await F.frame(id, t), camera(id, t));
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
  else overlay = createOverlay(document.getElementById('ui'), C, { W, H, toScreen, seqFor, seqFrom: id => F.MANIFEST[id].from, clean: CLEAN, layers: { ec: document.getElementById('ec'), sig: document.getElementById('sig') } });
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
