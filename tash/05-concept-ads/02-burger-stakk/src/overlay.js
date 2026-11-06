// STAKK photoreal — 2D layer: kinetic Arabic labels (per word, never per letter) with leader lines that land on the
// real object in the footage, the stacked title, offer, client end card, concept slate and the TASH signature.
// Everything is a pure function of t. Positions are frame-space anchors measured on the conformed footage and
// mapped through the same camera the picture gets (main.js toScreen), so a dot sits on the patty, not near it.
import { clamp, lerp, E, tw, spring, css, words } from '/_system/motion/kit.js';
import { createSting } from '/_system/motion/endcard.js';

const C_ = { red: '#E23B2E', mustard: '#F2B705', cream: '#FFF3DC', char: '#1F1C19' };
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, cls, parent, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; if (parent) parent.appendChild(e); return e; };
const f1 = n => n.toFixed(1), f3 = n => n.toFixed(3);

/** word pop: scale/rotate/rise with spring, staggered right→left (DOM order = reading order) */
function popWords(spans, t, start, { stagger = 0.06, rise = 60, rot = 6, from = 0.55 } = {}) {
  spans.forEach((s, i) => {
    const a = t - (start + i * stagger);
    if (a < 0) { css(s, { opacity: '0', transform: 'translateY(40px) scale(.6)' }); return; }
    const k = spring(clamp(a / 0.6), { freq: 2.0, damp: 6.5 });
    // the spring overshoots in rise/rotation only: scale stops at 1 so neighbouring words never eat the space between them
    css(s, { opacity: String(clamp(a / 0.06)), transform: `translateY(${f1((1 - k) * rise)}px) rotate(${f3((1 - k) * rot)}deg) scale(${f3(lerp(from, 1, Math.min(1, k)))})` });
  });
}
function outWords(spans, t, start, { dur = 0.14, drop = -30 } = {}) {
  if (t < start) return 1;
  const k = E.inQuad(clamp((t - start) / dur));
  spans.forEach(s => { s.style.opacity = String(1 - k); s.style.transform += ` translateY(${f1(k * drop)}px) scale(${f3(1 - 0.15 * k)})`; });
  return 1 - k;
}

// ------------------------------------------------------------------------------------------- label layout
// Every label sits on calm ground (red seamless, dark griddle, charcoal) and never on food detail; sup and hero can
// arrive on different beats (the claim lands with the shot that proves it). anchors: per sequence, frame-space px.
const LABELS = [
  { key: 'heel', top: 820, sup: 'بريوش', hero: 'محمّص بالزبدة', supAt: 'heel', heroAt: +0.05, out: 'end',
    anchors: { S03: [230, 1300] } },                                 // the toasted top of the heel; the patty falls in after it exits
  { key: 'patty', top: 222, sup: 'سماش…', hero: 'أطرافه مقرمشة', heroSize: 120, heroLH: 1.0, supAt: 'patty', heroAt: 3.62, out: 4.11,
    anchors: { S03: [200, 1212], S04: [385, 600] } },               // «سماش…» on the landed patty; the crisp claim on the real lace (S04);
                                                                     // gone on the S05 cut so the falling cheddar never passes under it
  { key: 'cheese', top: 236, sup: '…على مهله', hero: 'تشيدر يذوب', heroFirst: true, supAt: 'cheeseSlow', heroAt: 0, out: 'end',
    anchors: { S05: [92, 1190], S06: [565, 1108] } },               // slice corner, then the drip as it leaves the cheese
  { key: 'crunch', top: 236, sup: 'مخلل وبصل…', hero: 'يقرمشون', supAt: 'pickles', heroAt: 'onions', out: 7.01,
    anchors: { S07b: [262, 792], S07c: [300, 995] } },              // the left pickle (landed, then settled); «يقرمشون» on the onion's landing;
                                                                     // gone on the S08 cut: the sauce stream falls right where «يقرمشون» sits
  { key: 'sauce', top: 236, sup: 'صوص ستاك', hero: 'السرّي', supAt: 'sauce', heroAt: +0.05, out: 8.06,
    anchors: { S08: [560, 760] } },                                  // the pool; exits before the crown falls through (8.17)
];

export function createOverlay(ui, C, { W = 1080, H = 1920, toScreen, whipShift, seqFor, clean = false, layers }) {
  const T = C.text, D = C.drops;
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'lines'); ui.appendChild(svg);
  // vertical-only blur for type that rides the whip (same travel axis as the picture's smear)
  const defs = document.createElementNS(NS, 'svg'); defs.setAttribute('width', '0'); defs.setAttribute('height', '0'); defs.style.position = 'absolute';
  defs.innerHTML = '<filter id="vblur" x="-10%" y="-60%" width="120%" height="220%" color-interpolation-filters="sRGB"><feGaussianBlur id="vblur-g" stdDeviation="0 0"/></filter>';
  ui.appendChild(defs); const vg = defs.querySelector('#vblur-g');

  // ------------------------------------------------ title: four words stacked like layers on the dark griddle
  const title = el('div', 'title', ui); css(title, { top: '246px' });
  const tWords = ['كل', 'طبقة', 'لها', 'سالفة'].map((w, i) => { const line = el('div', 'tline', title); const s = el('span', 'tw ' + (i % 2 ? 'mus' : 'cre'), line, w); css(s, { fontSize: '124px' }); css(line, { height: '132px' }); return s; });

  // ------------------------------------------------ labels
  const LB = LABELS.map(cfg => {
    const box = el('div', 'label left', ui); box.style.top = cfg.top + 'px';
    const a = el('div', 'l-sup pill', null, cfg.sup); const b = el('div', 'l-hero', null, cfg.hero);
    if (cfg.heroSize) css(b, { fontSize: cfg.heroSize + 'px' }); if (cfg.heroLH) css(b, { lineHeight: String(cfg.heroLH) });
    if (cfg.heroFirst) { box.appendChild(b); box.appendChild(el('div', '')).appendChild(a); } else { box.appendChild(el('div', '')).appendChild(a); box.appendChild(b); }
    const line = document.createElementNS(NS, 'path'); line.setAttribute('class', 'leader'); svg.appendChild(line);
    const dot = document.createElementNS(NS, 'circle'); dot.setAttribute('class', 'ldot'); svg.appendChild(dot);
    const ring = document.createElementNS(NS, 'circle'); ring.setAttribute('class', 'lring'); svg.appendChild(ring);
    return { ...cfg, box, supS: [a], heroS: words(b), heroEl: b, supEl: a, line, dot, ring };
  });
  const when = (v, base) => (typeof v === 'string' ? (D[v] ?? T[v]) : typeof v === 'number' && Math.abs(v) < 1 ? base + v : v);
  const win = L => T[L.key];

  // ------------------------------------------------ «دبل!» over the finished double stack (S07a)
  const dbl = el('div', 'double', ui); css(dbl, { top: '560px' }); const dblW = words(el('div', 'd-hero', dbl, 'دبل!'));

  // ------------------------------------------------ hero offer: all in the red band above the crown (never on the food)
  const prod = el('div', 'product', ui); css(prod, { right: '72px', top: '236px', textAlign: 'right' });
  const prodEl = el('div', 'p-hero', prod, 'ستاك دبل'); css(prodEl, { fontSize: '120px' }); const prodW = words(prodEl);
  const badge = el('div', 'badge', ui); css(badge, { left: '84px', top: '246px' });
  const bIn = el('div', 'b-in', badge); el('div', 'b-num', bIn, '٢٫٧٥٠'); el('div', 'b-cur', bIn, 'د.ك');
  const cta = el('div', 'cta', ui); css(cta, { right: '72px', top: '414px' });
  const ctaIn = el('div', 'cta-in', cta); el('span', 'cta-t', ctaIn, 'اطلب الحين'); const arr = el('span', 'cta-a', ctaIn, '←');

  // ------------------------------------------------ client end card (under the vignette, like the footage)
  const ec = layers.ec;
  const mark = document.createElementNS(NS, 'svg'); mark.setAttribute('viewBox', '0 0 300 230'); mark.setAttribute('class', 'mark'); ec.appendChild(mark);
  mark.innerHTML = `<path id="m-top" d="M30 96 C30 40 85 10 150 10 C215 10 270 40 270 96 Q270 104 262 104 H38 Q30 104 30 96 Z" fill="${C_.mustard}"/>
    <g id="m-mid"><rect x="16" y="118" width="268" height="40" rx="20" fill="${C_.char}"/><path d="M40 132 H250 Q256 132 252 138 L232 158 Q226 166 222 156 L216 144 Q212 138 206 144 L196 152 Q190 158 186 150 L180 140 H52 Q38 140 40 132 Z" fill="${C_.mustard}"/></g>
    <rect id="m-bot" x="30" y="172" width="240" height="46" rx="23" fill="${C_.mustard}"/>`;
  const ecWord = el('div', 'ec-word', ec); const ecW = words(el('div', 'ec-ar', ecWord, 'ستاك برجر'));
  const ecLat = el('div', 'ec-lat', ec, 'STAKK BURGER');
  // the hero burger's silhouette on the last S10 frame (screen px, measured on the conformed footage): the mark is born
  // exactly over it, then flies into the lockup
  const HERO_BOX = { cx: 556, cy: 1102, w: 1046, h: 1008 };
  const MARK = { cx: 540, cy: 584, w: 268, h: 208 };

  // ------------------------------------------------ concept slate (end card → last frame)
  const slate = el('div', 'slate', ui);
  el('div', 'sl-ar', slate, 'إعلان تجريبي — علامة خيالية');
  el('div', 'sl-mono', slate, 'CONCEPT AD — 02 / BURGER');

  // ------------------------------------------------ TASH signature (official sting, smaller wordmark, slate instead of tagline)
  const sg = layers.sig;
  const sting = createSting(sg, { width: W, height: H, logoW: 470, cy: 0.43, tagline: '', handle: '', theme: 'ink' });
  const sgSlate = el('div', 'sig-slate', sg);
  const sgAr = el('div', 'sig-ar', sgSlate, 'إعلان تجريبي — علامة خيالية');
  const sgMo = el('div', 'sig-mono', sgSlate, 'CONCEPT AD — 02 / BURGER');
  const sgHd = el('div', 'sig-hd', sgSlate, '@tash.creative.kw');
  const sgTop = el('div', 'sig-top', sg, 'TASH / 2026');

  // determinism: words() marks spans will-change:transform, which lets Chromium keep a stale raster scale between seeks
  for (const sp of ui.querySelectorAll('.w')) sp.style.willChange = 'auto';
  for (const sp of ec.querySelectorAll('.w')) sp.style.willChange = 'auto';

  function textBox(spans) {
    let x0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of spans) { if (s.style.opacity === '0') continue; const r = s.getBoundingClientRect(); x0 = Math.min(x0, r.left); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); }
    return x1 < x0 ? null : { x0, x1, y1 };
  }

  function labelFrame(L, t) {
    const [t0, t1] = win(L);
    const on = t >= t0 - 0.01 && t < t1;
    L.box.style.display = on ? 'block' : 'none';
    const seq = seqFor(t), A = L.anchors[seq];
    const lineOn = on && !!A;
    L.line.style.display = L.dot.style.display = L.ring.style.display = lineOn ? 'block' : 'none';
    if (!on) return;
    const supAt = when(L.supAt, t0), heroAt = when(L.heroAt, L.heroFirst ? t0 : supAt);
    const first = L.heroFirst ? heroAt : supAt;
    popWords(L.supS, t, supAt, { stagger: 0.05, rise: 30, rot: 4 });
    popWords(L.heroS, t, heroAt, { stagger: 0.07, rise: 70, rot: -5 });
    const outAt = L.out === 'end' ? t1 - 0.14 : L.out;
    const exitK = outWords([...L.supS, ...L.heroS], t, outAt, { dur: 0.14 });
    if (!lineOn) return;
    // leader: from under the visible words down to the object; re-targets on a cut (the dot jumps with the picture)
    const rb = ui.getBoundingClientRect();
    const tb = textBox(L.heroFirst ? [...L.heroS, ...L.supS] : [...L.supS, ...L.heroS]);
    if (!tb) { L.line.style.opacity = '0'; L.dot.setAttribute('r', '0'); L.ring.style.opacity = '0'; return; }
    const sx = tb.x0 - rb.left + (tb.x1 - tb.x0) * 0.3, sy = tb.y1 - rb.top + 16;
    const [ax, ay] = toScreen(seq, t, A[0], A[1]);
    // draw-on starts with the label or with the shot, whichever is later
    const shotStart = { S04: 3.9, S06: 4.9, S07c: 6.65 }[seq] ?? first;
    const s0 = Math.max(first, shotStart);
    const dk = E.outCubic(clamp((t - s0 - 0.04) / 0.28)) * exitK;
    const ex = lerp(sx, ax, dk), ey = lerp(sy, ay, dk);
    const mx = sx, my = lerp(sy, ey, 0.55);
    L.line.setAttribute('d', `M${f1(sx)} ${f1(sy)} Q${f1(mx)} ${f1(my)} ${f1(ex)} ${f1(ey)}`);
    L.line.style.opacity = dk > 0.01 ? '1' : '0';
    const dp = spring(clamp((t - s0 - 0.3) / 0.5), { freq: 2.2, damp: 7 }) * exitK;
    L.dot.setAttribute('cx', f1(ax)); L.dot.setAttribute('cy', f1(ay)); L.dot.setAttribute('r', f3(9 * dp));
    const rk = clamp((t - s0 - 0.3) / 0.45);
    L.ring.setAttribute('cx', f1(ax)); L.ring.setAttribute('cy', f1(ay)); L.ring.setAttribute('r', f1(9 + rk * 26));
    L.ring.style.opacity = String((1 - rk) * 0.9 * (rk > 0 ? 1 : 0) * exitK);
  }

  function render(t) {
    for (const e of [ui, ec, sg]) e.style.display = clean ? 'none' : (e === ui ? 'block' : e.style.display);
    if (clean) return;
    // title (S02): words rise into place on 16ths, squash on landing; exit riding the whip (same travel, vertical blur)
    const tOn = t >= T.title[0] && t < C.drops.heel;
    title.style.display = tOn ? 'block' : 'none';
    if (tOn) {
      tWords.forEach((s, i) => {
        const st = T.title[0] + i * 0.125, a = t - st;
        if (a < 0) { s.style.opacity = '0'; return; }
        const fall = clamp(a / 0.11), y = (1 - E.outCubic(fall)) * 54;  // rises into its own slot: never crosses the word above
        const sq = a > 0.11 ? 1 - 0.16 * Math.exp(-(a - 0.11) * 14) * Math.cos((a - 0.11) * 30) : 1;
        css(s, { opacity: String(clamp(a / 0.05)), transform: `translateY(${f1(y)}px) scale(${f3(2 - sq)}, ${f3(sq)})` });
      });
      const sh = whipShift(t), v = Math.abs(whipShift(t + 1 / 60) - whipShift(t - 1 / 60));
      css(title, { transform: `translateY(${f1(sh)}px)`, filter: v > 2 ? 'url(#vblur)' : 'none' });
      vg.setAttribute('stdDeviation', `0 ${f1(Math.min(90, v * 0.3))}`);
    }
    for (const L of LB) labelFrame(L, t);
    // «دبل!» — one word, big, lands with the double (patty2)
    const dOn = t >= T.double[0] && t < T.double[1];
    dbl.style.display = dOn ? 'block' : 'none';
    if (dOn) { popWords(dblW, t, T.double[0], { rise: 120, rot: -8, from: 0.3 }); outWords(dblW, t, T.double[1] - 0.12, { dur: 0.12 }); }
    // hero offer
    const hOn = t >= T.product && t < C.endcard;
    prod.style.display = cta.style.display = hOn ? 'block' : 'none'; badge.style.display = hOn ? 'flex' : 'none';
    if (hOn) {
      popWords(prodW, t, T.product, { stagger: 0.08, rise: 50, rot: 3 });
      const bk = t < T.price ? 0 : spring(clamp((t - T.price) / 0.7), { freq: 1.8, damp: 5.5 });
      css(badge, { opacity: t < T.price ? '0' : '1', transform: `rotate(${f3(lerp(-40, -9, bk))}deg) scale(${f3(bk)})` });
      const ck = t < T.cta ? 0 : spring(clamp((t - T.cta) / 0.6), { freq: 2, damp: 6 });
      const press = 1 - 0.07 * Math.exp(-Math.max(0, t - (T.cta + 0.5)) * 10) * (t > T.cta + 0.5 ? 1 : 0); // button "press" on the next beat
      css(cta, { opacity: t < T.cta ? '0' : '1', transformOrigin: '100% 50%', transform: `translateY(${f1((1 - ck) * 50)}px) scale(${f3(lerp(0.7, 1, ck) * press)})` });
      const nudge = Math.max(0, Math.sin((t - T.cta) * Math.PI * 4)) * 10 * (t > T.cta + 0.3 ? 1 : 0);
      arr.style.transform = `translateX(${f1(-nudge)}px)`;
    }
    // client end card: the mark is born on the hero burger's silhouette (match cut), then closes into the lockup
    const eOn = t >= C.endcard && t < C.sting;
    ec.style.display = eOn ? 'block' : 'none';
    if (eOn) {
      const a = t - C.endcard;
      const mk = E.outExpo(clamp(a / 0.5)), drift = 1 + 0.025 * clamp((a - 0.5) / 0.5);
      const sx = lerp(HERO_BOX.w / MARK.w, 1, mk) * drift, sy = lerp(HERO_BOX.h / MARK.h, 1, mk) * drift;
      const mx = lerp(HERO_BOX.cx, MARK.cx, mk), my = lerp(HERO_BOX.cy, MARK.cy, mk);
      css(mark, { transform: `translate(${f1(mx - MARK.cx)}px, ${f1(my - MARK.cy)}px) scale(${f3(sx)}, ${f3(sy)})`, transformOrigin: '50% 49.6%' });
      ['m-bot', 'm-mid', 'm-top'].forEach((id, i) => {
        const e = mark.querySelector('#' + id);
        e.setAttribute('transform', `translate(0 ${f1(Math.sin(Math.PI * mk) * (1 - i) * 7)})`);   // born in place (over the real burger); the layers drag a little in flight
      });
      css(ecWord, { transform: `scale(${f3(drift)})` });
      popWords(ecW, t, C.endcard + 0.2, { stagger: 0.09, rise: 50, rot: 3 });
      const lk = tw(t, C.endcard + 0.38, 0.4);
      css(ecLat, { opacity: String(lk), letterSpacing: `${f3(lerp(0.5, 0.16, lk))}em` });
    }
    const sOn = t >= T.slate && t < C.sting;
    slate.style.display = sOn ? 'block' : 'none';
    if (sOn) { const k = tw(t, T.slate + 0.15, 0.4); css(slate, { opacity: String(k), transform: `translateY(${f1((1 - k) * 14)}px)` }); }
    // TASH signature
    const gOn = t >= C.sting;
    sg.style.display = gOn ? 'block' : 'none';
    if (gOn) {
      const st = t - C.sting;
      sting.render(st);
      const k1 = tw(st, 1.32, 0.5), k2 = tw(st, 1.45, 0.5), k3 = tw(st, 1.6, 0.5);
      css(sgAr, { opacity: String(k1), transform: `translateY(${f1((1 - k1) * 16)}px)` });
      css(sgMo, { opacity: String(k2), letterSpacing: `${f3(lerp(0.4, 0.24, k2))}em` });
      css(sgHd, { opacity: String(k3) });
      css(sgTop, { opacity: String(tw(st, 0.2, 0.5) * 0.9) });
    }
  }
  return { render };
}

/** Poster / reel cover (static): photoreal hero on its own seamless, designed type, concept slate.
 *  Everything that must read sits inside the reel-safe area (220–1500) and inside the profile grid's centre 3:4 (240–1680). */
export async function createPoster(root) {
  const ui = el('div', 'poster', root);
  const sl = el('div', 'po-sl', ui); css(sl, { top: '296px' });
  el('div', 'po-sl-mono', sl, 'CONCEPT AD — 02 / BURGER   ·   TASH / 2026');
  el('div', 'po-sl-ar', sl, 'إعلان تجريبي — علامة خيالية');
  const t1 = el('div', 'po-title', ui); css(t1, { top: '386px' });
  el('div', 'po-l1', t1, 'كل طبقة'); el('div', 'po-l2', t1, 'لها سالفة');
  const brand = el('div', 'po-brand', ui); css(brand, { position: 'absolute', top: '1362px', left: '0', right: '0', textAlign: 'center' });
  const ar = el('div', 'ec-ar', brand, 'ستاك برجر'); css(ar, { fontSize: '84px', lineHeight: '1.15', textShadow: '0 6px 0 #1F1C19' });
  const lat = el('div', 'ec-lat', brand, 'STAKK BURGER'); css(lat, { position: 'static', fontSize: '32px', marginTop: '6px' });
  return { el: ui };
}
