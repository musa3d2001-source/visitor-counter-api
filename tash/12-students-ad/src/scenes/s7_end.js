// s7_end — builder B. The end card on TASH ink (f762–877), composed as a poster that also works as the reel cover.
//
// On the cut the wordmark (the logo from /_system/brand/logo.mjs, never typed) wipes in right→left and slams, while its
// three lime dots type in a small bubble above it like the brand sting, then drop into the ش; the shadda lands last.
// «للطلاب» snaps under it as the same sticker as in the splash (inverted: lime on ink). Then the short tagline, the CTA
// as a paper button, and the two handles (Arabic label + the handle as its own isolated LTR run, the «@» on its left).
// (fix round) Hierarchy: logo → «للطلاب» → the CTA (a lime pill, ink type, 64 px) → the handles (46 px, paper labels)
// → «بس مو آخر ليلة.» (82 px, its own beat: per word with the voice, a lime underline drawing under it); the tagline is
// quiet (44 px). Nothing sits below y ~1500 (the platform caption rows) and nothing reaches x 920 in the lower half.
// The whole card keeps moving: a 3 % ease-in push to the last frame and, behind it, the parade's fan drifting at ~13 %.
// The dots answer the sonic logo: one hop per typing tick (after the last word), a pulse on the hit (the music's bar
// line), three small hops on the answer ticks; the CTA pulses once on the hit.
import * as K from '../kit.js';
import * as L from '/_system/brand/logo.mjs';

const NS = 'http://www.w3.org/2000/svg';
const LIME = '#C6FF00', PAPER = '#F5F5E9', CHAR = '#1A1A18';
const WM = { w: 560, top: 372 };
const Y = { chip: 748, tag: 858, cta: 990, ig: 1122, tt: 1190, e2: 1352 };
const FAN = ['deck-school-01-title', 'report-01-cover', 'deck-uni-01-title', 'poster-recycle', 'cv-student', 'sheet-dashboard'];
const clamp = K.clamp, lerp = K.lerp, E = K.E;
const f2 = v => (+v).toFixed(2);
const sprF = (n, w = 0.55, d = 2.8) => (n <= 0 ? 0 : 1 - Math.exp(-n / d) * Math.cos(w * n));
function sv(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

export default {
  id: 's7_end',

  async mount(root, ctx) {
    const s = this.s = {};
    await ctx.loadCSS(new URL('./s7_end.css', import.meta.url));
    const ev = id => ctx.ev(id);
    const key = ctx.cues.key;
    const sfx = Object.fromEntries(ctx.cues.sfx.map(x => [x.name, x.frame]));
    const G = ctx.G;
    s.F = { in: ctx.scene.in, out: ctx.scene.out, hit: key.logo_hit, ticks: sfx.sonic_logo_ticks };
    // the sonic logo's typing ticks are three 16ths from beat 55; its answer ticks three 16ths from beat 57 (audio.py)
    const s16 = G.beat / 4;
    // (fix round) the typing ticks come AFTER the last word (vo_last_end + 0.02, three ticks 0.09 s apart); the answer
    // ticks a beat after the hit (audio.py: the music's logical beat 57 = film beat 58)
    s.tickF = [0, 1, 2].map(j => Math.round((ctx.vo.vo_last_end + 0.02 + j * 0.09) * 30));
    s.ansF = [0, 1, 2].map(j => Math.round((G.t(58) + j * s16) * 30));
    root.classList.add('s7-root');
    // the parade's fan, far behind and faint, drifting (the card never freezes)
    s.fan = K.el(root, 'div', 'layer s7-fan');
    s.fanCards = await Promise.all(FAN.map(async (n, i) => {
      const url = new URL(`../assets/s4_parade/${n}.jpg`, import.meta.url).href; const dec = await K.img(url);
      const im = K.el(s.fan, 'img', 's7-fc'); im.src = url; im.decoding = 'sync';
      const w = n.startsWith('deck') || n.startsWith('sheet') ? 520 : 330;
      const h = w * (dec.naturalHeight / dec.naturalWidth);
      K.css(im, { width: w + 'px', height: h.toFixed(1) + 'px' });
      return { el: im, w, h, a: (i - (FAN.length - 1) / 2) * 11.5 };
    }));
    K.el(root, 'div', 's7-glow');
    s.all = K.el(root, 'div', 'layer');                      // everything but the background (the slow push)

    // ---- the wordmark: paper body, lime dots (canonical on-ink colourway)
    s.svg = sv('svg', { class: 's7-svg', viewBox: '0 0 1080 1920', width: 1080, height: 1920 }); s.all.appendChild(s.svg);
    const defs = sv('defs', {}, s.svg);
    const cp = sv('clipPath', { id: 's7-wipe' }, defs);
    s.wipe = sv('rect', { x: 0, y: -400, width: L.VB.w, height: L.VB.h + 800 }, cp);
    const sc = s.sc = WM.w / L.VB.w;
    s.wmX = 540 - WM.w / 2; s.wmY = WM.top;
    s.bubble = sv('path', { fill: CHAR }, s.svg);
    s.ring = sv('circle', { fill: 'none', stroke: LIME, 'stroke-width': 5 }, s.svg);
    s.wm = sv('g', { transform: `translate(${f2(s.wmX)} ${f2(s.wmY)}) scale(${sc.toFixed(5)})` }, s.svg);
    s.body = sv('g', { 'clip-path': 'url(#s7-wipe)' }, s.wm);
    s.body.innerHTML = L.wordmarkInner({ body: PAPER, dot: 'none', ids: true });
    s.body.querySelector('#tash-dots')?.remove();
    s.shadda = s.body.querySelector('#tash-shadda'); s.shaddaBase = s.shadda.getAttribute('transform');
    s.logoDots = L.dots().map(d => ({ x: s.wmX + d.cx * sc, y: s.wmY + d.cy * sc, r: d.r * sc }));
    s.dots = s.logoDots.map(() => sv('circle', { fill: LIME }, s.svg));
    // the typing bubble sits just above the wordmark, centred (the sting's bubble, compressed)
    s.bub = { cx: 540, cy: WM.top - 52, w: 236, h: 112 };
    s.typ = [1, 0, -1].map(k => [540 + k * 62, s.bub.cy]);

    // ---- «للطلاب» sticker
    const chipEv = ev('end.line');
    s.chip = K.el(s.all, 'div', 's7-abs s7-chip', {}, chipEv.text); s.chip.dir = 'rtl'; s.chip.dataset.safe = '1';
    K.css(s.chip, { left: f2(540 - s.chip.offsetWidth / 2) + 'px', top: f2(Y.chip - s.chip.offsetHeight / 2) + 'px' });
    s.chipEv = chipEv;

    // ---- tagline (per word), CTA (paper button), handles (label + isolated LTR run), the wink (per word)
    const tg = ev('end.tagline');
    s.tag = K.kinetic(s.all, { text: tg.text, land: tg.land - 4, out: null }, { y: Y.tag, size: 44, weight: 600, color: '#C9CABD', style: 'rise', stagger: 2, dur: 6 });
    s.tagEv = tg;
    const cta = ev('end.cta');
    s.cta = K.el(s.all, 'div', 's7-cta'); s.cta.dir = 'rtl'; s.cta.dataset.safe = '1';
    s.ctaSheen = K.el(s.cta, 'i', 'sheen');
    // the em dash (U+2014, as in script.json) is drawn from IBM Plex Sans Arabic, a full-length rule (Alexandria's is short)
    const di = cta.text.indexOf('—');
    const ct = K.el(s.cta, 'span');
    ct.appendChild(document.createTextNode(cta.text.slice(0, di)));
    K.el(ct, 'span', 's7-dash', {}, '—');
    ct.appendChild(document.createTextNode(cta.text.slice(di + 1)));
    console.assert(ct.textContent === cta.text, 'CTA text changed');
    K.css(s.cta, { left: f2(540 - s.cta.offsetWidth / 2) + 'px', top: f2(Y.cta - s.cta.offsetHeight / 2) + 'px' });
    s.ctaW = s.cta.offsetWidth; s.ctaEv = cta;
    const handle = (e, y) => {
      const i = e.text.indexOf(': ');
      const row = K.el(s.all, 'div', 's7-abs s7-h'); row.dir = 'rtl'; row.dataset.safe = '1';
      K.el(row, 'span', 'lab', {}, e.text.slice(0, i + 1));
      row.appendChild(document.createTextNode(' '));
      K.ltr(e.text.slice(i + 2), row);                       // «‎@tash.creative.kw» as its own LTR run: the @ stays on its left
      K.css(row, { left: f2(540 - row.offsetWidth / 2) + 'px', top: f2(y - row.offsetHeight / 2) + 'px' });
      return { el: row, ev: e };
    };
    s.ig = handle(ev('end.ig'), Y.ig);
    s.tt = handle(ev('end.tt'), Y.tt);
    const e2 = ev('E2');
    s.e2 = K.kinetic(s.all, { text: e2.text, land: e2.land, out: null, words: e2.words }, { y: Y.e2, size: 82, weight: 800, color: PAPER, style: 'pop', dur: 3,
      maxWidth: 760, shadow: '0 6px 26px rgba(0,0,0,.5)' });
    s.e2Ev = e2;
    s.ul = K.el(s.all, 'div', 's7-ul', { left: f2(540 - s.e2.width / 2 + 8) + 'px', top: f2(Y.e2 + s.e2.height * 0.36) + 'px', width: f2(s.e2.width - 16) + 'px' });
  },

  seek(tl, ctx) {
    const s = this.s, f = ctx.f, F = s.F, t = ctx.t;
    // (fix round) one slow ease-in push on the whole card, to the last frame (3 %)
    const pu = clamp((f - F.in) / (F.out - 1 - F.in));
    s.all.style.transform = `scale(${(1 + 0.03 * (0.4 * pu + 0.6 * pu * pu)).toFixed(5)})`;
    s.all.style.transformOrigin = '540px 940px';
    // the fan behind: fans open a touch and drifts up, at ~13 % (ink over it)
    const fd = (f - F.in) / 30;
    s.fanCards.forEach((c, i) => {
      const a = c.a * (1 + 0.05 * fd) + 1.2 * Math.sin(fd * 0.9 + i);
      const rad = a * Math.PI / 180, R = 1250, px = 540, py = 2050 - 14 * fd;
      const x = px + R * Math.sin(rad) - c.w / 2, y = py - R * Math.cos(rad) - c.h;
      c.el.style.transform = `translate(${f2(x)}px, ${f2(y)}px) rotate(${f2(a)}deg)`;
    });
    s.fan.style.opacity = (0.13 * E.outCubic(clamp((f - F.in) / 10))).toFixed(3);

    // ---- wordmark body: right → left wipe + slam (the sting's move), on the cut
    const a = f - F.in;
    const wk = E.outExpo(clamp((a + 1.5) / 5));
    s.wipe.setAttribute('x', f2((1 - wk) * L.VB.w)); s.wipe.setAttribute('width', f2(wk * L.VB.w + 10));
    const slam = sprF(a + 1.5, 0.55, 2.6), ss = lerp(1.12, 1, slam);
    const ox = L.VB.w / 2, oy = L.VB.h * 0.6;
    s.body.setAttribute('transform', `translate(${ox} ${oy}) scale(${ss.toFixed(4)}) translate(${-ox} ${-oy})`);
    // the shadda lands last, after the dots
    const SH = F.in + 12, sk = f < SH ? 0 : sprF(f - SH, 0.6, 2.4);
    s.shadda.setAttribute('transform', `${s.shaddaBase} translate(0 ${f2((1 - sk) * -280)})`);
    s.shadda.setAttribute('opacity', f < SH ? '0' : clamp((f - SH) / 2).toFixed(2));

    // ---- the typing bubble and the dots: type (f762–768), converge into the ش (f768–773), land, then answer the logo
    const B = s.bub, bIn = sprF(a, 0.6, 2.6), bOut = E.inBack(clamp((f - (F.in + 5)) / 5), 1.4);
    const k = Math.max(0, bIn * (1 - bOut));
    if (k > 0.01) {
      const w = B.w * k, h = B.h * k, r = h / 2, x = B.cx - w / 2, y = B.cy - h / 2;
      s.bubble.setAttribute('d', `M${f2(x + r)} ${f2(y)}H${f2(x + w - r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + w - r)} ${f2(y + h)}H${f2(x + r)}A${f2(r)} ${f2(r)} 0 0 1 ${f2(x + r)} ${f2(y)}Z` +
        `M${f2(x + w - r * 0.55)} ${f2(y + h - 6 * k)}q${f2(16 * k)} ${f2(24 * k)} ${f2(40 * k)} ${f2(27 * k)}q${f2(-27 * k)} ${f2(-22 * k)} ${f2(-24 * k)} ${f2(-52 * k)}z`);
      s.bubble.style.display = 'inline';
    } else s.bubble.style.display = 'none';
    const C0 = F.in + 6, C1 = F.in + 11;                      // converge window
    s.dots.forEach((c, i) => {
      const A = s.typ[i], D = s.logoDots[i];
      const ap = sprF(a - i * 1.2, 0.6, 2.4);
      const conv = E.inOutCubic(clamp((f - (C0 + i * 0.6)) / (C1 - C0)));
      const bob = conv < 1 ? K.typing(a / 30, i, { period: 0.36, amp: 16, phase: 0.08 }) * (1 - conv) : 0;
      const arc = Math.sin(conv * Math.PI) * -34 * (1 + i * 0.25);
      let x = lerp(A[0], D.x, conv), y = lerp(A[1] + bob, D.y, conv) + arc;
      let r = lerp(19, D.r, conv) * Math.max(0, ap), sx = 1, sy = 1;
      const land = f - (C1 + i * 0.6);
      if (land >= 0) { const q = Math.exp(-land / 2.2) * Math.cos(land * 1.2); sx = 1 + 0.3 * q; sy = 1 - 0.26 * q; }
      // the sonic logo: a hop per typing tick, a pulse on the hit, little hops on the answer ticks (dots only)
      let hop = 0, pulse = 1;
      for (const [fs, amp] of [[s.tickF[i], 14], [s.ansF[i], 7]]) { const d = f - fs; if (d >= 0 && d < 8) hop -= amp * Math.sin(Math.PI * d / 8); }
      const dh = f - F.hit;
      if (dh >= 0) { pulse = 1 + 0.16 * Math.exp(-dh / 3) * Math.cos(dh * 0.9 - 0.2); hop -= 10 * Math.exp(-dh / 2.6) * Math.max(0, Math.sin(dh * 0.95 + 0.6)); }
      c.setAttribute('cx', f2(x)); c.setAttribute('cy', f2(y + hop));
      c.setAttribute('r', f2(Math.max(0, r * pulse)));
      c.setAttribute('transform', sx !== 1 ? `translate(${f2(x)} ${f2(y + hop)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${f2(-x)} ${f2(-y - hop)})` : '');
    });
    // the ring the hit sends out from the ش
    const dh = f - F.hit;
    if (dh >= 0 && dh < 16) {
      const D = s.logoDots[1];
      s.ring.style.display = 'inline';
      s.ring.setAttribute('cx', f2(D.x)); s.ring.setAttribute('cy', f2(D.y));
      s.ring.setAttribute('r', f2(40 + 150 * E.outCubic(dh / 16)));
      s.ring.setAttribute('stroke-opacity', (0.55 * (1 - dh / 16)).toFixed(3));
      s.ring.setAttribute('stroke-width', f2(lerp(6, 1.5, dh / 16)));
    } else s.ring.style.display = 'none';

    // ---- «للطلاب» sticker snaps on
    const ce = s.chipEv, ck = clamp((f - ce.in + 1) / (ce.land - ce.in + 1));
    K.css(s.chip, { opacity: clamp(ck * 3).toFixed(3),
      transform: `rotate(${f2(lerp(-14, -3, E.outBack(ck, 2.4)))}deg) scale(${Math.max(0.01, lerp(0.4, 1, E.outBack(ck, 2.6))).toFixed(4)})` });

    // ---- tagline, CTA, handles, the wink
    s.tag.render(t);
    const c = s.ctaEv, cq = clamp((f - c.in) / (c.land - c.in));
    s.cta.style.display = f >= c.in ? 'inline-flex' : 'none';
    const pl = f - F.hit, pulse = pl >= 0 && pl < 8 ? 1 + 0.06 * Math.sin(Math.PI * pl / 8) : 1;   // one pulse on the logo hit
    K.css(s.cta, { opacity: clamp(cq * 2.5).toFixed(3), transform: `translateY(${f2((1 - E.outCubic(cq)) * 30)}px) scale(${(lerp(0.7, 1, E.outBack(cq, 2)) * pulse).toFixed(4)})` });
    const sw = clamp((f - (c.land + 15)) / 12);                // one lime sheen across the button
    s.ctaSheen.style.transform = `translateX(${f2(lerp(-0.4, 3.2, E.inOutCubic(sw)) * s.ctaW * 0.34)}px)`;
    s.ctaSheen.style.opacity = sw > 0 && sw < 1 ? '1' : '0';
    for (const h of [s.ig, s.tt]) {
      const q = clamp((f - h.ev.in) / (h.ev.land - h.ev.in));
      K.css(h.el, { display: f >= h.ev.in ? 'block' : 'none', opacity: clamp(q * 2).toFixed(3), transform: `translateY(${f2((1 - E.outCubic(q)) * 26)}px)` });
    }
    s.e2.render(t);
    // the lime underline draws right → left under «بس مو آخر ليلة.» with the voice
    const w = s.e2Ev.words, ul = E.outCubic(clamp((f - w[0].land) / (w[w.length - 1].land + 4 - w[0].land)));
    K.css(s.ul, { transform: `scaleX(${ul.toFixed(4)})`, opacity: ul > 0 ? '1' : '0' });
  },
};
