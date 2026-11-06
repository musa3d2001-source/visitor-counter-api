// HABBA — typography (client type), client end card, CONCEPT AD slate and the TASH signature.
// Arabic is animated per WORD only (feathered RTL write-on / soft drop + unblur) — never split into letters.
import { tw, E, clamp, lerp, css } from '/_system/motion/kit.js';
import { createSting } from './sting-short.js';
import { wordmarkSVG } from '/_system/brand/logo.mjs';
import { HC, VB as LVB, markInner } from './habba-logo.mjs';
import { C } from './shots.js';

const EV = C.ev;
const NS = 'http://www.w3.org/2000/svg';

function el(parent, tag, cls, styles = {}, text = null) {
  const e = document.createElement(tag); if (cls) e.className = cls; css(e, styles); if (text != null) e.textContent = text; parent.appendChild(e); return e;
}
/** A centred line of whole-word spans (the browser's bidi keeps RTL order). Spans carry vertical padding (cancelled by
 *  negative margins) so masks never clip dots, shadda or descenders. */
function line(parent, words, { top, size, color = HC.paper, weight = 300, shadow = null }) {
  const box = el(parent, 'div', 'h-ar', { top: top + 'px', fontSize: size + 'px', color, fontWeight: String(weight) });
  if (shadow) box.style.textShadow = shadow;
  const spans = words.map((w, i) => {
    const s = el(box, 'span', null, { display: 'inline-block', willChange: 'transform, opacity, filter', padding: '0.45em 0.08em', margin: '-0.45em 0' }, w);
    if (i < words.length - 1) box.appendChild(document.createTextNode(' '));
    return s;
  });
  return { box, spans };
}
const exitK = (t, tout, i) => tw(t, tout + i * 0.04, 0.3, E.inCubic);

/** Calm line: a feathered edge travels right→left through each whole word (reads like a pen), slight leftward drift. */
function writeOn(spans, t, tin, tout, { per = 0.55, gap = 0.2, drift = 16, feather = 22 } = {}) {
  spans.forEach((s, i) => {
    const k = tw(t, tin + i * gap, per, E.outCubic);
    const o = exitK(t, tout, i);
    const p = lerp(-feather, 100 + feather, k);
    const m = k >= 1 ? 'none' : `linear-gradient(to left, #000 ${(p - feather).toFixed(2)}%, transparent ${p.toFixed(2)}%)`;
    css(s, {
      webkitMaskImage: m, maskImage: m,
      opacity: (clamp(k * 5) * (1 - o)).toFixed(3),
      transform: `translate(${((1 - k) * drift).toFixed(2)}px, ${(-o * 54).toFixed(2)}px)`,
      filter: o > 0 ? `blur(${(o * 6).toFixed(2)}px)` : 'none',
    });
  });
}
/** «حبّة» lands like a bean: a short soft drop + unblur, timed to the bean touching the table. */
function dropIn(span, t, tin, tout) {
  const k = tw(t, tin - 0.06, 0.62, E.outCubic);
  const o = exitK(t, tout, 0);
  css(span, {
    opacity: (clamp(k * 2.2) * (1 - o)).toFixed(3),
    transform: `translateY(${((1 - k) * -34 - o * 54).toFixed(2)}px)`,
    filter: (k < 1 || o > 0) ? `blur(${((1 - k) * 7 + o * 6).toFixed(2)}px)` : 'none',
  });
}

export async function makeOverlay(stage, { W, H, poster }) {
  const ui = stage.querySelector('#ui');
  const api = { render: () => {} };

  // ---- the three calm lines
  // paper type over the dark room (S2); roasted type over the sunlit table and wall (S3, S4) — contrast first
  const t1 = line(ui, ['قهوتك…'], { top: 300, size: 150 });
  const t2 = line(ui, ['على', 'مهلك.'], { top: 1300, size: 140 });
  const t3 = line(ui, ['حبّة…', 'حبّة.'], { top: 300, size: 150, color: HC.roast });

  // ---- client end card on the sunlit wall: the mark writes on, then its bean drops into place under ب
  const ec = el(ui, 'div', null, { position: 'absolute', inset: '0' });
  const markW = 470, markH = markW * LVB.h / LVB.w, markTop = 330;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `${LVB.x} ${LVB.y} ${LVB.w} ${LVB.h}`); svg.setAttribute('width', markW); svg.setAttribute('height', markH.toFixed(1));
  css(svg, { position: 'absolute', left: ((W - markW) / 2) + 'px', top: markTop + 'px', overflow: 'visible' });
  svg.innerHTML = `<defs><linearGradient id="hwipe" x1="1" y1="0" x2="0" y2="0"><stop id="hw0" offset="0" stop-color="#fff"/><stop id="hw1" offset="0" stop-color="#000"/></linearGradient>
    <mask id="hmask" maskUnits="userSpaceOnUse" x="${LVB.x - 200}" y="${LVB.y - 400}" width="${LVB.w + 400}" height="${LVB.h + 800}"><rect x="${LVB.x - 200}" y="${LVB.y - 400}" width="${LVB.w + 400}" height="${LVB.h + 800}" fill="url(#hwipe)"/></mask></defs>
    <g id="hbody" mask="url(#hmask)">${markInner({ color: HC.roast, ids: true, showBean: false })}</g>
    <g id="hbean">${markInner({ color: HC.roast, ids: true }).replace(/<path id="habba-body"[^>]*\/>/, '')}</g>`;
  ec.appendChild(svg);
  const hw0 = svg.querySelector('#hw0'), hw1 = svg.querySelector('#hw1'), hbody = svg.querySelector('#hbody');
  const beanG = svg.querySelector('#habba-bean'); const beanBase = beanG.getAttribute('transform');
  const lat = el(ec, 'div', 'h-lat', { top: (markTop + markH + 34) + 'px', fontSize: '46px', fontWeight: '500', color: HC.roast, letterSpacing: '.42em', paddingLeft: '.42em' }, 'HABBA');
  const sub = el(ec, 'div', 'h-lat', { top: (markTop + markH + 108) + 'px', fontSize: '22px', fontWeight: '500', color: '#5E4334', letterSpacing: '.5em', paddingLeft: '.5em' }, 'SPECIALTY COFFEE');

  // ---- TASH tail: concept slate + signature
  const stingRoot = el(ui, 'div', null, { position: 'absolute', inset: '0', display: 'none' });
  const sting = createSting(stingRoot, { width: W, height: H, logoW: 440, cy: 0.46, taglineSize: 50 });
  const slate = el(ui, 'div', 'slate', { top: '236px', opacity: '0' });
  el(slate, 'div', 'mono', {}, 'CONCEPT AD — 03 / COFFEE');
  el(slate, 'div', 'ar', {}, 'إعلان تجريبي — علامة خيالية');

  if (poster) {
    const p = await import('./poster.js');
    return p.makePosterOverlay({ ui, W, H, t1, t2, t3, ec, svg, hw0, hw1, beanG, beanBase, lat, sub, slate, stingRoot });
  }

  api.render = (t) => {
    // lines
    writeOn(t1.spans, t, EV.text1, EV.text1Out, { per: 0.7 });
    writeOn(t2.spans, t, EV.text2, EV.text2Out, { per: 0.55, gap: 0.26 });
    dropIn(t3.spans[0], t, EV.bean1, EV.text3Out);
    dropIn(t3.spans[1], t, EV.bean2, EV.text3Out + 0.04);

    // end card: write-on RTL (gradient stop travels right→left), then the bean falls into its slot
    const out = tw(t, EV.blindsClose, EV.blindsCloseDur, E.inCubic);
    const kw = tw(t, EV.logoIn, 0.9, E.outCubic);
    const f = 0.12, pos = lerp(-f, 1 + f, kw);
    hw0.setAttribute('offset', clamp(pos - f).toFixed(4)); hw1.setAttribute('offset', clamp(pos).toFixed(4));
    hbody.setAttribute('transform', `translate(${((1 - kw) * 40).toFixed(1)} 0)`);
    ec.style.opacity = (kw > 0 ? 1 - out : 0).toFixed(3);
    // bean: falls on an ease-in (gravity), tumbling; lands at EV.beanDot with a ≤2% settle, no squash (calm brand)
    const fallDur = 0.5, tf = (t - (EV.beanDot - fallDur)) / fallDur;
    if (tf <= 0) beanG.setAttribute('opacity', '0');
    else {
      const k = E.inQuad(clamp(tf));
      const st = Math.max(0, t - EV.beanDot);
      const settle = st > 0 ? Math.exp(-st * 9) * Math.sin(st * 22) : 0;
      const dy = lerp(-900, 0, k) + settle * -10;
      const rot = lerp(-150, 0, E.outCubic(clamp(tf))) + settle * 4;
      beanG.setAttribute('opacity', clamp(tf * 6).toFixed(3));
      beanG.setAttribute('transform', `${beanBase} translate(0 0)`.replace(/translate\(([-\d.]+) ([-\d.]+)\)/, (m, x, y) => `translate(${x} ${(+y + dy).toFixed(2)})`) + ` rotate(${rot.toFixed(2)})`);
    }
    const kl = tw(t, EV.beanDot + 0.05, 0.9, E.outCubic);
    css(lat, { opacity: (clamp(kl * 1.5) * (1 - out)).toFixed(3), letterSpacing: `${lerp(0.7, 0.42, kl).toFixed(3)}em`, paddingLeft: `${lerp(0.7, 0.42, kl).toFixed(3)}em` });
    const ks = tw(t, EV.beanDot + 0.3, 0.8, E.outCubic);
    css(sub, { opacity: (ks * (1 - out)).toFixed(3), transform: `translateY(${((1 - ks) * 12).toFixed(1)}px)` });

    // TASH: the room goes dark with the blinds; the signature types in on ink
    const st = t - EV.sting;
    stingRoot.style.display = st >= -0.2 ? 'block' : 'none';
    stingRoot.style.opacity = tw(t, EV.sting - 0.12, 0.2, E.inOutSine).toFixed(3);
    if (st >= 0) sting.render(st); else sting.render(0);
    css(slate, { opacity: tw(t, EV.sting + 0.1, 0.5, E.outCubic).toFixed(3) });
  };
  api.render(0);
  return api;
}
