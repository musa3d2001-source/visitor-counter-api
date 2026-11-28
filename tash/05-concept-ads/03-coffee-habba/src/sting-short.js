// LOCAL VARIANT of /_system/motion/endcard.js for the short TASH tail inside the HABBA concept ad (_system untouched).
// Same cues (endcard-cues.json), same dot behaviour (typing bounce → arc converge → land in ش → pulse) and the same
// sonic_logo() audio. Only change (CRAFT-ADDENDUM §5.2): bubble-pop and dot-appear springs settle with damp ≥ 12, so the
// shadda drop stays the one visible spring in a 2.7 s tail.
import * as L from '/_system/brand/logo.mjs';
import { tw, E, clamp, lerp, typing, spring, css, words, headlineIn } from '/_system/motion/kit.js';

export const CUES = await (await fetch('/_system/motion/endcard-cues.json')).json();
/** Times at which each typing dot peaks (tick SFX) — precomputed in endcard-cues.json. */
export const tickTimes = () => CUES.ticks;

const NS = 'http://www.w3.org/2000/svg';
const THEMES = {
  ink: { bg: L.COLORS.ink, body: L.COLORS.paper, dot: L.COLORS.lime, bubble: '#1A1A18', text: L.COLORS.paper, meta: L.COLORS.smoke, landDot: L.COLORS.lime },
  lime: { bg: L.COLORS.lime, body: L.COLORS.ink, dot: L.COLORS.lime, bubble: L.COLORS.ink, text: L.COLORS.ink, meta: '#3A4A00', landDot: L.COLORS.ink },
  paper: { bg: L.COLORS.paper, body: L.COLORS.ink, dot: L.COLORS.lime, bubble: L.COLORS.ink, text: L.COLORS.ink, meta: '#55574F', landDot: L.COLORS.ink },
};

function hexMix(a, b, k) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(lerp(v, B[i], k)).toString(16).padStart(2, '0')).join('');
}

/**
 * createSting(root, opts) → { render(t) }  (t = seconds since the sting started)
 * opts: width, height, logoW, cy (0..1 logo centre), tagline, handle, theme ('ink'|'lime'|'paper'), background (bool)
 */
export function createSting(root, { width = 1080, height = 1920, logoW = 640, cy = 0.46, tagline = 'خلّهم يسولفون عنك!', handle = '@tash.creative.kw', theme = 'ink', background = true, taglineSize = 56 } = {}) {
  const T = THEMES[theme];
  const wrap = document.createElement('div');
  css(wrap, { position: 'absolute', inset: '0', overflow: 'hidden', background: background ? T.bg : 'transparent' });
  root.appendChild(wrap);

  const s = logoW / L.VB.w, logoH = L.VB.h * s;
  const lx = (width - logoW) / 2, ly = height * cy - logoH / 2;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  css(svg, { position: 'absolute', inset: '0', width: width + 'px', height: height + 'px' });
  svg.innerHTML = `
    <defs><clipPath id="sting-wipe"><rect id="sting-wipe-r" x="0" y="-200" width="${L.VB.w}" height="${L.VB.h + 400}"/></clipPath></defs>
    <g id="sting-shake">
      <path id="sting-bubble" fill="${T.bubble}"/>
      <g id="sting-logo" transform="translate(${lx} ${ly}) scale(${s})">
        <g id="sting-bodywrap" clip-path="url(#sting-wipe)">${L.wordmarkInner({ body: T.body, dot: 'none', ids: true })}</g>
      </g>
      <g id="sting-dots"></g>
    </g>`;
  wrap.appendChild(svg);
  svg.querySelector('#tash-dots')?.remove();
  const shadda = svg.querySelector('#tash-shadda');
  const bodywrap = svg.querySelector('#sting-bodywrap');
  const wipe = svg.querySelector('#sting-wipe-r');
  const bubble = svg.querySelector('#sting-bubble');
  const shake = svg.querySelector('#sting-shake');
  const logoDots = L.dots().map(d => ({ x: lx + d.cx * s, y: ly + d.cy * s, r: d.r * s }));
  const dotEls = logoDots.map(() => { const c = document.createElementNS(NS, 'circle'); svg.querySelector('#sting-dots').appendChild(c); return c; });

  // chat bubble (typing indicator) geometry, centred where the logo will be
  const bw = 300, bh = 150, bx = width / 2 - bw / 2, by = height * cy - bh / 2 - 10;
  const tdR = 26, tdGap = 82; // typing dots
  const typingPos = [1, 0, -1].map(k => ({ x: width / 2 + k * tdGap, y: by + bh / 2 }));

  const tag = document.createElement('div');
  tag.textContent = tagline; tag.lang = 'ar';
  css(tag, { position: 'absolute', left: '0', right: '0', top: (ly + logoH + 70) + 'px', textAlign: 'center', direction: 'rtl', fontFamily: 'Alexandria', fontWeight: '700', fontSize: taglineSize + 'px', color: T.text, lineHeight: '1.3' });
  wrap.appendChild(tag);
  const tagWords = tagline ? words(tag) : [];
  tagWords.forEach(w => { w.style.willChange = 'auto'; });   // painted fresh per frame (seek-order independent blur)
  const hd = document.createElement('div');
  hd.textContent = handle;
  css(hd, { position: 'absolute', left: '0', right: '0', top: (ly + logoH + 70 + taglineSize * 1.3 + 34) + 'px', textAlign: 'center', fontFamily: 'JetBrains Mono', fontWeight: '600', fontSize: '26px', letterSpacing: '.2em', color: T.meta, direction: 'ltr' });
  wrap.appendChild(hd);

  function bubblePath(k) { // k: 0..1 scale of the bubble around its centre
    const cx = width / 2, cyy = by + bh / 2, w = bw * k, h = bh * k, r = h / 2;
    const x = cx - w / 2, y = cyy - h / 2;
    const tail = `M${x + w - r * 0.55} ${y + h - 6 * k} q ${18 * k} ${26 * k} ${44 * k} ${30 * k} q ${-30 * k} ${-24 * k} ${-26 * k} ${-58 * k} z`;
    return k <= 0.001 ? '' : `M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h} H${x + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z ` + tail;
  }

  function render(t) {
    const C = CUES;
    // --- bubble: pops in (spring), holds, then collapses as the dots leave
    const bIn = spring(clamp((t - 0.0) / 0.9), { freq: 1.6, damp: 12 });
    const bOut = tw(t, C.converge - 0.04, 0.26, E.inBack);
    bubble.setAttribute('d', bubblePath(Math.max(0, bIn * (1 - bOut))));

    // --- dots: typing → converge → land → pulse
    const conv = tw(t, C.converge, C.convergeDur, E.inOutExpo);
    dotEls.forEach((el, i) => {
      const appear = spring(clamp((t - 0.06 - i * 0.05) / 0.7), { freq: 2, damp: 12 });
      const bob = t < C.converge + 0.05 ? typing(t - C.typingStart, i, { period: C.typingPeriod, phase: C.typingPhase, amp: C.typingAmp }) * (1 - conv) : 0;
      const pulse = typing(t - C.pulse, i, { period: 0.62, phase: 0.12, amp: 16 }) * (t >= C.pulse && t < C.pulse + 0.62 + 0.3 ? 1 : 0);
      const A = typingPos[i], B = logoDots[i];
      // arc: dots hop up slightly on their way down into the letter
      const arc = Math.sin(conv * Math.PI) * -60 * (1 + i * 0.25);
      const x = lerp(A.x, B.x, conv), y = lerp(A.y + bob, B.y, conv) + arc + pulse;
      const r = lerp(tdR, B.r, conv) * appear;
      el.setAttribute('cx', x.toFixed(2)); el.setAttribute('cy', y.toFixed(2)); el.setAttribute('r', Math.max(0, r).toFixed(2));
      el.setAttribute('fill', hexMix(T.dot, T.landDot, clamp((t - C.snap) / 0.2)));
    });

    // --- body: wipe right→left (the direction Arabic is written) + slam
    const wk = tw(t, C.snap - 0.06, 0.34, E.outExpo);
    wipe.setAttribute('x', ((1 - wk) * L.VB.w).toFixed(1));
    wipe.setAttribute('width', (wk * L.VB.w + 10).toFixed(1));
    const slam = t < C.snap - 0.06 ? 0 : spring(clamp((t - (C.snap - 0.06)) / 0.9), { freq: 1.9, damp: 7 });
    const sc = lerp(1.14, 1, slam);
    const ox = L.VB.w / 2, oy = L.VB.h / 2;
    bodywrap.setAttribute('transform', `translate(${ox} ${oy}) scale(${sc.toFixed(4)}) translate(${-ox} ${-oy})`);
    bodywrap.setAttribute('opacity', wk > 0 ? '1' : '0');

    // --- shadda drops in with a bounce
    const sk = t < C.shadda ? 0 : spring(clamp((t - C.shadda) / 0.8), { freq: 2.4, damp: 7.5 });
    const base = shadda.getAttribute('data-base') || shadda.getAttribute('transform');
    shadda.setAttribute('data-base', base);
    shadda.setAttribute('transform', `${base} translate(0 ${((1 - sk) * -260).toFixed(1)})`);
    shadda.setAttribute('opacity', t < C.shadda ? '0' : String(clamp((t - C.shadda) / 0.08)));

    // --- impact shake (tiny, decays in ~0.25s)
    const st = t - C.snap; const amp = st > 0 && st < 0.3 ? 7 * Math.exp(-st * 18) : 0;
    shake.setAttribute('transform', `translate(${(Math.sin(st * 90) * amp).toFixed(2)} ${(Math.cos(st * 77) * amp).toFixed(2)})`);

    // --- tagline (word by word, right→left) and handle
    headlineIn(tagWords, t, C.tagline, { stagger: 0.09, dur: 0.6, rise: 38 });
    if (!tagline) tag.style.opacity = '0';
    const hk = tw(t, C.handle, 0.7, E.outExpo);
    css(hd, { opacity: String(hk), letterSpacing: `${lerp(0.5, 0.2, hk).toFixed(3)}em` });
  }
  render(0);
  return { render, el: wrap, logoBox: { x: lx, y: ly, w: logoW, h: logoH } };
}
