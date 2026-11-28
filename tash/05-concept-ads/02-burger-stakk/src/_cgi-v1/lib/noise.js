// STAKK — deterministic noise + procedural texture helpers (no Math.random anywhere).
import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { rng } from '/_system/motion/kit.js';

const P = new ImprovedNoise();
export const n3 = (x, y, z) => P.noise(x, y, z);               // ~[-1,1]
export function fbm(x, y, z = 0, oct = 4, lac = 2.0, gain = 0.5) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * P.noise(x * f, y * f, z * f + i * 17.3); n += a; a *= gain; f *= lac; }
  return s / n;
}
export function ridged(x, y, z = 0, oct = 4) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(P.noise(x * f, y * f, z * f + i * 31.7))); n += a; a *= 0.5; f *= 2.1; }
  return s / n; // 0..1, high on ridges
}
/** periodic noise on an angle (no seams): sample on a circle */
export function nAng(phi, freq = 1, z = 0, oct = 3) {
  return fbm(Math.cos(phi) * freq, Math.sin(phi) * freq, z, oct);
}
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const mix = (a, b, k) => a + (b - a) * k;
export function hex(h) { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); }
export function mixc(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
/** multi-stop colour ramp: stops = [[pos, '#hex'], ...] */
export function ramp(stops) {
  const S = stops.map(([p, c]) => [p, hex(c)]);
  return x => {
    if (x <= S[0][0]) return S[0][1];
    for (let i = 1; i < S.length; i++) if (x <= S[i][0]) return mixc(S[i - 1][1], S[i][1], (x - S[i - 1][0]) / (S[i][0] - S[i - 1][0]));
    return S[S.length - 1][1];
  };
}
export { rng };

/** Paint a texture: fn(u, v, out) writes [r,g,b,a] (0..255) into out. Returns CanvasTexture. */
export function paint(w, h, fn, { srgb = true, repeatU = false, aniso = 8 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); const img = ctx.createImageData(w, h); const d = img.data; const o = [0, 0, 0, 255];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    o[3] = 255; fn((x + 0.5) / w, (y + 0.5) / h, o);
    const i = (y * w + x) * 4; d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = o[3];
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  if (repeatU) t.wrapS = THREE.RepeatWrapping;
  t.needsUpdate = true; t.flipY = false;
  return t;
}

/** Paint several maps in a single pass (fn gets (u,v,outs[])) — saves evaluating noise per map. */
export function paintMulti(w, h, specs, fn) {
  const cs = specs.map(() => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; });
  const imgs = cs.map(c => c.getContext('2d').createImageData(w, h));
  const outs = specs.map(() => [0, 0, 0, 255]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (const o of outs) o[3] = 255;
    fn((x + 0.5) / w, (y + 0.5) / h, outs);
    const i = (y * w + x) * 4;
    for (let k = 0; k < outs.length; k++) { const d = imgs[k].data, o = outs[k]; d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = o[3]; }
  }
  return cs.map((c, k) => {
    c.getContext('2d').putImageData(imgs[k], 0, 0);
    const t = new THREE.CanvasTexture(c); const s = specs[k];
    t.colorSpace = s.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8; t.flipY = false;
    if (s.repeatU) t.wrapS = THREE.RepeatWrapping;
    t.needsUpdate = true; return t;
  });
}
