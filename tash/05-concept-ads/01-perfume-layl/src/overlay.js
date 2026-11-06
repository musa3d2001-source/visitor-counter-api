// LAYL — typography layer (client type), CONCEPT AD slate and the TASH signature.
// Arabic is animated per WORD only (opacity / rise / blur) — never split into letters.
import { tw, E, clamp, lerp, css } from '/_system/motion/kit.js';
import { createSting } from '/_system/motion/endcard.js';
import { wordmarkSVG } from '/_system/brand/logo.mjs';
import { T } from './shots.js';

const IVORY = '#EFE3C8', HONEY = '#F2B35A', BRASS = '#C9A15B';

function el(parent, tag, cls, styles = {}, text = null) {
  const e = document.createElement(tag); if (cls) e.className = cls; css(e, styles); if (text != null) e.textContent = text; parent.appendChild(e); return e;
}
/** A centred line built from word spans (RTL order preserved by the browser's bidi). */
function line(parent, wordsArr, { top, size, cls = 'layl-ar', color = IVORY, gap = '0.28em', weight = 300 }) {
  const box = el(parent, 'div', cls, { top: top + 'px', fontSize: size + 'px', color, fontWeight: String(weight) });
  const spans = wordsArr.map((w, i) => {
    const s = el(box, 'span', null, { display: 'inline-block', willChange: 'transform, opacity, filter', color: w.color || color }, w.text ?? w);
    if (i < wordsArr.length - 1) box.appendChild(document.createTextNode(' '));
    return s;
  });
  return { box, spans };
}
/** Luxury word entrance: slow rise + unblur; exit: dissolve upward. */
function wordsIO(spans, t, tin, tout, { stagger = 0.16, dur = 0.9, rise = 26, blur = 14, outDur = 0.45 } = {}) {
  spans.forEach((s, i) => {
    const k = tw(t, tin + i * stagger, dur, E.outCubic);
    const o = tw(t, tout + i * 0.05, outDur, E.inCubic);
    const op = clamp(k * 1.25) * (1 - o);
    css(s, { opacity: op.toFixed(3), transform: `translateY(${((1 - k) * rise - o * 18).toFixed(2)}px)`, filter: (k < 1 || o > 0) ? `blur(${((1 - k) * blur + o * 10).toFixed(2)}px)` : 'none' });
  });
}

export function makeOverlay(stage, { W, H, clean, poster }) {
  const ui = stage.querySelector('#ui');
  const api = { ready: Promise.resolve(), render: () => {} };
  if (clean) return api;

  // ---- S3: the notes, small, over the orbit
  const notes = line(ui, [{ text: 'عود' }, { text: '·', color: BRASS }, { text: 'عنبر' }, { text: '·', color: BRASS }, { text: 'زعفران' }], { top: 1290, size: 50, gap: '0.5em' });
  notes.box.style.wordSpacing = '0.35em';

  // ---- S5: the line — «تمشي…» / «ويبقى ليل.»
  const l1 = line(ui, ['تمشي…'], { top: 700, size: 132 });
  const l2 = line(ui, [{ text: 'ويبقى' }, { text: 'ليل.', color: HONEY }], { top: 880, size: 132 });

  // ---- client end card (over the hero)
  const ec = el(ui, 'div', null, { position: 'absolute', inset: '0' });
  const ecAr = line(ec, ['ليل'], { top: 250, size: 168 });
  const ecLat = el(ec, 'div', 'layl-lat', { top: '505px', fontSize: '46px', fontWeight: '300', letterSpacing: '.62em', paddingLeft: '.62em' }, 'LAYL');
  const ecRule = el(ec, 'div', 'rule', { top: '590px', left: '510px', width: '60px' });
  const ecSub = el(ec, 'div', 'layl-lat', { top: '616px', fontSize: '22px', fontWeight: '400', letterSpacing: '.34em', paddingLeft: '.34em', color: '#C9B48A' }, 'EAU DE PARFUM · No.07');

  // ---- TASH: concept slate + signature
  const blackout = el(ui, 'div', null, { position: 'absolute', inset: '0', background: '#050403', opacity: '0' });
  const stingRoot = el(ui, 'div', null, { position: 'absolute', inset: '0', display: 'none' });
  const sting = createSting(stingRoot, { width: W, height: H, logoW: 440, cy: 0.40, taglineSize: 50 });
  const slate = el(ui, 'div', 'slate', { top: '1392px' });
  const slMono = el(slate, 'div', 'mono', {}, 'CONCEPT AD — 01 / PERFUME');
  const slAr = el(slate, 'div', 'ar', {}, 'إعلان تجريبي — علامة خيالية');

  // poster-only: small TASH mark under the slate
  let posterMark = null;
  if (poster) {
    posterMark = el(ui, 'div', null, { position: 'absolute', left: '0', right: '0', top: '1536px', display: 'flex', justifyContent: 'center' });
    posterMark.innerHTML = wordmarkSVG({ width: 120, body: '#F5F5E9', dot: '#C6FF00' });
  }

  api.render = (t) => {
    if (poster) {
      for (const s of [...notes.spans, ...l1.spans, ...l2.spans]) css(s, { opacity: '0' });
      css(ecAr.spans[0], { opacity: '1', transform: 'none', filter: 'none' });
      css(ecLat, { opacity: '1' }); css(ecRule, { opacity: '1' }); css(ecSub, { opacity: '1' });
      css(slate, { opacity: '1' });
      return;
    }
    wordsIO(notes.spans, t, 3.55, 5.55, { stagger: 0.14, dur: 0.85 });
    wordsIO(l1.spans, t, 8.45, 10.12, { dur: 0.9, rise: 30 });
    wordsIO(l2.spans, t, 9.05, 10.18, { stagger: 0.22, dur: 0.9, rise: 30 });

    // end card
    const out = tw(t, T.lightsOut - 0.05, 0.3, E.inCubic);
    wordsIO(ecAr.spans, t, T.endcard, 99, { dur: 1.0, rise: 20, blur: 16 });
    ecAr.box.style.opacity = String(1 - out);
    const kl = tw(t, T.endcard + 0.22, 1.1, E.outCubic);
    css(ecLat, { opacity: (clamp(kl * 1.4) * (1 - out)).toFixed(3), letterSpacing: `${lerp(0.95, 0.62, kl).toFixed(3)}em`, paddingLeft: `${lerp(0.95, 0.62, kl).toFixed(3)}em`, filter: kl < 1 ? `blur(${((1 - kl) * 8).toFixed(2)}px)` : 'none' });
    const kr = tw(t, T.endcard + 0.45, 0.8, E.outExpo);
    css(ecRule, { opacity: (kr * (1 - out)).toFixed(3), width: `${(kr * 60).toFixed(1)}px`, left: `${(540 - kr * 30).toFixed(1)}px` });
    const ks = tw(t, T.endcard + 0.55, 0.8, E.outCubic);
    css(ecSub, { opacity: (ks * (1 - out)).toFixed(3), transform: `translateY(${((1 - ks) * 10).toFixed(1)}px)` });

    // night falls → TASH signature
    blackout.style.opacity = (tw(t, T.lightsOut, 0.3, E.inOutSine)).toFixed(3);
    const st = t - T.sting;
    stingRoot.style.display = st >= 0 ? 'block' : 'none';
    if (st >= 0) sting.render(st);
    const ks2 = tw(t, T.endcard + 0.7, 0.6, E.outCubic);
    css(slate, { opacity: ks2.toFixed(3) });
  };
  api.render(0);
  return api;
}
