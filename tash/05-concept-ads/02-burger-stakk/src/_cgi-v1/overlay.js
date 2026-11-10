// STAKK — 2D layer: kinetic Arabic labels (per word, never per letter), tracked leader lines, offer, end card, slate, TASH signature.
import { clamp, lerp, E, tw, spring, css, words } from '/_system/motion/kit.js';
import { createSting } from '/_system/motion/endcard.js';

const C_ = { red: '#E23B2E', mustard: '#F2B705', cream: '#FFF3DC', char: '#1F1C19', ink: '#0B0B0B', paper: '#F5F5E9', smoke: '#8E9088' };
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, cls, parent, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; if (parent) parent.appendChild(e); return e; };
const sm = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };

/** word pop: scale/rotate/rise with spring, staggered right→left */
function popWords(spans, t, start, { stagger = 0.06, rise = 60, rot = 6, from = 0.55 } = {}) {
  spans.forEach((s, i) => {
    const a = t - (start + i * stagger);
    if (a < 0) { css(s, { opacity: '0', transform: 'translateY(40px) scale(.6)' }); return; }
    const k = spring(clamp(a / 0.6), { freq: 2.0, damp: 6.5 });
    const sc = lerp(from, 1, k);
    css(s, { opacity: String(clamp(a / 0.06)), transform: `translateY(${((1 - k) * rise).toFixed(1)}px) rotate(${((1 - k) * rot).toFixed(2)}deg) scale(${sc.toFixed(3)})` });
  });
}
function outWords(spans, t, start, { dur = 0.16, drop = 0 } = {}) {
  if (t < start) return 1;
  const k = E.inQuad(clamp((t - start) / dur));
  spans.forEach(s => { s.style.opacity = String(1 - k); s.style.transform += ` translateY(${(k * (drop || -30)).toFixed(1)}px) scale(${(1 - 0.15 * k).toFixed(3)})`; });
  return 1 - k;
}

export function createOverlay(root, C, { W = 1080, H = 1920, project } = {}) {
  const ui = el('div', 'ui', root);
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'lines'); ui.appendChild(svg);

  // ------------------------------------------------ title: four words stacked like layers
  const title = el('div', 'title', ui);
  const tWords = ['كل', 'طبقة', 'لها', 'سالفة'].map((w, i) => { const line = el('div', 'tline', title); const s = el('span', 'tw ' + (i % 2 ? 'mus' : 'cre'), line, w); return s; });

  // ------------------------------------------------ labels (support line + hero line) with leader lines
  const mkLabel = (key, side, top, sup, hero, anchor, { heroFirst = false, supCls = 'pill' } = {}) => {
    const box = el('div', 'label ' + side, ui); box.style.top = top + 'px';
    const a = el('div', 'l-sup ' + supCls, null, sup); const b = el('div', 'l-hero', null, hero);
    if (heroFirst) { box.appendChild(b); box.appendChild(a); } else { box.appendChild(a); box.appendChild(b); }
    const line = document.createElementNS(NS, 'path'); line.setAttribute('class', 'leader'); svg.appendChild(line);
    const dot = document.createElementNS(NS, 'circle'); dot.setAttribute('class', 'ldot'); dot.setAttribute('r', '9'); svg.appendChild(dot);
    const ring = document.createElementNS(NS, 'circle'); ring.setAttribute('class', 'lring'); ring.setAttribute('r', '18'); svg.appendChild(ring);
    return { key, box, sup: [a], hero: words(b), supEl: a, heroEl: b, line, dot, ring, anchor, side };
  };
  const LB = {
    heel: mkLabel('heel', 'right', 330, 'بريوش', 'محمّص بالزبدة', [0.62, 0.22, 0.72]),
    patty: mkLabel('patty', 'left', 330, 'سماش…', 'أطرافه مقرمشة', [-0.98, 0.45, 0.5]),
    cheese: mkLabel('cheese', 'right', 330, '…على مهله', 'تشيدر يذوب', [0.86, 0.38, 0.78], { heroFirst: true, supCls: 'pill' }),
    crunch: mkLabel('crunch', 'left', 330, 'مخلل وبصل…', 'يقرمشون', [-0.78, 0.76, 0.6]),
    sauce: mkLabel('sauce', 'right', 330, 'صوص ستاك', 'السرّي', [0.5, 0.82, 0.62]),
  };
  const dbl = el('div', 'double', ui); const dblW = words(el('div', 'd-hero', dbl, 'دبل!'));

  // ------------------------------------------------ hero offer
  const prod = el('div', 'product', ui); const prodW = words(el('div', 'p-hero', prod, 'ستاك دبل'));
  const badge = el('div', 'badge', ui);
  const bIn = el('div', 'b-in', badge); el('div', 'b-num', bIn, '٢٫٧٥٠'); el('div', 'b-cur', bIn, 'د.ك');
  const cta = el('div', 'cta', ui); const ctaIn = el('div', 'cta-in', cta); el('span', 'cta-t', ctaIn, 'اطلب الحين'); const arr = el('span', 'cta-a', ctaIn, '←');

  // ------------------------------------------------ client end card
  const ec = el('div', 'endcard', ui);
  const mark = document.createElementNS(NS, 'svg'); mark.setAttribute('viewBox', '0 0 300 230'); mark.setAttribute('class', 'mark'); ec.appendChild(mark);
  mark.innerHTML = `<path id="m-top" d="M30 96 C30 40 85 10 150 10 C215 10 270 40 270 96 Q270 104 262 104 H38 Q30 104 30 96 Z" fill="${C_.mustard}"/>
    <g id="m-mid"><rect x="16" y="118" width="268" height="40" rx="20" fill="${C_.char}"/><path d="M40 132 H250 Q256 132 252 138 L232 158 Q226 166 222 156 L216 144 Q212 138 206 144 L196 152 Q190 158 186 150 L180 140 H52 Q38 140 40 132 Z" fill="${C_.mustard}"/></g>
    <rect id="m-bot" x="30" y="172" width="240" height="46" rx="23" fill="${C_.mustard}"/>`;
  const ecWord = el('div', 'ec-word', ec); const ecW = words(el('div', 'ec-ar', ecWord, 'ستاك برجر'));
  const ecLat = el('div', 'ec-lat', ec, 'STAKK BURGER');

  // ------------------------------------------------ concept slate (visible from the end card to the last frame)
  const slate = el('div', 'slate', ui);
  const slAr = el('div', 'sl-ar', slate, 'إعلان تجريبي — علامة خيالية');
  const slMo = el('div', 'sl-mono', slate, 'CONCEPT AD — 02 / BURGER');

  // ------------------------------------------------ TASH signature (official sting, smaller wordmark, slate instead of tagline)
  const sg = el('div', 'sig', ui);
  const sting = createSting(sg, { width: W, height: H, logoW: 470, cy: 0.43, tagline: '', handle: '', theme: 'ink' });
  const sgSlate = el('div', 'sig-slate', sg);
  const sgAr = el('div', 'sig-ar', sgSlate, 'إعلان تجريبي — علامة خيالية');
  const sgMo = el('div', 'sig-mono', sgSlate, 'CONCEPT AD — 02 / BURGER');
  const sgHd = el('div', 'sig-hd', sgSlate, '@tash.creative.kw');
  const sgTop = el('div', 'sig-top', sg, 'TASH / 2026');

  const anchorScreen = a => project(a[0], a[1], a[2]);

  const WIDE = ['S03', 'S05', 'S07', 'S09'];
  function labelFrame(L, t, [t0, t1], extra = null, sid = '') {
    const on = t >= t0 - 0.01 && t < t1;
    L.box.style.display = on ? 'block' : 'none';
    const lineOn = on && WIDE.includes(sid);
    L.line.style.display = L.dot.style.display = L.ring.style.display = lineOn ? 'block' : 'none';
    if (!on) return;
    const heroStart = extra != null && L.key === 'cheese' ? t0 : t0 + 0.05;
    const supStart = extra != null ? extra : t0;
    popWords(L.sup, t, supStart, { stagger: 0.05, rise: 30, rot: 4 });
    popWords(L.hero, t, heroStart, { stagger: 0.07, rise: 70, rot: L.side === 'left' ? -5 : 5 });
    const exitK = outWords([...L.sup, ...L.hero], t, t1 - 0.14, { dur: 0.14 });
    // leader line: from the label's inner bottom corner down to the 3D anchor (tracked every frame)
    const bb = L.box.getBoundingClientRect(), rb = root.getBoundingClientRect();
    const sx = L.side === 'right' ? bb.left - rb.left + bb.width * 0.32 : bb.left - rb.left + bb.width * 0.68;
    const sy = bb.top - rb.top + bb.height + 18;
    const [ax, ay] = anchorScreen(L.anchor);
    const dk = E.outCubic(clamp((t - t0 - 0.08) / 0.32)) * exitK;
    const ex = lerp(sx, ax, dk), ey = lerp(sy, ay, dk);
    const mx = sx, my = lerp(sy, ey, 0.55);
    L.line.setAttribute('d', `M${sx.toFixed(1)} ${sy.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`);
    L.line.style.opacity = String(dk > 0.01 ? 1 : 0);
    const dp = spring(clamp((t - t0 - 0.36) / 0.5), { freq: 2.2, damp: 7 }) * exitK;
    L.dot.setAttribute('cx', ax.toFixed(1)); L.dot.setAttribute('cy', ay.toFixed(1)); L.dot.setAttribute('r', (9 * dp).toFixed(2));
    const rk = clamp((t - t0 - 0.36) / 0.45);
    L.ring.setAttribute('cx', ax.toFixed(1)); L.ring.setAttribute('cy', ay.toFixed(1)); L.ring.setAttribute('r', (9 + rk * 26).toFixed(1));
    L.ring.style.opacity = String((1 - rk) * 0.9 * (rk > 0 ? 1 : 0) * exitK);
  }

  function render(t, { clean = false, sid = '' } = {}) {
    ui.style.display = clean ? 'none' : 'block';
    if (clean) return;
    const T = C.text;
    // title (S02): words drop in on 16ths, squash on landing; exit downward with the whip
    const tOn = t >= T.title[0] && t < T.title[1];
    title.style.display = tOn ? 'block' : 'none';
    if (tOn) {
      tWords.forEach((s, i) => {
        const st = T.title[0] + i * 0.125, a = t - st;
        if (a < 0) { s.style.opacity = '0'; return; }
        const fall = clamp(a / 0.11), y = (1 - E.outCubic(fall)) * 54;  // rises into the empty slot below: never crosses the word above
        const sq = a > 0.11 ? 1 - 0.16 * Math.exp(-(a - 0.11) * 14) * Math.cos((a - 0.11) * 30) : 1;
        css(s, { opacity: String(clamp(a / 0.05)), transform: `translateY(${y.toFixed(1)}px) scale(${(2 - sq).toFixed(3)}, ${sq.toFixed(3)})` });
      });
      const wk = E.inCubic(sm(C.whip[0], T.title[1], t));
      css(title, { transform: `translateY(${(wk * 1500).toFixed(1)}px)`, filter: wk > 0.02 ? `blur(${(wk * 18).toFixed(1)}px)` : 'none' });
    }
    labelFrame(LB.heel, t, T.heel, null, sid);
    labelFrame(LB.patty, t, T.patty, null, sid);
    labelFrame(LB.cheese, t, T.cheese, T.cheeseSlow, sid);
    labelFrame(LB.crunch, t, T.crunch, null, sid);
    labelFrame(LB.sauce, t, T.sauce, null, sid);
    // «دبل!» — one word, big, lands with patty 2
    const dOn = t >= T.double[0] && t < T.double[1];
    dbl.style.display = dOn ? 'block' : 'none';
    if (dOn) { popWords(dblW, t, T.double[0], { rise: 120, rot: -8, from: 0.3 }); outWords(dblW, t, T.double[1] - 0.12, { dur: 0.12 }); }
    // hero offer
    const hOn = t >= T.product && t < C.endcard;
    prod.style.display = cta.style.display = hOn ? 'block' : 'none'; badge.style.display = hOn ? 'flex' : 'none';
    if (hOn) {
      popWords(prodW, t, T.product, { stagger: 0.08, rise: 50, rot: 3 });
      const bk = t < T.price ? 0 : spring(clamp((t - T.price) / 0.7), { freq: 1.8, damp: 5.5 });
      css(badge, { opacity: t < T.price ? '0' : '1', transform: `translate(-50%, -50%) rotate(${lerp(-40, -9, bk).toFixed(2)}deg) scale(${bk.toFixed(3)})` });
      const ck = t < T.cta ? 0 : spring(clamp((t - T.cta) / 0.6), { freq: 2, damp: 6 });
      const press = 1 - 0.07 * Math.exp(-Math.max(0, t - (T.cta + 0.5)) * 10) * (t > T.cta + 0.5 ? 1 : 0); // button "press" on the next beat
      css(cta, { opacity: t < T.cta ? '0' : '1', transform: `translateX(-50%) translateY(${((1 - ck) * 60).toFixed(1)}px) scale(${(lerp(0.7, 1, ck) * press).toFixed(3)})` });
      const nudge = Math.max(0, Math.sin((t - T.cta) * Math.PI * 4)) * 10 * (t > T.cta + 0.3 ? 1 : 0);
      arr.style.transform = `translateX(${(-nudge).toFixed(1)}px)`;
    }
    // client end card
    const eOn = t >= C.endcard && t < C.sting;
    ec.style.display = eOn ? 'block' : 'none';
    if (eOn) {
      const a = t - C.endcard;
      // match cut: frame 1 of the card shows the mark at the hero burger's size and place (≈ x 540, y 1010, 860 px wide),
      // then it flies up and settles into the lockup (outExpo, 0.5 s). The three layers keep a little stagger (drag).
      const mk = E.outExpo(clamp(a / 0.5)), drift = 1 + 0.025 * clamp((a - 0.5) / 0.5);
      const ms = lerp(2.85, 1, mk) * drift, mx = lerp(540, 540, mk), my = lerp(1010, 585, mk);
      css(mark, { transform: `translate(${(mx - 540).toFixed(1)}px, ${(my - 585).toFixed(1)}px) scale(${ms.toFixed(4)})`, transformOrigin: '50% 50%' });
      ['m-bot', 'm-mid', 'm-top'].forEach((id, i) => {
        const e = mark.querySelector('#' + id), st = i * 0.035, k = E.outCubic(clamp((a - st) / 0.3));
        const y = (1 - k) * (1 - i) * 30;                                  // layers start spread (exploded: bun down, crown up) and close up
        e.setAttribute('transform', `translate(0 ${y.toFixed(1)})`);
        e.setAttribute('opacity', '1');
      });
      css(ecWord, { transform: `scale(${drift.toFixed(4)})` });
      popWords(ecW, t, C.endcard + 0.2, { stagger: 0.09, rise: 50, rot: 3 });
      const lk = tw(t, C.endcard + 0.38, 0.4);
      css(ecLat, { opacity: String(lk), letterSpacing: `${lerp(0.5, 0.16, lk).toFixed(3)}em` });
    }
    // slate on the client end card
    const sOn = t >= T.slate && t < C.sting;
    slate.style.display = sOn ? 'block' : 'none';
    if (sOn) { const k = tw(t, T.slate + 0.15, 0.4); css(slate, { opacity: String(k), transform: `translateY(${((1 - k) * 14).toFixed(1)}px)` }); }
    // TASH signature
    const gOn = t >= C.sting;
    sg.style.display = gOn ? 'block' : 'none';
    if (gOn) {
      const st = t - C.sting;
      sting.render(st);
      const k1 = tw(st, 1.32, 0.5), k2 = tw(st, 1.45, 0.5), k3 = tw(st, 1.6, 0.5);
      css(sgAr, { opacity: String(k1), transform: `translateY(${((1 - k1) * 16).toFixed(1)}px)` });
      css(sgMo, { opacity: String(k2), letterSpacing: `${lerp(0.4, 0.24, k2).toFixed(3)}em` });
      css(sgHd, { opacity: String(k3) });
      css(sgTop, { opacity: String(tw(st, 0.2, 0.5) * 0.9) });
    }
  }
  return { render, el: ui };
}

/** Poster / cover (static): same hero world, designed layout, concept slate. */
export function createPoster(root, { W = 1080, H = 1920 } = {}) {
  const ui = el('div', 'ui poster', root);
  const t1 = el('div', 'po-title', ui);
  el('div', 'po-l1', t1, 'كل طبقة');
  el('div', 'po-l2', t1, 'لها سالفة');
  const badge = el('div', 'badge po-badge', ui);
  const bIn = el('div', 'b-in', badge); el('div', 'b-num', bIn, '٢٫٧٥٠'); el('div', 'b-cur', bIn, 'د.ك');
  const brand = el('div', 'po-brand', ui);
  el('div', 'po-ar', brand, 'ستاك برجر'); el('div', 'po-lat', brand, 'STAKK BURGER');
  const cta = el('div', 'cta po-cta', ui); const ci = el('div', 'cta-in', cta); el('span', 'cta-t', ci, 'اطلب الحين'); el('span', 'cta-a', ci, '←');
  const sl = el('div', 'po-slate', ui);   // inside the reel-safe area and the 3:4 grid crop
  el('div', 'po-sl-mono', sl, 'CONCEPT AD — 02 / BURGER   ·   TASH / 2026');
  el('div', 'po-sl-ar', sl, 'إعلان تجريبي — علامة خيالية');
  return { el: ui };
}
