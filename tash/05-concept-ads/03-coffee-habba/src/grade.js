// HABBA — one shared grade for all five AI clips ("shot on the same morning"), as a per-pixel pass on the CPU canvas.
// Pure function of its inputs (no canvas filters: their output depended on seek history in the launch ad).
//   1. per-clip MATCH: input black point per channel, exposure (stops), white balance, saturation
//   2. the light: exposure × vignette × shade (graduated table falloff under a line of type) × light-bar mask
//      (the blinds opening/closing: bars of light at the footage's own sun angle)
//   3. the shared LOOK: soft highlight shoulder, blacks lifted to HABBA ink, highlights capped at warm cream
const W = 1080, H = 1920;
const s2l = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; s2l[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const l2s = x => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

// ---- the LOOK (shared): linear 0..LMAX → 8-bit, per channel (lift to ink, cap at cream)
const LMAX = 2.5, NB = 4096;
const LIFT = [21, 15, 12], CAP = [251, 243, 228];          // HABBA ink #17110E-ish shadows; never pure white
const OUT = [0, 1, 2].map(c => {
  const t = new Uint8ClampedArray(NB + 1);
  for (let i = 0; i <= NB; i++) {
    const x = i / NB * LMAX;
    const k = 0.62, y = x < k ? x : k + (1 - k) * (1 - Math.exp(-(x - k) / (1 - k)));   // shoulder: >1 rolls off to 1
    const s = l2s(Math.min(1, y));
    const toe = s * s * (3 - 2 * s) * 0.18 + s * 0.82;                                 // a touch of contrast in the mids
    t[i] = Math.round(LIFT[c] + (CAP[c] - LIFT[c]) * toe);
  }
  return t;
});

// ---- vignette (constant for the whole piece, centred a little high: the subjects sit in the upper-middle)
const VIG = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = (x - W / 2) / (W * 0.62), dy = (y - H * 0.47) / (H * 0.62), r = Math.sqrt(dx * dx + dy * dy);
  const k = Math.min(1, Math.max(0, (r - 0.45) / 0.65));
  VIG[y * W + x] = 1 - 0.30 * k * k * (3 - 2 * k);          // ≈ −15…−20 % at the corners (in linear light)
}

/** a soft elliptical light pool (static per shot): gain at the centre, 1 outside; cached by key */
const POOLS = new Map();
export function pool(key, { cx, cy, rx, ry, stops }) {
  if (POOLS.has(key)) return POOLS.get(key);
  const m = new Float32Array(W * H), gpk = Math.pow(2, stops) - 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, r2 = dx * dx + dy * dy;
    const k = r2 >= 1 ? 0 : (1 - r2) * (1 - r2);
    m[y * W + x] = 1 + gpk * k;
  }
  POOLS.set(key, m);
  return m;
}

/** per-clip match LUTs: 8-bit sRGB → linear, after black point + exposure + white balance */
export function makeMatch({ black = [0, 0, 0], stops = 0, wb = [1, 1, 1], sat = 1 } = {}) {
  const g = Math.pow(2, stops);
  const L = [0, 1, 2].map(c => {
    const t = new Float32Array(256), b = black[c];
    for (let i = 0; i < 256; i++) t[i] = s2l[Math.max(0, Math.min(255, Math.round((i - b) * 255 / (255 - b))))] * g * wb[c];
    return t;
  });
  return { L, sat };
}

/**
 * Grade the canvas in place.
 * opts: match (from makeMatch), exp (linear multiplier), shade {y0, y1, k} (darken below y0→y1 by factor k),
 *       lift (a pool() map: the sun pool on the wall behind the client type),
 *       bars {open (0..1.2 lit width), dim (linear multiplier outside the bars), angle (deg), period (px), drift (0..1)}
 */
export function gradeCanvas(ctx, { match, exp = 1, shade = null, bars = null, lift = null }) {
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  const [LR, LG, LB] = match.L, sat = match.sat, q = NB / LMAX;
  const [OR, OG, OB] = OUT;
  const sh0 = shade ? shade.y0 : H + 1, sh1 = shade ? shade.y1 : H + 2, shk = shade ? shade.k : 1;
  let ca = 0, sa = 0, P = 1, half = 1, fz = 0.08, dim = 1, dr = 0;
  if (bars) { const a = bars.angle * Math.PI / 180; ca = Math.cos(a); sa = Math.sin(a); P = bars.period; half = bars.open / 2; dim = bars.dim; dr = bars.drift || 0; fz = bars.feather ?? 0.08; }
  for (let y = 0, i = 0, p = 0; y < H; y++) {
    let rowK = exp;
    if (y > sh0) { const u = Math.min(1, (y - sh0) / (sh1 - sh0)); rowK *= 1 - (1 - shk) * u * u * (3 - 2 * u); }
    for (let x = 0; x < W; x++, i += 4, p++) {
      let k = rowK * VIG[p];
      if (lift) k *= lift[p];
      if (bars) {
        // distance across the bars (bars rise to the right, like the sun through the blinds in every clip)
        const n = (x * sa + y * ca) / P + dr, ph = n - Math.floor(n), dd = Math.abs(ph - 0.5);
        let m = (half + fz - dd) / (2 * fz); m = m < 0 ? 0 : m > 1 ? 1 : m * m * (3 - 2 * m);
        k *= dim + (1 - dim) * m;
      }
      let r = LR[d[i]] * k, g = LG[d[i + 1]] * k, b = LB[d[i + 2]] * k;
      if (sat !== 1) { const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b; r = Y + sat * (r - Y); g = Y + sat * (g - Y); b = Y + sat * (b - Y); }
      r = r < 0 ? 0 : r > LMAX ? LMAX : r; g = g < 0 ? 0 : g > LMAX ? LMAX : g; b = b < 0 ? 0 : b > LMAX ? LMAX : b;
      d[i] = OR[(r * q) | 0]; d[i + 1] = OG[(g * q) | 0]; d[i + 2] = OB[(b * q) | 0];
    }
  }
  ctx.putImageData(img, 0, 0);
}
