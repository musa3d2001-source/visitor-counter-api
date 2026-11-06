/**
 * تجربة 3D: عرض three.js بكاميرا خلف المرقاب تتبع القذيفة ثم تشاهد الانهيار.
 * يقرأ لقطة المحاكاة وأحداث الكسر فقط (لا يكتب فيها)، فالجودة والشظايا والغبار لا تمس الفيزياء ولا البصمة.
 * draw calls ثابتة مهما زادت الأجسام: InstancedMesh لكل مادة، وInstancedMesh واحدة للشظايا،
 * ونظاما جسيمات (غبار عادي، ووهج مضاف) كلٌّ بـ draw call واحدة، والزينة الثابتة مدموجة في هندسة واحدة.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { rngStreams } from "../spike/det";
import { aimAngles, aimVelocity3 } from "./det3d";
import { AMMO3, LAUNCH3, MATERIALS3, type AmmoKey, type MaterialKey } from "./layouts3d";
import { ISLAND, type Sim3 } from "./sim3d";

export type Quality3 = "high" | "low";

/** لوحة «فانوس الخليج» عند الغروب: ألوان زاهية دافئة، وقناديل مضيئة */
const PALETTE = {
  skyTop: "#1d2f6b",
  skyMid: "#6a4fa3",
  horizon: "#ffb36b",
  sea: "#1b7c8f",
  seaDeep: "#0e3e5c",
  sand: "#f0cf8e",
  sandDark: "#d8a85f",
  rock: "#8c7a6b",
  skyline: "#3b2f6e",
  sun: "#ffd9a0",
  mats: {
    frond: "#f2c14e",
    teak: "#b5652f",
    stone: "#8ea6b8",
    glass: "#4fd8f0",
    cloud: "#ffffff",
    lightbox: "#ffe14d",
    lantern: "#ff9d2e",
  } satisfies Record<MaterialKey, string>,
  ammo: { meteor: "#ffe9a8", pebble: "#d7e3ff", heavy: "#9fb2c8", comet: "#9ff3ff", pulse: "#ffb3f1" } satisfies Record<AmmoKey, string>,
};

const MAT_KEYS: Exclude<MaterialKey, "lantern">[] = ["frond", "teak", "stone", "glass", "cloud", "lightbox"];

export type RenderStats3 = {
  frames: number;
  medianMs: number;
  p95Ms: number;
  fps: number;
  drawCalls: number;
  triangles: number;
  dpr: number;
  quality: Quality3;
  shards: number;
};

type CamMode = "aim" | "follow" | "watch";

/* ───────────── جسيمات: نقاط بحجم وشفافية لكل جسيم، draw call واحدة ───────────── */
function makeParticles(cap: number, additive: boolean) {
  const pos = new Float32Array(cap * 3);
  const col = new Float32Array(cap * 3);
  const size = new Float32Array(cap);
  const alpha = new Float32Array(cap);
  const vel = new Float32Array(cap * 3);
  const life = new Float32Array(cap);
  const maxLife = new Float32Array(cap);
  const grow = new Float32Array(cap);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("pColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("pSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("pAlpha", new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { scale: { value: 400 } },
    vertexShader: /* glsl */ `
      attribute float pSize; attribute float pAlpha; attribute vec3 pColor;
      uniform float scale; varying float vA; varying vec3 vC;
      void main() {
        vA = pAlpha; vC = pColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = pSize * scale / max(0.1, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA; varying vec3 vC;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d) * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vC, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  let n = 0;
  const c = new THREE.Color();
  function spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, s: number, color: string, lifeS: number, growPerS = 0) {
    let i = n;
    if (n < cap) n++;
    else {
      // المجمع ممتلئ: نستبدل أقدم جسيم تقريبًا (أقل عمر متبقٍّ)
      let worst = 0;
      for (let k = 1; k < n; k++) if (life[k] < life[worst]) worst = k;
      i = worst;
    }
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    vel[i * 3] = vx;
    vel[i * 3 + 1] = vy;
    vel[i * 3 + 2] = vz;
    size[i] = s;
    c.set(color);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    life[i] = lifeS;
    maxLife[i] = lifeS;
    grow[i] = growPerS;
    alpha[i] = 1;
  }
  function update(dt: number, gravity: number, drag: number) {
    for (let i = 0; i < n; i++) {
      life[i] -= dt;
      if (life[i] <= 0) {
        // نقل آخر جسيم إلى مكانه (المجموعة مضغوطة دائمًا)
        n--;
        if (i !== n) {
          for (let k = 0; k < 3; k++) {
            pos[i * 3 + k] = pos[n * 3 + k];
            vel[i * 3 + k] = vel[n * 3 + k];
            col[i * 3 + k] = col[n * 3 + k];
          }
          size[i] = size[n];
          life[i] = life[n];
          maxLife[i] = maxLife[n];
          grow[i] = grow[n];
        }
        i--;
        continue;
      }
      vel[i * 3 + 1] -= gravity * dt;
      const f = Math.max(0, 1 - drag * dt);
      vel[i * 3] *= f;
      vel[i * 3 + 1] *= f;
      vel[i * 3 + 2] *= f;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      size[i] += grow[i] * dt;
      const t = life[i] / maxLife[i];
      alpha[i] = t < 0.5 ? t * 2 : 1;
    }
    geo.setDrawRange(0, n);
    for (const k of ["position", "pColor", "pSize", "pAlpha"]) (geo.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
  }
  return {
    points,
    spawn,
    update,
    clear() {
      n = 0;
      geo.setDrawRange(0, 0);
    },
    setScale(s: number) {
      mat.uniforms.scale.value = s;
    },
    get count() {
      return n;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

/** خلفية السماء: تدرج رأسي مرسوم مرة واحدة */
function skyTexture() {
  const cv = document.createElement("canvas");
  cv.width = 4;
  cv.height = 256;
  const g = cv.getContext("2d")!;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, PALETTE.skyTop);
  grd.addColorStop(0.55, PALETTE.skyMid);
  grd.addColorStop(0.86, PALETTE.horizon);
  grd.addColorStop(1, "#ffd8a8");
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** هندسة ملوّنة بالرؤوس (للدمج في draw call واحدة) */
function tinted(geo: THREE.BufferGeometry, color: string, m: THREE.Matrix4) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.applyMatrix4(m);
  const c = new THREE.Color(color);
  const n = g.getAttribute("position").count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "color") g.deleteAttribute(k);
  return g;
}

/** الزينة الثابتة: صخور حول الجزيرة، ونخيل، وأفق بعيد عام (لا معالم حقيقية) — هندسة واحدة */
function decorGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  let k = 11;
  const rnd = () => {
    k = (k * 16807) % 2147483647;
    return k / 2147483647;
  };
  // صخور على حافة الجزيرة
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const r = 1 + rnd() * 0.15;
    p.set(Math.cos(a) * (ISLAND.hx + 0.4) * r, -0.35 + rnd() * 0.2, Math.sin(a) * (ISLAND.hz + 0.4) * r);
    e.set(rnd() * 3, rnd() * 3, rnd() * 3);
    q.setFromEuler(e);
    const sc = 0.5 + rnd() * 0.7;
    s.set(sc * 1.4, sc, sc * 1.2);
    m.compose(p, q, s);
    parts.push(tinted(new THREE.IcosahedronGeometry(0.6, 0), i % 3 ? PALETTE.rock : "#6f6070", m));
  }
  // نخيل (جذع مائل وسعف) على الأطراف
  for (const [x, z, h] of [
    [-7.6, -5.4, 3.4],
    [7.8, -4.6, 3.0],
    [-8.2, 3.6, 2.6],
    [8.4, 4.2, 3.2],
  ] as const) {
    for (let j = 0; j < 5; j++) {
      p.set(x + j * 0.05, (j + 0.5) * (h / 5), z);
      m.compose(p, q.identity(), s.set(1, 1, 1));
      parts.push(tinted(new THREE.CylinderGeometry(0.16, 0.2, h / 5 - 0.04, 7), j % 2 ? "#8a5a32" : "#9b6a3c", m));
    }
    for (let f = 0; f < 6; f++) {
      const a = (f / 6) * Math.PI * 2;
      e.set(0.9, a, 0, "YXZ");
      q.setFromEuler(e);
      p.set(x + Math.sin(a) * 0.7, h + 0.1, z + Math.cos(a) * 0.7);
      m.compose(p, q, s.set(0.5, 0.06, 1.7));
      parts.push(tinted(new THREE.BoxGeometry(1, 1, 1), f % 2 ? "#2fa36b" : "#3cbf7d", m));
    }
  }
  // مصطبة المرصد تحت المرقاب
  p.set(LAUNCH3.x, 0.55, LAUNCH3.z + 0.6);
  m.compose(p, q.identity(), s.set(1, 1, 1));
  parts.push(tinted(new RoundedBoxGeometry(4.2, 1.7, 3.6, 2, 0.18), "#e9dcc4", m));
  p.set(LAUNCH3.x, 1.42, LAUNCH3.z + 0.6);
  m.compose(p, q, s);
  parts.push(tinted(new RoundedBoxGeometry(4.4, 0.12, 3.8, 1, 0.05), "#c9a46a", m));
  const merged = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  return merged;
}

/** أفق بعيد عام (كتل وقباب، لا معالم حقيقية): ظلال بلا إضاءة يذيبها الضباب في لون الغروب */
function skylineGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  let k = 29;
  const rnd = () => {
    k = (k * 16807) % 2147483647;
    return k / 2147483647;
  };
  for (let i = 0; i < 56; i++) {
    const x = -170 + i * 6.2 + rnd() * 3;
    const tall = rnd() < 0.18;
    const h = tall ? 14 + rnd() * 12 : 4 + rnd() * 7;
    const w = tall ? 3 + rnd() * 2 : 4 + rnd() * 5;
    const z = -125 - rnd() * 18;
    p.set(x, h / 2 - 0.6, z);
    m.compose(p, q, s.set(w, h, 3));
    parts.push(tinted(new THREE.BoxGeometry(1, 1, 1), i % 3 ? "#5b4a9c" : "#4a3d8a", m));
    if (i % 6 === 0 || tall) {
      p.set(x, h - 0.6, z);
      m.compose(p, q, s.set(w * 0.5, w * 0.5, w * 0.5));
      parts.push(tinted(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), "#6a58aa", m));
    }
  }
  const merged = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  return merged;
}

export function createRenderer3(canvas: HTMLCanvasElement, opts: { quality: Quality3; maxBodies: number; reducedMotion?: boolean }) {
  let quality = opts.quality;
  const reducedMotion = opts.reducedMotion ?? (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === "high", powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const disposables: { dispose(): void }[] = [];
  const sky = skyTexture();
  disposables.push(sky);
  scene.background = sky;
  scene.fog = new THREE.Fog(PALETTE.horizon, 40, 175);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 260);

  // ── إضاءة: سماء دافئة، وشمس غروب منخفضة تلقي ظلالًا ناعمة على الجزيرة
  const hemi = new THREE.HemisphereLight("#ffd7b0", "#2c6f86", 1.25);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.6);
  sun.position.set(-14, 16, 10);
  sun.target.position.set(0, 0, 0);
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -10, near: 1, far: 60 });
  const rim = new THREE.DirectionalLight("#9ec8ff", 0.6);
  rim.position.set(10, 8, -16);
  scene.add(hemi, sun, sun.target, rim);

  // ── البحر والجزيرة
  const seaGeo = new THREE.CircleGeometry(220, 48);
  const seaMat = new THREE.MeshStandardMaterial({ color: PALETTE.sea, roughness: 0.18, metalness: 0.05 });
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.55;
  sea.receiveShadow = true;
  scene.add(sea);
  disposables.push(seaGeo, seaMat);
  const islandGeo = new RoundedBoxGeometry(ISLAND.hx * 2, 1.2, ISLAND.hz * 2, 3, 0.45);
  const islandMat = new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.95 });
  const island = new THREE.Mesh(islandGeo, islandMat);
  island.position.y = -0.6;
  island.receiveShadow = true;
  scene.add(island);
  const shoreGeo = new RoundedBoxGeometry(ISLAND.hx * 2 + 1.4, 0.5, ISLAND.hz * 2 + 1.4, 2, 0.25);
  const shoreMat = new THREE.MeshStandardMaterial({ color: PALETTE.sandDark, roughness: 1 });
  const shore = new THREE.Mesh(shoreGeo, shoreMat);
  shore.position.y = -0.62;
  scene.add(shore);
  disposables.push(islandGeo, islandMat, shoreGeo, shoreMat);
  const decoGeo = decorGeometry();
  const decoMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const deco = new THREE.Mesh(decoGeo, decoMat);
  deco.castShadow = true;
  deco.receiveShadow = true;
  scene.add(deco);
  disposables.push(decoGeo, decoMat);
  const skylineGeo = skylineGeometry();
  const skylineMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
  scene.add(new THREE.Mesh(skylineGeo, skylineMat));
  disposables.push(skylineGeo, skylineMat);

  // ── الأجسام: InstancedMesh لكل مادة بحواف مستديرة
  const cap = opts.maxBodies;
  const boxGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.07);
  const ballGeo = new THREE.IcosahedronGeometry(0.5, 2);
  disposables.push(boxGeo, ballGeo);
  const layers = new Map<string, THREE.InstancedMesh>();
  const makeLayer = (key: string, geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
    disposables.push(mat);
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.count = 0;
    mesh.frustumCulled = false;
    scene.add(mesh);
    layers.set(key, mesh);
  };
  for (const k of MAT_KEYS) {
    const glass = k === "glass";
    makeLayer(
      k,
      boxGeo,
      new THREE.MeshStandardMaterial({
        color: PALETTE.mats[k],
        roughness: glass ? 0.12 : k === "stone" ? 0.8 : 0.62,
        metalness: glass ? 0.1 : 0,
        emissive: k === "lightbox" ? "#ffb300" : glass ? "#0aa6c4" : "#000000",
        emissiveIntensity: k === "lightbox" ? 0.55 : glass ? 0.25 : 0,
        transparent: glass,
        opacity: glass ? 0.82 : 1,
        // الزجاج الشفاف لا يكتب العمق: نسخه غير مرتبة بالعمق، فالكتابة تُخفي ما خلفها
        depthWrite: !glass,
      }),
      cap,
    );
  }
  layers.get("glass")!.renderOrder = 1;
  makeLayer("lantern", boxGeo, new THREE.MeshStandardMaterial({ color: PALETTE.mats.lantern, emissive: "#ff7a00", emissiveIntensity: 0.9, roughness: 0.35 }), cap);
  makeLayer("lanternCap", boxGeo, new THREE.MeshStandardMaterial({ color: "#5b3a1e", roughness: 0.6 }), cap);
  makeLayer("projectile", ballGeo, new THREE.MeshStandardMaterial({ color: "#fff2c4", emissive: "#ffb347", emissiveIntensity: 0.8, roughness: 0.3 }), 8);

  // ── الشظايا: InstancedMesh واحدة بلون لكل شظية (العرض فقط)
  const SHARD_CAP = 420;
  const shardGeo = new RoundedBoxGeometry(1, 1, 1, 1, 0.12);
  const shardMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.6 });
  const shards = new THREE.InstancedMesh(shardGeo, shardMat, SHARD_CAP);
  shards.castShadow = true;
  shards.frustumCulled = false;
  shards.count = 0;
  shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // ننشئ مخزن الألوان من البداية: إنشاؤه عند أول كسر يغيّر نسخة الظلال فيُعاد ترجمتها وسط اللعب
  shards.setColorAt(0, new THREE.Color("#ffffff"));
  scene.add(shards);
  disposables.push(shardGeo, shardMat);
  const sh = {
    n: 0,
    pos: new Float32Array(SHARD_CAP * 3),
    vel: new Float32Array(SHARD_CAP * 3),
    rot: new Float32Array(SHARD_CAP * 3),
    spin: new Float32Array(SHARD_CAP * 3),
    size: new Float32Array(SHARD_CAP),
    life: new Float32Array(SHARD_CAP),
  };
  const shardColor = new THREE.Color();

  // ── الجسيمات
  const dust = makeParticles(500, false);
  const glow = makeParticles(400, true);
  dust.points.renderOrder = 2;
  glow.points.renderOrder = 3;
  scene.add(dust.points, glow.points);
  disposables.push(dust, glow);

  // ── المرقاب: حامل ثلاثي وأنبوب بحلقات ذهبية، يدور اتجاهًا وارتفاعًا
  const launcher = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: "#8a5a32", roughness: 0.7 });
  const tubeMat = new THREE.MeshStandardMaterial({ color: "#2f4f9a", roughness: 0.35, metalness: 0.3 });
  const gold = new THREE.MeshStandardMaterial({ color: "#ffc531", roughness: 0.3, metalness: 0.6, emissive: "#6b4a00", emissiveIntensity: 0.3 });
  const legGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.3, 8);
  const tubeGeo = new THREE.CylinderGeometry(0.2, 0.3, 2.2, 20);
  const ringGeo = new THREE.TorusGeometry(0.29, 0.05, 8, 24);
  disposables.push(wood, tubeMat, gold, legGeo, tubeGeo, ringGeo);
  for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
    const leg = new THREE.Mesh(legGeo, wood);
    leg.position.set(Math.sin(a) * 0.38, -0.55, Math.cos(a) * 0.38);
    leg.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35);
    leg.castShadow = true;
    launcher.add(leg);
  }
  const yawG = new THREE.Group();
  const pitchG = new THREE.Group();
  const tube = new THREE.Mesh(tubeGeo, tubeMat);
  tube.rotation.x = -Math.PI / 2; // المحور نحو z السالبة
  tube.position.z = -0.5;
  tube.castShadow = true;
  const r1 = new THREE.Mesh(ringGeo, gold);
  r1.position.z = -1.45;
  const r2 = new THREE.Mesh(ringGeo, gold);
  r2.position.z = 0.35;
  pitchG.add(tube, r1, r2);
  yawG.add(pitchG);
  launcher.add(yawG);
  launcher.position.set(LAUNCH3.x, LAUNCH3.y - 0.25, LAUNCH3.z);
  scene.add(launcher);

  // ── دليل التصويب: نقاط وهج على المسار المتوقع (العرض فقط)
  const GUIDE_N = 34;
  const guideGeo = new THREE.BufferGeometry();
  guideGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(GUIDE_N * 3), 3));
  // نقاط مستديرة ناعمة (PointsMaterial بلا خامة يرسم مربعات تكبر قرب الكاميرا)
  const dotCanvas = document.createElement("canvas");
  dotCanvas.width = dotCanvas.height = 32;
  const dctx = dotCanvas.getContext("2d")!;
  const dg = dctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  dg.addColorStop(0, "rgba(255,255,255,1)");
  dg.addColorStop(0.55, "rgba(255,255,255,0.95)");
  dg.addColorStop(1, "rgba(255,255,255,0)");
  dctx.fillStyle = dg;
  dctx.fillRect(0, 0, 32, 32);
  const dotTex = new THREE.CanvasTexture(dotCanvas);
  dotTex.colorSpace = THREE.SRGBColorSpace;
  disposables.push(dotTex);
  const guideMat = new THREE.PointsMaterial({ color: "#fff1b8", size: 0.2, map: dotTex, alphaTest: 0.05, transparent: true, opacity: 0.95, depthWrite: false });
  const guide = new THREE.Points(guideGeo, guideMat);
  guide.frustumCulled = false;
  guideGeo.setDrawRange(0, 0);
  guide.renderOrder = 4;
  scene.add(guide);
  disposables.push(guideGeo, guideMat);

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
  const vrand = rngStreams(20261106).view;
  const rnd = () => vrand.next() / 4294967296;

  function aimCamera(out: THREE.Vector3, look: THREE.Vector3) {
    const dx = Math.sin(aimYaw);
    const dz = -Math.cos(aimYaw);
    out.set(LAUNCH3.x - dx * 4.2, LAUNCH3.y + 2.9, LAUNCH3.z - dz * 4.2);
    look.set(LAUNCH3.x + dx * 12.5, 0.9, LAUNCH3.z + dz * 12.5);
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // عرض أفقي ثابت تقريبًا: في الطول (جوال عمودي) تتسع الزاوية الرأسية لتبقى الجزيرة كاملة عرضًا
    const hfov = 54 * (Math.PI / 180);
    const vfov = 2 * Math.atan(Math.tan(hfov / 2) / camera.aspect);
    camera.fov = Math.min(78, Math.max(42, (vfov * 180) / Math.PI));
    camera.updateProjectionMatrix();
    const scale = (h * renderer.getPixelRatio() * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
    dust.setScale(scale);
    glow.setScale(scale);
    guideMat.size = 0.2;
  }

  function applyQuality(qa: Quality3) {
    quality = qa;
    renderer.setPixelRatio(qa === "high" ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    renderer.shadowMap.enabled = qa === "high";
    sun.castShadow = qa === "high";
    renderer.shadowMap.needsUpdate = true;
    scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (mat) mat.needsUpdate = true;
    });
    resize();
  }

  /* ───────────── المؤثرات ───────────── */
  function burst(x: number, y: number, z: number, vx: number, vy: number, vz: number, m: MaterialKey, w: number, h: number, d: number) {
    const count = MATERIALS3[m].shards;
    const base = PALETTE.mats[m];
    for (let k = 0; k < count; k++) {
      let i = sh.n;
      if (sh.n < SHARD_CAP) sh.n++;
      else {
        let worst = 0;
        for (let j = 1; j < sh.n; j++) if (sh.life[j] < sh.life[worst]) worst = j;
        i = worst;
      }
      sh.pos[i * 3] = x + (rnd() - 0.5) * w;
      sh.pos[i * 3 + 1] = y + (rnd() - 0.5) * h;
      sh.pos[i * 3 + 2] = z + (rnd() - 0.5) * d;
      sh.vel[i * 3] = vx * 0.5 + (rnd() - 0.5) * 5;
      sh.vel[i * 3 + 1] = vy * 0.5 + 1.5 + rnd() * 4;
      sh.vel[i * 3 + 2] = vz * 0.5 + (rnd() - 0.5) * 5;
      for (let a = 0; a < 3; a++) {
        sh.rot[i * 3 + a] = rnd() * 6;
        sh.spin[i * 3 + a] = (rnd() - 0.5) * 14;
      }
      sh.size[i] = Math.min(w, h, d) * (0.18 + rnd() * 0.22);
      sh.life[i] = 1.4 + rnd() * 1.2;
      shardColor.set(base).offsetHSL(0, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.16);
      shards.setColorAt(i, shardColor);
    }
    if (shards.instanceColor) shards.instanceColor.needsUpdate = true;
    const puff = m === "glass" ? "#bff6ff" : m === "lightbox" ? "#fff2a8" : "#f5e6cc";
    for (let k = 0; k < 7; k++)
      dust.spawn(x + (rnd() - 0.5) * w, y + (rnd() - 0.5) * h, z + (rnd() - 0.5) * d, (rnd() - 0.5) * 2, rnd() * 1.4, (rnd() - 0.5) * 2, 0.5 + rnd() * 0.5, puff, 0.9 + rnd() * 0.6, 1.4);
    if (m === "glass" || m === "lightbox")
      for (let k = 0; k < 10; k++) glow.spawn(x, y, z, (rnd() - 0.5) * 7, rnd() * 5, (rnd() - 0.5) * 7, 0.18 + rnd() * 0.16, m === "glass" ? "#7ff0ff" : "#ffe066", 0.7 + rnd() * 0.5);
    if (m === "lightbox") for (let k = 0; k < 16; k++) glow.spawn(x, y, z, (rnd() - 0.5) * 12, (rnd() - 0.2) * 9, (rnd() - 0.5) * 12, 0.3, "#fff3b0", 0.5);
  }

  function splash(x: number, z: number) {
    for (let k = 0; k < 10; k++) dust.spawn(x + (rnd() - 0.5) * 0.6, -0.4, z + (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 2, 3 + rnd() * 3, (rnd() - 0.5) * 2, 0.35 + rnd() * 0.3, "#d8f6ff", 0.8, 0.4);
  }

  function updateShards(dt: number) {
    const m4 = tmpM;
    for (let i = 0; i < sh.n; i++) {
      sh.life[i] -= dt;
      if (sh.life[i] <= 0) {
        sh.n--;
        if (i !== sh.n) {
          for (let a = 0; a < 3; a++) {
            sh.pos[i * 3 + a] = sh.pos[sh.n * 3 + a];
            sh.vel[i * 3 + a] = sh.vel[sh.n * 3 + a];
            sh.rot[i * 3 + a] = sh.rot[sh.n * 3 + a];
            sh.spin[i * 3 + a] = sh.spin[sh.n * 3 + a];
          }
          sh.size[i] = sh.size[sh.n];
          sh.life[i] = sh.life[sh.n];
          if (shards.instanceColor) {
            shards.getColorAt(sh.n, shardColor);
            shards.setColorAt(i, shardColor);
          }
        }
        i--;
        continue;
      }
      sh.vel[i * 3 + 1] -= 9.81 * dt;
      for (let a = 0; a < 3; a++) {
        sh.pos[i * 3 + a] += sh.vel[i * 3 + a] * dt;
        sh.rot[i * 3 + a] += sh.spin[i * 3 + a] * dt;
      }
      // ارتداد على الجزيرة، وسقوط في البحر خارجها
      const onIsland = Math.abs(sh.pos[i * 3]) < ISLAND.hx && Math.abs(sh.pos[i * 3 + 2]) < ISLAND.hz;
      const floor = (onIsland ? 0 : -0.55) + sh.size[i] / 2;
      if (sh.pos[i * 3 + 1] < floor) {
        sh.pos[i * 3 + 1] = floor;
        if (onIsland) {
          sh.vel[i * 3 + 1] *= -0.35;
          sh.vel[i * 3] *= 0.6;
          sh.vel[i * 3 + 2] *= 0.6;
          for (let a = 0; a < 3; a++) sh.spin[i * 3 + a] *= 0.6;
        } else sh.life[i] = Math.min(sh.life[i], 0.15);
      }
      const k = sh.life[i] < 0.4 ? sh.life[i] / 0.4 : 1;
      tmpE.set(sh.rot[i * 3], sh.rot[i * 3 + 1], sh.rot[i * 3 + 2]);
      tmpQ.setFromEuler(tmpE);
      tmpV.set(sh.pos[i * 3], sh.pos[i * 3 + 1], sh.pos[i * 3 + 2]);
      const s = sh.size[i] * k;
      tmpS.set(s, s * 0.8, s * 1.1);
      m4.compose(tmpV, tmpQ, tmpS);
      shards.setMatrixAt(i, m4);
    }
    shards.count = sh.n;
    shards.instanceMatrix.needsUpdate = true;
    if (shards.instanceColor) shards.instanceColor.needsUpdate = true;
  }

  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const tmpV = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  const tmpUp = new THREE.Vector3();
  const tmpP = new THREE.Vector3();
  const frameTimes: number[] = [];
  let last = 0;
  // كل رمية تضيف قذيفة إلى نهاية sim.bodies (الفهرس جزء من البصمة فلا يُعاد استخدامه)، فالمخازن تكبر عند الحاجة
  let snap = new Float32Array(cap * 8 + 64);
  let prevAlive = new Uint8Array(cap + 8);
  let prevY = new Float32Array(cap + 8);
  let prevX = new Float32Array(cap + 8);
  let prevZ = new Float32Array(cap + 8);
  const brokeNow = new Set<number>();
  function ensureCapacity(n: number) {
    if (n * 8 <= snap.length) return;
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
  }
  let lastSim: Sim3 | null = null;
  let trailT = 0;

  function draw(sim: Sim3 | null, opt: { quiet?: boolean } = {}) {
    const now = performance.now();
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    if (last) frameTimes.push(now - last);
    if (frameTimes.length > 900) frameTimes.shift();
    last = now;
    if (sim !== lastSim) {
      prevAlive.fill(0);
      lastSim = sim;
      sh.n = 0;
      dust.clear();
      glow.clear();
    }
    const counts = new Map<string, number>();
    let lead: ReturnType<Sim3["leadProjectile"]> = null;
    if (sim) {
      // أحداث الكسر والتفعيل (العرض فقط)
      const ev = sim.takeEvents();
      brokeNow.clear();
      for (const b of ev.breaks) {
        brokeNow.add(b.i);
        burst(b.x, b.y, b.z, b.vx, b.vy, b.vz, b.m, b.w, b.h, b.d);
      }
      if (ev.breaks.length >= 3 && !reducedMotion) shake = Math.min(1, shake + 0.35 + ev.breaks.length * 0.05);
      for (const a of ev.activations) {
        const color = a.kind === "pulse" ? "#ffb3f1" : a.kind === "comet" ? "#9ff3ff" : "#fff1c2";
        const n = a.kind === "fizzle" ? 8 : 22;
        for (let k = 0; k < n; k++) glow.spawn(a.x, a.y, a.z, (rnd() - 0.5) * 6, (rnd() - 0.5) * 6, (rnd() - 0.5) * 6, 0.25 + rnd() * 0.2, color, 0.6);
      }
      ensureCapacity(sim.bodies.length);
      sim.snapshot(snap);
      for (const b of sim.bodies) {
        const o = b.i * 8;
        if (o + 7 >= snap.length) continue;
        const alive = snap[o + 7] !== 0;
        if (!alive) {
          prevAlive[b.i] = 0;
          continue;
        }
        // رذاذ عند عبور سطح البحر خارج الجزيرة (لا عند الكسر، ولا عند الإزالة بعد السقوط بعيدًا)
        const x = snap[o];
        const y = snap[o + 1];
        const z = snap[o + 2];
        if (prevAlive[b.i] && !brokeNow.has(b.i) && prevY[b.i] >= -0.55 && y < -0.55 && (Math.abs(x) > ISLAND.hx || Math.abs(z) > ISLAND.hz)) splash(x, z);
        prevAlive[b.i] = 1;
        prevX[b.i] = snap[o];
        prevY[b.i] = snap[o + 1];
        prevZ[b.i] = snap[o + 2];
        tmpV.set(snap[o], snap[o + 1], snap[o + 2]);
        tmpQ.set(snap[o + 3], snap[o + 4], snap[o + 5], snap[o + 6]);
        if (b.kind === "projectile") {
          const layer = layers.get("projectile")!;
          const n = counts.get("projectile") ?? 0;
          counts.set("projectile", n + 1);
          tmpS.set(b.w, b.w, b.w);
          tmpM.compose(tmpV, tmpQ, tmpS);
          layer.setMatrixAt(n, tmpM);
          continue;
        }
        if (b.kind === "lantern") {
          const n = counts.get("lantern") ?? 0;
          counts.set("lantern", n + 1);
          tmpS.set(b.w * 0.86, b.h * 0.8, b.d * 0.86);
          tmpM.compose(tmpV, tmpQ, tmpS);
          layers.get("lantern")!.setMatrixAt(n, tmpM);
          // الغطاء: شريحة داكنة أعلى القنديل وأسفله (بالدوران نفسه)
          tmpS.set(b.w, b.h * 0.14, b.d);
          tmpUp.set(0, b.h * 0.43, 0).applyQuaternion(tmpQ);
          tmpM.compose(tmpP.copy(tmpV).add(tmpUp), tmpQ, tmpS);
          layers.get("lanternCap")!.setMatrixAt(n * 2, tmpM);
          tmpM.compose(tmpP.copy(tmpV).sub(tmpUp), tmpQ, tmpS);
          layers.get("lanternCap")!.setMatrixAt(n * 2 + 1, tmpM);
          counts.set("lanternCap", (n + 1) * 2);
          continue;
        }
        const key = b.mat as string;
        const layer = layers.get(key);
        if (!layer) continue;
        const n = counts.get(key) ?? 0;
        counts.set(key, n + 1);
        tmpS.set(b.w, b.h, b.d);
        tmpM.compose(tmpV, tmpQ, tmpS);
        layer.setMatrixAt(n, tmpM);
      }
      lead = sim.leadProjectile();
      // وهج القناديل وأثر القذيفة (جسيمات مضافة قصيرة العمر)
      trailT += dt;
      if (trailT > 1 / 30) {
        trailT = 0;
        for (const b of sim.bodies) {
          if (b.kind !== "lantern" || !b.alive || !b.rb) continue;
          const o = b.i * 8;
          if (rnd() < 0.5) glow.spawn(snap[o], snap[o + 1], snap[o + 2], 0, 0.15, 0, 1.4 + rnd() * 0.3, "#ffb347", 0.12);
        }
        if (lead) glow.spawn(lead.x, lead.y, lead.z, -lead.vx * 0.05, -lead.vy * 0.05, -lead.vz * 0.05, 0.55, "#ffd27a", 0.45);
      }
    }
    for (const [key, l] of layers) {
      l.count = counts.get(key) ?? 0;
      l.instanceMatrix.needsUpdate = true;
    }
    updateShards(dt);
    dust.update(dt, 0.6, 1.6);
    glow.update(dt, 0, 1.2);

    // ── الكاميرا: خلف المرقاب ← تتبع القذيفة ← مشاهدة الانهيار ← عودة
    const busy = sim && !opt.quiet;
    if (lead && sim && sim.stepInShot > 0) {
      camMode = "follow";
      watchT = 0;
    } else if (camMode === "follow" || (camMode === "watch" && busy)) {
      camMode = "watch";
      watchT += dt;
      if (!busy && watchT > 1.2) camMode = "aim";
    } else if (!busy) camMode = "aim";
    if (camMode === "follow" && lead) {
      const hv = Math.max(0.001, Math.hypot(lead.vx, lead.vz));
      // خلف القذيفة وفوقها، ولا تقترب من الملعب أكثر من 7م (تبقى المنشأة كاملة في الإطار)
      const back = 6.5;
      wantPos.set(lead.x - (lead.vx / hv) * back, Math.max(1.6, lead.y + 2.2), Math.max(lead.z - (lead.vz / hv) * back, 6.5));
      wantLook.set(lead.x + lead.vx * 0.3, Math.max(0.8, lead.y + lead.vy * 0.15), lead.z + lead.vz * 0.3);
    } else if (camMode === "watch") {
      const a = 0.35 + Math.min(watchT, 6) * 0.05;
      wantPos.set(Math.sin(a) * 9.5, 4.6, 7.5 + Math.cos(a) * 2.5);
      wantLook.set(0, 1.4, 0);
    } else aimCamera(wantPos, wantLook);
    if (firstFrame) {
      camPos.copy(wantPos);
      camLook.copy(wantLook);
      firstFrame = false;
    }
    const k = 1 - Math.exp(-dt * (camMode === "follow" ? 5 : 2.4));
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
    yawG.rotation.y = -aimYaw;
    pitchG.rotation.x = aimPitch;
    renderer.render(scene, camera);
  }

  function stats(): RenderStats3 {
    const t = [...frameTimes].sort((a, b) => a - b);
    const med = t.length ? t[Math.floor(t.length / 2)] : 0;
    const p95 = t.length ? t[Math.min(t.length - 1, Math.floor(t.length * 0.95))] : 0;
    return {
      frames: t.length,
      medianMs: +med.toFixed(2),
      p95Ms: +p95.toFixed(2),
      fps: med ? +(1000 / med).toFixed(1) : 0,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      dpr: renderer.getPixelRatio(),
      quality,
      shards: sh.n,
    };
  }

  applyQuality(quality);
  return {
    renderer,
    draw,
    resize,
    stats,
    resetStats() {
      frameTimes.length = 0;
      last = 0;
    },
    setQuality: applyQuality,
    get quality() {
      return quality;
    },
    get cameraMode() {
      return camMode;
    },
    /** زاوية المرقاب من خطوات التصويب الصحيحة نفسها، ومسار الدليل المتوقع (تقريب للعرض بلا ارتداد) */
    setAim(yawStep: number, pitchStep: number, powerStep: number, ammo: AmmoKey | null) {
      const a = aimAngles(yawStep, pitchStep);
      aimYaw = a.yaw;
      aimPitch = a.pitch;
      if (!ammo) {
        guideGeo.setDrawRange(0, 0);
        return;
      }
      const v = aimVelocity3(yawStep, pitchStep, powerStep);
      const k = AMMO3[ammo].speedScale;
      const arr = guideGeo.getAttribute("position") as THREE.BufferAttribute;
      let x = LAUNCH3.x;
      let y = LAUNCH3.y;
      let z = LAUNCH3.z;
      let vx = v.x * k;
      let vy = v.y * k;
      let vz = v.z * k;
      let n = 0;
      for (let s = 0; s < 90 && n < GUIDE_N; s++) {
        vy -= 9.81 / 60;
        x += vx / 60;
        y += vy / 60;
        z += vz / 60;
        if (y < 0) break;
        if (s % 3 === 2) arr.setXYZ(n++, x, y, z);
      }
      arr.needsUpdate = true;
      guideGeo.setDrawRange(0, n);
      guideMat.color.set(PALETTE.ammo[ammo]);
    },
    dispose() {
      for (const l of layers.values()) l.dispose();
      shards.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
    },
  };
}
