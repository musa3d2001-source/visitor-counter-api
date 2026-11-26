// s6_payoff — scene builder D. Presentation day (f683–762).
// The lecture hall (footage/h2, baked by assets/s6_payoff/prep_s6.py): card 1's slide is on the projection screen,
// projected (lifted blacks, a soft hot spot), BEHIND the presenter's hand; the two raised phones show it in their
// viewfinders; its warm light rims the front rows. The plate is cut into two depth planes: the room, and the near rows
// (the three blurred heads closest to us and the seat backs). A slow 2.5D push-in: the room scales 1.03 → 1.14 while the
// near rows scale a few % faster (parallax; the room behind them was filled in, so nothing ghosts), and the camera leans
// in a little more on the chord (f719) while the screen's bloom and the warm spill swell. A faint projector beam with a
// few motes hangs between us and the screen.
// It opens as a MATCH CUT: on f683 the screen sits exactly where s5 leaves its «بعد» slide (screenRectAtStart(), which
// s5 imports), so the cut reads as the same slide going up on the big screen.
// Type: «ويوم التسليم…» (f690) and «خلّ شغلك يسولف عنك.» (f719, the chord) over the dark near heads, never over the
// screen or the presenter. The samples label is main.js's (top right).
import * as K from '../kit.js';

const A = new URL('../assets/s6_payoff/', import.meta.url).href;
const { clamp, lerp, E } = K;
const PW = 1512, PH = 2688, S0 = 1080 / PW;          // plate size; frame px per plate px at z = 1

// (fix round) the room is MIRRORED (assets/s6_payoff/prep_s6.py MIRROR): the presenter stands at the LEFT edge, clear of
// the TikTok/Reels button column; the slide on the screen is comped un-mirrored. Camera x values are mirrored too.
// camera (plate px): start and end of the base push; the chord adds a little more
export const CAM = { z0: 1.03, cx0: 757, cy0: 1370, z1: 1.105, cx1: 720, cy1: 1408, zChord: 0.035, cxChord: -8, cyChord: 14,
  nearExtra: 0.045 };
// the screen's inner quad (plate px, s6.json → screen_quad, mirrored), kept here so s5 can match its last frame to it
const QUAD = [[184.62, 773.0], [1331.88, 773.0], [1330.52, 1428.56], [182.5, 1426.42]];

const toFrame = ([x, y], z, cx, cy) => [540 + (x - cx) * S0 * z, 960 + (y - cy) * S0 * z];
/** where the projection screen is on the scene's first frame (frame px): {x, y, w, h} — s5's match-cut target */
export function screenRectAtStart() {
  const p = QUAD.map(q => toFrame(q, CAM.z0, CAM.cx0, CAM.cy0));
  const x0 = (p[0][0] + p[3][0]) / 2, x1 = (p[1][0] + p[2][0]) / 2, y0 = (p[0][1] + p[1][1]) / 2, y1 = (p[2][1] + p[3][1]) / 2;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const kick = (f, at, w) => { const x = (f - at) / w; return x <= 0 ? 0 : x * Math.exp(1 - x); };   // 0 → 1 (at+w) → 0

export default {
  id: 's6_payoff',

  async mount(root, ctx) {
    const s = this.s = {};
    await ctx.loadCSS(new URL('./s6_payoff.css', import.meta.url));
    root.classList.add('s6-root');
    s.J = await K.json(A + 's6.json');
    s.F = { in: ctx.scene.in, out: ctx.scene.out, chord: ctx.cues.key.chord };

    const img = (src, cls) => { const i = K.el(root, 'img', 's6-img ' + (cls || '')); i.src = A + src; i.decoding = 'sync'; return i; };
    s.room = img('room.jpg');
    s.glow = img('glow.jpg', 's6-glow');
    // the beam (plate space, moves with the room)
    const NS = 'http://www.w3.org/2000/svg';
    s.beam = document.createElementNS(NS, 'svg');
    s.beam.setAttribute('class', 's6-img s6-beam'); s.beam.setAttribute('width', PW); s.beam.setAttribute('height', PH);
    s.beam.setAttribute('viewBox', `0 0 ${PW} ${PH}`);
    const src = [772, -700];                                       // the projector, high behind the camera (mirrored)
    const q = s.J.screen_quad;
    s.beam.innerHTML = `<defs><linearGradient id="s6-bg" gradientUnits="userSpaceOnUse" x1="${src[0]}" y1="0" x2="${src[0]}" y2="1100">
        <stop offset="0" stop-color="#ffd7a8" stop-opacity="0.55"/><stop offset="0.55" stop-color="#ffc58a" stop-opacity="0.22"/>
        <stop offset="1" stop-color="#ffb070" stop-opacity="0.06"/></linearGradient>
        <filter id="s6-bb" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="26"/></filter></defs>
      <path fill="url(#s6-bg)" filter="url(#s6-bb)" d="M${src[0]},${src[1]} L${q[1][0]},${q[1][1]} L${q[0][0]},${q[0][1]} Z"/>`;
    root.appendChild(s.beam);
    // motes in the beam (plate px, deterministic)
    const r = K.rng(683);
    s.motes = Array.from({ length: 16 }, () => {
      const m = { el: K.el(root, 'div', 's6-mote'), u: r(), v: 0.25 + r() * 0.7, ph: r() * 6.28, sp: 0.4 + r() * 0.8, sz: 0.5 + r() * 0.9 };
      return m;
    });
    s.near = img('near.png');
    s.swell = K.el(root, 'div', 's6-swell');
    s.vig = K.el(root, 'div', 's6-vig');
    s.grain = K.el(root, 'div', 's6-grain', { backgroundImage: `url(${A}grain.png)` });
    await Promise.all([K.img(A + 'room.jpg'), K.img(A + 'glow.jpg'), K.img(A + 'near.png'), K.img(A + 'grain.png')]);

    // type over the dark rows, never over the screen or the presenter. Fix round: ~95 px higher (ink ends ~y 1480, above
    // the platform caption rows) and right-aligned at x 920 (RTL: «خلّ», the line's first word, is on the right, clear
    // of the TikTok/Reels button column), at most 825 px wide
    const sh = '0 3px 6px rgba(0,0,0,0.55), 0 8px 34px rgba(0,0,0,0.75)';
    s.l1 = K.kinetic(root, ctx.ev('C1.1'), { x: 920, y: 1310, anchor: 'right', size: 72, weight: 700, color: K.C.paper, style: 'rise', dur: 2,
      exit: 'cut', shadow: sh });
    s.l2 = K.kinetic(root, ctx.ev('C1.2'), { x: 920, y: 1430, anchor: 'right', size: 96, maxWidth: 825, weight: 800, color: K.C.paper, style: 'rise', dur: 4,
      exit: 'cut', shadow: sh, colors: { 2: K.C.lime } });
  },

  seek(tl, ctx) {
    const s = this.s, f = ctx.f, n = s.F.out - s.F.in - 1;
    const p = clamp((f - s.F.in) / n);
    // base push: already moving on the cut (it continues s5's slow push), easing out toward the end card
    const pb = 1 - Math.pow(1 - p, 1.6);
    // the lean-in on the chord
    const pc = E.inOutSine(clamp((f - s.F.chord + 2) / 34));
    const z = lerp(CAM.z0, CAM.z1, pb) + CAM.zChord * pc;
    const cx = lerp(CAM.cx0, CAM.cx1, pb) + CAM.cxChord * pc, cy = lerp(CAM.cy0, CAM.cy1, pb) + CAM.cyChord * pc;
    const place = (el, px, py, scale) => {          // a plate-space element whose (0,0) is at plate (px, py)
      const [fx, fy] = toFrame([px, py], z * scale.zMul, cx, cy);
      el.style.transform = `translate(${fx.toFixed(2)}px, ${fy.toFixed(2)}px) scale(${(S0 * z * scale.zMul * scale.pix).toFixed(6)})`;
    };
    place(s.room, 0, 0, { zMul: 1, pix: 1 });
    place(s.glow, 0, 0, { zMul: 1, pix: 2 });               // half-res bloom
    place(s.beam, 0, 0, { zMul: 1, pix: 1 });
    // near rows: a little faster (parallax), about the frame centre
    const zn = 1 + CAM.nearExtra * (0.15 + 0.85 * pb) + 0.012 * pc;
    place(s.near, 0, s.J.near_top, { zMul: zn, pix: 1 });

    // light: bloom and warm spill swell on the chord
    const sw = kick(f, s.F.chord - 1, 9) * 0.85 + 0.35 * pc;
    s.glow.style.opacity = (0.62 + 0.38 * Math.min(1, sw)).toFixed(3);
    s.swell.style.opacity = (0.16 + 0.42 * Math.min(1, sw)).toFixed(3);
    s.beam.style.opacity = (0.55 + 0.25 * Math.min(1, sw)).toFixed(3);

    // motes: drift slowly through the beam, between the projector and the screen
    const t = ctx.t;
    for (const m of s.motes) {
      const v = (m.v + 0.018 * t * m.sp) % 1;                // along the beam (0 at the top of the frame, 1 at the screen)
      const py = lerp(380, 1180, v) + 18 * Math.sin(t * 0.9 * m.sp + m.ph);
      const half = lerp(560, 600, v);
      const px = 757 + (m.u * 2 - 1) * half * 0.9 + 22 * Math.sin(t * 0.6 + m.ph * 2);
      const [fx, fy] = toFrame([px, py], z, cx, cy);
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.3 * m.sp + m.ph));
      m.el.style.transform = `translate(${fx.toFixed(1)}px, ${fy.toFixed(1)}px) scale(${(m.sz * z).toFixed(3)})`;
      m.el.style.opacity = (tw * 0.55 * (0.6 + 0.4 * Math.min(1, sw))).toFixed(3);
    }
    // grain: a new offset every frame (deterministic)
    const g = K.rng(1000 + f);
    s.grain.style.transform = `translate(${Math.floor(g() * 64)}px, ${Math.floor(g() * 64)}px)`;

    s.l1.render(ctx.t);
    s.l2.render(ctx.t);
  },
};
