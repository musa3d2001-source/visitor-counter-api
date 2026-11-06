// TASH motion kit — deterministic helpers for frame-rendered ads (browser ES module).
// Rule #1: everything visible is a pure function of time t (seconds). No CSS animations/transitions.
// Rule #2: Arabic is animated per WORD or per LINE (masks, translate, opacity, blur) — never split into letters,
//          splitting breaks the cursive joins and is the #1 tell of amateur Arabic motion.

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const prog = (t, start, dur) => clamp((t - start) / dur);           // linear 0..1
export const tw = (t, start, dur, e = E.outExpo) => e(prog(t, start, dur)); // eased 0..1
export const between = (t, a, b) => t >= a && t < b;

export const E = {
  linear: x => x,
  inQuad: x => x * x, outQuad: x => 1 - (1 - x) * (1 - x),
  inCubic: x => x * x * x, outCubic: x => 1 - Math.pow(1 - x, 3),
  inOutCubic: x => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outQuart: x => 1 - Math.pow(1 - x, 4), inQuart: x => x * x * x * x,
  inOutQuart: x => (x < .5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2),
  outExpo: x => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inExpo: x => (x === 0 ? 0 : Math.pow(2, 10 * x - 10)),
  inOutExpo: x => (x === 0 ? 0 : x === 1 ? 1 : x < .5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2),
  outBack: (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
  inBack: (x, s = 1.70158) => (s + 1) * x * x * x - s * x * x,
  inOutSine: x => -(Math.cos(Math.PI * x) - 1) / 2,
  outElastic: x => (x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - .75) * (2 * Math.PI) / 3) + 1),
};

/** Damped spring settle (0→1 with overshoot), physically-flavoured, deterministic. */
export function spring(x, { freq = 2.2, damp = 5.5 } = {}) {
  if (x <= 0) return 0;
  return 1 - Math.exp(-damp * x) * Math.cos(2 * Math.PI * freq * x);
}

/** Seeded PRNG (mulberry32). Use for particles/grain so every render is identical. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** The brand "typing" bounce. Returns y-offset (negative = up) for dot i (0 = rightmost) at time t.
 *  period: one full wave; amp: px. Dots travel right→left (Arabic reading order). */
export function typing(t, i, { period = 0.72, amp = 1, phase = 0.16 } = {}) {
  const local = ((t - i * phase) % period + period) % period / period; // 0..1
  const k = local < 0.5 ? Math.sin(local * 2 * Math.PI) : 0;            // up-and-back, then rest
  return -Math.max(0, k) * amp;
}

/** Register the page with the renderer. */
export function boot({ width = 1080, height = 1920, fps = 30, duration, seek, ready = Promise.resolve() }) {
  window.TASH = { width, height, fps, duration, ready: Promise.all([ready, document.fonts.ready]), seek: async t => { await seek(t); } };
  // live preview: open the page with ?play to watch it in a browser, ?t=3.2 to freeze a frame
  const q = new URLSearchParams(location.search);
  window.TASH.ready.then(() => {
    if (q.has('t')) seek(parseFloat(q.get('t')));
    else if (q.has('play')) { const t0 = performance.now(); const loop = () => { seek(((performance.now() - t0) / 1000) % duration); requestAnimationFrame(loop); }; loop(); }
    else seek(0);
  });
}

/** Set many style props at once, skipping unchanged values (cheap per-frame updates). */
export function css(el, props) {
  for (const k in props) { const v = props[k]; if (el.style[k] !== v) el.style[k] = v; }
}

/** Arabic-safe word wrapper: returns spans for each word (keeps words intact, bidi preserved). */
export function words(el) {
  const txt = el.textContent.trim();
  el.textContent = '';
  return txt.split(/\s+/).map((w, i, arr) => {
    const s = document.createElement('span'); s.className = 'w'; s.textContent = w;
    s.style.display = 'inline-block'; s.style.willChange = 'transform, opacity, clip-path';
    el.appendChild(s); if (i < arr.length - 1) el.appendChild(document.createTextNode(' '));
    return s;
  });
}

/** Mask-reveal (right→left for Arabic by default). k: 0 hidden … 1 shown. */
export function reveal(el, k, dir = 'rtl') {
  const h = (1 - clamp(k)) * 100;
  el.style.clipPath = dir === 'rtl' ? `inset(-20% 0 -20% ${h}%)` : dir === 'ltr' ? `inset(-20% ${h}% -20% 0)` : dir === 'up' ? `inset(${h}% -10% -20% -10%)` : `inset(-20% -10% ${h}% -10%)`;
}

/** Standard word-by-word Arabic headline entrance: rise + unblur + mask, staggered right→left. */
export function headlineIn(spans, t, start, { stagger = 0.07, dur = 0.55, rise = 46, blur = 10 } = {}) {
  spans.forEach((s, i) => {
    const k = tw(t, start + i * stagger, dur, E.outExpo);
    css(s, { transform: `translateY(${(1 - k) * rise}px)`, opacity: String(clamp(k * 1.6)), filter: k < 1 ? `blur(${(1 - k) * blur}px)` : 'none' });
  });
}
export function headlineOut(spans, t, start, { stagger = 0.04, dur = 0.35, lift = 40 } = {}) {
  spans.forEach((s, i) => {
    const k = tw(t, start + i * stagger, dur, E.inExpo);
    if (k <= 0) return;
    css(s, { transform: `translateY(${-k * lift}px)`, opacity: String(1 - k), filter: `blur(${k * 8}px)` });
  });
}

/** Film grain on a canvas — seeded per frame so renders are reproducible. Keep opacity ≤ .08. */
export function grain(canvas, frame, { amount = 22, scale = 2 } = {}) {
  const ctx = canvas.getContext('2d');
  const w = Math.ceil(canvas.width / scale), h = Math.ceil(canvas.height / scale);
  if (!canvas._img || canvas._img.width !== w) { canvas._img = ctx.createImageData(w, h); canvas._tmp = new OffscreenCanvas(w, h); }
  const r = rng(frame * 9973 + 7), d = canvas._img.data;
  for (let i = 0; i < d.length; i += 4) { const v = 128 + (r() - .5) * amount * 2; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  canvas._tmp.getContext('2d').putImageData(canvas._img, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(canvas._tmp, 0, 0, canvas.width, canvas.height);
}

/** Frame-accurate helper to know which shot is active. shots = [{id, at, dur}] */
export function shotAt(shots, t) { for (let i = shots.length - 1; i >= 0; i--) if (t >= shots[i].at) return shots[i]; return shots[0]; }
