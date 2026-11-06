// LAYL — typography layer (client type), CONCEPT AD slate and the TASH signature.
// Arabic is animated per WORD only (mask write-on right→left / rise + unblur) — never split into letters.
import { tw, E, clamp, lerp, css } from '/_system/motion/kit.js';
import { createSting } from './sting-short.js';
import { wordmarkSVG } from '/_system/brand/logo.mjs';
import { T } from './shots.js';

const IVORY = '#EFE3C8', HONEY = '#F2B35A', BRASS = '#C9A15B';

function el(parent, tag, cls, styles = {}, text = null) {
  const e = document.createElement(tag); if (cls) e.className = cls; css(e, styles); if (text != null) e.textContent = text; parent.appendChild(e); return e;
}
/** A centred line built from whole-word spans (the browser's bidi keeps RTL order). */
function line(parent, wordsArr, { top, size, cls = 'layl-ar', color = IVORY, weight = 300 }) {
  const box = el(parent, 'div', cls, { top: top + 'px', fontSize: size + 'px', color, fontWeight: String(weight) });
  const spans = wordsArr.map((w, i) => {
    const s = el(box, 'span', null, { display: 'inline-block', willChange: 'transform, opacity, filter', color: w.color || color, padding: '0.45em 0.06em', margin: '-0.45em 0' }, w.text ?? w);
    if (i < wordsArr.length - 1) box.appendChild(document.createTextNode(' '));
    return s;
  });
  return { box, spans };
}
/** Quick upward exit on ease-in (exits are faster than entries). */
function exitK(t, tout, i) { return tw(t, tout + i * 0.035, 0.28, E.inCubic); }

/** Calm luxury line: a feathered edge travels right→left through each whole word (reads like a pen), slight leftward drift.
 *  The span carries 0.45em of vertical padding (cancelled by negative margins) so the mask box never clips dots,
 *  shadda or descenders. */
function writeOn(spans, t, tin, tout, { per = 0.42, gap = 0.16, drift = 14, feather = 18 } = {}) {
  spans.forEach((s, i) => {
    const k = tw(t, tin + i * gap, per, E.outCubic);
    const o = exitK(t, tout, i);
    const p = lerp(-feather, 100 + feather, k);           // % from the right edge
    const m = k >= 1 ? 'none' : `linear-gradient(to left, #000 ${(p - feather).toFixed(2)}%, transparent ${p.toFixed(2)}%)`;
    css(s, {
      webkitMaskImage: m, maskImage: m,
      opacity: (clamp(k * 5) * (1 - o)).toFixed(3),
      transform: `translate(${((1 - k) * drift).toFixed(2)}px, ${(-o * 48).toFixed(2)}px)`,
      filter: o > 0 ? `blur(${(o * 6).toFixed(2)}px)` : 'none',
    });
  });
}
/** Small support line: rise + unblur, staggered right→left. */
function riseIn(spans, t, tin, tout, { stagger = 0.11, dur = 0.7, rise = 22, blur = 8 } = {}) {
  spans.forEach((s, i) => {
    const k = tw(t, tin + i * stagger, dur, E.outCubic);
    const o = exitK(t, tout, i);
    css(s, { opacity: (clamp(k * 1.4) * (1 - o)).toFixed(3), transform: `translateY(${((1 - k) * rise - o * 40).toFixed(2)}px)`,
      filter: (k < 1 || o > 0) ? `blur(${((1 - k) * blur + o * 6).toFixed(2)}px)` : 'none' });
  });
}

export function makeOverlay(stage, { W, H, clean, poster }) {
  const ui = stage.querySelector('#ui');
  const api = { ready: Promise.resolve(), render: () => {} };
  if (clean) return api;

  // ---- S3: the notes, small, above the orbit (oud · amber · saffron)
  const notes = line(ui, [{ text: 'عود' }, { text: '·', color: BRASS }, { text: 'عنبر' }, { text: '·', color: BRASS }, { text: 'زعفران' }], { top: 292, size: 50 });
  notes.box.style.wordSpacing = '0.3em';

  // ---- S5: the line — «تمشي…» / «ويبقى ليل.»
  const l1 = line(ui, ['تمشي…'], { top: 985, size: 132 });
  const l2 = line(ui, [{ text: 'ويبقى' }, { text: 'ليل.', color: HONEY }], { top: 1160, size: 132 });

  // ---- client end card (over the hero)
  const ec = el(ui, 'div', null, { position: 'absolute', inset: '0' });
  const ecAr = line(ec, ['ليل'], { top: 318, size: 168 });
  const ecLat = el(ec, 'div', 'layl-lat', { top: '566px', fontSize: '44px', fontWeight: '300', letterSpacing: '.62em', paddingLeft: '.62em' }, 'LAYL');
  const ecRule = el(ec, 'div', 'rule', { top: '644px', left: '508px', width: '64px' });
  const ecSub = el(ec, 'div', 'layl-lat', { top: '666px', fontSize: '22px', fontWeight: '400', letterSpacing: '.34em', paddingLeft: '.34em', color: '#C9B48A' }, 'EAU DE PARFUM · No.07');

  // ---- TASH: lights out, signature, concept slate
  const blackout = el(ui, 'div', null, { position: 'absolute', inset: '0', background: '#050403', opacity: '0' });
  const stingRoot = el(ui, 'div', null, { position: 'absolute', inset: '0', display: 'none' });
  const sting = createSting(stingRoot, { width: W, height: H, logoW: 440, cy: 0.40, taglineSize: 50 });
  const slate = el(ui, 'div', 'slate', { top: '232px' });
  el(slate, 'div', 'mono', {}, 'CONCEPT AD — 01 / PERFUME');
  el(slate, 'div', 'ar', {}, 'إعلان تجريبي — علامة خيالية');

  // poster-only: small TASH mark at the foot of the slate area
  if (poster) {
    const pm = el(ui, 'div', null, { position: 'absolute', left: '0', right: '0', top: '1408px', display: 'flex', justifyContent: 'center' });
    pm.innerHTML = wordmarkSVG({ width: 112, body: '#F5F5E9', dot: '#C6FF00' }); // static, our own logo markup
  }

  api.render = (t) => {
    if (poster) {
      for (const s of [...notes.spans, ...l1.spans, ...l2.spans]) css(s, { opacity: '0' });
      css(ecAr.spans[0], { opacity: '1', transform: 'none', filter: 'none', webkitMaskImage: 'none', maskImage: 'none' });
      css(ecLat, { opacity: '1' }); css(ecRule, { opacity: '1' }); css(ecSub, { opacity: '1' }); css(slate, { opacity: '1' });
      return;
    }
    riseIn(notes.spans, t, T.notesIn, T.notesOut);
    writeOn(l1.spans, t, T.line1, T.linesOut, { per: 0.6 });
    writeOn(l2.spans, t, T.line2, T.linesOut + 0.04, { per: 0.46, gap: 0.24 });

    // end card: the name writes on as the hero push settles; Latin tracks in; hairline draws from the centre
    const out = tw(t, T.lightsOut - 0.05, 0.3, E.inCubic);
    writeOn(ecAr.spans, t, T.endcard, 99, { per: 0.7, drift: 18 });
    ecAr.box.style.opacity = String(1 - out);
    const kl = tw(t, T.endcard + 0.25, 1.0, E.outCubic);
    css(ecLat, { opacity: (clamp(kl * 1.4) * (1 - out)).toFixed(3), letterSpacing: `${lerp(0.95, 0.62, kl).toFixed(3)}em`, paddingLeft: `${lerp(0.95, 0.62, kl).toFixed(3)}em`, filter: kl < 1 ? `blur(${((1 - kl) * 6).toFixed(2)}px)` : 'none' });
    const kr = tw(t, T.endcard + 0.5, 0.7, E.outExpo);
    css(ecRule, { opacity: (kr * (1 - out)).toFixed(3), width: `${(kr * 64).toFixed(1)}px`, left: `${(540 - kr * 32).toFixed(1)}px` });
    const ks = tw(t, T.endcard + 0.6, 0.7, E.outCubic);
    css(ecSub, { opacity: (ks * (1 - out)).toFixed(3), transform: `translateY(${((1 - ks) * 10).toFixed(1)}px)` });

    // night falls → TASH signature
    blackout.style.opacity = tw(t, T.lightsOut, 0.3, E.inOutSine).toFixed(3);
    const st = t - T.sting;
    stingRoot.style.display = st >= 0 ? 'block' : 'none';
    if (st >= 0) sting.render(st);
    css(slate, { opacity: tw(t, T.endcard + 0.8, 0.6, E.outCubic).toFixed(3) });
  };
  api.render(0);
  return api;
}
