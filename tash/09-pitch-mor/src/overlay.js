// MOR — on-screen Arabic (per WORD only, RTL, never split into letters), the end card's info line, the spec slate and
// the TASH tail. Type sits in MOR's palette (cream / burgundy); TASH lime appears only inside the TASH signature.
import { tw, E, clamp, lerp, css } from '/_system/motion/kit.js';
import { createSting } from './sting-short.js';
import { wordmarkSVG } from '/_system/brand/logo.mjs';
import { C } from './cues.js';

const EV = C.ev;
export const MC = { cream: '#F3E7D3', burgundy: '#5E1F28', brass: '#C9A46A', ink: '#0B0B0B' };
const SHADOW = '0 2px 20px rgba(24,8,11,.62), 0 0 2px rgba(24,8,11,.35)';

function el(parent, tag, cls, styles = {}, text = null) {
  const e = document.createElement(tag); if (cls) e.className = cls; css(e, styles); if (text != null) e.textContent = text; parent.appendChild(e); return e;
}
/** a centred RTL line of whole-word spans; padding (cancelled by negative margins) keeps masks off dots and shadda */
function line(parent, words, { top, size, color = MC.cream, weight = 500, shadow = SHADOW }) {
  const box = el(parent, 'div', 'm-ar', { top: top + 'px', fontSize: size + 'px', color, fontWeight: String(weight) });
  if (shadow) box.style.textShadow = shadow;
  const spans = words.map((w, i) => {
    const s = el(box, 'span', null, { display: 'inline-block', padding: '0.45em 0.08em', margin: '-0.45em 0', opacity: '0' }, w);
    if (i < words.length - 1) box.appendChild(document.createTextNode(' '));
    return s;
  });
  return { box, spans };
}
const exitK = (t, tout, i) => tw(t, tout + i * 0.035, 0.28, E.inCubic);
/** hook-style entry: rise + unblur per word (RTL order = DOM order), uneven gaps; exit lifts away on ease-in */
function riseIn(spans, t, tin, tout, { gaps = [0, 0.13, 0.24], rise = 64 } = {}) {
  spans.forEach((s, i) => {
    const k = tw(t, tin + (gaps[i] ?? i * 0.12), 0.5, E.outCubic), o = exitK(t, tout, i);
    css(s, { opacity: (clamp(k * 3) * (1 - o)).toFixed(3), transform: `translateY(${((1 - k) * rise - o * 60).toFixed(2)}px)`,
      filter: (k < 1 || o > 0) ? `blur(${((1 - clamp(k * 1.6)) * 8 + o * 6).toFixed(2)}px)` : 'none' });
  });
}
/** calm line: a feathered edge travels right→left through each word (reads like a pen), slight leftward drift */
function writeOn(spans, t, tin, tout, { per = 0.55, gap = 0.22, drift = 16, feather = 22 } = {}) {
  spans.forEach((s, i) => {
    const k = tw(t, tin + i * gap, per, E.outCubic), o = exitK(t, tout, i);
    const p = lerp(-feather, 100 + feather, k);
    const m = k >= 1 ? 'none' : `linear-gradient(to left, #000 ${(p - feather).toFixed(2)}%, transparent ${p.toFixed(2)}%)`;
    css(s, { webkitMaskImage: m, maskImage: m, opacity: (clamp(k * 5) * (1 - o)).toFixed(3),
      transform: `translate(${((1 - k) * drift).toFixed(2)}px, ${(-o * 54).toFixed(2)}px)`, filter: o > 0 ? `blur(${(o * 6).toFixed(2)}px)` : 'none' });
  });
}
/** the payoff «تفضّل.»: arrives from oversize (once in the piece), outExpo, unblurs; exits with the cut to the card */
function arrive(span, t, tin, tout) {
  const k = tw(t, tin, 0.7, E.outExpo), o = tw(t, tout, 0.2, E.inCubic);
  css(span, { opacity: (clamp(k * 4) * (1 - o)).toFixed(3), transform: `scale(${lerp(1.55, 1, k).toFixed(4)})`,
    filter: (k < 0.999 || o > 0) ? `blur(${((1 - clamp(k * 1.25)) * 10 + o * 6).toFixed(2)}px)` : 'none' });
}

export async function makeOverlay(stage, { W, H, LY, poster }) {
  const ui = stage.querySelector('#ui');
  const T = LY.text;
  const t1 = line(ui, ['فيه', 'باب', 'بالجهراء…'], T.t1);
  const t2 = line(ui, ['…وراه', 'قهوة'], T.t2);
  const t3 = line(ui, ['تسوى', 'المشوار.'], T.t3);
  const t4 = line(ui, ['الباب', 'مفتوح…'], { ...T.t4 });
  const t5 = line(ui, ['تفضّل.'], { ...T.t5, weight: 600 });
  t5.spans[0].style.transformOrigin = '50% 55%';

  // end card info line (facts from MOR's own cups and Instagram only: place + handle)
  const info = el(ui, 'div', null, { position: 'absolute', left: '0', right: '0', top: T.info.top + 'px', textAlign: 'center', opacity: '0' });
  el(info, 'div', 'm-ar', { position: 'static', fontFamily: 'IBM Plex Sans Arabic', fontWeight: '500', fontSize: '40px', color: MC.cream, lineHeight: '1.4' }, 'الكويت · الجهراء');
  el(info, 'div', null, { fontFamily: 'IBM Plex Sans Arabic', fontWeight: '500', fontSize: '34px', letterSpacing: '.08em', color: MC.cream, opacity: '.78', direction: 'ltr', marginTop: '6px' }, '@morkwt');

  // TASH tail: signature + spec slate (never reads as client work)
  const stingRoot = el(ui, 'div', null, { position: 'absolute', inset: '0', display: 'none' });
  const sting = createSting(stingRoot, { width: W, height: H, logoW: LY.sting.logoW, cy: LY.sting.cy, taglineSize: LY.sting.tag });
  const slate = el(ui, 'div', 'slate', { top: T.slate.top + 'px', opacity: '0' });
  el(slate, 'div', 'mono', {}, 'SPEC AD — NOT COMMISSIONED BY MOR');
  el(slate, 'div', 'ar', {}, 'إعلان تجريبي غير رسمي — مقترح من طشّ لـ مور');

  if (poster) {
    const p = await import('./poster.js');
    return p.makePosterOverlay({ ui, W, H, LY, lines: [t1, t2, t3, t4, t5], info, slate, stingRoot, MC });
  }

  const api = {
    render(t) {
      riseIn(t1.spans, t, EV.text1, EV.text1Out, { gaps: [0, 0.14, 0.25] });
      writeOn(t2.spans, t, EV.text2, EV.text2Out, { per: 0.55, gap: 0.24 });
      riseIn(t3.spans, t, EV.text3, EV.text3Out, { gaps: [0, 0.16] });
      writeOn(t4.spans, t, EV.text4, EV.text4Out, { per: 0.6, gap: 0.28 });
      arrive(t5.spans[0], t, EV.welcome, EV.welcomeOut);
      const ki = tw(t, EV.info, 0.7, E.outCubic), out = tw(t, EV.sting - 0.2, 0.2, E.inOutSine);
      css(info, { opacity: (ki * (1 - out)).toFixed(3), transform: `translateY(${((1 - ki) * 18).toFixed(1)}px)` });
      const st = t - EV.sting;
      stingRoot.style.display = st >= -0.2 ? 'block' : 'none';
      stingRoot.style.opacity = tw(t, EV.sting - 0.2, 0.2, E.inOutSine).toFixed(3);   // dip to ink lands on the beat, before the bubble pops (no TASH over MOR)
      sting.render(Math.max(0, st));
      css(slate, { opacity: tw(t, EV.sting + 0.15, 0.5, E.outCubic).toFixed(3) });
    },
  };
  api.render(0);
  return api;
}
