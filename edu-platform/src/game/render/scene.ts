/**
 * مشهد «فانوس الخليج» بـ three.js (PLAN.md §2، GAME_DESIGN.md §1): ليل على ساحل الكويت يتدرج إلى الشروق،
 * وكاميرا خلف المرقاب تتبع القذيفة ثم تشاهد الانهيار ثم تعود (ARCHITECTURE.md §1.9).
 * يقرأ لقطة المحاكاة وأحداث الكسر و isFreed فقط ولا يكتب فيها، فالجودة والشظايا والفجر لا تمس الفيزياء ولا البصمة.
 * draw calls ثابتة مهما زادت الأجسام: InstancedMesh لكل خامة، وواحدة للشظايا، ونظاما جسيمات،
 * والزينة الثابتة مدموجة في هندسة واحدة. المخازن تُخصَّص مرة واحدة وتكبر عند الحاجة فقط.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { aimAngles, aimVelocity } from "../core/aim-table";
import { AMMO, type AmmoKey } from "../core/ammo";
import { MATERIALS, type MaterialKey } from "../core/materials";
import { rngStreams } from "../core/rng";
import type { BreakEvent, Sim } from "../core/sim";
import { BOUNDS, DT, GRAVITY, ISLAND, LAUNCH } from "../core/world";
import {
  coralTexture,
  createParticles,
  createShards,
  discTexture,
  dotTexture,
  frondTexture,
  guideDotTexture,
  lightboxTexture,
  sandTexture,
  sparkleGeometry,
  stainedGlassTexture,
  teakTexture,
  toonGradient,
} from "./effects";
import { AMMO_COLORS, BRAND, LANTERN, MATERIAL_COLORS, NIGHT, STAINED, SUNRISE, TWILIGHT, type SkyStop } from "./style";

export type Quality = "high" | "low";

export type SceneOptions = {
  quality: Quality;
  reducedMotion: boolean;
  /** عدد نقاط دليل التصويب (من rules/guidePoints) */
  guidePoints: number;
  /** بذرة تيار العرض (rngStreams(seed).view): لا يشارك المحاكاة حالة */
  seed: number;
  /** تقدم الفجر الابتدائي 0..1 */
  dawn?: number;
};

export type SceneInfo = { drawCalls: number; triangles: number; shards: number; particles: number; quality: Quality; dpr: number };

export type GameScene = ReturnType<typeof createScene>;

type CamMode = "aim" | "follow" | "watch";

const SEA_Y = -0.55;
const SHARD_CAP = 420;
const GUIDE_MAX = 64;
/** نقطة دليل كل 3 خطوات محاكاة (1/20 ثانية) */
const GUIDE_EVERY = 3;
/** تخميد القذيفة الخطي في sim (للدليل فقط، تقريب للعرض بلا ارتداد) */
const PROJECTILE_DAMPING = 0.02;
/** زمن صعود القنديل المحرَّر إلى مكانه في الكوكبة */
const STAR_RISE_S = 2.4;
const MAT_KEYS: readonly MaterialKey[] = ["frond", "teak", "stone", "glass", "cloud", "lightbox"];
/** فهارس طبقات InstancedMesh (عدّادات Int32Array بدل Map في كل إطار) */
const L_LANTERN_CORE = 6;
const L_LANTERN_CAGE = 7;
const L_PROJECTILE = 8;
const LAYER_COUNT = 9;

/* ───────────── ألوان الفجر: محطات محوّلة مرة واحدة إلى THREE.Color ───────────── */
const COLOR_KEYS = ["skyTop", "skyMid", "horizon", "horizonGlow", "fog", "sea", "hemiSky", "hemiGround", "key", "rim", "skyline"] as const;
const NUM_KEYS = ["hemiIntensity", "keyIntensity", "rimIntensity", "exposure", "night"] as const;
type ColorKey = (typeof COLOR_KEYS)[number];
type NumKey = (typeof NUM_KEYS)[number];
type Stop = { c: Record<ColorKey, THREE.Color>; n: Record<NumKey, number> };

function toStop(s: SkyStop): Stop {
  const c = {} as Record<ColorKey, THREE.Color>;
  for (const k of COLOR_KEYS) c[k] = new THREE.Color(s[k]);
  const n = {} as Record<NumKey, number>;
  for (const k of NUM_KEYS) n[k] = s[k];
  return { c, n };
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** مولد ثابت البذرة للزينة (الشكل نفسه في كل تشغيل) */
function lcg(seed: number) {
  let k = seed;
  return () => {
    k = (k * 16807) % 2147483647;
    return k / 2147483647;
  };
}

/** هندسة ملوّنة بالرؤوس (للدمج في draw call واحدة) */
function tinted(geo: THREE.BufferGeometry, color: string, m: THREE.Matrix4) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.applyMatrix4(m);
  const c = new THREE.Color(color);
  const n = g.getAttribute("position").count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "color") g.deleteAttribute(k);
  return g;
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!g) throw new Error("mergeGeometries failed");
  return g;
}

/** الزينة الثابتة: صخور مرجانية، ونخيل بسعف متدلٍّ، ومصطبة المرصد بألوان المنصة — هندسة واحدة */
function decorGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const rnd = lcg(11);
  // صخور مرجانية على حافة الجزيرة
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const r = 1 + rnd() * 0.15;
    p.set(Math.cos(a) * (ISLAND.hx + 0.45) * r, -0.32 + rnd() * 0.22, Math.sin(a) * (ISLAND.hz + 0.45) * r);
    e.set(rnd() * 3, rnd() * 3, rnd() * 3);
    q.setFromEuler(e);
    const sc = 0.5 + rnd() * 0.7;
    s.set(sc * 1.4, sc, sc * 1.2);
    m.compose(p, q, s);
    parts.push(tinted(new THREE.IcosahedronGeometry(0.6, 0), BRAND.coral[i % BRAND.coral.length], m));
  }
  // نخيل: جذع منحنٍ قليلًا، وسعف من قطعتين (صاعدة ثم متدلية)، وعذق صغير
  for (const [x, z, h, lean] of [
    [-7.6, -5.4, 3.6, 0.12],
    [7.8, -4.6, 3.1, -0.1],
    [-8.2, 3.6, 2.7, 0.08],
    [8.4, 4.4, 3.3, -0.12],
  ] as const) {
    const segs = 6;
    for (let j = 0; j < segs; j++) {
      const t = (j + 0.5) / segs;
      p.set(x + lean * t * t * h, (j + 0.5) * (h / segs), z);
      m.compose(p, q.identity(), s.set(1 - t * 0.25, 1, 1 - t * 0.25));
      parts.push(tinted(new THREE.CylinderGeometry(0.15, 0.19, h / segs - 0.03, 7), j % 2 ? BRAND.palmTrunk : "#b07a45", m));
    }
    const cx = x + lean * h;
    const top = h + 0.05;
    for (let f = 0; f < 7; f++) {
      const a = (f / 7) * Math.PI * 2 + rnd() * 0.3;
      const leaf = f % 2 ? BRAND.palmLeaf : BRAND.palmLeafHi;
      // القطعة الداخلية تصعد قليلًا
      e.set(-0.35, a, 0, "YXZ");
      q.setFromEuler(e);
      p.set(cx + Math.sin(a) * 0.55, top + 0.12, z + Math.cos(a) * 0.55);
      m.compose(p, q, s.set(0.42, 0.06, 1.15));
      parts.push(tinted(new THREE.BoxGeometry(1, 1, 1), leaf, m));
      // الخارجية تتدلى
      e.set(0.55, a, 0, "YXZ");
      q.setFromEuler(e);
      p.set(cx + Math.sin(a) * 1.45, top - 0.12, z + Math.cos(a) * 1.45);
      m.compose(p, q, s.set(0.34, 0.05, 1.05));
      parts.push(tinted(new THREE.BoxGeometry(1, 1, 1), leaf, m));
    }
    for (let k = 0; k < 3; k++) {
      p.set(cx + Math.sin(k * 2.1) * 0.18, top - 0.2, z + Math.cos(k * 2.1) * 0.18);
      m.compose(p, q.identity(), s.set(1, 1, 1));
      parts.push(tinted(new THREE.IcosahedronGeometry(0.13, 1), "#7a4a24", m));
    }
  }
  // مصطبة المرصد تحت المرقاب: كريمي بشريط فيروزي وحافة ذهبية (هوية المنصة)
  q.identity();
  s.set(1, 1, 1);
  p.set(LAUNCH.x, 0.55, LAUNCH.z + 0.6);
  m.compose(p, q, s);
  parts.push(tinted(new RoundedBoxGeometry(4.2, 1.7, 3.6, 2, 0.18), BRAND.cream, m));
  p.set(LAUNCH.x, 0.95, LAUNCH.z + 0.6);
  m.compose(p, q, s);
  parts.push(tinted(new RoundedBoxGeometry(4.26, 0.22, 3.66, 1, 0.08), BRAND.teal, m));
  // سطح كريمي بإطار ذهبي رفيع (لا لوح ذهبي كامل يملأ أسفل الشاشة في الجوال)
  p.set(LAUNCH.x, 1.36, LAUNCH.z + 0.6);
  m.compose(p, q, s);
  parts.push(tinted(new RoundedBoxGeometry(4.46, 0.07, 3.86, 1, 0.03), BRAND.gold, m));
  p.set(LAUNCH.x, 1.42, LAUNCH.z + 0.6);
  m.compose(p, q, s);
  parts.push(tinted(new RoundedBoxGeometry(4.3, 0.1, 3.7, 1, 0.04), BRAND.creamDark, m));
  return merged(parts);
}

/** أفق بعيد عام (كتل بلا قباب ولا معالم حقيقية): رمادي محايد يلوّنه الفجر عبر لون المادة */
function skylineGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const rnd = lcg(29);
  for (let i = 0; i < 56; i++) {
    const x = -170 + i * 6.2 + rnd() * 3;
    const tall = rnd() < 0.18;
    const h = tall ? 14 + rnd() * 12 : 4 + rnd() * 7;
    const w = tall ? 3 + rnd() * 2 : 4 + rnd() * 5;
    const z = -125 - rnd() * 18;
    const shade = i % 3 ? "#ffffff" : "#d9d6ee";
    p.set(x, h / 2 - 0.6, z);
    m.compose(p, q, s.set(w, h, 3));
    parts.push(tinted(new THREE.BoxGeometry(1, 1, 1), shade, m));
    if (tall) {
      // برج متدرج: طبقة أضيق فوقه
      p.set(x, h + 1.4, z);
      m.compose(p, q, s.set(w * 0.55, 4, 2.4));
      parts.push(tinted(new THREE.BoxGeometry(1, 1, 1), "#ece9fb", m));
    }
  }
  return merged(parts);
}

/** القنديل: قلب زجاجي سداسي مضيء (هندسة) وقفص نحاسي (هندسة أخرى)، كلاهما في مكعب الوحدة */
function lanternGeometries(): { core: THREE.BufferGeometry; cage: THREE.BufferGeometry } {
  const core = new THREE.CylinderGeometry(0.33, 0.33, 0.74, 6);
  const parts: THREE.BufferGeometry[] = [];
  const base = new THREE.CylinderGeometry(0.42, 0.46, 0.13, 6);
  base.translate(0, -0.435, 0);
  parts.push(base);
  const top = new THREE.CylinderGeometry(0.12, 0.47, 0.17, 6);
  top.translate(0, 0.415, 0);
  parts.push(top);
  const knob = new THREE.CylinderGeometry(0.05, 0.07, 0.07, 6);
  knob.translate(0, 0.53, 0);
  parts.push(knob);
  const ring = new THREE.TorusGeometry(0.09, 0.028, 6, 14);
  ring.translate(0, 0.63, 0);
  parts.push(ring);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const bar = new THREE.BoxGeometry(0.05, 0.76, 0.05);
    bar.rotateY(a);
    bar.translate(Math.sin(a) * 0.36, 0, Math.cos(a) * 0.36);
    parts.push(bar);
  }
  const band = new THREE.TorusGeometry(0.36, 0.022, 4, 6);
  band.rotateX(Math.PI / 2);
  parts.push(band);
  return { core, cage: merged(parts) };
}

/** غيمة منفوخة: كرات مدموجة داخل مكعب الوحدة (المصادم صندوق؛ الشكل للعرض فقط) */
function cloudGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, y, z, r] of [
    [0, 0.05, 0, 0.42],
    [-0.28, -0.08, 0.05, 0.3],
    [0.28, -0.06, -0.04, 0.32],
    [0.05, -0.1, 0.25, 0.28],
    [-0.04, -0.1, -0.26, 0.28],
  ] as const) {
    const g = new THREE.IcosahedronGeometry(r, 2);
    g.translate(x, y, z);
    parts.push(g);
  }
  return merged(parts);
}

export function createScene(canvas: HTMLCanvasElement, sim: Sim, opts: SceneOptions) {
  let quality: Quality = opts.quality;
  const reducedMotion = opts.reducedMotion;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === "high", powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 260);
  const view = rngStreams(opts.seed >>> 0).view;
  const rnd = () => view.float();
  const gradient = own(toonGradient());
  const toon = (p: THREE.MeshToonMaterialParameters) => own(new THREE.MeshToonMaterial({ gradientMap: gradient, ...p }));

  // ── الفجر: محطات الألوان، والحالة الممزوجة الحالية
  const STOPS = [toStop(NIGHT), toStop(TWILIGHT), toStop(SUNRISE)] as const;
  const cur = toStop(NIGHT);
  let dawn = Math.min(1, Math.max(0, opts.dawn ?? 0));
  let dawnTarget = dawn;
  let dawnApplied = -1;

  // ── السماء: قبة بتدرج ثلاثي وحافة متوهجة على الأفق ووهج الشمس؛ تتبع الكاميرا فلا تظهر لها حافة
  const skyGroup = new THREE.Group();
  const skyUniforms = {
    top: { value: new THREE.Color() },
    mid: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    glow: { value: new THREE.Color() },
    glowAmount: { value: 1 },
    sunDir: { value: new THREE.Vector3(0, -0.1, -1).normalize() },
    sunColor: { value: new THREE.Color("#ffd79a") },
    sunAmount: { value: 0 },
  };
  const skyGeo = own(new THREE.SphereGeometry(230, 32, 16));
  const skyMat = own(
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 glow; uniform float glowAmount;
        uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunAmount;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 c = mix(horizon, mid, smoothstep(-0.02, 0.22, h));
          c = mix(c, top, smoothstep(0.22, 0.75, h));
          c += glow * glowAmount * exp(-abs(h - 0.012) * 26.0);
          float s = max(dot(d, sunDir), 0.0);
          c += sunColor * sunAmount * (pow(s, 10.0) * 0.4 + pow(s, 90.0) * 0.6);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  skyGroup.add(sky);
  // نجوم السماء: تخبو مع الفجر
  const dotTex = own(dotTexture());
  const starCount = 260;
  const starPos = new Float32Array(starCount * 3);
  {
    const r = lcg(97);
    for (let i = 0; i < starCount; i++) {
      const y = 0.07 + r() * 0.93;
      const a = r() * Math.PI * 2;
      const rr = Math.sqrt(1 - y * y);
      starPos[i * 3] = Math.cos(a) * rr * 220;
      starPos[i * 3 + 1] = y * 220;
      starPos[i * 3 + 2] = Math.sin(a) * rr * 220;
    }
  }
  const starGeo = own(new THREE.BufferGeometry());
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = own(new THREE.PointsMaterial({ color: "#fff6dc", size: 2.2, sizeAttenuation: false, map: dotTex, transparent: true, depthWrite: false, fog: false }));
  const skyStars = new THREE.Points(starGeo, starMat);
  skyStars.frustumCulled = false;
  skyStars.renderOrder = -9;
  skyGroup.add(skyStars);
  // القمر بهالة (لا هلال)، والشمس تشرق خلف الأفق
  const moonTex = own(discTexture("#f4f1ff", "rgba(190,215,255,0.55)", 0.42, true));
  const moonMat = own(new THREE.SpriteMaterial({ map: moonTex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  const moon = new THREE.Sprite(moonMat);
  // منخفض قرب الوسط: يظهر فوق الأفق في الجوال العمودي والشاشة الأفقية معًا
  moon.position.set(-0.241, 0.078, -0.967).normalize().multiplyScalar(200);
  moon.scale.setScalar(30);
  const sunTex = own(discTexture("#fff1bf", "rgba(255,190,90,0.7)", 0.3, false));
  const sunMat = own(new THREE.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  const sunSprite = new THREE.Sprite(sunMat);
  sunSprite.scale.setScalar(46);
  skyGroup.add(moon, sunSprite);
  scene.add(skyGroup);
  scene.fog = new THREE.Fog("#2f4a8a", 45, 190);

  // ── الإضاءة: سماء وأرض، وضوء رئيس (القمر ثم الشمس) يلقي ظلالًا ناعمة، وحافة خلفية
  const hemi = new THREE.HemisphereLight("#9db4ff", "#1d4756", 1.3);
  const keyLight = new THREE.DirectionalLight("#c9d8ff", 1.7);
  keyLight.position.set(-14, 16, 10);
  keyLight.target.position.set(0, 0, 0);
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.radius = 3;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  Object.assign(keyLight.shadow.camera, { left: -12, right: 12, top: 12, bottom: -10, near: 1, far: 60 });
  const rim = new THREE.DirectionalLight("#5fe6d8", 0.7);
  rim.position.set(10, 8, -16);
  scene.add(hemi, keyLight, keyLight.target, rim);

  // ── البحر والجزيرة والزينة والأفق
  const seaGeo = own(new THREE.CircleGeometry(220, 48));
  const seaMat = own(new THREE.MeshPhongMaterial({ color: "#0d3f63", shininess: 70, specular: new THREE.Color("#4f7fa8") }));
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA_Y;
  sea.receiveShadow = true;
  scene.add(sea);
  const sandTex = own(sandTexture());
  const islandGeo = own(new RoundedBoxGeometry(ISLAND.hx * 2, 1.2, ISLAND.hz * 2, 3, 0.45));
  const island = new THREE.Mesh(islandGeo, toon({ color: "#ffffff", map: sandTex }));
  island.position.y = -0.6;
  island.receiveShadow = true;
  const shoreGeo = own(new RoundedBoxGeometry(ISLAND.hx * 2 + 1.4, 0.5, ISLAND.hz * 2 + 1.4, 2, 0.25));
  const shore = new THREE.Mesh(shoreGeo, toon({ color: BRAND.sandDark }));
  shore.position.y = -0.62;
  const decoGeo = own(decorGeometry());
  const deco = new THREE.Mesh(decoGeo, toon({ vertexColors: true }));
  deco.castShadow = true;
  deco.receiveShadow = true;
  const skylineGeo = own(skylineGeometry());
  const skylineMat = own(new THREE.MeshBasicMaterial({ vertexColors: true, color: "#2a2d6a", fog: true }));
  scene.add(island, shore, deco, new THREE.Mesh(skylineGeo, skylineMat));

  // ── الأجسام: InstancedMesh لكل خامة بخامات مرسومة وحواف كرتونية، ولون لكل نسخة (تفاوت خفيف)
  const glassTex = own(stainedGlassTexture(STAINED));
  const lightTex = own(lightboxTexture());
  const boxGeo = own(new RoundedBoxGeometry(1, 1, 1, 2, 0.06));
  const cloudGeo = own(cloudGeometry());
  const ballGeo = own(new THREE.IcosahedronGeometry(0.5, 2));
  const lg = lanternGeometries();
  own(lg.core);
  own(lg.cage);
  const matFor: Record<MaterialKey, THREE.Material> = {
    teak: toon({ color: "#ffffff", map: own(teakTexture()) }),
    frond: toon({ color: "#ffffff", map: own(frondTexture()) }),
    stone: toon({ color: "#ffffff", map: own(coralTexture()) }),
    // الزجاج المعشّق شفاف ومضيء ليلًا؛ لا يكتب العمق (نسخه غير مرتبة بالعمق، والكتابة تُخفي ما خلفها)
    glass: toon({ color: "#ffffff", map: glassTex, emissive: "#ffffff", emissiveMap: glassTex, emissiveIntensity: 0.42, transparent: true, opacity: 0.9, depthWrite: false }),
    cloud: toon({ color: MATERIAL_COLORS.cloud, emissive: "#b9a6ff", emissiveIntensity: 0.16 }),
    lightbox: toon({ color: "#ffffff", map: lightTex, emissive: "#ffb52e", emissiveMap: lightTex, emissiveIntensity: 0.7 }),
  };
  const cap = Math.max(16, sim.bodies.length + 8);
  const layers: THREE.InstancedMesh[] = [];
  const white = new THREE.Color("#ffffff");
  const makeLayer = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, colored: boolean, shadow: boolean) => {
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (colored) {
      // مخزن الألوان من البداية (إنشاؤه لاحقًا يعيد ترجمة الظلال وسط اللعب)
      mesh.setColorAt(0, white);
      mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    }
    scene.add(mesh);
    layers.push(mesh);
    return mesh;
  };
  for (const k of MAT_KEYS) makeLayer(k === "cloud" ? cloudGeo : boxGeo, matFor[k], cap, true, k !== "glass");
  layers[MAT_KEYS.indexOf("glass")].renderOrder = 1;
  const lanternCap = Math.max(1, sim.lanternCount);
  const coreMat = own(new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }));
  makeLayer(lg.core, coreMat, lanternCap, true, false);
  makeLayer(lg.cage, toon({ color: LANTERN.copper, emissive: LANTERN.copperDark, emissiveIntensity: 0.25 }), lanternCap, false, true);
  makeLayer(ballGeo, toon({ color: "#ffffff", emissive: "#ff9a3c", emissiveIntensity: 0.45 }), 8, true, true);
  const layerOf: Record<MaterialKey, number> = { frond: 0, teak: 1, stone: 2, glass: 3, cloud: 4, lightbox: 5 };
  const counts = new Int32Array(LAYER_COUNT);
  for (const l of layers) disposables.push(l);

  // تفاوت لوني ثابت لكل جسم من تيار العرض (لا يتغير مع موت الأجسام وإزاحة الفتحات)
  let tint = new Float32Array(cap);
  for (let i = 0; i < tint.length; i++) tint[i] = 0.9 + rnd() * 0.12;

  // ── الشظايا والجسيمات (العرض فقط)
  const shardGeo = own(new RoundedBoxGeometry(1, 1, 1, 1, 0.12));
  const shards = createShards(SHARD_CAP, shardGeo, toon({ color: "#ffffff" }));
  disposables.push(shards);
  scene.add(shards.mesh);
  const dust = createParticles(500, false);
  const glow = createParticles(400, true);
  dust.points.renderOrder = 2;
  glow.points.renderOrder = 3;
  scene.add(dust.points, glow.points);
  disposables.push(dust, glow);
  const matColor = {} as Record<MaterialKey, THREE.Color>;
  for (const k of MAT_KEYS) matColor[k] = new THREE.Color(k === "stone" ? "#e9a48c" : MATERIAL_COLORS[k]);
  const stained = STAINED.map((c) => new THREE.Color(c));
  const ammoColor = {} as Record<AmmoKey, THREE.Color>;
  for (const k of Object.keys(AMMO_COLORS) as AmmoKey[]) ammoColor[k] = new THREE.Color(AMMO_COLORS[k]);
  const lanternGlow = new THREE.Color(LANTERN.glow);
  const lanternDim = new THREE.Color(LANTERN.glowDim);
  const starColor = new THREE.Color(LANTERN.star);
  const tmpColor = new THREE.Color();

  // ── المرقاب: حامل ساج ثلاثي، وأنبوب فيروزي بحلقات ذهبية، يدور اتجاهًا وارتفاعًا
  const launcher = new THREE.Group();
  const legParts: THREE.BufferGeometry[] = [];
  for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
    const leg = new THREE.CylinderGeometry(0.06, 0.08, 1.3, 8);
    leg.rotateX(Math.cos(a) * 0.35);
    leg.rotateZ(-Math.sin(a) * 0.35);
    leg.translate(Math.sin(a) * 0.38, -0.55, Math.cos(a) * 0.38);
    legParts.push(leg);
  }
  const legs = new THREE.Mesh(own(merged(legParts)), toon({ color: "#9a5a2c" }));
  legs.castShadow = true;
  launcher.add(legs);
  const yawG = new THREE.Group();
  const pitchG = new THREE.Group();
  const tubeGeo = own(new THREE.CylinderGeometry(0.2, 0.3, 2.2, 20));
  tubeGeo.rotateX(-Math.PI / 2);
  tubeGeo.translate(0, 0, -0.5);
  const tube = new THREE.Mesh(tubeGeo, toon({ color: BRAND.teal, emissive: BRAND.tealHi, emissiveIntensity: 0.12 }));
  tube.castShadow = true;
  const ringParts: THREE.BufferGeometry[] = [];
  for (const z of [-1.45, 0.35]) {
    const r = new THREE.TorusGeometry(0.29, 0.05, 8, 24);
    r.translate(0, 0, z);
    ringParts.push(r);
  }
  const eye = new THREE.CylinderGeometry(0.09, 0.11, 0.3, 12);
  eye.rotateX(-Math.PI / 2);
  eye.translate(0, 0, 0.72);
  ringParts.push(eye);
  const rings = new THREE.Mesh(own(merged(ringParts)), toon({ color: BRAND.gold, emissive: "#6b4a00", emissiveIntensity: 0.3 }));
  pitchG.add(tube, rings);
  yawG.add(pitchG);
  launcher.add(yawG);
  launcher.position.set(LAUNCH.x, LAUNCH.y - 0.25, LAUNCH.z);
  scene.add(launcher);

  // ── دليل التصويب: نقاط مستديرة ناعمة تخفت نحو آخر المسار (العرض فقط)
  let guideN = Math.max(0, Math.min(GUIDE_MAX, Math.round(opts.guidePoints)));
  const guideGeo = own(new THREE.BufferGeometry());
  const guidePos = new THREE.BufferAttribute(new Float32Array(GUIDE_MAX * 3), 3);
  const guideCol = new THREE.BufferAttribute(new Float32Array(GUIDE_MAX * 4), 4);
  guideGeo.setAttribute("position", guidePos);
  guideGeo.setAttribute("color", guideCol);
  guideGeo.setDrawRange(0, 0);
  const guideTex = own(guideDotTexture());
  const guideMat = own(new THREE.PointsMaterial({ size: 0.26, map: guideTex, vertexColors: true, alphaTest: 0.03, transparent: true, depthWrite: false, toneMapped: false }));
  const guide = new THREE.Points(guideGeo, guideMat);
  guide.frustumCulled = false;
  guide.renderOrder = 4;
  scene.add(guide);

  // ── القناديل المحررة: نجوم لامعة تصعد إلى كوكبة فوق الجزيرة، وتتصل بخيوط ذهبية
  const nL = sim.lanternCount;
  const sparkleGeo = own(sparkleGeometry());
  const sparkleMat = own(new THREE.MeshBasicMaterial({ color: starColor, toneMapped: false, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  const stars = new THREE.InstancedMesh(sparkleGeo, sparkleMat, Math.max(1, nL));
  stars.count = 0;
  stars.frustumCulled = false;
  stars.renderOrder = 5;
  stars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(stars);
  disposables.push(stars);
  const slotPos = new Float32Array(Math.max(1, nL) * 3);
  for (let k = 0; k < nL; k++) {
    const t = nL > 1 ? k / (nL - 1) : 0.5;
    // منخفضة وقريبة بما يكفي لتبقى في الإطار الأفقي الأضيق (زاوية رأسية 42°) في وضعي التصويب والمشاهدة
    slotPos[k * 3] = -6 + 12 * t;
    slotPos[k * 3 + 1] = 5.2 + Math.sin(k * 1.9) * 0.6 + rnd() * 0.3;
    slotPos[k * 3 + 2] = -12 - Math.cos(k * 1.3) * 1.5;
  }
  /** لكل قنديل: −1 لم يتحرر بعد، وإلا الزمن منذ التحرر */
  const starAge = new Float32Array(Math.max(1, nL)).fill(-1);
  /** ترتيب التحرر = خانة الكوكبة */
  const starSlot = new Int16Array(Math.max(1, nL)).fill(-1);
  const starFrom = new Float32Array(Math.max(1, nL) * 3);
  let starsFreed = 0;
  const linkGeo = own(new THREE.BufferGeometry());
  const linkPos = new Float32Array(Math.max(1, nL - 1) * 6);
  for (let k = 1; k < nL; k++) {
    linkPos.set([slotPos[(k - 1) * 3], slotPos[(k - 1) * 3 + 1], slotPos[(k - 1) * 3 + 2], slotPos[k * 3], slotPos[k * 3 + 1], slotPos[k * 3 + 2]], (k - 1) * 6);
  }
  linkGeo.setAttribute("position", new THREE.BufferAttribute(linkPos, 3));
  linkGeo.setDrawRange(0, 0);
  const linkMat = own(new THREE.LineBasicMaterial({ color: starColor, transparent: true, opacity: 0.55, depthWrite: false, fog: false, toneMapped: false }));
  const links = new THREE.LineSegments(linkGeo, linkMat);
  links.frustumCulled = false;
  links.renderOrder = 4;
  scene.add(links);

  // ── حالة الكاميرا
  let aimYaw = 0;
  let aimPitch = 0.3;
  let camMode: CamMode = "aim";
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const wantPos = new THREE.Vector3();
  const wantLook = new THREE.Vector3();
  let watchT = 0;
  let shake = 0;
  let shakeT = 0;
  let firstFrame = true;
  let particleRate = 1;
  let clock = 0;
  let trailT = 0;
  let trailNow = false;
  let lingerT = 0;

  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  // كل رمية تضيف قذيفة إلى نهاية sim.bodies (الفهرس جزء من البصمة فلا يُعاد استخدامه)، فالمخازن تكبر عند الحاجة
  let snap = new Float32Array(cap * 8);
  let prevAlive = new Uint8Array(cap);
  let prevX = new Float32Array(cap);
  let prevY = new Float32Array(cap);
  let prevZ = new Float32Array(cap);
  const brokeNow = new Set<number>();
  function ensureCapacity(n: number) {
    if (n <= prevAlive.length) return;
    const size = n + 32;
    snap = new Float32Array(size * 8);
    const grow = <T extends Float32Array | Uint8Array>(a: T, make: (k: number) => T) => {
      const b = make(size);
      b.set(a);
      return b;
    };
    prevAlive = grow(prevAlive, (k) => new Uint8Array(k));
    prevX = grow(prevX, (k) => new Float32Array(k));
    prevY = grow(prevY, (k) => new Float32Array(k));
    prevZ = grow(prevZ, (k) => new Float32Array(k));
    const t = new Float32Array(size).fill(1);
    t.set(tint);
    tint = t;
  }

  function aimCamera(out: THREE.Vector3, look: THREE.Vector3) {
    const dx = Math.sin(aimYaw);
    const dz = -Math.cos(aimYaw);
    out.set(LAUNCH.x - dx * 4.2, LAUNCH.y + 2.9, LAUNCH.z - dz * 4.2);
    look.set(LAUNCH.x + dx * 12.5, 0.9, LAUNCH.z + dz * 12.5);
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // عرض أفقي ثابت تقريبًا: في الجوال العمودي تتسع الزاوية الرأسية لتبقى الجزيرة كاملة عرضًا
    const hfov = 54 * (Math.PI / 180);
    const vfov = 2 * Math.atan(Math.tan(hfov / 2) / camera.aspect);
    camera.fov = Math.min(78, Math.max(42, (vfov * 180) / Math.PI));
    camera.updateProjectionMatrix();
    const scale = (h * renderer.getPixelRatio() * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
    dust.setScale(scale);
    glow.setScale(scale);
    // three يضرب حجم النقاط في نسبة البكسل بنفسه (sizeAttenuation: false)، فلا نضربه مرة ثانية
  }

  function applyQuality(q: Quality) {
    quality = q;
    renderer.setPixelRatio(q === "high" ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    renderer.shadowMap.enabled = q === "high";
    keyLight.castShadow = q === "high";
    renderer.shadowMap.needsUpdate = true;
    particleRate = q === "high" ? 1 : 0.55;
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) for (const x of m) x.needsUpdate = true;
      else if (m) m.needsUpdate = true;
    });
    resize();
  }

  /** مزج ألوان الفجر الحالية وتطبيقها (فقط عند التغير) */
  function applyDawn() {
    if (Math.abs(dawn - dawnApplied) < 1e-4) return;
    dawnApplied = dawn;
    const p = dawn;
    const a = p < 0.5 ? STOPS[0] : STOPS[1];
    const b = p < 0.5 ? STOPS[1] : STOPS[2];
    const t = p < 0.5 ? p * 2 : (p - 0.5) * 2;
    for (const k of COLOR_KEYS) cur.c[k].lerpColors(a.c[k], b.c[k], t);
    for (const k of NUM_KEYS) cur.n[k] = a.n[k] + (b.n[k] - a.n[k]) * t;
    skyUniforms.top.value.copy(cur.c.skyTop);
    skyUniforms.mid.value.copy(cur.c.skyMid);
    skyUniforms.horizon.value.copy(cur.c.horizon);
    skyUniforms.glow.value.copy(cur.c.horizonGlow);
    skyUniforms.glowAmount.value = 0.55 + 0.25 * (1 - Math.abs(p - 0.5) * 2);
    (scene.fog as THREE.Fog).color.copy(cur.c.fog);
    seaMat.color.copy(cur.c.sea);
    hemi.color.copy(cur.c.hemiSky);
    hemi.groundColor.copy(cur.c.hemiGround);
    hemi.intensity = cur.n.hemiIntensity;
    keyLight.color.copy(cur.c.key);
    keyLight.intensity = cur.n.keyIntensity;
    rim.color.copy(cur.c.rim);
    rim.intensity = cur.n.rimIntensity;
    skylineMat.color.copy(cur.c.skyline);
    renderer.toneMappingExposure = cur.n.exposure;
    starMat.opacity = cur.n.night;
    skyStars.visible = cur.n.night > 0.01;
    moonMat.opacity = cur.n.night;
    moon.visible = cur.n.night > 0.01;
    // الشمس تصعد من تحت الأفق (−8°) إلى 5° يمين المشهد
    const elev = (-8 + 13 * smooth(0.3, 1, p)) * (Math.PI / 180);
    const az = 16 * (Math.PI / 180);
    skyUniforms.sunDir.value.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev));
    skyUniforms.sunAmount.value = smooth(0.3, 1, p);
    sunSprite.position.copy(skyUniforms.sunDir.value).multiplyScalar(200);
    sunMat.opacity = smooth(0.45, 0.9, p);
    sunSprite.visible = sunMat.opacity > 0.01;
    // ستائر الزجاج تضيء ليلًا أكثر منها نهارًا، والقنديل يبقى دافئًا
    (matFor.glass as THREE.MeshToonMaterial).emissiveIntensity = 0.22 + 0.25 * cur.n.night;
  }

  /* ───────────── المؤثرات ───────────── */
  function burst(b: BreakEvent) {
    const count = Math.max(4, Math.round(MATERIALS[b.m].shards * particleRate));
    for (let k = 0; k < count; k++) {
      if (b.m === "glass") tmpColor.copy(stained[view.int(stained.length)]);
      else tmpColor.copy(matColor[b.m]).offsetHSL(0, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.16);
      shards.add(
        b.x + (rnd() - 0.5) * b.w,
        b.y + (rnd() - 0.5) * b.h,
        b.z + (rnd() - 0.5) * b.d,
        b.vx * 0.5 + (rnd() - 0.5) * 5,
        b.vy * 0.5 + 1.5 + rnd() * 4,
        b.vz * 0.5 + (rnd() - 0.5) * 5,
        rnd() * 6,
        rnd() * 6,
        rnd() * 6,
        (rnd() - 0.5) * 14,
        (rnd() - 0.5) * 14,
        (rnd() - 0.5) * 14,
        Math.min(b.w, b.h, b.d) * (0.18 + rnd() * 0.22) + 0.03,
        1.4 + rnd() * 1.2,
        tmpColor,
      );
    }
    const puff = b.m === "glass" ? "#ffe2f0" : b.m === "lightbox" ? "#fff2a8" : "#f5e6cc";
    const nDust = Math.round(7 * particleRate);
    for (let k = 0; k < nDust; k++)
      dust.spawn(b.x + (rnd() - 0.5) * b.w, b.y + (rnd() - 0.5) * b.h, b.z + (rnd() - 0.5) * b.d, (rnd() - 0.5) * 2, rnd() * 1.4, (rnd() - 0.5) * 2, 0.5 + rnd() * 0.5, puff, 0.9 + rnd() * 0.6, 1.4);
    if (b.m === "glass" || b.m === "lightbox") {
      const nGlow = Math.round(10 * particleRate);
      for (let k = 0; k < nGlow; k++)
        glow.spawn(b.x, b.y, b.z, (rnd() - 0.5) * 7, rnd() * 5, (rnd() - 0.5) * 7, 0.18 + rnd() * 0.16, b.m === "glass" ? stained[view.int(stained.length)] : "#ffe066", 0.7 + rnd() * 0.5);
    }
    if (b.m === "lightbox") for (let k = 0; k < Math.round(16 * particleRate); k++) glow.spawn(b.x, b.y, b.z, (rnd() - 0.5) * 12, (rnd() - 0.2) * 9, (rnd() - 0.5) * 12, 0.3, "#fff3b0", 0.5);
  }

  function splash(x: number, z: number) {
    for (let k = 0; k < Math.round(10 * particleRate); k++)
      dust.spawn(x + (rnd() - 0.5) * 0.6, SEA_Y + 0.15, z + (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 2, 3 + rnd() * 3, (rnd() - 0.5) * 2, 0.35 + rnd() * 0.3, "#d8f6ff", 0.8, 0.4);
  }

  /** بدء صعود القنديل li نجمًا من مكانه الأخير */
  function freeStar(li: number, x: number, y: number, z: number, instant: boolean) {
    starAge[li] = instant ? STAR_RISE_S : 0;
    starSlot[li] = starsFreed++;
    starFrom[li * 3] = x;
    starFrom[li * 3 + 1] = y;
    starFrom[li * 3 + 2] = z;
    if (!instant) for (let k = 0; k < Math.round(18 * particleRate); k++) glow.spawn(x, y, z, (rnd() - 0.5) * 3, rnd() * 3, (rnd() - 0.5) * 3, 0.35, lanternGlow, 0.9);
  }

  function updateStars(dt: number) {
    let n = 0;
    let arrived = 0;
    for (let li = 0; li < nL; li++) {
      if (starAge[li] < 0) continue;
      starAge[li] += dt;
      const slot = starSlot[li];
      const sx = slotPos[slot * 3];
      const sy = slotPos[slot * 3 + 1];
      const sz = slotPos[slot * 3 + 2];
      let scale: number;
      if (reducedMotion) {
        // تقليل الحركة: لا طيران، النجمة تظهر في مكانها بهدوء
        tmpV.set(sx, sy, sz);
        scale = Math.min(1, starAge[li] / 0.8);
      } else {
        const t = Math.min(1, starAge[li] / STAR_RISE_S);
        const u = 2 - 2 * t;
        const e = t < 0.5 ? 4 * t * t * t : 1 - (u * u * u) / 2;
        tmpV.set(
          starFrom[li * 3] + (sx - starFrom[li * 3]) * e + Math.sin(t * Math.PI * 2) * 0.4 * (1 - t),
          starFrom[li * 3 + 1] + (sy - starFrom[li * 3 + 1]) * e + Math.sin(t * Math.PI) * 2,
          starFrom[li * 3 + 2] + (sz - starFrom[li * 3 + 2]) * e,
        );
        scale = 0.35 + 0.65 * e;
        if (t < 1 && trailNow) glow.spawn(tmpV.x, tmpV.y, tmpV.z, 0, -0.3, 0, 0.5, starColor, 0.6);
        scale *= 1 + (t >= 1 ? Math.sin(clock * 2.2 + li * 1.7) * 0.08 : 0);
      }
      if (starAge[li] >= STAR_RISE_S || (reducedMotion && starAge[li] >= 0.8)) {
        // لا وهج متكرر: نبضة الوهج الدورية كانت ~3.7 مرة في الثانية (الأمر يمنع أكثر من 3)، والنجمة تتنفس ببطء بمقياسها فقط
        arrived++;
      }
      tmpS.setScalar(1.1 * scale);
      tmpM.compose(tmpV, camera.quaternion, tmpS);
      stars.setMatrixAt(n++, tmpM);
    }
    stars.count = n;
    if (n) stars.instanceMatrix.needsUpdate = true;
    // خيوط الكوكبة بين النجوم الواصلة بالترتيب
    let linksOn = 0;
    if (arrived > 1) {
      // الخانات تُملأ بالترتيب، فالواصل أولًا يأخذ الخانة الأصغر غالبًا؛ نرسم حتى أول خانة لم تصل
      for (let s = 1; s < starsFreed; s++) {
        let ok = 0;
        for (let li = 0; li < nL; li++) if ((starSlot[li] === s || starSlot[li] === s - 1) && starAge[li] >= (reducedMotion ? 0.8 : STAR_RISE_S)) ok++;
        if (ok < 2) break;
        linksOn = s;
      }
    }
    linkGeo.setDrawRange(0, linksOn * 2);
  }

  /* ───────────── الإطار ───────────── */
  /**
   * يرسم إطارًا واحدًا. dt بالثواني (محصور)، و flying = داخل رمية (المحاكاة تخطو).
   * يستهلك أحداث الكسر والتفعيل من المحاكاة (للعرض فقط).
   */
  function draw(dtIn: number, flying: boolean) {
    const dt = Math.min(0.1, Math.max(0, dtIn));
    clock += dt;
    trailT += dt;
    trailNow = trailT > 1 / 30;
    if (trailNow) trailT = 0;
    // الفجر يتقدم بنعومة نحو الهدف
    if (dawn !== dawnTarget) {
      const k = 1 - Math.exp(-dt * 1.4);
      dawn += (dawnTarget - dawn) * k;
      if (Math.abs(dawnTarget - dawn) < 1e-3) dawn = dawnTarget;
    }
    applyDawn();

    // أحداث الكسر والتفعيل
    const ev = sim.takeEvents();
    brokeNow.clear();
    for (const b of ev.breaks) {
      brokeNow.add(b.i);
      burst(b);
    }
    if (ev.breaks.length >= 3 && !reducedMotion) shake = Math.min(1, shake + 0.35 + ev.breaks.length * 0.05);
    for (const a of ev.activations) {
      const color = a.kind === "pulse" ? "#ffb3f1" : a.kind === "comet" ? "#9ff3ff" : "#fff1c2";
      const n = Math.round((a.kind === "fizzle" ? 8 : 22) * particleRate);
      for (let k = 0; k < n; k++) glow.spawn(a.x, a.y, a.z, (rnd() - 0.5) * 6, (rnd() - 0.5) * 6, (rnd() - 0.5) * 6, 0.25 + rnd() * 0.2, color, 0.6);
    }

    // اللقطة ← مصفوفات النسخ
    const bodies = sim.bodies;
    ensureCapacity(bodies.length);
    sim.snapshot(snap);
    counts.fill(0);
    const ammoC = ammoColor[sim.currentAmmo];
    for (let bi = 0; bi < bodies.length; bi++) {
      const b = bodies[bi];
      const o = b.i * 8;
      if (snap[o + 7] === 0) {
        prevAlive[b.i] = 0;
        continue;
      }
      const x = snap[o];
      const y = snap[o + 1];
      const z = snap[o + 2];
      // رذاذ عند عبور سطح البحر خارج الجزيرة (لا عند الكسر)
      if (prevAlive[b.i] && !brokeNow.has(b.i) && prevY[b.i] >= SEA_Y && y < SEA_Y && (Math.abs(x) > ISLAND.hx || Math.abs(z) > ISLAND.hz)) splash(x, z);
      prevAlive[b.i] = 1;
      prevX[b.i] = x;
      prevY[b.i] = y;
      prevZ[b.i] = z;
      tmpV.set(x, y, z);
      tmpQ.set(snap[o + 3], snap[o + 4], snap[o + 5], snap[o + 6]);
      if (b.kind === "projectile") {
        const layer = layers[L_PROJECTILE];
        const n = counts[L_PROJECTILE];
        if (n >= layer.instanceMatrix.count) continue;
        counts[L_PROJECTILE] = n + 1;
        tmpS.set(b.w, b.w, b.w);
        tmpM.compose(tmpV, tmpQ, tmpS);
        layer.setMatrixAt(n, tmpM);
        layer.setColorAt(n, ammoC);
        continue;
      }
      if (b.kind === "lantern") {
        const n = counts[L_LANTERN_CORE];
        counts[L_LANTERN_CORE] = n + 1;
        counts[L_LANTERN_CAGE] = n + 1;
        tmpS.set(b.w, b.h, b.d);
        tmpM.compose(tmpV, tmpQ, tmpS);
        layers[L_LANTERN_CORE].setMatrixAt(n, tmpM);
        layers[L_LANTERN_CAGE].setMatrixAt(n, tmpM);
        // القنديل المحرَّر خرج نوره نجمًا، فيخبو قلبه
        layers[L_LANTERN_CORE].setColorAt(n, sim.isFreed(b.i) ? lanternDim : lanternGlow);
        if (trailNow && !sim.isFreed(b.i) && rnd() < 0.5 * particleRate) glow.spawn(x, y, z, 0, 0.15, 0, 1.4 + rnd() * 0.3, lanternGlow, 0.12);
        continue;
      }
      const li = layerOf[b.mat as MaterialKey];
      if (li === undefined) continue;
      const layer = layers[li];
      const n = counts[li];
      counts[li] = n + 1;
      tmpS.set(b.w, b.h, b.d);
      tmpM.compose(tmpV, tmpQ, tmpS);
      layer.setMatrixAt(n, tmpM);
      const tv = tint[b.i] ?? 1;
      const arr = layer.instanceColor!.array as Float32Array;
      arr[n * 3] = tv;
      arr[n * 3 + 1] = tv;
      arr[n * 3 + 2] = tv;
    }
    for (let k = 0; k < LAYER_COUNT; k++) {
      const l = layers[k];
      l.count = counts[k];
      if (counts[k]) {
        l.instanceMatrix.needsUpdate = true;
        if (l.instanceColor) l.instanceColor.needsUpdate = true;
      }
    }

    // القناديل التي تحررت الآن تصعد نجومًا (من آخر مكان حي لها)
    for (let li = 0; li < nL; li++) {
      const i = sim.lanternStart + li;
      if (starAge[li] < 0 && sim.isFreed(i)) freeStar(li, prevX[i], prevY[i] + 0.4, prevZ[i], firstFrame);
    }

    // أثر القذيفة
    const lead = flying ? sim.leadProjectile() : null;
    if (lead && trailNow) glow.spawn(lead.x, lead.y, lead.z, -lead.vx * 0.05, -lead.vy * 0.05, -lead.vz * 0.05, 0.55, ammoC, 0.45);

    shards.update(dt, 9.81, SEA_Y);
    dust.update(dt, 0.6, 1.6);
    glow.update(dt, 0, 1.2);

    // ── الكاميرا: خلف المرقاب ← تتبع القذيفة ← مشاهدة الانهيار ← عودة
    if (lead && sim.stepInShot > 0) {
      camMode = "follow";
      watchT = 0;
      lingerT = 0;
    } else if (camMode !== "aim") {
      // بعد انطفاء القذيفة تشاهد الانهيار، وتبقى لحظة بعد السكون ثم تعود خلف المرقاب
      camMode = "watch";
      watchT += dt;
      lingerT = flying ? 0 : lingerT + dt;
      if (lingerT > 0.8) camMode = "aim";
    }
    if (camMode === "follow" && lead) {
      const hv = Math.max(0.001, Math.sqrt(lead.vx * lead.vx + lead.vz * lead.vz));
      // خلف القذيفة وفوقها، ولا تقترب من الملعب أكثر من 6.5م (تبقى المنشأة كاملة في الإطار)
      const back = 6.5;
      wantPos.set(lead.x - (lead.vx / hv) * back, Math.max(1.6, lead.y + 2.2), Math.max(lead.z - (lead.vz / hv) * back, 6.5));
      wantLook.set(lead.x + lead.vx * 0.3, Math.max(0.8, lead.y + lead.vy * 0.15), lead.z + lead.vz * 0.3);
    } else if (camMode === "watch") {
      // تقليل الحركة: زاوية ثابتة بلا دوران
      const a = reducedMotion ? 0.45 : 0.35 + Math.min(watchT, 6) * 0.05;
      wantPos.set(Math.sin(a) * 9.5, 4.6, 7.5 + Math.cos(a) * 2.5);
      // النظر أعلى قليلًا يبقي الكوكبة في الإطار الأفقي الضيق
      wantLook.set(0, 2.2, 0);
    } else aimCamera(wantPos, wantLook);
    if (firstFrame) {
      camPos.copy(wantPos);
      camLook.copy(wantLook);
      firstFrame = false;
    }
    const rate = camMode === "follow" ? (reducedMotion ? 3 : 5) : reducedMotion ? 1.6 : 2.4;
    const k = 1 - Math.exp(-dt * rate);
    camPos.lerp(wantPos, k);
    camLook.lerp(wantLook, k);
    camera.position.copy(camPos);
    if (shake > 0.001) {
      // اهتزاز خفيف بتردد 2.5 مرة في الثانية (أقل من 3)، يتلاشى خلال ثانية
      shakeT += dt;
      const amp = shake * 0.12;
      camera.position.x += Math.sin(shakeT * Math.PI * 5) * amp;
      camera.position.y += Math.cos(shakeT * Math.PI * 5) * amp * 0.6;
      shake = Math.max(0, shake - dt * 1.1);
    }
    camera.lookAt(camLook);
    skyGroup.position.copy(camera.position);
    updateStars(dt);
    yawG.rotation.y = -aimYaw;
    pitchG.rotation.x = aimPitch;
    guide.visible = !flying;
    renderer.render(scene, camera);
  }

  /** مسار الدليل المتوقع: تكامل أويلر الضمني بخطوة المحاكاة نفسها (تقريب للعرض بلا تصادم) */
  let lastAim = "";
  function setAim(yawStep: number, angleStep: number, powerStep: number, ammo: AmmoKey | null) {
    const a = aimAngles(yawStep, angleStep);
    aimYaw = a.yaw;
    aimPitch = a.pitch;
    const key = `${yawStep}|${angleStep}|${powerStep}|${ammo}|${guideN}`;
    if (key === lastAim) return;
    lastAim = key;
    if (!ammo || guideN === 0) {
      guideGeo.setDrawRange(0, 0);
      return;
    }
    const v = aimVelocity(yawStep, angleStep, powerStep);
    const ks = AMMO[ammo].speedScale;
    let x: number = LAUNCH.x;
    let y: number = LAUNCH.y;
    let z: number = LAUNCH.z;
    let vx = v.x * ks;
    let vy = v.y * ks;
    let vz = v.z * ks;
    const damp = 1 / (1 + DT * PROJECTILE_DAMPING);
    const c = ammoColor[ammo];
    let n = 0;
    for (let s = 1; n < guideN && s < 600; s++) {
      vy += GRAVITY * DT;
      vx *= damp;
      vy *= damp;
      vz *= damp;
      x += vx * DT;
      y += vy * DT;
      z += vz * DT;
      const floor = Math.abs(x) < ISLAND.hx && Math.abs(z) < ISLAND.hz ? 0 : SEA_Y;
      if (y < floor || x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ) break;
      if (s % GUIDE_EVERY === 0) {
        guidePos.setXYZ(n, x, y, z);
        guideCol.setXYZW(n, c.r, c.g, c.b, 1 - (0.7 * n) / Math.max(1, guideN - 1));
        n++;
      }
    }
    guidePos.needsUpdate = true;
    guideCol.needsUpdate = true;
    guideGeo.setDrawRange(0, n);
  }

  applyQuality(quality);
  applyDawn();

  return {
    draw,
    resize,
    setAim,
    setQuality(q: Quality) {
      if (q !== quality) applyQuality(q);
    },
    /** تقدم الفجر 0..1: الليل ← السَّحَر ← الشروق (يتدرج بنعومة) */
    setDawn(progress: number) {
      dawnTarget = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
    },
    setGuidePoints(n: number) {
      guideN = Math.max(0, Math.min(GUIDE_MAX, Math.round(Number.isFinite(n) ? n : 0)));
      lastAim = "";
    },
    get quality() {
      return quality;
    },
    get cameraMode() {
      return camMode;
    },
    info(): SceneInfo {
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        shards: shards.count,
        particles: dust.count + glow.count,
        quality,
        dpr: renderer.getPixelRatio(),
      };
    },
    /** يحرر كل الموارد ثم يفقد السياق عمدًا (المتصفح يحد عدد سياقات WebGL الحية) */
    dispose() {
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
