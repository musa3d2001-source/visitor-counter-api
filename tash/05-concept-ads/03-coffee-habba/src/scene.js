// HABBA — world builders. A walnut table by a window with blinds; a terracotta cup on a cream saucer; beans.
// Everything procedural (seeded GLSL bakes, canvas, geometry) — no downloaded textures. Pure functions of time.
import * as THREE from 'three';
import { rng } from '/_system/motion/kit.js';
import { HC, markInner, VB as LVB } from './habba-logo.mjs';

export { THREE };
export const DIM = { rimY: 0.62, liqY: 0.582, saucerY: 0.046, cupR: 0.46 };

const quadVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
export const NOISE = `
float hh(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(i), hh(i + vec2(1, 0)), u.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
float fbm3(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++){ s += a * vn(p); p = p * 2.07 + vec2(5.1, 1.3); a *= 0.5; } return s; }
`;

// ------------------------------------------------------------------ GPU texture bakes
const _qs = new THREE.Scene(), _qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const _quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); _qs.add(_quad);
export function bake(renderer, frag, size = 1024, { uniforms = {}, mip = true, rt = null, h = null } = {}) {
  const target = rt || new THREE.WebGLRenderTarget(size, h || size, { type: THREE.UnsignedByteType, generateMipmaps: mip,
    minFilter: mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
  const mat = rt && rt._mat ? rt._mat : new THREE.ShaderMaterial({ uniforms, vertexShader: quadVS, fragmentShader: NOISE + frag, depthTest: false, depthWrite: false });
  target._mat = mat;
  _quad.material = mat;
  renderer.setRenderTarget(target); renderer.render(_qs, _qc); renderer.setRenderTarget(null);
  return target;
}

// walnut table (grain runs along u). Output in sRGB-ish albedo; we mark the texture colourSpace as sRGB.
const WOOD = `varying vec2 vUv;
void main(){
  vec2 uv = vUv;                                             // u runs along the grain
  float n1 = fbm(vec2(uv.x * 1.2, uv.y * 5.0));
  float n2 = fbm(vec2(uv.x * 0.35, uv.y * 1.6) + 11.0);
  float rings = uv.y * 40.0 + n1 * 2.6 + n2 * 7.0 + 1.6 * sin(uv.x * 2.4 + n2 * 4.0);
  float r = fract(rings);
  float late = smoothstep(0.0, 0.18, r) * (1.0 - smoothstep(0.30, 0.80, r));   // asymmetric latewood band
  float fib = vn(vec2(uv.x * 7.0, uv.y * 520.0)) * 0.55 + vn(vec2(uv.x * 13.0, uv.y * 1000.0 + 3.0)) * 0.45;
  float pore = smoothstep(0.74, 0.92, vn(vec2(uv.x * 180.0, uv.y * 900.0))) * (0.4 + late);
  vec3 base = vec3(0.53, 0.35, 0.215), dk = vec3(0.32, 0.19, 0.11);
  vec3 c = mix(base, dk, late * 0.62);
  c *= 0.86 + 0.26 * fib;
  c = mix(c, dk * 0.75, pore * 0.35);
  c *= 0.86 + 0.26 * fbm(vec2(uv.x * 1.6, uv.y * 0.7) + 5.0);
  gl_FragColor = vec4(c, 1.0);
}`;
// limewash plaster in client paper
const WALL = `varying vec2 vUv;
void main(){
  vec2 uv = vUv;
  float m = fbm(uv * 3.0) * 0.6 + fbm(uv * 11.0 + 3.0) * 0.3 + vn(uv * 220.0) * 0.1;
  vec3 c = vec3(0.937, 0.902, 0.847) * (0.90 + 0.12 * m);
  c = mix(c, vec3(0.86, 0.78, 0.68), smoothstep(0.62, 0.8, fbm(uv * 1.6 + 7.0)) * 0.25);
  gl_FragColor = vec4(c, 1.0);
}`;
// stoneware: cream glaze with iron speckles
const CREAM = `varying vec2 vUv; uniform float uRep;
float speck(vec2 p, float dens){
  vec2 i = floor(p), f = fract(p); float d = 1.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 o = vec2(float(x), float(y)); vec2 r = vec2(hh(i + o), hh(i + o + 17.0));
    float s = hh(i + o + 41.0); if (s > dens) continue;
    float rad = 0.06 + 0.16 * hh(i + o + 7.0) * hh(i + o + 3.0);
    d = min(d, length(f - o - r) / rad);
  }
  return 1.0 - smoothstep(0.55, 1.0, d);
}
void main(){
  vec2 uv = vUv * vec2(uRep, uRep * 0.5);
  vec3 c = vec3(0.925, 0.886, 0.82) * (0.96 + 0.06 * fbm(uv * 2.0));
  float s = speck(uv * 34.0, 0.22) * 0.75 + speck(uv * 80.0 + 3.0, 0.18) * 0.45;
  c = mix(c, vec3(0.30, 0.20, 0.14), clamp(s, 0.0, 1.0));
  gl_FragColor = vec4(c, 1.0);
}`;
// terracotta glaze on the cup body: pooling darker toward the foot, raw clay foot, cream dipped rim (v: 0 foot → 1 rim)
const TERRA = `varying vec2 vUv;
void main(){
  float v = vUv.y; vec2 p = vec2(vUv.x * 14.0, v * 4.0);
  vec3 t = vec3(0.74, 0.39, 0.27);
  t *= 0.93 + 0.12 * fbm(p * 1.5) ;
  t = mix(t, vec3(0.55, 0.26, 0.17), smoothstep(0.35, 0.12, v) * 0.55);               // glaze pools darker low
  t = mix(t, vec3(0.86, 0.58, 0.44), smoothstep(0.80, 0.93, v) * 0.35 * (0.6 + 0.4 * fbm(p * 3.0)));  // breaks lighter near the rim
  vec3 clay = vec3(0.70, 0.53, 0.40) * (0.9 + 0.15 * vn(p * 30.0));
  vec3 cream = vec3(0.925, 0.886, 0.82);
  float edge = 0.955 + 0.012 * sin(vUv.x * 6.2831 * 3.0 + 1.0) + 0.006 * vn(vec2(vUv.x * 40.0, 0.0));  // hand-dipped edge
  vec3 c = mix(t, cream, smoothstep(edge - 0.004, edge + 0.004, v));
  c = mix(clay, c, smoothstep(0.06, 0.085, v));
  gl_FragColor = vec4(c, 1.0);
}`;

export function bakeTextures(renderer) {
  const wood = bake(renderer, WOOD, 2048).texture; wood.colorSpace = THREE.SRGBColorSpace; wood.anisotropy = 8;
  const wall = bake(renderer, WALL, 1024).texture; wall.colorSpace = THREE.SRGBColorSpace;
  const cream = bake(renderer, CREAM, 1024, { uniforms: { uRep: { value: 4 } } }).texture; cream.colorSpace = THREE.SRGBColorSpace;
  const terra = bake(renderer, TERRA, 1024).texture; terra.colorSpace = THREE.SRGBColorSpace;
  terra.wrapT = THREE.ClampToEdgeWrapping;
  return { wood, wall, cream, terra };
}

// ------------------------------------------------------------------ blinds gobo (GPU bake, animated)
// Horizontal slats of light (a box profile convolved with a Gaussian = the soft edge of a real window shadow),
// a window mullion, a few swaying leaf silhouettes from a plant on the sill, and a circular light-pool falloff.
const GOBO = `varying vec2 vUv;
uniform float uOpen, uSlide, uSigma, uLeaf, uSway, uRot, uP0, uP1; uniform vec4 uLeaves[7];
float erfA(float x){ float s = sign(x); x = abs(x); float t = 1.0 / (1.0 + 0.3275911 * x);
  float y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x); return s * y; }
float boxBlur(float d, float h, float sg){ return 0.5 * (erfA((h * 0.5 - d) / (sg * 1.41421)) + erfA((h * 0.5 + d) / (sg * 1.41421))); }
void main(){
  vec2 p = vUv - 0.5;
  float c = cos(uRot), s = sin(uRot);
  vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  float period = 1.0 / 30.0, h = period * (0.08 + 0.66 * uOpen);
  float y = q.y / period + uSlide;
  float d = abs(fract(y) - 0.5) * period;
  float sg = max(uSigma, 0.0004);
  float bars = boxBlur(d, h, sg);
  // mullion (soft dark band)
  bars *= 1.0 - boxBlur(abs(vUv.x - 0.631), 0.022, sg);
  // leaves
  float leaf = 0.0;
  for (int i = 0; i < 7; i++){
    vec4 L = uLeaves[i];
    float a = L.w + sin(uSway * 1.3 + L.w) * 0.06;
    vec2 r = vUv - L.xy; r = vec2(cos(a) * r.x + sin(a) * r.y, -sin(a) * r.x + cos(a) * r.y);
    float e = length(r / vec2(0.117 * L.z, 0.033 * L.z));
    leaf = max(leaf, 1.0 - smoothstep(1.0 - sg * 30.0, 1.0 + sg * 30.0, e));
  }
  bars *= 1.0 - leaf * uLeaf;
  float rr = length(vUv - 0.5);
  bars *= smoothstep(uP1, uP0, rr);
  gl_FragColor = vec4(vec3(bars), 1.0);
}`;
export function makeGobo(renderer) {
  const R = rng(91);
  const leaves = Array.from({ length: 7 }, () => { const x = R(), y = R(), sc = 0.5 + R(), a = R() * 6.28; return new THREE.Vector4(0.08 + x * 0.22, 1 - (0.66 + y * 0.3), sc, -a); });
  const uniforms = { uOpen: { value: 1 }, uSlide: { value: 0 }, uSigma: { value: 0.006 }, uLeaf: { value: 0 }, uSway: { value: 0 }, uRot: { value: 0 }, uP0: { value: 0.3 }, uP1: { value: 0.5 }, uLeaves: { value: leaves } };
  const rt = new THREE.WebGLRenderTarget(1024, 1024, { type: THREE.UnsignedByteType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  let last = '';
  function draw({ open = 1, slide = 0, soft = 7, leaf = 0, sway = 0, rot = 0, pool = [0.3, 0.5] } = {}) {
    const key = [open, slide, soft, leaf, sway, rot, pool[0], pool[1]].map(v => v.toFixed(4)).join('|');
    if (key === last) return; last = key;
    uniforms.uOpen.value = open; uniforms.uSlide.value = slide % 1; uniforms.uSigma.value = soft / 1024;
    uniforms.uLeaf.value = leaf; uniforms.uSway.value = sway; uniforms.uRot.value = rot; uniforms.uP0.value = pool[0]; uniforms.uP1.value = pool[1];
    bake(renderer, GOBO, 1024, { uniforms, rt, mip: false });
  }
  draw();
  return { tex: rt.texture, draw };
}

// ------------------------------------------------------------------ environment (reflections): warm room + window with blinds
export function makeEnv(renderer) {
  const es = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.11, 0.075, 0.05), side: THREE.BackSide }));
  room.position.y = 3; es.add(room);
  // bright window on the left/back with horizontal slats (what the glaze and the coffee reflect)
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const c = cv.getContext('2d');
  c.fillStyle = '#000'; c.fillRect(0, 0, 256, 256);
  c.fillStyle = '#fff'; for (let i = 0; i < 12; i++) c.fillRect(0, i * 21.3 + 4, 256, 13);
  c.fillStyle = '#000'; c.fillRect(150, 0, 10, 256);
  const wt = new THREE.CanvasTexture(cv); wt.colorSpace = THREE.SRGBColorSpace;
  const win = new THREE.Mesh(new THREE.PlaneGeometry(7, 5), new THREE.MeshBasicMaterial({ map: wt, color: new THREE.Color(14, 11, 8) }));
  win.position.set(-9.5, 4.0, 3.0); win.rotation.y = Math.PI / 2 + 0.3; es.add(win);
  // warm bounce from the sunlit table and a dim ceiling
  const bounce = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.32, 0.18) }));
  bounce.rotation.x = -Math.PI / 2; bounce.position.y = -1.5; es.add(bounce);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(es, 0.03).texture; pm.dispose();
  return env;
}

// ------------------------------------------------------------------ table + wall
export function makeRoom(tex) {
  const g = new THREE.Group();
  const tg = new THREE.PlaneGeometry(14, 10, 1, 1);
  tex.wood.wrapS = tex.wood.wrapT = THREE.MirroredRepeatWrapping; tex.wood.repeat.set(2.2, 1.6);   // book-matched: the procedural grain is not periodic, mirroring hides the tile seam
  const table = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: tex.wood, roughness: 0.48, bumpMap: tex.wood, bumpScale: 0.6, envMapIntensity: 0.55 }));
  table.rotation.x = -Math.PI / 2; table.position.set(0, 0, 2.0); table.receiveShadow = true; g.add(table);
  tex.wall.wrapS = tex.wall.wrapT = THREE.MirroredRepeatWrapping; tex.wall.repeat.set(2, 1.2);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), new THREE.MeshStandardMaterial({ map: tex.wall, roughness: 0.96, bumpMap: tex.wall, bumpScale: 0.8, envMapIntensity: 0.35 }));
  wall.position.set(0, 4.5, -3.0); wall.receiveShadow = true; g.add(wall);
  return { group: g, table, wall };
}

// ------------------------------------------------------------------ cup + saucer
function profile(pts, n) { // resample a polyline profile by arc length (so lathe v ∝ length → textures don't stretch)
  const curve = new THREE.SplineCurve(pts.map(p => new THREE.Vector2(p[0], p[1])));
  return curve.getSpacedPoints(n);
}
export function makeCup(tex, env) {
  const cup = new THREE.Group();
  const glazeT = new THREE.MeshPhysicalMaterial({ map: tex.terra, roughness: 0.3, clearcoat: 1.0, clearcoatRoughness: 0.06, envMapIntensity: 1.5 });
  const glazeC = new THREE.MeshPhysicalMaterial({ map: tex.cream, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.1, envMapIntensity: 1.0 });
  const outer = profile([[0.0, 0.032], [0.15, 0.032], [0.2, 0.004], [0.232, 0.0], [0.248, 0.03], [0.29, 0.085], [0.355, 0.19], [0.408, 0.31], [0.442, 0.44], [0.458, 0.55], [0.462, 0.605], [0.459, 0.618]], 120);
  const inner = profile([[0.459, 0.618], [0.452, 0.626], [0.443, 0.618], [0.44, 0.58], [0.43, 0.48], [0.405, 0.37], [0.36, 0.26], [0.29, 0.165], [0.2, 0.105], [0.1, 0.085], [0.0, 0.08]], 90);
  const go = new THREE.LatheGeometry(outer, 160); const gi = new THREE.LatheGeometry(inner, 160);
  const mo = new THREE.Mesh(go, glazeT), mi = new THREE.Mesh(gi, glazeC);
  mo.castShadow = mi.castShadow = true; mo.receiveShadow = mi.receiveShadow = true;
  cup.add(mo, mi);
  // handle: an ear loop in the +x half-plane, slightly flattened
  const hc = new THREE.CatmullRomCurve3([[0.40, 0.50, 0], [0.52, 0.535, 0], [0.625, 0.47, 0], [0.645, 0.36, 0], [0.585, 0.25, 0], [0.48, 0.205, 0], [0.37, 0.205, 0]].map(p => new THREE.Vector3(...p)));
  const hg = new THREE.TubeGeometry(hc, 80, 0.034, 20, false);
  hg.scale(1, 1, 1.35);
  const glazeH = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#B55E40'), roughness: 0.34, clearcoat: 0.9, clearcoatRoughness: 0.08, envMapIntensity: 1.0 });
  const handle = new THREE.Mesh(hg, glazeH); handle.castShadow = true; handle.receiveShadow = true; cup.add(handle);
  // the coffee surface (map = latte render target)
  const liqR = 0.4405;
  const liqMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.05, envMapIntensity: 0.9 });
  const liq = new THREE.Mesh(new THREE.CircleGeometry(liqR, 96), liqMat);
  liq.rotation.x = -Math.PI / 2; liq.position.y = DIM.liqY; liq.receiveShadow = true; cup.add(liq);
  // logo decal band on the glaze (phi centred on -z when cup.rotation.y = 0 → faces away; we rotate the cup)
  const band = profile([[0.442, 0.44], [0.452, 0.50], [0.458, 0.55]], 24).map(p => new THREE.Vector2(p.x * 1.004, p.y));
  const bandG = new THREE.LatheGeometry(band, 48, Math.PI - 0.42, 0.84);
  const logoTex = makeCupLogoTexture();
  const bandM = new THREE.MeshPhysicalMaterial({ map: logoTex, transparent: true, roughness: 0.34, clearcoat: 0.9, clearcoatRoughness: 0.08, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
  const bandMesh = new THREE.Mesh(bandG, bandM); bandMesh.receiveShadow = true; cup.add(bandMesh);
  return { group: cup, liq, liqMat, handle, logoTex };
}

function makeCupLogoTexture() {
  // the mark printed in cream glaze on the cup. Lathe u runs with phi (viewer's left→right seen from outside) and
  // v runs foot→rim (canvas top = rim with flipY), so the canvas is drawn unflipped (checked in a still).
  const W = 1024, H = 384, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LVB.x} ${LVB.y} ${LVB.w} ${LVB.h}" width="${LVB.w}" height="${LVB.h}">${markInner({ color: '#EDE3D3' })}</svg>`;
  const img = new Image();
  tex.ready = new Promise(res => {
    img.onload = () => {
      c.clearRect(0, 0, W, H); c.save(); c.translate(W / 2, H / 2);
      const w = 330, h = w * LVB.h / LVB.w; c.drawImage(img, -w / 2, -h / 2, w, h); c.restore(); tex.needsUpdate = true; res();
    };
  });
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return tex;
}

export function makeSaucer(tex) {
  const m = new THREE.MeshPhysicalMaterial({ map: tex.cream, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1, envMapIntensity: 1.0 });
  const pts = profile([[0.0, 0.014], [0.3, 0.014], [0.33, 0.002], [0.37, 0.0], [0.4, 0.012], [0.52, 0.03], [0.64, 0.06], [0.73, 0.094], [0.775, 0.112], [0.79, 0.12], [0.785, 0.131], [0.765, 0.13],
    [0.70, 0.105], [0.6, 0.075], [0.48, 0.055], [0.33, 0.046], [0.27, 0.05], [0.24, 0.046], [0.0, 0.046]], 140);
  const g = new THREE.LatheGeometry(pts, 160);
  const s = new THREE.Mesh(g, m); s.castShadow = true; s.receiveShadow = true;
  return s;
}

// ------------------------------------------------------------------ beans (deformed ellipsoids with an S crease)
export function makeBeanGeometry(seed = 1) {
  const R = rng(seed);
  const g = new THREE.SphereGeometry(1, 72, 54);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const ax = 0.56 * (0.94 + R() * 0.12), ay = 0.27 * (0.92 + R() * 0.14), az = 0.40 * (0.92 + R() * 0.14);
  const ns = 7 + R() * 5, no = R() * 10;
  const bend = (R() - 0.5) * 0.3, tw = (R() - 0.5) * 0.3;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < 0) y *= 0.42;                                         // the flat face
    const zc = 0.13 * Math.sin(x * 2.9 + tw) * (1 - x * x);       // S-shaped crease along the flat face
    const dz = (z - zc) / 0.095;
    const along = Math.pow(Math.max(0, 1 - x * x), 0.5);
    const cr = Math.exp(-dz * dz) * (y <= 0.02 ? 1 : 0) * along;
    y += cr * 0.48;
    const bump = 1 + 0.008 * Math.sin(x * ns * 0.5 + no) * Math.sin(z * ns * 0.6 + no * 2.0);
    x *= bump; y *= bump; z *= bump;
    let X = x * ax, Y = y * ay, Z = z * az;
    Y += bend * X * X;
    p.setXYZ(i, X, Y, Z);
    // vertex colour: dark in the crease walls, a pale silverskin line in its floor, slightly lighter dome
    const wall = Math.exp(-Math.pow((Math.abs(dz) - 1.0) / 0.6, 2)) * (y <= 0.4 ? 1 : 0) * along;
    let sh = 1 - wall * 0.45 + (y > 0 ? 0.08 * y : 0);
    let r = sh, gg = sh, b = sh;
    const skin = Math.exp(-dz * dz * 6) * (cr > 0.2 ? 1 : 0);
    r = lerp3(r, 2.1, skin); gg = lerp3(gg, 1.85, skin); b = lerp3(b, 1.5, skin);
    col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
const lerp3 = (a, b, k) => a + (b - a) * k;
export function makeBeans(n = 18) {
  const geos = [1, 2, 3, 4].map(s => makeBeanGeometry(s * 13));
  const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#6e4227'), vertexColors: true, roughness: 0.58, clearcoat: 0.18, clearcoatRoughness: 0.4, envMapIntensity: 0.6, sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color('#b07a52') });
  const R = rng(777); const beans = [];
  const grp = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geos[i % 4], mat.clone());
    m.material.color.offsetHSL((R() - 0.5) * 0.02, (R() - 0.5) * 0.06, (R() - 0.5) * 0.07);
    m.castShadow = true; m.receiveShadow = true;
    const s = 0.105 * (0.9 + R() * 0.2); m.scale.setScalar(s);
    grp.add(m); beans.push({ mesh: m, r: [R(), R(), R(), R(), R(), R()] });
  }
  return { group: grp, beans };
}

// ------------------------------------------------------------------ steam: billboards with curling fbm, lit by the sun bars only
export function makeSteam(gobo) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uAmt: { value: 1 }, uSun: { value: new THREE.Matrix4() }, uGobo: { value: gobo.tex }, uSeed: { value: 0 }, uCol: { value: new THREE.Color(1.0, 0.86, 0.68) } },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: NOISE + `varying vec2 vUv; varying vec3 vW; uniform float uT, uAmt, uSeed; uniform mat4 uSun; uniform sampler2D uGobo; uniform vec3 uCol;
      void main(){
        vec2 p = vUv; float t = uT;
        // rising, curling wisps: domain-warped fbm scrolled upward, narrow at the base, widening as it rises
        float spread = mix(0.06, 0.24, smoothstep(0.0, 1.0, p.y));
        vec2 q = vec2((p.x - 0.5) / spread, p.y * 1.5 - t * 0.32);
        vec2 w = vec2(fbm3(q * 0.9 + vec2(uSeed, t * 0.12)), fbm3(q * 0.9 + vec2(5.2 + uSeed, -t * 0.1)));
        q.x += (w.x - 0.5) * 2.4 * (0.3 + p.y);
        q.y += (w.y - 0.5) * 0.8;
        float n = fbm(q * vec2(0.9, 1.3) + vec2(uSeed * 0.3, -t * 0.18));
        float ridge = pow(1.0 - abs(n * 2.0 - 1.0), 11.0);                // thin curling filaments
        ridge *= smoothstep(0.35, 0.7, fbm3(q * 0.7 + 9.0 + uSeed));    // break them into separate wisps
        float haze = smoothstep(0.55, 0.9, fbm3(q * 0.6 + 3.0 + uSeed)) * 0.12;
        float env = exp(-pow((p.x - 0.5) / spread, 2.0) * 0.5);
        float m = (ridge * 0.95 + haze) * env;
        m *= smoothstep(0.0, 0.10, p.y) * smoothstep(1.0, 0.45, p.y);
        vec4 sp = uSun * vec4(vW, 1.0); vec2 su = sp.xy / sp.w * 0.5 + 0.5;
        float sun = (sp.w > 0.0) ? texture2D(uGobo, su).r : 0.0;
        float lit = 0.12 + 1.5 * sun;
        gl_FragColor = vec4(uCol * m * lit * uAmt * 0.5, 1.0);
      }`,
  });
  const grp = new THREE.Group(); const planes = [];
  for (let i = 0; i < 3; i++) {
    const m = mat.clone(); m.uniforms.uSeed.value = i * 3.7; m.uniforms.uGobo.value = gobo.tex;
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m); pl.renderOrder = 10 + i; pl.frustumCulled = false;
    grp.add(pl); planes.push(pl);
  }
  return { group: grp, planes };
}

// ------------------------------------------------------------------ latte surface (render target): espresso → crema → milk heart with a pull-through
export function makeLatte(renderer) {
  const rt = new THREE.WebGLRenderTarget(1024, 1024, { type: THREE.UnsignedByteType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const uniforms = { uMilk: { value: 1 }, uPull: { value: 1 }, uT: { value: 0 }, uImp: { value: new THREE.Vector2(0, 0.2) }, uStream: { value: 0 }, uRot: { value: 0 } };
  const FR = `varying vec2 vUv; uniform float uMilk, uPull, uT, uStream, uRot; uniform vec2 uImp;
    mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
    void main(){
      vec2 p = (vUv - 0.5) * 2.0;                    // cup-inner disc: |p| <= 1
      p = rot(uRot) * p;
      float r = length(p);
      // fluid feel: a gentle radial swirl + low-frequency drift
      float sw = 0.07 * (1.0 - r) * (0.6 + 0.4 * uMilk);
      p = rot(sw) * p;
      vec2 dn = vec2(fbm3(p * 2.2 + uT * 0.05), fbm3(p * 2.2 + 7.0 - uT * 0.04)) - 0.5;
      vec2 pw = p + dn * 0.07;
      // crema: tan with darker tiger flecks, deeper brown toward the wall
      float fl = fbm(pw * 4.0 + 3.0);
      vec3 crema = mix(vec3(0.74, 0.50, 0.29), vec3(0.55, 0.33, 0.17), smoothstep(0.30, 0.80, fl) * 0.8);
      crema = mix(crema, vec3(0.34, 0.19, 0.09), smoothstep(0.62, 1.0, r) * 0.75);
      crema *= 0.95 + 0.07 * vn(pw * 140.0) + 0.04 * vn(pw * 40.0);
      // milk: blob centred slightly forward, drawn into a heart by the pull-through (material dragged along the line)
      vec2 c0 = vec2(0.0, 0.04);
      float R = 0.58 * uMilk;
      vec2 q = pw - c0;
      float D = uPull * 0.30 * exp(-pow(q.x / (0.065 + 0.04 * (1.0 - uPull)), 2.0)) * smoothstep(-R - 0.35, R * 0.3, q.y + 0.3);
      vec2 qs = q + vec2(0.0, D);                                  // sample upstream of the drag (y up = toward the back)
      qs.x *= 1.0 + 0.22 * uPull * smoothstep(0.05, -0.6, qs.y);   // taper toward the point
      qs.y *= 1.0 - 0.06 * uPull;
      float d = length(qs) - R;
      // stacked inner rings (wiggle layers), dragged by the same pull
      float rings = 0.0;
      for (int i = 1; i <= 3; i++){
        float rr = R * (0.28 + 0.21 * float(i));
        rings += smoothstep(0.022, 0.0, abs(length(qs * vec2(1.0, 1.08) + vec2(0.0, 0.05 * float(i))) - rr)) * smoothstep(-0.45, 0.15, qs.y - 0.1 * float(i));
      }
      float milk = smoothstep(0.012, -0.012, d) * step(0.001, uMilk);
      vec3 foam = vec3(0.96, 0.925, 0.86) * (0.97 + 0.04 * vn(pw * 160.0)) * (1.0 - 0.05 * smoothstep(0.0, -0.08, d + 0.02));
      foam = mix(foam, vec3(0.82, 0.66, 0.48), rings * 0.32 * milk);
      // crema compressed into a darker rim just outside the milk
      float halo = smoothstep(0.045, 0.0, d) * (1.0 - milk);
      vec3 col = mix(crema, crema * 0.72, halo * step(0.001, uMilk));
      col = mix(col, foam, milk);
      // the stream impact: a bright churning spot with a ripple ring
      float di = length(pw - uImp);
      col = mix(col, vec3(0.97, 0.94, 0.88), smoothstep(0.07, 0.02, di) * uStream);
      col = mix(col, col * 0.85, smoothstep(0.02, 0.0, abs(di - 0.12 - 0.02 * sin(uT * 9.0))) * uStream * 0.6);
      // meniscus: the liquid climbs the wall and darkens at the very edge
      col *= mix(1.0, 0.6, smoothstep(0.93, 1.0, r));
      gl_FragColor = vec4(col, 1.0);
    }`;
  let mat = null;
  function render(params) {
    for (const k in params) if (uniforms[k]) { if (uniforms[k].value?.set && Array.isArray(params[k])) uniforms[k].value.set(...params[k]); else uniforms[k].value = params[k]; }
    bake(renderer, FR, 1024, { uniforms, rt });
  }
  return { rt, render, uniforms };
}

// ------------------------------------------------------------------ milk stream (top-down pour)
export function makeStream() {
  const N = 40;
  const pts = Array.from({ length: N }, (_, i) => new THREE.Vector3(0, i / (N - 1), 0));
  const curve = new THREE.CatmullRomCurve3(pts);
  const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#fbf6ee'), roughness: 0.3, clearcoat: 0.6, envMapIntensity: 1.2, emissive: new THREE.Color('#3a332b') });
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.018, 12, false), mat);
  mesh.castShadow = true;
  function set({ x = 0, z = 0, y0 = 0.55, y1 = 2.2, width = 1, t = 0, lift = 0 }) {
    const P = [];
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1);
      const y = y0 + lift + (y1 - y0) * k;
      const wob = 0.0035 * Math.sin(t * 9 + k * 6) * (1 - k);
      P.push(new THREE.Vector3(x + wob + k * 0.04, y, z - k * 0.22 + wob));
    }
    const c = new THREE.CatmullRomCurve3(P);
    mesh.geometry.dispose();
    mesh.geometry = new THREE.TubeGeometry(c, 80, 0.017 * width, 16, false);
  }
  return { mesh, set };
}

// ------------------------------------------------------------------ post: depth of field (gather) + output (ACES, grade, vignette, dither)
export function makePost(renderer, W, H) {
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  rt.depthTexture = new THREE.DepthTexture(W, H); rt.depthTexture.type = THREE.FloatType;
  const rtB = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
  const rtS = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: true });
  const depthCopy = new THREE.ShaderMaterial({ uniforms: { tD: { value: null } }, vertexShader: quadVS, depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth, colorWrite: false,
    fragmentShader: `varying vec2 vUv; uniform sampler2D tD; void main(){ gl_FragDepth = texture2D(tD, vUv).x; gl_FragColor = vec4(0.0); }` });
  const qs = new THREE.Scene(), qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); qs.add(quad);
  const rtC = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
  const cocMat = new THREE.ShaderMaterial({
    uniforms: { tC: { value: null }, tD: { value: null }, uNear: { value: 0.1 }, uFar: { value: 60 }, uFocus: { value: 2 }, uAp: { value: 0 }, uMax: { value: 24 } },
    vertexShader: quadVS, depthTest: false, depthWrite: false,
    fragmentShader: `varying vec2 vUv; uniform sampler2D tC, tD; uniform float uNear, uFar, uFocus, uAp, uMax;
      void main(){ float z = texture2D(tD, vUv).x * 2.0 - 1.0; z = 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
        gl_FragColor = vec4(texture2D(tC, vUv).rgb, clamp(abs(z - uFocus) / z * uAp, 0.0, uMax)); }` });
  const dofMat = new THREE.ShaderMaterial({
    uniforms: { tC: { value: null }, tD: { value: null }, uNear: { value: 0.1 }, uFar: { value: 60 }, uFocus: { value: 2 }, uAp: { value: 0 }, uMax: { value: 24 }, uRes: { value: new THREE.Vector2(W, H) } },
    vertexShader: quadVS, depthTest: false, depthWrite: false,
    fragmentShader: `varying vec2 vUv; uniform sampler2D tC, tD; uniform float uNear, uFar, uFocus, uAp, uMax; uniform vec2 uRes;
      void main(){
        vec4 s0 = texture2D(tC, vUv); float c0 = s0.a;
        vec3 acc = s0.rgb; float wsum = 1.0;
        if (c0 > 0.6) {
          const float GA = 2.39996323;
          for (int i = 1; i < 22; i++){
            float fi = float(i); float rr = sqrt(fi / 22.0) * c0; float a = fi * GA;
            vec4 s = texture2D(tC, vUv + vec2(cos(a), sin(a)) * rr / uRes);
            float w = smoothstep(rr - 1.0, rr + 0.5, s.a + 0.5);     // only gather from samples whose own blur reaches us
            acc += s.rgb * w; wsum += w;
          }
        }
        gl_FragColor = vec4(acc / wsum, 1.0);
      }`,
  });
  const outMat = new THREE.ShaderMaterial({
    uniforms: { tC: { value: null }, tS: { value: null }, uExp: { value: 1 }, uFrame: { value: 0 }, uVig: { value: 1 }, uFade: { value: 0 }, uLift: { value: new THREE.Color(0.02, 0.013, 0.009) } },
    vertexShader: quadVS, depthTest: false, depthWrite: false,
    fragmentShader: `varying vec2 vUv; uniform sampler2D tC, tS; uniform float uExp, uFrame, uVig, uFade; uniform vec3 uLift;
      vec3 RRT(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
      vec3 aces(vec3 c){
        const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
        const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
        c *= uExp / 0.6; c = I * c; c = RRT(c); c = O * c; return clamp(c, 0.0, 1.0); }
      vec3 srgb(vec3 v){ return mix(pow(v, vec3(0.41666)) * 1.055 - vec3(0.055), v * 12.92, vec3(lessThanEqual(v, vec3(0.0031308)))); }
      float hs(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
      void main(){
        vec3 c = texture2D(tC, vUv).rgb + texture2D(tS, vUv).rgb;
        vec2 q = vUv - 0.5;
        float v = smoothstep(0.95, 0.25, length(q * vec2(1.0, 0.72)) * 1.3);
        c *= mix(1.0, mix(0.70, 1.0, v), uVig);
        c = srgb(aces(c));
        // one grade for the whole piece: warm lifted blacks, slightly creamy highlights
        c = uLift + c * (1.0 - uLift);
        c = mix(c, c * vec3(1.02, 0.995, 0.96), 0.6);
        c *= 1.0 - uFade;
        vec2 fc = gl_FragCoord.xy + vec2(uFrame * 17.0, uFrame * 31.0);
        c += (hs(fc) + hs(fc + 71.3) - 1.0) / 255.0;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  function render(scene, camera, { focus = 2, aperture = 0, exposure = 1, frame = 0, vig = 1, fade = 0, steamScene = null, mark = () => {} } = {}) {
    renderer.setRenderTarget(rt); renderer.render(scene, camera); mark('scene');
    // steam: its own layer (sharp, additive), depth-tested against the main depth so the cup rim still hides it
    renderer.setRenderTarget(rtS); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, false);
    if (steamScene) {
      quad.material = depthCopy; depthCopy.uniforms.tD.value = rt.depthTexture;
      const ac = renderer.autoClear; renderer.autoClear = false;
      renderer.render(qs, qc); renderer.render(steamScene, camera);
      renderer.autoClear = ac;
    }
    mark('steam');
    let src = rt.texture;
    if (aperture > 0.01) {
      quad.material = cocMat; const c = cocMat.uniforms;
      c.tC.value = rt.texture; c.tD.value = rt.depthTexture; c.uNear.value = camera.near; c.uFar.value = camera.far; c.uFocus.value = focus; c.uAp.value = aperture;
      renderer.setRenderTarget(rtC); renderer.render(qs, qc);
      quad.material = dofMat; dofMat.uniforms.tC.value = rtC.texture;
      renderer.setRenderTarget(rtB); renderer.render(qs, qc); src = rtB.texture;
      mark('dof');
    }
    quad.material = outMat; const o = outMat.uniforms;
    o.tC.value = src; o.tS.value = rtS.texture; o.uExp.value = exposure; o.uFrame.value = frame; o.uVig.value = vig; o.uFade.value = fade;
    renderer.setRenderTarget(null); renderer.render(qs, qc);
  }
  return { render };
}
