// s4_parade — scene builder C. «the proof»: the sample works as physical cards on a dark studio stage.
// One continuous camera (a real 3D camera: my own view matrix, so 2D overlays can be pinned to projected card points)
// watches a single lit spot on a glossy floor. Every card is DEALT onto that spot exactly on its cue frame (a drop or a
// throw, a lime «طشّ» ripple on the floor, a glint), and when the next one lands it is FILED into a fan that grows behind
// the spot; the scene ends on the full fan behind the Excel dashboard, the file chips popping on the beat.
//   card 1 deck: from the splash hand-off rect, its slides fan out behind it; the school deck fans in on «أول» (range)
//   card 2 report: drops; the cover and the contents page turn (RTL: hinge on the right) as «نرتّبه.» lands
//   card 3 research: the open spread is thrown in; lime highlights + tags «عناوين» «ترقيم» «مراجع» on what was formatted
//   cards 4-6 poster / video (playhead runs) / CV: three fast hits, alternate sides
//   card 7 dashboard: drops, its bar chart and donut draw; «وأي ملف أوفيس.» + .pptx .docx .xlsx .pdf .mp4; fan opens f503
// Every frame is a pure function of the film frame (nothing is integrated); all cue frames come from cues.json.
import * as K from '../kit.js';

const ASSET = new URL('../assets/s4_parade/', import.meta.url).href;
const P = 1300, CX = 540, CY = 960, DEG = Math.PI / 180;
const { clamp, lerp, E } = K;

// ------------------------------------------------------------------ 4x4 matrices (row-major), CSS conventions (y down)
const I4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function mul(...ms) {
  return ms.reduce((a, b) => {
    const o = new Array(16);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + a[r * 4 + 3] * b[12 + c];
    }
    return o;
  });
}
export const T = (x = 0, y = 0, z = 0) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
export const S = (s, sy = s) => [s, 0, 0, 0, 0, sy, 0, 0, 0, 0, s, 0, 0, 0, 0, 1];
export const RX = d => { const c = Math.cos(d * DEG), s = Math.sin(d * DEG); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]; };
export const RY = d => { const c = Math.cos(d * DEG), s = Math.sin(d * DEG); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]; };
export const RZ = d => { const c = Math.cos(d * DEG), s = Math.sin(d * DEG); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; };
const MIRROR = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];          // the floor is the plane y = 0
export const css3 = m => `matrix3d(${[0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15].map(i => +m[i].toFixed(6)).join(',')})`;
/** a local point through a full (view · model) matrix → screen px */
export function proj(m, x, y, z = 0) {
  const X = m[0] * x + m[1] * y + m[2] * z + m[3], Y = m[4] * x + m[5] * y + m[6] * z + m[7], Z = m[8] * x + m[9] * y + m[10] * z + m[11];
  const k = P / Math.max(1, P - Z);
  return [CX + (X - CX) * k, CY + (Y - CY) * k];
}

// ------------------------------------------------------------------ smooth keyframes (Hermite, Catmull-Rom tangents)
function spline(keys, f, ch, { startBoost = 1 } = {}) {
  const n = keys.length;
  if (f <= keys[0].f) return keys[0][ch];
  if (f >= keys[n - 1].f) return keys[n - 1][ch];
  let i = 0; while (keys[i + 1].f < f) i++;
  const tan = j => {
    if (j === 0) return startBoost * (keys[1][ch] - keys[0][ch]) / (keys[1].f - keys[0].f);
    if (j === n - 1) return 0;
    return (keys[j + 1][ch] - keys[j - 1][ch]) / (keys[j + 1].f - keys[j - 1].f);
  };
  const a = keys[i], b = keys[i + 1], h = b.f - a.f, u = (f - a.f) / h;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * a[ch] + (u3 - 2 * u2 + u) * h * tan(i) + (-2 * u3 + 3 * u2) * b[ch] + (u3 - u2) * h * tan(i + 1);
}
const kick = (f, at, w = 2.2) => { const x = (f - at + 1) / w; return x <= 0 ? 0 : x * Math.exp(1 - x); };   // 0 → 1 (at+w-1) → 0
const damp = (f, at, per = 6, tau = 4) => (f < at ? 0 : Math.sin(Math.PI * (f - at) / per) * Math.exp(-(f - at) / tau));

// ------------------------------------------------------------------ the camera: target, distance, yaw, pitch, roll
export function camera(f, C) {
  const ch = c => spline(C.keys, f, c, { startBoost: 1.9 });
  let D = ch('d') * P;
  const tx = ch('x'), ty = ch('y'), tz = 0, yaw = ch('yaw'), pitch = ch('pitch');
  let roll = ch('roll');
  C.hits.forEach((h, i) => { const g = kick(f, h, 2.4); D *= 1 - 0.032 * g; roll += (i % 2 ? 0.7 : -0.7) * g; });
  const ps = Math.sin(pitch * DEG), pc = Math.cos(pitch * DEG), ys = Math.sin(yaw * DEG), yc = Math.cos(yaw * DEG);
  const fw = [ys * pc, ps, -yc * pc];                       // forward (y down: +y looks down)
  const r0 = [yc, 0, ys];
  const d0 = [-ys * ps, pc, yc * ps];                       // r0 × fw
  const rc = Math.cos(roll * DEG), rs = Math.sin(roll * DEG);
  const r = r0.map((v, i) => v * rc + d0[i] * rs), d = d0.map((v, i) => v * rc - r0[i] * rs);
  const eye = [tx - D * fw[0], ty - D * fw[1], tz - D * fw[2]];
  const R = [r[0], r[1], r[2], 0, d[0], d[1], d[2], 0, -fw[0], -fw[1], -fw[2], 0, 0, 0, 0, 1];
  return { V: mul(T(CX, CY, P), R, T(-eye[0], -eye[1], -eye[2])), pitch, roll, yaw, D };
}

// ------------------------------------------------------------------ DOM helpers
function face(parent, src, w, h, radius, { x = 0, y = 0, bg = '#fff' } = {}) {
  const f = K.el(parent, 'div', 's4-face', { width: w + 'px', height: h + 'px', left: x + 'px', top: y + 'px', borderRadius: radius + 'px', background: bg });
  const im = K.el(f, 'img'); im.src = src; im.decoding = 'sync';
  K.el(f, 'div', 'lt');
  const dim = K.el(f, 'div', 'dim'), gl = K.el(f, 'div', 'gl');
  return { el: f, img: im, dim, gl, w, h };
}
function backFace(parent, w, h, radius) {
  const b = K.el(parent, 'div', 's4-back', { width: w + 'px', height: h + 'px', borderRadius: radius + 'px' });
  for (let i = 0; i < 9; i++) K.el(b, 'i', null, { top: (14 + i * 7.6) + '%', width: (i % 3 === 2 ? 58 : 82) + '%', right: '9%', left: 'auto' });
  return b;
}
const plane = (world, cls, w, h) => K.el(world, 'div', 's4-plane ' + cls, { width: w + 'px', height: h + 'px' });
/** a floor plane centred at (x, z), lifted by `up` px above the floor */
const floorM = (x, z, w, h, up = 0, sx = 1, sz = 1) => mul(T(x, -up, z), RX(90), S(sx, sz), T(-w / 2, -h / 2, 0));
/** a card model: bottom-centre anchor at (x, y, z), then yaw, tilt, roll, scale */
export const cardM = (p, w, h, ax = w / 2, ay = h) => mul(T(p.x, p.y, p.z), RY(p.ry || 0), RX(p.rx || 0), RZ(p.rz || 0), S(p.s == null ? 1 : p.s), T(-ax, -ay, 0));
const mixPose = (a, b, k) => Object.fromEntries(['x', 'y', 'z', 'rx', 'ry', 'rz', 's'].map(n => [n, lerp(a[n] ?? (n === 's' ? 1 : 0), b[n] ?? (n === 's' ? 1 : 0), k)]));
export const REST = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1 };
export const CARD1 = { W: 1000, H: 562.5 };
/** (fix round) the s3 → s4 hand-off: card 1 enters the film as its OWN object, below the splash lock-up, smaller and
 *  tilted (never on the student's slide rect). On the parade's first frame (L[0]) the camera sees card 1 (at REST on the
 *  spot) centred at about (540, 1300), 760 px wide, rolled −3° and turned a little; s3 draws its last frame with the same
 *  view, so the lime → stage cut keeps the card exactly where it is. */
export const HANDOFF = { cx: 540, cy: 1300, w: 760, yaw: 5, roll: -3 };
/** the camera keys of the parade (frame, target x/y, distance in P, yaw, pitch, roll) */
export function camKeys(L, fanF, outF) {
  const kf = (f, x, y, d, yaw, pitch, roll = 0) => ({ f, x, y, d, yaw, pitch, roll });
  const d0 = CARD1.W / HANDOFF.w, y0 = -CARD1.H / 2 - (HANDOFF.cy - CY) * d0;
  return {
    keys: [
      kf(L[0], 0, y0, d0, HANDOFF.yaw, 0, HANDOFF.roll),
      kf(L[0] + 14, 0, -300, 1.13, 3.2, 4.6),
      kf(L[1] - 8, 0, -306, 1.10, 6.0, 5.4),
      kf(L[1] + 6, 0, -290, 1.03, 2.0, 5.0),
      kf(L[2] - 4, 0, -294, 0.99, -2.0, 5.0),
      kf(L[2] + 6, 0, -298, 1.05, -4.5, 5.2),
      kf(L[3] - 6, 0, -298, 0.995, -6.0, 5.6),
      kf(L[3] + 4, 0, -300, 1.04, -3.0, 5.2),
      kf(L[4] + 4, 0, -296, 1.07, 1.5, 5.2),
      kf(L[5] + 4, 0, -300, 1.03, 4.0, 5.4),
      kf(L[6] + 4, 0, -300, 1.06, 2.0, 6.0),
      kf(L[6] + 16, 0, -306, 1.08, 0.5, 6.6),
      kf(fanF, 0, -352, 1.22, -0.4, 8.2),
      kf(outF, 0, -356, 1.235, -0.9, 8.6),
    ],
    hits: L.slice(1),
  };
}
/** card 1's full CSS matrix (view · model) for a world pose, seen by the parade camera at frame f (s3 uses f = L[0]) */
export function card1Matrix(cues, pose = REST, f = null) {
  const L = cues.cards.map(c => c.land);
  const C = camKeys(L, cues.key.fan, cues.scenes.find(x => x.id === 's4_parade').out);
  return mul(camera(f == null ? L[0] : f, C).V, cardM(pose, CARD1.W, CARD1.H));
}

// ------------------------------------------------------------------ the fan behind the spot (filled in retirement order)
// A hand of cards: the two wide ones (deck in front, video above and behind it) make the centre column, the A4 ones fan
// out to the sides, outer cards a little nearer and turned in. The pivot sits under the floor, so the bottoms hide behind
// the hero and the tops open above it. Scaled down so the whole hand fits the frame (and clears the label corner).
const FAN = { x: 0, y: 150, z: -1000 };
const SLOTS = [            // a: roll about the pivot (deg), r: pivot → card bottom-centre, dz: toward the camera, ry: turn in
  { a: 0, r: 640, dz: 30, ry: 0, s: 0.86 },       // deck (the film's hero slide) — centre, in front of the video
  { a: -13, r: 610, dz: 60, ry: 6, s: 0.86 },     // report
  { a: 13, r: 610, dz: 66, ry: -6, s: 0.86 },     // research (closed to page 1)
  { a: -25, r: 580, dz: 100, ry: 11, s: 0.84 },   // poster
  { a: 0, r: 900, dz: -70, ry: 0, s: 0.86 },      // video — above and behind the deck
  { a: 25, r: 580, dz: 106, ry: -11, s: 0.84 },   // CV
];
function slotPose(i, spread = 1, bob = 0) {
  const s = SLOTS[i], a = s.a * spread;
  return { x: FAN.x + s.r * Math.sin(a * DEG), y: FAN.y - s.r * Math.cos(a * DEG) + bob, z: FAN.z + s.dz, rx: -4, ry: s.ry * spread, rz: a, s: s.s };
}

export default {
  id: 's4_parade',

  async mount(root, ctx) {
    await ctx.loadCSS(new URL('./s4_parade.css', import.meta.url));
    const s = this.s = {};
    const cues = ctx.cues, key = cues.key;
    const L = cues.cards.map(c => c.land);                 // [258, 330, 366, 416, 431, 452, 481]
    s.L = L; s.OUT = ctx.scene.out; s.IN = ctx.scene.in; s.FANF = key.fan;
    s.wAwwal = ctx.ev('P1.answer').words[2].land;        // «أول»
    s.wRattib = ctx.ev('P2.answer').land;               // «نرتّبه.»
    const ev = id => ctx.ev(id);

    // camera keys: the first key is the splash hand-off (card 1 low, smaller, tilted; see HANDOFF)
    s.C = camKeys(L, s.FANF, s.OUT);

    // ---------------------------------------------------------------- stage (2D backdrop that follows the horizon)
    const bg = K.el(root, 'div', 's4-bg');
    s.horizon = K.el(bg, 'div', null, { position: 'absolute', left: '0px', top: '0px', width: '1080px', height: '0px', transformOrigin: '540px 0px' });
    K.el(s.horizon, 'div', 'wall'); K.el(s.horizon, 'div', 'floor'); K.el(s.horizon, 'div', 'haze'); s.strip = K.el(s.horizon, 'div', 'strip');
    K.el(bg, 'div', 'vig');

    const persp = K.el(root, 'div', 's4-persp');
    const world = s.world = K.el(persp, 'div', 's4-world');

    // floor: a pool of light on the spot, dust in the light
    s.pool = plane(world, 's4-pool', 2000, 1500);
    s.motes = [];
    const rnd = K.rng(4417);
    for (let i = 0; i < 10; i++) {
      const m = plane(world, 's4-mote' + (i % 4 === 0 ? ' l' : ''), 16, 16);
      s.motes.push({ el: m, x: lerp(-760, 760, rnd()), y: lerp(-1250, -60, rnd()), z: lerp(-1100, 420, rnd()),
        r: lerp(4, 11, rnd()), o: lerp(0.18, 0.55, rnd()), ph: rnd() * 6.28, sp: lerp(0.6, 1.4, rnd()) });
    }

    // ---------------------------------------------------------------- the cards
    const R16 = 14, RA4 = 5;     // corner radii (world px)
    const img = n => ASSET + n + '.jpg';
    const cards = s.cards = [];
    const addCard = (o) => {
      const c = { ...o, i: cards.length, land: L[cards.length], next: L[cards.length + 1] ?? null };
      c.unit = K.el(world, 'div', 's4-u p3', { width: c.W + 'px', height: c.H + 'px' });
      c.refl = K.el(world, 'div', 's4-refl', { width: c.W + 'px', height: c.H + 'px', borderRadius: (c.radius || 0) + 'px' });
      const ri = K.el(c.refl, 'img'); ri.src = ASSET + 'refl-' + c.refl_src + '.png';
      c.shadow = plane(world, 's4-shadow', 1000, 300);
      c.rip = [plane(world, 's4-ripple', 1000, 600), plane(world, 's4-ripple', 1000, 600), plane(world, 's4-splash', 1000, 600)];
      cards.push(c); return c;
    };

    // 1 · the university deck (hero = deck-uni-01-title, the slide the splash revealed); slides fan out behind it
    {
      const W = 1000, H = 562.5, c = addCard({ kind: 'deck', W, H, radius: R16, refl_src: 'deck-uni-01-title' });
      c.subs = [];
      // [sample, dx, lift, roll, deck, z]: the university slides climb up behind the title (their headlines show in the
      // bands above it); the school deck opens as two wings and a crown (bright = range). Back to front.
      // (fix round) no back slide shows a sliver of a title line any more: the two middle university slides sit fully
      // behind the title (only their dark edges, no text); the ones that show, show a whole headline. The school deck's
      // title slide is the front-left wing (the nearest one), so a high-schooler sees «دورة الماء» first.
      const fanSlides = [
        ['deck-school-03-quiz', 10, 560, 1.5, 'sch', -200], ['deck-uni-04-thanks', 70, 380, 2.5, 'uni', -150],
        ['deck-uni-03-data', 34, 12, 0.6, 'uni', -90], ['deck-uni-02-problem', -30, 8, -0.6, 'uni', -70],
        ['deck-school-02-cycle', 370, 170, 15, 'sch', -55], ['deck-school-01-title', -360, 200, -15, 'sch', -22]];
      fanSlides.forEach(([n, dx, lift, a, deck, z]) => {
        const sub = K.el(c.unit, 'div', 's4-sub', { width: W + 'px', height: H + 'px' });
        const fc = face(sub, img(n), W, H, R16);
        c.subs.push({ el: sub, f: fc, a, dx, lift, deck, z });
      });
      c.front = face(K.el(c.unit, 'div', 's4-sub', { width: W + 'px', height: H + 'px' }), img('deck-uni-01-title'), W, H, R16);
      c.faces = [c.front, ...c.subs.map(x => x.f)];
    }
    // 2 · the report: cover, contents, chart; the pages turn on a right-hand hinge
    {
      const W = 600, H = 848.4, c = addCard({ kind: 'report', W, H, radius: RA4, refl_src: 'report-01-cover', arrive: 'drop' });
      c.pages = ['report-03-chart', 'report-02-contents', 'report-01-cover'].map((n, j) => {
        const pg = K.el(c.unit, 'div', 's4-sub p3', { width: W + 'px', height: H + 'px' });
        const fc = face(pg, img(n), W, H, RA4);
        const bk = j > 0 ? backFace(pg, W, H, RA4) : null;
        return { el: pg, f: fc, back: bk, z: j * 3 };
      });
      c.faces = c.pages.map(p => p.f);
    }
    // 3 · the research paper as an open spread (RTL: page 1 on the right, the references page on the left)
    {
      const PW = 492, PH = 695.9, G = 10, W = PW * 2 + G, H = PH;
      const c = addCard({ kind: 'research', W, H, radius: 0, refl_src: 'research-01-first', arrive: 'right', PW, PH, G });
      const mk = n => { const pg = K.el(c.unit, 'div', 's4-sub', { width: PW + 'px', height: PH + 'px' }); return { el: pg, f: face(pg, img(n), PW, PH, 3) }; };
      c.left = mk('research-02-refs'); c.right = mk('research-01-first');
      // highlights (page-local px; the samples are 1240 x 1754): the heading «١. المقدمة», the numbers of the list
      // «١. ٢. ٣.», the heading «المراجع»; each tag sits in the empty part of the line (or just under the list)
      const sc = PW / 1240, hl = (pg, x0, y0, x1, y1) => K.el(pg.f.el, 'div', 's4-hl', { left: x0 * sc + 'px', top: y0 * sc + 'px', width: (x1 - x0) * sc + 'px', height: (y1 - y0) * sc + 'px' });
      c.hls = [hl(c.right, 934, 842, 1102, 890), hl(c.right, 1062, 1404, 1104, 1524), hl(c.left, 984, 1080, 1102, 1124)];
      c.faces = [c.left.f, c.right.f];
    }
    // 4 · poster
    { const W = 640, H = 905.3; const c = addCard({ kind: 'poster', W, H, radius: RA4, refl_src: 'poster-recycle', arrive: 'drop' }); c.front = face(c.unit, img('poster-recycle'), W, H, RA4); c.faces = [c.front]; }
    // 5 · video frame + a moving playhead and timecode
    {
      const W = 1000, H = 562.5, c = addCard({ kind: 'video', W, H, radius: R16, refl_src: 'video-frame', arrive: 'left' });
      c.front = face(c.unit, img('video-frame'), W, H, R16); c.faces = [c.front];
      const sc = W / 1920;
      c.sc = sc;
      c.ph = K.el(c.front.el, 'div', 's4-ph', {});
      K.el(c.ph, 'i', null, { top: 805 * sc + 'px' }); K.el(c.ph, 'b', null, { top: 812 * sc + 'px', height: (1066 - 812) * sc + 'px' });
      c.tc = K.el(c.front.el, 'div', 's4-tc', { left: 16 * sc + 'px', top: 764 * sc + 'px', width: 152 * sc + 'px', height: 30 * sc + 'px' });
    }
    // 6 · CV
    { const W = 610, H = 862.9; const c = addCard({ kind: 'cv', W, H, radius: RA4, refl_src: 'cv-student', arrive: 'right' }); c.front = face(c.unit, img('cv-student'), W, H, RA4); c.faces = [c.front]; }
    // 7 · the dashboard: the bar chart and the donut draw
    {
      const W = 960, H = 540, c = addCard({ kind: 'excel', W, H, radius: R16 * 0.8, refl_src: 'sheet-dashboard', arrive: 'drop' });
      c.front = face(c.unit, img('sheet-dashboard'), W, H, 11); c.faces = [c.front];
      const sc = W / 1920, src = img('sheet-dashboard');
      const crop = (x0, y0, x1, y1) => {
        K.el(c.front.el, 'div', 's4-patch', { left: x0 * sc + 'px', top: y0 * sc + 'px', width: (x1 - x0) * sc + 'px', height: (y1 - y0) * sc + 'px' });
        const cr = K.el(c.front.el, 'div', 's4-crop', { left: x0 * sc + 'px', top: y0 * sc + 'px', width: (x1 - x0) * sc + 'px', height: (y1 - y0) * sc + 'px' });
        const im = K.el(cr, 'img', null, { left: -x0 * sc + 'px', top: -y0 * sc + 'px', width: W + 'px', height: H + 'px' }); im.src = src;
        return cr;
      };
      c.bars = crop(1150, 598, 1752, 906);
      // the donut ring: a white ring patch, then the same pixels revealed clockwise by a conic mask
      const dc = [896, 662], ro = 117, ri = 76;
      K.el(c.front.el, 'div', 's4-patch', { left: (dc[0] - ro) * sc + 'px', top: (dc[1] - ro) * sc + 'px', width: 2 * ro * sc + 'px', height: 2 * ro * sc + 'px',
        borderRadius: '50%', background: 'transparent', border: `${(ro - ri) * sc}px solid #fff` });
      c.donut = crop(dc[0] - ro, dc[1] - ro, dc[0] + ro, dc[1] + ro);
      c.donut.style.borderRadius = '50%';
    }
    // preload everything the scene shows
    await Promise.all([...root.querySelectorAll('img')].map(i => K.img(i.src)));

    // ---------------------------------------------------------------- 2D overlay: vignette, leaders, chips, lines
    const ov = s.ov = K.el(root, 'div', 's4-ov');
    s.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); ov.appendChild(s.svg);
    s.leads = [0, 1, 2].map(() => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); s.svg.appendChild(g);
      const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('stroke', K.C.lime); ln.setAttribute('stroke-width', '3'); ln.setAttribute('stroke-linecap', 'round');
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('r', '9'); ring.setAttribute('fill', 'rgba(198,255,0,.25)'); ring.setAttribute('stroke', K.C.lime); ring.setAttribute('stroke-width', '3');
      g.append(ln, ring); g.style.display = 'none'; return { g, ln, ring };
    });

    // chips: each card's on-screen word, rendered once (anchored at its right-centre, moved every frame)
    const chipIds = ['P1.chip', 'P2.chip', 'P3.chip', 'P4.1', 'P4.2', 'P4.3', 'ui.chip_excel'];
    s.chips = chipIds.map(id => ({ ev: ev(id), c: K.chip(ov, { text: ev(id).text, theme: 'lime', size: 54, x: 0, y: 0, anchor: 'right' }) }));
    // the research tags
    // (fix round) the tags are the on-screen proof of «we format, we don't write»: chip style, 46 px, lime with ink text
    s.tags = ['ui.research_tag1', 'ui.research_tag2', 'ui.research_tag3'].map(id => ({ ev: ev(id), c: K.chip(ov, { text: ev(id).text, theme: 'lime', size: 46, x: 0, y: 0, anchor: 'right' }) }));
    // the answers (per word, on the VO word frames), the verb in lime
    const YA = s.YA = 1372, sh = '0 6px 28px rgba(0,0,0,.65)';
    s.answers = [
      // (fix round) maxWidth 820: every glyph's right edge stays at x <= 950, clear of the TikTok/Reels button column
      K.kinetic(ov, ev('P1.answer'), { x: 540, y: YA, size: 92, style: 'punch', exit: 'lift', exitDur: 5, colors: { 0: K.C.lime }, shadow: sh, maxWidth: 820 }),
      K.kinetic(ov, ev('P2.answer'), { x: 540, y: YA, size: 100, style: 'punch', exit: 'lift', exitDur: 5, colors: { 0: K.C.lime }, shadow: sh, maxWidth: 820 }),
      K.kinetic(ov, ev('P3.answer'), { x: 540, y: YA, size: 96, style: 'punch', exit: 'lift', exitDur: 5, colors: { 0: K.C.lime }, shadow: sh, maxWidth: 820 }),
      K.kinetic(ov, ev('P5'), { x: 540, y: 1376, size: 84, style: 'punch', dur: 2, exit: 'cut', colors: { 2: K.C.lime }, shadow: sh, maxWidth: 820 }),   // dur 2: nothing of it shows before the dashboard lands
    ];
    // the five file chips, one row, popping right → left (RTL order); each chip is an LTR element
    const fids = ['ui.file_chip1', 'ui.file_chip2', 'ui.file_chip3', 'ui.file_chip4', 'ui.file_chip5'];
    const tmp = fids.map(id => K.fileChip(ov, { ext: ev(id).text, size: 31, x: 0, y: 0, anchor: 'left' }));
    // (fix round) the row sits higher (ink ends ~y 1490, above the platform caption rows) and its right edge <= 950
    const gap = 14, tot = tmp.reduce((a, c) => a + c.width, 0) + gap * (tmp.length - 1);
    let xr = Math.min(540 + tot / 2, 950);
    s.files = tmp.map((fc, i) => { const x = xr - fc.width; xr = x - gap; return { ev: ev(fids[i]), c: fc, x, y: 1462 }; });
  },

  // ==================================================================== per frame
  seek(tl, ctx) {
    const s = this.s, t = ctx.t, f = ctx.f, L = s.L;
    const cam = camera(f, s.C), V = cam.V;

    // backdrop: the horizon of the floor plane for this pitch (and roll)
    const hy = CY - P * Math.tan(cam.pitch * DEG);
    s.horizon.style.transform = `translate(0px, ${hy.toFixed(2)}px) rotate(${(-cam.roll).toFixed(3)}deg)`;
    s.strip.style.opacity = (0.55 + 0.45 * Math.max(0, ...L.slice(1).map(l => kick(f, l, 3)))).toFixed(3);

    // floor pool + dust
    s.pool.style.transform = css3(mul(V, floorM(0, -260, 2000, 1500, 0)));
    for (const m of s.motes) {
      const tt = (f - s.IN) / 30;
      const p = [m.x + 30 * Math.sin(tt * 0.5 * m.sp + m.ph), m.y - 26 * tt * m.sp, m.z];
      const M = mul(V, T(p[0], p[1], p[2]), S(m.r / 8), T(-8, -8, 0));
      m.el.style.transform = css3(M);
      m.el.style.opacity = (m.o * (0.65 + 0.35 * Math.sin(tt * 2.1 * m.sp + m.ph))).toFixed(3);
    }

    // ------------------------------------------------------------ cards
    const spread = 1 + 0.10 * E.outBack(clamp((f - (s.FANF - 3)) / 7), 2.0);       // the fan opens on the bar line f503
    for (const c of s.cards) this.drawCard(c, this.cardState(c, f, spread), f, V);

    // ------------------------------------------------------------ overlay
    this.overlay(t, f, V);
  },

  /** where card c is at film frame f: pose, how much it is "the hero", dim, blur, flags */
  cardState(c, f, spread) {
    const s = this.s, L = s.L;
    const st = { vis: false, pose: { ...REST }, dim: 0, blur: 0, hero: false, floor: 0 };
    const A = c.kind === 'excel' || c.kind === 'report' ? 7 : 6;
    const arr0 = c.i === 0 ? -1e9 : c.land - A;
    if (f < arr0) return st;
    st.vis = true;
    const R0 = c.next == null ? 1e9 : c.next - (c.i === 0 ? 7 : 5), R1 = R0 + (c.i === 0 ? 17 : 15);
    const bob = 6 * Math.sin((f - c.i * 9) / 11);
    if (f < c.land) {                                               // ---- arriving (lands ON the cue frame)
      const u = (f - arr0) / A;
      if (c.arrive === 'drop') {
        st.pose = { ...REST, y: -1500 * (1 - u * u), rx: 14 * (1 - u), rz: (c.i % 2 ? -3 : 3) * (1 - u) };
        st.blur = 9 * u;
      } else {
        const dir = c.arrive === 'right' ? 1 : -1, k = 1 - u;
        st.pose = { ...REST, x: dir * 1450 * k, z: 140 * k, ry: -dir * 58 * k, rz: dir * 7 * k, y: -60 * Math.sin(Math.PI * u) };
        st.blur = 8 * clamp(u * 1.4);
      }
      st.floor = clamp(1 - Math.abs(st.pose.y) / 260);
      st.hero = true;
    } else if (f < R0) {                                            // ---- the hero, on the spot
      const p = { ...REST };
      if (c.i > 0) {
        if (c.arrive === 'drop') { p.y = -16 * Math.abs(damp(f, c.land, 5, 3)); p.rx = -4.5 * damp(f, c.land, 7, 4); }
        else { const dir = c.arrive === 'right' ? 1 : -1; p.x = -dir * 34 * damp(f, c.land, 7, 4); p.ry = dir * 6 * damp(f, c.land, 8, 4); }
        p.s = 1 + 0.018 * kick(f, c.land, 2);
      }
      st.pose = p; st.floor = 1; st.hero = true;
    } else {                                                        // ---- filed into the fan
      const k = E.inOutCubic(clamp((f - R0) / (R1 - R0)));
      const slot = slotPose(c.i, spread, bob);
      st.pose = mixPose(REST, slot, k);
      st.pose.y += -300 * Math.sin(Math.PI * k);                    // an arc up and over
      st.pose.rx += 16 * Math.sin(Math.PI * k);
      st.dim = (0.30 + 0.0016 * (110 - SLOTS[c.i].dz)) * k;          // deeper in the hand = darker
      st.floor = clamp(1 - k * 3);
      st.retire = k;
    }
    return st;
  },

  drawCard(c, st, f, V) {
    const vis = st.vis;
    const show = (el, on) => { const v = on ? 'block' : 'none'; if (el.style.display !== v) el.style.display = v; };
    show(c.unit, vis); show(c.refl, vis && st.floor > 0.01); show(c.shadow, vis && st.floor > 0.01);
    c.rip.forEach(r => show(r, false));
    if (!vis) return;
    const M = cardM(st.pose, c.W, c.H);
    c.M = M; c.VM = mul(V, M);
    c.unit.style.transform = css3(c.VM);
    c.unit.style.filter = st.blur > 0.3 ? `blur(${st.blur.toFixed(2)}px)` : 'none';
    // depth dimmer, glint on landing
    const gl = f >= c.land - 1 && f <= c.land + 10 ? E.outCubic(clamp((f - c.land + 1) / 11)) : -1;
    for (const fc of c.faces) {
      K.css(fc.dim, { opacity: st.dim.toFixed(3) });
      K.css(fc.gl, { opacity: gl < 0 ? '0' : (0.9 * Math.sin(Math.PI * gl)).toFixed(3), transform: `translateX(${(gl * 330).toFixed(1)}%)` });
    }
    // reflection (the card mirrored in the floor), contact shadow, the lime ripple on the landing frame
    if (st.floor > 0.01) {
      const lift = Math.max(0, -st.pose.y);
      c.refl.style.transform = css3(mul(V, MIRROR, M));
      c.refl.style.opacity = (0.30 * st.floor * clamp(1 - lift / 140)).toFixed(3);
      const sw = c.W * (1.05 + lift / 900), sd = 150 + lift * 0.35;
      c.shadow.style.transform = css3(mul(V, floorM(st.pose.x, st.pose.z + 10, 1000, 300, 0.4, sw / 1000, sd / 300)));
      c.shadow.style.opacity = (0.95 * st.floor * clamp(1 - lift / 700)).toFixed(3);
    }
    const dr = f - c.land;
    if (c.i > 0 && dr >= 0 && dr < 20) {
      const ring = (el, d0, dur, grow) => {
        const k = (dr - d0) / dur; if (k < 0 || k > 1) return;
        el.style.display = 'block';
        const e = E.outCubic(k), w = c.W * lerp(0.75, grow, e), dpt = lerp(150, 560, e);
        el.style.transform = css3(mul(V, floorM(0, 6, 1000, 600, 0.8, w / 1000, dpt / 600)));
        el.style.opacity = ((1 - k) * (1 - k) * 0.95).toFixed(3);
      };
      ring(c.rip[0], 0, 16, 1.75); ring(c.rip[1], 4, 15, 1.4); ring(c.rip[2], 0, 10, 1.5);
    }
    // ---- per-kind inner motion
    const L = this.s.L;
    if (c.kind === 'deck') {
      const uni = E.outBack(clamp((f - L[0]) / 12), 1.4);
      const sch = E.outBack(clamp((f - (this.s.wAwwal - 7)) / 7), 1.6);                // the school deck lands on «أول» (f302)
      const close = E.inOutCubic(clamp((f - (c.next - 14)) / 10));
      const keep = lerp(1, 0.16, close) + 0.24 * E.outBack(clamp((f - (this.s.FANF - 3)) / 8), 1.6);   // re-opens a little with the fan
      for (const sb of c.subs) {
        const k = (sb.deck === 'uni' ? uni : sch) * keep;
        sb.el.style.transform = css3(mul(T(c.W / 2 + sb.dx * k, c.H - sb.lift * k, sb.z * Math.max(k, 0.12)), RZ(sb.a * k), S(lerp(1, 0.9, k)), T(-c.W / 2, -c.H, 0)));
        sb.el.style.display = k > 0.004 || st.retire ? 'block' : 'none';
        K.css(sb.f.dim, { opacity: Math.max(st.dim, 0.16 + 0.0006 * -sb.z).toFixed(3) });
      }
    } else if (c.kind === 'report') {
      const close = st.retire ? E.inOutCubic(clamp(st.retire * 1.6)) : 0;
      const a1 = 174 * E.inOutCubic(clamp((f - (this.s.wRattib - 9)) / 10)) * (1 - close);  // cover: open on «نرتّبه.» (f347)
      const a2 = 170 * E.inOutCubic(clamp((f - (this.s.wRattib + 7)) / 9)) * (1 - close);   // then the contents page
      const ang = [0, a2, a1];
      c.pages.forEach((pg, j) => {
        pg.el.style.transform = css3(mul(T(c.W, 0, pg.z + (ang[j] > 0.5 ? 6 : 0)), RY(ang[j]), T(-c.W, 0, 0)));
      });
    } else if (c.kind === 'research') {
      const close = st.retire ? E.inOutCubic(clamp(st.retire * 1.5)) : 0;
      const v = 9 * (1 - close), PW = c.PW, G = c.G;
      const sh = -close * (PW + G) / 2;                       // closed, page 1 sits centred on the card's anchor
      c.pageM = { right: mul(T(PW + G + sh, 0, 0), RY(-v)), left: mul(T(lerp(PW, PW + G + PW, close) + sh, 0, -6 * close), RY(v), T(-PW, 0, 0)) };
      c.right.el.style.transform = css3(c.pageM.right);
      c.left.el.style.transform = css3(c.pageM.left);
      const tags = this.s.tags;
      c.hls.forEach((h, j) => {
        const k = E.outCubic(clamp((f - (tags[j].ev.land - 3)) / 5));
        K.css(h, { transform: `scaleX(${k.toFixed(4)})`, opacity: (k > 0 ? 1 : 0) + '' });
      });
    } else if (c.kind === 'video') {
      const run = Math.max(0, f - c.land);
      const x = 990 + run * 6.4;                                 // the playhead plays (orig px; 17.1 px per second)
      c.ph.style.transform = `translateX(${(x * c.sc).toFixed(2)}px)`;
      // (lead, integration) minutes roll over: the playhead passes 0:59 during the hold (it read 00:00:60:08 … 00:00:78:07)
      const secs = 46.5 + (x - 990) / 17.1, fr = Math.floor((secs % 1) * 24), ss = Math.floor(secs) % 60, mm = Math.floor(secs / 60);
      const txt = `00:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}:${String(fr).padStart(2, '0')}`;
      if (c.tc.textContent !== txt) c.tc.textContent = txt;
    } else if (c.kind === 'excel') {
      const kb = E.outCubic(clamp((f - c.land) / 13));
      c.bars.style.clipPath = `inset(${((1 - kb) * 100).toFixed(2)}% 0 0 0)`;
      const kd = E.inOutCubic(clamp((f - c.land - 2) / 13));
      const m = `conic-gradient(from 0deg, #000 ${(kd * 360).toFixed(2)}deg, rgba(0,0,0,0) ${(kd * 360 + 0.01).toFixed(2)}deg)`;
      c.donut.style.webkitMaskImage = m; c.donut.style.maskImage = m;
    }
  },

  overlay(t, f, V) {
    const s = this.s, L = s.L;
    // (fix round) each chip is PARENTED to its own card: it pops on the card's land frame (never before, so a chip never
    // sits on the previous card beside the previous answer), rides on the card's bottom-right corner (projected from the
    // card's CURRENT pose every frame) and is gone on the frame the next card lands. Right edge <= 950, centre y <= 1492
    // (clear of the right-hand button column and the caption rows).
    s.chips.forEach((ch, i) => {
      // card 1 lands ON the cut (f258), low in the frame: its chip pops 3 frames later, once the camera lifts the corner
      const c = s.cards[i], e = ch.ev, land = L[i] + (i === 0 ? 3 : 0);
      const anchor = c.VM ? proj(c.VM, c.W - 26, c.H) : proj(mul(V, cardM(REST, c.W, c.H)), c.W - 26, c.H);
      const punch = 1 + 0.18 * Math.exp(-Math.max(0, f - land) / 2.2);
      const x = Math.min(anchor[0], 950), y = Math.min(anchor[1] + 4, 1492);
      const outF = e.out >= s.OUT ? null : (L[i + 1] ?? e.out);
      ch.c.render(t, land - 1, land + 2, outF, { extra: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(-3.5deg) scale(${punch.toFixed(4)})` });
    });
    // research tags + leaders, pinned to the formatted things on the pages
    const rc = s.cards[2];
    const tgt = [['right', 934, 866], ['right', 1062, 1444], ['left', 984, 1102]];      // page px (1240 x 1754): highlight edges
    // tag right-centre relative to its target: «عناوين» / «مراجع» sit in the empty part of their heading line; «ترقيم» sits
    // left of the numbered list and its leader runs in the gap between list lines 1 and 2
    const place = [[-46, 0], [-214, 0], [-46, 0]];
    s.tags.forEach((tg, j) => {
      const e = tg.ev, on = f >= e.in && f < e.out && rc.VM;
      tg.c.render(t, e.in, e.land, e.out, { extra: on ? (() => {
        const sc = rc.PW / 1240, [pg, px, py] = tgt[j];
        const p = proj(mul(rc.VM, rc.pageM[pg]), px * sc, py * sc);
        tg.p = p; tg.anchor = [p[0] + place[j][0], p[1] + place[j][1]];
        return `translate(${tg.anchor[0].toFixed(1)}px, ${tg.anchor[1].toFixed(1)}px)`;
      })() : '' });
      const ld = s.leads[j];
      if (!on) { ld.g.style.display = 'none'; return; }
      const k = E.outCubic(clamp((f - e.in) / (e.land - e.in + 2))), ko = clamp((f - (e.out - 5)) / 5);
      ld.g.style.display = 'block'; ld.g.style.opacity = (1 - ko).toFixed(3);
      const a = [tg.anchor[0] + 6, tg.anchor[1]], b = tg.p;
      ld.ln.setAttribute('x1', a[0].toFixed(1)); ld.ln.setAttribute('y1', a[1].toFixed(1));
      ld.ln.setAttribute('x2', lerp(a[0], b[0], k).toFixed(1)); ld.ln.setAttribute('y2', lerp(a[1], b[1], k).toFixed(1));
      ld.ring.setAttribute('cx', b[0].toFixed(1)); ld.ring.setAttribute('cy', b[1].toFixed(1));
      ld.ring.setAttribute('r', (9 * clamp((k - 0.6) / 0.4)).toFixed(2));
    });
    for (const a of s.answers) a.render(t);
    s.files.forEach(fc => fc.c.render(t, fc.ev.in, fc.ev.land, fc.ev.out >= s.OUT ? null : fc.ev.out, { extra: `translate(${fc.x.toFixed(1)}px, ${fc.y.toFixed(1)}px)` }));
  },
};
