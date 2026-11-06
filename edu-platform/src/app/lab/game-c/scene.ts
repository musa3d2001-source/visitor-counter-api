/**
 * مختبر فقط (المرحلة ٠، ليس كود إنتاج): مشهد three.js للاتجاه الفني ج «سماء الشروق».
 * يُحمَّل كسولًا بـ import() من lab.tsx، فلا يدخل three.js حزمة أي صفحة أخرى.
 *
 * الفكرة: السماء هي شريط التقدّم. كل قنديل يتحرر يصعد نجمةً في كوكبة، فتنتقل السماء
 * من ليل كحلي إلى شروق ذهبي فوق أفق الكويت (خلفية بعيدة فقط، ليست هدفًا أبدًا).
 * - سماء بأشرطة لونية حادة (toon) يتحكم فيها dawn من ٠ إلى ١، ونجوم تخفت مع الفجر.
 * - شمس تصعد من خلف البحر، وهلال يغيب، وغيوم تتلوّن وردي وذهبي.
 * - MeshToonMaterial بثلاث درجات + حدود حبرية سميكة (قشرة مقلوبة).
 * - كاميرا منظورية مائلة للأسفل، وطبقات على أعماق مختلفة تعطي parallax حقيقيًا.
 * لا نصوص داخل الـ canvas: كل النصوص في DOM فوقه.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export type SceneOpts = {
  angle: number;
  power: number;
  /** عدد القناديل المحررة (٠ إلى ٣)، ومنه تُحسب السماء */
  freed: number;
  reducedMotion: boolean;
  quality: "high" | "low";
  /** نص SVG لأفق الكويت (KuwaitSkyline) يُحوَّل إلى خامة */
  skylineSvg?: string;
};
export type SceneHandle = {
  setAim(angle: number, power: number): void;
  setFreed(n: number): void;
  launch(): void;
  destroy(): void;
};

const INK = 0x141a3a;
const C = {
  sand: 0xf6c978,
  sandDeep: 0xd99a4e,
  tile: 0x18b9a7,
  tileDeep: 0x0b7f86,
  stone: 0x7d95c9,
  stoneDeep: 0x5670a8,
  teak: 0xd2773a,
  frond: 0xe9d36a,
  cream: 0xfff3dc,
  coral: 0xff6b5a,
  turq: 0x1fc7b3,
  gold: 0xffc531,
  goldHi: 0xffe39a,
  brass: 0xf0a52a,
  cloud: 0xf4efff,
  cloudShade: 0xc9bdf5,
  lantern: 0xffd36b,
};

/* ───────────── التصويب (للعرض فقط، ليس فيزياء اللعبة) ───────────── */

const G = 9.8;
const OBS_X = 7.2;
const PIVOT = new THREE.Vector3(OBS_X - 0.15, 5.15, 0.7);
const BARREL = 2.3;
export function velocity(angle: number, power: number) {
  const v = 5.5 + power * 0.105;
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
function pathVel(angle: number, power: number, t: number) {
  const { vx, vy } = velocity(angle, power);
  return new THREE.Vector2(vx, vy - G * t);
}

/* ───────────── ألوان السماء: ليل ← شروق ───────────── */

// كل صف: [ارتفاع نسبي فوق الأفق، لون الليل، لون الشروق]
const SKY_STOPS: [number, string, string][] = [
  [0.0, "#24357E", "#FFC531"],
  [0.07, "#1E2E73", "#FF9F43"],
  [0.15, "#1A2766", "#FF6B5A"],
  [0.25, "#16215C", "#E2508F"],
  [0.38, "#121B52", "#A04AD8"],
  [0.55, "#0E1748", "#5B44D6"],
  [0.75, "#0B1240", "#3A36B8"],
  [1.0, "#070D2E", "#24288F"],
];

const skyVert = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const skyFrag = /* glsl */ `
  uniform float uDawn;
  uniform float uHorizon;
  uniform float uRange;
  uniform vec3 uNight[8];
  uniform vec3 uDay[8];
  uniform float uStop[8];
  uniform float uTime;
  varying vec3 vW;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec3 ramp(float h, float d) {
    vec3 col = mix(uNight[0], uDay[0], d);
    for (int i = 1; i < 8; i++) {
      vec3 c = mix(uNight[i], uDay[i], d);
      // أشرطة حادة: كل شريط بلون واحد (toon)، مع حافة ناعمة جدًا لمنع التسنن
      col = mix(col, c, smoothstep(uStop[i] - 0.004, uStop[i] + 0.004, h));
    }
    return col;
  }
  void main() {
    float h = clamp((vW.y - uHorizon) / uRange, 0.0, 1.0);
    // الفجر يصعد من الأفق: الأشرطة السفلى تسخن قبل العليا
    float d = clamp(uDawn * 1.35 - h * 0.55, 0.0, 1.0);
    vec3 col = ramp(h, d);
    // نجوم تخفت مع الفجر (بلا وميض: تلألؤ بطيء جدًا أقل من مرة في الثانية)
    vec2 cell = floor(vW.xy * 0.9);
    float r = hash(cell);
    if (r > 0.972) {
      vec2 f = fract(vW.xy * 0.9) - 0.5;
      float sz = 0.06 + 0.08 * hash(cell + 3.1);
      float s = smoothstep(sz, sz * 0.4, length(f));
      float tw = 0.75 + 0.25 * sin(uTime * 0.6 + r * 40.0);
      float vis = (1.0 - smoothstep(0.25, 0.85, uDawn)) * smoothstep(0.12, 0.3, h);
      col = mix(col, vec3(1.0, 0.97, 0.88), s * tw * vis);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const waterFrag = /* glsl */ `
  uniform float uDawn;
  uniform float uSunX;
  uniform float uTime;
  uniform vec3 uNear;
  uniform vec3 uFar;
  uniform vec3 uNearDay;
  uniform vec3 uFarDay;
  varying vec3 vW;
  void main() {
    float far = clamp((-vW.z) / 80.0, 0.0, 1.0);
    vec3 near = mix(uNear, uNearDay, uDawn);
    vec3 fa = mix(uFar, uFarDay, uDawn);
    // أشرطة عمق حادة
    float band = floor(far * 5.0) / 5.0;
    vec3 col = mix(near, fa, band);
    // عمود انعكاس الشمس: خطوط أفقية ذهبية
    float w = 2.5 + far * 10.0;
    float colm = 1.0 - smoothstep(w * 0.4, w, abs(vW.x - uSunX));
    float stripe = step(0.55, fract(vW.z * 0.42 + sin(vW.x * 0.35 + uTime * 0.25) * 0.15));
    float refl = colm * stripe * smoothstep(0.1, 0.6, uDawn) * (0.35 + far * 0.65);
    col = mix(col, vec3(1.0, 0.82, 0.38), refl * 0.85);
    // لمعات صغيرة قرب الشاطئ
    float glint = step(0.93, fract(vW.x * 0.21 + vW.z * 0.9)) * step(0.5, fract(vW.z * 0.5)) * (1.0 - far);
    col = mix(col, vec3(1.0), glint * 0.25);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

function cols(list: string[]) {
  return list.map((h) => new THREE.Color(h));
}

/* ───────────── خامات ───────────── */

function toonRamp() {
  const data = new Uint8Array([90, 170, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

function canvasTex(draw: (g: CanvasRenderingContext2D, s: number) => void, size = 256) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d")!;
  draw(g, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** حبيبات الخشب الساج */
const teakTex = () =>
  canvasTex((g, s) => {
    g.fillStyle = "#D2773A";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "#A9541F";
    g.lineWidth = 7;
    for (let i = 0; i < 7; i++) {
      const y = 18 + i * 36;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(s * 0.3, y - 10, s * 0.6, y + 12, s, y - 4);
      g.stroke();
    }
    g.fillStyle = "#F09A55";
    g.fillRect(0, 0, s, 10);
  });

/** سعف منسوج: نسيج قطري بلونين */
const frondTex = () =>
  canvasTex((g, s) => {
    g.fillStyle = "#E9D36A";
    g.fillRect(0, 0, s, s);
    const n = 8;
    const c = s / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        g.fillStyle = (i + j) % 2 ? "#C9A93E" : "#F5E58E";
        g.save();
        g.translate(i * c + c / 2, j * c + c / 2);
        g.rotate((i + j) % 2 ? 0.5 : -0.5);
        g.fillRect(-c * 0.42, -c * 0.16, c * 0.84, c * 0.32);
        g.restore();
      }
  });

/** حجر بحري: نقاط ومسام */
const stoneTex = () =>
  canvasTex((g, s) => {
    g.fillStyle = "#7D95C9";
    g.fillRect(0, 0, s, s);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = rnd() > 0.5 ? "#5670A8" : "#A9BCE6";
      g.beginPath();
      g.arc(rnd() * s, rnd() * s, 3 + rnd() * 9, 0, Math.PI * 2);
      g.fill();
    }
  });

/** زجاج ملوّن: خلايا بألوان المواد وتحديد رصاصي */
const glassTex = () =>
  canvasTex((g, s) => {
    const colors = ["#5B9BFF", "#FF85B8", "#34D9A0", "#FFC93F", "#A880FF", "#FF6B5A", "#3DD0C4"];
    g.fillStyle = "#1B1F4A";
    g.fillRect(0, 0, s, s);
    const pts: [number, number][] = [
      [0, 0], [100, 0], [180, 0], [256, 0],
      [0, 90], [70, 110], [150, 80], [256, 100],
      [0, 180], [110, 170], [200, 190], [256, 170],
      [0, 256], [80, 256], [170, 256], [256, 256],
    ];
    const cells = [
      [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6],
      [4, 5, 9, 8], [5, 6, 10, 9], [6, 7, 11, 10],
      [8, 9, 13, 12], [9, 10, 14, 13], [10, 11, 15, 14],
    ];
    cells.forEach((c, i) => {
      g.fillStyle = colors[i % colors.length];
      g.beginPath();
      c.forEach((k, j) => (j ? g.lineTo(...pts[k]) : g.moveTo(...pts[k])));
      g.closePath();
      g.fill();
      g.strokeStyle = "#141A3A";
      g.lineWidth = 9;
      g.stroke();
    });
    g.fillStyle = "rgba(255,255,255,.35)";
    g.beginPath();
    g.moveTo(30, 30);
    g.lineTo(70, 30);
    g.lineTo(30, 80);
    g.fill();
  });

/** صندوق الضوء: نجمة رباعية على أرض ذهبية */
const lightBoxTex = () =>
  canvasTex((g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 10, s / 2, s / 2, s * 0.7);
    gr.addColorStop(0, "#FFF6D0");
    gr.addColorStop(1, "#FFC531");
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "#E08A00";
    g.lineWidth = 14;
    g.strokeRect(7, 7, s - 14, s - 14);
    g.fillStyle = "#FFFFFF";
    g.beginPath();
    const c = s / 2;
    g.moveTo(c, 40);
    g.quadraticCurveTo(c + 12, c - 12, s - 40, c);
    g.quadraticCurveTo(c + 12, c + 12, c, s - 40);
    g.quadraticCurveTo(c - 12, c + 12, 40, c);
    g.quadraticCurveTo(c - 12, c - 12, c, 40);
    g.fill();
  });

/** هالة دائرية ناعمة للتوهج (بلا bloom) */
const haloTex = () =>
  canvasTex((g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.35, "rgba(255,255,255,.55)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  }, 128);

/** ذيل الشهاب: تدرج شفافية على الطول */
const tailTex = () =>
  canvasTex((g, s) => {
    const gr = g.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(0, "rgba(255,255,255,0)");
    gr.addColorStop(0.6, "rgba(255,255,255,.7)");
    gr.addColorStop(1, "rgba(255,255,255,1)");
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  }, 64);

/* ───────────── المشهد ───────────── */

export function createScene(host: HTMLElement, opts: SceneOpts): SceneHandle {
  const low = opts.quality === "low";
  const renderer = new THREE.WebGLRenderer({ antialias: !low, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
  const ramp = toonRamp();
  const disposables: { dispose(): void }[] = [ramp];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  const toon = (color: number, extra: Partial<THREE.MeshToonMaterialParameters> = {}) =>
    keep(new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...extra }));
  const inkMat = keep(new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
  const basic = (color: number | THREE.Color, extra: Partial<THREE.MeshBasicMaterialParameters> = {}) =>
    keep(new THREE.MeshBasicMaterial({ color, ...extra }));

  /** جسم بحد حبري سميك (قشرة مقلوبة مكبّرة) */
  function solid(geo: THREE.BufferGeometry, mat: THREE.Material, ink = 0.06) {
    keep(geo);
    const g = new THREE.Group();
    const m = new THREE.Mesh(geo, mat);
    g.add(m);
    if (ink > 0) {
      geo.computeBoundingBox();
      const b = geo.boundingBox!;
      const sz = new THREE.Vector3();
      b.getSize(sz);
      const o = new THREE.Mesh(geo, inkMat);
      o.scale.set(1 + (ink * 2) / Math.max(sz.x, 0.01), 1 + (ink * 2) / Math.max(sz.y, 0.01), 1 + (ink * 2) / Math.max(sz.z, 0.01));
      g.add(o);
    }
    return g;
  }
  const box = (w: number, h: number, d: number, r = 0.08) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2));

  /* ── السماء ── */
  const HORIZON = -0.9;
  const skyU = {
    uDawn: { value: 0 },
    uHorizon: { value: HORIZON },
    uRange: { value: 70 },
    uNight: { value: cols(SKY_STOPS.map((s) => s[1])) },
    uDay: { value: cols(SKY_STOPS.map((s) => s[2])) },
    uStop: { value: SKY_STOPS.map((s) => s[0]) },
    uTime: { value: 0 },
  };
  const sky = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(900, 300)),
    keep(new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: skyVert, fragmentShader: skyFrag, depthWrite: false })),
  );
  sky.position.set(0, 120, -110);
  scene.add(sky);

  /* ── الشمس (تصعد من خلف البحر) ── */
  const sun = new THREE.Group();
  const sunRings: [number, number, number][] = [
    [15, 0xffb347, 0.16],
    [11.5, 0xffc531, 0.22],
    [8.6, 0xffd25e, 0.38],
  ];
  sunRings.forEach(([r, c, o]) => {
    const m = new THREE.Mesh(keep(new THREE.CircleGeometry(r, 64)), basic(c, { transparent: true, opacity: o, depthWrite: false }));
    sun.add(m);
  });
  const sunDisc = new THREE.Mesh(keep(new THREE.CircleGeometry(6.2, 64)), basic(0xfff1b8));
  sunDisc.position.z = 0.1;
  sun.add(sunDisc);
  const sunCore = new THREE.Mesh(keep(new THREE.CircleGeometry(5.1, 64)), basic(0xffd84a));
  sunCore.position.z = 0.2;
  sun.add(sunCore);
  sun.position.set(-3, -10, -100);
  scene.add(sun);

  /* ── الهلال (يغيب مع الفجر) ── */
  const moonShape = new THREE.Shape();
  moonShape.absarc(0, 0, 2.4, Math.PI * 0.5, Math.PI * 1.5, false);
  moonShape.absarc(0.9, 0, 2.2, Math.PI * 1.5, Math.PI * 0.5, true);
  const moonMat = basic(0xffe29a, { transparent: true });
  const moon = new THREE.Mesh(keep(new THREE.ShapeGeometry(moonShape, 24)), moonMat);
  moon.rotation.z = -0.5;
  moon.position.set(26, 34, -90);
  scene.add(moon);

  /* ── غيوم بعيدة تتلون مع الفجر ── */
  const farCloudMat = toon(0x2a3a86);
  const farClouds = new THREE.Group();
  const cloudBlob = (x: number, y: number, z: number, s: number) => {
    const g = new THREE.Group();
    [
      [0, 0, 1.6],
      [1.8, -0.3, 1.2],
      [-1.8, -0.35, 1.15],
      [0.9, 0.7, 1.1],
      [-0.8, 0.55, 1.0],
    ].forEach(([cx, cy, r]) => {
      const m = new THREE.Mesh(keep(new THREE.SphereGeometry(r, 18, 12)), farCloudMat);
      m.position.set(cx, cy, 0);
      m.scale.z = 0.4;
      g.add(m);
    });
    g.position.set(x, y, z);
    g.scale.setScalar(s);
    farClouds.add(g);
  };
  cloudBlob(-30, 22, -80, 2.4);
  cloudBlob(14, 28, -85, 2.0);
  cloudBlob(38, 16, -80, 2.6);
  cloudBlob(-12, 36, -85, 1.6);
  scene.add(farClouds);

  /* ── البحر ── */
  const waterU = {
    uDawn: { value: 0 },
    uSunX: { value: -3 },
    uTime: { value: 0 },
    uNear: { value: new THREE.Color("#126A86") },
    uFar: { value: new THREE.Color("#1B2C6E") },
    uNearDay: { value: new THREE.Color("#18B9A7") },
    uFarDay: { value: new THREE.Color("#B85CA8") },
  };
  const water = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(500, 130)),
    keep(new THREE.ShaderMaterial({ uniforms: waterU, vertexShader: skyVert, fragmentShader: waterFrag })),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, HORIZON, -45);
  scene.add(water);

  /* ── أفق الكويت (من رسم KuwaitSkyline الأصلي) ── */
  const skylineMat = basic(0x0b1238, { transparent: true, depthWrite: false });
  if (opts.skylineSvg) {
    const svg = opts.skylineSvg
      .replace(/currentColor/g, "#ffffff")
      .replace(/<svg([^>]*?)class="[^"]*"/, "<svg$1")
      .replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="280"');
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = 2400;
      cv.height = 280;
      cv.getContext("2d")!.drawImage(img, 0, 0, 2400, 280);
      const t = keep(new THREE.CanvasTexture(cv));
      t.colorSpace = THREE.SRGBColorSpace;
      skylineMat.map = t;
      skylineMat.needsUpdate = true;
      skyline.visible = true;
      dirty = true;
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  // أبراج الكويت في الرسم عند ٦١٪ من العرض: نزيح الطبقة لتقع الأبراج أمام الشمس تقريبًا
  const skyline = new THREE.Mesh(keep(new THREE.PlaneGeometry(92, 10.7)), skylineMat);
  skyline.position.set(-9, HORIZON + 5.35 - 0.05, -86);
  skyline.visible = false;
  scene.add(skyline);

  /* ── شاطئ قريب: كثبان منخفضة بين الأفق والملعب (طبقة parallax وسطى) ── */
  const duneMat = toon(0x1c2a68);
  const dunes = new THREE.Group();
  [
    [-27, -34, 8, 1.0],
    [-12, -38, 6, 0.7],
    [19, -34, 9, 1.1],
    [34, -38, 6, 0.8],
  ].forEach(([x, z, r, h]) => {
    const m = new THREE.Mesh(keep(new THREE.SphereGeometry(r, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2)), duneMat);
    m.scale.y = h / r;
    m.position.set(x, HORIZON, z);
    dunes.add(m);
  });
  scene.add(dunes);

  /* ── الكورنيش: أرض الملعب ── */
  const ground = new THREE.Group();
  const slab = solid(box(34, 1.8, 6, 0.3), toon(C.sand), 0.07);
  slab.position.set(0, -0.9, 0);
  ground.add(slab);
  const band = solid(box(34.2, 0.55, 0.5, 0.15), toon(C.tile), 0.05);
  band.position.set(0, -0.6, 3.0);
  ground.add(band);
  // بلاط الكورنيش: مربعات فيروزية وذهبية على الحافة الأمامية
  const tileA = toon(C.gold);
  const tileB = toon(0x9ff3e4);
  const tileGeo = keep(new THREE.BoxGeometry(0.3, 0.3, 0.08));
  for (let i = -16; i <= 16; i += 1.2) {
    const t = new THREE.Mesh(tileGeo, Math.round(i / 1.2) % 2 ? tileA : tileB);
    t.position.set(i, -0.6, 3.27);
    t.rotation.z = Math.PI / 4;
    ground.add(t);
  }
  scene.add(ground);

  /* ── البنية: المواد الست ── */
  const SX = -5.4;
  const struct = new THREE.Group();
  const mStone = toon(0xffffff, { map: keep(stoneTex()) });
  const mTeak = toon(0xffffff, { map: keep(teakTex()) });
  const mFrond = toon(0xffffff, { map: keep(frondTex()) });
  const place = (o: THREE.Object3D, x: number, y: number, z = 0) => (o.position.set(x, y, z), struct.add(o), o);

  // منصة من الحجر البحري
  place(solid(box(6.4, 0.5, 2.6, 0.15), toon(C.stoneDeep)), SX, 0.25);
  // الطابق الأرضي: عمودان من الحجر البحري
  place(solid(box(1.0, 2.1, 1.3, 0.12), mStone), SX - 2.0, 0.5 + 1.05);
  place(solid(box(1.0, 2.1, 1.3, 0.12), mStone), SX + 2.0, 0.5 + 1.05);
  // لوح ساج
  place(solid(box(5.6, 0.42, 1.5, 0.1), mTeak), SX, 2.6 + 0.21);
  // الطابق الأول: عمودان من السعف وبينهما زجاج ملوّن
  place(solid(box(0.55, 2.0, 1.2, 0.1), mFrond), SX - 2.15, 3.02 + 1.0);
  place(solid(box(0.55, 2.0, 1.2, 0.1), mFrond), SX + 2.15, 3.02 + 1.0);
  const glassMat = keep(new THREE.MeshBasicMaterial({ map: keep(glassTex()), transparent: true, opacity: 0.5 }));
  place(solid(box(3.4, 1.9, 0.18, 0.05), glassMat, 0.05), SX, 3.02 + 0.98, 0.5);
  // عارضة سعف علوية
  place(solid(box(5.2, 0.38, 1.4, 0.1), mFrond), SX, 5.02 + 0.19);
  // صندوق ساج صغير وحجر جانبي
  place(solid(box(1.1, 1.1, 1.1, 0.1), mTeak), SX + 3.9, 0.55).rotation.y = 0.25;
  place(solid(box(1.2, 0.8, 1.0, 0.18), mStone), SX - 3.9, 0.4).rotation.y = -0.2;

  // غيمة شديدة الارتداد على القمة
  const cloud = new THREE.Group();
  const cMat = toon(C.cloud);
  [
    [0, 0.35, 0.75],
    [0.75, 0.15, 0.6],
    [-0.72, 0.12, 0.58],
    [0.35, 0.78, 0.5],
    [-0.35, 0.72, 0.48],
  ].forEach(([x, y, r]) => {
    const p = solid(new THREE.SphereGeometry(r, 22, 16), cMat, 0.05);
    p.position.set(x, y, 0);
    cloud.add(p);
  });
  cloud.position.set(SX + 1.25, 5.4 + 0.1, 0);
  struct.add(cloud);
  // نابض صغير تحت الغيمة يوحي بالارتداد
  const coil = new THREE.Mesh(keep(new THREE.TorusGeometry(0.28, 0.07, 8, 20)), toon(C.coral));
  coil.rotation.x = Math.PI / 2;
  coil.position.set(SX + 1.25, 5.48, 0);
  struct.add(coil);

  // صندوق ضوء: ينفجر نبضة تدفع ما حوله
  const lbMat = toon(0xffffff, { map: keep(lightBoxTex()), emissive: 0xffb000, emissiveIntensity: 0.35 });
  const lightBox = place(solid(box(1.0, 1.0, 1.0, 0.1), lbMat), SX - 1.3, 5.4 + 0.5);
  const pulse = new THREE.Mesh(keep(new THREE.RingGeometry(0.75, 0.9, 40)), basic(C.gold, { transparent: true, opacity: 0.5, depthWrite: false }));
  pulse.position.set(SX - 1.3, 5.9, 0.62);
  struct.add(pulse);
  scene.add(struct);

  /* ── القناديل ── */
  const haloT = keep(haloTex());
  function makeLantern(scale = 1) {
    const g = new THREE.Group();
    const body = solid(new THREE.CylinderGeometry(0.34, 0.4, 0.78, 6), toon(C.lantern, { emissive: 0xffa600, emissiveIntensity: 0.55 }), 0.04);
    g.add(body);
    const ribs = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 6)), toon(C.coral));
    ribs.position.y = -0.38;
    g.add(ribs);
    const cap = solid(new THREE.ConeGeometry(0.46, 0.38, 6), toon(C.coral), 0.04);
    cap.position.y = 0.58;
    g.add(cap);
    const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(0.16, 0.045, 8, 18)), toon(C.gold));
    ring.position.y = 0.88;
    g.add(ring);
    const halo = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.6, 2.6)), basic(0xffc531, { map: haloT, transparent: true, opacity: 0.55, depthWrite: false }));
    halo.position.z = -0.3;
    g.add(halo);
    g.scale.setScalar(scale);
    return g;
  }
  // مواضع الحبس: داخل الإطار الزجاجي، وبين العمودين، وعلى القمة
  const TRAPPED = [
    new THREE.Vector3(SX, 1.15, 0.1),
    new THREE.Vector3(SX - 0.1, 3.75, 0.05),
    new THREE.Vector3(SX + 0.05, 5.98, 0.1),
  ];
  // نجوم الكوكبة (فوق البنية، في عمق وسط لأجل parallax). مواضعها تُضبط حسب شكل الشاشة في layoutSky()
  const STAR_POS = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const DECOR = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const lanterns = TRAPPED.map((p) => {
    const l = makeLantern();
    l.position.copy(p);
    scene.add(l);
    return l;
  });

  /* ── الكوكبة ── */
  const starShape = (r: number) => {
    const s = new THREE.Shape();
    s.moveTo(0, r);
    const k = r * 0.22;
    s.quadraticCurveTo(k, k, r, 0);
    s.quadraticCurveTo(k, -k, 0, -r);
    s.quadraticCurveTo(-k, -k, -r, 0);
    s.quadraticCurveTo(-k, k, 0, r);
    return s;
  };
  const conste = new THREE.Group();
  const lineMat = keep(new THREE.LineDashedMaterial({ color: 0xfff1c4, dashSize: 0.35, gapSize: 0.3, transparent: true, opacity: 0.7 }));
  const chain = () => [DECOR[0], STAR_POS[0], STAR_POS[1], DECOR[1], STAR_POS[1], STAR_POS[2], DECOR[2]];
  const lineGeo = keep(new THREE.BufferGeometry().setFromPoints(chain()));
  const line = new THREE.Line(lineGeo, lineMat);
  conste.add(line);
  const decorMeshes = DECOR.map(() => {
    const m = new THREE.Mesh(keep(new THREE.ShapeGeometry(starShape(0.35))), basic(0xfff1c4));
    conste.add(m);
    return m;
  });
  const slotStars = STAR_POS.map((p) => {
    const g = new THREE.Group();
    // مكان النجمة المنتظرة: حدّ نجمة منقّط
    const eg = keep(new THREE.BufferGeometry().setFromPoints(starShape(1.0).getPoints(10)));
    const empty = new THREE.LineLoop(eg, keep(new THREE.LineDashedMaterial({ color: 0xfff1c4, dashSize: 0.22, gapSize: 0.16, transparent: true, opacity: 0.85 })));
    empty.computeLineDistances();
    g.add(empty);
    const lit = new THREE.Group();
    const halo = new THREE.Mesh(keep(new THREE.PlaneGeometry(4.6, 4.6)), basic(0xffc531, { map: haloT, transparent: true, opacity: 0.75, depthWrite: false }));
    lit.add(halo);
    const outer = new THREE.Mesh(keep(new THREE.ShapeGeometry(starShape(1.25))), basic(0xff9f43));
    outer.position.z = 0.01;
    lit.add(outer);
    const inner = new THREE.Mesh(keep(new THREE.ShapeGeometry(starShape(0.95))), basic(0xffe39a));
    inner.position.z = 0.02;
    lit.add(inner);
    g.add(lit);
    conste.add(g);
    void p;
    return { g, empty, lit };
  });
  scene.add(conste);

  /** يضع الكوكبة حسب شكل الشاشة: فوق البنية على الشاشات العريضة، وأعلى وأقرب للوسط على الطولية */
  function layoutSky(portrait: boolean, topY: number) {
    const y = Math.min(portrait ? 17 : 11.2, topY - 3);
    const xs = portrait ? [-7.4, -4.2, -0.9] : [-12.2, -9.0, -5.8];
    STAR_POS[0].set(xs[0], y, -8);
    STAR_POS[1].set(xs[1], y + 2.0, -8);
    STAR_POS[2].set(xs[2], y + 0.8, -8);
    DECOR[0].set(xs[0] - 2.2, y + 2.4, -8);
    DECOR[1].set(xs[1] + 1.4, y + 3.4, -8);
    DECOR[2].set(xs[2] + 2.6, y + 2.2, -8);
    slotStars.forEach((s, i) => s.g.position.copy(STAR_POS[i]));
    decorMeshes.forEach((m, i) => m.position.copy(DECOR[i]));
    lineGeo.setFromPoints(chain());
    line.computeLineDistances();
  }

  // أثر صعود القنديل: نقاط ذهبية مخصصة مسبقًا (٧ لكل قنديل)
  const trail = new THREE.Group();
  scene.add(trail);
  const dotGeo = keep(new THREE.CircleGeometry(0.11, 12));
  const trailDots = [0, 1, 2].map(() =>
    Array.from({ length: 7 }, (_, j) => {
      const d = new THREE.Mesh(dotGeo, basic(0xffd25e, { transparent: true, opacity: 0.9 - (j + 1) * 0.11, depthWrite: false }));
      d.scale.setScalar(1 - (j + 1) * 0.09);
      trail.add(d);
      return d;
    }),
  );

  /* ── المِرقاب ── */
  const obs = new THREE.Group();
  const plinth = solid(new THREE.CylinderGeometry(2.4, 2.6, 0.6, 8), toon(C.stoneDeep), 0.06);
  plinth.position.y = 0.3;
  obs.add(plinth);
  const stripes = [C.coral, C.cream, C.coral];
  stripes.forEach((c, i) => {
    const seg = solid(new THREE.CylinderGeometry(1.35 - i * 0.07, 1.45 - i * 0.07, 1.05, 24), toon(c), 0.05);
    seg.position.y = 0.6 + 0.525 + i * 1.05;
    obs.add(seg);
  });
  const gallery = solid(new THREE.CylinderGeometry(1.75, 1.75, 0.24, 24), toon(C.gold), 0.05);
  gallery.position.y = 3.8;
  obs.add(gallery);
  const dome = solid(new THREE.SphereGeometry(1.42, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), toon(C.turq), 0.06);
  dome.position.y = 3.92;
  obs.add(dome);
  const finial = solid(new THREE.SphereGeometry(0.2, 12, 10), toon(C.gold), 0.04);
  finial.position.y = 5.42;
  obs.add(finial);
  const door = solid(box(0.8, 1.2, 0.3, 0.12), toon(0x3a2a6b), 0.04);
  door.position.set(0, 1.2, 1.38);
  obs.add(door);
  [1.95, 2.95].forEach((y, i) => {
    const w = new THREE.Mesh(keep(new THREE.CircleGeometry(0.22, 16)), basic(i ? 0xffe39a : 0xffc531));
    w.position.set(i ? -0.55 : 0.6, y, 1.36);
    obs.add(w);
  });
  obs.position.set(OBS_X, 0, 0);
  scene.add(obs);

  // المنظار: يدور حول المحور
  const scope = new THREE.Group();
  const barrel = solid(new THREE.CylinderGeometry(0.33, 0.42, BARREL + 0.3, 20), toon(C.gold), 0.06);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.x = -BARREL / 2 + 0.1;
  scope.add(barrel);
  const bandA = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.45, 0.45, 0.22, 20)), toon(C.coral));
  bandA.rotation.z = Math.PI / 2;
  bandA.position.x = -0.5;
  scope.add(bandA);
  const lens = solid(new THREE.CylinderGeometry(0.4, 0.4, 0.18, 20), toon(C.turq), 0.05);
  lens.rotation.z = Math.PI / 2;
  lens.position.x = -BARREL + 0.05;
  scope.add(lens);
  const hub = solid(new THREE.SphereGeometry(0.5, 16, 12), toon(C.brass), 0.05);
  scope.add(hub);
  scope.position.copy(PIVOT);
  scene.add(scope);

  /* ── الشهاب ودليل التصويب ── */
  const meteor = new THREE.Group();
  // نواة صخرية مضيئة: كرة مفلطحة الأوجه بلونين، ولمعة بيضاء، وشرارات خلفها
  const coreGeo = new THREE.IcosahedronGeometry(0.56, 1);
  coreGeo.computeVertexNormals(); // هندسة غير مفهرسة: عمودي لكل وجه، فتظهر الأوجه بأسلوب toon
  const core = solid(coreGeo, toon(0xffc531, { emissive: 0xff7a00, emissiveIntensity: 0.22 }), 0.07);
  meteor.add(core);
  const shine = new THREE.Mesh(keep(new THREE.CircleGeometry(0.15, 14)), basic(0xffffff));
  shine.position.set(-0.18, 0.2, 0.6);
  meteor.add(shine);
  const shine2 = new THREE.Mesh(keep(new THREE.CircleGeometry(0.07, 10)), basic(0xffffff));
  shine2.position.set(0.02, 0.32, 0.6);
  meteor.add(shine2);
  const mHalo = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.8, 2.8)), basic(0xffd25e, { map: haloT, transparent: true, opacity: 0.6, depthWrite: false }));
  meteor.add(mHalo);
  const tailT = keep(tailTex());
  const tail = new THREE.Group();
  [
    [0.52, 4.6, 0xd9468f, 0.55],
    [0.42, 3.6, 0xff6b5a, 0.8],
    [0.3, 2.5, 0xffc531, 0.95],
  ].forEach(([r, len, c, o], i) => {
    const cone = new THREE.Mesh(keep(new THREE.ConeGeometry(r, len, 18, 1, true)), basic(c, { map: tailT, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide }));
    // قمة المخروط (الشفافة) إلى الخلف، وقاعدته عند النواة
    cone.rotation.x = Math.PI;
    cone.position.y = -len / 2;
    // خلف النواة حتى لا يغطيها الذيل الشفاف
    cone.position.z = -0.45 + i * 0.02;
    tail.add(cone);
  });
  meteor.add(tail);
  scene.add(meteor);

  const guide = new THREE.Group();
  const guideDots: THREE.Mesh[] = [];
  for (let i = 0; i < 10; i++) {
    const d = new THREE.Mesh(keep(new THREE.CircleGeometry(0.15 - i * 0.008, 14)), basic(0xffffff, { transparent: true, opacity: 0.95 - i * 0.08, depthWrite: false }));
    guide.add(d);
    guideDots.push(d);
  }
  scene.add(guide);

  /* ── الإضاءة ── */
  const hemi = new THREE.HemisphereLight(0x4057a8, 0x1a1530, 1.6);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xafc3ff, 2.4);
  key.position.set(4, 12, 10);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffb347, 0);
  rim.position.set(-6, 4, -10);
  scene.add(rim);

  /* ── الحالة ── */
  let angle = opts.angle;
  let power = opts.power;
  let freedTarget = Math.max(0, Math.min(3, opts.freed));
  let freedNow = freedTarget;
  let flightT = -1; // -1: الشهاب ثابت للعرض
  let dirty = true;
  let raf = 0;
  let last = performance.now();
  let time = 0;
  const pointer = { x: 0, y: 0 };

  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();
  const lerpHex = (a: number | string, b: number | string, t: number) => tmpA.set(a).lerp(tmpB.set(b), t).clone();

  function updateAim() {
    scope.rotation.z = -(angle * Math.PI) / 180;
    guideDots.forEach((d, i) => {
      const p = pathAt(angle, power, 0.06 + i * 0.055);
      d.position.copy(p);
      d.position.z += 0.4;
    });
  }

  /** موضع الشهاب المعروض: في منتصف الطيران نحو البنية */
  const SHOW_T = 0.78;
  function placeMeteor(t: number) {
    const p = pathAt(angle, power, t);
    const v = pathVel(angle, power, t);
    meteor.position.copy(p);
    // الذيل (المحور ‎-y‎ محليًا) يتجه عكس السرعة
    tail.rotation.z = Math.atan2(-v.x, v.y);
  }

  function applyDawn(f: number) {
    const dawn = Math.min(1, f / 3);
    skyU.uDawn.value = dawn;
    waterU.uDawn.value = dawn;
    // الشمس تصعد: تحت البحر ليلًا، فوق الأفق عند اكتمال العالم
    sun.position.y = THREE.MathUtils.lerp(-14, 7.5, Math.pow(dawn, 0.85));
    moonMat.opacity = Math.max(0, 1 - dawn * 1.6);
    moon.visible = moonMat.opacity > 0.01;
    farCloudMat.color.copy(lerpHex("#2A3A86", "#FFB38A", dawn));
    duneMat.color.copy(lerpHex("#1C2A68", "#7A3E8F", dawn));
    skylineMat.color.copy(lerpHex("#0B1238", "#5A2A78", dawn));
    hemi.color.copy(lerpHex("#4057A8", "#FFB08A", dawn));
    hemi.groundColor.copy(lerpHex("#1A1530", "#5A3060", dawn));
    key.color.copy(lerpHex("#AFC3FF", "#FFE2B0", dawn));
    key.intensity = 2.3 + dawn * 0.6;
    rim.intensity = dawn * 2.2;

    // القناديل: المحررة تصعد إلى نجمتها. ترتيب التحرير من القمة إلى الأسفل
    for (let i = 0; i < 3; i++) {
      const k = THREE.MathUtils.clamp(f - i, 0, 1);
      const from = TRAPPED[2 - i];
      const to = STAR_POS[i];
      const lantern = lanterns[2 - i];
      const mid = new THREE.Vector3((from.x + to.x) / 2 - 1.2, Math.max(from.y, to.y) + 1.5, (from.z + to.z) / 2);
      const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
      const p = curve.getPoint(k * 0.86);
      lantern.position.copy(p);
      lantern.visible = k < 0.98;
      lantern.scale.setScalar(1 - k * 0.35);
      slotStars[i].lit.visible = k >= 0.98;
      slotStars[i].empty.visible = k < 0.98;
      const show = k > 0.02 && k < 0.98;
      trailDots[i].forEach((d, j) => {
        d.visible = show && k * 0.86 - (j + 1) * 0.07 > 0;
        if (d.visible) d.position.copy(curve.getPoint(k * 0.86 - (j + 1) * 0.07));
      });
    }
  }

  /* ── الكاميرا والإطار ── */
  let aspect = 1;
  const view = { d: 30, cy: 6 };
  function frame() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    aspect = w / h;
    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const portrait = aspect < 0.8;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // عرض الملعب المطلوب: أضيق على الشاشات الطولية (يُقص طرف المِرقاب قليلًا)
    const halfW = portrait ? 9.3 : aspect < 1.2 ? 11.4 : 12.8;
    const dW = halfW / (tan * aspect);
    // مساحة لوح التحكم أسفل الشاشة وشريط HUD أعلاها (نسب تقريبية حسب الشكل)
    const dockFrac = portrait ? (aspect < 0.6 ? 0.31 : 0.22) : aspect < 1.2 ? 0.2 : 0.16;
    const topFrac = portrait ? (aspect < 0.6 ? 0.25 : 0.15) : 0.11;
    // الارتفاع المطلوب: من تحت الأرض إلى أعلى البنية والكوكبة
    const contentTop = portrait ? 12 : 13.2;
    const dH = (contentTop + 1.8) / (1 - dockFrac - topFrac) / (2 * tan);
    const d = Math.max(dW, dH);
    const visH = 2 * d * tan;
    const bottom = -1.8 - dockFrac * visH;
    view.d = d;
    view.cy = bottom + visH / 2;
    layoutSky(portrait, bottom + visH * (1 - topFrac));
    applyDawn(freedNow);
    dirty = true;
  }
  function placeCamera() {
    const drift = opts.reducedMotion ? 0 : Math.sin(time * 0.12) * 0.35;
    const px = opts.reducedMotion ? 0 : pointer.x * 0.7;
    const py = opts.reducedMotion ? 0 : pointer.y * 0.35;
    camera.position.set(0.4 + drift + px, view.cy + 3.2 + py, view.d);
    camera.lookAt(0.4 + drift * 0.5 + px * 0.4, view.cy, 0);
  }

  /* ── الحلقة ── */
  function tick(now: number) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (document.hidden) return;
    const animating = !opts.reducedMotion;
    if (animating) time += dt;

    if (Math.abs(freedNow - freedTarget) > 0.0005) {
      freedNow = opts.reducedMotion ? freedTarget : freedNow + Math.sign(freedTarget - freedNow) * Math.min(Math.abs(freedTarget - freedNow), dt * 0.7);
      applyDawn(freedNow);
      dirty = true;
    }
    if (flightT >= 0) {
      flightT += dt;
      const p = pathAt(angle, power, flightT);
      placeMeteor(flightT);
      if (p.y < -0.2 || p.x < -16 || flightT > 3.2) {
        flightT = -1;
        placeMeteor(SHOW_T);
      }
      dirty = true;
    }
    if (!animating && !dirty) return;

    skyU.uTime.value = time;
    waterU.uTime.value = time;
    if (animating) {
      // حركة هادئة: لا وميض، كل الدورات أبطأ من مرة في الثانية
      const s = 1 + ((time * 0.6) % 1) * 0.9;
      pulse.scale.setScalar(s);
      (pulse.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - ((time * 0.6) % 1));
      lightBox.rotation.y = Math.sin(time * 0.5) * 0.08;
      cloud.position.y = 5.5 + Math.sin(time * 1.1) * 0.05;
      mHalo.scale.setScalar(1 + Math.sin(time * 2.2) * 0.04);
      lanterns.forEach((l, i) => (l.rotation.z = Math.sin(time * 0.9 + i) * 0.05));
      farClouds.position.x = Math.sin(time * 0.03) * 3;
    }
    placeCamera();
    renderer.render(scene, camera);
    dirty = false;
  }

  const onMove = (e: PointerEvent) => {
    pointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
    pointer.y = -(e.clientY / window.innerHeight - 0.5) * 2;
  };
  window.addEventListener("pointermove", onMove);
  const ro = new ResizeObserver(frame);
  ro.observe(host);

  frame();
  updateAim();
  placeMeteor(SHOW_T);
  applyDawn(freedNow);
  // أول إطار فورًا (مهم لتقليل الحركة وللقطات)
  placeCamera();
  renderer.render(scene, camera);
  raf = requestAnimationFrame(tick);

  return {
    setAim(a, p) {
      angle = a;
      power = p;
      updateAim();
      if (flightT < 0) placeMeteor(SHOW_T);
      dirty = true;
    },
    setFreed(n) {
      freedTarget = Math.max(0, Math.min(3, n));
      if (opts.reducedMotion) {
        freedNow = freedTarget;
        applyDawn(freedNow);
      }
      dirty = true;
    },
    launch() {
      flightT = 0;
      dirty = true;
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
