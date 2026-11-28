// DOSE — everything drawn over the picture: the spec tag (whole film), the hook lines, the mood widget (orange pill
// battery «المزاج», Arabic-Indic %, one step per dose, low-battery blink in the hook, a pop at ١٠٠٪), the dose chips,
// dose's own line «تعديل المزاج يبدأ من هنا.», the end-card mark (keyed from the logo plate, never redrawn) and info,
// then the TASH tail + spec slate. Arabic is animated per WORD or per line, never split into letters.
// dose's palette (orange #F26A21 / white / ink) for their world; TASH lime only in the tag's dot and the TASH tail.
import { tw, E, clamp, lerp, css } from '/_system/motion/kit.js';
import { createSting } from './sting-short.js';
import { C } from './cues.js';

const EV = C.ev;
export const DC = { orange: '#F26A21', ink: '#1B1511', white: '#FFFFFF', paper: '#F6F0E8' };
const AR = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);

function el(parent, tag, cls, styles = {}, text = null) {
  const e = document.createElement(tag); if (cls) e.className = cls; css(e, styles); if (text != null) e.textContent = text; parent.appendChild(e); return e;
}
/** a centred RTL line of whole-word spans (padding cancelled by negative margins keeps blur/masks off dots and shadda) */
function line(parent, words, { top, size, color, weight = 700, shadow = null }) {
  const box = el(parent, 'div', 'line ar', { top: top + 'px', fontSize: size + 'px', color, fontWeight: String(weight) });
  if (shadow) box.style.textShadow = shadow;
  const spans = words.map((w, i) => {
    const s = el(box, 'span', null, { display: 'inline-block', padding: '0.4em 0.08em', margin: '-0.4em 0', opacity: '0' }, w);
    if (i < words.length - 1) box.appendChild(document.createTextNode(' '));
    return s;
  });
  return { box, spans };
}
/** rise + unblur per word in reading order (RTL), uneven gaps; exit lifts away */
function riseIn(spans, t, tin, tout, { gaps = [0, 0.1, 0.19, 0.27, 0.34], rise = 54, outDur = 0.2 } = {}) {
  spans.forEach((s, i) => {
    const k = tw(t, tin + (gaps[i] ?? i * 0.09), 0.46, E.outCubic), o = tout == null ? 0 : tw(t, tout + i * 0.025, outDur, E.inCubic);
    css(s, { opacity: (clamp(k * 3) * (1 - o)).toFixed(3), transform: `translateY(${((1 - k) * rise - o * 50).toFixed(2)}px)`,
      filter: (k < 1 || o > 0) ? `blur(${((1 - clamp(k * 1.6)) * 8 + o * 6).toFixed(2)}px)` : 'none' });
  });
}
/** cubic Hermite 0→1 with a start slope (so a move can continue the camera's own speed) and a soft landing */
const hermite = (u, m0) => { u = clamp(u); return (u * u * u - 2 * u * u + u) * m0 + (-2 * u * u * u + 3 * u * u); };

export async function makeOverlay(stage, { W, H, LY, poster, signAffine }) {
  const ui = stage.querySelector('#ui');

  // ---- hook lines (big, white, over the grey world)
  const SH = '0 4px 26px rgba(0,0,0,.5), 0 1px 3px rgba(0,0,0,.4)';
  const h1 = line(ui, ['مزاجك', '١٥٪؟'], { top: LY.hook.l1Top, size: LY.hook.size, color: '#FFFFFF', weight: 800, shadow: SH });
  const h2 = line(ui, ['ناقصك', 'دوز.'], { top: LY.hook.l2Top, size: LY.hook.size, color: '#FFFFFF', weight: 800, shadow: SH });

  // ---- the mood widget
  const mwrap = el(ui, 'div', null, { position: 'absolute', left: '540px', top: '0px', width: '0', height: '0' });
  const ring = el(mwrap, 'div', 'ring'); const ring2 = el(mwrap, 'div', 'ring', { borderColor: '#FFFFFF' });
  const meter = el(mwrap, 'div', 'meter');
  el(meter, 'span', 'lbl ar', {}, 'المزاج');
  const bat = el(meter, 'div', 'bat'); el(bat, 'div', 'shell'); el(bat, 'div', 'nub');
  const fill = el(bat, 'div', 'fill'); const sheen = el(fill, 'div', 'sheen');
  const pct = el(meter, 'span', 'pct ar', {}, AR(15) + '٪');
  const FILLW = 206 - 18;                                   // inner width of the battery
  const ST = C.meter;

  // ---- dose chips (white story chips, the dose word in orange): left-aligned under the widget, one shot each
  const chip = (parts, tin, tout, seg, row = 0) => {
    const c = el(ui, 'div', 'chip ar', { left: LY.stack.left + 'px', top: (LY.stack.at[seg] + 48 * LY.stack.s + LY.stack.gap + row * LY.stack.originStep) + 'px' });
    for (const p of parts) { if (typeof p === 'string') c.appendChild(document.createTextNode(p)); else el(c, 'span', 'o', {}, p.o); }
    return { c, tin, tout };
  };
  // v3 (CD: each origin was fully readable for only 0.4-0.6 s): the three origin chips STACK instead of swapping, one
  // row each, landing on their beats and leaving together, so the whole sentence reads at once from 3.4 s
  const chips = [
    chip(['جرعة من ', { o: 'إثيوبيا…' }], EV.origin1, EV.originOut, 'A', 0),
    chip([{ o: '…والسلفادور' }], EV.origin2, EV.originOut, 'A', 1),
    chip([{ o: '…وكولومبيا' }], EV.origin3, EV.originOut, 'A', 2),
    chip(['جرعة ', { o: 'صافية.' }], EV.text2, EV.text2Out, 'B'),
    chip(['جرعة ', { o: 'باردة.' }], EV.text3, EV.text3Out, 'C'),
    chip(['وجرعة ', { o: 'حلا.' }], EV.text4, EV.text4Out, 'D'),
  ];

  // ---- dose's own line, and the end card
  const tag1 = line(ui, ['تعديل', 'المزاج', 'يبدأ', 'من', 'هنا.'], { top: LY.tagline.top, size: LY.tagline.size, color: DC.ink, weight: 700 });
  css(tag1.box, { left: LY.tagline.wallL + 'px', right: LY.tagline.wallR + 'px' });   // v3: on the wall, clear of the tree
  const logo = el(ui, 'img', null, { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0', opacity: '0', willChange: 'transform' });
  logo.src = new URL('./assets/logo.png', import.meta.url).href; await logo.decode();
  const LW = logo.naturalWidth, LH = logo.naturalHeight;
  const info = el(ui, 'div', null, { position: 'absolute', left: '0', right: '0', top: LY.info.top + 'px', textAlign: 'center', opacity: '0' });
  el(info, 'div', 'ar', { fontFamily: 'IBM Plex Sans Arabic', fontWeight: '600', fontSize: '42px', color: DC.ink, lineHeight: '1.4' }, 'سبيشلتي دوز · الجهراء');
  el(info, 'div', null, { fontFamily: 'IBM Plex Sans Arabic', fontWeight: '600', fontSize: '40px', letterSpacing: '.03em', color: DC.ink, direction: 'ltr', marginTop: '4px' }, '@sdosecafe');   // v2: ink (orange on plaster measured 3.3:1)

  // ---- TASH tail: signature + spec slate (never reads as client work)
  const stingRoot = el(ui, 'div', null, { position: 'absolute', inset: '0', display: 'none' });
  const sting = createSting(stingRoot, { width: W, height: H, logoW: LY.sting.logoW, cy: LY.sting.cy, taglineSize: LY.sting.tag });
  const slate = el(ui, 'div', 'slate', { top: LY.slate.top + 'px', opacity: '0' });
  el(slate, 'div', 'sar', {}, 'إعلان تجريبي غير رسمي — مقترح من طشّ لـ سبيشلتي دوز');
  el(slate, 'div', 'mono', {}, 'SPEC AD — NOT COMMISSIONED BY SPECIALTY DOSE');

  // ---- the spec tag: the whole film, bottom-right, above the story reply bar
  const tag = el(ui, 'div', 'tag ar', { zIndex: '5' });
  el(tag, 'i'); el(tag, 'span', null, {}, 'إعلان تجريبي · مقترح من طشّ');
  const tr = tag.getBoundingClientRect();
  css(tag, { left: (W - LY.tag.right - tr.width) + 'px', top: (LY.tag.bottom - tr.height) + 'px' });

  // ---- the end-card lockup move: the mark leaves the wall at the camera's own speed and settles centre-frame
  const decompose = A => ({ s: Math.hypot(A[0], A[3]), r: Math.atan2(A[3], A[0]), cx: A[0] * LW / 2 + A[1] * LH / 2 + A[2], cy: A[3] * LW / 2 + A[4] * LH / 2 + A[5] });
  const compose = ({ s, r, cx, cy }) => { const a = s * Math.cos(r), b = s * Math.sin(r); return [a, -b, cx - (a * LW / 2 - b * LH / 2), b, a, cy - (b * LW / 2 + a * LH / 2)]; };
  const SETTLE = 0.95, P0 = decompose(signAffine(EV.settle)), Pm = decompose(signAffine(EV.settle - 1 / 30));
  const P1 = { s: LY.card.w / LW, r: 0, cx: LY.card.cx, cy: LY.card.cy };
  const V = { s: (P0.s - Pm.s) * 30, r: (P0.r - Pm.r) * 30, cx: (P0.cx - Pm.cx) * 30, cy: (P0.cy - Pm.cy) * 30 };
  function logoAt(t) {
    if (t < EV.settle) return signAffine(t);
    const u = (t - EV.settle) / SETTLE, P = {};
    for (const k of ['s', 'r', 'cx', 'cy']) {
      const d = P1[k] - P0[k], m0 = Math.abs(d) > 1e-6 ? V[k] * SETTLE / d : 0;
      P[k] = P0[k] + d * hermite(u, Math.max(0, Math.min(2.2, m0)));
    }
    P.s *= 1 + 0.014 * clamp((t - EV.settle - SETTLE) / 1.0, 0, 1);         // a breath of life on the hold
    return compose(P);
  }

  // v3: dose's line rides the wall: its box top follows the wall sign's top (the mark's affine while d5b runs), frozen
  // at the settle, when it rides into the lockup
  const markTop = A => Math.min(A[5], A[3] * LW + A[5], A[4] * LH + A[5], A[3] * LW + A[4] * LH + A[5]);
  const tagWallTop = t => markTop(signAffine(Math.min(t, EV.settle))) - LY.tagline.above;

  if (poster) {
    const p = await import('./poster.js');
    return p.makePosterOverlay({ ui, W, H, LY, tagWallTop, h1, h2, mwrap, meter, fill, pct, ring, ring2, chips, tag1, logo, info, stingRoot, slate, tag, AR, FILLW, logoAt });
  }

  // where the widget sits: big in the centre in the hook; from the first dose a left-aligned 0.8x stack, re-placed on
  // each cut (never over the pour); back to centre stage for the ١٠٠٪ peak on the terrace, on the 10.2 cut
  const SEGS = C.footage.segs, EPS = 1e-6;
  const stackPos = id => ({ cx: LY.stack.left + 260 * LY.stack.s, cy: LY.stack.at[id], s: LY.stack.s });
  function meterPos(t) {
    const hook = { cx: 540, cy: LY.meter.hookCy, s: LY.meter.hookS };
    if (t < EV.dose1 - EPS) return hook;
    if (t >= EV.dose5 - EPS) {
      const k = tw(t, EV.dose5, 0.24, x => E.outBack(x, 1.6));
      return { cx: 540, cy: LY.meter.peakCy, s: lerp(1.05, LY.meter.peakS, k) };
    }
    let id = 'A'; for (const g of SEGS) if (g.id !== 'H' && t >= g.t0 - EPS) id = g.id;
    const P = stackPos(id);
    if (id !== 'A') return P;
    const p = tw(t, EV.dose1, 0.42, E.outQuart);                     // the fly from the hook to the first anchor
    return { cx: lerp(hook.cx, P.cx, p), cy: lerp(hook.cy, P.cy, p), s: lerp(hook.s, P.s, p) };
  }

  function meterRender(t) {
    // value: v2 the NUMBER lands on the cue frame (with the pluck), the fill surges from the frame before (it is
    // already 37 % of the way on the cue frame) and the bump hits on the cue frame; v1 counted up for 0.34 s, so every
    // step and the ١٠٠٪ landed ~7 frames after the note
    let i = 0; while (i + 1 < ST.length && t >= ST[i + 1].at - EPS) i++;
    const prev = i > 0 ? ST[i - 1].pct : ST[0].pct, next = ST[i].pct, at = ST[i].at;
    const kf = i > 0 ? tw(t, at - 1 / 30, 0.3, E.outQuart) : 1;
    css(fill, { width: (FILLW * lerp(prev, next, kf) / 100).toFixed(2) + 'px' });
    pct.textContent = AR(next) + '٪';
    // hook: low state, red-orange, solid on frame 0 (the thumbnail), blinking on the two low-battery chirps
    const low = t < EV.dose1 ? 1 : 1 - tw(t, EV.dose1, 0.3);
    let blink = t < EV.blip1 ? 1 : 0.42; for (const b of [EV.blip1, EV.blip2]) if (t >= b) blink = Math.max(blink, Math.exp(-(t - b) * 3.2));
    css(fill, { opacity: (lerp(1, blink, low)).toFixed(3), background: low > 0.5 ? '#E83A1C' : DC.orange });
    const P = meterPos(t); let sc = P.s; const cy = P.cy, dx = P.cx - 540;
    // a bump on every step (on the cue frame); the 100 % pop is a bigger, springier one with two rings
    const u = t - at;
    if (i > 0 && i < ST.length - 1 && u >= -EPS) sc *= 1 + 0.08 * Math.exp(-Math.max(0, u) / 0.1);
    const full = ST[ST.length - 1].at, uf = t - full;
    if (uf >= -EPS) {
      const v = Math.max(0, uf);
      sc *= 1 + 0.14 * Math.cos(2 * Math.PI * 1.9 * v) * Math.exp(-v * 6.5);
      const kr = tw(t, full - 1 / 30, 0.62, E.outCubic), kr2 = tw(t, full + 0.04, 0.62, E.outCubic);
      css(ring, { opacity: (0.9 * (1 - kr)).toFixed(3), transform: `translate(${dx}px, ${cy}px) scale(${lerp(0.7, 2.8, kr).toFixed(3)})` });
      css(ring2, { opacity: (0.8 * (1 - kr2)).toFixed(3), transform: `translate(${dx}px, ${cy}px) scale(${lerp(0.6, 2.3, kr2).toFixed(3)})` });
      const ks = tw(t, full + 0.08, 0.45, E.inOutSine);
      css(sheen, { right: lerp(-80, FILLW + 10, ks).toFixed(1) + 'px', opacity: ks > 0 && ks < 1 ? '1' : '0' });
    } else { css(ring, { opacity: '0' }); css(ring2, { opacity: '0' }); css(sheen, { opacity: '0' }); }
    const ko = tw(t, EV.meterOut, 0.3, E.inCubic);
    css(meter, { transform: `translate(${dx.toFixed(2)}px, ${cy.toFixed(2)}px) scale(${(sc * (1 - 0.35 * ko)).toFixed(4)})`, opacity: (1 - ko).toFixed(3) });
  }

  const api = {
    render(t) {
      // spec tag: always on, never animated
      // hook
      riseIn(h1.spans, t, EV.hook1, EV.hookOut, { gaps: [0, 0.14] });
      riseIn(h2.spans, t, EV.hook2, EV.hook2Out, { gaps: [0, 0.08] });       // v2: «دوز.» lands sooner; gone by 1.79
      meterRender(t);
      // chips: a quick sticker pop in, a fast fade out on the swap / cut
      for (const { c, tin, tout } of chips) {
        const ki = tw(t, tin, 0.32, x => E.outBack(x, 1.5)), ko = tw(t, tout - 0.11, 0.11, E.inCubic);
        const vis = t >= tin && t < tout;
        css(c, { opacity: vis ? (clamp(tw(t, tin, 0.1, E.linear)) * (1 - ko)).toFixed(3) : '0',
          transform: `translateY(${((1 - ki) * 14).toFixed(2)}px) scale(${(LY.stack.s * lerp(0.8, 1, ki) * (1 - 0.06 * ko)).toFixed(4)})` });
      }
      // dose's line: lands on the wall, then rides down with the mark into the lockup
      riseIn(tag1.spans, t, EV.tagline, null, { gaps: [0, 0.09, 0.17, 0.24, 0.3], rise: LY.tagline.rise });
      const kt = tw(t, EV.settle, SETTLE, E.inOutCubic);
      if (t >= EV.tagline - 0.05) css(tag1.box, { top: lerp(tagWallTop(t), LY.tagline.endTop, kt).toFixed(2) + 'px',
        left: lerp(LY.tagline.wallL, 64, kt).toFixed(2) + 'px', right: lerp(LY.tagline.wallR, 64, kt).toFixed(2) + 'px' });
      // the mark: appears exactly over the replaced wall sign at the match, then settles
      if (t >= EV.match) {
        const A = logoAt(t);
        css(logo, { opacity: tw(t, EV.match, 0.08, E.linear).toFixed(3), transform: `matrix(${A[0].toFixed(6)},${A[3].toFixed(6)},${A[1].toFixed(6)},${A[4].toFixed(6)},${A[2].toFixed(3)},${A[5].toFixed(3)})` });
      } else css(logo, { opacity: '0' });
      const ki = tw(t, EV.info, 0.6, E.outCubic);
      css(info, { opacity: ki.toFixed(3), transform: `translateY(${((1 - ki) * 16).toFixed(1)}px)` });
      // TASH tail
      const st = t - EV.sting;
      stingRoot.style.display = t >= EV.dip ? 'block' : 'none';
      const kw = tw(t, EV.dip, EV.sting - EV.dip, E.inOutCubic);          // ink wipes up over the end card, lands on the sting
      stingRoot.style.clipPath = kw < 1 ? `inset(${((1 - kw) * 100).toFixed(2)}% 0 0 0)` : 'none';
      sting.render(Math.max(0, st));
      css(slate, { opacity: tw(t, EV.slate, 0.25, E.outCubic).toFixed(3) });     // v3: 15.30 + 0.25 s (was 15.45 + 0.5)
    },
  };
  api.render(0);
  return api;
}
