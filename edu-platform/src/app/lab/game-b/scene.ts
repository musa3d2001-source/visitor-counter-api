/**
 * مختبر فقط (المرحلة ٠، ليس كود إنتاج): مشهد three.js للاتجاه الفني ب «مرصد البلّور».
 * يُحمَّل كسولًا بـ import() من lab.tsx فلا يدخل three.js حزمة أي صفحة أخرى.
 *
 * الأسلوب: كتاب قصص بلّوري 2.5D.
 * - طبقات ساحل مقصوصة (ExtrudeGeometry بحواف مشطوفة) على أعماق مختلفة تعطي parallax حقيقيًا.
 * - ماء فيروزي زجاجي بمظلّل خاص: أشرطة cel، ولمعات أفقية، وانعكاس ذهبي للشروق والقناديل.
 * - MeshToonMaterial بثلاث درجات حادة + حافة ذهبية مضيئة (rim) بشريط cel مقصوص، وحدود قشرة مقلوبة.
 * - كاميرا منظورية مائلة قليلًا للأسفل، تنجرف ببطء وتتبع المؤشر (تتوقف مع prefers-reduced-motion).
 * لا نصوص داخل الـ canvas: كل النصوص في DOM فوقه.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export type SceneOpts = {
  angle: number;
  power: number;
  dawn: number;
  reducedMotion: boolean;
  quality: "high" | "low";
  onLayout?: (l: { horizon: number; camX: number }) => void;
};
export type SceneHandle = { setAim(angle: number, power: number): void; destroy(): void };

const C = {
  outline: 0x0a1230,
  navyFar: 0x1f3a78,
  navyMid: 0x174a6b,
  tealMid: 0x12606f,
  sand: 0xf2cf86,
  sandDeep: 0xd8a55e,
  rock: 0x3d5a8c,
  stone: 0x6684b4,
  teak: 0xc0763a,
  frond: 0xd8c174,
  cream: 0xf8ead0,
  turq: 0x19b8a6,
  turqDeep: 0x0b7f86,
  gold: 0xffc531,
  goldHi: 0xffe39a,
  brass: 0xe8a93a,
  cloud: 0xf3f0ff,
  lantern: 0xffd36b,
  rimGold: 0xffd27a,
  rimTurq: 0x7cf3e1,
};

const G = 9.8;
const PIVOT = new THREE.Vector3(7.6, 3.62, 0.62);
const BARREL = 2.05;

export function velocity(angle: number, power: number) {
  const v = 6 + power * 0.1;
  const r = (angle * Math.PI) / 180;
  return { vx: -Math.cos(r) * v, vy: Math.sin(r) * v };
}
function muzzle(angle: number) {
  const r = (angle * Math.PI) / 180;
  return new THREE.Vector3(PIVOT.x - Math.cos(r) * BARREL, PIVOT.y + Math.sin(r) * BARREL, PIVOT.z);
}
function pathAt(angle: number, power: number, t: number) {
  const m = muzzle(angle);
  const { vx, vy } = velocity(angle, power);
  return new THREE.Vector3(m.x + vx * t, m.y + vy * t - 0.5 * G * t * t, m.z);
}

/* ───────────── خامات ───────────── */

function canvasTex(draw: (g: CanvasRenderingContext2D, s: number) => void, size = 256, repeat?: [number, number]) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d")!;
  draw(g, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const teakTex = () =>
  canvasTex((g, s) => {
    g.fillStyle = "#c97d3f";
    g.fillRect(0, 0, s, s);
    const r = rng(7);
    for (let i = 0; i < 22; i++) {
      const y = r() * s;
      g.strokeStyle = r() > 0.5 ? "rgba(120,58,22,.55)" : "rgba(240,170,100,.45)";
      g.lineWidth = 2 + r() * 5;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(s * 0.3, y + (r() - 0.5) * 18, s * 0.7, y + (r() - 0.5) * 18, s, y);
      g.stroke();
    }
    g.fillStyle = "rgba(110,50,20,.6)";
    g.beginPath();
    g.ellipse(s * 0.7, s * 0.4, 14, 7, 0, 0, Math.PI * 2);
    g.fill();
  });

const frondTex = () =>
  canvasTex(
    (g, s) => {
      const n = 8;
      const c = s / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          g.fillStyle = (i + j) % 2 ? "#e2cc80" : "#b99b4c";
          g.fillRect(i * c, j * c, c, c);
          g.fillStyle = (i + j) % 2 ? "rgba(255,248,210,.55)" : "rgba(120,140,60,.35)";
          g.fillRect(i * c + 2, j * c + c * 0.15, c - 4, c * 0.18);
        }
      g.strokeStyle = "rgba(90,70,20,.45)";
      g.lineWidth = 2;
      for (let i = 0; i <= n; i++) {
        g.beginPath();
        g.moveTo(i * c, 0);
        g.lineTo(i * c, s);
        g.stroke();
      }
    },
    256,
    [3, 1],
  );

const stoneTex = () =>
  canvasTex((g, s) => {
    g.fillStyle = "#6c8aba";
    g.fillRect(0, 0, s, s);
    const r = rng(19);
    for (let i = 0; i < 46; i++) {
      g.fillStyle = r() > 0.55 ? "rgba(48,70,120,.5)" : "rgba(200,225,255,.45)";
      g.beginPath();
      g.arc(r() * s, r() * s, 3 + r() * 10, 0, Math.PI * 2);
      g.fill();
    }
  });

/** زجاج ملوّن: خلايا بألوان المنصة تفصلها خطوط رصاص داكنة */
const glassTex = () =>
  canvasTex((g, s) => {
    const cols = ["#27d3be", "#ffc531", "#ff7a5c", "#8c6cff", "#5bb8ff", "#ffe39a"];
    const r = rng(41);
    const cells = 5;
    const c = s / cells;
    const pts: [number, number][][] = [];
    for (let i = 0; i <= cells; i++) {
      pts.push([]);
      for (let j = 0; j <= cells; j++) {
        const edge = i === 0 || j === 0 || i === cells || j === cells;
        pts[i].push([i * c + (edge ? 0 : (r() - 0.5) * c * 0.6), j * c + (edge ? 0 : (r() - 0.5) * c * 0.6)]);
      }
    }
    for (let i = 0; i < cells; i++)
      for (let j = 0; j < cells; j++) {
        const q = [pts[i][j], pts[i + 1][j], pts[i + 1][j + 1], pts[i][j + 1]];
        g.fillStyle = cols[Math.floor(r() * cols.length)];
        g.beginPath();
        g.moveTo(q[0][0], q[0][1]);
        q.slice(1).forEach((p) => g.lineTo(p[0], p[1]));
        g.closePath();
        g.fill();
        g.fillStyle = "rgba(255,255,255,.28)";
        g.beginPath();
        g.moveTo(q[0][0] + 6, q[0][1] + 6);
        g.lineTo(q[0][0] + c * 0.35, q[0][1] + 6);
        g.lineTo(q[0][0] + 6, q[0][1] + c * 0.35);
        g.fill();
        g.strokeStyle = "#1a1d3a";
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(q[0][0], q[0][1]);
        q.slice(1).forEach((p) => g.lineTo(p[0], p[1]));
        g.closePath();
        g.stroke();
      }
  });

/** وجه صندوق الضوء: شعاع شمسي بسيط */
const lightTex = () =>
  canvasTex((g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s * 0.7);
    gr.addColorStop(0, "#fffbe6");
    gr.addColorStop(0.4, "#ffd75e");
    gr.addColorStop(1, "#f29b17");
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
    g.fillStyle = "rgba(255,255,255,.85)";
    for (let i = 0; i < 8; i++) {
      g.save();
      g.translate(s / 2, s / 2);
      g.rotate((i * Math.PI) / 4);
      g.beginPath();
      g.moveTo(-6, 0);
      g.lineTo(0, -s * 0.36);
      g.lineTo(6, 0);
      g.fill();
      g.restore();
    }
    g.strokeStyle = "#9a5a06";
    g.lineWidth = 14;
    g.strokeRect(7, 7, s - 14, s - 14);
  });

function glowTex(inner: string, mid: string) {
  return canvasTex((g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, inner);
    gr.addColorStop(0.3, mid);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  }, 128);
}

/* ───────────── toon + حافة ذهبية ───────────── */

let gradientMap: THREE.DataTexture | null = null;
function toonRamp() {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([92, 92, 92, 255, 176, 176, 176, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

type ToonOpts = {
  color: number;
  map?: THREE.Texture;
  rim?: number;
  rimStr?: number;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
};
function toon(o: ToonOpts) {
  const m = new THREE.MeshToonMaterial({
    color: o.color,
    gradientMap: toonRamp(),
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
  });
  if (o.map) m.map = o.map;
  if (o.transparent && o.map) m.emissiveMap = o.map;
  const rim = new THREE.Color(o.rim ?? C.rimGold);
  const rimStr = o.rimStr ?? 0.85;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = { value: rim };
    sh.uniforms.uRimStr = { value: rimStr };
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uRim;\nuniform float uRimStr;")
      .replace(
        "#include <opaque_fragment>",
        `{
          vec3 vd = normalize(vViewPosition);
          float f = 1.0 - abs(dot(normalize(normal), vd));
          float band = smoothstep(0.58, 0.63, f);
          float lit = clamp(normal.x * 0.55 + normal.y * 0.75 + 0.35, 0.0, 1.0);
          outgoingLight = mix(outgoingLight, outgoingLight + uRim, band * uRimStr * lit);
        }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => "farqad-b-rim";
  return m;
}

const outlineMat = new THREE.MeshBasicMaterial({ color: C.outline, side: THREE.BackSide });
function withOutline(mesh: THREE.Mesh, k = 0.05) {
  const o = new THREE.Mesh(mesh.geometry, outlineMat);
  const box = new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position as THREE.BufferAttribute);
  const size = box.getSize(new THREE.Vector3());
  o.scale.set(1 + k / Math.max(size.x, 0.1) * 2, 1 + k / Math.max(size.y, 0.1) * 2, 1 + k / Math.max(size.z, 0.1) * 2);
  o.renderOrder = -1;
  mesh.add(o);
  return mesh;
}

/* ───────────── أشكال مقصوصة ───────────── */

/** شريط ساحلي مقصوص: نقاط علوية (x,y) تُغلق إلى أسفل الماء */
function cutout(top: [number, number][], bottom: number, depth: number, mat: THREE.Material) {
  const sh = new THREE.Shape();
  sh.moveTo(top[0][0], bottom);
  sh.lineTo(top[0][0], top[0][1]);
  for (let i = 1; i < top.length; i++) {
    const [x0, y0] = top[i - 1];
    const [x1, y1] = top[i];
    sh.bezierCurveTo(x0 + (x1 - x0) * 0.45, y0, x0 + (x1 - x0) * 0.55, y1, x1, y1);
  }
  sh.lineTo(top[top.length - 1][0], bottom);
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, {
    depth,
    bevelEnabled: true,
    bevelSize: 0.14,
    bevelThickness: 0.14,
    bevelSegments: 2,
    curveSegments: 10,
  });
  return new THREE.Mesh(geo, mat);
}

function palm(h: number, lean: number, mat: THREE.Material) {
  const g = new THREE.Group();
  const trunk = new THREE.Shape();
  trunk.moveTo(-0.09, 0);
  trunk.quadraticCurveTo(lean * 0.5 - 0.06, h * 0.55, lean - 0.05, h);
  trunk.lineTo(lean + 0.05, h);
  trunk.quadraticCurveTo(lean * 0.5 + 0.06, h * 0.55, 0.09, 0);
  trunk.closePath();
  g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(trunk, { depth: 0.08, bevelEnabled: false }), mat));
  for (let i = 0; i < 6; i++) {
    const a = -0.2 + (i / 5) * (Math.PI + 0.4);
    const leaf = new THREE.Shape();
    const L = 0.9 + (i % 2) * 0.25;
    const ex = Math.cos(a) * L;
    const ey = Math.sin(a) * L * 0.55 - 0.18;
    leaf.moveTo(0, 0);
    leaf.quadraticCurveTo(ex * 0.5, ey * 0.5 + 0.28, ex, ey);
    leaf.quadraticCurveTo(ex * 0.5, ey * 0.5 + 0.06, 0, 0);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(leaf, { depth: 0.06, bevelEnabled: false }), mat);
    m.position.set(lean, h, 0.01);
    g.add(m);
  }
  return g;
}

/* ───────────── الماء الزجاجي ───────────── */

function water(dawn: number) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uFar: { value: new THREE.Color(0x1a3f80) },
      uMid: { value: new THREE.Color(0x0d6f8a) },
      uNear: { value: new THREE.Color(0x16a8a2) },
      uGold: { value: new THREE.Color(0xffc970) },
      uDawn: { value: dawn },
      uSunX: { value: 2.5 },
      uLamps: { value: [new THREE.Vector2(-4.6, 1.0), new THREE.Vector2(7.6, 0.55), new THREE.Vector2(-4.6, 0.7)] },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uFar; uniform vec3 uMid; uniform vec3 uNear; uniform vec3 uGold;
      uniform float uDawn; uniform float uSunX; uniform vec2 uLamps[3];
      varying vec3 vW;
      void main() {
        float d = clamp((vW.z + 44.0) / 52.0, 0.0, 1.0);
        vec3 col = d < 0.55 ? mix(uFar, uMid, d / 0.55) : mix(uMid, uNear, (d - 0.55) / 0.45);
        // أشرطة cel زجاجية تتسع كلما اقتربت
        float wave = sin(vW.x * 0.22 + uTime * 0.35) * 0.35;
        float bands = fract(pow(1.0 - d, 1.6) * 9.0 + wave);
        col = mix(col, col * 1.14 + vec3(0.015, 0.03, 0.03), step(0.62, bands) * 0.55);
        // لمعات أفقية بلّورية
        float gl = sin(vW.x * 1.3 + vW.z * 0.4 + uTime * 0.7) * sin(vW.z * 2.6 - uTime * 0.45 + vW.x * 0.2);
        col += vec3(0.8, 1.0, 0.97) * smoothstep(0.88, 0.92, gl) * (0.2 + 0.7 * d);
        // عمود ذهبي من الشروق
        float sw = 0.6 + (1.0 - d) * 5.0;
        float streak = step(0.45, fract(vW.z * 1.4 + sin(vW.x * 2.0 + uTime) * 0.15));
        float sun = exp(-pow((vW.x - uSunX) / sw, 2.0)) * (1.0 - d * 0.6) * uDawn * 1.8;
        col = mix(col, uGold, clamp(sun * streak, 0.0, 0.85));
        // انعكاس القناديل والمرقاب
        for (int i = 0; i < 3; i++) {
          float lx = exp(-pow((vW.x - uLamps[i].x) / 0.55, 2.0));
          float lz = smoothstep(-6.0, 1.0, vW.z) * (1.0 - smoothstep(1.0, 4.0, vW.z));
          float ls = step(0.5, fract(vW.z * 2.2 + sin(vW.x * 3.0 + uTime * 1.2) * 0.2));
          col = mix(col, uGold, clamp(lx * lz * ls * uLamps[i].y * 0.7, 0.0, 0.8));
        }
        // يعمق الماء قرب الكاميرا (عمق زجاجي) ويضيء قليلًا تحت الجزر
        col = mix(col, col * 0.72 + vec3(0.0, 0.03, 0.08), smoothstep(2.5, 8.0, vW.z));
        // حافة الأفق المضيئة
        col += vec3(0.25, 0.55, 0.6) * smoothstep(0.08, 0.0, d) * 0.6;
        gl_FragColor = vec4(col, 0.97);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(240, 130, 1, 1), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, 0, 21);
  return m;
}

/* ───────────── عناصر اللعب ───────────── */

function block(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z = 0, r = 0.08) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return withOutline(m, 0.05);
}

function lantern(glow: THREE.Texture, scale = 1) {
  const g = new THREE.Group();
  const body = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.0, -0.36),
      new THREE.Vector2(0.2, -0.34),
      new THREE.Vector2(0.27, -0.12),
      new THREE.Vector2(0.27, 0.14),
      new THREE.Vector2(0.18, 0.34),
      new THREE.Vector2(0.0, 0.36),
    ],
    18,
  );
  const glass = new THREE.Mesh(body, toon({ color: 0xfff1c2, emissive: C.lantern, emissiveIntensity: 1.05, rim: 0xffffff, rimStr: 0.6 }));
  g.add(withOutline(glass, 0.04));
  const brass = toon({ color: C.brass, rim: 0xfff4c9 });
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.2, 16), brass);
  cap.position.y = 0.44;
  g.add(withOutline(cap, 0.03));
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.1, 16), brass);
  base.position.y = -0.4;
  g.add(withOutline(base, 0.03));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 8, 16), brass);
  ring.position.y = 0.6;
  g.add(ring);
  for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.62, 0.03), brass);
    rib.position.set(Math.cos(a) * 0.255, 0, Math.sin(a) * 0.255);
    g.add(rib);
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
  halo.scale.setScalar(2.1);
  g.add(halo);
  g.scale.setScalar(scale);
  return g;
}

function cloudPuff(mat: THREE.Material) {
  const g = new THREE.Group();
  const puffs: [number, number, number, number][] = [
    [0, 0, 0, 0.42],
    [-0.42, -0.08, 0.05, 0.32],
    [0.42, -0.06, 0, 0.34],
    [-0.18, 0.3, 0, 0.3],
    [0.22, 0.26, 0.05, 0.28],
  ];
  for (const [x, y, z, r] of puffs) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat);
    s.position.set(x, y, z);
    s.castShadow = true;
    g.add(withOutline(s, 0.035));
  }
  g.scale.set(1.15, 0.95, 1);
  return g;
}

/* ───────────── المشهد ───────────── */

export async function createScene(canvas: HTMLCanvasElement, opts: SceneOpts): Promise<SceneHandle> {
  const low = opts.quality === "low";
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !low;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200);
  const disposables: { dispose(): void }[] = [];

  /* أضواء: مفتاح دافئ من الشروق، وتعبئة كحلية فيروزية */
  scene.add(new THREE.HemisphereLight(0xbfe8ff, 0x1a2a5a, 1.25));
  const key = new THREE.DirectionalLight(0xfff0d0, 2.3);
  key.position.set(8, 12, 10);
  key.castShadow = !low;
  key.shadow.mapSize.set(1024, 1024);
  const sc = key.shadow.camera;
  sc.left = -12;
  sc.right = 12;
  sc.top = 10;
  sc.bottom = -3;
  sc.near = 1;
  sc.far = 40;
  key.shadow.bias = -0.0015;
  scene.add(key);
  const back = new THREE.DirectionalLight(0x7cf3e1, 0.7);
  back.position.set(-8, 5, -8);
  scene.add(back);

  const tGlowGold = glowTex("rgba(255,244,200,1)", "rgba(255,197,49,.45)");
  const tGlowTurq = glowTex("rgba(230,255,250,1)", "rgba(46,220,200,.4)");
  const tTeak = teakTex();
  const tFrond = frondTex();
  const tStone = stoneTex();
  const tGlass = glassTex();
  const tLight = lightTex();
  disposables.push(tGlowGold, tGlowTurq, tTeak, tFrond, tStone, tGlass, tLight);

  /* الماء */
  const sea = water(opts.dawn);
  scene.add(sea);
  const seaMat = sea.material as THREE.ShaderMaterial;

  /* طبقات الساحل المقصوصة (parallax) */
  const farMat = toon({ color: C.navyFar, rim: C.rimTurq, rimStr: 0.55 });
  const far = new THREE.Group();
  far.add(cutout([[-70, 0.4], [-44, 2.6], [-34, 1.4], [-24, 2.0], [-17, 0.3]], -1, 1, farMat));
  far.add(cutout([[20, 0.3], [27, 1.7], [36, 1.1], [46, 3.0], [70, 0.6]], -1, 1, farMat));
  far.position.z = -34;
  scene.add(far);

  const midMat = toon({ color: C.tealMid, rim: C.rimGold, rimStr: 0.75 });
  const mid = new THREE.Group();
  mid.add(cutout([[-40, 0.2], [-30, 1.6], [-22, 1.1], [-16, 1.9], [-12, 0.2]], -1, 1.2, midMat));
  mid.add(cutout([[15, 0.2], [20, 1.4], [26, 0.9], [34, 2.2], [42, 0.3]], -1, 1.2, midMat));
  const palmMat = toon({ color: 0x0f4d5c, rim: C.rimGold, rimStr: 0.6 });
  for (const [x, h, l] of [
    [-27, 3.6, 0.5],
    [-25.4, 2.8, -0.4],
    [-18, 3.1, 0.3],
    [30.5, 3.3, -0.5],
    [33.2, 2.6, 0.35],
  ] as [number, number, number][]) {
    const p = palm(h, l, palmMat);
    p.position.set(x, x < 0 ? 1.4 : 1.6, 0.6);
    mid.add(p);
  }
  mid.position.z = -18;
  scene.add(mid);

  /* الجزيرة تحت البنية */
  const rockMat = toon({ color: 0x7b9cd6, map: tStone, rim: C.rimTurq, rimStr: 0.45 });
  const sandMat = toon({ color: C.sand, rim: 0xfff4c9, rimStr: 0.7 });
  const island = cutout([[-8.6, -0.1], [-7.6, 0.75], [-4.6, 0.9], [-1.4, 0.75], [-0.4, -0.1]], -1.5, 2.6, rockMat);
  island.position.z = -1.3;
  island.receiveShadow = true;
  scene.add(island);
  const cap = cutout([[-7.9, 0.55], [-6.6, 0.94], [-2.6, 0.94], [-1.2, 0.55]], 0.2, 2.2, sandMat);
  cap.position.z = -1.1;
  cap.receiveShadow = true;
  scene.add(cap);

  /* زبد أبيض فيروزي حول الجزيرة والرصيف (حلقات مسطحة بأسلوب كتاب القصص) */
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xd9fff8, transparent: true, opacity: 0.85, depthWrite: false });
  const foamMat2 = new THREE.MeshBasicMaterial({ color: 0x7cf3e1, transparent: true, opacity: 0.45, depthWrite: false });
  for (const [x, w] of [
    [-4.5, 4.6],
    [7.7, 2.9],
  ] as [number, number][]) {
    const f1 = new THREE.Mesh(new THREE.RingGeometry(1, 1.07, 64), foamMat);
    f1.rotation.x = -Math.PI / 2;
    f1.scale.set(w, 1.55, 1);
    f1.position.set(x, 0.03, 0);
    const f2 = new THREE.Mesh(new THREE.RingGeometry(1, 1.04, 64), foamMat2);
    f2.rotation.x = -Math.PI / 2;
    f2.scale.set(w * 1.13, 1.9, 1);
    f2.position.set(x, 0.02, 0);
    scene.add(f1, f2);
  }

  /* البنية: المواد الست */
  const stone = toon({ color: 0xffffff, map: tStone, rim: C.rimGold, rimStr: 0.8 });
  const teak = toon({ color: 0xffffff, map: tTeak, rim: C.rimGold, rimStr: 0.9 });
  const frond = toon({ color: 0xffffff, map: tFrond, rim: C.rimGold, rimStr: 0.8 });
  const glass = toon({ color: 0xffffff, map: tGlass, rim: 0xffffff, rimStr: 0.7, transparent: true, opacity: 0.82, emissive: 0xffffff, emissiveIntensity: 0.32 });
  const cloud = toon({ color: C.cloud, rim: C.rimTurq, rimStr: 0.9, emissive: 0x2a2060, emissiveIntensity: 0.25 });
  const lightMat = toon({ color: 0xffffff, map: tLight, emissive: 0xffffff, emissiveIntensity: 0.55, rim: 0xffffff, rimStr: 0.5 });
  lightMat.emissiveMap = tLight;

  const Y0 = 1.08;
  const S = new THREE.Group();
  S.add(block(1.0, 1.1, 1.3, stone, -6.25, Y0 + 0.55));
  S.add(block(1.0, 1.1, 1.3, stone, -2.95, Y0 + 0.55));
  S.add(block(4.4, 0.36, 1.3, teak, -4.6, Y0 + 1.28));
  S.add(block(0.34, 1.6, 1.2, glass, -6.45, Y0 + 2.26));
  S.add(block(0.34, 1.6, 1.2, glass, -2.75, Y0 + 2.26));
  const pane = block(3.2, 1.5, 0.12, glass, -4.6, Y0 + 2.22, -0.5, 0.04);
  S.add(pane);
  S.add(block(4.4, 0.3, 1.3, frond, -4.6, Y0 + 3.21));
  // الطابق العلوي: قائمتان من الساج وغطاء سعف، غيمة يسارًا وصندوق ضوء يمينًا
  S.add(block(0.26, 1.0, 0.9, teak, -5.15, Y0 + 3.86));
  S.add(block(0.26, 1.0, 0.9, teak, -4.05, Y0 + 3.86));
  S.add(block(1.7, 0.26, 1.0, frond, -4.6, Y0 + 4.49));
  const cl = cloudPuff(cloud);
  cl.position.set(-6.3, Y0 + 3.92, 0);
  S.add(cl);
  const lb = block(0.86, 0.86, 0.86, lightMat, -3.05, Y0 + 3.79, 0, 0.06);
  S.add(lb);
  const lbHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tGlowGold, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.75 }));
  lbHalo.scale.setScalar(2.4);
  lbHalo.position.set(-3.05, Y0 + 3.79, 0.5);
  S.add(lbHalo);
  scene.add(S);

  /* القناديل: اثنان محبوسان وثالث يصعد نجمًا */
  const L1 = lantern(tGlowGold, 0.95);
  L1.position.set(-4.6, Y0 + 0.46, 0.15);
  const L2 = lantern(tGlowGold, 0.95);
  L2.position.set(-4.6, Y0 + 2.04, 0.15);
  const L3 = lantern(tGlowGold, 0.62);
  L3.position.set(-1.0, 7.9, 0);
  scene.add(L1, L2, L3);
  const riseDots: THREE.Sprite[] = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tGlowGold, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.25 + t * 0.5 }));
    s.position.set(-4.4 + (L3.position.x + 4.4) * t + Math.sin(t * 5) * 0.35, 6.2 + (L3.position.y - 0.6 - 6.2) * t, 0);
    s.scale.setScalar(0.28 + t * 0.25);
    scene.add(s);
    riseDots.push(s);
  }

  /* المِرقاب */
  const obs = new THREE.Group();
  const pier = cutout([[5.2, -0.1], [5.9, 1.05], [7.6, 1.35], [9.4, 1.1], [10.2, -0.1]], -1.5, 2.6, rockMat);
  pier.position.z = -1.3;
  obs.add(pier);
  const cream = toon({ color: C.cream, rim: C.rimGold, rimStr: 0.9 });
  const turq = toon({ color: C.turq, rim: C.rimGold, rimStr: 1 });
  const goldM = toon({ color: C.gold, rim: 0xffffff, rimStr: 0.7, emissive: 0x5a3a00, emissiveIntensity: 0.25 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, 2.1, 32), cream);
  tower.position.set(7.6, 1.35 + 1.05, 0);
  tower.castShadow = tower.receiveShadow = true;
  obs.add(withOutline(tower, 0.04));
  for (const y of [1.55, 3.3]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(y > 2 ? 0.95 : 1.07, y > 2 ? 0.97 : 1.09, 0.16, 32), turq);
    band.position.set(7.6, y, 0);
    obs.add(band);
  }
  const door = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x1a2350 }));
  door.position.set(7.6, 1.85, 1.07);
  const doorBody = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), door.material);
  doorBody.position.set(7.6, 1.62, 1.07);
  obs.add(door, doorBody);
  const win = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), new THREE.MeshBasicMaterial({ color: C.goldHi }));
  win.position.set(7.6, 2.72, 0.97);
  obs.add(win);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.0, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), turq);
  dome.position.set(7.6, 3.38, 0);
  dome.castShadow = true;
  obs.add(withOutline(dome, 0.04));
  for (let i = -2; i <= 2; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(1.005, 0.025, 6, 32, Math.PI), goldM);
    rib.position.copy(dome.position);
    rib.rotation.y = (i * Math.PI) / 7;
    obs.add(rib);
  }
  // البلّورة: ثماني أوجه فيروزي يطفو فوق القبة (هوية الاتجاه)
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.34, 0),
    toon({ color: 0x9ff7ea, emissive: 0x2fd2bf, emissiveIntensity: 0.55, rim: 0xffffff, rimStr: 1 }),
  );
  crystal.position.set(7.6, 4.85, 0);
  crystal.scale.set(0.8, 1.25, 0.8);
  obs.add(withOutline(crystal, 0.03));
  const crystalHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tGlowTurq, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
  crystalHalo.scale.setScalar(1.8);
  crystalHalo.position.copy(crystal.position);
  obs.add(crystalHalo);

  // المنظار المُطلِق
  const barrel = new THREE.Group();
  barrel.position.copy(PIVOT);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, BARREL + 0.4, 24), goldM);
  tube.position.y = BARREL / 2 - 0.1;
  barrel.add(withOutline(tube, 0.04));
  for (const y of [0.35, 1.1, BARREL - 0.12]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.14, 24), turq);
    ring.position.y = y;
    barrel.add(ring);
  }
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshBasicMaterial({ color: 0xc9fff6 }));
  lens.position.y = BARREL + 0.105;
  lens.rotation.x = -Math.PI / 2;
  barrel.add(lens);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.38, 20, 14), goldM);
  barrel.add(withOutline(hub, 0.03));
  obs.add(barrel);
  scene.add(obs);

  /* الشهاب في الطيران: نواة بلّورية + هالة + ذيل شريطي */
  const shot = { angle: 37, power: 68, t: 0.6 };
  const meteor = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.34, 0),
    toon({ color: 0xfff6d8, emissive: 0xffd45a, emissiveIntensity: 0.85, rim: 0xffffff, rimStr: 1 }),
  );
  meteor.add(withOutline(core, 0.03));
  const mHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tGlowGold, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  mHalo.scale.setScalar(2.4);
  meteor.add(mHalo);
  meteor.position.copy(pathAt(shot.angle, shot.power, shot.t));
  scene.add(meteor);

  const TRAIL = 28;
  const trailGeo = new THREE.BufferGeometry();
  const trailPos = new Float32Array(TRAIL * 2 * 3);
  const trailCol = new Float32Array(TRAIL * 2 * 4);
  const idx: number[] = [];
  for (let i = 0; i < TRAIL - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  trailGeo.setIndex(idx);
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute("color", new THREE.BufferAttribute(trailCol, 4));
  const trail = new THREE.Mesh(
    trailGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  scene.add(trail);
  const gold = new THREE.Color(0xffd45a);
  const tq = new THREE.Color(0x3fe6d2);
  function buildTrail(tHead: number) {
    const span = 0.42;
    for (let i = 0; i < TRAIL; i++) {
      const k = i / (TRAIL - 1); // 0 رأس، 1 ذيل
      const t = Math.max(0, tHead - k * span);
      const p = pathAt(shot.angle, shot.power, t);
      const p2 = pathAt(shot.angle, shot.power, Math.max(0, t - 0.01));
      const dir = new THREE.Vector2(p.x - p2.x, p.y - p2.y).normalize();
      const w = 0.3 * (1 - k) + 0.02;
      const nx = -dir.y * w;
      const ny = dir.x * w;
      trailPos.set([p.x + nx, p.y + ny, p.z, p.x - nx, p.y - ny, p.z], i * 6);
      const c = gold.clone().lerp(tq, Math.min(1, k * 1.6));
      const a = (1 - k) * 0.9;
      trailCol.set([c.r, c.g, c.b, a, c.r, c.g, c.b, a], i * 8);
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.color.needsUpdate = true;
    trailGeo.computeBoundingSphere();
  }
  buildTrail(shot.t);
  const sparks: THREE.Sprite[] = [];
  const sr = rng(5);
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tGlowTurq, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
    const t = shot.t - 0.05 - sr() * 0.3;
    const p = pathAt(shot.angle, shot.power, t);
    s.position.set(p.x + (sr() - 0.5) * 0.5, p.y + (sr() - 0.5) * 0.5, p.z);
    s.scale.setScalar(0.18 + sr() * 0.22);
    scene.add(s);
    sparks.push(s);
  }

  /* دليل التصويب الجزئي (النقاط الأولى من القوس فقط) */
  const GUIDE = 9;
  const guide: THREE.Mesh[] = [];
  const dotGeo = new THREE.CircleGeometry(0.11, 16);
  for (let i = 0; i < GUIDE; i++) {
    const m = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xfff4c9, transparent: true, opacity: 1 - i / GUIDE, depthWrite: false }));
    scene.add(m);
    guide.push(m);
  }
  let aim = { angle: opts.angle, power: opts.power };
  function placeAim() {
    barrel.rotation.z = Math.PI / 2 - (aim.angle * Math.PI) / 180;
    for (let i = 0; i < GUIDE; i++) {
      const p = pathAt(aim.angle, aim.power, 0.07 + i * 0.055);
      guide[i].position.set(p.x, p.y, p.z + 0.05);
      guide[i].scale.setScalar(1 - i * 0.06);
    }
  }
  placeAim();

  /* الكاميرا: ملاءمة العرض حسب النسبة، ثم ميل وانجراف */
  const size = { w: 1, h: 1 };
  const cam = { dist: 30, baseY: 3, baseX: 1, px: 0, py: 0 };
  const FOV = 30;
  function layout() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    size.w = w;
    size.h = h;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    const tan = Math.tan(((FOV / 2) * Math.PI) / 180);
    const portrait = aspect < 0.8;
    const needW = portrait ? 19.4 : 21.8;
    const needH = portrait ? 12 : 13.6;
    cam.dist = Math.max(needW / 2 / (tan * aspect), needH / 2 / tan);
    const H = 2 * cam.dist * tan;
    // خط الماء على نسبة ثابتة من أعلى الشاشة (يترك أسفلها للوحة التصويب)
    const waterAt = portrait ? (aspect < 0.55 ? 0.62 : 0.68) : 0.72;
    cam.baseY = (waterAt - 0.5) * H;
    cam.baseX = portrait ? 0.9 : 0.8;
    camera.updateProjectionMatrix();
  }

  const target = new THREE.Vector3();
  const horizonP = new THREE.Vector3();
  let lastReported = "";
  function placeCamera(time: number) {
    const drift = opts.reducedMotion ? 0 : Math.sin(time * 0.00045) * 0.45;
    const x = cam.baseX + drift + cam.px * 0.9;
    const y = cam.baseY + cam.py * 0.3;
    camera.position.set(x + 1.4, y + cam.dist * 0.13, cam.dist);
    target.set(x, y, 0);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    horizonP.set(x, 0, -44).project(camera);
    const horizon = (1 - horizonP.y) / 2;
    const rep = `${horizon.toFixed(3)}|${x.toFixed(2)}`;
    if (rep !== lastReported) {
      lastReported = rep;
      opts.onLayout?.({ horizon, camX: x });
    }
  }

  const onPointer = (e: PointerEvent) => {
    cam.px = (e.clientX / window.innerWidth - 0.5) * 2;
    cam.py = (e.clientY / window.innerHeight - 0.5) * 2;
    if (opts.reducedMotion) frame(performance.now());
  };
  if (!opts.reducedMotion) window.addEventListener("pointermove", onPointer, { passive: true });

  let raf = 0;
  let running = true;
  function frame(now: number) {
    const t = now / 1000;
    if (!opts.reducedMotion) {
      seaMat.uniforms.uTime.value = t;
      crystal.rotation.y = t * 0.6;
      crystal.position.y = 4.85 + Math.sin(t * 1.3) * 0.06;
      crystalHalo.position.y = crystal.position.y;
      L3.position.y = 7.9 + Math.sin(t * 0.9) * 0.12;
      core.rotation.set(t * 1.4, t * 0.9, 0);
      mHalo.material.opacity = 0.85 + Math.sin(t * 2.2) * 0.1; // نبض ناعم بلا وميض (< ١ هرتز)
      cl.position.y = Y0 + 3.92 + Math.sin(t * 1.1) * 0.03;
    }
    placeCamera(now);
    renderer.render(scene, camera);
  }
  function loop(now: number) {
    if (!running) return;
    frame(now);
    if (!opts.reducedMotion) raf = requestAnimationFrame(loop);
  }

  layout();
  const ro = new ResizeObserver(() => {
    layout();
    frame(performance.now());
  });
  ro.observe(canvas);
  const onVis = () => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
    } else if (!running) {
      running = true;
      raf = requestAnimationFrame(loop);
    }
  };
  document.addEventListener("visibilitychange", onVis);
  raf = requestAnimationFrame(loop);

  return {
    setAim(angle, power) {
      aim = { angle, power };
      placeAim();
      if (opts.reducedMotion) frame(performance.now());
    },
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVis);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    },
  };
}
