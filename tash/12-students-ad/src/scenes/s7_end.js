// s7_end — builder B. The end card on TASH ink (f762–877), composed as a poster that also works as the reel cover.
//
// On the cut the wordmark (the logo from /_system/brand/logo.mjs, never typed) wipes in right→left and slams with its
// three lime dots already in the ش (fix round: they pop in place and type there for ~0.4 s; it never reads «طس»); the
// shadda lands last.
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
// (fix round) the stack: logo → «للطلاب» → the quiet tagline → the CTA pill (above y 900, so it can be wide without
// touching the right-hand button column) → the handles → «بس مو آخر ليلة.»; all key ink inside y 300–1500, x <= 920
// below y 900
// (fix round 2) one spacing rhythm, measured on the ink: 24 px under the wordmark, 24 under «للطلاب», 40 above the CTA,
// 56 above the handles, 64 above «بس مو آخر ليلة.»; the stack is centred on y ≈ 900 (positions computed at mount)
const WM = { w: 520, top: 318 };
const GAP = { wm: 24, pill: 24, cta: 40, handles: 56, hh: 16, e2: 64 }, STACK_CY = 900;
const Y = {};
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
    // measure everything first (ink heights), then stack it on one rhythm, centred on STACK_CY
    {
      const tmp = sv('svg', { viewBox: '0 0 1080 1920', width: 1080, height: 1920, style: 'position:absolute;visibility:hidden' }, s.all);
      const g = sv('g', {}, tmp); g.innerHTML = L.wordmarkInner({ body: PAPER, dot: LIME, ids: true });
      const bb = g.getBBox(); tmp.remove();
      const probe = K.el(s.all, 'div', 's7-abs s7-chip', { visibility: 'hidden' }, ev('end.line').text);
      const pillH = probe.offsetHeight; probe.remove();
      const ctaH = 47 * 1.96, tagInk = 44, hInk = 48, e2Ink = 82;
      const wmInk = bb.height * sc;
      const total = wmInk + GAP.wm + pillH + GAP.pill + tagInk + GAP.cta + ctaH + GAP.handles + hInk + GAP.hh + hInk + GAP.e2 + e2Ink;
      let y = STACK_CY - total / 2;
      WM.top = y - bb.y * sc; y += wmInk + GAP.wm;
      Y.chip = y + pillH / 2; y += pillH + GAP.pill;
      Y.tag = y + tagInk / 2; y += tagInk + GAP.cta;
      Y.cta = y + ctaH / 2; y += ctaH + GAP.handles;
      Y.ig = y + hInk / 2; y += hInk + GAP.hh;
      Y.tt = y + hInk / 2; y += hInk + GAP.e2;
      Y.e2 = y + e2Ink / 2 - 4;
      s.stack = { top: STACK_CY - total / 2, bottom: STACK_CY + total / 2 };
    }
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
    // (fix round 2) the underline sits under the line's lowest ink (the dots of ب and ي end ≈ 54 px under the line's
    // centre, measured) with a 12 px gap: it no longer crosses the dots («ٮس مو آخر لٮلة.»)
    s.ul = K.el(s.all, 'div', 's7-ul', { left: f2(540 - s.e2.width / 2 + 8) + 'px', top: f2(Y.e2 + 66) + 'px', width: f2(s.e2.width - 16) + 'px' });
    s.ul.dataset.ink = '1';                                         // checked against every line's glyph ink (sweep)
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
    // (fix round 2) blurred 12 px and at 7 %: a texture of the work behind the card, no sample text readable (no samples
    // label on the end card)
    s.fan.style.opacity = (0.07 * E.outCubic(clamp((f - F.in) / 10))).toFixed(3);

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
    // (fix round) the dots land WITH the body on the cut (the wordmark never reads «طس»): no typing bubble above it any
    // more; the dots pop in place, staggered by a frame, and type (bounce) in the ش for ~0.4 s before they settle
    s.bubble.style.display = 'none';
    s.dots.forEach((c, i) => {
      const D = s.logoDots[i];
      const ap = sprF(a + 1.5 - i * 0.8, 0.6, 2.4);
      const bob = K.typing(a / 30, i, { period: 0.36, amp: 12, phase: 0.08 }) * (1 - clamp((a - 6) / 6));
      const x = D.x, y = D.y + (a >= 0 ? bob : 0);
      const r = D.r * Math.max(0, ap), sx = 1, sy = 1;
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
    // one pulse on the logo hit: a lime glow ring (fix round 2: no scale, so the pill never passes x 920)
    const pl = f - F.hit, pulse = 1, glow = pl >= 0 && pl < 10 ? Math.sin(Math.PI * pl / 10) : 0;
    s.cta.style.boxShadow = glow > 0 ? `0 18px 40px rgba(0,0,0,0.45), 0 0 0 ${f2(10 * glow)}px rgba(198,255,0,${(0.35 * glow).toFixed(3)})` : '';
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
