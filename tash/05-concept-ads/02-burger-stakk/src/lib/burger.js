// STAKK — procedural smash burger (stylised-real food CGI). All shapes/textures are generated here, seeded.
// Units: bun radius ≈ 1.0. Stack base (heel bottom) at y = 0.
import * as THREE from 'three';
import { fbm, ridged, nAng, smooth, mix, ramp, paint, paintMulti, hex, mixc, rng } from './noise.js';

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// ------------------------------------------------------------------ generic polar solid (top + bottom sheets + rim)
// pos(sheet, u, phi) → [x,y,z]   sheet 0 = top (faces up), 1 = bottom (faces down). u = 0 centre … 1 rim.
export function polarSolid({ rings, segs, pos, uvPos = pos, uvR = 1.25 }) {
  const nS = 1 + rings * segs, P = new Float32Array(nS * 2 * 3), UV = new Float32Array(nS * 2 * 2);
  const put = (idx, p, q) => { P.set(p, idx * 3); UV[idx * 2] = q[0] / (2 * uvR) + 0.5; UV[idx * 2 + 1] = q[2] / (2 * uvR) + 0.5; };
  for (let s = 0; s < 2; s++) {
    const b = s * nS;
    put(b, pos(s, 0, 0), uvPos(s, 0, 0));
    for (let i = 1; i <= rings; i++) for (let j = 0; j < segs; j++) {
      const u = i / rings, ph = j / segs * TAU;
      put(b + 1 + (i - 1) * segs + j, pos(s, u, ph), uvPos(s, u, ph));
    }
  }
  const I = [];
  const vi = (s, i, j) => (i === 0 ? s * nS : s * nS + 1 + (i - 1) * segs + (j % segs));
  for (let j = 0; j < segs; j++) {
    I.push(vi(0, 0, 0), vi(0, 1, j + 1), vi(0, 1, j));           // top fan
    I.push(vi(1, 0, 0), vi(1, 1, j), vi(1, 1, j + 1));           // bottom fan
    for (let i = 1; i < rings; i++) {
      const a = vi(0, i, j), b = vi(0, i, j + 1), c = vi(0, i + 1, j), d = vi(0, i + 1, j + 1);
      I.push(a, d, c, a, b, d);
      const A = vi(1, i, j), B = vi(1, i, j + 1), C = vi(1, i + 1, j), D = vi(1, i + 1, j + 1);
      I.push(A, C, D, A, D, B);
    }
    const T = vi(0, rings, j), T1 = vi(0, rings, j + 1), Bt = vi(1, rings, j), B1 = vi(1, rings, j + 1);
    I.push(T, B1, Bt, T, T1, B1);                                 // rim strip
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  g.setIndex(I); g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ BUN (lathe + organic displacement)
function lathe(ctrl, n = 90, segs = 160, dispFn) {
  const curve = new THREE.SplineCurve(ctrl.map(([r, y]) => new THREE.Vector2(r, y)));
  const pts = curve.getSpacedPoints(n).map(p => new THREE.Vector2(Math.max(p.x, 1e-4), p.y));
  const g = new THREE.LatheGeometry(pts, segs);
  const pos = g.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    const v = dispFn(pos.getX(k), pos.getY(k), pos.getZ(k));
    pos.setXYZ(k, v[0], v[1], v[2]);
  }
  g.computeVertexNormals();
  // weld normals across the lathe seam (column 0 == column segs)
  const nrm = g.attributes.normal, L = pts.length;
  for (let j = 0; j < L; j++) {
    const a = j, b = segs * L + j;
    const x = nrm.getX(a) + nrm.getX(b), y = nrm.getY(a) + nrm.getY(b), z = nrm.getZ(a) + nrm.getZ(b), l = Math.hypot(x, y, z) || 1;
    nrm.setXYZ(a, x / l, y / l, z / l); nrm.setXYZ(b, x / l, y / l, z / l);
  }
  return { geo: g, pts, curve };
}

function bunDisp(seed, ampR = 0.022, ampY = 0.05) {
  return (x, y, z) => {
    const r = Math.hypot(x, z); if (r < 1e-5) return [x, y * (1 + ampY * fbm(seed, y, 3.3, 2)), z];
    const ph = Math.atan2(z, x);
    const pole = smooth(0.0, 0.45, r);
    const k = 1 + ampR * pole * fbm(x * 1.4, z * 1.4, y * 2.2 + seed, 3);
    const lob = 1 + 0.012 * pole * Math.cos(ph * 3 + seed); // slight hand-shaped lobes
    const yy = y * (1 + ampY * fbm(x * 0.9 + seed, z * 0.9, 1.7, 2) * smooth(0.1, 0.8, y));
    return [x * k * lob, yy, z * k * lob];
  };
}

// crown profile: from the cut-face rim (bottom) up and over the dome to the top centre
const CROWN = [[0.9, 0.0], [0.975, 0.025], [1.018, 0.09], [1.035, 0.19], [1.015, 0.31], [0.955, 0.45], [0.84, 0.595], [0.66, 0.72], [0.42, 0.81], [0.18, 0.85], [0.0, 0.858]];
// heel profile: from bottom centre out, up the side, to the cut-face rim
const HEEL = [[0.0, 0.0], [0.5, 0.0], [0.8, 0.012], [0.935, 0.05], [0.99, 0.12], [1.0, 0.21], [0.985, 0.29], [0.95, 0.35], [0.905, 0.38]];

function bunTextures(kind, seed) {
  const crown = kind === 'crown';
  const col = crown
    ? ramp([[0, '#E2B878'], [0.05, '#D19A52'], [0.16, '#BB7A33'], [0.3, '#A05A1C'], [0.48, '#8A4714'], [0.75, '#7A3B0F'], [1, '#70350D']])
    : ramp([[0, '#9C5620'], [0.25, '#A8622A'], [0.42, '#B87634'], [0.62, '#C98E48'], [0.85, '#D9A866'], [1, '#E2BA80']]);
  const [map, rough, bump] = paintMulti(1024, 512, [{ srgb: true, repeatU: true }, { repeatU: true }, { repeatU: true }], (u, v, [c, r, b]) => {
    const a = u * TAU, cx = Math.cos(a), sx = Math.sin(a);
    const m1 = fbm(cx * 2.2, sx * 2.2, v * 6 + seed, 4);          // large mottling
    const m2 = fbm(cx * 9, sx * 9, v * 26 + seed, 3);              // fine
    const blot = smooth(0.25, 0.55, fbm(cx * 4, sx * 4, v * 12 + seed + 9, 3));
    let base = col(clamp(v + m1 * 0.06));
    base = mixc(base, hex(crown ? '#6E3410' : '#9A5A22'), blot * 0.35);
    const k = 1 + m1 * 0.1 + m2 * 0.05;
    c[0] = clamp(base[0] * k, 0, 255); c[1] = clamp(base[1] * k, 0, 255); c[2] = clamp(base[2] * k, 0, 255);
    const glossy = crown ? smooth(0.2, 0.45, v) : smooth(0.6, 0.2, v) * 0.5;
    const rr = mix(0.7, 0.42, glossy) + m2 * 0.06;
    r[0] = r[1] = r[2] = clamp(rr * 255, 0, 255);
    const bb = 0.5 + 0.35 * fbm(cx * 22, sx * 22, v * 60 + seed, 3) + 0.15 * m2;
    b[0] = b[1] = b[2] = clamp(bb * 255, 0, 255);
  });
  return { map, rough, bump };
}

function crumbTextures(seed, { toast = 1, R = 0.92 } = {}) {
  // planar disc texture: u,v ∈ [0,1] maps to x,z ∈ [-R,R]
  const [map, bump, rough] = paintMulti(1024, 1024, [{ srgb: true }, {}, {}], (u, v, [c, b, r]) => {
    const x = (u - 0.5) * 2 * R, z = (v - 0.5) * 2 * R, rr = Math.hypot(x, z) / R;
    const pores = ridged(x * 26 + seed, z * 26, 1.3, 3), cells = fbm(x * 60, z * 60, seed, 2);
    const pit = smooth(0.72, 0.92, pores) * 0.8 + smooth(0.25, 0.6, cells) * 0.3;
    const t = toast * (0.55 + 0.45 * smooth(0.0, 0.95, rr)) + 0.15 * fbm(x * 3, z * 3, seed + 2, 3);
    let base = mixc(hex('#F0D7A2'), hex('#C78A44'), clamp(t));
    base = mixc(base, hex('#9A5A24'), smooth(0.9, 1.0, rr) * 0.9);   // crust ring
    base = mixc(base, hex('#7E4A1E'), pit * 0.45);
    c[0] = base[0]; c[1] = base[1]; c[2] = base[2];
    const h = 0.62 - pit * 0.5 + 0.08 * cells;
    b[0] = b[1] = b[2] = clamp(h * 255, 0, 255);
    const ro = 0.5 + 0.12 * pit - 0.08 * toast;
    r[0] = r[1] = r[2] = clamp(ro * 255, 0, 255);
  });
  return { map, bump, rough };
}

export function buildBun(kind, seed = 3) {
  const crown = kind === 'crown';
  const ctrl = crown ? CROWN : HEEL;
  const disp = bunDisp(seed, crown ? 0.024 : 0.018, crown ? 0.06 : 0.03);
  const { geo, curve } = lathe(ctrl, crown ? 110 : 70, 180, disp);
  const tx = bunTextures(kind, seed);
  const mat = new THREE.MeshPhysicalMaterial({
    map: tx.map, roughnessMap: tx.rough, roughness: 1, bumpMap: tx.bump, bumpScale: crown ? 0.7 : 0.9,
    clearcoat: crown ? 0.22 : 0.08, clearcoatRoughness: 0.38, sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffc890'),
    emissive: new THREE.Color('#6a2600'), emissiveIntensity: 0.06,
  });
  const g = new THREE.Group(); g.name = kind;
  const body = new THREE.Mesh(geo, mat); body.castShadow = body.receiveShadow = true; g.add(body);
  // toasted cut face
  const R = crown ? 0.9 : 0.905;
  const ct = crumbTextures(seed + 11, { toast: crown ? 0.85 : 1.0, R });
  const face = new THREE.Mesh(new THREE.CircleGeometry(R * 1.0, 128),
    new THREE.MeshPhysicalMaterial({ map: ct.map, bumpMap: ct.bump, bumpScale: 1.2, roughnessMap: ct.rough, roughness: 1, sheen: 0.4, sheenColor: new THREE.Color('#ffd28a') }));
  // CircleGeometry lies in XY facing +Z → rotate to lie in XZ
  face.geometry.rotateX(crown ? Math.PI / 2 : -Math.PI / 2);
  const uv = face.geometry.attributes.uv; // re-derive planar uv from xz so pores are not mirrored weirdly
  const fp = face.geometry.attributes.position;
  for (let k = 0; k < fp.count; k++) uv.setXY(k, fp.getX(k) / (2 * R) + 0.5, fp.getZ(k) / (2 * R) + 0.5);
  face.position.y = crown ? 0.002 : 0.383;
  face.castShadow = false; face.receiveShadow = true; g.add(face);

  if (crown) g.add(buildSesame(curve, disp, seed));
  return g;
}

function buildSesame(curve, disp, seed) {
  const r = rng(seed * 101 + 7);
  const geo = new THREE.SphereGeometry(1, 14, 10);
  // teardrop seed: taper +x end, flatten y
  const p = geo.attributes.position;
  for (let k = 0; k < p.count; k++) {
    let x = p.getX(k), y = p.getY(k), z = p.getZ(k);
    const taper = 1 - 0.38 * smooth(-0.2, 1, x);
    p.setXYZ(k, x * 0.027, y * 0.0085 * taper, z * 0.0165 * taper);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.45, sheen: 0.4, sheenColor: new THREE.Color('#fff2d0'), emissive: new THREE.Color('#5a3a10'), emissiveIntensity: 0.05 });
  const N = 330, pts = [];
  const tries = 12000; let t = 0;
  while (pts.length < N && t++ < tries) {
    // area-weighted sample along the curve (only on the dome)
    const s = 0.26 + r() * 0.73;
    const q = curve.getPointAt(s);
    if (r() > q.x / 1.03) continue;
    const ph = r() * TAU;
    const x = q.x * Math.sin(ph), z = q.x * Math.cos(ph);
    const P3 = disp(x, q.y, z);
    if (pts.some(o => (o[0] - P3[0]) ** 2 + (o[1] - P3[1]) ** 2 + (o[2] - P3[2]) ** 2 < 0.058 * 0.058)) continue;
    // surface normal from the curve tangent
    const tg = curve.getTangentAt(s); // (dr, dy)
    const nr = tg.y, ny = -tg.x;  // rotate tangent → outward normal in (r,y)
    const nl = Math.hypot(nr, ny);
    const n = new THREE.Vector3(nr / nl * Math.sin(ph), ny / nl, nr / nl * Math.cos(ph)).normalize();
    pts.push([P3[0], P3[1], P3[2], n]);
  }
  const mesh = new THREE.InstancedMesh(geo, mat, pts.length);
  const m = new THREE.Matrix4(), qn = new THREE.Quaternion(), qs = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  const pal = ['#EADBB4', '#E4D0A2', '#DCC38E', '#CFAE74', '#F0E4C4', '#D8B77E'];
  pts.forEach(([x, y, z, n], i) => {
    qn.setFromUnitVectors(up, n);
    qs.setFromAxisAngle(up, r() * TAU);
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (r() - 0.5) * 0.5);
    const q = qn.clone().multiply(qs).multiply(tilt);
    const sc = 0.85 + r() * 0.3;
    m.compose(new THREE.Vector3(x + n.x * 0.004, y + n.y * 0.004, z + n.z * 0.004), q, new THREE.Vector3(sc, sc, sc));
    mesh.setMatrixAt(i, m);
    c.set(pal[Math.floor(r() * pal.length)]); mesh.setColorAt(i, c);
  });
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

// ------------------------------------------------------------------ PATTY (smashed, lacy crispy edge)
export function pattyShape(seed = 5, R0 = 1.13) {
  const R = ph => R0 * (1 + 0.05 * nAng(ph, 1.3, seed) + 0.03 * nAng(ph, 4.2, seed + 3) + 0.014 * nAng(ph, 11, seed + 6));
  const crust = (x, z) => 0.62 * ridged(x * 4.2 + seed, z * 4.2, 0.7, 4) + 0.38 * (0.5 + 0.5 * fbm(x * 11, z * 11, seed + 1, 3));
  const hh = u => 0.07 * (1 - 0.84 * smooth(0.45, 1.0, u));
  const top = (x, z, u) => hh(u) + (crust(x, z) - 0.5) * 0.04 * (1 - 0.35 * u);
  return { R, crust, hh, top, R0 };
}

export function buildPatty(seed = 5, { droop = 0.0, texRes = 2048 } = {}) {
  const S = pattyShape(seed);
  const pos = (s, u, ph) => {
    const r = u * S.R(ph) * 1.06, x = r * Math.cos(ph), z = r * Math.sin(ph);
    const d = droop * Math.max(0, r - 0.86) ** 2;
    if (s === 0) return [x, S.top(x, z, u) - d, z];
    return [x, -S.hh(u) * 0.9 - 0.004 * fbm(x * 6, z * 6, seed + 4, 2) - d, z];
  };
  const geo = polarSolid({ rings: 110, segs: 300, pos, uvR: 1.3 });
  const tx = pattyTextures(S, seed, texRes, 1.3);
  const mat = new THREE.MeshPhysicalMaterial({
    map: tx.map, roughnessMap: tx.rough, roughness: 1, bumpMap: tx.bump, bumpScale: 2.2,
    alphaMap: tx.alpha, alphaTest: 0.5, side: THREE.DoubleSide,
    clearcoat: 0.35, clearcoatRoughness: 0.28, sheen: 0.2, sheenColor: new THREE.Color('#ff9a50'),
  });
  const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true;
  m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: tx.alpha, alphaTest: 0.5 });
  const g = new THREE.Group(); g.add(m); g.name = 'patty'; g.userData.shape = S;
  return g;
}

function pattyTextures(S, seed, res, uvR) {
  const dark = hex('#24100A'), mid = hex('#4C2412'), hi = hex('#7C3F1C'), cara = hex('#A2602C'), red = hex('#6A2616'), char = hex('#170A05');
  const [map, rough, bump, alpha] = paintMulti(res, res, [{ srgb: true }, {}, {}, {}], (u, v, [c, r, b, a]) => {
    const x = (u - 0.5) * 2 * uvR, z = (v - 0.5) * 2 * uvR;
    const rr = Math.hypot(x, z), ph = Math.atan2(z, x), Rp = S.R(ph) * 1.06, uu = rr / Rp;
    const cr = S.crust(x, z);
    const f1 = fbm(x * 7, z * 7, seed + 5, 3), f2 = fbm(x * 3, z * 3, seed + 9, 3), f3 = fbm(x * 30, z * 30, seed + 2, 2);
    let col = mixc(dark, mid, smooth(0.25, 0.55, cr));
    col = mixc(col, hi, smooth(0.55, 0.8, cr));
    col = mixc(col, cara, smooth(0.78, 0.95, cr) * 0.8);
    col = mixc(col, red, smooth(0.15, 0.45, f2) * 0.35);
    col = mixc(col, char, smooth(0.35, 0.6, f1) * 0.5);
    // lacy edge: darker, crispier, golden filaments
    const lace = ridged(x * 11 + seed, z * 11, 2.2, 3);
    const edge = smooth(0.78, 0.97, uu);
    col = mixc(col, mixc(hex('#2A1308'), hex('#8E5224'), smooth(0.6, 0.95, lace)), edge * 0.85);
    const k = 1 + f3 * 0.12;
    c[0] = clamp(col[0] * k, 0, 255); c[1] = clamp(col[1] * k, 0, 255); c[2] = clamp(col[2] * k, 0, 255);
    // roughness: juicy wet patches
    const wet = smooth(0.1, 0.35, fbm(x * 5, z * 5, seed + 13, 3));
    const ro = mix(0.58, 0.2, wet * (1 - edge * 0.6)) + f3 * 0.05;
    r[0] = r[1] = r[2] = clamp(ro * 255, 0, 255);
    const bb = cr * 0.55 + 0.3 * ridged(x * 26, z * 26, seed, 3) + 0.15 * (0.5 + 0.5 * f3);
    b[0] = b[1] = b[2] = clamp(bb * 255, 0, 255);
    // alpha (lace holes): keep ridges near the rim
    const thr = smooth(0.84, 1.0, uu);
    const keep = uu < 0.84 ? 1 : (lace + 0.18 * f3 > 0.35 + thr * 0.62 ? 1 : 0);
    a[0] = a[1] = a[2] = uu > 1.0 ? 0 : keep * 255;
  });
  return { map, rough, bump, alpha };
}

// raw ball → smashed disc (morph target) for the hook
export function buildSmashPatty(seed = 21) {
  const S = pattyShape(seed, 1.08);
  const rb = 0.5;
  const ball = (s, u, ph) => {
    const th = u * Math.PI / 2;
    const k = 1 + 0.04 * fbm(Math.cos(ph) * 2, Math.sin(ph) * 2, u * 3 + s * 5 + seed, 3);
    if (s === 0) return [rb * Math.sin(th) * Math.cos(ph) * k, rb + rb * Math.cos(th) * k * 0.96, rb * Math.sin(th) * Math.sin(ph) * k];
    const yb = rb - rb * Math.cos(th) * 0.92;
    return [rb * Math.sin(th) * Math.cos(ph) * k, Math.max(0.0, yb), rb * Math.sin(th) * Math.sin(ph) * k];
  };
  const disc = (s, u, ph) => {
    const r = u * S.R(ph) * 1.02, x = r * Math.cos(ph), z = r * Math.sin(ph);
    if (s === 0) return [x, 0.15 + S.top(x, z, u) * 0.8, z];
    return [x, 0.002, z];
  };
  const g0 = polarSolid({ rings: 70, segs: 220, pos: ball, uvPos: disc, uvR: 1.3 });
  const g1 = polarSolid({ rings: 70, segs: 220, pos: disc, uvR: 1.3 });
  g0.morphAttributes.position = [g1.attributes.position];
  g0.morphAttributes.normal = [g1.attributes.normal];
  const [map, bump] = paintMulti(1024, 1024, [{ srgb: true }, {}], (u, v, [c, b]) => {
    const x = (u - 0.5) * 2.6, z = (v - 0.5) * 2.6, rr = Math.hypot(x, z);
    const strands = ridged(x * 18 + seed, z * 18, 3.1, 3), fat = smooth(0.62, 0.8, fbm(x * 22, z * 22, seed + 3, 2));
    let col = mixc(hex('#8E2430'), hex('#C04450'), strands);
    col = mixc(col, hex('#E9C4BC'), fat * 0.85);
    col = mixc(col, hex('#5A2414'), smooth(0.8, 1.05, rr / 1.1) * 0.85); // seared rim
    c[0] = col[0]; c[1] = col[1]; c[2] = col[2];
    b[0] = b[1] = b[2] = clamp((strands * 0.7 + fat * 0.3) * 255, 0, 255);
  });
  const mat = new THREE.MeshPhysicalMaterial({ map, bumpMap: bump, bumpScale: 2.5, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3, sheen: 0.3, sheenColor: new THREE.Color('#ff8080') });
  const m = new THREE.Mesh(g0, mat); m.castShadow = m.receiveShadow = true;
  m.morphTargetInfluences = [0];
  return m;
}

// ------------------------------------------------------------------ CHEESE (thick sheet with gravity drape + drips)
export class Cheese {
  constructor(support, { size = 2.12, N = 72, thick = 0.03, rot = 0.38, seed = 8 } = {}) {
    this.S = support; this.size = size; this.N = N; this.thick = thick; this.rot = rot; this.seed = seed;
    const V = (N + 1) * (N + 1);
    this.pos = new Float32Array(V * 2 * 3);
    const uv = new Float32Array(V * 2 * 2);
    const I = [];
    const id = (s, i, j) => s * V + i * (N + 1) + j;
    for (let s = 0; s < 2; s++) for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { uv[id(s, i, j) * 2] = j / N; uv[id(s, i, j) * 2 + 1] = i / N; }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const a = id(0, i, j), b = id(0, i, j + 1), c = id(0, i + 1, j), d = id(0, i + 1, j + 1);
      I.push(a, c, b, b, c, d);
      const A = id(1, i, j), B = id(1, i, j + 1), C = id(1, i + 1, j), D = id(1, i + 1, j + 1);
      I.push(A, B, C, B, D, C);
    }
    // perimeter strip
    const per = [];
    for (let j = 0; j < N; j++) per.push([0, j]);
    for (let i = 0; i < N; i++) per.push([i, N]);
    for (let j = N; j > 0; j--) per.push([N, j]);
    for (let i = N; i > 0; i--) per.push([i, 0]);
    for (let k = 0; k < per.length; k++) {
      const [i0, j0] = per[k], [i1, j1] = per[(k + 1) % per.length];
      const t0 = id(0, i0, j0), t1 = id(0, i1, j1), b0 = id(1, i0, j0), b1 = id(1, i1, j1);
      I.push(t0, b0, t1, t1, b0, b1);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(I);
    const [map, rough] = paintMulti(512, 512, [{ srgb: true }, {}], (u, v, [c, r]) => {
      const f = fbm(u * 6, v * 6, seed, 3), g = fbm(u * 30, v * 30, seed + 4, 2);
      const col = mixc(hex('#F08C00'), hex('#FAA21C'), 0.5 + 0.5 * f);
      const k = 1 + g * 0.05;
      c[0] = clamp(col[0] * k, 0, 255); c[1] = clamp(col[1] * k, 0, 255); c[2] = clamp(col[2] * k, 0, 255);
      r[0] = r[1] = r[2] = clamp((0.3 + 0.08 * f + 0.05 * g) * 255, 0, 255);
    });
    this.mat = new THREE.MeshPhysicalMaterial({ map, roughnessMap: rough, roughness: 1, clearcoat: 0.55, clearcoatRoughness: 0.22, sheen: 0.5, sheenColor: new THREE.Color('#ffc040'), emissive: new THREE.Color('#ff6a00'), emissiveIntensity: 0.1, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, this.mat); this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.group = new THREE.Group(); this.group.add(this.mesh); this.group.name = 'cheese';
    // drips (teardrop lathes, scaled by length)
    const prof = []; for (let k = 0; k <= 32; k++) { const s = k / 32; const r = 0.03 - 0.012 * smooth(0, 0.5, s) + 0.016 * smooth(0.55, 0.85, s); const end = s > 0.85 ? Math.sqrt(Math.max(0, 1 - ((s - 0.85) / 0.15) ** 2)) : 1; prof.push(new THREE.Vector2(Math.max(1e-4, r * end), -s)); }
    this.dripGeo = new THREE.LatheGeometry(prof, 24);
    this.drips = [0, 2].map(c => { const d = new THREE.Mesh(this.dripGeo, this.mat); d.castShadow = true; d.userData.corner = c; this.group.add(d); return d; });
    this.update(0, 0);
  }
  /** drape: 0 = rigid flat slice, 1 = fully melted; drip: 0..1 drip length */
  update(drape, drip = 0, wobble = 0) {
    const { N, size, thick, rot, S } = this; const P = this.pos; const V = (N + 1) * (N + 1);
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const top = this.top || (this.top = new Float32Array(V * 3));
    const flatY = 0.112;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      let lx = (j / N - 0.5) * size, lz = (i / N - 0.5) * size;
      // square → rounded square (superellipse n=4.5): melted slices never have sharp corners
      const m = Math.max(Math.abs(lx), Math.abs(lz));
      if (m > 1e-6) { const e = Math.pow(Math.pow(Math.abs(lx), 4.5) + Math.pow(Math.abs(lz), 4.5), 1 / 4.5); lx *= m / e; lz *= m / e; }
      // tiny irregular outline
      const wob = 1 + 0.012 * fbm(lx * 3, lz * 3, this.seed, 2);
      const x0 = (lx * cr - lz * sr) * wob, z0 = (lx * sr + lz * cr) * wob;
      const r = Math.hypot(x0, z0), ph = Math.atan2(z0, x0);
      const Rp = S.R(ph) * 1.06, Rs = Rp * 0.86;
      const base = (x, z, u) => S.hh(u) + 0.006 + thick + 0.014 * (S.crust(x, z) - 0.5) * drape;
      let x, y, z;
      if (r <= Rs) { x = x0; z = z0; y = mix(flatY, base(x0, z0, r / Rp), drape); }
      else {
        const s = r - Rs, ux = x0 / r, uz = z0 / r;
        const ex = ux * Rs, ez = uz * Rs, ey = mix(flatY, base(ex, ez, Rs / Rp), drape);
        const kap = Math.max(1e-4, drape * 6.5 * (1 + 0.45 * nAng(ph, 2.0, this.seed)) + wobble);
        const tm = 1.52, s0 = tm / kap;
        let h, v;
        if (s < s0) { h = Math.sin(kap * s) / kap; v = (1 - Math.cos(kap * s)) / kap; }
        else { h = Math.sin(tm) / kap + (s - s0) * Math.cos(tm); v = (1 - Math.cos(tm)) / kap + (s - s0) * Math.sin(tm); }
        x = ex + ux * h; z = ez + uz * h; y = ey - v;
      }
      const k = (i * (N + 1) + j) * 3; top[k] = x; top[k + 1] = y; top[k + 2] = z;
    }
    // normals of top sheet (finite differences) → bottom = top - n*thick
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const k = (i * (N + 1) + j) * 3;
      const kx1 = (i * (N + 1) + Math.min(N, j + 1)) * 3, kx0 = (i * (N + 1) + Math.max(0, j - 1)) * 3;
      const kz1 = (Math.min(N, i + 1) * (N + 1) + j) * 3, kz0 = (Math.max(0, i - 1) * (N + 1) + j) * 3;
      const ax = top[kx1] - top[kx0], ay = top[kx1 + 1] - top[kx0 + 1], az = top[kx1 + 2] - top[kx0 + 2];
      const bx = top[kz1] - top[kz0], by = top[kz1 + 1] - top[kz0 + 1], bz = top[kz1 + 2] - top[kz0 + 2];
      let nx = by * az - bz * ay, ny = bz * ax - bx * az, nz = bx * ay - by * ax; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      P[k] = top[k]; P[k + 1] = top[k + 1]; P[k + 2] = top[k + 2];
      const kb = V * 3 + k; P[kb] = top[k] - nx * thick; P[kb + 1] = top[k + 1] - ny * thick; P[kb + 2] = top[k + 2] - nz * thick;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals(); this.geo.computeBoundingSphere();
    // drips hang from two corners
    const corners = [[0, 0], [0, N], [N, N], [N, 0]];
    this.drips.forEach((d, n) => {
      const [i, j] = corners[d.userData.corner]; const k = (i * (N + 1) + j) * 3;
      const L = 0.03 + drip * (n === 0 ? 0.26 : 0.17);
      d.position.set(P[k] * 0.99, P[k + 1] + 0.01, P[k + 2] * 0.99);
      d.scale.set(1, L, 1);
      d.visible = drip > 0.01 && drape > 0.4;
    });
  }
}

// ------------------------------------------------------------------ PICKLES (crinkle-cut)
export function buildPickles(seed = 31, layout) {
  const r = rng(seed);
  const tex = paint(512, 512, (u, v, c) => {
    const x = (u - 0.5) * 2, z = (v - 0.5) * 2, rr = Math.hypot(x, z), ph = Math.atan2(z, x);
    const f = fbm(x * 5, z * 5, seed, 3);
    let col = mixc(hex('#9EA640'), hex('#B8BA62'), smooth(0.7, 0.2, rr) + f * 0.2);
    col = mixc(col, hex('#556317'), smooth(0.8, 0.9, rr));
    col = mixc(col, hex('#34420E'), smooth(0.93, 0.98, rr));
    // seeds around a ring
    const sr = 0.36 + 0.05 * Math.sin(ph * 3 + seed);
    const sx = Math.cos(ph * 7) * 0.5 + 0.5;
    const seedMask = smooth(0.09, 0.03, Math.abs(rr - sr)) * smooth(0.55, 0.85, sx);
    col = mixc(col, hex('#E2DDA8'), seedMask * 0.8);
    col = mixc(col, hex('#CBCB82'), smooth(0.25, 0.0, rr) * 0.5);
    c[0] = col[0]; c[1] = col[1]; c[2] = col[2];
  });
  const mat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.3, sheenColor: new THREE.Color('#e8f0a0'), emissive: new THREE.Color('#4a5a10'), emissiveIntensity: 0.12 });
  const g = new THREE.Group(); g.name = 'pickles';
  layout.forEach(([x, z, y, rad, tilt], n) => {
    const R0 = rad, th = 0.032;
    const pos = (s, u, ph) => {
      const rr = u * R0 * (1 + 0.035 * Math.cos(ph * 15)), xx = rr * Math.cos(ph), zz = rr * Math.sin(ph);
      const wave = 0.007 * Math.sin(xx * 34 + n);
      return [xx, (s === 0 ? th / 2 : -th / 2) + wave, zz];
    };
    const geo = polarSolid({ rings: 18, segs: 120, pos, uvR: R0 * 1.04 });
    const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true;
    m.position.set(x, y, z); m.rotation.set(tilt[0], r() * TAU, tilt[1]);
    g.add(m);
  });
  return g;
}

// ------------------------------------------------------------------ RED ONION rings
export function buildOnions(seed = 41, layout) {
  const g = new THREE.Group(); g.name = 'onions';
  const r = rng(seed);
  layout.forEach(([x, z, y, rad, tilt]) => {
    const geo = new THREE.TorusGeometry(rad, 0.03, 14, 120);
    const p = geo.attributes.position, nrm = geo.attributes.normal;
    const col = new Float32Array(p.count * 3);
    const outer = new THREE.Color('#7A1E52'), inner = new THREE.Color('#F2DCEA'), c = new THREE.Color();
    for (let k = 0; k < p.count; k++) {
      // flatten tube (y in torus space is the ring plane's z after rotation) — torus lies in XY; flatten Z
      p.setZ(k, p.getZ(k) * 0.42);
      const x0 = p.getX(k), y0 = p.getY(k), rr = Math.hypot(x0, y0);
      const outward = clamp((rr - rad) / 0.03 * 0.5 + 0.5);
      c.copy(inner).lerp(outer, smooth(0.55, 0.95, outward));
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.rotateX(Math.PI / 2); geo.computeVertexNormals();
    const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1, sheen: 0.4, sheenColor: new THREE.Color('#ffd0f0'), emissive: new THREE.Color('#40102a'), emissiveIntensity: 0.15 });
    const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true;
    m.position.set(x, y, z); m.rotation.set(tilt[0], r() * TAU, tilt[1]);
    m.scale.set(1, 1, 1 + 0.08 * (r() - 0.5));
    g.add(m);
  });
  return g;
}

// ------------------------------------------------------------------ SAUCE (dollop → splat morph) with relish flecks
export function buildSauce(seed = 51) {
  const R = ph => 0.8 * (1 + 0.12 * nAng(ph, 1.6, seed) + 0.06 * nAng(ph, 5, seed + 2));
  const blob = (s, u, ph) => {
    const th = u * Math.PI / 2, rb = 0.2;
    if (s === 0) return [rb * Math.sin(th) * Math.cos(ph), rb + rb * Math.cos(th) * 1.15, rb * Math.sin(th) * Math.sin(ph)];
    return [rb * Math.sin(th) * Math.cos(ph), rb - rb * Math.cos(th) * 0.9, rb * Math.sin(th) * Math.sin(ph)];
  };
  const splat = (s, u, ph) => {
    const r = u * R(ph), x = r * Math.cos(ph), z = r * Math.sin(ph);
    const h = 0.042 * Math.sqrt(Math.max(0, 1 - u ** 6)) + 0.008 * fbm(x * 6, z * 6, seed, 2) * (1 - u);
    return s === 0 ? [x, h, z] : [x, -0.006 + 0.004 * u, z];
  };
  const g0 = polarSolid({ rings: 40, segs: 160, pos: blob, uvPos: splat, uvR: 0.9 });
  const g1 = polarSolid({ rings: 40, segs: 160, pos: splat, uvR: 0.9 });
  g0.morphAttributes.position = [g1.attributes.position];
  g0.morphAttributes.normal = [g1.attributes.normal];
  const map = paint(512, 512, (u, v, c) => {
    const x = (u - 0.5) * 1.8, z = (v - 0.5) * 1.8;
    const f = fbm(x * 4, z * 4, seed, 3);
    let col = mixc(hex('#EE9560'), hex('#F4AE78'), 0.5 + 0.5 * f);
    const fl = fbm(x * 38, z * 38, seed + 7, 2), fl2 = fbm(x * 44, z * 44, seed + 17, 2);
    col = mixc(col, hex('#5E6B1E'), smooth(0.42, 0.55, fl) * 0.9);
    col = mixc(col, hex('#B8461E'), smooth(0.45, 0.6, fl2) * 0.6);
    c[0] = col[0]; c[1] = col[1]; c[2] = col[2];
  });
  const mat = new THREE.MeshPhysicalMaterial({ map, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.06, sheen: 0.3, sheenColor: new THREE.Color('#ffd0b0'), emissive: new THREE.Color('#ff5a20'), emissiveIntensity: 0.05 });
  const m = new THREE.Mesh(g0, mat); m.castShadow = m.receiveShadow = true; m.morphTargetInfluences = [1];
  const g = new THREE.Group(); g.add(m); g.name = 'sauce'; g.userData.mesh = m; g.userData.mat = mat;
  return g;
}

// ------------------------------------------------------------------ full burger
// stack heights (world y of each layer group origin). Double smash: heel / patty+cheese / patty+cheese / pickles+onions / sauce / crown
export const REST = { heel: 0, patty: 0.448, cheese: 0.448, patty2: 0.618, cheese2: 0.618, pickles: 0.618, onions: 0.618, sauce: 0.618 + 0.172, crown: 0.618 + 0.172 + 0.03 };
export const ORDER = ['heel', 'patty', 'cheese', 'patty2', 'cheese2', 'pickles', 'onions', 'sauce', 'crown'];

export function buildBurger() {
  const heel = buildBun('heel', 3);
  const patty = buildPatty(5, { droop: 0.35 });
  const S = patty.userData.shape;
  // second patty reuses the same mesh/material, rotated + mirrored so it reads as a different patty
  const patty2 = new THREE.Group(); patty2.name = 'patty2';
  const p2 = patty.children[0].clone(); p2.rotation.y = 2.3; p2.scale.set(-1, 1, 1); patty2.add(p2);
  const cheese = new Cheese(S, { rot: 0.42, seed: 8 });
  const cheese2 = new Cheese(S, { rot: 1.12, seed: 18 });
  const topAt = (x, z) => { const r = Math.hypot(x, z), ph = Math.atan2(z, x); const u = Math.min(1, r / (S.R(ph) * 1.06)); return S.hh(u) + 0.04; };
  // pickles: some near the rim so they peek out under the crown
  const pk = [[-0.62, 0.42, 0, 0.3, [0.06, -0.08]], [0.66, 0.38, 0, 0.31, [-0.05, 0.09]], [0.12, -0.7, 0, 0.3, [0.1, 0.02]], [0.05, 0.78, 0, 0.29, [-0.12, 0.05]], [-0.12, 0.02, 0.0, 0.3, [0.02, 0.03]], [-0.7, -0.38, 0, 0.29, [0.04, 0.1]]]
    .map(([x, z, dy, r, t]) => [x, z, topAt(x, z) + 0.014 + dy, r, t]);
  const pickles = buildPickles(31, pk);
  const on = [[0.25, 0.1, 0.165, 0.58, [0.05, 0.03]], [-0.3, 0.3, 0.172, 0.5, [-0.05, 0.05]], [0.18, -0.4, 0.17, 0.44, [0.06, -0.06]], [-0.35, -0.3, 0.168, 0.36, [0.04, 0.05]]];
  const onions = buildOnions(41, on);
  const sauce = buildSauce(51);
  const crown = buildBun('crown', 7);
  const group = new THREE.Group();
  const L = { heel, patty, cheese: cheese.group, patty2, cheese2: cheese2.group, pickles, onions, sauce, crown };
  for (const k in L) { group.add(L[k]); L[k].position.y = REST[k]; L[k].userData.restY = REST[k]; }
  return { group, L, cheese, cheese2, S };
}
