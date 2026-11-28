// «طشّ للطلاب» — the shared kit (lead-owned). Scene agents IMPORT this; requests for changes go to src/REQUESTS.md.
// Rules baked in: every visual is a pure function of time (no CSS animation/transition, no rAF, no Date, no Math.random:
// use rng(seed)); Arabic is animated per WORD or per LINE, never per letter; LTR runs (handles, file types) are isolated.
// API summary (details in CONTRACT.md):
//   tokens C, SAFE, FPS · easing E, clamp, lerp, remap, smoothstep, prog, tw, spring, rng, typing, css, el
//   grid(cues) → { t(k), f(k), k(t), isBar(k), pulse(t, kFrom, kTo, decay) }
//   kinetic(parent, ev | {text, words}, opts) → { el, spans, render(t) }      Arabic-safe word/line motion
//   chip(parent, opts) / fileChip(parent, opts) → { el, render(t, inF, landF, outF) }
//   stage3d(parent, opts) + card3d(parent3d, opts) → { el, face, set(pose) }
//   samplesLabel(parent, text) → { el, place(pos), show(on) }
//   guide(stage, cues) → { render(t, f, active) }                             ?guide=1 overlay + safe-zone checker
//   img(url) · preloadAll() · frames(baseUrl, n) → { get(k) }                  preloading (the page's ready awaits it)
//   homography(src, dst) · quadTransform(w, h, quad) → CSS matrix3d · fitQuad(quad, W, H) · arDigits(n) · ltr(text)
export { clamp, lerp, prog, tw, between, E, spring, rng, typing, css } from '/_system/motion/kit.js';
import { clamp, lerp, tw, E, spring, css } from '/_system/motion/kit.js';

export const FPS = 30, W = 1080, H = 1920;
export const C = { ink: '#0B0B0B', paper: '#F5F5E9', lime: '#C6FF00', smoke: '#8E9088', char: '#1A1A18', line: '#2C2C29' };
export const SAFE = { x0: 64, x1: 1016, y0: 250, y1: 1620 };
export const FONT = { display: '"Alexandria", "IBM Plex Sans Arabic", sans-serif', text: '"IBM Plex Sans Arabic", "Alexandria", sans-serif',
  latin: '"Archivo", sans-serif', mono: '"JetBrains Mono", ui-monospace, monospace' };

// ------------------------------------------------------------------ small maths
export const remap = (v, a0, a1, b0, b1, cl = true) => { const k = (v - a0) / (a1 - a0); return b0 + (b1 - b0) * (cl ? clamp(k) : k); };
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
export const F2T = f => f / FPS;
export const T2F = t => Math.round(t * FPS);
/** extra easings (E from the system kit has linear/quad/cubic/quart/expo/back/sine/elastic) */
export const EX = {
  outCirc: x => Math.sqrt(1 - Math.pow(x - 1, 2)),
  inOutBack: (x, s = 1.70158 * 1.525) => (x < 0.5 ? (Math.pow(2 * x, 2) * ((s + 1) * 2 * x - s)) / 2 : (Math.pow(2 * x - 2, 2) * ((s + 1) * (x * 2 - 2) + s) + 2) / 2),
  outBackStrong: x => E.outBack(x, 2.4),
};
/** 0..1 over [inF, landF] in film FRAMES, eased; t in film seconds */
export const kIn = (t, inF, landF, ease = E.outCubic) => (landF <= inF ? (t * FPS >= landF - 1e-6 ? 1 : 0) : ease(clamp((t * FPS - inF) / (landF - inF))));
/** 0..1 exit over the dur frames that END at outF */
export const kOut = (t, outF, dur = 6, ease = E.inCubic) => ease(clamp((t * FPS - (outF - dur)) / dur));

// ------------------------------------------------------------------ DOM
export function el(parent, tag = 'div', cls = null, styles = {}, text = null) {
  const e = document.createElement(tag); if (cls) e.className = cls; css(e, styles); if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e); return e;
}
/** Arabic-Indic digits for Arabic lines */
export const arDigits = s => String(s).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
/** an isolated LTR run (a handle, a file type) inside RTL text */
export function ltr(text, parent = null, styles = {}) { const s = el(parent, 'span', 'ltr', styles, text); s.dir = 'ltr'; return s; }

// ------------------------------------------------------------------ the beat grid (from cues.json)
export function grid(cues) {
  const { beat, phase, fps } = cues;
  const t = k => phase + k * beat;
  return {
    beat, phase, bpm: cues.bpm,
    t, f: k => Math.round(t(k) * fps),
    k: tt => (tt - phase) / beat,
    isBar: k => Math.abs(k / 4 - Math.round(k / 4)) < 1e-9,
    /** a 1 → 0 decay after every beat in [kFrom, kTo] (a bounce on the beat); step 1 = every beat, 0.5 = half beats */
    pulse(tt, kFrom = -1e9, kTo = 1e9, decay = 0.12, step = 1) {
      const kk = (tt - phase) / beat; if (kk < kFrom - 1e-9 || kk > kTo + 1) return 0;
      const last = Math.floor((kk + 1e-9) / step) * step; if (last < kFrom - 1e-9 || last > kTo + 1e-9) return 0;
      return Math.exp(-(tt - t(last)) / decay);
    },
  };
}

// ------------------------------------------------------------------ kinetic Arabic text (per WORD or per LINE)
const STYLES = {
  // k: 0..1 entrance progress (eased by the style), returns css for one word
  punch: k => ({ transform: `scale(${lerp(1.42, 1, E.outBack(k, 1.6)).toFixed(4)})`, opacity: clamp(k * 2.2).toFixed(3), filter: k < 1 ? `blur(${((1 - clamp(k * 1.5)) * 10).toFixed(2)}px)` : 'none' }),
  rise: k => ({ transform: `translateY(${((1 - E.outCubic(k)) * 52).toFixed(2)}px)`, opacity: clamp(k * 2.5).toFixed(3), filter: k < 1 ? `blur(${((1 - clamp(k * 1.6)) * 8).toFixed(2)}px)` : 'none' }),
  pop: k => ({ transform: `scale(${lerp(0.55, 1, spring(k, { freq: 1.6, damp: 7 })).toFixed(4)})`, opacity: clamp(k * 4).toFixed(3), filter: 'none' }),
  slam: k => ({ transform: `translateY(${((1 - E.outExpo(k)) * -90).toFixed(2)}px) scale(${lerp(1.25, 1, E.outExpo(k)).toFixed(4)})`, opacity: clamp(k * 3).toFixed(3), filter: 'none' }),
  type: k => ({ transform: 'none', opacity: k >= 1 ? '1' : '0', filter: 'none' }),            // appears on its land frame
  mask: k => ({ transform: 'none', opacity: k > 0 ? '1' : '0', filter: 'none', clipPath: `inset(-30% 0 -30% ${((1 - E.outCubic(k)) * 100).toFixed(2)}%)` }), // right→left wipe
};
const EXITS = {
  lift: k => ({ transform: `translateY(${(-k * 46).toFixed(2)}px)`, opacity: (1 - k).toFixed(3), filter: k > 0 ? `blur(${(k * 7).toFixed(2)}px)` : 'none' }),
  fade: k => ({ opacity: (1 - k).toFixed(3) }),
  drop: k => ({ transform: `translateY(${(k * 60).toFixed(2)}px)`, opacity: (1 - k).toFixed(3) }),
  shrink: k => ({ transform: `scale(${lerp(1, 0.7, k).toFixed(4)})`, opacity: (1 - k).toFixed(3) }),
  cut: k => ({ opacity: k >= 1 ? '0' : '1' }),
};

/**
 * kinetic(parent, src, opts) — a line of Arabic (or Latin) text, animated per word or as one line.
 *   src: a cues.json text event ({text, in, land, out, words?: [{text, land}]}) or {text, land, out, words?}
 *        land/out are FILM FRAMES. Without words, the words land in reading order, `stagger` frames apart.
 *   opts: x, y (anchor point px, default centre of the safe area width), anchor 'center'|'right'|'left' (the box edge
 *         that sits on x), size (px), weight, font ('display'|'text'|'latin'|'mono'), color, dir ('rtl'|'ltr'),
 *         style ('punch'|'rise'|'pop'|'slam'|'type'|'mask'), dur (entrance frames, default 5), exit ('lift'|'fade'|
 *         'drop'|'shrink'|'cut'), exitDur (frames, default 6), perLine (true: one span, no word split), colors
 *         ({wordIndex: colour}), shadow (CSS text-shadow), stagger (frames), maxWidth (px: font shrinks to fit).
 *   render(t): t = FILM seconds. Returns true while visible.
 */
export function kinetic(parent, src, opts = {}) {
  const o = { x: 540, y: 960, anchor: 'center', size: 96, weight: 800, font: 'display', color: C.paper, dir: 'rtl', style: 'punch',
    dur: 5, exit: 'lift', exitDur: 6, perLine: false, colors: {}, shadow: null, stagger: 3, maxWidth: SAFE.x1 - SAFE.x0, ...opts };
  const box = el(parent, 'div', 'k-line' + (o.dir === 'rtl' ? ' ar' : ''), {
    fontFamily: FONT[o.font] || o.font, fontWeight: String(o.weight), fontSize: o.size + 'px', color: o.color, top: '0px', left: '0px' });
  box.dir = o.dir; box.dataset.safe = '1';
  if (o.shadow) box.style.textShadow = o.shadow;
  const text = src.text;
  const toks = o.perLine ? [text] : text.split(' ');
  const spans = toks.map((w, i) => {
    const s = el(box, 'span', 'k-w', { opacity: '0' }, w);
    if (o.colors[i]) s.style.color = o.colors[i];
    if (i < toks.length - 1) box.appendChild(document.createTextNode(' '));
    return s;
  });
  const lands = toks.map((_, i) => (o.perLine ? src.land : (src.words && src.words[i] ? src.words[i].land : src.land + i * o.stagger)));
  // fit and place (layout measured once at mount: deterministic)
  let w = box.offsetWidth;
  if (w > o.maxWidth) { box.style.fontSize = (o.size * o.maxWidth / w).toFixed(2) + 'px'; w = box.offsetWidth; }
  const h = box.offsetHeight;
  const left = o.anchor === 'center' ? o.x - w / 2 : o.anchor === 'right' ? o.x - w : o.x;
  css(box, { left: left.toFixed(1) + 'px', top: (o.y - h / 2).toFixed(1) + 'px' });
  const st = STYLES[o.style], ex = EXITS[o.exit];
  function render(t) {
    const f = t * FPS;
    const vis = f >= Math.min(...lands) - o.dur - 1e-6 && (src.out == null || f < src.out);
    box.style.display = vis ? 'block' : 'none';
    if (!vis) return false;
    const ko = src.out == null ? 0 : clamp((f - (src.out - o.exitDur)) / o.exitDur);
    spans.forEach((s, i) => {
      const k = o.style === 'type' ? (f >= lands[i] - 1e-6 ? 1 : 0) : clamp((f - (lands[i] - o.dur)) / o.dur);
      const a = st(k), b = ko > 0 ? ex(E.inCubic(ko)) : null;
      const props = { ...a };
      if (b) {
        if (b.transform) props.transform = (a.transform && a.transform !== 'none' ? a.transform + ' ' : '') + b.transform;
        if (b.opacity != null) props.opacity = (parseFloat(a.opacity) * parseFloat(b.opacity)).toFixed(3);
        if (b.filter) props.filter = b.filter;
      }
      css(s, props);
    });
    return true;
  }
  return { el: box, spans, lands, render, width: w, height: h };
}

// ------------------------------------------------------------------ chips
/** chip(parent, {text, theme: 'lime'|'ink'|'paper'|'glass', size, x, y, anchor, dot}) — a sticker label (RTL) */
export function chip(parent, { text, theme = 'lime', size = 48, x = 540, y = 960, anchor = 'center', dot = false } = {}) {
  const c = el(parent, 'div', 'k-chip ' + theme, { fontSize: size + 'px', left: '0px', top: '0px' });
  c.dir = 'rtl'; c.dataset.safe = '1';
  if (dot) el(c, 'i', 'dot');
  el(c, 'span', null, {}, text);
  const w = c.offsetWidth, h = c.offsetHeight;
  const left = anchor === 'center' ? x - w / 2 : anchor === 'right' ? x - w : x;
  css(c, { left: left.toFixed(1) + 'px', top: (y - h / 2).toFixed(1) + 'px' });
  return {
    el: c, width: w, height: h,
    /** sticker pop: in → land (frames) with an overshoot, out = first frame gone (fast shrink over 5 frames) */
    render(t, inF, landF, outF = null, { extra = '' } = {}) {
      const f = t * FPS;
      const on = f >= inF - 1e-6 && (outF == null || f < outF);
      c.style.display = on ? 'inline-flex' : 'none'; if (!on) return false;
      const k = clamp((f - inF) / Math.max(1, landF - inF)), ko = outF == null ? 0 : clamp((f - (outF - 5)) / 5);
      const s = lerp(0.4, 1, E.outBack(k, 2.2)) * (1 - 0.3 * E.inCubic(ko));
      css(c, { transform: `${extra} scale(${s.toFixed(4)})`, opacity: (clamp(k * 3) * (1 - ko)).toFixed(3) });
      return true;
    },
  };
}

const FILE_COL = { '.pptx': '#E8602C', '.docx': '#3B6FE0', '.xlsx': '#1E9E5A', '.pdf': '#D93A3A', '.mp4': '#8A5CF6' };
/** fileChip(parent, {ext: '.pptx', size, x, y, anchor}) — LTR mono chip, the dot of the extension on the LEFT; a small
 *  generic colour block (no product logos) */
export function fileChip(parent, { ext, size = 40, x = 540, y = 960, anchor = 'center', color = null } = {}) {
  const c = el(parent, 'div', 'k-file', { fontSize: size + 'px', left: '0px', top: '0px' });
  c.dir = 'ltr'; c.dataset.safe = '1';
  el(c, 'b', null, { background: color || FILE_COL[ext] || C.lime });
  el(c, 'span', null, {}, ext);
  const w = c.offsetWidth, h = c.offsetHeight;
  const left = anchor === 'center' ? x - w / 2 : anchor === 'right' ? x - w : x;
  css(c, { left: left.toFixed(1) + 'px', top: (y - h / 2).toFixed(1) + 'px' });
  return {
    el: c, width: w, height: h,
    render(t, inF, landF, outF = null, { extra = '' } = {}) {
      const f = t * FPS;
      const on = f >= inF - 1e-6 && (outF == null || f < outF);
      c.style.display = on ? 'inline-flex' : 'none'; if (!on) return false;
      const k = clamp((f - inF) / Math.max(1, landF - inF)), ko = outF == null ? 0 : clamp((f - (outF - 5)) / 5);
      css(c, { transform: `${extra} translateY(${((1 - E.outBack(k, 1.8)) * 30).toFixed(2)}px) scale(${lerp(0.6, 1, E.outBack(k, 1.8)).toFixed(4)})`,
        opacity: (clamp(k * 3) * (1 - ko)).toFixed(3) });
      return true;
    },
  };
}

// ------------------------------------------------------------------ 3D cards
/** stage3d(parent, {perspective, ox, oy}) — a perspective container; put card3d()s in it */
export function stage3d(parent, { perspective = 2000, ox = 540, oy = 960 } = {}) {
  const p = el(parent, 'div', 'layer', { perspective: perspective + 'px', perspectiveOrigin: `${ox}px ${oy}px` });
  return el(p, 'div', 'k-3d');
}
/**
 * card3d(parent3d, {src | content, w, h, radius, bg, shadow (bool), reflection (bool), border, sheen (bool)})
 *   set(pose): pose = {x, y (centre, stage px), z (px toward the viewer), rx, ry, rz (deg), s (scale), o (opacity),
 *              lift (0..1 shadow strength/spread), sheen (-1..1 highlight position; default follows ry), blur (px)}
 *   A face <img> (or your own DOM `content`), a soft contact shadow that grows with z, an optional floor reflection.
 */
export function card3d(parent, { src = null, content = null, w = 800, h = 450, radius = 18, bg = '#fff', shadow = true, reflection = false, border = null, sheen = true } = {}) {
  const card = el(parent, 'div', 'k-card', { width: w + 'px', height: h + 'px' });
  const sh = shadow ? el(card, 'div', null, { position: 'absolute', inset: '0', borderRadius: radius + 'px', background: 'rgba(0,0,0,0.001)' }) : null;
  const face = el(card, 'div', 'face', { borderRadius: radius + 'px', background: bg });
  if (border) face.style.border = border;
  let img = null;
  if (src) { img = el(face, 'img'); img.src = src; img.decoding = 'sync'; }
  if (content) face.appendChild(content);
  const shine = sheen ? el(face, 'div', 'sheen') : null;
  let refl = null;
  if (reflection && src) {
    refl = el(card, 'div', 'refl', { top: (h + 6) + 'px', height: h + 'px', borderRadius: radius + 'px' });
    const ri = el(refl, 'img'); ri.src = src;
  }
  function set({ x = 540, y = 960, z = 0, rx = 0, ry = 0, rz = 0, s = 1, o = 1, lift = 0.5, sheen: sp = null, blur = 0 } = {}) {
    css(card, { transform: `translate3d(${(x - w / 2).toFixed(2)}px, ${(y - h / 2).toFixed(2)}px, ${z.toFixed(2)}px) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) rotateZ(${rz.toFixed(3)}deg) scale(${s.toFixed(4)})`,
      opacity: clamp(o).toFixed(3), display: o <= 0.001 ? 'none' : 'block', filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none' });
    if (sh) { const L = clamp(lift); css(sh, { boxShadow: `0 ${(18 + 60 * L).toFixed(1)}px ${(40 + 90 * L).toFixed(1)}px rgba(0,0,0,${(0.28 + 0.3 * L).toFixed(3)}), 0 4px 12px rgba(0,0,0,.25)` }); }
    if (shine) { const p = sp == null ? clamp(ry / 40, -1, 1) : sp; css(shine, { transform: `translateX(${(p * 60).toFixed(2)}%)`, opacity: (0.35 + 0.65 * Math.abs(p)).toFixed(3) }); }
  }
  set({ o: 0 });
  return { el: card, face, img, set, w, h };
}

// ------------------------------------------------------------------ the samples label «نماذج من تصميمنا»
export function samplesLabel(parent, text) {
  const l = el(parent, 'div', 'k-label', { left: '0px', top: '0px', display: 'none' });
  l.dir = 'rtl'; l.dataset.safe = '1';
  el(l, 'i'); el(l, 'span', null, {}, text);
  const w = l.offsetWidth || 0;
  const POS = { top: { right: 64, top: 262 }, bottom: { right: 64, top: 1560 }, topLeft: { left: 64, top: 262 } };
  let cur = 'top';
  return {
    el: l,
    place(pos = 'top') {
      cur = pos; const p = typeof pos === 'object' ? pos : POS[pos] || POS.top;
      const ww = l.offsetWidth || w;
      css(l, { left: (p.left != null ? p.left : 1080 - p.right - ww) + 'px', top: p.top + 'px' });
    },
    show(on, o = 1) { css(l, { display: on ? 'inline-flex' : 'none', opacity: String(o) }); },
  };
}

// ------------------------------------------------------------------ debug guide (?guide=1)
export function guide(stage, cues) {
  const g = el(stage, 'div', 'k-guide');
  el(g, 'div', 'safe');
  const hud = el(g, 'div', 'hud'), bt = el(g, 'div', 'beat');
  const G = grid(cues);
  let bad = [];
  return {
    render(t, f, active) {
      const k = G.k(t), kb = Math.floor(k + 1e-9);
      hud.textContent = `t ${t.toFixed(3)}  f ${f}  beat ${k.toFixed(2)}${G.isBar(kb) ? ' |' : ''}\n${active.join(' + ')}`;
      bt.style.opacity = String(Math.exp(-(t - G.t(kb)) / 0.08));
      // safe-zone check: every visible [data-safe] element must sit inside x 64-1016, y 250-1620
      bad.forEach(b => b.remove()); bad = [];
      for (const e of stage.querySelectorAll('[data-safe]')) {
        if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') continue;
        const cs = getComputedStyle(e); if (cs.display === 'none' || parseFloat(cs.opacity) < 0.05) continue;
        const r = e.getBoundingClientRect(); if (r.width < 1) continue;
        if (r.left < SAFE.x0 - 1 || r.right > SAFE.x1 + 1 || r.top < SAFE.y0 - 1 || r.bottom > SAFE.y1 + 1) {
          bad.push(el(g, 'div', 'bad', { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }));
        }
      }
    },
  };
}

// ------------------------------------------------------------------ preloading (main.js awaits preloadAll() in ready)
const _cache = new Map(), _pending = [];
/** img(url) → Promise<HTMLImageElement>, decoded; registered so the page's ready promise waits for it */
export function img(url) {
  const u = new URL(url, location.href).href;
  if (_cache.has(u)) return _cache.get(u);
  const im = new Image(); im.decoding = 'async'; im.src = u;
  const p = im.decode().then(() => im, () => { throw new Error('image missing: ' + u); });
  _cache.set(u, p); _pending.push(p); return p;
}
export const preloadAll = () => Promise.all(_pending.slice());
/** frames(baseUrl, n, {pad, ext, lru}) — a JPEG sequence drawn by INDEX (never <video> time): get(k) → Promise<img> */
export function frames(baseUrl, n, { pad = 4, ext = 'jpg', lru = 10 } = {}) {
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : baseUrl + '/', location.href).href;
  const cache = new Map();
  return {
    n,
    get(k) {
      k = Math.max(0, Math.min(n - 1, Math.round(k)));
      const url = `${base}${String(k).padStart(pad, '0')}.${ext}`;
      if (cache.has(url)) { const p = cache.get(url); cache.delete(url); cache.set(url, p); return p; }
      const im = new Image(); im.decoding = 'async'; im.src = url;
      const p = im.decode().then(() => im, () => { throw new Error('frame missing: ' + url); });
      cache.set(url, p); while (cache.size > lru) cache.delete(cache.keys().next().value);
      return p;
    },
  };
}
export async function json(url) { return (await fetch(new URL(url, location.href))).json(); }

// ------------------------------------------------------------------ quads (a slide onto a screen)
/** 3x3 homography mapping 4 src points to 4 dst points ([[x,y]x4]) */
export function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  // gaussian elimination
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const k = A[r][c] / A[c][c]; for (let j = c; j < 8; j++) A[r][j] -= k * A[c][j]; b[r] -= k * b[c]; }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
}
/** CSS transform (transform-origin 0 0) that maps a w x h element onto quad [[TL],[TR],[BR],[BL]] (parent px) */
export function quadTransform(w, h, quad) {
  const M = homography([[0, 0], [w, 0], [w, h], [0, h]], quad);
  const m = [M[0][0], M[1][0], 0, M[2][0], M[0][1], M[1][1], 0, M[2][1], 0, 0, 1, 0, M[0][2], M[1][2], 0, M[2][2]];
  return `matrix3d(${m.map(v => (+v).toPrecision(10)).join(',')})`;
}
/** map a point through a quad camera: plate px → frame px for a view {z, cx, cy} of an image of size iw x ih drawn to
 *  cover W x H at z = 1 (cx, cy = the plate point at the frame centre) */
export function plateToFrame([x, y], { z = 1, cx, cy, iw, ih }) {
  const s = Math.max(W / iw, H / ih) * z;
  return [W / 2 + (x - cx) * s, H / 2 + (y - cy) * s];
}
/** the zoom (about the quad centre) at which the quad covers the frame (W x H) */
export function fitQuad(quad, iw = W, ih = H) {
  const xs = quad.map(p => p[0]), ys = quad.map(p => p[1]);
  const qw = Math.min(quad[1][0] - quad[0][0], quad[2][0] - quad[3][0]), qh = Math.min(quad[3][1] - quad[0][1], quad[2][1] - quad[1][1]);
  const s0 = Math.max(W / iw, H / ih);
  return { z: Math.max(W / (qw * s0), H / (qh * s0)), cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 };
}
/** draw an image (cover-fit at z = 1) through a camera {z, cx, cy} onto a 2D canvas context */
export function drawCam(ctx, im, { z = 1, cx = null, cy = null } = {}) {
  const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
  const s = Math.max(W / iw, H / ih) * z;
  const X = cx == null ? iw / 2 : cx, Y = cy == null ? ih / 2 : cy;
  ctx.drawImage(im, X - W / 2 / s, Y - H / 2 / s, W / s, H / s, 0, 0, W, H);
}
