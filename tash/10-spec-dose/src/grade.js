// DOSE — one shared grade for the five AI clips ("one warm Jahra afternoon"), as a per-pixel pass on the CPU canvas.
// Adapted from 09-pitch-mor/src/grade.js. A pure function of its inputs (no canvas filters).
//   1. per-clip MATCH: input black point per channel, exposure (stops), white balance, saturation, contrast
//   2. light: exposure × vignette × shades (graduated falloffs)
//   3. the shared LOOK: soft highlight shoulder, blacks to a warm coffee-black, whites capped at warm plaster white
//      (dose's world is orange / white plaster / steel: whites stay clean, never grey)
const s2l = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; s2l[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const l2s = x => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

const LMAX = 2.5, NB = 4096;
const LIFT = [14, 10, 8], CAP = [254, 250, 244];
const OUT = [0, 1, 2].map(c => {
  const t = new Uint8ClampedArray(NB + 1);
  for (let i = 0; i <= NB; i++) {
    const x = i / NB * LMAX;
    const k = 0.7, y = x < k ? x : k + (1 - k) * (1 - Math.exp(-(x - k) / (1 - k)));
    const s = l2s(Math.min(1, y));
    const toe = s * s * (3 - 2 * s) * 0.14 + s * 0.86;
    t[i] = Math.round(LIFT[c] + (CAP[c] - LIFT[c]) * toe);
  }
  return t;
});

/** per-clip match LUTs: 8-bit sRGB → linear, after black point, exposure, white balance and a contrast curve about mid grey */
export function makeMatch({ black = [0, 0, 0], stops = 0, wb = [1, 1, 1], sat = 1, contrast = 1 } = {}) {
  const g = Math.pow(2, stops);
  const L = [0, 1, 2].map(c => {
    const t = new Float32Array(256), b = black[c];
    for (let i = 0; i < 256; i++) {
      let v = s2l[Math.max(0, Math.min(255, Math.round((i - b) * 255 / (255 - b))))];
      if (contrast !== 1) v = 0.18 * Math.pow(Math.max(v, 1e-5) / 0.18, contrast);
      t[i] = v * g * wb[c];
    }
    return t;
  });
  return { L, sat };
}

export function makeGrader(W, H) {
  const VIG = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - W / 2) / (W * 0.62), dy = (y - H * 0.48) / (H * 0.62), r = Math.sqrt(dx * dx + dy * dy);
    const k = Math.min(1, Math.max(0, (r - 0.5) / 0.6));
    VIG[y * W + x] = 1 - 0.22 * k * k * (3 - 2 * k);
  }
  /** opts: match, exp (linear multiplier), sat (overrides/multiplies the clip's), shades: [{y0, y1, k}] (y1 < y0: toward the top) */
  return function grade(ctx, { match, exp = 1, satMul = 1, shades = [] }) {
    const img = ctx.getImageData(0, 0, W, H), d = img.data;
    const [LR, LG, LB] = match.L, sat = match.sat * satMul, q = NB / LMAX;
    const [OR, OG, OB] = OUT;
    const rowK = new Float32Array(H).fill(exp);
    for (const s of shades) for (let y = 0; y < H; y++) {
      const u = Math.min(1, Math.max(0, (y - s.y0) / (s.y1 - s.y0)));
      rowK[y] *= 1 - (1 - s.k) * u * u * (3 - 2 * u);
    }
    for (let y = 0, i = 0, p = 0; y < H; y++) {
      const rk = rowK[y];
      for (let x = 0; x < W; x++, i += 4, p++) {
        const k = rk * VIG[p];
        let r = LR[d[i]] * k, g = LG[d[i + 1]] * k, b = LB[d[i + 2]] * k;
        if (sat !== 1) { const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b; r = Y + sat * (r - Y); g = Y + sat * (g - Y); b = Y + sat * (b - Y); }
        r = r < 0 ? 0 : r > LMAX ? LMAX : r; g = g < 0 ? 0 : g > LMAX ? LMAX : g; b = b < 0 ? 0 : b > LMAX ? LMAX : b;
        d[i] = OR[(r * q) | 0]; d[i + 1] = OG[(g * q) | 0]; d[i + 2] = OB[(b * q) | 0];
      }
    }
    ctx.putImageData(img, 0, 0);
  };
}
