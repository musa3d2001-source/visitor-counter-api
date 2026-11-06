// TASH brand guide — every figure is generated here from the live system:
//   /_system/brand/logo.mjs (+ logo-data.mjs geometry), /_system/motion/kit.js (easings, typing, rng),
//   /_system/motion/endcard-cues.json (sting timing), src/data/media.json (measured audio + palettes, prep-media.py),
//   assets/ (exact-pixel rasters from prep-raster.mjs, sting stills from the real sting page, frames of our concept ads).
// Nothing is a placeholder. Numbers (contrast, b*, CMYK, angle, ratios) are computed, not typed.
import * as L from '/_system/brand/logo.mjs';
import D from '/_system/brand/logo-data.mjs';
import { E, spring, typing, rng, clamp, lerp } from '/_system/motion/kit.js';

const C = L.COLORS;
const INK = C.ink, PAPER = C.paper, LIME = C.lime, SMOKE = C.smoke, CHAR = C.char;
const LINE = '#2C2C29', META_P = '#55574F', META_L = '#3A4A00', RULE_P = '#D9D9CC';
const CUES = await (await fetch('/_system/motion/endcard-cues.json')).json();
const MEDIA = await (await fetch('src/data/media.json')).json();

// ------------------------------------------------------------------ helpers
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const put = (id, html) => { const e = document.getElementById(id); if (!e) throw new Error('missing #' + id); e.innerHTML = html; return e; };
const f2 = n => (Math.round(n * 100) / 100).toFixed(2);
const NS = 'xmlns="http://www.w3.org/2000/svg"';
const svg = (vb, inner, extra = '') => `<svg ${NS} viewBox="${vb}" style="direction:ltr" ${extra}>${inner}</svg>`;
const S = 1 / L.VB.w;                                                     // wordmark unit → width fraction
const wmAt = (x, y, w, o = {}) => `<g transform="translate(${x} ${y}) scale(${w * S})">${L.wordmarkInner(o)}</g>`;
const wmH = w => w * L.VB.h / L.VB.w;
const STATIC = { Alexandria: "'Alexandria Static', Alexandria", Archivo: "'Archivo Static', Archivo", 'JetBrains Mono': "'JetBrains Mono Static', 'JetBrains Mono'" }; // PDF-safe static cuts first (brand-guide.html)
const T = (x, y, s, { size = 30, fill = SMOKE, font = 'JetBrains Mono', anchor = 'start', weight = 600, ls = 0, rtl = false, op = 1 } = {}) =>
  `<text x="${x}" y="${y}" font-family="${STATIC[font] || font}" font-size="${size}" font-weight="${weight}"${font === 'Archivo' ? ' font-stretch="125%"' : ''} fill="${fill}" text-anchor="${anchor}" letter-spacing="${ls}" opacity="${op}"${rtl ? ' direction="rtl"' : ''}>${s}</text>`;  // Archivo always in its brand width (125%)

// colour science (WCAG 2.x relative luminance, CIELAB D65, naive CMYK)
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lin = c => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = h => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const crs = (a, b) => f2(cr(a, b)) + ':1';
function lab(h) {
  const [r, g, b] = rgb(h).map(lin);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const signed = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);
function cmyk(h) {
  const [r, g, b] = rgb(h).map(v => v / 255), k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 100];
  return [...[r, g, b].map(v => Math.round(100 * (1 - v - k) / (1 - k))), Math.round(100 * k)];
}
const verdict = r => (r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA LARGE' : 'FAIL');
const textOn = bg => (cr(INK, bg) >= cr(PAPER, bg) ? INK : PAPER);

// geometry read from the real logo data
const DOTS = L.dots(), R = DOTS[0].r, Dm = 2 * R;
const stem = (() => {   // the angled top of the ط stem: "M x0 y V ytop L x1 y1 V" in BODY
  const m = D.BODY.match(/M(\d+) (-?\d+)V(-\d+)L(\d+) (-\d+)V/);
  if (!m) throw new Error('stem segment not found in logo data');
  const p1 = { x: +m[1] + D.TX, y: +m[3] + D.TY }, p2 = { x: +m[4] + D.TX, y: +m[5] + D.TY };
  return { p1, p2, deg: Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI };
})();
const GAP = DOTS[0].cx - DOTS[1].cx - Dm;
// measure the shadda's box in normalised units (getBBox on an off-screen copy)
const shaddaBox = (() => {
  const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:-9999px;top:0;width:600px';
  host.innerHTML = svg(`0 0 ${L.VB.w} ${L.VB.h}`, L.wordmarkInner({ ids: true }));
  document.body.appendChild(host);
  const g = host.querySelector('#tash-shadda'), bb = g.getBBox(), tr = g.transform.baseVal.consolidate().matrix;
  host.remove();
  return { x: bb.x + tr.e, y: bb.y + tr.f, w: bb.width, h: bb.height };
})();

function tiers(items, cw = 6.2, pad = 10) { // items: [{x, text}] → adds .tier; labels read left→right from x
  const placed = []; [...items].sort((a, b) => a.x - b.x).forEach(it => {
    it.w = it.text.length * cw + pad; const cov = placed.filter(p => p.x + p.w > it.x);
    it.tier = cov.length ? Math.max(...cov.map(p => p.tier)) + 1 : 0; placed.push(it); });
  return items;
}

// ------------------------------------------------------------------ page furniture
const pages = $$('.page'), NP = pages.length;
pages.forEach((p, i) => { const pg = $('.run .pg', p); if (pg) pg.textContent = String(i + 1).padStart(2, '0') + ' / ' + String(NP).padStart(2, '0'); });
$$('[data-toc]').forEach(el => { const i = pages.findIndex(p => p.dataset.sec === el.dataset.toc); el.textContent = String(i + 1).padStart(2, '0'); });
$$('[data-cr]').forEach(el => { const [a, b] = el.dataset.cr.split(','); el.textContent = crs(a, b); });
$$('[data-lab]').forEach(el => { el.textContent = 'b* ' + signed(lab(el.dataset.lab)[2]); });

// ------------------------------------------------------------------ 00 cover / back
put('v-cover', L.wordmarkSVG({ body: PAPER, dot: LIME }));
put('v-back', L.symbolSVG({ pad: 0 }));

// ------------------------------------------------------------------ 01 critical review
put('v-described', [
  ['أسود', 'Black', '#0B0B0B'], ['ليموني كهربائي', 'Electric lime', '#C6FF00'], ['كريمي', 'Cream', '#F5F5E9'], ['رمادي', 'Grey', '#9AA0A6'],
].map(([ar, en, hex]) => `<div><div style="height:100px;background:${hex};box-shadow:inset 0 0 0 1px ${RULE_P}"></div>
  <div style="font-size:9.5px;font-weight:600;margin-top:5px;line-height:1.3">${ar}</div><div class="en s">${en}</div><div class="k" style="font-size:8px;text-align:right">${hex}</div></div>`).join(''));

function evTemp() {
  const row = (a, b, mark, txt) => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
    <div style="display:flex;box-shadow:0 0 0 1px ${RULE_P}"><span style="width:46px;height:46px;background:${a}"></span><span style="width:46px;height:46px;background:${b}"></span></div>
    <div><span class="${mark}"></span><div class="k" style="font-size:8px;margin-top:4px;line-height:1.6">${txt}</div></div></div>`;
  return `<div style="padding:16px 14px">` +
    row(PAPER, '#9AA0A6', 'no', `b* ${signed(lab(PAPER)[2])} / ${signed(lab('#9AA0A6')[2])}<br>CREAM + #9AA0A6`) +
    row(PAPER, SMOKE, 'ok', `b* ${signed(lab(PAPER)[2])} / ${signed(lab(SMOKE)[2])}<br>PAPER + SMOKE`) + `</div>`;
}
put('v-ev-temp', evTemp());
put('v-ev-contrast', `<div style="padding:12px 14px">` + [[LIME, PAPER, 'no'], ['#9AA0A6', PAPER, 'no'], [INK, PAPER, 'ok']].map(([fg, bg, m]) =>
  `<div style="display:flex;align-items:center;gap:10px;margin-bottom:7px"><div style="width:74px;height:36px;background:${bg};box-shadow:inset 0 0 0 1px ${RULE_P};display:flex;align-items:center;justify-content:center;font-family:'Alexandria Static',Alexandria;font-weight:800;font-size:19px;color:${fg}">طشّ</div>
   <span class="${m}"></span><span class="k" style="font-size:9.5px">${crs(fg, bg)}</span></div>`).join('') + `</div>`);

const glowFilter = id => `<filter id="${id}" x="-40%" y="-60%" width="180%" height="220%"><feGaussianBlur in="SourceAlpha" stdDeviation="9" result="b"/><feFlood flood-color="${LIME}" flood-opacity=".95"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
function halfPair(left, right) { // two halves on ink, ✕ left (bad) / ✓ right (good) — RTL: good first on the right
  return `<div style="display:grid;grid-template-columns:1fr 1fr;height:100%;background:${INK}">
    <div style="position:relative;border-left:1px solid ${LINE}">${right}<span class="ok" style="position:absolute;top:8px;right:8px"></span></div>
    <div style="position:relative">${left}<span class="no inv" style="position:absolute;top:8px;right:8px"></span></div></div>`;
}
const box = inner => `<div class="fill" style="position:absolute;inset:0">${svg('0 0 200 150', inner, 'preserveAspectRatio="xMidYMid meet"')}</div>`;
put('v-ev-glow', halfPair(
  box(`<defs>${glowFilter('ev-glow')}</defs><g filter="url(#ev-glow)">${wmAt(30, 75 - wmH(140) / 2 + 6, 140, { body: LIME, dot: LIME })}</g>`),
  box(wmAt(30, 75 - wmH(140) / 2 + 6, 140, { body: PAPER, dot: LIME }))));
function splash(cx, cy, seed, col) { // a generic stock-style splat, generated (the cliché we are rejecting)
  const r = rng(seed); let s = `<circle cx="${cx}" cy="${cy}" r="27" fill="${col}"/>`;
  for (let i = 0; i < 9; i++) { const a = r() * Math.PI * 2, d = 26 + r() * 20, w = 5 + r() * 9; s += `<ellipse cx="${cx + Math.cos(a) * d}" cy="${cy + Math.sin(a) * d}" rx="${w * 1.7}" ry="${w}" transform="rotate(${a * 180 / Math.PI} ${cx + Math.cos(a) * d} ${cy + Math.sin(a) * d})" fill="${col}"/>`; }
  for (let i = 0; i < 14; i++) { const a = r() * Math.PI * 2, d = 50 + r() * 32; s += `<circle cx="${cx + Math.cos(a) * d}" cy="${cy + Math.sin(a) * d}" r="${1.2 + r() * 4}" fill="${col}"/>`; }
  return s;
}
const symInner = (cx, cy, w, col) => { const k = w / (DOTS[0].cx - DOTS[2].cx + Dm); return DOTS.map(d => `<circle cx="${cx + (d.cx - DOTS[1].cx) * k}" cy="${cy}" r="${R * k}" fill="${col}"/>`).join(''); };
put('v-ev-splash', halfPair(box(splash(100, 78, 11, LIME)), box(symInner(100, 78, 96, LIME))));

// ------------------------------------------------------------------ 02 idea
function bubblePath(cx, cy, bw, bh) { // same geometry as the sting's typing bubble (endcard.js), k = 1
  const r = bh / 2, x = cx - bw / 2, y = cy - bh / 2;
  const tail = `M${x + bw - r * 0.55} ${y + bh - 6} q 18 26 44 30 q -30 -24 -26 -58 z`;
  return `M${x + r} ${y} H${x + bw - r} A${r} ${r} 0 0 1 ${x + bw - r} ${y + bh} H${x + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z ` + tail;
}
(function idea() {
  const bx = 800, by = 150, tdGap = 82, tdR = 26;
  const td = [1, 0, -1].map(k => ({ x: bx + k * tdGap, y: by }));
  const ww = 470, wx = 10, wy = 70, s = ww * S;
  const ld = DOTS.map(d => ({ x: wx + d.cx * s, y: wy + d.cy * s, r: d.r * s }));
  let paths = '';
  td.forEach((a, i) => { const b = ld[i], mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 160 - i * 24;
    paths += `<path d="M${a.x - tdR - 6} ${a.y - 6} Q ${mx} ${my} ${b.x + b.r + 4} ${b.y - 4}" fill="none" stroke="${SMOKE}" stroke-width="2" stroke-dasharray="3 7" stroke-linecap="round"/>`; });
  const inner = paths +
    `<path d="${bubblePath(bx, by, 300, 150)}" fill="${CHAR}"/>` + td.map((p, i) => `<circle cx="${p.x}" cy="${p.y + typing(0.26, i, { amp: 16 })}" r="${tdR}" fill="${LIME}"/>`).join('') +
    wmAt(wx, wy, ww, { body: PAPER, dot: LIME }) +
    T(bx, by + 128, 'يكتب…', { font: 'IBM Plex Sans Arabic', size: 24, fill: PAPER, anchor: 'middle', rtl: true }) +
    T(bx, by + 158, 'TYPING…', { size: 14, anchor: 'middle', ls: 3 }) +
    T(wx + ww / 2, wy + wmH(ww) + 50, 'نقاط الشين', { font: 'IBM Plex Sans Arabic', size: 24, fill: PAPER, anchor: 'middle', rtl: true }) +
    T(wx + ww / 2, wy + wmH(ww) + 80, 'THE DOTS', { size: 14, anchor: 'middle', ls: 3 });
  put('v-idea', svg('0 10 1000 420', inner));
})();
put('services', [
  ['فيديوهات إعلانية', 'Ad videos', 'الإعلان الكامل، من الفكرة لين الملف النهائي.'],
  ['إعلانات سوشال', 'Social ads · Reels, TikTok, Stories', 'بمقاس المنصة وإيقاعها من أول ثانية.'],
  ['تصميم إعلاني', 'Ad design · posters & visuals', 'بوسترات وصور إعلانية تنفهم بنظرة.'],
  ['أفكار وسكربتات', 'Ad ideas & scripts', 'الفكرة اللي تخلّيهم يسولفون، مكتوبة وجاهزة.'],
  ['موشن جرافيك ومونتاج', 'Motion graphics & editing', 'حركة ونص متحرّك ومونتاج على الإيقاع.'],
].map(([ar, en, d], i) => `<div style="display:grid;grid-template-columns:22px 1fr;padding:6px 0 5px;border-bottom:1px solid ${RULE_P}">
  <span class="num" style="color:${INK};padding-top:3px">${i + 1}</span>
  <div><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><span class="w6" style="font-size:12.5px">${ar}</span><span class="en s">${en}</span></div>
  <div class="sm mute" style="line-height:1.5">${d}</div></div></div>`).join(''));

// ------------------------------------------------------------------ 03a construction
(function construction() {
  const W = L.VB.w, H = L.VB.h, x0 = -420, x1 = W + 520, y0 = -120, y1 = H + 120;
  const dash = `stroke="${SMOKE}" stroke-width="4" stroke-dasharray="16 12"`;
  const { p1, p2, deg } = stem, ux = (p2.x - p1.x), uy = (p2.y - p1.y), ul = Math.hypot(ux, uy), u = { x: ux / ul, y: uy / ul };
  const base = D.TY, axis = DOTS[0].cy, d2 = DOTS[2], d1 = DOTS[1];
  const sb = shaddaBox, scx = sb.x + sb.w / 2, scy = sb.y + sb.h / 2, ringR = Math.max(sb.w, sb.h) / 2 + 24, d0 = DOTS[0];
  const arcR = 300, a0 = { x: p1.x + arcR, y: p1.y }, a1 = { x: p1.x + u.x * arcR, y: p1.y + u.y * arcR };
  const mid = (deg / 2) * Math.PI / 180;
  const callout = (n, x, y) => `<circle cx="${x}" cy="${y}" r="38" fill="${INK}" stroke="${LIME}" stroke-width="5"/>` + T(x, y + 15, n, { font: 'Archivo', weight: 800, size: 42, fill: PAPER, anchor: 'middle' });
  const inner =
    `<line x1="${x0}" y1="${base}" x2="${x1}" y2="${base}" ${dash}/>` + T(x0, base - 22, 'BASELINE', { size: 40, ls: 6 }) +
    `<line x1="${x0}" y1="${axis}" x2="${x1}" y2="${axis}" ${dash}/>` + T(x0, axis - 22, 'DOT AXIS', { size: 40, ls: 6 }) +
    L.wordmarkInner({ body: PAPER, dot: LIME }) +
    // stem angle
    `<line x1="${p1.x - u.x * 420}" y1="${p1.y - u.y * 420}" x2="${p2.x + u.x * 260}" y2="${p2.y + u.y * 260}" stroke="${LIME}" stroke-width="6"/>` +
    `<line x1="${p1.x}" y1="${p1.y}" x2="${p1.x + 560}" y2="${p1.y}" ${dash}/>` +
    `<path d="M${a0.x} ${a0.y} A ${arcR} ${arcR} 0 0 1 ${a1.x} ${a1.y}" fill="none" stroke="${LIME}" stroke-width="5"/>` +
    T(p1.x + Math.cos(mid) * (arcR + 70), p1.y + Math.sin(mid) * (arcR + 70) + 16, deg.toFixed(1) + '°', { font: 'Archivo', weight: 800, size: 56, fill: LIME }) +
    // D under the rightmost dot, gap under the left pair
    `<g stroke="${LIME}" stroke-width="5"><line x1="${d0.cx - R}" y1="${axis + R + 50}" x2="${d0.cx + R}" y2="${axis + R + 50}"/><line x1="${d0.cx - R}" y1="${axis + R + 30}" x2="${d0.cx - R}" y2="${axis + R + 70}"/><line x1="${d0.cx + R}" y1="${axis + R + 30}" x2="${d0.cx + R}" y2="${axis + R + 70}"/></g>` +
    T(d0.cx, axis + R + 128, 'D', { font: 'Archivo', weight: 800, size: 60, fill: LIME, anchor: 'middle' }) +
    `<g stroke="${SMOKE}" stroke-width="4"><line x1="${d2.cx + R}" y1="${axis + R + 50}" x2="${d1.cx - R}" y2="${axis + R + 50}"/><line x1="${d2.cx + R}" y1="${axis + R + 30}" x2="${d2.cx + R}" y2="${axis + R + 70}"/><line x1="${d1.cx - R}" y1="${axis + R + 30}" x2="${d1.cx - R}" y2="${axis + R + 70}"/></g>` +
    T((d2.cx + d1.cx) / 2, axis + R + 118, (GAP / Dm).toFixed(2) + ' D', { size: 38, anchor: 'middle', ls: 2 }) +
    // shadda
    `<circle cx="${scx}" cy="${scy}" r="${ringR}" fill="none" stroke="${SMOKE}" stroke-width="4" stroke-dasharray="16 12"/>` +
    callout('1', -250, 1010) + `<line x1="-212" y1="1010" x2="-16" y2="1010" stroke="${LIME}" stroke-width="4"/>` +
    callout('2', p1.x + 600, p1.y - 6) +
    callout('3', d2.cx - R - 150, axis) +
    callout('4', scx - ringR - 110, scy);
  put('v-construct', svg(`${x0 - 60} ${y0} ${x1 - x0 + 60} ${y1 - y0}`, inner));
  $('#o-angle').textContent = deg.toFixed(1) + '°';
  $('#o-gap').textContent = (GAP / Dm).toFixed(2) + 'D';
  $('#o-specs').innerHTML = [
    ['VIEWBOX', `${W} × ${H} u`], ['D (DOT Ø)', `${Dm} u = ${(Dm / W * 100).toFixed(2)}% W`], ['DOT GAP', `${GAP} u = ${(GAP / Dm).toFixed(2)} D`],
    ['STEM ANGLE', deg.toFixed(1) + '°'], ['CLEAR SPACE', `2D = ${2 * Dm} u`], ['SOURCE', '_system/brand/logo-data.mjs'],
  ].map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid ${LINE}"><span>${v}</span><span>${k}</span></div>`).join('');
})();

// ------------------------------------------------------------------ 03b clear space + minimum sizes
(function clear() {
  const W = L.VB.w, H = L.VB.h, cs = 2 * Dm, pad = cs + 150;
  const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="${R - 6}" fill="none" stroke="${INK}" stroke-width="10"/>`;
  const inner =
    `<rect x="${-cs}" y="${-cs}" width="${W + 2 * cs}" height="${H + 2 * cs}" fill="none" stroke="${INK}" stroke-width="7" stroke-dasharray="26 18"/>` +
    `<rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="${RULE_P}" stroke-width="6"/>` +
    L.wordmarkInner({ body: INK, dot: INK }) +
    dot(W / 2 + 300, -R) + dot(W / 2 + 300, -3 * R) + dot(W + R, H / 2) + dot(W + 3 * R, H / 2) +
    dot(-R, H / 2) + dot(-3 * R, H / 2) + dot(W / 2 - 300, H + R) + dot(W / 2 - 300, H + 3 * R) +
    T(W / 2 + 300 + R + 40, -2 * R + 22, '2D', { size: 70, fill: INK, weight: 700 }) +
    T(W + 2 * R, H / 2 + 2 * R + 80, '2D', { size: 70, fill: INK, weight: 700, anchor: 'middle' }) +
    T(-2 * R, H / 2 + 2 * R + 80, '2D', { size: 70, fill: INK, weight: 700, anchor: 'middle' }) +
    T(W / 2 - 300 + R + 40, H + 2 * R + 22, '2D', { size: 70, fill: INK, weight: 700 });
  put('v-clear', svg(`${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}`, inner));
  // same rule on the horizontal lockup (its wordmark is drawn at scale 1, so D is the same 180 u)
  const lk = L.lockupHorizontalSVG({ body: INK, dot: INK, latin: INK, sub: META_P, rule: RULE_P, pad: 0 });
  const [, , LW, LH] = lk.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  const lkInner = lk.replace(/^<svg[^>]*>(<title>[^<]*<\/title>)?/, '').replace(/<\/svg>$/, '');
  const lp = cs + 140;
  put('v-clear-lockup', svg(`${-lp} ${-lp} ${LW + 2 * lp} ${LH + 2 * lp}`,
    `<rect x="${-cs}" y="${-cs}" width="${LW + 2 * cs}" height="${LH + 2 * cs}" fill="none" stroke="${INK}" stroke-width="9" stroke-dasharray="30 20"/>` +
    `<rect x="0" y="0" width="${LW}" height="${LH}" fill="none" stroke="${RULE_P}" stroke-width="8"/>` + lkInner +
    dot(LW + R, LH / 2) + dot(LW + 3 * R, LH / 2) + T(LW + 2 * R, LH / 2 + 2 * R + 90, '2D', { size: 80, fill: INK, weight: 700, anchor: 'middle' })));
})();
(function minsize() {
  const im = (n, w, h) => `<img src="assets/px/${n}.png" width="${w}" height="${h}" style="display:block">`;
  const one = (w, ok) => { const hh = Math.round(w * L.VB.h / L.VB.w) + 16;
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:5px">${im('wm-' + w, w + 16, hh)}<div style="display:flex;gap:5px;align-items:center"><span class="${ok ? 'ok' : 'no'}"></span><span class="k">${w} px</span></div></div>`; };
  const zoom = (w, ok, k = 3) => { const ww = w + 16, hh = Math.round(w * L.VB.h / L.VB.w) + 16;
    return `<div><div class="fig" style="position:relative;width:${(w + 4) * k}px;height:${(hh - 12) * k}px;overflow:hidden;background:${INK}"><img src="assets/px/wm-${w}.png" style="position:absolute;left:${-6 * k}px;top:${-6 * k}px;width:${ww * k}px;height:${hh * k}px;image-rendering:pixelated;max-width:none"></div>
      <div style="display:flex;gap:5px;align-items:center;margin-top:5px"><span class="${ok ? 'ok' : 'no'}"></span><span class="k">${w} px × ${k}</span></div></div>`; };
  put('v-minsize', `<div style="display:flex;align-items:flex-end;gap:14px;margin:10px 0 14px">${one(120, 1)}${one(96, 1)}${one(72, 0)}${one(48, 0)}</div>
    <div style="display:flex;align-items:flex-start;gap:14px">${zoom(96, 1)}${zoom(48, 0)}</div>`);
  $('#t-min tbody').innerHTML = [
    ['الشعار', 'Wordmark', '96 px', 'تحتها الشدّة والنقاط تتلاحم'],
    ['المكدّس', 'Stacked lockup', '300 px', 'عشان سطر CREATIVE STUDIO ينقرا'],
    ['الأفقي', 'Horizontal lockup', '400 px', 'نفس السبب'],
    ['رمز النقاط', 'Dots symbol', '24 px', 'تحتها النقاط تصير خط'],
    ['الصورة الشخصية', 'Avatar', '110 px', 'مصمّمة على 110، وتنعرف لين 40'],
  ].map(([a, e, v, n]) => `<tr><td>${a} <span class="en" style="display:inline;margin-right:4px">${e}</span></td><td class="k" style="font-size:10px">${v}</td><td class="mute">${n}</td></tr>`).join('');
})();

// ------------------------------------------------------------------ 03c variants
(function variants() {
  const tile = (vis, ar, en, use, file, bg = CHAR) => `<div><div class="tile" style="height:204px;background:${bg};display:flex;align-items:center;justify-content:center">${vis}</div>
    <div style="margin-top:8px"><div style="display:flex;justify-content:space-between;align-items:baseline"><h3>${ar}</h3><span class="en s">${en}</span></div>
    <p class="sm mute" style="margin:2px 0 3px">${use}</p><div class="k" style="font-size:7.5px;color:${SMOKE};text-align:right">${file}</div></div></div>`;
  const fit = (s, w) => `<div class="fig" style="width:${w}px">${s}</div>`;
  const av = (o, w) => `<div style="width:${w}px;height:${w}px;border-radius:50%;overflow:hidden">${L.avatarSVG(o).replace('<svg ', '<svg style="display:block;width:100%;height:100%" ')}</div>`;
  put('v-variants', [
    tile(fit(L.wordmarkSVG({ body: PAPER, dot: LIME }), 210), 'الشعار', 'Wordmark · primary', 'الأساسي: أي مكان وأي حجم فوق <bdi dir="ltr">96 px</bdi>.', 'svg/tash-wordmark--paper-lime.svg'),
    tile(fit(L.lockupHorizontalSVG({ pad: 0 }), 270), 'التركيب الأفقي', 'Horizontal lockup', 'للمقاسات العريضة والمستندات، ولما نحتاج الإنجليزي جنب العربي.', 'svg/tash-lockup-h--paper-lime.svg'),
    tile(fit(L.lockupStackedSVG({ pad: 0 }), 150), 'التركيب المكدّس', 'Stacked lockup', 'للمربع والطولي، وأول تعارف مع الاسم.', 'svg/tash-lockup-stacked--paper-lime.svg'),
    tile(fit(L.symbolSVG({ pad: 0 }), 110), 'رمز النقاط', 'Dots symbol', 'تعداد، تحميل، علامة مائية. ما يحل محل الشعار بالتوقيع.', 'svg/tash-symbol-dots--lime.svg'),
    tile(av({}, 1), 'الصورة الشخصية: ليموني', 'Avatar · primary', 'الأساسية بكل المنصات.', 'avatar/tash-avatar--lime.svg').replace('width:1px;height:1px', 'width:130px;height:130px'),
    tile(av({ bg: INK, body: PAPER, dot: LIME }, 130), 'الصورة الشخصية: حبر', 'Avatar · alternate', 'البديلة للسياقات الداكنة.', 'avatar/tash-avatar--ink.svg'),
  ].join(''));
})();

// ------------------------------------------------------------------ 03d colour versions
(function colourways() {
  const t = (bg, o, ok, ar, en, file, border = false) => `<div><div style="height:248px;background:${bg};display:flex;align-items:center;justify-content:center;${border ? `box-shadow:inset 0 0 0 1px ${RULE_P}` : ''}"><div class="fig" style="width:204px">${L.wordmarkSVG(o)}</div></div>
    <div class="cap"><span class="${ok ? 'ok' : 'no'}"></span><div><div class="w6">${ar}</div><div class="en">${en}</div><div class="k" style="font-size:7.5px;color:${META_P};margin-top:2px">${file}</div></div></div></div>`;
  put('v-colourways', [
    t(INK, { body: PAPER, dot: LIME }, 1, 'الأساسي: ورقي + نقاط ليموني على الحبر', 'Primary on Ink', 'tash-wordmark--on-ink'),
    t(CHAR, { body: PAPER, dot: LIME }, 1, 'نفسه على الفحمي: بطاقات وإطارات', 'Primary on Char', 'tash-wordmark--paper-lime'),
    t(INK, { body: PAPER, dot: PAPER }, 1, 'ورقي كامل: لون واحد، طباعة، حفر', 'Paper mono on Ink', 'tash-wordmark--paper'),
    t(PAPER, { body: INK, dot: INK }, 1, 'حبر كامل على الورقي', 'Ink mono on Paper', 'tash-wordmark--on-paper', true),
    t(LIME, { body: INK, dot: INK }, 1, 'حبر كامل على الليموني', 'Ink mono on Lime', 'tash-wordmark--on-lime'),
    t(INK, { body: LIME, dot: LIME }, 1, 'ليموني كامل: أحجام صغيرة ومطبوعات خاصة بس', 'Lime mono on Ink · sparingly', 'tash-wordmark--lime'),
  ].join(''));
})();

// ------------------------------------------------------------------ 03e avatar
(function avatar() {
  const big = 196, aw = 1080 * 0.70, ax = (1080 - aw) / 2 + 1080 * 0.012;   // the same numbers avatarSVG() uses
  const guide = `<svg ${NS} viewBox="0 0 1080 1080" style="position:absolute;inset:0;width:100%;height:100%;direction:ltr">
    <line x1="${ax}" y1="250" x2="${ax}" y2="830" stroke="${INK}" stroke-width="6" stroke-dasharray="16 12"/><line x1="${ax + aw}" y1="250" x2="${ax + aw}" y2="830" stroke="${INK}" stroke-width="6" stroke-dasharray="16 12"/>
    ${T(540, 232, '70%', { size: 50, fill: INK, anchor: 'middle', weight: 700 })}</svg>`;
  const img = (n, w) => `<img src="assets/px/${n}.png" width="${w + 12}" height="${w + 12}" style="display:block">`;
  const cell = (k, mode, ok) => { const dark = mode === 'dark', bg = dark ? '#000000' : '#FFFFFF', fg = dark ? '#DDDDDD' : '#111111';
    return `<div style="background:${bg};color:${fg};display:flex;align-items:center;gap:12px;padding:6px 12px;height:60px">${img(`avatar-${k}-40-${mode}`, 40)}
      <div style="flex:1;line-height:1.4"><div class="k" style="font-size:8.5px;color:${fg}">tash.creative.kw</div><div style="font-size:10.5px">الخاص مفتوح •••</div></div>
      <span class="${ok ? 'ok' : dark ? 'no inv' : 'no'}"></span></div>`; };
  const zoom = n => `<div class="fig" style="width:120px;height:120px;overflow:hidden;position:relative;background:#000"><img src="assets/px/${n}.png" style="position:absolute;left:-18px;top:-18px;width:156px;height:156px;image-rendering:pixelated;max-width:none"></div>`;
  put('v-avatar', `
   <div style="display:flex;gap:24px;align-items:flex-start">
     <div style="width:${big}px"><div style="position:relative;width:${big}px;height:${big}px"><div style="position:absolute;inset:0;border-radius:50%;overflow:hidden">${L.avatarSVG({}).replace('<svg ', '<svg style="display:block;width:100%;height:100%" ')}</div>${guide}</div>
       <div class="cap"><span class="ok"></span><div><div class="w6">الكلمة 70% من القطر</div><div class="en">avatarSVG() · 02-logo/avatar/</div></div></div></div>
     <div style="flex:1">
       <div style="background:#FFFFFF;color:#111;padding:16px 18px 14px">
         <div style="display:flex;gap:16px;align-items:center">${img('avatar-lime-110-light', 110)}
           <div><div style="font-weight:600;font-size:13px;white-space:nowrap">طشّ <bdi dir="ltr">TASH</bdi> | استوديو إعلانات</div><div class="k" style="font-size:9.5px;color:#555;margin-top:3px">tash.creative.kw</div></div></div>
         <div style="font-size:11px;line-height:1.65;margin-top:10px">خلّهم يسولفون عنك •••<br>نسوي الإعلان نفسه: فكرة وسكربت، فيديو، تصميم، موشن ومونتاج — للريلز والتيك توك والستوري.</div>
       </div>
       <div class="cap"><span class="ok"></span><div><div class="w6">بالحجم الحقيقي: <bdi dir="ltr">110 px</bdi> بالبروفايل</div><div class="en">Real 1× pixels · generic profile mock, no platform UI · bio from 06-copy</div></div></div>
     </div>
   </div>
   <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:16px">
     <div class="lbl" style="text-align:right">LIGHT MODE · 40 PX</div><div class="lbl" style="text-align:right">DARK MODE · 40 PX</div>
     ${cell('lime', 'light', 1)}${cell('lime', 'dark', 1)}${cell('ink', 'light', 1)}${cell('ink', 'dark', 0)}
   </div>
   <div style="display:flex;gap:16px;align-items:flex-end;margin-top:14px">
     <div>${zoom('avatar-lime-40-dark')}<div class="cap"><span class="ok"></span><span class="k">LIME · 40 PX × 3</span></div></div>
     <div>${zoom('avatar-ink-40-dark')}<div class="cap"><span class="no inv"></span><span class="k">INK · 40 PX × 3</span></div></div>
     <p class="sm" style="flex:1;margin:0 0 24px">بـ<bdi dir="ltr">40 px</bdi> الحروف تصير شكل، والدائرة الليمونية هي اللي تخلّينا ننعرف. دائرة الحبر تذوب بالوضع الداكن ويبقى الاسم بدون إطار، عشان كذا الليموني هو الأساسي.</p>
   </div>`);
})();

// ------------------------------------------------------------------ 03f misuse
(function misuse() {
  const VW = 480, VH = 450, ww = 300, wx = (VW - ww) / 2, wy = (VH - wmH(ww)) / 2 + 8;
  const k = ww * S, cx = VW / 2, cy = VH / 2;
  const tileSvg = (bg, inner, defs = '') => svg(`0 0 ${VW} ${VH}`, `<defs>${defs}</defs><rect width="${VW}" height="${VH}" fill="${bg}"/>` + inner);
  const centred = (tr, o) => `<g transform="translate(${cx} ${cy}) ${tr} translate(${-ww / 2} ${-wmH(ww) / 2 + 8}) scale(${k})">${L.wordmarkInner(o)}</g>`;
  const std = { body: PAPER, dot: LIME };
  const recol = L.wordmarkInner(std).replace(/<circle([^>]*)fill="#C6FF00"/g, (() => { let i = 0; const c = ['#FF4D2E', '#2E7BFF', '#FFC400']; return (m, a) => `<circle${a}fill="${c[i++ % 3]}"`; })());
  const split = 1660, shift = 230;
  const ls = `<g transform="translate(${wx + shift * k * 0.5} ${wy}) scale(${k})">` +
    `<g transform="translate(${-shift} 0)" clip-path="url(#ls-a)">${L.wordmarkInner({ ...std, dotOffsets: [[0, 0], [-70, 0], [-140, 0]] })}</g>` +
    `<g clip-path="url(#ls-b)">${L.wordmarkInner(std)}</g></g>`;
  const lsDefs = `<clipPath id="ls-a"><rect x="-200" y="-200" width="${split + 200}" height="2000"/></clipPath><clipPath id="ls-b"><rect x="${split}" y="-200" width="1200" height="2000"/></clipPath>`;
  const items = [
    [tileSvg(INK, centred('scale(1.45 0.74)', std)), 'لا تمطّه ولا تضغطه', 'Don\'t stretch or squash'],
    [tileSvg(INK, `<g filter="url(#mis-glow)">${centred('', std)}</g>`, glowFilter('mis-glow')), 'لا توهّج ولا نيون', 'No glow, no neon'],
    [tileSvg(PAPER, centred('', { body: LIME, dot: LIME }) + `<rect width="${VW}" height="${VH}" fill="none" stroke="${RULE_P}" stroke-width="3"/>`), 'لا ليموني على الورقي', 'No lime on Paper · ' + crs(LIME, PAPER)],
    [tileSvg(INK, `<g stroke="${PAPER}" stroke-width="16">${centred('', { body: 'none', dot: 'none', shadda: 'none' })}</g>`), 'لا تحوّله لخطوط', 'Don\'t outline it'],
    [tileSvg(INK, centred('rotate(-14)', std)), 'لا تميّله', 'Don\'t rotate it'],
    [tileSvg(INK, `<g transform="translate(${wx} ${wy}) scale(${k})">${recol}</g>`), 'لا تلوّن النقاط', 'Don\'t recolour the dots'],
    [tileSvg(INK, ls, lsDefs), 'لا تباعد بين حروفه', 'Don\'t letter-space it'],
    [tileSvg(INK, `<image href="assets/misuse-busy.jpg" width="${VW}" height="${VH}" preserveAspectRatio="xMidYMid slice"/>` + centred('', std)), 'لا تحطّه على صورة مزحومة', 'Not on a busy image · use an Ink plate'],
  ];
  put('v-misuse', items.map(([s, ar, en], i) => `<div><div class="fig" style="position:relative">${s}<span class="no${i === 2 || i === 7 ? '' : ' inv'}" style="position:absolute;top:8px;right:8px;width:16px;height:16px"></span></div>
    <div class="cap"><div><div class="w6" style="font-size:11px">${ar}</div><div class="en">${en}</div></div></div></div>`).join(''));
})();

// ------------------------------------------------------------------ 04 colour
const CORE = [
  ['حبر', 'Ink', INK, 'الأرضية الأساسية، حوالي 60% من أي قطعة.', 'Primary ground'],
  ['ورقي', 'Paper', PAPER, 'الكلام على الحبر، وأرضية الطباعة. حوالي 25%.', 'Type on Ink, light grounds'],
  ['ليموني طشّ', 'Lime', LIME, 'الإشارة: النقاط، كلمة وحدة، زر، مسحة. 10% بالكثير. <span style="white-space:nowrap">ولا نص على الورقي أبداً.</span>', 'The signal'],
  ['دخاني', 'Smoke', SMOKE, 'نص ثانوي ومعلومات، على الحبر والفحمي بس.', 'Secondary text on Ink'],
];
const SUPPORT = [
  ['فحمي', 'Char', CHAR, 'أسطح مرفوعة على الحبر: بطاقات، إطارات، فقاعة الكتابة.'],
  ['خطّي', 'Line', LINE, 'فواصل رفيعة على الحبر.'],
  ['دخاني غامق', 'Smoke deep', META_P, 'نص ثانوي على الورقي (' + crs(META_P, PAPER) + ').'],
  ['زيتوني', 'Olive', META_L, 'نص ثانوي على الليموني (' + crs(META_L, LIME) + ').'],
];
put('v-swatches', CORE.map(([ar, en, hex, role, roleEn]) => { const [r, g, b] = rgb(hex), [c, m, y, k] = cmyk(hex);
  return `<div><div style="height:196px;background:${hex};${hex === INK ? `box-shadow:inset 0 0 0 1px ${LINE}` : ''};position:relative">
      <span class="k" style="position:absolute;bottom:10px;right:12px;font-size:9px;color:${textOn(hex)};opacity:.8">${textOn(hex) === INK ? 'INK' : 'PAPER'} TEXT · ${crs(textOn(hex), hex)}</span></div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:9px"><span style="font-family:var(--f-display-ar);font-weight:800;font-size:20px">${ar}</span><span class="en">${en}</span></div>
    <div class="k" style="font-size:8.5px;line-height:1.75;margin-top:4px;color:${PAPER}"><div style="display:flex;justify-content:space-between"><span>${hex}</span><span style="color:${SMOKE}">HEX</span></div>
      <div style="display:flex;justify-content:space-between"><span>${r} ${g} ${b}</span><span style="color:${SMOKE}">RGB</span></div>
      <div style="display:flex;justify-content:space-between"><span>${c} ${m} ${y} ${k}</span><span style="color:${SMOKE}">CMYK ≈</span></div></div>
    <p class="sm" style="margin:6px 0 0;color:${SMOKE}">${role}</p></div>`; }).join(''));
put('v-support', SUPPORT.map(([ar, en, hex, role]) => `<div style="display:flex;gap:10px;align-items:flex-start">
    <div style="width:46px;height:46px;flex:0 0 46px;background:${hex};box-shadow:inset 0 0 0 1px ${LINE}"></div>
    <div><div style="display:flex;gap:8px;align-items:baseline"><span class="w6" style="font-size:12px">${ar}</span><span class="en s">${en}</span><span class="k" style="font-size:8px;color:${SMOKE}">${hex}</span></div>
    <div class="sm" style="color:${SMOKE};line-height:1.5">${role}</div></div></div>`).join(''));
(function ratio() { // tall segmented bar: 28 px, 2 px surface gaps, share inside the leading edge when it fits
  const parts = [['حبر', 60, INK], ['ورقي', 25, PAPER], ['ليموني', 10, LIME], ['الباقي', 5, SMOKE]];
  put('v-ratio', `<div style="display:flex;gap:2px;height:28px">` + parts.map(([ar, v, c]) =>
    `<div style="flex:${v} 0 0;background:${c};border-radius:4px;${c === INK ? `box-shadow:inset 0 0 0 1px ${SMOKE}` : ''};display:flex;align-items:center;padding:0 10px;color:${textOn(c)};font-size:10px;font-weight:600;white-space:nowrap;overflow:visible">${v >= 10 ? `${ar} <bdi dir="ltr" class="k" style="margin-right:6px">${v}%</bdi>` : ''}</div>`).join('') +
    `</div><div style="display:flex;justify-content:space-between;margin-top:7px"><span class="sm" style="color:${SMOKE}">الليموني إشارة مو ديكور: إذا كل شي ليموني، ولا شي مهم.</span><span class="sm" style="color:${SMOKE}">دخاني + فحمي + خطّي <bdi dir="ltr" class="k">5%</bdi></span></div>`);
})();
(function contrast() {
  const fgs = [['ورقي', PAPER], ['ليموني', LIME], ['دخاني', SMOKE], ['حبر', INK], ['دخاني غامق', META_P], ['زيتوني', META_L]];
  const bgs = [['حبر', 'INK', INK], ['فحمي', 'CHAR', CHAR], ['ورقي', 'PAPER', PAPER], ['ليموني', 'LIME', LIME]];
  const cell = (fg, bg) => { if (fg === bg) return `<td style="text-align:center;color:${META_P}">—</td>`;
    const r = cr(fg, bg), v = verdict(r);
    return `<td style="padding:7px 4px 7px 8px"><div style="height:50px;background:${bg};box-shadow:inset 0 0 0 1px ${RULE_P};display:flex;align-items:center;justify-content:center;gap:6px;color:${fg};font-family:'Alexandria Static',Alexandria;font-weight:800;font-size:17px">طشّ <span style="font-family:'Archivo Static',Archivo;font-stretch:125%;font-size:12px">Aa</span></div>
      <div style="display:flex;justify-content:space-between;margin-top:3px"><span class="k" style="font-size:8.5px">${f2(r)}</span><span class="k" style="font-size:7px;letter-spacing:.12em;${v === 'FAIL' ? `background:${INK};color:${PAPER};padding:0 4px` : `color:${META_P}`}">${v}</span></div></td>`; };
  put('v-contrast', `<table><thead><tr><th style="width:15%"><span class="ar">النص ↓ / الأرضية ←</span>FG / BG</th>${bgs.map(([a, e, h]) => `<th><span class="ar">${a}</span>${e} ${h}</th>`).join('')}</tr></thead><tbody>` +
    fgs.map(([a, h]) => `<tr><td style="vertical-align:middle"><span class="chip" style="background:${h}"></span> <span class="w6">${a}</span><div class="k" style="font-size:7.5px;color:${META_P}">${h}</div></td>${bgs.map(b => cell(h, b[2])).join('')}</tr>`).join('') + `</tbody></table>`);
  const pairs = [
    [PAPER, INK, 1, 'ورقي على حبر', 'النص الأساسي'], [LIME, INK, 1, 'ليموني على حبر', 'النقاط، كلمة وحدة، زر'], [INK, LIME, 1, 'حبر على ليموني', 'بطاقة الطلب، الصورة الشخصية'],
    [INK, PAPER, 1, 'حبر على ورقي', 'الصفحات الهادية والطباعة'], [SMOKE, INK, 1, 'دخاني على حبر', 'معلومات ثانوية'], [META_P, PAPER, 1, 'دخاني غامق على ورقي', 'معلومات ثانوية على الفاتح'],
    [LIME, PAPER, 0, 'ليموني على ورقي', 'أبداً'], [PAPER, LIME, 0, 'ورقي على ليموني', 'أبداً'], [SMOKE, PAPER, 0, 'دخاني على ورقي', 'مو للنص'],
  ];
  put('v-pairs', pairs.map(([fg, bg, ok, ar, use]) => `<div style="display:flex;gap:10px;align-items:center;padding:12px 0;border-bottom:1px solid ${RULE_P}">
    <div style="width:56px;height:30px;flex:0 0 56px;background:${bg};box-shadow:inset 0 0 0 1px ${RULE_P};display:flex;align-items:center;justify-content:center;color:${fg};font-family:'Alexandria Static',Alexandria;font-weight:800;font-size:14px">طشّ</div>
    <span class="${ok ? 'ok' : 'no'}"></span><div style="flex:1"><div class="w6" style="font-size:10.5px">${ar}</div><div class="sm mute" style="line-height:1.3">${use}</div></div><span class="k" style="font-size:8.5px">${f2(cr(fg, bg))}</span></div>`).join(''));
})();

// ------------------------------------------------------------------ 05 typography
put('v-families', [
  { name: 'Alexandria', role: 'العناوين العربية', roleEn: 'Arabic display', w: 'WEIGHTS 600–900 · WE USE 800', file: 'Alexandria-VF.ttf', lic: 'OFL-Alexandria.txt',
    spec: `<div style="font-family:'Alexandria Static',Alexandria;font-weight:800;font-size:60px;line-height:1.35">سالفة</div>`,
    glyphs: `<div style="font-family:'Alexandria Static',Alexandria;font-weight:800;font-size:13px;line-height:1.75">أ ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي <bdi dir="ltr">٠١٢٣٤٥٦٧٨٩</bdi></div>`, use: 'كلمة لين ست كلمات. وهو أساس الشعار (<bdi dir="ltr">Black</bdi>).' },
  { name: 'IBM Plex Sans Arabic', role: 'النص العربي', roleEn: 'Arabic text', w: 'WEIGHTS 400–700 · WE USE 400 + 600', file: 'IBMPlexSansArabic-*.ttf', lic: 'OFL-IBMPlexSansArabic.txt',
    spec: `<div style="font-family:'IBM Plex Sans Arabic';font-weight:400;font-size:21px;line-height:1.6">نسوي الإعلان نفسه، من الفكرة لين <span style="font-weight:600">الملف النهائي.</span></div>`,
    glyphs: `<div style="font-family:'IBM Plex Sans Arabic';font-size:12px;line-height:1.75">أبجد هوز حطي كلمن سعفص قرشت ثخذ ضظغ <bdi dir="ltr">٠١٢٣٤٥٦٧٨٩</bdi> <bdi dir="ltr">0123456789</bdi></div>`, use: 'الشرح، السطور الثانوية، الكابشن، والواجهات.' },
  { name: 'Archivo', role: 'العناوين اللاتينية', roleEn: 'Latin display', w: 'WEIGHTS 800–900 · WIDTH 125%', file: 'Archivo-VF.ttf', lic: 'OFL-Archivo.txt',
    spec: `<div style="font-family:'Archivo Static',Archivo;font-weight:900;font-stretch:125%;font-size:58px;line-height:1.2;direction:ltr;text-align:right">TASH</div>`,
    glyphs: `<div style="font-family:'Archivo Static',Archivo;font-weight:800;font-stretch:125%;font-size:12px;line-height:1.75;direction:ltr;text-align:right;overflow-wrap:anywhere">ABCDEFGHIJKLM NOPQRSTUVWXYZ 0123456789</div>`, use: 'الاسم اللاتيني، الأرقام الكبيرة، والعناوين الإنجليزية.' },
  { name: 'JetBrains Mono', role: 'اللوحات والمواصفات', roleEn: 'Labels · slates', w: 'WEIGHTS 500–700 · CAPS · .24EM', file: 'JetBrainsMono-VF.ttf', lic: 'OFL-JetBrainsMono.txt',
    spec: `<div class="lbl" style="font-size:15px;color:${INK};letter-spacing:.24em;line-height:2.1;text-align:right">SC 03 · TK 1<br>TASH / 2026</div>`,
    glyphs: `<div style="font-family:'JetBrains Mono Static','JetBrains Mono';font-weight:600;font-size:11px;line-height:1.75;direction:ltr;text-align:right;letter-spacing:.06em;overflow-wrap:anywhere">ABCDEFGHIJKLM NOPQRSTUVWXYZ 0123456789 — / ·</div>`, use: 'لاتيني وأرقام بس، ولا عربي أبداً.' },
].map(f => `<div style="border-top:1.5px solid ${INK};padding-top:10px;min-width:0">
   <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><span class="w6" style="font-size:12.5px">${f.role}</span><span class="en s">${f.roleEn}</span></div>
   <div style="height:116px;display:flex;align-items:center;justify-content:flex-start;overflow:hidden">${f.spec}</div>
   ${f.glyphs}
   <div class="hr"></div>
   <div style="font-family:'Archivo Static',Archivo;font-weight:800;font-stretch:125%;font-size:12px;direction:ltr;text-align:right">${f.name}</div>
   <p class="sm" style="margin:4px 0 6px">${f.use}</p>
   <div class="k" style="font-size:8px;line-height:1.85;color:${META_P};text-align:right;white-space:normal"><div>${f.w}</div><div>SIL OFL 1.1 · COMMERCIAL USE OK</div><div>_system/fonts/${f.file}</div><div>_system/fonts/${f.lic}</div></div>
 </div>`).join(''));
put('v-together', `<div style="background:${INK};color:${PAPER};padding:16px 22px 14px;display:flex;justify-content:space-between;align-items:flex-end;gap:24px">
    <div><div class="lbl" style="color:${SMOKE};text-align:right;margin-bottom:16px">TASH / 2026</div>
      <div style="font-family:'Alexandria Static',Alexandria;font-weight:800;font-size:38px;line-height:1.3">خلّ إعلانك علينا.</div>
      <div style="font-size:14px;color:${SMOKE};margin-top:2px">نسوي الإعلان نفسه، من الفكرة لين الملف النهائي.</div></div>
    <div style="direction:ltr;text-align:left"><div style="font-family:'Archivo Static',Archivo;font-weight:900;font-stretch:125%;font-size:30px;line-height:1">TASH</div><div class="lbl" style="color:${SMOKE};margin-top:6px">CREATIVE STUDIO · KUWAIT</div></div></div>
  <div class="cap"><span class="ok"></span><span class="sm">الأربعة مع بعض: عنوان بـ<bdi dir="ltr">Alexandria</bdi>، سطر بـ<bdi dir="ltr">Plex</bdi>، الاسم بـ<bdi dir="ltr">Archivo</bdi>، ولوحة بـ<bdi dir="ltr">Mono</bdi>. وزنين لكل عائلة بالكثير.</span></div>`);
(function scale() {
  const k = 0.3, rows = [
    ['--t-hero', 168, 'Alexandria 800', '<bdi dir="ltr">1–3</bdi> كلمات', `<span style="font-family:'Alexandria Static',Alexandria;font-weight:800">طشّ!</span>`],
    ['--t-h1', 112, 'Alexandria 800', 'عنوان', `<span style="font-family:'Alexandria Static',Alexandria;font-weight:800">خلّ إعلانك علينا</span>`],
    ['--t-h2', 72, 'Alexandria 800', 'عنوان فرعي', `<span style="font-family:'Alexandria Static',Alexandria;font-weight:800">مو بس فيديو… فكرة.</span>`],
    ['--t-h3', 48, 'Plex Arabic 600', 'سطر داعم', `<span style="font-family:'IBM Plex Sans Arabic';font-weight:600">من الفكرة لين الملف النهائي</span>`],
    ['--t-body', 34, 'Plex Arabic 400', 'أقل نص قابل للقراءة', `<span style="font-family:'IBM Plex Sans Arabic';font-weight:400">نكتب لك سالفة يفهمها جمهورك من أول ثانية.</span>`],
    ['--t-meta', 22, 'JetBrains Mono 600', 'لوحات، تباعد <bdi dir="ltr">0.24em</bdi>', `<span class="lbl" style="font-size:inherit;color:${PAPER}">CONCEPT AD — 01 / PERFUME</span>`],
  ];
  put('v-scale', rows.map(([tok, px, fam, use, sample]) => `<div style="display:grid;grid-template-columns:1fr 150px;gap:16px;align-items:center;border-bottom:1px solid ${LINE};padding:11px 0">
     <div style="font-size:${px * k}px;line-height:1.35;color:${PAPER};white-space:nowrap">${sample}</div>
     <div class="k" style="font-size:8.5px;line-height:1.6;color:${SMOKE}"><div style="color:${PAPER};font-size:11px">${px} px</div><div>${tok}</div><div>${fam}</div><div style="font-family:'IBM Plex Sans Arabic';letter-spacing:0;direction:rtl;text-align:left">${use}</div></div></div>`).join(''));
  put('v-mix', `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span class="ok"></span><span style="font-family:'Alexandria Static',Alexandria;font-weight:800;font-size:24px">إعلان <bdi style="font-family:'Archivo Static',Archivo;font-weight:800;font-stretch:125%;font-size:88%">3D</bdi> من الصفر</span><span class="k" style="color:${SMOKE}">88%</span></div>
    <div style="display:flex;align-items:center;gap:8px"><span class="no"></span><span style="font-family:'Alexandria Static',Alexandria;font-weight:800;font-size:24px">إعلان <bdi style="font-family:'Archivo Static',Archivo;font-weight:900;font-stretch:125%;font-size:122%">3D</bdi> من الصفر</span><span class="k" style="color:${SMOKE}">122%</span></div>`);
})();
(function arRules() {
  const big = (s, extra = '') => `<span style="font-family:'Alexandria Static',Alexandria;font-weight:800;font-size:30px;line-height:1.6;${extra}">${s}</span>`;
  const zwj = '‍';
  const tracked = ['ي' + zwj, zwj + 'س' + zwj, zwj + 'و', 'ل' + zwj, zwj + 'ف' + zwj, zwj + 'و', 'ن'].map(p => `<span style="display:inline-block;margin-left:.2em">${p}</span>`).join('');
  const letters = [...'خلّهم'].map(ch => `<span style="display:inline-block;margin-left:.12em">${ch}</span>`).join('');
  const wordsBox = ['خلّهم', 'يسولفون', 'عنك!'].map((w, i) => `<span style="display:inline-block;border:1.5px dashed ${INK};padding:0 8px;margin-left:8px;position:relative">${w}<span class="k" style="position:absolute;top:-9px;right:-6px;background:${PAPER};padding:0 3px;font-size:8px">${i + 1}</span></span>`).join('');
  const row = (ok, content, note = '') => `<div style="display:flex;align-items:center;gap:10px;min-height:52px"><span class="${ok ? 'ok' : 'no'}"></span>${content}${note ? `<span class="sm mute" style="margin-right:auto">${note}</span>` : ''}</div>`;
  const block = (title, en, rows, note) => `<div style="border-top:1.5px solid ${INK};padding-top:9px"><div style="display:flex;justify-content:space-between;align-items:baseline"><h3 style="font-size:13px">${title}</h3><span class="en s">${en}</span></div>
     <div style="margin:10px 0 10px">${rows}</div><p class="sm" style="margin:0">${note}</p></div>`;
  put('v-arrules', [
    block('لا تباعد بين الحروف، ولا مطّ', 'No letter-spacing, no kashida stretching',
      row(1, big('يسولفون')) + row(0, big(tracked), 'تباعد يقطع الوصل') + row(0, big('يســولــفــون'), 'كشيدة'),
      'العربي حروفه متصلة؛ أي تباعد يقطعها. بعض البرامج تتجاهل التباعد، وبعضها يكسر الوصل. لا تستخدمه، ولا تمطّ الكلمة بالكشيدة.'),
    block('بالحركة: الكلمة وحدة وحدة، مو الحرف', 'Animate per word or line — never split letters',
      row(1, big(wordsBox, 'font-size:26px'), 'من اليمين لليسار') + row(0, big(letters), 'حروف مفصولة = شكل معزول'),
      'نحرّك الكلمة أو السطر: قناع، حركة، شفافية، تمويه. إذا تبي تلوّن جزء من كلمة، كرّر الكلمة كاملة بطبقة فوقها وقصّها بقناع.'),
    block('علامات الترقيم', 'Punctuation',
      row(1, big('شلون أطلب؟', 'font-size:23px;white-space:nowrap') + `<span style="width:18px"></span>` + big('طشّ… خلّهم', 'font-size:23px;white-space:nowrap') + `<span style="width:18px"></span>` + big('«يسولفون»', 'font-size:23px;white-space:nowrap')) +
      row(0, `<span dir="ltr" style="font-family:'Alexandria Static',Alexandria;font-weight:800;font-size:23px;unicode-bidi:isolate;white-space:nowrap">خلّهم يسولفون عنك!</span>`, 'حقل <bdi dir="ltr">LTR</bdi>: «!» طاحت يمين') +
      row(0, big('شلون أطلب? طشّ... خلّهم', 'font-size:23px;white-space:nowrap'), 'علامات لاتينية'),
      'العلامات تكون على يسار آخر السطر. «،» و«؟» عربية وثابتة بمكانها، بس «!» و«.» تطيح يمين إذا الحقل <bdi dir="ltr">LTR</bdi>: صلّح الحقل مو النص. «» للاقتباس، و«…» حرف واحد لاصق بالكلمة قبله.'),
    block('نظام أرقام واحد بالقطعة', 'One numeral system per piece',
      row(1, big('٤ خطوات، و٣٠ ثانية', 'font-size:24px'), 'محتوى إبداعي') + row(1, big('4 خطوات، و30 ثانية', 'font-size:24px'), 'معلومات عملية') + row(0, big('٤ خطوات، و30 ثانية', 'font-size:24px'), 'خلط'),
      '<b class="w6">توصيتنا:</b> المحتوى الإبداعي (بوست، ريل، ستوري، كابشن) بالأرقام الهندية <bdi dir="ltr">٠–٩</bdi>. المعلومات العملية (أسعار، مواعيد، مقاسات، تواصل) واللوحات بالأرقام العربية <bdi dir="ltr">0–9</bdi>. وبكل قطعة نظام واحد بس. هالدليل كله <bdi dir="ltr">0–9</bdi> لأنه مواصفات.'),
  ].join(''));
})();

// ------------------------------------------------------------------ 06 devices
(function dots() {
  const head = (ar, en) => `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px"><h3 style="font-size:13px">${ar}</h3><span class="en s">${en}</span></div>`;
  const tile = (inner, h = 190) => `<div class="tile" style="height:${h}px;background:${CHAR};position:relative">${inner}</div>`;
  const dot = (d = 7) => `<span style="display:inline-block;width:${d}px;height:${d}px;border-radius:50%;background:${LIME}"></span>`;
  const bullets = tile(`<div style="padding:20px 22px">${['فكرة', 'سكربت', 'إنتاج', 'ملف جاهز'].map(t => `<div style="display:flex;align-items:center;gap:10px;font-size:14px;line-height:1.9">${dot()}${t}</div>`).join('')}
    <div style="margin-top:8px;font-size:14px;font-weight:600;display:flex;align-items:center;gap:8px">الخاص مفتوح <span style="display:inline-flex;gap:4px">${dot(6) + dot(6) + dot(6)}</span></div></div>`);
  // loader frames — kit.js typing(), period/phase from endcard-cues.json
  const fr = [0, 0.12, 0.24, 0.36, 0.48, 0.6];
  const loader = tile(svg('0 0 300 190', fr.map((t, j) => { const x0 = 18 + j * 46;
    return [1, 0, -1].map((k, i) => `<circle cx="${x0 + 20 + k * 11}" cy="${88 + typing(t, i, { period: CUES.typingPeriod, phase: CUES.typingPhase, amp: 14 })}" r="4.6" fill="${LIME}"/>`).join('') +
      T(x0 + 20, 132, t.toFixed(2), { size: 10, anchor: 'middle' }); }).join('') + `<line x1="14" y1="100" x2="286" y2="100" stroke="${LINE}" stroke-width="1"/>` + T(150, 164, 'PERIOD ' + CUES.typingPeriod + ' S · PHASE ' + CUES.typingPhase + ' S', { size: 9, anchor: 'middle', ls: 1.5 })));
  // dots-wipe: three dots grow right→left (ease-in, staggered) until they cover; the cut hides under lime; they exit left and reveal B
  function wipeFrame(p, n) {
    const w = 54, h = 96, A = `<rect width="${w}" height="${h}" fill="${INK}"/><text x="${w / 2}" y="${h / 2 + 5}" font-family="'Alexandria Static', Alexandria" font-weight="800" font-size="13" fill="${PAPER}" text-anchor="middle" direction="rtl">قبل</text>`;
    const B = `<rect width="${w}" height="${h}" fill="${PAPER}"/><text x="${w / 2}" y="${h / 2 + 5}" font-family="'Alexandria Static', Alexandria" font-weight="800" font-size="13" fill="${INK}" text-anchor="middle" direction="rtl">بعد</text>`;
    let s = p < 0.5 ? A : B; const out = E.inQuad(clamp((p - 0.5) / 0.5));
    if (p > 0.02 && p < 0.999) [0, 1, 2].forEach(i => { // i = 0 is the rightmost dot
      const k = E.inCubic(clamp((p - 0.06 - i * 0.06) / 0.34)), rr = p < 0.5 ? lerp(4, 74, k) : 74;
      s += `<circle cx="${w / 2 + (1 - i) * 11 - out * 150}" cy="${h / 2}" r="${rr}" fill="${LIME}"/>`; });
    return `<div style="text-align:center"><svg ${NS} viewBox="0 0 ${w} ${h}" style="display:block;width:${w}px;height:${h}px;direction:ltr"><clipPath id="wf${n}"><rect width="${w}" height="${h}"/></clipPath><g clip-path="url(#wf${n})">${s}</g></svg>
      <div class="k" style="font-size:7.5px;color:${SMOKE};margin-top:5px">${p.toFixed(2)}</div></div>`;
  }
  const ps = [0, 0.2, 0.32, 0.46, 0.84, 0.92, 1];
  const wipe = tile(`<div style="display:flex;gap:10px;padding:22px 16px 0;justify-content:center;direction:ltr">${ps.map((p, n) => wipeFrame(p, n)).join('')}</div>
    <div class="k" style="font-size:8px;color:${SMOKE};text-align:center;margin-top:12px">A → DOTS GROW R→L (EASE-IN) → FULL COVER = CUT → EXIT LEFT → B · 10–14 F · ONCE PER PIECE</div>`);
  const wm = tile(`<div style="position:absolute;inset:0;display:flex;justify-content:center;padding-top:8px"><div style="position:relative;width:98px;height:174px;overflow:hidden">
      <img src="/03-templates/assets/layl-bts-wire.png" style="width:98px;height:174px;display:block;object-fit:cover">
      <div style="position:absolute;left:8px;bottom:9px;width:18px" class="fig">${L.symbolSVG({ pad: 0 })}</div></div></div>`);
  put('v-dots', `<div style="display:grid;grid-template-columns:1fr 1fr 2fr;gap:14px">
    <div>${head('تعداد وتوقيع', 'Bullets & sign-off')}${bullets}<p class="sm" style="margin-top:8px">نقطة وحدة = تعداد. ثلاث نقاط = التوقيع، مرة وحدة بآخر الكلام.</p></div>
    <div>${head('تحميل / يكتب', 'Loader · typing')}${loader}<p class="sm" style="margin-top:8px">نطّة لكل نقطة من اليمين لليسار، بنفس توقيت التوقيع المتحرّك.</p></div>
    <div>${head('مسحة النقاط', 'Dots-wipe transition · computed frames')}${wipe}<p class="sm" style="margin-top:8px">النقاط تكبر لين تغطي الإطار، والقطع مخفي تحت الليموني، وتطلع يسار وتكشف المشهد الجديد. مرة وحدة بالقطعة.</p></div></div>`);
  // watermark + do / don't
  const dd = (ok, inner, ar) => `<div class="tile" style="background:${CHAR};height:84px;display:flex;align-items:center;gap:14px;padding:0 16px"><span class="${ok ? 'ok' : 'no'}"></span>
     <div style="width:84px;flex:0 0 84px">${svg('0 0 120 50', inner)}</div><span class="sm">${ar}</span></div>`;
  const row3 = (rs, gap, col = LIME) => rs.map((r_, i) => `<circle cx="${92 - i * gap}" cy="25" r="${r_}" fill="${Array.isArray(col) ? col[i] : col}"/>`).join('');
  put('v-dots-dd', `<div style="display:grid;grid-template-columns:1fr 3fr;gap:14px">
    <div>${head('علامة مائية', 'Watermark')}${wm}<p class="sm" style="margin-top:8px">بصور الكواليس حقتنا بس: صغيرة، تحت يسار. ولا مرة على شغل العميل.</p></div>
    <div>${head('النقاط دايماً ثلاث، متساوية، بصف', 'Always three, equal, in a row')}<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${[
      dd(1, row3([10, 10, 10], 29), 'ثلاث نقاط متساوية بصف'),
      dd(0, [0, 1, 2, 3].map(i => `<circle cx="${104 - i * 27}" cy="25" r="10" fill="${LIME}"/>`).join(''), 'عدد ثاني'),
      dd(0, `<circle cx="60" cy="12" r="10" fill="${LIME}"/><circle cx="46" cy="37" r="10" fill="${LIME}"/><circle cx="74" cy="37" r="10" fill="${LIME}"/>`, 'ترتيب ثاني (مثلث)'),
      dd(0, row3([13, 8, 5], 26, [LIME, PAPER, SMOKE]), 'أحجام أو ألوان مختلفة'),
    ].join('')}</div></div></div>`);
})();
(function devices2() {
  const col = (ar, en, vis, rules, bad) => `<div style="display:flex;flex-direction:column"><h2 style="font-size:20px">${ar}</h2><p class="en" style="margin-bottom:12px">${en}</p>${vis}<div style="margin-top:10px">${rules}</div><div style="margin-top:auto">${bad}</div></div>`;
  const rule = (ok, ar) => `<div class="cap" style="margin-top:5px"><span class="${ok ? 'ok' : 'no'}"></span><span class="sm">${ar}</span></div>`;
  const badTile = (inner, ar) => `<div class="tile" style="height:112px;background:${PAPER};box-shadow:inset 0 0 0 1px ${RULE_P};display:flex;align-items:center;gap:14px;padding:0 14px"><span class="no"></span>${inner}<span class="sm" style="flex:1">${ar}</span></div>`;
  const bub = (txt, w, extra = '') => `<div style="display:inline-block;background:${INK};color:${PAPER};border-radius:22px;padding:9px 16px 10px;font-size:13px;font-weight:600;max-width:${w}px;${extra}">${txt}</div>`;
  const chat = `<div class="tile" style="height:300px;background:${PAPER};box-shadow:inset 0 0 0 1px ${RULE_P};padding:22px 20px">
      <div style="width:170px" class="fig">${svg('630 66 340 192', `<path d="${bubblePath(800, 150, 300, 150)}" fill="${INK}"/>` + [1, 0, -1].map((k, i) => `<circle cx="${800 + k * 82}" cy="${150 + typing(0.3, i, { amp: 14 })}" r="26" fill="${LIME}"/>`).join(''))}</div>
      <div style="margin-top:22px">${bub('منو مسوي هالإعلان؟', 230)}</div></div>`;
  const slate = `<div class="tile" style="height:300px;background:${INK};color:${PAPER};padding:26px 22px;display:flex;flex-direction:column;justify-content:space-between">
      <div><div class="lbl" style="font-size:10px;color:${PAPER};letter-spacing:.24em">CONCEPT AD — 01 / PERFUME</div><div style="font-size:12.5px;margin-top:7px">إعلان تجريبي — علامة خيالية</div></div>
      <div class="lbl" style="font-size:10px;color:${SMOKE};letter-spacing:.24em">TASH / 2026</div>
      <div class="lbl" style="font-size:10px;color:${SMOKE};letter-spacing:.24em">SC 03 · TK 1</div></div>`;
  const cn = (x, y, sx, sy, c = PAPER, w = 4, L_ = 54) => `<path d="M${x} ${y + sy * L_} V${y} H${x + sx * L_}" fill="none" stroke="${c}" stroke-opacity=".85" stroke-width="${w}"/>`;
  const corners = `<div class="tile" style="height:300px;background:${INK};display:flex;justify-content:center;align-items:center">
      <div style="position:relative;width:169px;height:300px"><img src="/03-templates/assets/layl-bts-clay.png" style="width:169px;height:300px;object-fit:cover;display:block">
      <div style="position:absolute;inset:0" class="fill">${svg('0 0 1080 1920', cn(170, 430, 1, 1) + cn(910, 430, -1, 1) + cn(170, 1490, 1, -1) + cn(910, 1490, -1, -1), 'preserveAspectRatio="xMidYMid slice"')}</div></div></div>`;
  // ✕ minis, drawn
  const mini = inner => `<div style="width:52px;flex:0 0 52px">${svg('0 0 108 192', `<rect width="108" height="192" fill="${INK}"/>` + inner)}</div>`;
  const hud = mini(`<g font-family="'JetBrains Mono Static', 'JetBrains Mono'" font-size="7" fill="${PAPER}" letter-spacing="1"><text x="6" y="12">SC 03</text><text x="102" y="12" text-anchor="end">TK 1</text><text x="6" y="186">00:00:03:12</text><text x="102" y="186" text-anchor="end">REC</text><text x="54" y="100" text-anchor="middle">CONCEPT AD</text></g>`);
  const clutter = mini(`${cn(14, 30, 1, 1, PAPER, 2, 14)}${cn(94, 30, -1, 1, PAPER, 2, 14)}${cn(14, 162, 1, -1, PAPER, 2, 14)}${cn(94, 162, -1, -1, PAPER, 2, 14)}<g stroke="${LINE}">${[36, 54, 72].map(x => `<line x1="${x}" y1="0" x2="${x}" y2="192"/>`).join('')}</g><circle cx="20" cy="178" r="3" fill="${LIME}"/><circle cx="29" cy="178" r="3" fill="${LIME}"/><circle cx="38" cy="178" r="3" fill="${LIME}"/><text x="54" y="16" font-family="'JetBrains Mono Static', 'JetBrains Mono'" font-size="7" fill="${PAPER}" text-anchor="middle">TASH / 2026</text>`);
  put('v-devices2', [
    col('فقاعة المحادثة', 'Device 2 · the chat bubble', chat,
      rule(1, 'فقاعة «يكتب…» نفس شكل التوقيع، أو سطر محادثة مُمثَّل.') + rule(1, 'واجهة محادثة عامة: بدون أسماء، بدون أرقام، بدون ادعاءات.') + rule(0, 'لا شعارات أو واجهات منصات حقيقية.'),
      badTile(bub('+500 عميل راضي!', 160, 'font-size:12px;opacity:.9'), 'أرقام مؤلفة أو آراء عملاء مخترعة')),
    col('اللوحة (سليت)', 'Device 3 · the slate', slate,
      rule(1, '<bdi dir="ltr">JetBrains Mono 600</bdi>، حروف كبيرة، تباعد <bdi dir="ltr">0.24em</bdi>، وحجم <bdi dir="ltr">22–26 px</bdi> على مقاس <bdi dir="ltr">1080</bdi>.') + rule(1, 'لوحة <bdi dir="ltr">CONCEPT AD</bdi> مع «إعلان تجريبي — علامة خيالية» إلزامية بالإعلانات التجريبية: بآخر ثواني الفيديو وعلى الغلاف.') + rule(0, 'لا عربي بخط المونو.'),
      badTile(hud, 'لوحات وتوقيتات بكل زاوية: يصير شكل لعبة')),
    col('زوايا الإطار', 'Device 4 · frame corners', corners,
      rule(1, 'للكواليس وشغل «قيد الإنتاج»: سماكة <bdi dir="ltr">4 px</bdi> على <bdi dir="ltr">1080</bdi>، والضلع حوالي <bdi dir="ltr">2D</bdi>، ورقي <bdi dir="ltr">85%</bdi>.') + rule(1, 'تحضن الموضوع، ما تلمسه.') + rule(0, 'مو زينة على كل بوست.'),
      badTile(clutter, 'زوايا + شبكة + لوحة + نقاط بنفس الإطار = زحمة')),
  ].join(''));
})();

// ------------------------------------------------------------------ 07 layout
(function post() {
  const sc = 0.4, W = 1080, H = 1350, m = 96, crop = (W - H * 3 / 4) / 2, gut = 24, cw = (W - 2 * m - 5 * gut) / 6;
  const hatch = `<pattern id="hatch-p" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="14" stroke="${LIME}" stroke-width="5"/></pattern>`;
  let cols = ''; for (let i = 0; i < 6; i++) { const x = m + i * (cw + gut); cols += `<rect x="${x}" y="${m}" width="${cw}" height="${H - 2 * m}" fill="${PAPER}" fill-opacity=".06"/>`; }
  const over = `<defs>${hatch}</defs>${cols}
    <rect x="0" y="0" width="${crop}" height="${H}" fill="url(#hatch-p)" opacity=".85"/><rect x="${W - crop}" y="0" width="${crop}" height="${H}" fill="url(#hatch-p)" opacity=".85"/>
    <rect x="${m}" y="${m}" width="${W - 2 * m}" height="${H - 2 * m}" fill="none" stroke="${PAPER}" stroke-width="3" stroke-dasharray="14 10"/>
    ${T(crop + 14, 60, '3:4 GRID CROP · ≈' + Math.round(crop) + ' PX EACH SIDE', { size: 24, fill: LIME, ls: 3 })}
    ${T(W - m - 10, m + 34, 'MARGIN 96', { size: 24, fill: PAPER, ls: 3, anchor: 'end' })}`;
  const tiles = ['post-statement-01', 'post-statement-02', 'post-cta-01'];
  put('v-post', `<div style="display:flex;gap:28px;align-items:flex-start">
    <div><div style="position:relative;width:${W * sc}px;height:${H * sc}px"><img src="/03-templates/examples/post-statement-01.png" style="width:100%;height:100%;display:block">
      <div class="fill" style="position:absolute;inset:0">${svg(`0 0 ${W} ${H}`, over)}</div></div>
      <div class="cap"><span class="ok"></span><div><div class="w6">قالب «جملة» من <bdi dir="ltr">03-templates</bdi>، وفوقه الشبكة والهوامش والقصّة</div><div class="en">03-templates/examples/post-statement-01.png · 1080×1350</div></div></div></div>
    <div style="flex:1">
      <h3>شلون يبين بشبكة البروفايل</h3><p class="en" style="margin-bottom:10px">Profile grid · centred 3:4 crop</p>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2px;background:${PAPER};direction:ltr">${tiles.map(t => `<div style="aspect-ratio:3/4;overflow:hidden"><img src="/03-templates/examples/${t}.png" style="width:100%;height:100%;object-fit:cover;display:block"></div>`).join('')}</div>
      <p class="sm" style="margin-top:10px">الشعار والكلام يبقون داخل القصّة. الشعار تحت يسار، بنفس المكان بكل بوست، فالشبكة تبين مرتبة.</p>
      <p class="pe">Logo bottom-left, same anchor on every post, so the grid reads as one system.</p>
    </div></div>`);
})();
(function safe() {
  const W = 1080, H = 1920;
  const hatch = id => `<pattern id="${id}" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="22" stroke="${SMOKE}" stroke-width="5" stroke-opacity=".5"/></pattern>`;
  const sample = (y) => `<text x="540" y="${y}" font-family="'Alexandria Static', Alexandria" font-weight="800" font-size="104" fill="${PAPER}" text-anchor="middle" direction="rtl">خلّ إعلانك علينا</text>`;
  const frame = (id, inner, label, ar, en, rule) => `<div><div style="border:1px solid ${LINE}" class="fig">${svg(`0 0 ${W} ${H}`, `<defs>${hatch(id)}</defs><rect width="${W}" height="${H}" fill="${CHAR}"/>${inner}`)}</div>
    <div style="margin-top:8px"><h3>${ar}</h3><p class="en s">${en}</p><p class="sm" style="margin:6px 0 0">${rule}</p><div class="k" style="font-size:8.5px;color:${SMOKE};margin-top:6px;line-height:1.7;text-align:right">${label}</div></div></div>`;
  const dim = (x, y, s, a = 'start') => T(x, y, s, { size: 34, fill: PAPER, ls: 3, anchor: a });
  const wm = (y) => wmAt(540 - 130, y, 260, { body: PAPER, dot: LIME });
  const reel = `<rect width="${W}" height="220" fill="url(#h1)"/><rect y="1500" width="${W}" height="420" fill="url(#h1)"/><rect x="${W - 120}" y="960" width="120" height="540" fill="url(#h1)"/>
    <rect width="72" height="${H}" fill="url(#h1)"/><rect x="${W - 72}" width="72" height="960" fill="url(#h1)"/>
    <path d="M72 220 H1008 V960 H960 V1500 H72 Z" fill="none" stroke="${LIME}" stroke-width="6"/>${sample(820)}${wm(900)}
    ${dim(90, 180, 'TOP 220')}${dim(90, 1580, 'BOTTOM 420')}${dim(930, 1060, 'RAIL', 'end')}`;
  const cover = `<rect width="${W}" height="240" fill="url(#h2)"/><rect y="1680" width="${W}" height="240" fill="url(#h2)"/>
    <rect x="0" y="240" width="${W}" height="1440" fill="none" stroke="${PAPER}" stroke-width="5" stroke-dasharray="20 14"/>
    <path d="M72 240 H1008 V1500 H72 Z" fill="none" stroke="${LIME}" stroke-width="6"/>${sample(860)}${wm(940)}
    ${dim(90, 200, 'GRID CROP 1080×1440')}${dim(90, 1760, 'Y 240 → 1680')}`;
  const story = `<rect width="${W}" height="250" fill="url(#h3)"/><rect y="1620" width="${W}" height="300" fill="url(#h3)"/>
    <rect width="72" height="${H}" fill="url(#h3)"/><rect x="${W - 72}" width="72" height="${H}" fill="url(#h3)"/>
    <path d="M72 250 H1008 V1620 H72 Z" fill="none" stroke="${LIME}" stroke-width="6"/>${sample(860)}${wm(940)}
    ${dim(90, 200, 'TOP 250')}${dim(90, 1700, 'BOTTOM 300')}`;
  const hl = `<path d="M0 0 H${W} V${H} H0 Z M${540 - 330} 960 a330 330 0 1 0 660 0 a330 330 0 1 0 -660 0 Z" fill="url(#h4)" fill-rule="evenodd"/>
    <circle cx="540" cy="960" r="330" fill="none" stroke="${LIME}" stroke-width="6"/>${L.symbolSVG({ pad: 0 }).replace(/^<svg[^>]*>/, `<svg x="${540 - 170}" y="${960 - 60}" width="340" height="120" viewBox="${(() => { const ds = DOTS; return `${ds[2].cx - R} ${ds[0].cy - R} ${ds[0].cx - ds[2].cx + 2 * R} ${2 * R}`; })()}">`)}
    ${dim(540, 1380, 'Ø 660', 'middle')}`;
  put('v-safe', [
    frame('h1', reel, 'TEXT X 72→1008 · Y 220→1500<br>RIGHT RAIL 120 PX · LOWER HALF', 'ريل', 'Reel · in-feed UI', 'الكلام المهم داخل الخط. بالنص التحتي خلّه بعيد عن عمود الأزرار يمين.'),
    frame('h2', cover, 'GRID SHOWS Y 240→1680<br>KEY TEXT Y 240→1500', 'غلاف ريل', 'Reel cover · profile crop', 'البروفايل يقص الغلاف <bdi dir="ltr">3:4</bdi>، فالعنوان والمنتج <span style="white-space:nowrap">بين <bdi dir="ltr">240</bdi> و<bdi dir="ltr">1500</bdi>.</span>'),
    frame('h3', story, 'TEXT X 72→1008 · Y 250→1620', 'ستوري', 'Story', 'فوق لاسم الحساب، وتحت لخانة الرد. الكلام بالنص، مو على الحواف.'),
    frame('h4', hl, 'CIRCLE Ø 660 · CENTRED', 'غلاف هايلايت', 'Highlight cover', 'دائرة <bdi dir="ltr">660</bdi> بالنص: رمز واحد واضح. الاسم ينكتب بإنستغرام، مو على الصورة.'),
  ].join(''));
})();

// ------------------------------------------------------------------ 08 art direction
put('v-ad-principles', [
  ['الضوء', 'Light', 'ضوء رئيسي واحد، وضوء حافة يفصل الشكل، وظل تلامس تحت المنتج. للزجاج: خلفية داكنة وشريطين ضوء على الجوانب.'],
  ['الخامات', 'Materials', 'زجاج بانكسار وسماكة، معدن مصقول، لمعة الأكل، بخار مضاء من ورا. اللقطة القريبة تفضح البساطة، فأضف تفاصيل السطح.'],
  ['الحركة', 'Motion', 'الكاميرا دايماً تتحرك بهدوء: دفع بطيء، قوس <bdi dir="ltr">20–40°</bdi>، وسحب تركيز مرة وحدة. حركة كبيرة وحدة بالقطعة.'],
  ['التلوين', 'Grade', 'تلوين واحد للقطعة، أسود مرفوع شوي، حبيبات <bdi dir="ltr">0.06</bdi> بالكثير، وتعتيم أطراف خفيف. لا أسود صافي ولا أبيض صافي.'],
  ['اللقطات المولّدة', 'AI footage', 'بموافقة المالك بس، والمدير الإبداعي هو اللي يولّد. نشوف كل فريم بحجمه الكامل (الأيادي، الحواف، الأشياء اللي تتشكّل) ونقص أي جزء فيه غلط. الكلام والشعار نكتبهم بالكود فوق اللقطة، مو داخلها.'],
].map(([ar, en, t]) => `<div class="item"><h3 style="display:flex;justify-content:space-between"><span>${ar}</span><span class="en s">${en}</span></h3><p>${t}</p></div>`).join(''));
// how each frame was made is stated under it: LAYL is built in code; STAKK's pictures are owner-approved Higgsfield footage
put('v-ad-frames', [
  ['ad-layl-hero', 'CONCEPT AD — 01 / PERFUME', '«ليل»: زجاج على أرضية داكنة، ضوء حافة، وعنبر من جوّا.', '3D مبني بالكود (<bdi dir="ltr">Three.js</bdi>).', 'Dark-field glass, rim light, amber inside · CGI'],
  ['ad-stakk-hero', 'CONCEPT AD — 02 / BURGER', '«ستاك»: أحمر العميل، ضوء دافي، لمعة الجبن، وظل تلامس.', 'لقطات مولّدة بـ<bdi dir="ltr">Higgsfield</bdi> بموافقة المالك. التلوين والمونتاج والكلام من طشّ.', 'Client red, warm key, glisten, contact shadow · AI&nbsp;footage'],
].map(([f, slate, ar, how, en]) => `<div><img src="assets/${f}.jpg" style="width:100%;aspect-ratio:9/16;object-fit:cover;display:block">
  <div class="lbl" style="margin-top:8px;text-align:right">${slate}</div><p class="sm" style="margin:3px 0 0">${ar}</p><p class="sm mute" style="margin:0">${how}</p><p class="sm mute" style="margin:0">إعلان تجريبي — علامة خيالية</p><p class="en s">${en} · fictional&nbsp;brand</p></div>`).join(''));
(function client() {
  const distinct = (pal, n) => { const out = []; for (const p of pal) { if (out.every(q => { const [a, b] = [lab(p.hex), lab(q.hex)]; return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 12; })) out.push(p); if (out.length === n) break; } return out; };
  const H = 206, Wd = Math.round(H * 9 / 16);
  const chips = list => `<div style="display:flex;gap:3px;margin-top:7px">${list.map(h => `<div style="flex:1;min-width:0"><div style="height:14px;background:${h};box-shadow:inset 0 0 0 1px ${RULE_P}"></div><div class="k" style="font-size:6.5px;color:${META_P};margin-top:2px;text-align:center">${h}</div></div>`).join('')}</div>`;
  const im = (key, f, l) => `<div style="width:${Wd}px"><img src="assets/ad-${key}-${f}.jpg" style="width:${Wd}px;height:${H}px;object-fit:cover;display:block"><div class="k" style="font-size:7px;color:${META_P};margin-top:3px;text-align:right">${l}</div></div>`;
  const row = (key, name, ar) => { const pal = distinct(MEDIA.palettes[key], 4).map(p => p.hex);
    return `<div style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1.5px solid ${INK};padding-bottom:5px;margin-bottom:9px"><h3 style="font-size:13px">${ar}</h3><span class="lbl">${name}</span></div>
      <div style="display:flex;gap:20px;align-items:flex-start">
        <div style="width:${2 * Wd + 8}px"><div class="sm w6" style="margin-bottom:5px">هوية العميل <span class="en s" style="display:inline;margin-right:4px">Client palette · measured</span></div>
          <div style="display:flex;gap:8px">${im(key, 'hero', 'HERO')}${im(key, 'card', 'CLIENT END CARD')}</div>${chips(pal)}</div>
        <div style="align-self:center;color:${META_P};font-size:22px;font-family:'IBM Plex Sans Arabic'">←</div>
        <div style="width:${Wd}px"><div class="sm w6" style="margin-bottom:5px">توقيع طشّ</div>${im(key, 'tail', 'LAST FRAME')}${chips([INK, PAPER, LIME])}</div>
      </div></div>`; };
  put('v-client', row('layl', 'LAYL · PERFUME · FICTIONAL', '«ليل» — عطر') + row('stakk', 'STAKK · BURGER · FICTIONAL', '«ستاك» — برجر'));
})();

// ------------------------------------------------------------------ 09 motion
(function film() {
  const frames = [[0.34, 'يكتب…'], [0.74, 'تتجمّع'], [0.96, 'تطير'], [1.12, 'طشّ!'], [1.36, 'الشدّة'], [1.80, 'السطر'], [2.40, 'الحساب'], [3.05, 'نبضة'], [4.19, 'النهاية']];
  put('v-film', `<div style="display:grid;grid-template-columns:repeat(${frames.length},1fr);gap:6px;direction:ltr">` + frames.map(([t, ar]) =>
    `<div><img src="assets/sting/sting-${t.toFixed(2)}.png" style="width:100%;aspect-ratio:1;display:block;border:1px solid ${LINE}">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:4px"><span class="k" style="font-size:8px;color:${PAPER}">${t.toFixed(2)} s</span><span style="font-size:9.5px;direction:rtl">${ar}</span></div></div>`).join('') + `</div>`);
  // timeline from the cue file (time runs left→right, like an editor)
  const X = t => 30 + t / CUES.duration * 940, y = 64;
  const seg = (a, b, col, lab_) => `<rect x="${X(a)}" y="${y - 7}" width="${X(b) - X(a)}" height="14" rx="3" fill="${col}"/>` + T((X(a) + X(b)) / 2, y + 30, lab_, { size: 10, anchor: 'middle', ls: 1.5 });
  const mk = tiers([['SNAP ' + CUES.snap, CUES.snap, LIME], ['SHADDA ' + CUES.shadda, CUES.shadda], ['TAGLINE ' + CUES.tagline, CUES.tagline], ['HANDLE ' + CUES.handle, CUES.handle]]
    .map(([text, t, col]) => ({ text, t, col: col || PAPER, x: X(t) - 2 })), 7.2, 12);
  const maxT = Math.max(...mk.map(m => m.tier));
  mk.push({ text: 'END ' + CUES.duration, t: CUES.duration, col: PAPER, x: X(CUES.duration), tier: maxT });
  // labels sit above the axis, so the deepest tier goes nearest the axis: a leader then only crosses rows whose labels start to its right
  const mark = m => { const ly = y - 22 - (maxT - m.tier) * 15; return `<line x1="${X(m.t)}" y1="${ly + 3}" x2="${X(m.t)}" y2="${y + 16}" stroke="${m.col}" stroke-width="2"/>` + T(m.x - (m.t === CUES.duration ? 0 : 0), ly, m.text, { size: 10, anchor: m.t === CUES.duration ? 'end' : 'start', fill: m.col, ls: 1 }); };
  let ticks = ''; for (let t = 0; t <= CUES.duration + 1e-6; t += 0.5) ticks += `<line x1="${X(t)}" y1="${y + 40}" x2="${X(t)}" y2="${y + 46}" stroke="${SMOKE}"/>` + T(X(t), y + 60, t.toFixed(1), { size: 9, anchor: 'middle' });
  put('v-timeline', svg('0 0 1000 156', `<line x1="${X(0)}" y1="${y}" x2="${X(CUES.duration)}" y2="${y}" stroke="${LINE}" stroke-width="2"/>` +
    seg(CUES.typingStart, CUES.converge, CHAR, 'TYPING') + seg(CUES.converge, CUES.snap, SMOKE, 'CONVERGE') + seg(CUES.pulse, CUES.pulse + 0.62 + 0.3, CHAR, 'PULSE') +
    CUES.ticks.map(t => `<circle cx="${X(t)}" cy="${y}" r="4" fill="${LIME}"/>`).join('') +
    mk.map(mark).join('') +
    `<rect x="${X(CUES.snap)}" y="${y - 7}" width="${X(CUES.shadda) - X(CUES.snap)}" height="14" rx="3" fill="${LIME}" opacity=".35"/>` + ticks +
    T(X(0), y + 84, 'SECONDS · ENDCARD-CUES.JSON · TIME RUNS LEFT → RIGHT', { size: 9, ls: 1.5 })));
  // easing curves straight from kit.js
  const plot = (fn, ar, en, frames_, lo = 0, hi = 1) => { const w = 200, h = 168, px = t => 12 + t * (w - 24), py = v => h - 14 - (v - lo) / (hi - lo) * (h - 34);
    let d = ''; for (let i = 0; i <= 80; i++) { const t = i / 80; d += (i ? 'L' : 'M') + px(t).toFixed(1) + ' ' + py(fn(t)).toFixed(1); }
    return `<div>${svg(`0 0 ${w} ${h}`, `<line x1="12" y1="${py(0)}" x2="${w - 12}" y2="${py(0)}" stroke="${LINE}"/><line x1="12" y1="${py(1)}" x2="${w - 12}" y2="${py(1)}" stroke="${LINE}" stroke-dasharray="3 4"/><path d="${d}" fill="none" stroke="${LIME}" stroke-width="2.5"/>`)}
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:3px"><span class="w6" style="font-size:10px">${ar}</span><span class="k" style="font-size:7.5px;color:${SMOKE}">${frames_}</span></div><div class="en s">${en}</div></div>`; };
  put('v-ease', [
    plot(E.outExpo, 'دخول: يوصل بسرعة ويهدى', 'E.outExpo · entrances', '10–18 F'),
    plot(E.inCubic, 'خروج: يتسارع ويطلع', 'E.inCubic · exits', '9–17 F'),
    plot(x => spring(x, { freq: 1.9, damp: 7 }), 'نطّة وحدة بالقطعة', 'spring 1.9 / 7 · the slam', '+19%', -0.05, 1.25),
    plot(E.inOutSine, 'انتقال لون أو أرضية', 'E.inOutSine · ramps', '9–20 F'),
    `<div><h3>قواعد الحركة</h3><p class="en s" style="margin-bottom:6px">Motion rules</p><ul class="dots lime">
      <li style="font-size:10px;line-height:1.55">كل فريم دالة من الوقت: لا أنيميشن <bdi dir="ltr">CSS</bdi> ولا عشوائية.</li>
      <li style="font-size:10px;line-height:1.55">العربي يتحرّك كلمة كلمة أو سطر سطر.</li>
      <li style="font-size:10px;line-height:1.55">المسحات من اليمين لليسار، اتجاه الكتابة.</li>
      <li style="font-size:10px;line-height:1.55">الشعار يوصل، ما يكبر من صفر. وآخر فريم = الشعار الثابت.</li></ul></div>`,
  ].join(''));
})();
(function sound() {
  const dur = MEDIA.duration, w = 1000, h = 196, mid = 116, X = t => 20 + t / CUES.duration * 960, amp = 62;
  const pk = MEDIA.peaks, max = Math.max(...pk.map(p => Math.max(-p[0], p[1])));
  let bars = ''; pk.forEach((p, i) => { const t = (i + 0.5) / pk.length * dur; if (t > CUES.duration) return; const x = X(t);
    bars += `<line x1="${x.toFixed(1)}" y1="${(mid - p[1] / max * amp).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(mid - p[0] / max * amp).toFixed(1)}" stroke="${INK}" stroke-width="1.6"/>`; });
  const ev = [ // from sonic_logo() in _system/audio/tashaudio.py, placed with the cue file
    [0.02, 'POP', 'فقاعة', 'pop(300→700 Hz)', 'الفقاعة تطلع'],
    ...CUES.ticks.map((t, i) => [t, 'TICK', i === 1 ? 'تكّ تكّ تكّ' : '', ['2.2', '2.5', '2.8'][i] + ' kHz', 'النقاط تكتب']),
    [CUES.snap - 0.42 + 0.5 * 0.6, 'WHOOSH', 'هوا', 'whoosh 0.5 s · peak', 'النقاط تطير'],
    [CUES.snap - 0.004, 'HIT', 'طشّ!', 'tash_hit(): impact + Khaleeji group clap + air', 'الكلمة تطيح، قبل الفريم بـ4 ms'],
    [CUES.shadda + 0.06, 'POP', 'الشدّة', 'pop(500→1300 Hz)', 'الشدّة تنزل'],
    [CUES.pulse + 0.18, 'TICKS', 'نبضة', '2.6 / 2.9 / 3.2 kHz', 'النقاط تنبض'],
  ];
  const tv = tiers(ev.map(([t, k]) => ({ t, text: k, x: X(t) })), 6.6, 6);
  const marks = tv.map(m => { const ly = 12 + m.tier * 13, hit = m.text === 'HIT';
    return `<line x1="${X(m.t)}" y1="${ly + 3}" x2="${X(m.t)}" y2="${h - 18}" stroke="${hit ? INK : META_P}" stroke-width="${hit ? 2 : 1}" stroke-dasharray="${hit ? '' : '3 4'}"/>` +
      T(X(m.t) + 4, ly, m.text, { size: 9, fill: hit ? INK : META_P, ls: 1.2, weight: hit ? 700 : 600 }); }).join('');
  let axis = ''; for (let t = 0; t <= CUES.duration + 1e-6; t += 0.5) axis += T(X(t), h - 2, t.toFixed(1), { size: 9, fill: META_P, anchor: 'middle' });
  put('v-wave', svg(`0 0 ${w} ${h}`, `<line x1="20" y1="${mid}" x2="980" y2="${mid}" stroke="${RULE_P}"/>` + bars + marks + axis));
  put('v-sound-events', `<table><thead><tr><th style="width:14%"><span class="ar">الوقت</span>TIME</th><th style="width:18%"><span class="ar">الصوت</span>SOUND</th><th><span class="ar">من الكود</span>SOURCE</th><th style="width:30%"><span class="ar">بالصورة</span>PICTURE</th></tr></thead><tbody>` +
    [[0.02, 'فقاعة', 'pop(300→700 Hz)', 'الفقاعة تطلع'],
     [CUES.ticks.map(t => t.toFixed(2)).join(' · '), 'تكّ تكّ تكّ', 'tick() · 2.2 / 2.5 / 2.8 kHz', 'النقاط تكتب'],
     [(CUES.snap - 0.42).toFixed(2), 'هوا', 'whoosh(0.5 s) · peak ≈ ' + (CUES.snap - 0.42 + 0.3).toFixed(2) + ' s', 'النقاط تطير'],
     [(CUES.snap - 0.004).toFixed(3), '<b>طشّ!</b>', 'tash_hit(): impact + claps_ensemble + air', 'الكلمة تطيح'],
     [(CUES.shadda + 0.06).toFixed(2), 'بوب', 'pop(500→1300 Hz)', 'الشدّة تنزل'],
     [`${(CUES.pulse + 0.18).toFixed(2)}–${(CUES.pulse + 0.42).toFixed(2)}`, 'تكّات خفيفة', 'tick() · 2.6 / 2.9 / 3.2 kHz', 'النقاط تنبض']]
      .map(([t, a, s, p]) => `<tr><td class="k" style="font-size:9px">${t}</td><td class="w6">${a}</td><td class="k" style="font-size:8px;color:${META_P}">${s}</td><td>${p}</td></tr>`).join('') + `</tbody></table>
    <p class="sm" style="margin-top:10px">بالإعلان الكامل: نزّل الموسيقى <bdi dir="ltr">10–15 dB</bdi> قبل الضربة بـ<bdi dir="ltr">0.2–0.3 s</bdi>، أو خلّ الموسيقى تقفل قبل التوقيع. وإذا مقام الأغنية يتعارض مع التكّات، غيّر طبقتها.</p>`);
  const L1 = MEDIA.loudness;
  const box_ = (v, k, sub) => `<div style="border:1.5px solid ${INK};padding:8px 10px 7px"><div style="font-family:'Archivo Static',Archivo;font-weight:800;font-stretch:125%;font-size:20px;direction:ltr;text-align:right">${v}</div><div class="lbl" style="text-align:right;color:${INK}">${k}</div><div class="sm mute" style="margin-top:2px">${sub}</div></div>`;
  const ok = (I, TP) => Math.abs(I + 14) <= 1 && TP <= -1;
  put('v-loud', `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${box_('−14 LUFS', 'INTEGRATED', 'الهدف')}${box_('≤ −1 dBTP', 'TRUE PEAK', 'الحد')}</div>
    <table style="margin-top:10px"><thead><tr><th><span class="ar">مقاس فعلياً</span>MEASURED · EBU R128</th><th>I</th><th>TP</th><th>LRA</th><th></th></tr></thead><tbody>
      <tr><td class="k" style="font-size:8px">tash-sonic-logo.wav</td><td class="k">${L1.wav.I}</td><td class="k">${L1.wav.TP}</td><td class="k">${L1.wav.LRA}</td><td><span class="${ok(L1.wav.I, L1.wav.TP) ? 'ok' : 'no'}"></span></td></tr>
      <tr><td class="k" style="font-size:8px">tash-logo-sting-9x16.mp4</td><td class="k">${L1.mp4.I}</td><td class="k">${L1.mp4.TP}</td><td class="k">${L1.mp4.LRA}</td><td><span class="${ok(L1.mp4.I, L1.mp4.TP) ? 'ok' : 'no'}"></span></td></tr></tbody></table>
    <ul class="dots" style="margin-top:10px"><li class="sm">الماستر بين <bdi dir="ltr">−15</bdi> و<bdi dir="ltr">−14 LUFS</bdi>، والذروة <bdi dir="ltr">≤ −1.5 dBTP</bdi>. الرندر بعدها يطبّق <bdi dir="ltr">loudnorm</bdi>.</li>
      <li class="sm">افحص بـ<bdi dir="ltr" class="k">audio-check.sh</bdi>: لا طقطقة، لا ذيل بيس طويل، ولا حدّة بين <bdi dir="ltr">2–5 kHz</bdi>.</li>
      <li class="sm">صوت أصلي بس. لا موسيقى ولا مؤثرات منزّلة.</li></ul>`);
})();

// ------------------------------------------------------------------ 10 voice
put('v-voice-rules', [
  ['اكتبها مثل ما تقولها', 'Write it the way you say it', 'كويتي مرتب: شلون، الحين، خلّ. لا فصحى متخشبة ولا عامية شوارع.'],
  ['قصير', 'Short', 'فكرة وحدة بالجملة. إذا احتاجت فاصلتين، قسّمها.'],
  ['ورّ، لا توصف', 'Show, don\'t describe', '«إبداع» و«احترافية» مو دليل. الشغل هو الدليل.'],
  ['ولا رقم بدون إثبات', 'No number without proof', 'لا عدد عملاء، ولا مشاهدات، ولا «الأفضل»، ولا ضمانات.'],
  ['التجريبي ينقال إنه تجريبي', 'Concept work says so', '«إعلان تجريبي لعلامة خيالية»، كل مرة، ومن البداية.'],
].map(([a, e, t], i) => `<div class="item" style="display:grid;grid-template-columns:20px 1fr;margin-bottom:8px"><span class="num" style="color:${INK};padding-top:2px">${i + 1}</span><div><h3 style="display:flex;justify-content:space-between"><span>${a}</span><span class="en s">${e}</span></h3><p>${t}</p></div></div>`).join(''));
const wl = rows => rows.map(([w, g]) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid ${RULE_P}"><span class="w6" style="font-size:13px">${w}</span><span class="sm mute" style="text-align:left">${g}</span></div>`).join('');
put('v-words-use', wl([['سالفة · يسولفون', 'فعلنا الأساسي'], ['خلّ · خلّهم', '«خلّ إعلانك علينا»'], ['دزّ · الخاص', 'أرسل · الرسائل'], ['شلون · شنو · منو', 'أسئلة كويتية'], ['الحين · توّنا', 'الآن · قبل شوي'], ['وايد · شوي', 'كثير · قليل'], ['مو بس…', '«مو بس فيديو…»'], ['على مهلك', 'بدون عجلة'], ['نسوي', 'نصنع'], ['شغل نظيف', 'متقن بدون مبالغة']]));
put('v-words-avoid', wl([['نقدم لكم · يسعدنا · يرجى', 'فصحى متخشبة'], ['إبداع · احترافي · مميز', 'مديح فاضي'], ['الأفضل · رقم واحد · مضمون', 'ادعاءات'], ['ترند · فايرال · انتشار', 'وعود ما نملكها'], ['لا تفوّت الفرصة', 'استعجال مزيّف'], ['أسعار منافسة · رمزية', 'ينزّل قيمة الشغل'], ['إعلانات بالذكاء الاصطناعي', 'الأداة مو العنوان'], ['ندير حسابك · متابعين', 'خارج خدماتنا'], ['أبغى · إيش · كتير', 'لهجات ثانية']]));
put('v-dialect', `<h2>اللهجة بالتفصيل</h2><p class="en" style="margin-bottom:10px">Kuwaiti dialect, in practice</p><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">` + [
  ['المخاطَب', 'Address', 'بالمنشورات: مفرد مذكّر عام («عندك مشروع؟»). بالخاص: جمع («حيّاكم»)، ونمشي على طريقة الشخص إذا كتب: «عندچ»، «تبين».'],
  ['الإيموجي', 'Emoji', 'ثنتين بالكثير بالكابشن، ولا وحدة بنص الفيديو. توقيعنا «•••» مرة وحدة عند الدعوة للطلب.'],
  ['الذكاء الاصطناعي', 'AI', 'الأدوات مطبخ، مو منيو: نبيع الفكرة والسكربت والإخراج والتشطيب. ما نخفيه إذا أحد سأل، وما نحطه عنوان.'],
].map(([a, e, t]) => `<div style="border-top:1.5px solid ${INK};padding-top:8px"><h3 style="display:flex;justify-content:space-between;align-items:baseline"><span>${a}</span><span class="en s">${e}</span></h3><p class="sm" style="margin-top:3px">${t}</p></div>`).join('') + `</div>`);
put('v-examples', [
  ['نقدم لكم أفضل الحلول الإعلانية المتكاملة.', 'نسوي إعلانك من الفكرة لين الملف النهائي.'],
  ['هل تبحث عن إعلان مميز لمشروعك؟', 'مشروعك حلو… بس محد يسولف عنه؟'],
  ['للتواصل والاستفسار يرجى مراسلتنا عبر الرسائل الخاصة.', 'عندك سؤال؟ دزّ لنا بالخاص.'],
  ['نحن الأفضل في الكويت.', 'خلّ الشغل يسولف عنّا.'],
  ['احجز الآن ولا تفوّت الفرصة!', 'متى ما جهزت، الخاص مفتوح.'],
  ['إعلان ترويجي لمنتج عطري فاخر.', 'عطر يبقى… بعد ما تمشي.'],
].map(([b, a]) => `<div style="display:grid;grid-template-columns:4fr 40px 7fr;align-items:center;padding:27px 0;border-bottom:1px solid ${LINE}">
   <div style="display:flex;gap:10px;align-items:center;color:${SMOKE};font-size:14.5px"><span class="no"></span>${b}</div>
   <div style="color:${LIME};font-size:18px;text-align:center;font-family:'IBM Plex Sans Arabic'">←</div>
   <div style="display:flex;gap:10px;align-items:center"><span class="ok"></span><span style="font-family:'Alexandria Static',Alexandria;font-weight:800;font-size:25px;line-height:1.4;text-wrap:balance">${a}</span></div></div>`).join('') +
  `<p class="sm mute" style="margin-top:10px">الأمثلة من <bdi dir="ltr" class="k">06-copy/voice-and-tone.md</bdi>. لاحظ إن «نحن الأفضل» ما انصلحت: الادعاء انشال، وصار الشغل هو اللي يتكلم.</p>`);

// ------------------------------------------------------------------ 11 files & licences
put('v-files', `<table><thead><tr><th style="width:36%"><span class="ar">المسار</span>PATH</th><th><span class="ar">شنو فيه</span>CONTENTS</th></tr></thead><tbody>` + [
  ['01-brand-guide/', 'هالدليل: <bdi dir="ltr">brand-guide.html</bdi>، <bdi dir="ltr">TASH-Brand-Guide.pdf</bdi>، صور الصفحات <bdi dir="ltr">pages/</bdi>، وسكربتات البناء <bdi dir="ltr">src/</bdi>'],
  ['02-logo/svg/', 'الشعار 7 نسخ، الأفقي 3، المكدّس 3، النقاط 2 (<bdi dir="ltr">SVG</bdi>)'],
  ['02-logo/png/', 'نفس النسخ <bdi dir="ltr">PNG</bdi> بعرض <bdi dir="ltr">1200–3000 px</bdi>'],
  ['02-logo/avatar/', 'الصورة الشخصية ليموني وحبر: <bdi dir="ltr">SVG</bdi> و<bdi dir="ltr">1080 / 320 px</bdi>'],
  ['02-logo/motion/', 'التوقيع المتحرّك 9:16، 9:16 ليموني، 1:1، و<bdi dir="ltr">tash-sonic-logo.wav</bdi>'],
  ['03-templates/', 'قوالب البوست، الكاروسيل، غلاف الريل، الستوري، الهايلايت، وبوستر العميل'],
  ['04-launch-ad/', 'إعلان الإطلاق. لقطات الناس ومشهدي البرجر والقهوة (من «ستاك» و«حبّة») مولّدة بـ<bdi dir="ltr">Higgsfield</bdi> بإخراج المدير الإبداعي؛ لقطات «ليل» والخاتم 3D بالكود. الكلام والمونتاج والصوت والتوقيع من طشّ. الكريدت وقواعد اللقطات بـ<bdi dir="ltr">SCRIPT.md</bdi>'],
  ['05-concept-ads/', 'إعلانات تجريبية لعلامات خيالية: «ليل» عطر (3D بالكود)، «ستاك» برجر و«حبّة» قهوة (لقطات <bdi dir="ltr">Higgsfield</bdi>). الكريدت بـ<bdi dir="ltr">SCRIPT.md</bdi> كل واحد'],
  ['06-copy/', 'طريقة الكلام، الكابشن، الدعوات للطلب، والبروفايل'],
  ['07-ops/', 'نموذج الطلب، الأسعار، المراحل، التعديلات، والحقوق'],
  ['_system/tokens.css', 'الألوان، الخطوط، الأحجام، المسافات، المناطق الآمنة'],
  ['_system/brand/logo.mjs', 'بنّاء الشعار: الكلمة، التركيبات، النقاط، الصورة الشخصية'],
  ['_system/motion/', '<bdi dir="ltr">kit.js</bdi> (الحركة)، <bdi dir="ltr">endcard.js</bdi> (التوقيع)، <bdi dir="ltr">endcard-cues.json</bdi> (التوقيت)'],
  ['_system/audio/tashaudio.py', 'محرّك الصوت الأصلي و<bdi dir="ltr">sonic_logo()</bdi>'],
  ['_system/fonts/', 'الخطوط الأربعة ونصوص رخصها'],
  ['_system/tools/', '<bdi dir="ltr">render.mjs</bdi>، <bdi dir="ltr">contact.sh</bdi>، <bdi dir="ltr">audio-check.sh</bdi>، <bdi dir="ltr">export-logo.mjs</bdi>'],
].map(([p, d]) => `<tr><td class="k" style="font-size:8.5px;text-align:right" data-path="${p}">${p}</td><td class="sm">${d}</td></tr>`).join('') + `</tbody></table>`);
put('v-licences', [
  ['الخطوط', 'Fonts', 'SIL OFL 1.1', 'Alexandria، IBM Plex Sans Arabic، Archivo، JetBrains Mono. الاستخدام التجاري والتضمين مسموح؛ ما ينباع الخط بروحه، والرخصة ترافقه. الـ<bdi dir="ltr">PDF</bdi> يضمّن نسخ ثابتة مقصوصة من نفس الملفات، ومعاها رخصها.', '_system/fonts/OFL-*.txt · 01-brand-guide/src/fonts/'],
  ['الشعار', 'Logo', 'TASH', 'رسم من حروف Alexandria محوّلة لمسارات ومعدّلة. الأعمال المصمّمة بخط OFL (ومنها الشعارات) ما تخضع لرخصة الخط.', '_system/brand/'],
  ['Three.js', '3D', 'MIT', 'مكتبة الـ3D: «ليل» كله، وخاتم إعلان الإطلاق.', '_system/vendor/three/LICENSE'],
  ['GSAP 3.13', 'Animation', 'GreenSock Standard', 'موجودة بالنظام؛ شروطها برأس الملف.', '_system/vendor/gsap/'],
  ['الصوت', 'Audio', 'TASH · original', 'كله مركّب بالكود من الصفر: بدون عيّنات، بدون موسيقى أو مؤثرات منزّلة.', '_system/audio/tashaudio.py'],
  ['الصور', 'Visuals', 'TASH · original', 'الهوية، والقوالب، و«ليل» كله، وخاتم إعلان الإطلاق: مبنية بالكود (<bdi dir="ltr">SVG / Canvas / Three.js</bdi>)، بدون صور ستوك.', '_system/ · 03-templates/ · 05-concept-ads/01-perfume-layl/'],
  ['لقطات الذكاء الاصطناعي', 'AI footage', 'Higgsfield · owner-approved', 'لقطات «ستاك» و«حبّة» كلها، ولقطات الناس بإعلان الإطلاق (ومشهدي البرجر والقهوة فيه مأخوذين من «ستاك» و«حبّة»): مولّدة بـ<bdi dir="ltr">Higgsfield</bdi>، فيديو <bdi dir="ltr">Kling 3.0</bdi>، باشتراك المالك وموافقته. المدير الإبداعي بس هو اللي يولّد. الكلام والمونتاج والتلوين والصوت والتوقيع من طشّ. الكريدت وأرقام المهام بـ<bdi dir="ltr">SCRIPT.md</bdi> كل إعلان.', '04-launch-ad/footage/ai/ · 05-concept-ads/*/footage/ai/'],
].map(([a, e, l, t, f]) => `<div style="padding:7px 0 6px;border-bottom:1px solid ${RULE_P}"><div style="display:flex;justify-content:space-between;align-items:baseline"><span class="w6" style="font-size:11.5px">${a} <span class="en s" style="display:inline">${e}</span></span><span class="k" style="font-size:8px">${l}</span></div>
  <div class="sm" style="line-height:1.55;margin-top:2px">${t}</div><div class="k" style="font-size:7.5px;color:${META_P};text-align:right">${f}</div></div>`).join(''));

// ------------------------------------------------------------------ ready
await document.fonts.ready;
await Promise.all($$('img').map(i => (i.complete && i.naturalWidth ? Promise.resolve() : i.decode()).catch(() => { throw new Error('image failed: ' + i.getAttribute('src')); })));
window.GUIDE = { pages: NP, stemDeg: stem.deg, gap: GAP, D: Dm, shadda: shaddaBox };
window.GUIDE_READY = true;
