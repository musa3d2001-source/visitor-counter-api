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
    : ramp([[0, '#5A2A0C'], [0.3, '#6A3210'], [0.46, '#7A3A12'], [0.58, '#8A4616'], [0.7, '#9A541C'], [0.82, '#AA6424'], [0.92, '#B6722E'], [1, '#BE7E38']]);
  const [map, rough, bump] = paintMulti(2048, 1024, [{ srgb: true, repeatU: true }, { repeatU: true }, { repeatU: true }], (u, v, [c, r, b]) => {
    const a = u * TAU, cx = Math.cos(a), sx = Math.sin(a);
    const m1 = fbm(cx * 2.2, sx * 2.2, v * 6 + seed, 4);          // large mottling
    const m2 = fbm(cx * 9, sx * 9, v * 26 + seed, 3);              // fine
    const blot = smooth(0.25, 0.55, fbm(cx * 4, sx * 4, v * 12 + seed + 9, 3));
    let base = col(clamp(v + m1 * 0.06));
    base = mixc(base, hex(crown ? '#6E3410' : '#9A5A22'), blot * 0.35);
    const k = 1 + m1 * 0.1 + m2 * 0.05;
    c[0] = clamp(base[0] * k, 0, 255); c[1] = clamp(base[1] * k, 0, 255); c[2] = clamp(base[2] * k, 0, 255);
    const glossy = crown ? smooth(0.2, 0.45, v) : 0.15;
    const rr = mix(0.7, 0.42, glossy) + m2 * 0.06;
    r[0] = r[1] = r[2] = clamp(rr * 255, 0, 255);
    const bb = 0.5 + (crown ? 0.25 : 0.4) * fbm(cx * 22, sx * 22, v * 60 + seed, 3) + (crown ? 0.2 : 0.35) * fbm(cx * 70, sx * 70, v * 190 + seed, 2) + 0.12 * m2;
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
    let base = mixc(hex('#D2A060'), hex('#93501C'), clamp(t));
    base = mixc(base, hex('#64300E'), smooth(0.9, 1.0, rr) * 0.9);   // crust ring
    base = mixc(base, hex('#5E2E10'), pit * 0.55);
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
    map: tx.map, roughnessMap: tx.rough, roughness: 1, bumpMap: tx.bump, bumpScale: crown ? 1.0 : 3.2,
    clearcoat: crown ? 0.22 : 0.08, clearcoatRoughness: 0.38, sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffc890'),
    emissive: new THREE.Color('#6a2600'), emissiveIntensity: 0.06, envMapIntensity: crown ? 0.75 : 0.5, specularIntensity: crown ? 0.9 : 0.6,
  });
  const g = new THREE.Group(); g.name = kind;
  const body = new THREE.Mesh(geo, mat); body.castShadow = body.receiveShadow = true; g.add(body);
  // toasted cut face
  const R = crown ? 0.9 : 0.905;
  const ct = crumbTextures(seed + 11, { toast: crown ? 0.85 : 1.0, R });
  const face = new THREE.Mesh(new THREE.CircleGeometry(R * (crown ? 1.0 : 1.012), 128),
    new THREE.MeshPhysicalMaterial({ map: ct.map, bumpMap: ct.bump, bumpScale: 1.2, roughnessMap: ct.rough, roughness: 1, sheen: 0.3, sheenColor: new THREE.Color('#ffd28a'), envMapIntensity: 0.4, specularIntensity: 0.6 }));
  // CircleGeometry lies in XY facing +Z → rotate to lie in XZ
  face.geometry.rotateX(crown ? Math.PI / 2 : -Math.PI / 2);
  const uv = face.geometry.attributes.uv; // re-derive planar uv from xz so pores are not mirrored weirdly
  const fp = face.geometry.attributes.position;
  for (let k = 0; k < fp.count; k++) uv.setXY(k, fp.getX(k) / (2 * R) + 0.5, fp.getZ(k) / (2 * R) + 0.5);
  face.position.y = crown ? 0.002 : 0.379;
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
export function pattyShape(seed = 5, R0 = 1.17) {
  const R = ph => R0 * (1 + 0.05 * nAng(ph, 1.3, seed) + 0.03 * nAng(ph, 4.2, seed + 3) + 0.014 * nAng(ph, 11, seed + 6));
  const crust = (x, z) => 0.62 * ridged(x * 4.2 + seed, z * 4.2, 0.7, 4) + 0.38 * (0.5 + 0.5 * fbm(x * 11, z * 11, seed + 1, 3));
  const hh = u => 0.075 * (1 - 0.8 * smooth(0.66, 1.0, u));
  const top = (x, z, u) => hh(u) + (crust(x, z) - 0.5) * 0.04 * (1 - 0.35 * u);
  return { R, crust, hh, top, R0 };
}

export function buildPatty(seed = 5, { droop = 0.0, texRes = 2048 } = {}) {
  const S = pattyShape(seed);
  const pos = (s, u, ph) => {
    const r = u * S.R(ph) * 1.06, x = r * Math.cos(ph), z = r * Math.sin(ph);
    const d = droop * Math.max(0, r - 0.86) ** 2;
    const curl = 0.028 * smooth(0.86, 1.0, u) * (0.6 + 0.4 * nAng(ph, 3, seed + 9));
    if (s === 0) return [x, S.top(x, z, u) - d + curl + 0.006 * (ridged(x * 26 + seed, z * 26, 4.1, 2) - 0.55) * (1 - 0.6 * u), z]; // fine crags
    return [x, -S.hh(u) * 0.9 - 0.004 * fbm(x * 6, z * 6, seed + 4, 2) - d + curl, z];
  };
  const geo = polarSolid({ rings: 110, segs: 300, pos, uvR: 1.3 });
  const tx = pattyTextures(S, seed, texRes, 1.3);
  // ECD pass: no orange sheen veil (it read as smoke); dry matte crust + sparse wet fat glints via the clearcoat map
  const mat = new THREE.MeshPhysicalMaterial({
    map: tx.map, roughnessMap: tx.rough, roughness: 1, bumpMap: tx.bump, bumpScale: 3.2,
    alphaMap: tx.alpha, alphaTest: 0.5, side: THREE.DoubleSide,
    clearcoat: 0.85, clearcoatMap: tx.wet, clearcoatRoughness: 0.08, sheen: 0.0,
    envMapIntensity: 0.3, specularIntensity: 0.35,
  });
  const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true;
  m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: tx.alpha, alphaTest: 0.5 });
  const g = new THREE.Group(); g.add(m); g.name = 'patty'; g.userData.shape = S;
  return g;
}

function pattyTextures(S, seed, res, uvR) {
  // ECD pass: a real smash crust is deep mahogany with fine craggy relief, dark lacy edges, caramel tips and a few wet fat glints.
  const valley = hex('#3C281C'), mid = hex('#25170F'), deep = hex('#130B07'), char = hex('#0A0604'), cara = hex('#6A4022'), tip = hex('#9A6232');
  const [map, rough, bump, alpha, wetm] = paintMulti(res, res, [{ srgb: true }, {}, {}, {}, {}], (u, v, [c, r, b, a, w]) => {
    const x = (u - 0.5) * 2 * uvR, z = (v - 0.5) * 2 * uvR;
    const rr = Math.hypot(x, z), ph = Math.atan2(z, x), Rp = S.R(ph) * 1.06, uu = rr / Rp;
    const cr = S.crust(x, z);                                         // large plates (matches the geometry)
    const b1 = 0.5 + 0.5 * fbm(x * 21 + seed, z * 21, 0.9, 3);        // crust nubs
    const b2 = 0.5 + 0.5 * fbm(x * 47, z * 47 + seed, 2.7, 2);        // grain
    const cv = smooth(0.84, 0.97, ridged(x * 15, z * 15, seed + 4.4, 2)); // dark cracks between plates
    const f3 = fbm(x * 90, z * 90, seed + 2, 1);                      // micro grain
    const sear = 0.5 + 0.5 * fbm(x * 2.4, z * 2.4, seed + 9, 3);      // where the press seared hardest
    const nub = smooth(0.45, 0.85, b1 * 0.7 + b2 * 0.3);
    let col = mixc(valley, mid, smooth(0.3, 0.65, sear));
    col = mixc(col, deep, smooth(0.55, 0.9, sear) * 0.6);
    col = mixc(col, deep, (1 - nub) * 0.45);                          // low spots darker
    col = mixc(col, cara, nub * 0.5);                                 // raised nubs caramelise
    col = mixc(col, tip, smooth(0.8, 0.95, b1) * smooth(0.5, 0.9, b2) * 0.45);
    col = mixc(col, char, cv * 0.75);                                 // cracks
    col = mixc(col, char, smooth(0.7, 0.85, fbm(x * 31, z * 31, seed + 5, 2)) * 0.35); // tiny char flecks
    // lacy edge: crisp, darker, with caramel filaments
    const lace = ridged(x * 8 + seed, z * 8, 2.2, 3);
    const blob = 0.5 + 0.5 * fbm(x * 4.2, z * 4.2, seed + 20, 3), holes = fbm(x * 9, z * 9, seed + 30, 2);
    const edge = smooth(0.84, 0.98, uu);   // narrower, chunkier lace: seen edge-on, fine holes streaked into 'hair'
    col = mixc(col, mixc(hex('#24120A'), hex('#8E5224'), smooth(0.5, 0.92, lace) * 0.85), edge * 0.85); // thin lace browns lighter + crisp
    const k = 1 + f3 * 0.16;
    c[0] = clamp(col[0] * k, 0, 255); c[1] = clamp(col[1] * k, 0, 255); c[2] = clamp(col[2] * k, 0, 255);
    // wet fat: sparse glints on ridge tops + a few juicy pools
    const glint = smooth(0.28, 0.46, fbm(x * 24, z * 24, seed + 15, 2)) * smooth(0.4, 0.8, nub);
    const pool = smooth(0.3, 0.5, fbm(x * 5, z * 5, seed + 13, 3)) * 0.35;
    const wet = clamp(glint + pool) * (1 - edge * 0.6);
    const ro = mix(0.88, 0.3, wet) + f3 * 0.04;
    r[0] = r[1] = r[2] = clamp(ro * 255, 0, 255);
    w[0] = w[1] = w[2] = clamp(wet * 255, 0, 255);
    const bb = cr * 0.25 + 0.42 * b1 + 0.18 * b2 + 0.05 * (0.5 + 0.5 * f3) - 0.3 * cv + 0.15;
    b[0] = b[1] = b[2] = clamp(bb * 255, 0, 255);
    // alpha (lace holes): keep ridges near the rim
    const thr = smooth(0.88, 1.0, uu);
    const kv = blob + 0.22 * holes + 0.08 * lace - thr * 0.9;
    const keep = uu < 0.88 ? 1 : (kv > 0.3 ? 1 : 0);
    a[0] = a[1] = a[2] = uu > 1.0 ? 0 : keep * 255;
  });
  return { map, rough, bump, alpha, wet: wetm };
}

// raw ball → smashed disc (morph target) for the hook
export function buildSmashPatty(seed = 21) {
  const S = pattyShape(seed, 1.08);
  const rb = 0.5;
  const ball = (s, u, ph) => {
    const th = u * Math.PI / 2;
    const ux = Math.sin(th) * Math.cos(ph), uz = Math.sin(th) * Math.sin(ph), uy = (s === 0 ? 1 : -1) * Math.cos(th);
    // noise from the 3D direction → top/bottom sheets meet without a seam; lumpy hand-formed ball
    const k = 1 + 0.07 * fbm(ux * 1.6 + seed, uy * 1.6, uz * 1.6, 3) + 0.02 * fbm(ux * 7, uy * 7, uz * 7 + seed, 2);
    const y = rb + uy * rb * k * (uy > 0 ? 0.94 : 0.9);
    return [ux * rb * k, Math.max(0.0, y), uz * rb * k];
  };
  const disc = (s, u, ph) => {
    const rag = 1 + 0.06 * nAng(ph, 6, seed + 4) + 0.03 * nAng(ph, 17, seed + 8);
    const r = u * S.R(ph) * 1.02 * rag, x = r * Math.cos(ph), z = r * Math.sin(ph);
    if (s === 0) return [x, 0.012 + 0.135 * (1 - smooth(0.55, 1.0, u)) + (S.crust(x, z) - 0.5) * 0.035 * (1 - 0.5 * u), z];
    return [x, 0.002, z];
  };
  const g0 = polarSolid({ rings: 70, segs: 220, pos: ball, uvPos: disc, uvR: 1.3 });
  const g1 = polarSolid({ rings: 70, segs: 220, pos: disc, uvR: 1.3 });
  g0.morphAttributes.position = [g1.attributes.position];
  g0.morphAttributes.normal = [g1.attributes.normal];
  const [map, bump, rough] = paintMulti(1024, 1024, [{ srgb: true }, {}, {}], (u, v, [c, b, ro]) => {
    const x = (u - 0.5) * 2.6, z = (v - 0.5) * 2.6, rr = Math.hypot(x, z);
    // ground beef: tangled strands of lean + flecks of fat
    const st1 = ridged(x * 17 + seed, z * 17, 3.1, 3), st2 = ridged(x * 33, z * 33 + seed, 5.3, 2);
    const strands = Math.max(st1, st2 * 0.9);
    const fat = smooth(0.58, 0.74, fbm(x * 30, z * 30, seed + 3, 2)) * 0.9 + smooth(0.8, 0.9, st2) * 0.3;
    let col = mixc(hex('#4A0E14'), hex('#9A2430'), smooth(0.3, 0.85, strands));
    col = mixc(col, hex('#B83A44'), smooth(0.85, 0.97, strands) * 0.5);
    col = mixc(col, hex('#E8C4BA'), clamp(fat) * 0.8);
    col = mixc(col, hex('#4A1E10'), smooth(0.82, 1.05, rr / 1.1) * 0.9); // seared rim
    c[0] = col[0]; c[1] = col[1]; c[2] = col[2];
    b[0] = b[1] = b[2] = clamp((strands * 0.75 + fat * 0.25) * 255, 0, 255);
    ro[0] = ro[1] = ro[2] = clamp((0.5 - 0.25 * fat - 0.12 * strands) * 255, 0, 255);
  });
  const mat = new THREE.MeshPhysicalMaterial({ map, bumpMap: bump, bumpScale: 6, roughnessMap: rough, roughness: 1, clearcoat: 0.35, clearcoatRoughness: 0.25, sheen: 0.12, sheenRoughness: 0.6, sheenColor: new THREE.Color('#c03040'), envMapIntensity: 0.4, specularIntensity: 0.6 });
  const m = new THREE.Mesh(g0, mat); m.castShadow = m.receiveShadow = true;
  m.morphTargetInfluences = [0];
  return m;
}

// ------------------------------------------------------------------ DRIP: closed root blob → thin neck → round bulb (bulb stays round at any length)
export class Drip {
  constructor(mat, { root = 0.034, neck = 0.012, bulb = 0.024, n = 44, segs = 22 } = {}) {
    this.o = { root, neck, bulb }; this.n = n; this.segs = segs;
    const V = n * (segs + 1), P = new Float32Array(V * 3), I = [];
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j, b = a + 1, c = a + segs + 1, d = c + 1; I.push(a, b, c, b, d, c); // outward-facing
    }
    this.geo = new THREE.BufferGeometry(); this.geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); this.geo.setIndex(I);
    this.mesh = new THREE.Mesh(this.geo, mat); this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    this.L = -1; this.set(0.05);
  }
  set(L) {
    L = Math.max(0.02, L); if (Math.abs(L - this.L) < 1e-5) return; this.L = L;
    const { root, neck, bulb } = this.o, n = this.n, segs = this.segs, P = this.geo.attributes.position.array;
    const rb = Math.min(bulb * (0.8 + 0.8 * Math.min(1, L / 0.25)), L * 0.42, root * 0.78), top = root * 0.75, cy = -(L - rb);
    const nk = mix(root * 0.82, neck, smooth(0.07, 0.24, L));   // short drips are one teardrop; long ones grow a neck
    for (let i = 0; i < n; i++) {
      const y = top - (top + L) * (i / (n - 1));
      let r;
      // neck: dome root → zero-slope taper to the neck → continues under the bulb; bulb: sphere. Joined with a polynomial smooth-max (no crease).
      let rn;
      if (y > 0) rn = root * Math.sqrt(Math.max(0, 1 - (y / top) ** 2));
      else if (y >= cy) { const q = Math.min(1, -y / Math.max(1e-3, -cy)); rn = nk + (root - nk) * (1 - smooth(0, 1, q)); }
      else rn = nk * Math.sqrt(Math.max(0, 1 - ((y - cy) / rb) ** 2));
      const dy = y - cy, rs = Math.abs(dy) < rb ? Math.sqrt(rb * rb - dy * dy) : 0, kk = 0.012;
      r = (rn + rs + Math.sqrt((rn - rs) ** 2 + kk * kk)) / 2 - kk / 2;
      if (y <= cy - rb) r = 0;
      if (i === n - 1) r = 0;
      for (let j = 0; j <= segs; j++) { const a = j / segs * TAU, k = (i * (segs + 1) + j) * 3; P[k] = r * Math.cos(a); P[k + 1] = y; P[k + 2] = r * Math.sin(a); }
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.computeVertexNormals(); this.geo.computeBoundingSphere();
  }
}

// ------------------------------------------------------------------ CHEESE (thick sheet with gravity drape + drips)
export class Cheese {
  constructor(support, { size = 1.9, N = 72, thick = 0.03, rot = 0.38, seed = 8 } = {}) {
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
    const [map, rough, bump] = paintMulti(512, 512, [{ srgb: true }, {}, {}], (u, v, [c, r, b]) => {
      const f = fbm(u * 5, v * 5, seed, 3), g = fbm(u * 30, v * 30, seed + 4, 2), bl = smooth(0.35, 0.6, fbm(u * 46, v * 46, seed + 9, 2));
      let col = mixc(hex('#E97F00'), hex('#F8A214'), 0.5 + 0.5 * f);
      col = mixc(col, hex('#FFC04A'), bl * 0.35);
      const k = 1 + g * 0.06;
      c[0] = clamp(col[0] * k, 0, 255); c[1] = clamp(col[1] * k, 0, 255); c[2] = clamp(col[2] * k, 0, 255);
      r[0] = r[1] = r[2] = clamp((0.48 + 0.1 * f - 0.14 * bl + 0.05 * g) * 255, 0, 255);
      b[0] = b[1] = b[2] = clamp((0.5 + 0.3 * bl + 0.15 * g) * 255, 0, 255);
    });
    this.mat = new THREE.MeshPhysicalMaterial({ map, roughnessMap: rough, roughness: 1, bumpMap: bump, bumpScale: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.3, specularIntensity: 0.7, envMapIntensity: 0.7, sheen: 0.5, sheenRoughness: 0.4, sheenColor: new THREE.Color('#ffb030'), emissive: new THREE.Color('#ff5a00'), emissiveIntensity: 0.12, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, this.mat); this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.group = new THREE.Group(); this.group.add(this.mesh); this.group.name = 'cheese';
    // drips (teardrop lathes, scaled by length)
    this.drips = [0, 2].map(c => { const dr = new Drip(this.mat, { root: 0.038, neck: 0.017, bulb: 0.027 }); const d = dr.mesh; d.userData.drip = dr; d.userData.corner = c; this.group.add(d); return d; });
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
    this.cornerPts = corners.map(([i, j]) => { const k = (i * (N + 1) + j) * 3; return [P[k], P[k + 1], P[k + 2]]; });
    this.drips.forEach((d, n) => {
      const [i, j] = corners[d.userData.corner]; const k = (i * (N + 1) + j) * 3;
      const L = 0.03 + drip * (n === 0 ? 0.26 : 0.17);
      d.position.set(P[k] * 0.985, P[k + 1] - 0.004, P[k + 2] * 0.985);   // root blob sits on the corner tip
      d.userData.drip.set(L);
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
    let col = mixc(hex('#7E7A26'), hex('#9C9440'), smooth(0.7, 0.2, rr) + f * 0.2);
    col = mixc(col, hex('#4E5214'), smooth(0.8, 0.9, rr));
    col = mixc(col, hex('#2C320A'), smooth(0.93, 0.98, rr));
    // seeds around a ring
    const seg = TAU / 8, da = (((ph + seed) % seg) + seg) % seg - seg / 2;
    const e = Math.hypot((rr - 0.36) / 0.1, (rr * da) / 0.055);
    const seedMask = smooth(1.0, 0.6, e) * (0.7 + 0.3 * f);
    col = mixc(col, hex('#BDB36A'), seedMask * 0.6);
    col = mixc(col, hex('#A9A256'), smooth(0.25, 0.0, rr) * 0.4);
    c[0] = col[0]; c[1] = col[1]; c[2] = col[2];
  });
  const mat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.2, sheenColor: new THREE.Color('#d8d080'), emissive: new THREE.Color('#3a3a08'), emissiveIntensity: 0.1 });
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
      { const a = Math.atan2(p.getY(k), p.getX(k)), ring = rad * (1 + 0.035 * nAng(a, 1.6, seed + rad * 7)), r0 = Math.hypot(p.getX(k), p.getY(k));
        const th = 1 + 0.35 * nAng(a, 2.4, seed + rad * 13), off = (r0 - rad) * th; const rn = ring + off;
        p.setX(k, Math.cos(a) * rn); p.setY(k, Math.sin(a) * rn); p.setZ(k, p.getZ(k) * th); }
      const x0 = p.getX(k), y0 = p.getY(k), rr = Math.hypot(x0, y0);
      const outward = clamp((rr - rad * (1 + 0.035 * nAng(Math.atan2(y0, x0), 1.6, seed + rad * 7))) / 0.03 * 0.5 + 0.5);
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
  const R = ph => 0.6 * (1 + 0.2 * nAng(ph, 1.8, seed) + 0.08 * nAng(ph, 5, seed + 2));
  const blob = (s, u, ph) => {
    const th = u * Math.PI / 2, rb = 0.2;
    if (s === 0) return [rb * Math.sin(th) * Math.cos(ph), rb + rb * Math.cos(th) * 1.15, rb * Math.sin(th) * Math.sin(ph)];
    return [rb * Math.sin(th) * Math.cos(ph), rb - rb * Math.cos(th) * 0.9, rb * Math.sin(th) * Math.sin(ph)];
  };
  const splat = (s, u, ph) => {
    const r = u * R(ph), x = r * Math.cos(ph), z = r * Math.sin(ph);
    const h = 0.11 * Math.pow(Math.max(0, 1 - u ** 3), 0.55) + 0.022 * fbm(x * 4, z * 4, seed, 2) * (1 - u);
    return s === 0 ? [x, h, z] : [x, -0.006 + 0.004 * u, z];
  };
  const g0 = polarSolid({ rings: 40, segs: 160, pos: blob, uvPos: splat, uvR: 0.9 });
  const g1 = polarSolid({ rings: 40, segs: 160, pos: splat, uvR: 0.9 });
  g0.morphAttributes.position = [g1.attributes.position];
  g0.morphAttributes.normal = [g1.attributes.normal];
  const map = paint(512, 512, (u, v, c) => {
    const x = (u - 0.5) * 1.8, z = (v - 0.5) * 1.8;
    const f = fbm(x * 4, z * 4, seed, 3);
    let col = mixc(hex('#C9542A'), hex('#E07A44'), 0.5 + 0.5 * f);
    const fl = fbm(x * 38, z * 38, seed + 7, 2), fl2 = fbm(x * 44, z * 44, seed + 17, 2);
    col = mixc(col, hex('#5E6B1E'), smooth(0.42, 0.55, fl) * 0.9);
    col = mixc(col, hex('#B8461E'), smooth(0.45, 0.6, fl2) * 0.6);
    c[0] = col[0]; c[1] = col[1]; c[2] = col[2];
  });
  const mat = new THREE.MeshPhysicalMaterial({ map, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.85, sheen: 0.1, sheenColor: new THREE.Color('#ffb080'), emissive: new THREE.Color('#ff4a10'), emissiveIntensity: 0.04 });
  const m = new THREE.Mesh(g0, mat); m.castShadow = m.receiveShadow = true; m.morphTargetInfluences = [1];
  const g = new THREE.Group(); g.add(m); g.name = 'sauce'; g.userData.mesh = m; g.userData.mat = mat;
  // drips over the rim (grow with 'ooze')

  // drips at the burger's rim (visible under the crown) + a couple on the dollop edge
  g.userData.drips = [[1.25, 0.97, 0.2], [1.75, 0.95, 0.13], [0.55, 0.96, 0.16], [2.6, 0.95, 0.1], [0.3, 0.6, 0.06]].map(([ph, rr, len]) => {
    const dr = new Drip(mat, { root: 0.036, neck: 0.017, bulb: 0.025 }); const d = dr.mesh;
    d.position.set(Math.sin(ph) * rr, 0.0, Math.cos(ph) * rr); d.userData.len = len; d.userData.drip = dr; g.add(d); return d;
  });
  g.userData.ooze = k => g.userData.drips.forEach(d => { d.visible = k > 0.02; d.userData.drip.set(Math.max(0.02, k * d.userData.len)); });
  g.userData.ooze(1);
  return g;
}

// ------------------------------------------------------------------ full burger
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
  const on = [[0.3, 0.12, 0.165, 0.66, [0.05, 0.03]], [-0.36, 0.34, 0.173, 0.56, [-0.05, 0.05]], [0.22, -0.42, 0.17, 0.5, [0.06, -0.06]], [-0.4, -0.34, 0.168, 0.42, [0.04, 0.05]]];
  const onions = buildOnions(41, on);
  const sauce = buildSauce(51);
  const crown = buildBun('crown', 7);
  const group = new THREE.Group();
  const h0 = S.hh(0);
  const REST = { heel: 0, patty: 0.383 + h0 * 0.9 + 0.002 };
  REST.cheese = REST.patty;
  REST.patty2 = REST.patty + (h0 + 0.006 + 0.03) + h0 * 0.9 + 0.004;
  REST.cheese2 = REST.pickles = REST.onions = REST.patty2;
  REST.sauce = REST.patty2 + 0.185; REST.crown = REST.sauce + 0.04;
  const L = { heel, patty, cheese: cheese.group, patty2, cheese2: cheese2.group, pickles, onions, sauce, crown };
  for (const k in L) { group.add(L[k]); L[k].position.y = REST[k]; L[k].userData.restY = REST[k]; }
  return { group, L, cheese, cheese2, S, REST };
}
