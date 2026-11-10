// TASH launch ad — built shot «مجوهرات · JEWELLERY»: a heavy 21K-style gold band with an engraved
// geometric (khatam-star) frieze and a bezel-set brilliant, floating over a deep emerald velvet ground.
// Pure function of t. Rendered to footage by render.mjs and cut into the launch ad (match cut: cup rim → ring).
// URL: ?d=<camera distance> ?cx=<px> ?cy=<px> (screen position of the ring centre at t=0)
import * as THREE from 'three';
import { boot, E, clamp, lerp } from '/_system/motion/kit.js';

const q = new URLSearchParams(location.search);
const W = 1080, H = 1920, DUR = 1.8;
// match-cut handoff: at t=0 the band's outer edge sits exactly on the cup rim of the previous shot, then settles to
// the hero framing with an expo tail. Rim = the photoreal HABBA exit frame (clean f208, launch 5.967), least-squares
// fit of the cup's outer lip: centre 524,654 · r ≈ 310 px (HABBA hand-off: ≈ 518,658 · r ≈ 312). This is the hand-off's
// "RING ×0.80, moved ≈ (−46, +98)" done in the ring's own camera, so the plate stays full-frame and sharp.
// (v1, CGI HABBA: centre 560,570 · r 390.)
const A = { cx: 524, cy: 654, r: 310 }, B = { cx: 540, cy: 800, r: 318 };
const PXU = 1920 / (2 * Math.tan(THREE.MathUtils.degToRad(15))); // px per world unit at distance 1 (fov 30)

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.45;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 80);

// ------------------------------------------------------------------ studio (emissive strips → PMREM)
const env = new THREE.Scene(); env.background = new THREE.Color(0.055, 0.05, 0.042); // dim warm dome: gold never reflects pure black
const soft = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.2, '#fff'); g.addColorStop(0.8, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 256);
  x.globalCompositeOperation = 'destination-in';
  const h = x.createLinearGradient(0, 0, 0, 256); h.addColorStop(0, 'rgba(0,0,0,0)'); h.addColorStop(0.1, '#000'); h.addColorStop(0.9, '#000'); h.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = h; x.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
})();
const strips = {};
function strip(name, w, h, pos, col, I) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...col).multiplyScalar(I), side: THREE.DoubleSide, map: soft }));
  m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m); strips[name] = m; return m;
}
strip('keyL', 1.4, 14, [-7, 2, 6], [1, 0.99, 0.96], 7.0);
strip('front', 7, 3.5, [1.5, 3, 11], [1, 1, 0.98], 1.8);
strip('keyR', 0.6, 14, [7.5, 1, 5], [1, 1, 1], 4.5);
strip('top', 8, 2.2, [0, 9, 2], [1, 1, 0.98], 2.6);
strip('rimL', 0.5, 12, [-6, 1, -6], [0.55, 1, 0.8], 2.2);
strip('rimR', 0.9, 12, [6, 0, -5], [1, 0.97, 0.9], 3.5);
strip('low', 10, 0.5, [0, -6, 5], [1, 0.98, 0.94], 1.6);
strip('sweep', 0.35, 16, [0, 0, 9], [1, 0.96, 0.9], 9.0);
const pmrem = new THREE.PMREMGenerator(renderer); pmrem.compileCubemapShader();
let envRT = null;
function bakeEnv(sweepX) {
  strips.sweep.position.set(sweepX, 0, 9); strips.sweep.lookAt(0, 0, 0); strips.sweep.rotateZ(0.32);
  const rt = pmrem.fromScene(env, 0, 0.1, 60, { size: 512 });
  if (envRT) envRT.dispose(); envRT = rt; return rt.texture;
}

// ------------------------------------------------------------------ ground: deep emerald velvet (client palette)
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShaderMaterial({
  uniforms: { uC: { value: new THREE.Vector2(0.5, 0.56) }, uT: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `varying vec2 vUv; uniform vec2 uC; uniform float uT;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 p = vUv - uC; p.y *= 0.62;
      float r = length(p) * 7.0;
      vec3 c0 = vec3(0.020, 0.090, 0.068), c1 = vec3(0.004, 0.014, 0.011);
      vec3 c = mix(c0, c1, smoothstep(0.0, 1.0, r));
      // velvet nap: faint low-frequency sheen drifting with the light
      c *= 0.92 + 0.08 * sin(vUv.x * 40.0 + vUv.y * 13.0 + uT * 0.6) * sin(vUv.y * 31.0 - uT * 0.4);
      c += (h(gl_FragCoord.xy) - 0.5) / 255.0 * 1.5; // dither (no banding on the dark ground)
      gl_FragColor = vec4(c, 1.0);
    }`,
  depthWrite: false,
}));
ground.position.set(0, 0, -9); scene.add(ground);

// ------------------------------------------------------------------ engraving (bump) texture
const N_IN = 18, N_ARC = 12, N_OUT = 48;
function profile() { // closed comfort-fit band section in (radius, axial) — index-controlled so v maps to faces
  const ri = 0.80, ro = 1.0, hw = 0.20, rc = 0.07, pts = [];
  for (let i = 0; i < N_IN; i++) { const k = i / (N_IN - 1); pts.push(new THREE.Vector2(ri + 0.012 * Math.sin(k * Math.PI), lerp(-hw + 0.02, hw - 0.02, k))); }
  for (let i = 1; i <= N_ARC; i++) { const a = Math.PI + (i / N_ARC) * (Math.PI / 2); pts.push(new THREE.Vector2(ri + 0.02 + 0.03 * (1 + Math.cos(a)) , hw - rc + rc * Math.sin(a + Math.PI))); }
  // outer face (slightly domed), top → bottom
  const top = pts[pts.length - 1];
  for (let i = 0; i < N_OUT; i++) { const k = i / (N_OUT - 1); const y = lerp(hw - 0.005, -hw + 0.005, k); pts.push(new THREE.Vector2(ro - 0.035 * (2 * Math.abs(k - 0.5)) ** 2.2, y)); }
  for (let i = 1; i <= N_ARC; i++) { const k = i / N_ARC; pts.push(new THREE.Vector2(lerp(ro - 0.035, ri + 0.012, E.inOutSine(k)), -hw + 0.005 - 0.015 * Math.sin(k * Math.PI))); }
  pts.push(pts[0].clone());
  return pts;
}
const PTS = profile();
const V0 = (N_IN + N_ARC) / (PTS.length - 1), V1 = (N_IN + N_ARC + N_OUT - 1) / (PTS.length - 1);
function engraving() {
  const Wc = 4096, Hc = 512, c = document.createElement('canvas'); c.width = Wc; c.height = Hc; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, Wc, Hc);
  // texture v runs bottom→top in canvas space (flipY): row = (1 - v) * Hc
  const yTop = (1 - V1) * Hc, yBot = (1 - V0) * Hc, mid = (yTop + yBot) / 2, band = (yBot - yTop) * 0.40;
  x.strokeStyle = '#000'; x.lineCap = 'round'; x.lineJoin = 'round';
  // two fine borders
  x.lineWidth = 3; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(0, mid + s * band * 1.08); x.lineTo(Wc, mid + s * band * 1.08); x.stroke(); }
  // khatam frieze: 8-point stars joined by a running lattice
  const n = 22, step = Wc / n, R = band * 0.92;
  x.lineWidth = 4;
  for (let i = 0; i < n; i++) {
    const cx = (i + 0.5) * step;
    const star = (r, rot) => { x.beginPath(); for (let k = 0; k < 4; k++) { const a = rot + k * Math.PI / 2; x.moveTo(cx + r * Math.cos(a) , mid + r * Math.sin(a)); } };
    for (const rot of [0, Math.PI / 4]) { x.beginPath(); for (let k = 0; k <= 4; k++) { const a = rot + k * Math.PI / 2; const px = cx + R * Math.cos(a) * 0.72, py = mid + R * Math.sin(a) * 0.72; k ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); x.stroke(); }
    x.beginPath(); x.arc(cx, mid, R * 0.22, 0, Math.PI * 2); x.stroke();
    // lattice to the next star
    x.beginPath(); x.moveTo(cx + R * 0.72, mid); x.lineTo(cx + step / 2, mid - R * 0.55); x.lineTo(cx + step - R * 0.72, mid); x.lineTo(cx + step / 2, mid + R * 0.55); x.closePath(); x.stroke();
  }
  // soften so the bump reads as a cut, not as aliasing
  const b = document.createElement('canvas'); b.width = Wc; b.height = Hc; const bx = b.getContext('2d'); bx.filter = 'blur(1.6px)'; bx.drawImage(c, 0, 0);
  const t = new THREE.CanvasTexture(b); t.colorSpace = THREE.NoColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------ the ring
const gold = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#ffdc86'), metalness: 1, roughness: 0.16, envMapIntensity: 1.0, bumpMap: engraving(), bumpScale: 1.6 });
const ring = new THREE.Group(); scene.add(ring);
const band = new THREE.Mesh(new THREE.LatheGeometry(PTS, 320), gold);
band.rotation.x = Math.PI / 2; // lathe axis (Y) → toward the camera: the band reads as a circle face-on
ring.add(band);
// bezel cup + the stone at 12 o'clock
const bezel = new THREE.Mesh(new THREE.LatheGeometry([
  new THREE.Vector2(0.001, -0.06), new THREE.Vector2(0.12, -0.06), new THREE.Vector2(0.235, 0.12), new THREE.Vector2(0.255, 0.20),
  new THREE.Vector2(0.245, 0.235), new THREE.Vector2(0.222, 0.225), new THREE.Vector2(0.20, 0.18), new THREE.Vector2(0.001, 0.15),
], 96), new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#ffdc86'), metalness: 1, roughness: 0.14 }));
bezel.position.set(0, 0.95, 0); ring.add(bezel);
const gemPts = [[0.0005, -0.17], [0.11, -0.085], [0.212, -0.004], [0.214, 0.012], [0.17, 0.055], [0.12, 0.082], [0.0005, 0.082]].map(([a, b]) => new THREE.Vector2(a, b));
const gemGeo = new THREE.LatheGeometry(gemPts, 16).toNonIndexed(); gemGeo.computeVertexNormals();
// emerald brilliant (the client's green): mirror facets (each facet catches or misses a strip → sparkle) + thin-film fire; no transmission
// (transmission would only refract the dark set behind it and read as a hole)
const gem = new THREE.Mesh(gemGeo, new THREE.MeshPhysicalMaterial({
  color: new THREE.Color('#57e0b0'), metalness: 1, roughness: 0.0, envMapIntensity: 2.8, flatShading: true,
  iridescence: 0.9, iridescenceIOR: 1.8, iridescenceThicknessRange: [200, 700],
}));
gem.position.set(0, 0.95 + 0.205, 0); gem.scale.setScalar(1.12); ring.add(gem);
// glossy dark floor: the mirrored ring under a tinted plane (cheap planar reflection) + a soft contact pool
const FLOOR_Y = -0.99; // the band stands on the floor (its reflection touches it)
const refl = ring.clone(true); refl.scale.y = -1; scene.add(refl);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `varying vec3 vW;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      // lacquer-dark mirror (≈25% reflection) in front of and under the ring; dissolves into the backdrop far behind it,
      // so there is no hard horizon line (fade by depth behind the ring, not by distance: at this grazing angle the
      // floor pixels that cover the reflection lie close to the camera)
      float a = smoothstep(-8.5, -1.5, vW.z) * mix(0.80, 0.985, smoothstep(-0.6, 3.2, vW.z)); // deeper reflection → fainter
      vec3 c = vec3(0.006, 0.026, 0.020);
      c += (h(gl_FragCoord.xy) - 0.5) / 255.0 * 1.5;
      gl_FragColor = vec4(c, a);
    }`,
}));
floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y; scene.add(floor);
// a soft warm key so the frieze cuts read even where the env is dark
const key = new THREE.DirectionalLight(0xfff0d8, 1.2); key.position.set(-3, 4, 6); scene.add(key);

// ------------------------------------------------------------------ shot
function shot(t) {
  const k = clamp(t / DUR);
  // the band arrives face-on (match cut from the cup rim) and turns into a 3/4: cruise with a soft head, no stop
  const yaw = lerp(THREE.MathUtils.degToRad(-6), THREE.MathUtils.degToRad(44), 0.18 * k + 0.82 * E.outQuad(k));
  const roll = THREE.MathUtils.degToRad(lerp(0, -9, E.inOutSine(k)));
  ring.rotation.set(THREE.MathUtils.degToRad(lerp(4, 12, k)), yaw, roll);
  refl.rotation.set(-ring.rotation.x, ring.rotation.y, -ring.rotation.z); refl.position.y = 2 * FLOOR_Y;
  const s = E.outExpo(clamp(t / 0.55));
  const rpx = Math.exp(lerp(Math.log(A.r), Math.log(B.r), s)) * (1 + 0.05 * clamp((t - 0.3) / 1.5)); // + slow creep
  const cx = lerp(A.cx, B.cx, s), cy = lerp(A.cy, B.cy, s);
  const d = PXU / rpx;
  // place the ring centre at (cx, cy) on screen with a lens shift (verticals stay straight)
  camera.position.set(0, 0, d); camera.lookAt(0, 0, 0);
  camera.setViewOffset(W, H, -(cx - W / 2), -(cy - H / 2), W, H);
  ground.material.uniforms.uT.value = t;
  scene.environment = bakeEnv(lerp(7, -7, E.inOutSine(clamp((t - 0.1) / 1.5))));
}

async function seek(t) { shot(t); renderer.render(scene, camera); }
boot({ width: W, height: H, fps: 30, duration: DUR, seek });
