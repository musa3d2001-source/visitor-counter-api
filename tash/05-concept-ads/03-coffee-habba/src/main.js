// HABBA — concept ad #3 (specialty coffee), PHOTOREAL cut. The page is a pure function of time.
// Picture: the CD-approved AI clips (../footage/ai/), conformed to the edit as 30 fps JPEG sequences (src/footage/,
// tools/extract.sh) and drawn by frame index; one shared grade (grade.js); the blinds open and close as a light-bar
// mask at the footage's own sun angle. Type, end card, slate and TASH tail: overlay.js (DOM, real fonts).
// URL: ?clean=1 (pure footage, same timeline) · ?poster=1 (designed cover) · ?t=… / ?play (preview) · ?info=1 (review HUD)
import { boot, grain, clamp, lerp, tw, E } from '/_system/motion/kit.js';
import { C } from './cues.js';
import * as F from './footage.js';
import { makeMatch, gradeCanvas, pool } from './grade.js';

const q = new URLSearchParams(location.search);
const CLEAN = q.has('clean');
const POSTER = q.has('poster');
const INFO = q.has('info');
const W = 1080, H = 1920, FPS = 30;
const EV = C.ev;
const SEGS = C.footage.segs;

const cv = document.getElementById('pic'); cv.width = W; cv.height = H;
const g = cv.getContext('2d', { alpha: false, willReadFrequently: true });   // CPU canvas: drawImage + per-pixel grade
g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
const grainCv = document.getElementById('grain');

// ---------------------------------------------------------------- per-clip match (→ one morning) and framing
// black: input black point per channel; stops: exposure; wb: white balance; sat: saturation (applied in linear light)
const MATCH = {
  k1_blinds: makeMatch({ black: [9, 4, 0], stops: 0.35, wb: [1.0, 1.0, 1.04], sat: 0.88 }),
  k2_steam: makeMatch({ black: [15, 9, 4], stops: 0.15, wb: [1.0, 1.0, 1.03], sat: 0.88 }),
  k3_pour: makeMatch({ black: [24, 11, 4], stops: -0.2, wb: [0.98, 1.0, 1.04], sat: 0.9 }),
  k4_beans: makeMatch({ black: [13, 3, 0], stops: -0.35, wb: [1.02, 1.0, 0.97], sat: 0.92 }),
  k5_hero: makeMatch({ black: [28, 13, 4], stops: -0.12, wb: [0.99, 1.0, 1.03], sat: 0.92 }),
};
// framing: base scale ≥1.03 (crops AI edge noise), slow push where the camera is locked; focus point (fx, fy) in frame px
const SEG_BY_ID = Object.fromEntries(SEGS.map(s => [s.id, s]));
function framing(id, t) {
  const s = SEG_BY_ID[id], u = (t - s.t0) / (s.t1 - s.t0);
  switch (id) {
    case 'S1': return { z: 1.03, fx: 540, fy: 1040 };                                   // the clip pushes in by itself
    case 'S2': return { z: lerp(1.03, 1.055, u), fx: 540, fy: 1500 };                    // gentle push toward the rim
    case 'S3': return { z: 1.03, fx: 540, fy: 660 };
    case 'S4a': return { z: lerp(1.03, 1.05, u), fx: 600, fy: 1150 };                    // locked-off clip: slow push
    case 'S4b': return { z: lerp(1.30, 1.33, E.outQuad(u)), fx: 560, fy: H };            // scale cut in on bean 2 (bottom-anchored: bean 2 enters where bean B left)
    default: return { z: lerp(1.03, 1.05, u), fx: 560, fy: 1500 };                       // S5: the clip arcs; tiny creep
  }
}
const segAt = f => { for (let i = SEGS.length - 1; i >= 0; i--) if (f >= Math.round(SEGS[i].t0 * FPS)) return SEGS[i]; return SEGS[0]; };

// ---------------------------------------------------------------- the light
const BAR = { angle: 25, period: 168 };
function lightAt(seg, t) {
  // S1: the blinds open — the room starts 1.5 stops under with slits of sun; the bars widen to full light (0.28 → 1.53)
  if (seg.id === 'S1') {
    const o = tw(t, EV.blindsOpen, EV.blindsOpenDur, E.inOutSine);
    if (o >= 1) return {};
    return { bars: { ...BAR, open: lerp(0.16, 1.25, o), dim: lerp(Math.pow(2, -1.5), 1, o * o), drift: 0.18 * o, feather: lerp(0.05, 0.12, o) } };
  }
  // S6 (not in clean): the blinds close — the bars narrow to slits and the room goes dark under the TASH tail
  if (seg.id === 'S5' && !CLEAN && t >= EV.blindsClose) {
    const c = tw(t, EV.blindsClose, EV.blindsCloseDur, E.inOutSine);
    return { bars: { ...BAR, open: lerp(1.25, 0.0, c), dim: lerp(1, Math.pow(2, -4), c), drift: 0.18 + 0.12 * c, feather: lerp(0.12, 0.05, c) } };
  }
  return {};
}
// S3: a graduated falloff on the table under «على مهلك.» (the light pool sits on the cup; the type sits in its shade)
const shadeFor = id => (id === 'S3' ? { y0: 1120, y1: 1460, k: 0.42 } : null);
// S4 / S5: the sun pool on the limewash wall behind the client's roasted type (static per shot, same in ?clean=1):
// lifts the darker bars behind «حبّة… حبّة.» and the end-card lockup to ≥3:1 against roasted #4A2F23
const liftFor = id => (id === 'S4a' || id === 'S4b' ? pool('S4', { cx: 540, cy: 440, rx: 660, ry: 320, stops: 0.5 })
  : id === 'S5' ? pool('S5', { cx: 540, cy: 560, rx: 620, ry: 420, stops: 0.55 }) : null);

// ---------------------------------------------------------------- depth matte (S4a)
// Bean B falls through the wall exactly where «حبّة…» sits (x 500–750, y 0–650, 7.73–8.13), and bean D enters the
// scale cut there (8.13–8.25). Instead of letting type sit on top of a falling bean, the bean passes IN FRONT of the
// word: its pixels are lifted onto #fg (above the type) with an alpha from the difference to a clean plate of the same
// locked-off wall.
const fgCv = document.getElementById('fg'), fgx = fgCv.getContext('2d', { willReadFrequently: true });
const plCv = document.createElement('canvas'); plCv.width = W; plCv.height = H;
const plx = plCv.getContext('2d', { alpha: false, willReadFrequently: true }); plx.imageSmoothingQuality = 'high';
const MB = { y0: 200, y1: 720 };
let fgDirty = false;
// plate per segment: S4a's first frame (before bean A enters) · S4b's last frame (bean D has landed, the wall is clear)
const PLATE = { S4a: s => Math.round(s.t0 * FPS), S4b: s => Math.round(s.t1 * FPS) - 1 };
const needMatte = (seg, t) => !CLEAN && !POSTER && PLATE[seg.id] && t >= EV.bean1 - 0.1;

async function drawFootage(t) {
  const f = Math.round(t * FPS);
  const seg = segAt(f);
  const img = await F.frame(seg.id, f);
  const { z, fx, fy } = POSTER ? POSTER_FRAME : framing(seg.id, t);
  // scale about the focus point, clamped so the frame is always covered
  const sw = W / z, sh = H / z;
  const sx = clamp(fx - sw * (fx / W), 0, img.naturalWidth - sw), sy = clamp(fy - sh * (fy / H), 0, img.naturalHeight - sh);
  const dy = POSTER ? POSTER_FRAME.dy || 0 : 0;
  g.drawImage(img, sx, sy, sw, sh, 0, dy, W, H);
  if (dy < 0) {   // poster only: continue the table under the lifted picture with its own mirror image (outside the 3:4 crop)
    const bh = -dy / z;
    g.save(); g.translate(0, 2 * (H + dy)); g.scale(1, -1);
    g.drawImage(img, sx, img.naturalHeight - bh, sw, bh, 0, H + dy + dy, W, -dy); g.restore();
  }
  const matte = needMatte(seg, t);
  let raw = null, pl = null;
  if (matte) {
    const plate = await F.frame(seg.id, PLATE[seg.id](seg));
    plx.drawImage(plate, sx, sy, sw, sh, 0, 0, W, H);
    raw = g.getImageData(0, MB.y0, W, MB.y1 - MB.y0); pl = plx.getImageData(0, MB.y0, W, MB.y1 - MB.y0);
  }
  gradeCanvas(g, { match: MATCH[seg.clip], shade: shadeFor(seg.id), lift: liftFor(seg.id), ...lightAt(seg, t) });
  if (matte) {
    const gr = g.getImageData(0, MB.y0, W, MB.y1 - MB.y0), a = raw.data, b = pl.data, o = gr.data;
    for (let i = 0; i < o.length; i += 4) {
      const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      let k = (d - 42) / 70; k = k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k);
      o[i + 3] = Math.round(k * 255);
    }
    fgx.clearRect(0, 0, W, H); fgx.putImageData(gr, 0, MB.y0); fgDirty = true;
  } else if (fgDirty) { fgx.clearRect(0, 0, W, H); fgDirty = false; }
  return { seg, f };
}

// ---------------------------------------------------------------- overlay (type, end card, TASH tail)
let overlay = { render() {} };
if (!CLEAN) { const m = await import('./overlay.js'); overlay = await m.makeOverlay(document.getElementById('stage'), { W, H, poster: POSTER }); }
const hud = INFO ? Object.assign(document.createElement('div'), { style: 'position:absolute;left:8px;top:8px;font:600 22px "JetBrains Mono";color:#fff;background:#000a;padding:4px 8px;z-index:9' }) : null;
if (hud) document.getElementById('stage').appendChild(hud);

// the cover lives in the end-card world (poster.js: frame + layout inside the 3:4 profile-grid crop)
const POSTER_FRAME = POSTER ? { ...(await import('./poster.js')).POSTER_FRAME } : null;
if (POSTER && q.has('pt')) Object.assign(POSTER_FRAME, { t: +q.get('pt'), z: +(q.get('pz') || POSTER_FRAME.z) });   // review only
async function seek(t) {
  if (POSTER) t = POSTER_FRAME.t;
  const stingCover = !CLEAN && !POSTER && t >= EV.sting + 0.1;     // the ink tail covers the frame fully from here
  let info = null;
  if (stingCover) { g.fillStyle = '#0B0B0B'; g.fillRect(0, 0, W, H); }
  else info = await drawFootage(t);
  grain(grainCv, Math.round(t * FPS), { amount: 26, scale: 2 });
  overlay.render(t);
  if (hud && info) hud.textContent = `t ${t.toFixed(3)}  f ${info.f}  ${info.seg.id} ${info.seg.clip}  src f ${F.srcPos(info.seg.id, info.f).toFixed(2)}`;
}

// seeks are serialised: boot() fires its own seek(0) on ready, and a seek awaits image decodes
let queue = Promise.resolve();
const seekQ = t => (queue = queue.then(() => seek(t)));
boot({ width: W, height: H, fps: FPS, duration: C.duration, seek: seekQ });
