// s5_details — scene builder D. Craft up close (f517–683), two shots cut on the beat.
//
// A · «حتى الهوامش… / نضبّطها.» (f517–588). A hard cut from the parade's dark fan into a macro on the report's contents
// page (samples/report-02-contents.png, lifted apart by assets/s5_details/prep_s5.py): the page lies under a warm lamp,
// tilted away, and the camera pushes in fast from the whole page to its right margin. The 13 table-of-contents rows sit
// slightly out of line (numbers and titles off their columns, no dotted leaders) and the headline «حتى الهوامش…» is
// crooked too. On «الهوامش…» (f530) two lime guides draw down the page (the right margin and the title column), the
// margin band tints and a dimension marks it «١٫٧» (the real margin: 100 of 1240 px on an A4 page = 1.7 cm). On
// «نضبّطها.» (f553, the SNAP) guides, rows and headline lock onto the margin in one hit: a camera punch, a flash along
// the guides, a tick on every row, and the dotted leaders run in right→left. The headline is set right-aligned ON the
// margin guide (computed from the same camera every frame). In the breath before the rule line the optional callout
// «فهرس تلقائي» (f573–588) names what just happened to the page.
// B · THE RULE LINE (f589–682), hard cut on the beat: ONE slide, before/after. «المعلومة منك…» over the plain default
// slide (samples/before-slide.png, «قبل» on a tab at its top edge); on the bar line f618 a lime
// handle swipes right→left and reveals the designed slide (samples/deck-uni-01-title.png, «بعد»); «والترتيب والتصميم
// علينا.» lands word by word. The light behind the card turns from cold to the slide's own orange. The card is placed
// and pushed in slowly so that on f682 it sits EXACTLY where s6's projection screen is on f683 (s6 exports the rect):
// the cut to the lecture hall is a match cut, the same slide going up on the big screen.
import * as K from '../kit.js';
import { screenRectAtStart } from './s6_payoff.js';

const A = new URL('../assets/s5_details/', import.meta.url).href;
const { clamp, lerp, E } = K;
const PERSP = 1500, DEG = Math.PI / 180;
const GOFF = 3.5;          // the guides are drawn 3.5 page px right of the glyph edges, so the text TOUCHES them
const kick = (f, at, w = 3) => { const x = (f - at) / w; return x <= 0 ? 0 : x * Math.exp(1 - x); };
const damp = (f, at, per = 5, tau = 3.2) => (f < at ? 0 : Math.sin(Math.PI * (f - at) / per) * Math.exp(-(f - at) / tau));

// ---------------------------------------------------------------- A: the camera on the page (page px, degrees)
const CAMK = [
  { f: 517, s: 0.86, cx: 650, cy: 850, tilt: 17, rz: -2.6 },
  { f: 553, s: 1.30, cx: 906, cy: 712, tilt: 11, rz: -0.8 },     // (fix round) cx +34: the margin guide, and the headline
  { f: 589, s: 1.37, cx: 918, cy: 722, tilt: 10, rz: -0.5 },     // set on it, sit at x <= 920 (clear of the button column)
];
function cam(f) {
  const [a, b, c] = CAMK;
  let k;
  if (f <= b.f) {                                   // the push: fast off the cut, easing into the snap
    const u = E.outCubic(clamp((f - a.f) / (b.f - a.f)));
    k = Object.fromEntries(Object.keys(a).map(n => [n, lerp(a[n], b[n], u)]));
  } else {                                          // after the snap: a slow drift
    const u = clamp((f - b.f) / (c.f - b.f));
    k = Object.fromEntries(Object.keys(a).map(n => [n, lerp(b[n], c[n], u)]));
  }
  k.s *= 1 + 0.035 * kick(f, 553, 2.4);            // the punch on the snap
  return k;
}
const camCSS = k => `translate3d(540px, 960px, 0) rotateX(${k.tilt.toFixed(3)}deg) rotateZ(${k.rz.toFixed(3)}deg) scale(${k.s.toFixed(5)}) translate(${(-k.cx).toFixed(2)}px, ${(-k.cy).toFixed(2)}px)`;
/** page px → frame px through the same transform the browser applies (perspective PERSP about 540,960) */
function proj(k, x, y) {
  const vx = (x - k.cx) * k.s, vy = (y - k.cy) * k.s;
  const cz = Math.cos(k.rz * DEG), sz = Math.sin(k.rz * DEG);
  const x1 = vx * cz - vy * sz, y1 = vx * sz + vy * cz;
  const ct = Math.cos(k.tilt * DEG), st = Math.sin(k.tilt * DEG);
  const y2 = y1 * ct, z2 = y1 * st;
  const w = PERSP / (PERSP - z2);
  return [540 + x1 * w, 960 + y2 * w];
}
/** frame x of the page line x = px at frame height Y */
function lineXAt(k, px, Y) {
  const [ax, ay] = proj(k, px, 0), [bx, by] = proj(k, px, 1754);
  return ax + (bx - ax) * (Y - ay) / (by - ay);
}

export default {
  id: 's5_details',

  async mount(root, ctx) {
    const s = this.s = {};
    await ctx.loadCSS(new URL('./s5_details.css', import.meta.url));
    root.classList.add('s5-root');
    const key = ctx.cues.key;
    s.F = { in: ctx.scene.in, out: ctx.scene.out, snap: key.snap, rule: key.rule, swipe: key.swipe };
    const M = s.M = await K.json(A + 'rows.json');
    const imgs = [];
    const im = (parent, src, cls, st = {}) => { const i = K.el(parent, 'img', cls, st); i.src = A + src; i.decoding = 'sync'; imgs.push(K.img(A + src)); return i; };

    // ============================================================ A
    const a = s.a = K.el(root, 'div', 's5-part');
    K.el(a, 'div', 's5-desk');
    const persp = K.el(a, 'div', 's5-persp');
    s.cam = K.el(persp, 'div', 's5-cam');
    const page = K.el(s.cam, 'div', 's5-page');
    im(page, 'page_clean.jpg', 'plate');
    // the rows, in four parts each, with their out-of-line offsets (deterministic)
    const r = K.rng(517);
    const G = M.guides;
    s.rows = M.rows.map((row, i) => {
      const parts = {};
      for (const [name, [x, y, w, h]] of Object.entries(row.parts)) {
        const e = im(page, `row${i}_${name}.png`, 's5-pc', { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
        parts[name] = { el: e, x, y, w, h };
      }
      const big = !!parts.num;
      return {
        parts, i, cy: (row.band[0] + row.band[1]) / 2, big,
        mess: {
          title: { dx: -30 - r() * 80 + (i % 3 === 1 ? 40 : 0), dy: (r() - 0.5) * 12, rot: (r() - 0.5) * 4.2 },
          num: { dx: -16 - r() * 46, dy: (r() - 0.5) * 9, rot: (r() - 0.5) * 5 },
          pg: { dx: (r() - 0.5) * 40, dy: (r() - 0.5) * 6, rot: 0 },
        },
        ph: r() * 6.28,
      };
    });
    K.el(page, 'div', 's5-lamp');
    K.el(page, 'div', 's5-grainp', { backgroundImage: `url(${A}grain.png)` });
    K.el(a, 'div', 's5-fall');
    // the guide plane (same camera)
    const gp = K.el(a, 'div', 's5-persp');
    s.gcam = K.el(gp, 'div', 's5-cam');
    // the right-margin guide runs the page's height (the headline is aligned on it); both fade at their ends.
    const gv = (x, top, h, fadeIn, fadeOut) => {
      const m = `linear-gradient(180deg, rgba(0,0,0,0) 0px, #000 ${fadeIn}px, #000 ${h - fadeOut}px, rgba(0,0,0,0) ${h}px)`;
      return K.el(s.gcam, 'div', 's5-g s5-gv', { left: x + 'px', top: top + 'px', height: h + 'px', transformOrigin: '50% 0',
        webkitMaskImage: m, maskImage: m });
    };
    // the title guide ends above the headline (which sits over page y ≈ 1000–1200 on the snap), so it never crosses it
    s.gRight = gv(G.right + GOFF, -60, 1900, 170, 260); s.gTitle = gv(G.title + GOFF, -60, 1050, 170, 100);
    s.band = K.el(s.gcam, 'div', 's5-g s5-band', { left: G.right + 'px', top: '0px', width: (1240 - G.right) + 'px', height: '1754px' });
    s.dimY = 452;
    s.dim = K.el(s.gcam, 'div', 's5-g s5-dim', { left: G.right + 'px', top: s.dimY + 'px', width: (1240 - G.right) + 'px', transformOrigin: '100% 50%' });
    s.mval = K.el(s.gcam, 'div', 's5-g s5-mval', {}, K.arDigits('1') + '٫' + K.arDigits('7'));
    s.mval.style.left = '0px'; s.mval.style.top = '0px';
    s.mw = s.mval.offsetWidth; s.mh = s.mval.offsetHeight;
    s.ticks = [];
    for (const row of s.rows) {
      if (row.cy < 960) s.ticks.push({ el: K.el(s.gcam, 'div', 's5-g s5-tick', { left: (G.title + 16) + 'px', top: row.cy + 'px' }), i: row.i });
      if (row.big) s.ticks.push({ el: K.el(s.gcam, 'div', 's5-g s5-tick', { left: (G.right + 16) + 'px', top: row.cy + 'px' }), i: row.i });
    }

    // the headline, right-aligned ON the margin guide (wrappers carry the per-frame alignment)
    const k553 = cam(s.F.snap);
    s.Y1 = 1276; s.Y2 = 1416;                                     // (fix round) 110 px higher: ink ends ~y 1490
    s.X1 = lineXAt(k553, G.right + GOFF - 2, s.Y1); s.X2 = lineXAt(k553, G.right + GOFF - 2, s.Y2);
    const wrap = () => K.el(a, 'div', 's5-gwrap', { width: '1080px', height: '1920px' });
    s.w1 = wrap(); s.w2 = wrap();
    const sh = '0 3px 8px rgba(0,0,0,0.5), 0 10px 36px rgba(0,0,0,0.6)';
    s.d1 = K.kinetic(s.w1, ctx.ev('D1.1'), { x: s.X1, y: s.Y1, anchor: 'right', size: 86, weight: 700, color: K.C.paper,
      style: 'rise', dur: 4, exit: 'lift', exitDur: 6, shadow: sh });
    s.d2 = K.kinetic(s.w2, ctx.ev('D1.2'), { x: s.X2, y: s.Y2, anchor: 'right', size: 128, weight: 800, color: K.C.lime,
      style: 'slam', dur: 4, exit: 'lift', exitDur: 6, shadow: sh });
    s.w1.style.transformOrigin = `${s.X1}px ${s.Y1}px`;
    // the optional callout (the breath before the rule line)
    const toc = ctx.ev('ui.callout_toc');
    s.toc = { ev: toc, chip: K.chip(a, { text: toc.text, theme: 'lime', size: 40, x: 250, y: 742, anchor: 'center' }) };   // x 234 → 250 (lead): its pop overshoot touched x 63

    // ============================================================ B
    const b = s.b = K.el(root, 'div', 's5-part');
    K.el(b, 'div', 's5-bbg');
    s.cold = K.el(b, 'div', 's5-spot cold'); s.warm = K.el(b, 'div', 's5-spot warm');
    const R = s.R = screenRectAtStart();
    s.card = K.el(b, 'div', 's5-card', { left: R.x.toFixed(2) + 'px', top: R.y.toFixed(2) + 'px', width: R.w.toFixed(2) + 'px', height: R.h.toFixed(2) + 'px' });
    const before = K.el(s.card, 'div', 'lay');
    im(before, 'before.jpg');
    // (no text caret on the plain title: a thin bar at the left end of «مسار» reads as an alef, «مسارا»)
    s.after = K.el(s.card, 'div', 'lay after');
    im(s.after, 'after.jpg');
    s.sheen = K.el(s.after, 'div', 's5-sheen');
    K.el(s.card, 'div', 'rim');
    s.handle = K.el(s.card, 'div', 's5-handle');
    K.el(s.handle, 'div', 'bar');
    s.knob = K.el(s.handle, 'div', 'knob');
    K.el(s.knob, 'i', 'l'); K.el(s.knob, 'i', 'r');
    // «قبل» / «بعد»: tabs on the card's top edge (right corner), swapped on their cue frames; outside the slide so they
    // never cover its content
    s.lBefore = K.chip(s.card, { text: ctx.ev('ui.before').text, theme: 'ink', size: 34, x: R.w - 20, y: -12, anchor: 'right' });
    s.lAfter = K.chip(s.card, { text: ctx.ev('ui.after').text, theme: 'lime', size: 34, x: R.w - 20, y: -12, anchor: 'right' });
    // the rule line: big and calm under the card, nothing busy behind it
    // (fix round) both rows right-aligned at x 920 (RTL: their first word is on the right, clear of the TikTok/Reels
    // button column), at most 825 px wide
    const sh2 = '0 6px 30px rgba(0,0,0,0.55)';
    s.r1 = K.kinetic(b, ctx.ev('R1.1'), { x: 920, y: 1166, anchor: 'right', size: 86, maxWidth: 825, weight: 800, color: K.C.paper, style: 'rise', dur: 4, exit: 'cut', shadow: sh2 });
    s.r2 = K.kinetic(b, ctx.ev('R1.2'), { x: 920, y: 1296, anchor: 'right', size: 86, maxWidth: 825, weight: 800, color: K.C.paper, style: 'rise', dur: 4, exit: 'cut',
      shadow: sh2, colors: { 2: K.C.lime } });

    await Promise.all(imgs);
  },

  seek(tl, ctx) {
    const s = this.s, f = ctx.f, F = s.F;
    const inA = f < F.rule;
    s.a.style.display = inA ? 'block' : 'none';
    s.b.style.display = inA ? 'none' : 'block';
    if (inA) this.seekA(f, ctx); else this.seekB(f, ctx);
  },

  // ------------------------------------------------------------------ A
  seekA(f, ctx) {
    const s = this.s, F = s.F, G = s.M.guides, snap = F.snap;
    const k = cam(f);
    const css = camCSS(k);
    s.cam.style.transform = css; s.gcam.style.transform = css;

    // rows: out of line until the snap; a magnetic pull in the last 4 frames, a small overshoot after
    const pull = r => {                                           // 1 = fully out of line, 0 = on the guides
      if (f >= snap) return -0.10 * damp(f, snap, 4.5, 2.6);
      const start = snap - 4 - r.i * 0.18;
      return f < start ? 1 : 1 - E.inCubic(clamp((f - start) / (snap - start)));
    };
    for (const r of s.rows) {
      const p = pull(r);
      const wob = f < snap ? Math.sin(f * 0.21 + r.ph) * 2.2 : 0;
      for (const [name, part] of Object.entries(r.parts)) {
        if (name === 'lead') {                                    // the dotted leaders run in after the snap (right→left)
          const u = E.outCubic(clamp((f - snap - r.i * 0.45) / 8));
          part.el.style.clipPath = `inset(-4px 0 -4px ${((1 - u) * 100).toFixed(2)}%)`;
          part.el.style.opacity = u > 0 ? '1' : '0';
          continue;
        }
        const m = r.mess[name];
        part.el.style.transform = `translate(${(m.dx * p + wob).toFixed(2)}px, ${(m.dy * p).toFixed(2)}px) rotate(${(m.rot * Math.max(0, p)).toFixed(3)}deg)`;
      }
    }

    // guides: draw down on «الهوامش…», sit a little off, lock on the snap with a flash
    const dIn = (a0) => E.outCubic(clamp((f - a0) / 6));
    const gp = f >= snap ? -0.12 * damp(f, snap, 4.5, 2.6) : 1 - E.inCubic(clamp((f - (snap - 4)) / 4));
    const flash = kick(f, snap, 2) * 1.0;
    const gstyle = (el, d, off) => {
      el.style.transform = `translateX(${(off * gp).toFixed(2)}px) scaleY(${d.toFixed(4)})`;
      el.style.opacity = d > 0 ? '1' : '0';
      el.style.filter = flash > 0.02 ? `brightness(${(1 + 0.9 * flash).toFixed(3)})` : 'none';
    };
    const dR = dIn(526), dT = dIn(529);
    gstyle(s.gRight, dR, 16); gstyle(s.gTitle, dT, -14);
    const gx = G.right + 16 * gp;                                 // the right guide, where it is now
    const bandIn = E.outCubic(clamp((f - 532) / 5));
    s.band.style.transform = `translateX(${(16 * gp).toFixed(2)}px) scaleX(${((1240 - gx) / (1240 - G.right)).toFixed(4)})`;
    s.band.style.transformOrigin = '100% 0';
    s.band.style.opacity = (bandIn * (0.75 + 0.5 * flash)).toFixed(3);
    // the dimension (page edge ↔ right margin) and its value
    const dimIn = E.outCubic(clamp((f - 533) / 5));
    s.dim.style.transform = `scaleX(${(dimIn * (1240 - gx) / (1240 - G.right)).toFixed(4)})`;
    s.dim.style.opacity = dimIn > 0 ? '1' : '0';
    const mIn = clamp((f - 535) / 5);
    const mx = (gx + 1240) / 2 - s.mw / 2, my = s.dimY - 14 - s.mh;
    s.mval.style.transform = `translate(${mx.toFixed(1)}px, ${my.toFixed(1)}px) scale(${lerp(0.5, 1, E.outBack(mIn, 2)).toFixed(4)})`;
    // (lead, integration) the dimension value «١٫٧» is not a script.json string and reads as a bare number without a
    // unit: the guides, the tinted band and the dimension line carry the margin on their own
    s.mval.style.opacity = '0'; s.mval.style.display = 'none';
    // a tick on every row where it meets a guide (the snap), gone in ~12 frames
    for (const t of s.ticks) {
      const u = f - snap - t.i * 0.25;
      const o = u < 0 ? 0 : clamp(u / 1.5) * (1 - clamp((u - 6) / 7));
      t.el.style.opacity = o.toFixed(3);
      t.el.style.transform = `scale(${lerp(0.4, 1, E.outBack(clamp(u / 3), 2.2)).toFixed(3)})`;
    }

    // the headline, kept right-aligned on the margin guide (which moves with the camera); crooked until the snap
    const dx1 = lineXAt(k, gx + GOFF - 2, s.Y1) - s.X1, dx2 = lineXAt(k, G.right + GOFF - 2, s.Y2) - s.X2;
    const hp = f >= snap ? -0.14 * damp(f, snap, 4.5, 2.6) : 1 - E.inCubic(clamp((f - (snap - 4)) / 4));
    s.w1.style.transform = `translateX(${(dx1 - 40 * hp).toFixed(2)}px) rotate(${(-2.2 * Math.max(0, hp)).toFixed(3)}deg)`;
    s.w2.style.transform = `translateX(${dx2.toFixed(2)}px)`;
    s.d1.render(ctx.t); s.d2.render(ctx.t);
    const T = s.toc.ev;
    s.toc.chip.render(ctx.t, T.in, T.land, T.out);
  },

  // ------------------------------------------------------------------ B
  seekB(f, ctx) {
    const s = this.s, F = s.F, R = s.R;
    // (fix round) one continuous push from 0.92 on the cut to exactly s6's screen rect on the last frame, still moving
    // at the cut, so it carries through the match cut into the hall's own push-in (no locked-off hold)
    const u = clamp((f - F.rule) / (F.out - 1 - F.rule));
    s.card.style.transform = `scale(${lerp(0.92, 1, 0.35 * u + 0.65 * u * u).toFixed(5)})`;

    // the handle: in on «منك…», a small wind-up, the swipe on the bar line, then it leaves
    const sw = F.swipe;
    const wipe = E.outQuart(clamp((f - sw) / 10));
    const wind = f < sw ? E.outCubic(clamp((f - (sw - 7)) / 6)) : 0;
    const hx = R.w * (1 - wipe) + 9 * wind;
    const hin = E.outBack(clamp((f - 603) / 5), 2);
    const hout = clamp((f - (sw + 12)) / 7);
    s.handle.style.transform = `translateX(${hx.toFixed(2)}px)`;
    s.handle.style.opacity = (clamp((f - 603) / 2) * (1 - hout)).toFixed(3);
    s.knob.style.transform = `scale(${(hin * (1 - 0.12 * wind + 0.12 * kick(f, sw, 2))).toFixed(4)})`;
    s.after.style.clipPath = `inset(0 0 0 ${Math.max(0, hx).toFixed(2)}px)`;
    s.after.style.display = hx < R.w - 0.5 ? 'block' : 'none';
    // the light behind turns from cold to the slide's orange with the wipe
    s.cold.style.opacity = (1 - wipe).toFixed(3); s.warm.style.opacity = wipe.toFixed(3);
    // a sheen over the designed slide right after the reveal (right→left)
    const sh = clamp((f - (sw + 8)) / 16);
    s.sheen.style.transform = `translateX(${lerp(R.w * 1.05, -R.w * 0.4, E.inOutCubic(sh)).toFixed(1)}px)`;
    s.sheen.style.opacity = sh > 0 && sh < 1 ? '1' : '0';

    const eb = ctx.ev('ui.before'), ea = ctx.ev('ui.after');
    s.lBefore.render(ctx.t, eb.in, eb.land, eb.out);
    s.lAfter.render(ctx.t, ea.in, ea.land, null);
    s.r1.render(ctx.t); s.r2.render(ctx.t);
  },
};
