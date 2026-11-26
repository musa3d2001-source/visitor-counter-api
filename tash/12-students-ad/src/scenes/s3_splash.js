// s3_splash — THE TURN (f140–258), the most important 2.5 s of the film. (Rebuilt in the fix round, 26 Nov; re-timed and
// re-laid in fix round 2: see the block at the end of this comment.)
//
// Over the student's dark slide app (s2 runs underneath to f224, dimmed 40 % from f141) a big TASH message lands in the
// middle of the screen: an ink bubble with a lime rim, the sender «طشّ» (lime, 44 px), no time, no online dot, no avatar.
// It is the hero of the beat: it types «المرة الجاية…» (84 px) and «خلّ التصميم على» (100 px) word by word, each word
// popping with a 2-frame overshoot, the bubble springing to hold it (the text is clipped to the bubble, so nothing ever
// spills out). Under them, on their own row, three lime typing dots bounce, and from the riser they swell.
// THE HIT (f215, bar line): the dots punch and fire the splash: solid lime droplets (no outline, an inner shade and a
// one-frame smear) burst out over the bubble, and the lime sheet floods the whole screen BEHIND the bubble (the app,
// the student's slide, the reminder, the group chat are all washed away). The dots do not move: they ARE the dots of
// the wordmark, whose paper body slams in around them on the same row (never dotless), its shadda drops, and the line's
// full stop lands on its baseline, clear of the ش. The two text rows nudge up as it lands, so the bubble reads, top to
// bottom: «المرة الجاية… / خلّ التصميم على / طشّ.» — then «للطلاب» snaps under the wordmark as a lime sticker on the
// bubble's edge (f229): the lock-up «طشّ للطلاب».
// After the lock-up has read, card 1 (TASH's sample deck) arrives as a NEW object: it flies up from below the frame,
// tilted, smaller than the screen, into the lower third (never on the student's slide rect, never between the line and
// the wordmark), and settles exactly where the parade's camera sees it on its first frame (s4_parade.js HANDOFF): the
// lime → stage cut on f258 keeps the card in place. The samples label is on from the card's first visible frame.
// Every visual is a pure function of the frame (seeded rng, no timers).
// (fix round 2) · The bubble springs UP from 220 px below on f141 (first seen f142, once the reminder has flown off) and
//   settles by f148. · It is always grown BEFORE its content: row-1 width from its first frame, two rows from f157, the
//   row-2 width by f180, three rows from f184; every word pops WHOLE inside it (never revealed through the clip edge).
//   · Typing dots: row 1 f142–146, row 2 f161–181 (one frame before «خلّ» shows), row 3 (= the wordmark's dots) from
//   f189. · The burst droplets fly out from the bubble's rim, drawn UNDER the bubble (nothing lands on the type). · The
//   whole message is one group, centred lower in the frame for the turn and the hit (≈ y 540–1330); as card 1 flies in
//   (f238–257) the group steps back up and a little smaller (f236–252), so the card lands ≥ 48 px under it. · «للطلاب»
//   is the film's one lock-up: an ink pill, 3 px lime outline, lime type, 24 px under the wordmark (s7 and the poster
//   use the same).
import * as K from '../kit.js';
import * as L from '/_system/brand/logo.mjs';
import { card1Matrix, cardM, css3, REST, CARD1, HANDOFF } from './s4_parade.js';

const NS = 'http://www.w3.org/2000/svg';
const LIME = '#C6FF00', INK = '#0B0B0B', PAPER = '#F5F5E9';
const RIM = '#5E8A00';                      // lime in shadow: the liquid's edge
const CARD_IMG = '../assets/s4_parade/deck-uni-01-title.jpg';

// ---------------------------------------------------------------- layout (frame px)
// rows are centred on x 540; the dots row sits where the wordmark's dots will be (they never move)
const B = { padX: 50, r: 46, rTail: 12, sz1: 84, sz2: 100, maxRow: 830,
  top0: 382, y1: 508, y2: 628, yDots: 758, bot1: 568, bot2: 694, bot3: 822,        // before the hit
  lift: 50, top1: 372, botPad: 34 };                                                // after the hit (rows lifted)
const WM_W = 560;
// (fix round 2) the message group: centred lower for the turn and the hit, then it steps back for card 1
const GRP = { y0: 170, rise: 220, glide: [236, 252], y1: -30, s1: 0.90, origin: [540, 372] };
const PILL = { size: 78, gap: 24 };          // «للطلاب»: type px, gap under the wordmark's ink
const PERIOD = { r: 64, gap: 92 };            // logo units: the full stop's radius and its gap from the ش's left edge

const clamp = K.clamp, lerp = K.lerp, E = K.E;
const f2 = v => (+v).toFixed(2);
function sv(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
/** damped spring in FRAMES: 0 → 1 with a jelly overshoot */
const sprF = (n, w = 0.52, d = 3.0) => (n <= 0 ? 0 : 1 - Math.exp(-n / d) * Math.cos(w * n));
/** a bubble: rounded rect, the small corner (the speech tail side) top-right */
function bubblePath(x, y, w, h, r, rt) {
  r = Math.min(r, h / 2, w / 2); rt = Math.min(rt, r);
  return `M${f2(x + r)} ${f2(y)}H${f2(x + w - rt)}A${rt} ${rt} 0 0 1 ${f2(x + w)} ${f2(y + rt)}V${f2(y + h - r)}` +
    `A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + w - r)} ${f2(y + h)}H${f2(x + r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x)} ${f2(y + h - r)}` +
    `V${f2(y + r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + r)} ${f2(y)}Z`;
}

export default {
  id: 's3_splash',

  async mount(root, ctx) {
    const s = this.s = {};
    await ctx.loadCSS(new URL('./s3_splash.css', import.meta.url));
    const ev = id => ctx.ev(id);
    const key = ctx.cues.key;
    const L31 = ev('L3.1'), L32a = ev('L3.2a'), L33 = ev('L3.3'), snd = ev('ui.tash_sender'), typ = ev('ui.tash_typing');
    s.F = { in: ctx.scene.in, out: ctx.scene.out, hit: key.splash, bub: snd.land, typOut: typ.out,
      chipIn: L33.in, chipLand: L33.land, row2: L32a.words[0].land, dotsLand: L32a.words[3].land,
      card0: key.card1_in, card1: key.card1 };
    root.classList.add('s3-root');
    const world = s.world = K.el(root, 'div', 's3-world');

    // ---- 1. the liquid (one full-frame canvas, BEHIND the bubble) + half-res offscreens for the rims
    s.cv = K.el(world, 'canvas', 's3-cv'); s.cv.width = 1080; s.cv.height = 1920; s.g = s.cv.getContext('2d');
    const off = () => { const c = document.createElement('canvas'); c.width = 540; c.height = 960; return c; };
    s.hl = off(); s.dk = off(); s.hg = s.hl.getContext('2d'); s.dg = s.dk.getContext('2d');
    const q4 = () => { const c = document.createElement('canvas'); c.width = 270; c.height = 480; return c; };
    s.sq = q4(); s.sq2 = q4(); s.sqg = s.sq.getContext('2d'); s.sq2g = s.sq2.getContext('2d');

    // ---- 2. card 1: the parade's own projection (perspective 1300 about the frame centre), a new object on the lime
    const persp = K.el(world, 'div', 's3-persp');
    const w3 = K.el(persp, 'div', 's3-w3');
    s.card = K.el(w3, 'div', 's3-card', { width: CARD1.W + 'px', height: CARD1.H + 'px' });
    const url = new URL(CARD_IMG, import.meta.url).href;
    await K.img(url);
    const im = K.el(s.card, 'img'); im.src = url; im.decoding = 'sync';
    K.el(s.card, 'div', 'lt');
    s.cardSheen = K.el(s.card, 'div', 'gl');
    s.cues = ctx.cues;

    // ---- 3. the burst droplets (canvas UNDER the message group: they fly out from the bubble's rim, never over the type)
    s.dcv = K.el(world, 'canvas', 's3-cv'); s.dcv.width = 1080; s.dcv.height = 1920; s.dgc = s.dcv.getContext('2d');

    // ---- 4. the message group: bubble, text rows, wordmark, «للطلاب» (one transform: shake, rise, the step back)
    s.grp = K.el(world, 'div', 'layer s3-grp', { transformOrigin: `${GRP.origin[0]}px ${GRP.origin[1]}px` });
    s.bsvg = sv('svg', { class: 's3-svg', viewBox: '0 0 1080 1920', width: 1080, height: 1920 }); s.grp.appendChild(s.bsvg);
    sv('defs', {}, s.bsvg).innerHTML = '<filter id="s3-bsh" x="-15%" y="-30%" width="130%" height="190%"><feGaussianBlur stdDeviation="16"/></filter>';
    s.bShadow = sv('path', { fill: 'rgba(40,62,0,0.55)', filter: 'url(#s3-bsh)' }, s.bsvg);
    s.bG = sv('g', {}, s.bsvg);
    s.bGlow = sv('path', { fill: 'none', stroke: LIME, 'stroke-width': 16, 'stroke-opacity': 0.13 }, s.bG);
    s.bBody = sv('path', { fill: INK, stroke: LIME, 'stroke-width': 3 }, s.bG);

    // ---- 5. the text rows (DOM, per word), clipped to the bubble
    s.txt = K.el(s.grp, 'div', 'layer s3-txt');
    s.rowBox = K.el(s.txt, 'div', 'layer');
    const mkRow = (words, size, weight) => {
      const d = K.el(s.rowBox, 'div', 's3-line', { fontSize: size + 'px', fontWeight: String(weight) }); d.dir = 'rtl';
      const spans = words.map((w, i) => {
        const sp = K.el(d, 'span', 'w', { opacity: '0' }, w.text); sp.dataset.safe = '1';
        if (i < words.length - 1) d.appendChild(document.createTextNode(' '));
        return { el: sp, land: w.land };
      });
      let W = d.offsetWidth;
      if (W > B.maxRow) { d.style.fontSize = (size * B.maxRow / W).toFixed(2) + 'px'; W = d.offsetWidth; }
      return { el: d, spans, W, H: d.offsetHeight };
    };
    s.r1 = mkRow(L31.words, B.sz1, 700);
    s.r2 = mkRow(L32a.words.filter(w => w.text !== '•••'), B.sz2, 800);
    for (const [r, y] of [[s.r1, B.y1], [s.r2, B.y2]]) {
      r.y = y; K.css(r.el, { left: f2(540 - r.W / 2) + 'px', top: f2(y - r.H / 2) + 'px' });
      r.spans.forEach(sp => { sp.x0 = 540 - r.W / 2 + sp.el.offsetLeft; sp.x1 = sp.x0 + sp.el.offsetWidth; });
    }
    s.sender = K.el(s.txt, 'div', 's3-abs s3-ar s3-sender', {}, snd.text); s.sender.dir = 'rtl'; s.sender.dataset.safe = '1';
    s.senderW = s.sender.offsetWidth;

    // ---- 6. the wordmark (paper body + the lime dots = the typing dots), the full stop, «للطلاب»
    s.osvg = sv('svg', { class: 's3-svg', viewBox: '0 0 1080 1920', width: 1080, height: 1920 }); s.grp.appendChild(s.osvg);
    const sc = s.wmS = WM_W / L.VB.w;
    const D0 = L.dots();
    s.wmX = 540 - WM_W / 2; s.wmY = B.yDots - D0[1].cy * sc;
    s.wm = sv('g', { transform: `translate(${f2(s.wmX)} ${f2(s.wmY)}) scale(${sc.toFixed(5)})` }, s.osvg);
    s.wmBody = sv('g', {}, s.wm);
    s.wmBody.innerHTML = L.wordmarkInner({ body: PAPER, dot: 'none', shadda: PAPER, ids: true });
    s.wmBody.querySelector('#tash-dots')?.remove();
    s.shadda = s.wmBody.querySelector('#tash-shadda'); s.shaddaBase = s.shadda.getAttribute('transform');
    // the full stop: a paper dot on the ط's baseline, left of the ش's leftmost ink with a clear gap (measured)
    const bodyPath = s.wmBody.querySelector('#tash-body path');
    const bb = bodyPath.getBBox();                                   // in the body group's space (baseline at y 0)
    const tb = s.wmBody.querySelector('#tash-body').getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/);
    const TX = +tb[1], TY = +tb[2];
    s.period = sv('circle', { cx: f2(TX + bb.x - PERIOD.gap - PERIOD.r), cy: f2(TY - PERIOD.r), r: PERIOD.r, fill: PAPER }, s.wm);
    s.periodX = s.wmX + (TX + bb.x - PERIOD.gap - PERIOD.r) * sc; s.periodY = s.wmY + (TY - PERIOD.r) * sc;
    s.wmLeft = s.wmX + (TX + bb.x) * sc;
    s.logoDots = D0.map(d => ({ x: s.wmX + d.cx * sc, y: s.wmY + d.cy * sc, r: d.r * sc }));
    s.dots = s.logoDots.map(() => sv('circle', { fill: LIME }, s.osvg));
    s.tDots = [0, 1, 2].map(() => sv('circle', { fill: LIME }, s.osvg));       // ui.tash_typing «•••» on row 1 (f142–146)
    s.tDots2 = [0, 1, 2].map(() => sv('circle', { fill: LIME }, s.osvg));      // … and on row 2 (f161–181)
    for (const c of [...s.tDots, ...s.tDots2]) c.dataset.ink = '1';             // never on a word (sweep)
    // the wordmark's real ink (measured): the body + shadda, at rest
    const ib = s.wmBody.getBBox();
    s.wmInkBottom = s.wmY + (ib.y + ib.height) * sc;

    // «للطلاب»: the lock-up pill (ink, 3 px lime outline, lime type), 24 px under the wordmark's ink
    s.chip = K.el(s.grp, 'div', 's3-abs s3-chip', { fontSize: PILL.size + 'px' }, L33.text); s.chip.dir = 'rtl'; s.chip.dataset.safe = '1';
    const cw = s.chip.offsetWidth, ch = s.chip.offsetHeight;
    s.chipCy = s.wmInkBottom + PILL.gap + ch / 2;
    K.css(s.chip, { left: f2(540 - cw / 2) + 'px', top: f2(s.chipCy - ch / 2) + 'px' });
    s.bot4 = s.wmInkBottom + B.botPad;                                 // the wordmark held (the hit)
    s.bot5 = s.chipCy + ch / 2 + B.botPad;                            // … and the pill (f227 on)

    // ---- 7. (fix round 2) the bubble is grown BEFORE its content: the row-1 width from its first frame, two rows once
    // «الجاية…» is in (f157, for the row-2 typing dots from f161), the row-2 width by f180 (before «خلّ» shows on f183),
    // three rows f184 (before the wordmark's dots spawn on f189); the hit grows it to hold the wordmark, the snap of
    // «للطلاب» (f227) to hold the pill. Words pop whole inside it (no word is ever revealed through the clip edge).
    const ext = sp => 2 * Math.max(Math.abs(sp.x0 - 540), Math.abs(sp.x1 - 540)) + 2 * B.padX;
    const W1 = Math.max(3 * 40 + 2 * B.padX + 20, s.senderW + 2 * B.padX + 40, ...s.r1.spans.map(ext));
    const W2 = Math.max(W1, ...s.r2.spans.map(ext));
    const r1Last = s.r1.spans[s.r1.spans.length - 1].land;
    s.F.typ2 = [r1Last + 1, s.F.row2 - 4];                            // row-2 typing dots: f161 … f181 (hidden on f182)
    s.F.dots3 = s.F.row2 + 4;                                         // the wordmark's dots spawn on f189
    s.wSteps = [[s.F.in, W1], [s.F.row2 - 12, W2]];
    s.hSteps = [[s.F.in, B.bot1], [r1Last - 3, B.bot2], [s.F.row2 - 1, B.bot3]];
    s.wFinal = W2;

    // ---- 8. the flood model (seeded), the burst droplets
    const rnd = K.rng(215);
    s.O = [s.logoDots[1].x, s.logoDots[1].y + GRP.y0];              // the splash's origin, in the frame (the group sits lower)
    s.lobes = [[3, 0.075], [4, 0.05], [6, 0.04], [9, 0.026], [13, 0.017], [19, 0.011]].map(([k, a]) => ({ k, a, p: rnd() * 6.283, v: (rnd() - 0.5) * 0.5 }));
    s.fingers = Array.from({ length: 26 }, (_, i) => {
      const th = -Math.PI + (i + 0.15 + rnd() * 0.7) * (2 * Math.PI / 26);
      return { th, lam: 0.07 + rnd() * 0.2, w: 14 + rnd() * 34, t0: rnd() * 1.6, dur: 2 + rnd() * 3, bend: (rnd() - 0.5) * 0.5 };
    });
    s.drops = Array.from({ length: 70 }, () => {
      const th = -Math.PI + rnd() * 2 * Math.PI;
      return { th, ts: rnd() * 5.5, m: 1.25 + rnd() * 0.9, r: 3 + Math.pow(rnd(), 2) * 15, stick: rnd() < 0.45 ? 1 + rnd() * 3 : 99,
        sat: Array.from({ length: 3 }, () => [rnd() * 6.283, 1.6 + rnd() * 1.4, 0.18 + rnd() * 0.22]) };
    });
    // the burst: droplets thrown OUT of the bubble's rim (mostly sideways and down, a few up), solid, no outline; drawn
    // under the bubble, so none of them ever sits on a letter (fix round 2: they landed as extra dots on the type)
    s.burst = Array.from({ length: 26 }, (_, i) => {
      const a = (i / 26) * 2 * Math.PI + (rnd() - 0.5) * 0.4, v = 30 + rnd() * 44;
      return { a, vx: Math.cos(a) * v * 1.25, vy: Math.sin(a) * v * 0.9 - 6, r: 7 + Math.pow(rnd(), 1.5) * 17, life: 6 + rnd() * 5 };
    });
  },

  // ---------------------------------------------------------------- the liquid sheet (polar, around O)
  R(tau) { const u = clamp(tau / 12); return 230 + (1990 - 230) * (1 - Math.pow(1 - u, 1.8)); },
  dR(tau) { return (this.R(tau + 0.05) - this.R(tau - 0.05)) / 0.1; },
  rb(th, tau) {
    let n = 0;
    for (const l of this.s.lobes) n += l.a * Math.sin(l.k * th + l.p + l.v * tau);
    return this.R(tau) * (1 + 0.3 * Math.sin(th)) * (1 + n);       // gravity: the sheet reaches further down
  },
  /** fill every shape of the liquid with g's current fillStyle, offset (dx, dy), scaled by k (half-res offscreens) */
  paint(g, tau, dx = 0, dy = 0, k = 1) {
    const s = this.s, [ox, oy] = s.O;
    const X = x => (x + dx) * k, Y = y => (y + dy) * k;
    const N = 150, pts = [];
    for (let i = 0; i < N; i++) { const th = -Math.PI + (i / N) * 2 * Math.PI, r = this.rb(th, tau); pts.push([ox + r * Math.cos(th), oy + r * Math.sin(th)]); }
    g.beginPath();
    const m0 = [(pts[N - 1][0] + pts[0][0]) / 2, (pts[N - 1][1] + pts[0][1]) / 2];
    g.moveTo(X(m0[0]), Y(m0[1]));
    for (let i = 0; i < N; i++) { const a = pts[i], b = pts[(i + 1) % N]; g.quadraticCurveTo(X(a[0]), Y(a[1]), X((a[0] + b[0]) / 2), Y((a[1] + b[1]) / 2)); }
    g.closePath(); g.fill();
    for (const fi of s.fingers) {
      const gr = clamp((tau - fi.t0) / fi.dur); if (gr <= 0) continue;
      const rB = this.rb(fi.th, tau), len = this.R(tau) * fi.lam * (1 - Math.pow(1 - gr, 2));
      const ux = Math.cos(fi.th), uy = Math.sin(fi.th), px = -uy, py = ux;
      const sag = 0.00022 * len * len + fi.bend * len * 0.2;
      const tx = ox + (rB + len) * ux + px * fi.bend * len * 0.15, ty = oy + (rB + len) * uy + sag;
      const bx = ox + (rB - 10) * ux, by = oy + (rB - 10) * uy;
      const w = fi.w * (1 + 0.6 * clamp(tau / 6)), rt = w * 0.62, nw = w * 0.32;
      const nx = tx - (tx - bx) * 0.16, ny = ty - (ty - by) * 0.16;
      g.beginPath();
      g.moveTo(X(bx + px * w), Y(by + py * w));
      g.quadraticCurveTo(X((bx + nx) / 2 + px * nw * 0.9), Y((by + ny) / 2 + py * nw * 0.9), X(nx + px * nw), Y(ny + py * nw));
      g.lineTo(X(nx - px * nw), Y(ny - py * nw));
      g.quadraticCurveTo(X((bx + nx) / 2 - px * nw * 0.9), Y((by + ny) / 2 - py * nw * 0.9), X(bx - px * w), Y(by - py * w));
      g.closePath(); g.fill();
      g.beginPath(); g.arc(X(tx), Y(ty), rt * k, 0, 2 * Math.PI); g.fill();
    }
    for (const d of s.drops) {
      const a = tau - d.ts; if (a < 0) continue;
      const ux = Math.cos(d.th), uy = Math.sin(d.th);
      const r0 = this.rb(d.th, d.ts), v0 = this.dR(d.ts) * (1 + 0.3 * Math.sin(d.th)) * d.m;
      const tt = Math.min(a, d.stick), kd = 0.12, disp = v0 * (1 - Math.exp(-kd * tt)) / kd;
      const x = ox + (r0 + disp) * ux, y = oy + (r0 + disp) * uy + 2.2 * tt * tt;
      if (a < d.stick) {
        const vx = v0 * Math.exp(-kd * tt) * ux, vy = v0 * Math.exp(-kd * tt) * uy + 4.4 * tt, sp = Math.hypot(vx, vy);
        const st = Math.min(2.8, 1 + sp * 0.01);
        g.beginPath(); g.ellipse(X(x), Y(y), d.r * st * k, d.r / Math.sqrt(st) * k, Math.atan2(vy, vx), 0, 2 * Math.PI); g.fill();
      } else {
        const sp = clamp((a - d.stick) / 2);
        g.beginPath(); g.arc(X(x), Y(y), d.r * lerp(1, 1.35, sp) * k, 0, 2 * Math.PI); g.fill();
        for (const [an, dist, rr] of d.sat) { g.beginPath(); g.arc(X(x + Math.cos(an) * d.r * dist * sp), Y(y + Math.sin(an) * d.r * dist * sp), Math.max(0.5, d.r * rr) * k, 0, 2 * Math.PI); g.fill(); }
      }
    }
  },

  drawLiquid(f) {
    const s = this.s, g = s.g, HIT = s.F.hit, tau = f - HIT, [ox, oy] = s.O;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, 1080, 1920);
    if (tau < 0) {
      // the dots charging on the riser: a lime glow spills round the bubble
      const a = 0.30 * E.inCubic(clamp((f - (HIT - 8)) / 8));
      if (a > 0.002) {
        const gr = g.createRadialGradient(ox, oy, 0, ox, oy, 520);
        gr.addColorStop(0, `rgba(198,255,0,${a.toFixed(3)})`); gr.addColorStop(1, 'rgba(198,255,0,0)');
        g.fillStyle = gr; g.fillRect(ox - 520, oy - 520, 1040, 1040);
      }
      return;
    }
    const sh = this.shake(f);
    g.setTransform(1, 0, 0, 1, sh[0], sh[1]);
    if (tau < 13) {
      if (tau < 10) {
        const q = s.sqg, q2 = s.sq2g;
        q.clearRect(0, 0, 270, 480); q.fillStyle = '#000'; this.paint(q, tau, sh[0] + 14, sh[1] + 30, 0.25);
        q2.clearRect(0, 0, 270, 480); q2.filter = 'blur(4px)'; q2.drawImage(s.sq, 0, 0); q2.filter = 'none';
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalAlpha = 0.55; g.drawImage(s.sq2, 0, 0, 1080, 1920); g.globalAlpha = 1;
        g.setTransform(1, 0, 0, 1, sh[0], sh[1]);
      }
      g.fillStyle = LIME; this.paint(g, tau);
      const sa = 0.55 * Math.exp(-tau / 7), R = this.R(tau);
      g.globalCompositeOperation = 'source-atop';
      const gr = g.createRadialGradient(ox - R * 0.12, oy - R * 0.16, 0, ox, oy, R * 0.75);
      gr.addColorStop(0, `rgba(242,255,190,${sa.toFixed(3)})`); gr.addColorStop(0.55, `rgba(232,255,140,${(sa * 0.35).toFixed(3)})`); gr.addColorStop(1, 'rgba(198,255,0,0)');
      g.fillStyle = gr; g.fillRect(-40, -40, 1160, 2000);
      g.globalCompositeOperation = 'source-over';
      for (const [cg, col, dx, dy, alpha] of [[s.hg, '#F7FFDA', 7, 9, 0.75], [s.dg, RIM, -6, -8, 0.6]]) {
        cg.globalCompositeOperation = 'source-over'; cg.clearRect(0, 0, 540, 960);
        cg.fillStyle = col; this.paint(cg, tau, sh[0], sh[1], 0.5);
        cg.globalCompositeOperation = 'destination-out'; cg.fillStyle = '#000'; this.paint(cg, tau, sh[0] + dx, sh[1] + dy, 0.5);
        cg.globalCompositeOperation = 'source-over';
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalAlpha = alpha * (1 - clamp((tau - 9) / 4)); g.drawImage(cg.canvas, 0, 0, 1080, 1920); g.globalAlpha = 1;
        g.setTransform(1, 0, 0, 1, sh[0], sh[1]);
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (tau >= 8) { g.globalAlpha = clamp((tau - 8) / 3); g.fillStyle = LIME; g.fillRect(0, 0, 1080, 1920); g.globalAlpha = 1; }
    // surface ripples on the lime: rings from the burst (they show round the bubble), and a slow one under card 1
    const ring = (x, y, r, a, lw, sq = 1) => {
      if (a < 0.004 || r <= 0) return;
      g.lineWidth = lw;
      g.strokeStyle = `rgba(250,255,215,${a.toFixed(3)})`; g.beginPath(); g.ellipse(x, y, r, r * sq, 0, 0, 2 * Math.PI); g.stroke();
      g.strokeStyle = `rgba(70,105,0,${(a * 0.55).toFixed(3)})`; g.beginPath(); g.ellipse(x, y, r + lw * 0.9, (r + lw * 0.9) * sq, 0, 0, 2 * Math.PI); g.stroke();
    };
    for (const tk of [6, 11, 17, 24]) { const a = tau - tk; if (a > 0) ring(ox, oy, 420 + 40 * a, 0.16 * Math.exp(-a / 11), 20); }
    const ca = f - (s.F.card0 + 12);
    if (ca > 0) for (const tk of [0, 6]) { const a = ca - tk; if (a > 0) ring(540, HANDOFF.cy + 40, 300 + 26 * a, 0.2 * Math.exp(-a / 7), 10, 0.3); }
  },

  /** the impact shake (px) — the hit, then a small one when the wordmark slams */
  shake(f) {
    const a = f - this.s.F.hit, b = a - 2;
    let x = 0, y = 0;
    if (a >= 0 && a < 9) { const m = 13 * Math.exp(-a / 2.2); x += Math.sin(a * 2.7 + 0.4) * m; y += Math.cos(a * 2.1) * m; }
    if (b >= 0 && b < 7) { const m = 4 * Math.exp(-b / 2); x += Math.sin(b * 3.1) * m; y += Math.cos(b * 2.6 + 1) * m; }
    return [x, y];
  },

  /** the burst: solid lime droplets thrown out of the bubble's rim (drawn under the bubble), a one-frame smear on their
   *  first frame, an inner shade */
  drawBurst(f) {
    const s = this.s, g = s.dgc, a = f - s.F.hit;
    g.clearRect(0, 0, 1080, 1920);
    if (a < 0 || a > 12) { s.dcv.style.display = 'none'; return; }
    s.dcv.style.display = 'block';
    const sh = this.shake(f);
    const cx = 540, cy = B.yDots + GRP.y0, hw = s.wFinal / 2 - 14, up = cy - (B.top1 + GRP.y0) - 14, dn = s.bot4 + GRP.y0 - cy - 14;
    for (const d of s.burst) {
      if (a > d.life) continue;
      const ux = Math.cos(d.a), uy = Math.sin(d.a);
      const tr = Math.min(hw / Math.max(1e-3, Math.abs(ux)), (uy < 0 ? up : dn) / Math.max(1e-3, Math.abs(uy)));   // to the rim
      const t = a + 0.6;
      const x = cx + ux * tr + sh[0] + d.vx * t * (1 - 0.04 * t), y = cy + uy * tr + sh[1] + d.vy * t + 2.6 * t * t;
      const vx = d.vx * (1 - 0.08 * t), vy = d.vy + 5.2 * t, sp = Math.hypot(vx, vy);
      const smear = a < 1 ? Math.min(1.9, 1 + sp * 0.014) : Math.min(1.35, 1 + sp * 0.005);  // the 1-frame motion smear
      const r = d.r * (1 - 0.5 * clamp((a - d.life + 3) / 3));
      if (r <= 0.5) continue;
      g.save(); g.translate(x, y); g.rotate(Math.atan2(vy, vx)); g.scale(smear, 1 / Math.sqrt(smear));
      const gr = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
      gr.addColorStop(0, '#E4FF7A'); gr.addColorStop(0.55, LIME); gr.addColorStop(1, '#A9DA00');      // solid; an inner shade
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 2 * Math.PI); g.fill();
      g.restore();
    }
  },

  // ---------------------------------------------------------------- seek
  seek(tl, ctx) {
    const s = this.s, f = ctx.f, F = s.F, HIT = F.hit;
    const sh = this.shake(f);

    // ---- the message group: it springs up from 220 px below (f141 → settled by f148), sits lower in the frame for the
    // turn and the hit, then steps back up and a little smaller while card 1 flies in (f236–252)
    const rise = f < F.in + 1 ? 1 : 1 - sprF(f - (F.in + 1), 0.5, 1.8);
    const gl = E.inOutCubic(clamp((f - GRP.glide[0]) / (GRP.glide[1] - GRP.glide[0])));
    const gy = lerp(GRP.y0, GRP.y1, gl) + GRP.rise * rise, gs = lerp(1, GRP.s1, gl);
    s.grp.style.transform = `translate(${f2(sh[0])}px, ${f2(sh[1] + gy)}px) scale(${gs.toFixed(5)})`;
    s.grp.style.opacity = clamp((f - (F.in + 1)) / 2).toFixed(3);   // first seen on f142 (the reminder has flown off)

    this.drawLiquid(f);
    this.drawBurst(f);

    // ---- the bubble: centred; grown BEFORE its content (see mount); on the hit it holds the wordmark, on f227 the pill
    const pop = lerp(0.72, 1, E.outBack(clamp((f - (F.in + 1)) / 5), 2.0));
    const step = (steps, sp) => { let v = 0; for (let i = 0; i < steps.length; i++) { const [fs, w] = steps[i], prev = i ? steps[i - 1][1] : 0; v += (w - prev) * (i ? sp(f - fs) : 1); } return v; };
    const W = step(s.wSteps, n => sprF(n, 0.45, 2.2));              // a small overshoot: the rim stays inside x 64–1016
    let bot = step(s.hSteps, n => sprF(n, 0.5, 2.6));
    const post = f >= HIT ? sprF(f - HIT + 1, 0.6, 1.8) : 0;       // the lock-up layout (rows lift, bubble grows): fast,
                                                                   // so the wordmark sits on ink from its first frame
    const top = lerp(B.top0, B.top1, post);
    bot = lerp(bot, s.bot4, post) + (s.bot5 - s.bot4) * (f >= F.chipIn - 2 ? sprF(f - (F.chipIn - 2), 0.55, 2.2) : 0);
    const trem = f >= HIT - 5 && f < HIT ? [Math.sin(f * 2.9) * 1.8, Math.cos(f * 3.7) * 1.4] : [0, 0];
    const breathe = 1 + 0.012 * Math.sin((f - F.in) / 9) * clamp((f - (HIT + 14)) / 10);   // alive on the lime field
    const bx = 540 - W / 2 + trem[0], by = top + trem[1], Hh = bot - top;
    const jb = f - HIT, jelly = jb >= 0 ? Math.exp(-jb / 3.2) * Math.sin(jb * 0.95 + 0.25) : 0;
    const sx = (1 + 0.04 * jelly) * breathe, sy = (1 - 0.055 * jelly) * breathe;
    const cx0 = 540, cy0 = by + Hh / 2;
    const pk = Math.max(0.001, pop);
    s.bG.setAttribute('transform', `translate(${f2(cx0)} ${f2(by)}) scale(${pk.toFixed(4)}) translate(${f2(-cx0)} ${f2(-by)}) ` +
      `translate(${f2(cx0)} ${f2(cy0)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${f2(-cx0)} ${f2(-cy0)})`);
    const d = bubblePath(bx, by, W, Hh, B.r, B.rTail);
    s.bBody.setAttribute('d', d); s.bGlow.setAttribute('d', d);
    const onLime = clamp((f - (HIT + 2)) / 6);
    s.bBody.setAttribute('stroke-opacity', (1 - onLime).toFixed(3)); s.bGlow.setAttribute('stroke-opacity', (0.13 * (1 - onLime)).toFixed(3));
    s.bShadow.style.display = onLime > 0 ? 'inline' : 'none';
    if (onLime > 0) { s.bShadow.setAttribute('d', bubblePath(bx, by + 22, W, Hh, B.r, B.rTail)); s.bShadow.setAttribute('opacity', onLime.toFixed(3)); s.bShadow.setAttribute('transform', s.bG.getAttribute('transform')); }

    // the text layer: clipped to the bubble's own rect (a safety: the bubble is always grown before a word shows)
    const bs = pk * breathe;
    const cl = { t: by, l: cx0 - (W / 2) * bs, r: cx0 + (W / 2) * bs, b: by + Hh * bs };
    s.rowBox.style.clipPath = `inset(${f2(cl.t)}px ${f2(1080 - cl.r)}px ${f2(1920 - cl.b)}px ${f2(cl.l)}px round ${B.r}px)`;
    for (const r of [s.r1, s.r2]) r.el.style.transform = `translateY(${f2(-B.lift * post)}px)`;
    const word = sp => {                                           // a whole word pops (first seen at land-2, full on land)
      const k = clamp((f - (sp.land - 3)) / 3);
      const sc = k <= 0 ? 0.6 : lerp(0.6, 1, E.outBack(k, 3.0));
      K.css(sp.el, { opacity: clamp(k * 2.5).toFixed(3), transform: `translateY(${f2((1 - E.outCubic(k)) * 16)}px) scale(${sc.toFixed(4)})` });
    };
    s.r1.spans.forEach(word); s.r2.spans.forEach(word);
    // sender «طشّ» (top-right inside the bubble), gone as the wordmark arrives
    const sIn = clamp((f - (F.in + 2)) / 3), sOut = clamp((f - HIT) / 4);
    K.css(s.sender, { display: sOut >= 1 ? 'none' : 'block', opacity: (sIn * (1 - sOut)).toFixed(3),
      left: f2(bx + W - B.padX - s.senderW) + 'px', top: f2(by + 14) + 'px' });

    // typing indicator «•••»: row 1 (f142–146, gone one frame before «المرة» shows) and row 2 (f161–181)
    const typing = (dots, y, f0, f1, amp) => dots.forEach((c, i) => {
      const on = f >= f0 && f <= f1;
      const ap = on ? sprF(f - f0 + 1 - i * 0.7, 0.6, 2.0) : 0;
      const bob = K.typing((f - f0) / 30, i, { period: 0.6, amp, phase: 0.14 });
      c.setAttribute('cx', f2(540 + (1 - i) * 40)); c.setAttribute('cy', f2(y + bob));
      c.setAttribute('r', f2(on ? 14 * Math.max(0, ap) : 0));
    });
    typing(s.tDots, B.y1, F.in + 2, F.typOut - 1, 12);
    typing(s.tDots2, B.y2, F.typ2[0], F.typ2[1], 12);

    // ---- the dots: typing on row 3 from f189 (inside the grown bubble), still from «على», swelling on the riser; on
    // the hit they punch and stay: they ARE the wordmark's dots
    s.dots.forEach((c, i) => {
      const D = s.logoDots[i];
      const ap = sprF(f - (F.dots3 + i * 1.5), 0.6, 2.4);
      const bobbing = f < F.dotsLand ? 1 : 1 - clamp((f - F.dotsLand) / 3);
      const bob = K.typing((f - F.dots3) / 30, i, { period: 0.6, amp: 11, phase: 0.14 }) * bobbing;
      const swell = 1 + 0.32 * E.inCubic(clamp((f - F.dotsLand) / (HIT - F.dotsLand)));
      let r = 15 * Math.max(0, ap) * swell, y = D.y + bob, rx = 1, ry = 1;
      if (f >= HIT) {
        const b = f - HIT, q = Math.exp(-b / 2.2) * Math.cos(b * 1.25);
        // (fix round 2) a punch that never merges the three dots into a bar (diameter stays under their spacing)
        r = D.r * (1 + 0.14 * Math.exp(-b / 1.6)); rx = 1 + 0.03 * q; ry = 1 - 0.2 * q; y = D.y;
      }
      c.setAttribute('cx', f2(D.x)); c.setAttribute('cy', f2(y));
      c.setAttribute('r', f2(f < F.dots3 ? 0 : r));
      c.setAttribute('transform', rx !== 1 ? `translate(${f2(D.x)} ${f2(y)}) scale(${rx.toFixed(4)} ${ry.toFixed(4)}) translate(${f2(-D.x)} ${f2(-y)})` : '');
    });

    // ---- the wordmark body slams in around the dots (never dotless), the shadda drops, the full stop lands
    const wk = f >= HIT + 1 ? 1 : 0;                                // the body lands around the dots on f216 (never dotless:
                                                                   // on the hit frame the dots punch and fire the burst)
    s.wmBody.style.display = f >= HIT ? 'inline' : 'none';
    const slam = f < HIT ? 0 : sprF(f - HIT + 0.6, 0.55, 2.4);
    const ss = lerp(1.18, 1, slam);
    const D1 = L.dots()[1];
    s.wmBody.setAttribute('transform', `translate(${D1.cx} ${D1.cy}) scale(${ss.toFixed(4)}) translate(${-D1.cx} ${-D1.cy})`);
    s.wmBody.setAttribute('opacity', wk.toFixed(3));
    const SH = HIT + 4, sk = f < SH ? 0 : sprF(f - SH, 0.6, 2.4);
    s.shadda.setAttribute('transform', `${s.shaddaBase} translate(0 ${f2((1 - sk) * -70)})`);   // a short drop: it never crosses row 2
    s.shadda.setAttribute('opacity', f < SH ? '0' : clamp((f - SH) / 2).toFixed(2));
    const PF = HIT + 7, pk2 = f < PF ? 0 : E.outBack(clamp((f - PF) / 3), 2.6);
    s.period.setAttribute('opacity', f >= PF ? '1' : '0');
    const pcx = +s.period.getAttribute('cx'), pcy = +s.period.getAttribute('cy');
    s.period.setAttribute('transform', `translate(${pcx} ${pcy}) scale(${Math.max(0.001, pk2).toFixed(4)}) translate(${-pcx} ${-pcy})`);
    // the wordmark rides with the bubble's breathing (about the bubble centre)
    s.wm.setAttribute('transform', `translate(${f2(cx0)} ${f2(cy0)}) scale(${breathe.toFixed(5)}) translate(${f2(-cx0)} ${f2(-cy0)}) ` +
      `translate(${f2(s.wmX)} ${f2(s.wmY)}) scale(${s.wmS.toFixed(5)})`);

    // ---- «للطلاب»: the lock-up pill snaps under the wordmark (L3.3, beat 13), inside the bubble
    const ck = clamp((f - F.chipIn) / (F.chipLand - F.chipIn));
    s.chip.style.display = f >= F.chipIn ? 'inline-flex' : 'none';
    K.css(s.chip, { opacity: clamp(ck * 3).toFixed(3),
      transform: `translateY(${f2((breathe - 1) * (s.chipCy - cy0))}px) rotate(${f2(lerp(-14, -3, E.outBack(ck, 2.4)))}deg) scale(${lerp(0.4, 1, E.outBack(ck, 2.6)).toFixed(4)})` });

    // ---- card 1: a NEW object. It flies up from below the frame (tilted back, turned, rolled) on f238–257 and settles
    // (no overshoot above its rest: the lock-up is right above it) exactly on the parade camera's first view of it (s4 HANDOFF)
    const c0 = F.card0, c1 = F.card1 - 1;
    if (f < c0) s.card.style.display = 'none';
    else {
      s.card.style.display = 'block';
      const u = clamp((f - c0) / (c1 - c0));
      const k = Math.pow(1 - u, 3);                                 // fast up, easing into the hand-off on f257
      const pose = { x: 0, y: 1250 * k, z: -520 * k, rx: 34 * k, ry: -14 * k, rz: -9 * k, s: 1 };
      s.card.style.transform = css3(card1Matrix(s.cues, pose));
      const gl2 = clamp((f - (c1 - 9)) / 11);
      K.css(s.cardSheen, { opacity: gl2 > 0 && gl2 < 1 ? (0.8 * Math.sin(Math.PI * gl2)).toFixed(3) : '0', transform: `translateX(${(gl2 * 330).toFixed(1)}%)` });
    }
  },
};
