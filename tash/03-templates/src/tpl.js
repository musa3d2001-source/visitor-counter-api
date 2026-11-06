// TASH templates runtime (browser ES module).
// A template page imports run() and gives it a build(data, api) function that fills #stage and returns its spec.
// The renderer (03-templates/render.mjs) injects window.TPL_DATA before load, waits for window.TPL.ready,
// reads window.TPL.{width,height,warnings} and screenshots exactly that box.
// Live preview in a browser: /03-templates/templates/<name>.html?data=/03-templates/data/<file>.json[&guide][&slide=2]
import * as L from '/_system/brand/logo.mjs';
import { grain as kitGrain } from '/_system/motion/kit.js';

export const COL = { ...L.COLORS, line: '#2C2C29' };

/** Colour themes for TASH's own pieces. Lime is the signal on ink; on paper and lime grounds the signal is ink. */
export const THEMES = {
  ink:   { bg: COL.ink,   fg: COL.paper, sub: COL.smoke, accent: COL.lime, dot: COL.lime, surface: COL.char, line: COL.line, wmBody: COL.paper, wmDot: COL.lime,
           light: 'rgba(245,245,233,0.055)', vig: 'rgba(0,0,0,0.34)', grain: 0.05 },
  paper: { bg: COL.paper, fg: COL.ink,   sub: '#5C5E56', accent: COL.ink,  dot: COL.ink,  surface: '#E8E8DA', line: '#D3D3C4', wmBody: COL.ink, wmDot: COL.ink,
           light: 'rgba(255,255,250,0.55)', vig: 'rgba(70,62,40,0.13)', grain: 0.045 },
  lime:  { bg: COL.lime,  fg: COL.ink,   sub: '#344400', accent: COL.ink,  dot: COL.ink,  surface: COL.ink, line: '#A8D800', wmBody: COL.ink, wmDot: COL.ink,
           light: 'rgba(240,255,170,0.16)', vig: 'rgba(40,60,0,0.16)', grain: 0.04 },
};

/** Platform formats: canvas size, the zones drawn by --guide and the rectangle key content must stay inside. */
export const FORMATS = {
  post: { width: 1080, height: 1350, safe: { x0: 72, y0: 72, x1: 1008, y1: 1278 },
    zones: [
      { type: 'crop', x: 34, y: 0, w: 1012, h: 1350, label: 'PROFILE GRID 3:4 · 1012×1350' },
      { type: 'margin', x: 96, y: 96, w: 888, h: 1158, label: 'MARGIN 96' },
    ] },
  reel: { width: 1080, height: 1920, safe: { x0: 72, y0: 240, x1: 1008, y1: 1500 }, rail: { x0: 960, y0: 960, y1: 1500 },
    zones: [
      { type: 'crop', x: 0, y: 240, w: 1080, h: 1440, label: 'PROFILE GRID 3:4 · 1080×1440' },
      { type: 'avoid', x: 0, y: 0, w: 1080, h: 220, label: 'REELS UI · TOP 220' },
      { type: 'avoid', x: 0, y: 1500, w: 1080, h: 420, label: 'CAPTION + BUTTONS · BOTTOM 420' },
      { type: 'avoid', x: 960, y: 960, w: 120, h: 540, label: 'RAIL' },
      { type: 'margin', x: 72, y: 240, w: 936, h: 1260, label: 'KEY CONTENT' },
    ] },
  story: { width: 1080, height: 1920, safe: { x0: 72, y0: 250, x1: 1008, y1: 1620 },
    zones: [
      { type: 'avoid', x: 0, y: 0, w: 1080, h: 250, label: 'STORY UI · TOP 250' },
      { type: 'avoid', x: 0, y: 1620, w: 1080, h: 300, label: 'REPLY BAR · BOTTOM 300' },
      { type: 'margin', x: 72, y: 250, w: 936, h: 1370, label: 'KEY CONTENT' },
    ] },
  highlight: { width: 1080, height: 1920, safe: { x0: 210, y0: 630, x1: 870, y1: 1290 },
    zones: [
      { type: 'circle', cx: 540, cy: 960, r: 540, label: 'HIGHLIGHT CROP' },
      { type: 'circle', cx: 540, cy: 960, r: 330, label: 'ICON SAFE · Ø660', inner: true },
    ] },
};

// ------------------------------------------------------------------------------------------------ data
async function loadData() {
  const q = new URLSearchParams(location.search);
  let d = window.TPL_DATA ? structuredClone(window.TPL_DATA) : {};
  if (!window.TPL_DATA && q.get('data')) d = await (await fetch(q.get('data'))).json();
  if (q.has('guide')) d.__guide = true;
  if (q.has('slide')) d.__index = Number(q.get('slide'));
  if (Array.isArray(d.slides)) {                       // decks: deck-level fields + the current slide's fields
    const i = Math.max(0, Math.min(d.slides.length - 1, d.__index || 0));
    d = { ...d, ...d.slides[i], __index: i, __total: d.slides.length };
  }
  return d;
}

// ------------------------------------------------------------------------------------------------ markup helpers
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = (t = '') => String(t).replace(/[&<>"]/g, c => ESC[c]);
// Latin/digit runs (prices, handles, 3D, 1080×1920, Ø660) are isolated LTR. Trailing punctuation (. : , / -) stays
// OUTSIDE the isolate so it takes the Arabic side (left end) — «فوق 250:» not «فوق :250».
const LATIN_RUN = /([A-Za-z0-9@#Ø⌀][A-Za-z0-9@#Ø⌀._\-+/%:×]*(?: [A-Za-z0-9@#Ø⌀][A-Za-z0-9@#Ø⌀._\-+/%:×]*)*)/g;
const latin = t => esc(t).replace(LATIN_RUN, m => {
  const core = m.replace(/[._\-/:]+$/, ''), tail = m.slice(core.length);
  return `<bdi class="lat" dir="ltr">${core}</bdi>${tail}`;
});

/** The three dots as SVG. fills/strokes are listed RIGHT → LEFT (reading order). Units: d = diameter. */
export function dotsSVG({ d = 24, gap = null, fills = null, fill = 'currentColor', stroke = null, sw = 0, cls = '', style = '' } = {}) {
  const g = gap ?? d * 0.178, w = 3 * d + 2 * g, pad = sw / 2;
  const f = fills || [fill, fill, fill];
  const cs = [0, 1, 2].map(i => {
    const cx = w - d / 2 - i * (d + g);
    const st = stroke && f[i] === 'none' ? ` stroke="${stroke}" stroke-width="${sw}"` : '';
    return `<circle cx="${(cx + pad).toFixed(2)}" cy="${(d / 2 + pad).toFixed(2)}" r="${(d / 2 - (st ? sw / 2 : 0)).toFixed(2)}" fill="${f[i]}"${st}/>`;
  }).join('');
  return `<svg class="${cls}" style="${style}" xmlns="http://www.w3.org/2000/svg" width="${(w + sw).toFixed(2)}" height="${(d + sw).toFixed(2)}" viewBox="0 0 ${(w + sw).toFixed(2)} ${(d + sw).toFixed(2)}">${cs}</svg>`;
}

/** Inline dots sized in em — used where copy contains ••• (the brand ellipsis). */
function inlineDots(colour) {
  const d = 160, g = d * 0.178, w = 3 * d + 2 * g;
  const cs = [0, 1, 2].map(i => `<circle cx="${(w - d / 2 - i * (d + g)).toFixed(1)}" cy="${d / 2}" r="${d / 2}" fill="${colour}"/>`).join('');
  return `<span class="tdots"><svg viewBox="0 0 ${w.toFixed(1)} ${d}" style="width:${(w / 1000).toFixed(3)}em;height:${(d / 1000).toFixed(3)}em">${cs}</svg></span>`;
}

/** Rich text: "\n" = line break · *word* = accent · ••• = brand dots · Latin/digit runs are bidi-isolated. */
export function rich(s = '', { dot = 'var(--dot)' } = {}) {
  return String(s).split(/(\*[^*]+\*|•••|\n)/).map(p => {
    if (p === '\n') return '<br>';
    if (p === '•••') return inlineDots(dot);
    if (/^\*[^*]+\*$/.test(p)) return `<span class="hl">${latin(p.slice(1, -1))}</span>`;
    return latin(p);
  }).join('');
}

/** Element factory: h('div', {class:'x', style:'…', html:'…'}, children…) */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'html') el.innerHTML = v; else if (k === 'text') el.textContent = v; else el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

/** Append children, skipping null/false (so optional slots can be written inline). */
export function put(parent, ...kids) { for (const c of kids.flat()) if (c != null && c !== false) parent.append(c); return parent; }
/** Lines the author asked for: explicit \n breaks define the lines; otherwise allow up to `fallback`. */
export const linesOf = (s = '', fallback = 4) => String(s.includes('\n') ? s.split('\n').length : fallback);

/** Image slot. img = "path" or { src, fx, fy, zoom, dx, dy, fit: 'cover'|'contain', bg, feather (% soft side edges) }.
 *  fx/fy = focus point in % of the source (what stays in frame); zoom > 1 pushes in on that point. */
export function photo(img, cls = 'photo') {
  const o = typeof img === 'string' ? { src: img } : (img || {});
  const box = h('div', { class: cls, style: `position:absolute;overflow:hidden;background:${o.bg || 'transparent'}` });
  if (!o.src) return box;
  const fx = o.fx ?? 50, fy = o.fy ?? 50, z = o.zoom ?? 1, dx = o.dx ?? 0, dy = o.dy ?? 0;
  const feather = o.feather ? `;-webkit-mask-image:linear-gradient(to right,transparent,#000 ${o.feather}%,#000 ${100 - o.feather}%,transparent);mask-image:linear-gradient(to right,transparent,#000 ${o.feather}%,#000 ${100 - o.feather}%,transparent)` : '';
  box.append(h('img', { src: o.src, alt: '', decoding: 'sync',
    style: `position:absolute;inset:0;width:100%;height:100%;object-fit:${o.fit || 'cover'};object-position:${fx}% ${fy}%;transform:translate(${dx}px,${dy}px) scale(${z});transform-origin:${fx}% ${fy}%${feather}` }));
  return box;
}

/** Chat bubble in the sting's geometry (pill/rounded box + the little tail). side: 'right' (TASH) | 'left' (you).
 *  The SVG background is drawn after layout (drawBubbles), so the bubble always hugs its text. */
export function bubble(content, { fill = 'var(--surface)', color = 'var(--fg)', side = 'right', cls = '', style = '', r = null } = {}) {
  const el = h('div', { class: 'bubble ' + cls, 'data-side': side, 'data-fill': fill, 'data-r': r ?? '', style: `color:${color};${style}` });
  if (typeof content === 'string') el.innerHTML = content; else put(el, content);
  return el;
}
export function bubblePath(w, hh, r, side = 'right', k = 1) {
  r = Math.min(r, hh / 2);
  const box = `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${hh - r}A${r} ${r} 0 0 1 ${w - r} ${hh}H${r}A${r} ${r} 0 0 1 0 ${hh - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`;
  const tr = Math.min(r, 60);
  const tail = side === 'right'
    ? `M${w - tr * 0.55} ${hh - 6 * k}q${18 * k} ${26 * k} ${44 * k} ${30 * k}q${-30 * k} ${-24 * k} ${-26 * k} ${-58 * k}z`
    : `M${tr * 0.55} ${hh - 6 * k}q${-18 * k} ${26 * k} ${-44 * k} ${30 * k}q${30 * k} ${-24 * k} ${26 * k} ${-58 * k}z`;
  return box + ' ' + tail;
}
function drawBubbles(root) {
  for (const el of root.querySelectorAll('.bubble')) {
    el.querySelector(':scope > svg.bub')?.remove();
    const w = el.offsetWidth, hh = el.offsetHeight, r = Number(el.dataset.r) || Math.min(hh / 2, 64);
    el.insertAdjacentHTML('afterbegin', `<svg class="bub" width="${w}" height="${hh}" style="position:absolute;left:0;top:0;overflow:visible;z-index:-1" viewBox="0 0 ${w} ${hh}"><path d="${bubblePath(w, hh, r, el.dataset.side)}" fill="${el.dataset.fill}"/></svg>`);
    el.style.isolation = 'isolate';
  }
}

/** The sting's typing bubble (300×150 + tail, dots r26 at 82px pitch) as a static SVG, scaled.
 *  pose = y-offsets of the dots RIGHT → LEFT (a frozen moment of the typing wave keeps it alive). */
export function typingBubble({ scale = 1, fill = COL.char, dot = COL.lime, side = 'right', pose = [0, -12, -4] } = {}) {
  const w = 300, hh = 150, pad = 40;
  const dots = [1, 0, -1].map((k, i) => `<circle cx="${w / 2 + k * 82}" cy="${hh / 2 + pose[i]}" r="26" fill="${dot}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${(w + pad) * scale}" height="${(hh + pad) * scale}" viewBox="${side === 'right' ? 0 : -pad} 0 ${w + pad} ${hh + pad}" style="display:block;overflow:visible"><path d="${bubblePath(w, hh, 75, side)}" fill="${fill}"/>${dots}</svg>`;
}

/** Concept-work label (required on anything showing a concept ad): mono slate + «إعلان تجريبي — علامة خيالية». */
export const CONCEPT_AR = 'إعلان تجريبي — علامة خيالية';
export function concept(c, cls = 'concept') {
  if (!c) return null;
  const o = typeof c === 'string' ? { slate: c } : c;
  return h('div', { class: cls + ' key', 'data-name': 'concept label' },
    h('div', { class: 'slate', text: o.slate || 'CONCEPT AD' }),
    h('div', { class: 'concept-ar', text: o.ar || CONCEPT_AR }));
}

/** TASH wordmark (طشّ) at a given pixel width, coloured for the theme. */
export function wordmark(T, width, { body = T.wmBody, dot = T.wmDot } = {}) {
  return h('div', { class: 'wm', style: `width:${width}px`, html: L.wordmarkSVG({ body, dot }) });
}
export const LOGO = L;

// ------------------------------------------------------------------------------------------------ fitting
/** Shrinks font-size until the text fits its box. data-fit="min,max" (px) · data-lines="N" (max lines). */
function lineCount(el) {
  const r = document.createRange(); r.selectNodeContents(el);
  const fs = parseFloat(getComputedStyle(el).fontSize);
  const bottoms = [];
  for (const b of r.getClientRects()) {
    if (b.width < 1) continue;
    if (!bottoms.some(y => Math.abs(y - b.bottom) < fs * 0.5)) bottoms.push(b.bottom);
  }
  return bottoms.length;
}
function fits(el) {
  const okBox = el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
  const max = Number(el.dataset.lines || 0);
  return okBox && (!max || lineCount(el) <= max);
}
export function fitOne(el, warnings = []) {
  const [min, max] = el.dataset.fit.split(',').map(Number);
  let lo = min, hi = max, best = min;
  el.style.fontSize = max + 'px';
  if (fits(el)) best = max;
  else {
    while (lo <= hi) {
      const mid = (lo + hi) >> 1; el.style.fontSize = mid + 'px';
      if (fits(el)) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
  }
  el.style.fontSize = best + 'px';
  el.dataset.fitted = best;
  const name = el.dataset.name || el.className;
  for (let i = warnings.length - 1; i >= 0; i--) if (warnings[i].includes(': ' + name + ' (')) warnings.splice(i, 1);  // re-fit replaces old verdict
  if (!fits(el)) warnings.push(`TEXT DOES NOT FIT: ${name} (at min ${min}px) — shorten the copy`);
  else if (best === min && max > min) warnings.push(`text at minimum size: ${name} (${min}px) — consider shorter copy`);
  return best;
}
export function fitAll(root, warnings) { for (const el of root.querySelectorAll('[data-fit]')) fitOne(el, warnings); }

// ------------------------------------------------------------------------------------------------ finish
function ground(stage, T, { light = true, lightAt = '82% 6%' } = {}) {
  const g = h('div', { class: 'ground' });
  if (light) g.style.background = `radial-gradient(ellipse 95% 70% at ${lightAt}, ${T.light}, rgba(0,0,0,0) 70%)`;
  stage.prepend(g);
  const v = h('div', { class: 'vig' });
  v.style.background = `radial-gradient(ellipse 85% 75% at 50% 46%, rgba(0,0,0,0) 58%, ${T.vig} 100%)`;
  stage.append(v);
}
function addGrain(stage, w, h_, amount) {
  if (!amount) return;
  const c = document.createElement('canvas'); c.width = w; c.height = h_; c.className = 'grain';
  c.style.opacity = String(amount);
  kitGrain(c, 7, { amount: 30, scale: 2 });
  stage.append(c);
}

function guides(stage, spec) {
  const { width: W, height: H } = spec;
  const pink = '#FF2E88', cyan = '#29C9FF';
  let s = '';
  const lab = (x, y, t, c = pink, anchor = 'start') =>
    `<text x="${x}" y="${y}" fill="${c}" font-family="JetBrains Mono" font-weight="700" font-size="20" letter-spacing="3" text-anchor="${anchor}">${t}</text>`;
  for (const z of spec.zones || []) {
    if (z.type === 'crop') {
      s += `<path fill-rule="evenodd" fill="rgba(11,11,11,0.62)" d="M0 0H${W}V${H}H0Z M${z.x} ${z.y}V${z.y + z.h}H${z.x + z.w}V${z.y}Z"/>`;
      s += `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="none" stroke="${pink}" stroke-width="3" stroke-dasharray="14 10"/>`;
      s += lab(z.x + 14, z.y + 34, z.label);
    } else if (z.type === 'avoid') {
      s += `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="url(#hatch)" stroke="${pink}" stroke-width="2"/>`;
      if (z.w > 300) s += lab(z.x + 16, z.y + z.h / 2 + 7, z.label);
      else s += `<text transform="translate(${z.x + z.w / 2 + 7} ${z.y + 20}) rotate(90)" fill="${pink}" font-family="JetBrains Mono" font-weight="700" font-size="20" letter-spacing="3">${z.label}</text>`;
    } else if (z.type === 'margin') {
      s += `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" fill="none" stroke="${cyan}" stroke-width="2" stroke-dasharray="6 8"/>`;
      s += lab(z.x + 12, z.y + z.h - 14, z.label, cyan, 'start');
    } else if (z.type === 'circle') {
      if (!z.inner) s += `<path fill-rule="evenodd" fill="rgba(11,11,11,0.62)" d="M0 0H${W}V${H}H0Z M${z.cx - z.r} ${z.cy}a${z.r} ${z.r} 0 1 0 ${2 * z.r} 0a${z.r} ${z.r} 0 1 0 ${-2 * z.r} 0Z"/>`;
      s += `<circle cx="${z.cx}" cy="${z.cy}" r="${z.r}" fill="none" stroke="${z.inner ? cyan : pink}" stroke-width="3" stroke-dasharray="14 10"/>`;
      s += lab(z.cx, z.inner ? z.cy + z.r + 36 : z.cy - z.r - 18, z.label, z.inner ? cyan : pink, 'middle');
    }
  }
  const svg = `<svg class="guides" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="direction:ltr">
    <defs><pattern id="hatch" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="18" height="18" fill="rgba(255,46,136,0.16)"/><rect width="5" height="18" fill="rgba(255,46,136,0.38)"/></pattern></defs>${s}</svg>`;
  stage.insertAdjacentHTML('beforeend', svg);
}

// ------------------------------------------------------------------------------------------------ checks
function describe(el) { return el.dataset.name || (el.textContent || '').trim().slice(0, 28) || el.className; }
function check(stage, spec, warnings) {
  const S = stage.getBoundingClientRect();
  const rel = el => { const r = el.getBoundingClientRect(); return { x0: r.left - S.left, y0: r.top - S.top, x1: r.right - S.left, y1: r.bottom - S.top }; };
  const safe = spec.safe;
  for (const el of stage.querySelectorAll('.key')) {
    const r = rel(el);
    if (r.x1 - r.x0 < 1) continue;
    if (safe && (r.x0 < safe.x0 - 0.5 || r.y0 < safe.y0 - 0.5 || r.x1 > safe.x1 + 0.5 || r.y1 > safe.y1 + 0.5))
      warnings.push(`KEY CONTENT OUTSIDE SAFE AREA: "${describe(el)}" at [${r.x0.toFixed(0)},${r.y0.toFixed(0)} → ${r.x1.toFixed(0)},${r.y1.toFixed(0)}]`);
    const rail = spec.rail;
    if (rail && r.x1 > rail.x0 && r.y1 > rail.y0 && r.y0 < rail.y1)
      warnings.push(`KEY CONTENT UNDER THE REELS ACTION RAIL: "${describe(el)}"`);
  }
  // mono slates are Latin/digits only: Arabic in a slate would be letter-spaced and set in a font without Arabic
  for (const el of stage.querySelectorAll('.slate')) if (/[\u0600-\u06FF]/.test(el.textContent)) warnings.push(`ARABIC IN A MONO SLATE (letter-spaced Arabic): "${el.textContent.trim()}"`);
  // key elements must never sit on top of each other (text-over-text)
  const keys = [...stage.querySelectorAll('.key')].filter(el => el.getBoundingClientRect().width > 0);
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const a = keys[i], b = keys[j];
    if (a.contains(b) || b.contains(a)) continue;
    const A = rel(a), B = rel(b);
    const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0), oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
    if (ox > 2 && oy > 2) warnings.push(`OVERLAP: "${describe(a)}" × "${describe(b)}"`);
  }
  // any visible text running off the canvas (unless marked .bleed)
  const walker = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (el.closest('.bleed, .guides')) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    for (const b of r.getClientRects()) {
      const x0 = b.left - S.left, x1 = b.right - S.left, y0 = b.top - S.top, y1 = b.bottom - S.top;
      if (x0 < -0.5 || y0 < -0.5 || x1 > spec.width + 0.5 || y1 > spec.height + 0.5) { warnings.push(`TEXT OFF CANVAS: "${describe(el)}"`); break; }
    }
  }
}

// ------------------------------------------------------------------------------------------------ fonts & images
const FONTS = ['800 100px Alexandria', '600 100px Alexandria', '500 40px "IBM Plex Sans Arabic"', '400 40px "IBM Plex Sans Arabic"',
  '900 100px Archivo', '600 22px "JetBrains Mono"', '700 22px "JetBrains Mono"'];
async function settle(root) {
  await Promise.all(FONTS.map(f => document.fonts.load(f, 'طشّ TASH 0123')));
  await document.fonts.ready;
  await Promise.all([...root.querySelectorAll('img')].map(i => (i.complete ? (i.decode ? i.decode().catch(() => {}) : 0) : new Promise(r => { i.onload = i.onerror = r; }))));
  const missing = FONTS.filter(f => !document.fonts.check(f, 'طشّ'));
  return missing;
}

/**
 * run(build): build(data, api) fills the stage and returns { format | width,height, theme, zones?, safe?, light?, grain? }.
 * api = { stage, T (theme), rich, h, put, linesOf, photo, concept, bubble, typingBubble, dotsSVG, wordmark }
 */
export function run(build) {
  window.TPL = { ready: null, width: 1080, height: 1350, warnings: [] };
  window.TPL.ready = (async () => {
    const data = await loadData();
    const stage = document.getElementById('stage') || document.body.appendChild(h('div', { id: 'stage' }));
    const T = THEMES[data.theme] || THEMES.ink;
    for (const [k, v] of Object.entries(T)) if (typeof v === 'string') stage.style.setProperty('--' + k, v);
    const warnings = [];
    const fit = el => fitOne(el, warnings);
    const spec0 = await build(data, { stage, T, data, rich, h, put, linesOf, photo, concept, bubble, typingBubble, dotsSVG, wordmark, fit });
    const spec = { ...(FORMATS[spec0.format] || {}), ...spec0 };
    stage.style.width = spec.width + 'px'; stage.style.height = spec.height + 'px';
    const missing = await settle(stage);
    if (missing.length) warnings.push('FONTS NOT LOADED: ' + missing.join(', '));
    fitAll(stage, warnings);
    if (spec.after) await spec.after();
    drawBubbles(stage);                 // template hook that needs final text metrics
    if (spec.ground !== false) ground(stage, spec.themeObj || T, spec);
    addGrain(stage, spec.width, spec.height, spec.grain ?? (spec.themeObj || T).grain);
    check(stage, spec, warnings);
    if (data.__guide) guides(stage, spec);
    Object.assign(window.TPL, { width: spec.width, height: spec.height, warnings });
  })().catch(e => { window.TPL.warnings.push('TEMPLATE ERROR: ' + e.message); console.error(e); throw e; });
}
