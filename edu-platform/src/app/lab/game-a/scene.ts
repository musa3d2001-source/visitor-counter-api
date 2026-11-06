/**
 * مختبر فقط (ليس كود إنتاج): مشهد three.js لاتجاه «فانوس الساحل».
 * يُحمَّل كسولًا بـ import() من lab.tsx فلا يدخل three.js حزمة أي صفحة أخرى.
 * أسلوب toon: MeshToonMaterial بتدرج ٤ درجات، حواف سميكة بقشرة مقلوبة، هالات ناعمة بلا post-processing،
 * كاميرا منظورية مائلة، وطبقات عمق (سماء، أفق، بحر، جزر، بنية) تعطي parallax حقيقيًا مع حركة الكاميرا.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export type SceneOpts = { dawn: number; reducedMotion: boolean; angle: number; power: number; variant: "play" | "dim" };
export type SceneHandle = { setAim(angle: number, power: number): void; destroy(): void };

const C = {
  outline: 0x0b1433,
  navy: 0x14224f,
  sand: 0xf0cf8e,
  sandDeep: 0xd9a865,
  rock: 0x4f6488,
  rockDeep: 0x3a4c70,
  sea: 0x0c4a63,
  seaGlow: 0x46e6d3,
  cream: 0xfbe9c6,
  turq: 0x19b3a4,
  turqDeep: 0x0d7f7a,
  gold: 0xffc531,
  goldHi: 0xffe39a,
  coral: 0xff7a5c,
  lantern: 0xffd36b,
  skyline: 0x1d2a5e,
};

const G = 9.8;
const MUZZLE_LEN = 2.05;
const PIVOT = new THREE.Vector3(7.3, 2.35, 0.4);

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

export function velocity(angle: number, power: number) {
  const v = 6 + power * 0.072;
  const r = (angle * Math.PI) / 180;
  return { vx: -Math.cos(r) * v, vy: Math.sin(r) * v };
}

export function muzzle(angle: number) {
  const r = (angle * Math.PI) / 180;
  return new THREE.Vector3(PIVOT.x - Math.cos(r) * MUZZLE_LEN, PIVOT.y + Math.sin(r) * MUZZLE_LEN, PIVOT.z);
}

function canvasTex(draw: (g: CanvasRenderingContext2D, s: number) => void, size = 128) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d")!;
  draw(g, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function glowTex(inner: string, outer: string) {
  return canvasTex((g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, inner);
    gr.addColorStop(0.35, outer);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
}

export async function createScene(canvas: HTMLCanvasElement, opts: SceneOpts): Promise<SceneHandle> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 900);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const dawn = opts.dawn;

  /* ── درجات toon ── */
  const ramp = keep(new THREE.DataTexture(new Uint8Array([88, 150, 210, 255]), 4, 1, THREE.RedFormat));
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  const toon = (p: THREE.MeshToonMaterialParameters) => keep(new THREE.MeshToonMaterial({ gradientMap: ramp, ...p }));

  /* ── الحافة: قشرة مقلوبة تُدفع على العمود ── */
  const outlineMat = keep(
    new THREE.ShaderMaterial({
      uniforms: { thickness: { value: 0.055 }, color: { value: new THREE.Color(C.outline) } },
      vertexShader: `uniform float thickness; void main(){ vec3 p = position + normal * thickness; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }`,
      fragmentShader: `uniform vec3 color; void main(){ gl_FragColor = vec4(color,1.0); }`,
      side: THREE.BackSide,
    }),
  );
  const thinOutline = keep(outlineMat.clone());
  thinOutline.uniforms.thickness.value = 0.03;
  thinOutline.uniforms.color.value = new THREE.Color(C.outline);

  function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, outline: false | "thin" | "bold" = "bold") {
    keep(geo);
    const m = new THREE.Mesh(geo, mat);
    if (outline) m.add(new THREE.Mesh(geo, outline === "thin" ? thinOutline : outlineMat));
    return m;
  }
  const rbox = (w: number, h: number, d: number, r = 0.12) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.2, h / 2.2, d / 2.2));

  /* ── السماء: قبة بتدرج من الليل إلى الشروق، الأفق يلتقي البحر تلقائيًا ── */
  const skyMat = keep(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        dawn: { value: dawn },
        sunDir: { value: new THREE.Vector3(0.32, 0.0, -1).normalize() },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir; uniform float dawn; uniform vec3 sunDir;
        void main(){
          float e = vDir.y;
          vec3 zenith = vec3(0.025,0.045,0.14);
          vec3 mid    = mix(vec3(0.05,0.10,0.28), vec3(0.28,0.20,0.50), dawn*dawn);
          vec3 hor    = mix(vec3(0.05,0.36,0.46), vec3(0.62,0.36,0.50), dawn);
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.06, e));
          c = mix(c, zenith, smoothstep(0.05, 0.24, e));
          vec2 az = normalize(vDir.xz); vec2 saz = normalize(sunDir.xz);
          float w = pow(max(dot(az, saz), 0.0), 6.0) * (1.0 - smoothstep(0.0, 0.09, e));
          c += vec3(1.0,0.48,0.32) * w * (0.2 + dawn * 1.1);
          c += vec3(1.0,0.80,0.45) * pow(max(dot(normalize(vDir), sunDir), 0.0), 40.0) * dawn;
          gl_FragColor = vec4(c,1.0);
        }`,
    }),
  );
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(500, 48, 24)), skyMat);
  scene.add(sky);

  const horizonColor = new THREE.Color().setRGB(0.07 + 0.3 * dawn, 0.3 + 0.02 * dawn, 0.42);
  scene.fog = new THREE.Fog(horizonColor, 70, 250);

  /* ── النجوم ── */
  const r = rng(7);
  const dot = keep(glowTex("rgba(255,255,255,1)", "rgba(255,255,255,0.55)"));
  const starLayers: THREE.PointsMaterial[] = [];
  for (let layer = 0; layer < 2; layer++) {
    const pts: number[] = [];
    for (let i = 0; i < 150; i++) {
      const az = (r() - 0.5) * Math.PI * 0.9;
      const el = 0.035 + Math.pow(r(), 1.3) * 0.4;
      const R = 450;
      pts.push(Math.sin(az) * Math.cos(el) * R, Math.sin(el) * R, -Math.cos(az) * Math.cos(el) * R);
    }
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const m = keep(
      new THREE.PointsMaterial({ map: dot, size: layer ? 7 : 4.2, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false, opacity: (layer ? 0.95 : 0.7) * (1 - dawn * 0.55), color: layer ? 0xfff2cf : 0xdfe9ff }),
    );
    starLayers.push(m);
    scene.add(new THREE.Points(geo, m));
  }

  /* ── القمر (قرص كامل ناعم، بلا رموز) ── */
  const moonGlow = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(glowTex("rgba(255,240,200,0.9)", "rgba(255,226,160,0.25)")), transparent: true, depthWrite: false, fog: false, opacity: 0.8 - dawn * 0.5 })));
  moonGlow.scale.set(70, 70, 1);
  const moon = mesh(new THREE.SphereGeometry(7.5, 32, 16), toon({ color: 0xfff1c9, emissive: 0xffe6a8, emissiveIntensity: 0.75, fog: false }), false);
  const moonGroup = new THREE.Group();
  moonGroup.add(moonGlow, moon);
  scene.add(moonGroup);

  /* ── الأفق البعيد: أفق مدينة أصلي على الساحل (خلفية فقط، بعيد عن الهدف) ── */
  const skyline = new THREE.Group();
  const skyMatFar = keep(new THREE.MeshBasicMaterial({ color: C.skyline }));
  // الأفق صغير وبعيد ومغمور بالضباب: خلفية فقط، لا يقترب من البنية ولا يُستهدف
  const winMat = keep(new THREE.MeshBasicMaterial({ color: 0xffd479, fog: true }));
  const sr = rng(21);
  for (let x = -120; x < 140; ) {
    const w = 2.2 + sr() * 4.5;
    const h = 1.2 + sr() * (Math.abs(x - 22) < 30 ? 4.2 : 2.6);
    const b = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, 2)), skyMatFar);
    b.position.set(x + w / 2, h / 2 - 0.9, -110 - sr() * 8);
    skyline.add(b);
    for (let k = 0; k < 3; k++) {
      if (sr() < 0.55) continue;
      const wnd = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.4, 0.4)), winMat);
      wnd.position.set(b.position.x + (sr() - 0.5) * (w - 1), 0.4 + sr() * Math.max(0.2, h - 1) - 0.9, b.position.z + 1.05);
      skyline.add(wnd);
    }
    x += w + sr() * 1.5;
  }
  // ثلاثة أبراج إبرية بكرات: صورة أفق الكويت من بعيد
  const tower = (x: number, h: number, balls: [number, number][]) => {
    const t = new THREE.Group();
    const needle = new THREE.Mesh(keep(new THREE.ConeGeometry(0.45, h, 12)), skyMatFar);
    needle.position.y = h / 2 - 0.9;
    t.add(needle);
    for (const [y, rad] of balls) {
      const ball = new THREE.Mesh(keep(new THREE.SphereGeometry(rad, 24, 12)), skyMatFar);
      ball.position.y = y;
      t.add(ball);
    }
    t.position.set(x, 0, -104);
    skyline.add(t);
  };
  tower(24, 13, [[4.6, 1.55], [8.1, 0.9]]);
  tower(27.5, 9.5, [[4.4, 1.15]]);
  tower(21.6, 8, []);
  scene.add(skyline);

  /* ── قوارب صيد بعيدة بأضواء صغيرة (لمسة ساحلية، خلفية) ── */
  const boatMat = keep(new THREE.MeshBasicMaterial({ color: 0x18244f }));
  const boatLight = keep(new THREE.SpriteMaterial({ map: keep(glowTex("rgba(255,220,140,1)", "rgba(255,200,110,0.35)")), transparent: true, depthWrite: false }));
  for (const [x, z, s] of [[-30, -55, 1], [44, -70, 0.8], [-62, -80, 0.7]] as const) {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.6 * s, 0.9 * s, 0.7 * s, 12, 1, false, 0, Math.PI)), boatMat);
    hull.rotation.z = Math.PI / 2;
    hull.rotation.y = Math.PI / 2;
    const mast = new THREE.Mesh(keep(new THREE.BoxGeometry(0.12 * s, 3 * s, 0.12 * s)), boatMat);
    mast.position.y = 1.6 * s;
    const sail = new THREE.Mesh(keep(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.9 * s, 0.2), new THREE.Vector2(0.1, 2.6 * s)]))), boatMat);
    sail.position.set(0.05, 0.4 * s, 0);
    const l = new THREE.Sprite(boatLight);
    l.scale.set(1.6, 1.6, 1);
    l.position.set(-0.9 * s, 0.6 * s, 0.3);
    b.add(hull, mast, sail, l);
    b.position.set(x, -0.6, z);
    scene.add(b);
  }

  /* ── البحر الفيروزي المضيء ── */
  const sea = mesh(new THREE.PlaneGeometry(900, 500), toon({ color: C.sea, emissive: 0x06303f, emissiveIntensity: 0.6 }), false);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.9, -150);
  scene.add(sea);
  const waveMat = keep(new THREE.MeshBasicMaterial({ color: C.seaGlow, transparent: true, opacity: 0.32, depthWrite: false }));
  const waves: THREE.Mesh[] = [];
  const wr = rng(3);
  for (let i = 0; i < 46; i++) {
    const z = 6 - i * 2.6 - wr() * 1.5;
    const len = 1.4 + wr() * 4 + i * 0.12;
    const wv = new THREE.Mesh(keep(new THREE.PlaneGeometry(len, 0.09 + i * 0.006)), waveMat);
    wv.rotation.x = -Math.PI / 2;
    wv.position.set(-36 + wr() * 76, -0.86, z);
    wv.userData.base = wv.position.x;
    wv.userData.ph = wr() * 6.28;
    waves.push(wv);
    scene.add(wv);
  }
  // انعكاس القمر وضوء الفوانيس على الماء: خطوط ذهبية متقطعة
  const glintMat = keep(new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.45, depthWrite: false }));
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.6 + (i % 4) * 0.5, 0.12)), glintMat);
    g.rotation.x = -Math.PI / 2;
    g.position.set(1.5 + Math.sin(i * 2.1) * 0.8, -0.85, -3 - i * 2.2);
    scene.add(g);
  }

  /* ── الجزيرتان: صخر بحري بغطاء رمل ── */
  const rockMat = toon({ color: C.rock });
  const sandMat = toon({ color: C.sand });
  const foamMat = keep(new THREE.MeshBasicMaterial({ color: 0x9ff5ea, transparent: true, opacity: 0.55, depthWrite: false }));
  function island(x0: number, x1: number, depth: number) {
    const w = x1 - x0;
    const g = new THREE.Group();
    const base = mesh(rbox(w, 1.3, depth, 0.45), rockMat);
    base.position.set(0, -0.75, 0);
    const top = mesh(rbox(w + 0.25, 0.45, depth + 0.25, 0.2), sandMat);
    top.position.set(0, -0.2, 0);
    const foam = new THREE.Mesh(keep(new THREE.RingGeometry(1, 1.12, 48)), foamMat);
    foam.rotation.x = -Math.PI / 2;
    foam.scale.set(w * 0.56, depth * 0.62, 1);
    foam.position.y = -0.86;
    g.add(base, top, foam);
    // صخور صغيرة على الطرف
    const pebble = mesh(new THREE.IcosahedronGeometry(0.42, 1), toon({ color: C.rockDeep }));
    pebble.position.set(w / 2 - 0.2, -0.75, depth / 2 - 0.1);
    g.add(pebble);
    g.position.set((x0 + x1) / 2, 0, 0);
    scene.add(g);
    return g;
  }
  island(4.3, 10.6, 3.6);
  island(-9.6, -0.9, 3.4);

  /* ── المِرقاب: مرصد ودود بقبة فيروزية ومنظار ذهبي يطلق يسارًا ── */
  const obs = new THREE.Group();
  const wall = mesh(new THREE.CylinderGeometry(1.15, 1.3, 1.95, 28), toon({ color: C.cream }));
  wall.position.y = 0.97 + 0.02;
  const band = mesh(new THREE.TorusGeometry(1.2, 0.11, 10, 40), toon({ color: C.turqDeep }), "thin");
  band.rotation.x = Math.PI / 2;
  band.position.y = 1.55;
  const dome = mesh(new THREE.SphereGeometry(1.25, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), toon({ color: C.turq }));
  dome.position.y = 1.95;
  const rim = mesh(new THREE.TorusGeometry(1.25, 0.1, 10, 40), toon({ color: C.gold }), "thin");
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.97;
  const finial = mesh(new THREE.SphereGeometry(0.17, 16, 8), toon({ color: C.gold, emissive: 0xffb400, emissiveIntensity: 0.4 }), "thin");
  finial.position.y = 3.27;
  const door = mesh(rbox(0.6, 0.9, 0.16, 0.1), toon({ color: 0x8b4a2b }), "thin");
  door.position.set(-0.3, 0.47, 1.2);
  door.rotation.y = -0.25;
  const win = mesh(rbox(0.42, 0.5, 0.12, 0.08), toon({ color: C.lantern, emissive: 0xffc04a, emissiveIntensity: 0.9 }), "thin");
  win.position.set(0.45, 1.05, 1.12);
  win.rotation.y = 0.35;
  const step = mesh(rbox(1.0, 0.18, 0.5, 0.06), toon({ color: C.sandDeep }), "thin");
  step.position.set(-0.4, 0.07, 1.45);
  // المنظار يدور حول محور القبة
  const scope = new THREE.Group();
  const tube = mesh(new THREE.CylinderGeometry(0.26, 0.34, MUZZLE_LEN + 0.2, 20), toon({ color: 0xf3f0ff }));
  tube.rotation.z = Math.PI / 2;
  tube.position.x = -(MUZZLE_LEN + 0.2) / 2 + 0.2;
  const ring1 = mesh(new THREE.TorusGeometry(0.3, 0.08, 8, 24), toon({ color: C.gold }), "thin");
  ring1.rotation.y = Math.PI / 2;
  ring1.position.x = -MUZZLE_LEN + 0.05;
  const ring2 = ring1.clone();
  ring2.position.x = -0.55;
  const lens = mesh(new THREE.CircleGeometry(0.24, 20), toon({ color: 0x7ff3e3, emissive: 0x3fd8c8, emissiveIntensity: 0.9 }), false);
  lens.rotation.y = -Math.PI / 2;
  lens.position.x = -MUZZLE_LEN - 0.02;
  scope.add(tube, ring1, ring2, lens);
  scope.position.set(PIVOT.x - 7.3, PIVOT.y, PIVOT.z);
  obs.add(wall, band, dome, rim, finial, door, win, step, scope);
  obs.position.x = 7.3;
  // حامل ثلاثي صغير أمام المرصد: شخصية بلا وجه؟ لا. مصباح ساحلي ذهبي بدلًا منها
  const post = mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.5, 10), toon({ color: 0x2b3a66 }), "thin");
  post.position.set(1.9, 0.75, 0.9);
  const postLamp = mesh(new THREE.SphereGeometry(0.22, 16, 10), toon({ color: C.goldHi, emissive: 0xffc04a, emissiveIntensity: 1 }), "thin");
  postLamp.position.set(1.9, 1.6, 0.9);
  obs.add(post, postLamp);
  scene.add(obs);

  /* ── خامات المواد الست (نمط مميز لكل مادة، لا اللون وحده) ── */
  const teakTex = keep(
    canvasTex((g, s) => {
      g.fillStyle = "#c97c42";
      g.fillRect(0, 0, s, s);
      g.strokeStyle = "#9b5426";
      g.lineWidth = 3;
      for (let y = 10; y < s; y += 18) {
        g.beginPath();
        for (let x = 0; x <= s; x += 8) g.lineTo(x, y + Math.sin(x / 14 + y) * 3);
        g.stroke();
      }
      g.strokeStyle = "#e7a066";
      g.lineWidth = 2;
      for (let y = 18; y < s; y += 18) {
        g.beginPath();
        g.moveTo(10, y);
        g.lineTo(60, y + 1);
        g.stroke();
      }
    }),
  );
  const frondTex = keep(
    canvasTex((g, s) => {
      g.fillStyle = "#d9b45c";
      g.fillRect(0, 0, s, s);
      const st = 16;
      for (let i = -s; i < s * 2; i += st) {
        g.fillStyle = (i / st) % 2 === 0 ? "#b98e3b" : "#97b552";
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + 7, 0);
        g.lineTo(i + 7 + s * 0.6, s);
        g.lineTo(i + s * 0.6, s);
        g.fill();
      }
      g.strokeStyle = "rgba(90,60,20,.5)";
      g.lineWidth = 2;
      for (let y = 0; y < s; y += 32) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(s, y);
        g.stroke();
      }
    }),
  );
  const stoneTex = keep(
    canvasTex((g, s) => {
      g.fillStyle = "#86a0b2";
      g.fillRect(0, 0, s, s);
      const q = rng(11);
      for (let i = 0; i < 60; i++) {
        g.fillStyle = q() < 0.5 ? "#a9c1cf" : "#647f93";
        g.beginPath();
        g.arc(q() * s, q() * s, 1.5 + q() * 4, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = "#5c778b";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(20, 30);
      g.quadraticCurveTo(50, 50, 40, 90);
      g.stroke();
    }),
  );
  const glassTex = keep(
    canvasTex((g, s) => {
      const cols = ["#4fe3d2", "#ff8a70", "#ffd25e", "#a78bfa"];
      const h = s / 2;
      cols.forEach((c, i) => {
        g.fillStyle = c;
        g.fillRect((i % 2) * h, Math.floor(i / 2) * h, h, h);
      });
      g.fillStyle = "rgba(255,255,255,.45)";
      g.beginPath();
      g.moveTo(10, 12);
      g.lineTo(30, 12);
      g.lineTo(12, 40);
      g.fill();
      g.strokeStyle = "#1a2340";
      g.lineWidth = 8;
      g.strokeRect(4, 4, s - 8, s - 8);
      g.beginPath();
      g.moveTo(h, 0);
      g.lineTo(h, s);
      g.moveTo(0, h);
      g.lineTo(s, h);
      g.stroke();
    }),
  );
  const boxTex = keep(
    canvasTex((g, s) => {
      g.fillStyle = "#ffc531";
      g.fillRect(0, 0, s, s);
      g.strokeStyle = "#e08a10";
      g.lineWidth = 6;
      g.strokeRect(8, 8, s - 16, s - 16);
      g.fillStyle = "#fff6d6";
      g.beginPath();
      const c = s / 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rr = i % 2 ? 14 : 34;
        g.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
      }
      g.fill();
    }),
  );

  const M = {
    teak: toon({ color: 0xffffff, map: teakTex }),
    frond: toon({ color: 0xffffff, map: frondTex }),
    stone: toon({ color: 0xffffff, map: stoneTex }),
    glass: toon({ color: 0xffffff, map: glassTex, transparent: true, opacity: 0.55, depthWrite: false, emissive: 0xffffff, emissiveMap: glassTex, emissiveIntensity: 0.35 }),
    cloud: toon({ color: 0xf3efff, emissive: 0x4b3f8a, emissiveIntensity: 0.18 }),
    box: toon({ color: 0xffffff, map: boxTex, emissive: 0xffb020, emissiveMap: boxTex, emissiveIntensity: 0.55 }),
  };

  const structure = new THREE.Group();
  const add = (m: THREE.Mesh, x: number, y: number, z = 0, rz = 0) => {
    m.position.set(x, y, z);
    m.rotation.z = rz;
    structure.add(m);
    return m;
  };
  // الطابق الأرضي: عمودان من الحجر البحري وقنديل محبوس بينهما
  add(mesh(rbox(0.75, 1.9, 1.3, 0.16), M.stone), -7.0, 0.95);
  add(mesh(rbox(0.75, 1.9, 1.3, 0.16), M.stone), -3.4, 0.95);
  // سقف ساج
  add(mesh(rbox(4.6, 0.42, 1.4, 0.12), M.teak), -5.2, 2.11);
  // الطابق الثاني: جداران من السعف ولوح زجاج ملوّن أمام القنديل
  add(mesh(rbox(0.45, 1.6, 1.2, 0.1), M.frond), -6.6, 3.12);
  add(mesh(rbox(0.45, 1.6, 1.2, 0.1), M.frond), -3.8, 3.12);
  add(mesh(rbox(1.9, 1.3, 0.14, 0.05), M.glass, false), -5.2, 2.98, 0.62);
  // سقف سعف
  add(mesh(rbox(3.9, 0.34, 1.3, 0.1), M.frond), -5.2, 4.09);
  // القمة: صندوق ضوء، وغيمة مرتدة، وكتلة ساج صغيرة
  const lightbox = add(mesh(rbox(0.9, 0.9, 0.9, 0.14), M.box), -6.35, 4.71);
  add(mesh(rbox(0.5, 1.1, 0.9, 0.1), M.teak), -5.15, 4.81, 0, 0.04);
  const cloud = new THREE.Group();
  for (const [x, y, rad] of [[-0.45, 0, 0.42], [0.05, 0.12, 0.52], [0.55, 0, 0.4], [0.1, -0.12, 0.38]] as const) {
    const pf = mesh(new THREE.SphereGeometry(rad, 24, 14), M.cloud);
    pf.position.set(x, y, 0);
    pf.scale.z = 0.8;
    cloud.add(pf);
  }
  cloud.position.set(-3.95, 4.72, 0);
  structure.add(cloud);
  // كومة جانبية: ساج وزجاج على حافة الجزيرة
  add(mesh(rbox(1.1, 0.9, 1.0, 0.12), M.teak), -1.95, 0.45);
  add(mesh(rbox(0.85, 0.85, 0.85, 0.08), M.glass, false), -1.95, 1.33, 0, 0.08);
  add(mesh(rbox(1.3, 0.55, 1.0, 0.14), M.stone), -8.55, 0.28);
  add(mesh(rbox(0.5, 0.5, 0.5, 0.1), M.frond), -8.7, 0.81, 0, -0.1);
  scene.add(structure);

  /* ── القناديل: زجاج سداسي مضيء بهالة ناعمة ── */
  const haloTex = keep(glowTex("rgba(255,214,110,0.95)", "rgba(255,190,80,0.32)"));
  const lanternGroup: THREE.Group[] = [];
  function lantern(x: number, y: number, z: number, scale = 1, lit = 1) {
    const g = new THREE.Group();
    const body = mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.62, 6), toon({ color: 0xffe08a, emissive: 0xffb733, emissiveIntensity: 0.95 * lit }), "thin");
    const cap = mesh(new THREE.ConeGeometry(0.42, 0.32, 6), toon({ color: C.turqDeep }), "thin");
    cap.position.y = 0.47;
    const base = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.12, 6), toon({ color: C.turqDeep }), "thin");
    base.position.y = -0.37;
    const handle = mesh(new THREE.TorusGeometry(0.16, 0.045, 8, 18, Math.PI), toon({ color: C.gold }), false);
    handle.position.y = 0.66;
    const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, opacity: 0.6 * lit, blending: THREE.AdditiveBlending })));
    halo.scale.set(2.6, 2.6, 1);
    halo.userData.halo = true;
    g.add(halo, body, cap, base, handle);
    g.position.set(x, y, z);
    g.scale.setScalar(scale);
    const pl = new THREE.PointLight(0xffc56b, 7 * lit, 5.5, 2);
    pl.position.set(x, y + 0.1, z + 0.5);
    scene.add(pl);
    scene.add(g);
    lanternGroup.push(g);
    return g;
  }
  lantern(-5.2, 0.5, 0.05);
  lantern(-5.2, 2.85, 0.0);
  // القنديل المحرَّر يصعد نحو الكوكبة بأثر من الشرر
  const freed = lantern(-7.7, 6.9, 0.2, 0.9);
  const sparkMat = keep(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const sparks: THREE.Sprite[] = [];
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(sparkMat.clone());
    keep(s.material);
    s.position.set(-7.4 + Math.sin(i * 1.7) * 0.3 + i * 0.06, 6.1 - i * 0.38, 0.2);
    const k = 0.5 - i * 0.045;
    s.scale.set(k, k, 1);
    s.material.opacity = 0.85 - i * 0.08;
    sparks.push(s);
    scene.add(s);
  }

  /* ── الشهاب في الطيران: نواة مضيئة وقشرة toon وذيل متدرّج ── */
  const meteor = new THREE.Group();
  const core = mesh(new THREE.IcosahedronGeometry(0.42, 2), toon({ color: 0xffe9a8, emissive: 0xffc23d, emissiveIntensity: 0.85 }));
  const meteorHalo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(glowTex("rgba(255,236,170,1)", "rgba(80,230,210,0.35)")), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 })));
  meteorHalo.scale.set(2.8, 2.8, 1);
  meteor.add(meteorHalo, core);
  scene.add(meteor);
  const trail: THREE.Object3D[] = [];
  const trailTex = keep(glowTex("rgba(255,255,255,1)", "rgba(255,255,255,0.35)"));
  for (let i = 0; i < 22; i++) {
    const t = i / 21;
    const col = new THREE.Color(0xffd56a).lerp(new THREE.Color(0x46e6d3), Math.min(1, t * 1.3));
    const m = keep(new THREE.SpriteMaterial({ map: trailTex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 * (1 - t) }));
    const sp = new THREE.Sprite(m);
    const k = 1.25 * (1 - t * 0.75);
    sp.scale.set(k, k, 1);
    trail.push(sp);
    scene.add(sp);
  }
  // مسار الشهاب السابق (ثابت للوحة الفنية): زاوية ٤٢، قوة ٧٢، ينحدر نحو قمة البنية
  function placeMeteor(time: number) {
    const a = 42;
    const p0 = muzzle(a);
    const { vx, vy } = velocity(a, 72);
    const at = (t: number) => new THREE.Vector3(p0.x + vx * t, p0.y + vy * t - 0.5 * G * t * t, p0.z);
    meteor.position.copy(at(time));
    trail.forEach((s, i) => s.position.copy(at(Math.max(0, time - (i + 1) * 0.028))));
  }
  const METEOR_T = 1.0;
  placeMeteor(METEOR_T);

  /* ── دليل التصويب الجزئي ── */
  const guideMat = keep(new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, depthWrite: false }));
  const guide: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(keep(new THREE.SphereGeometry(0.11 - i * 0.006, 10, 8)), guideMat.clone());
    keep(m.material as THREE.Material);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.95 - i * 0.09;
    guide.push(m);
    scene.add(m);
  }
  function setAim(angle: number, power: number) {
    scope.rotation.z = -(angle * Math.PI) / 180;
    const p0 = muzzle(angle);
    const { vx, vy } = velocity(angle, power);
    guide.forEach((g, i) => {
      const t = 0.06 + i * 0.075;
      g.position.set(p0.x + vx * t, p0.y + vy * t - 0.5 * G * t * t, p0.z);
    });
    if (opts.reducedMotion) render();
  }

  /* ── الكوكبة: القنديل المحرر صار نجمة، والباقي مواضع خافتة ── */
  const constel = new THREE.Group();
  const sparkTex = keep(
    canvasTex((g, s) => {
      const c0 = s / 2;
      const gr = g.createRadialGradient(c0, c0, 0, c0, c0, c0);
      gr.addColorStop(0, "rgba(255,210,94,0.55)");
      gr.addColorStop(1, "rgba(255,210,94,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
      g.fillStyle = "#fff1c4";
      g.beginPath();
      g.moveTo(c0, c0 - 46);
      g.quadraticCurveTo(c0 + 6, c0 - 6, c0 + 46, c0);
      g.quadraticCurveTo(c0 + 6, c0 + 6, c0, c0 + 46);
      g.quadraticCurveTo(c0 - 6, c0 + 6, c0 - 46, c0);
      g.quadraticCurveTo(c0 - 6, c0 - 6, c0, c0 - 46);
      g.fill();
    }),
  );
  const starGold = keep(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false, fog: false }));
  const starFaint = keep(new THREE.SpriteMaterial({ map: dot, transparent: true, depthWrite: false, opacity: 0.35, fog: false }));
  const cpos = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(3.2, 1.5, 0), new THREE.Vector3(6.4, 0.4, 0)];
  cpos.forEach((p, i) => {
    const s = new THREE.Sprite(i === 0 ? starGold : starFaint);
    s.position.copy(p);
    s.scale.setScalar(i === 0 ? 2.6 : 1.0);
    constel.add(s);
  });
  const lineGeo = keep(new THREE.BufferGeometry().setFromPoints(cpos));
  constel.add(new THREE.Line(lineGeo, keep(new THREE.LineDashedMaterial({ color: 0xffe39a, transparent: true, opacity: 0.4, dashSize: 0.35, gapSize: 0.3, fog: false }))));
  (constel.children[3] as THREE.Line).computeLineDistances();
  scene.add(constel);

  /* ── الإضاءة: قمر بارد، سماء/أرض، ودفء الشروق ── */
  scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x3b2a4a, 1.5));
  const moonLight = new THREE.DirectionalLight(0xe2ebff, 2.1);
  moonLight.position.set(-8, 12, 10);
  scene.add(moonLight);
  const warm = new THREE.DirectionalLight(0xffb37a, 0.5 + dawn * 1.4);
  warm.position.set(12, 4, -6);
  scene.add(warm);

  /* ── التأطير حسب نسبة الشاشة: الأرض فوق شريط التحكم دائمًا ── */
  const base = { x: 0, y: 0, z: 0, tx: 0, ty: 0 };
  const ray = new THREE.Raycaster();
  function frame() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    const portrait = aspect < 0.8;
    const narrow = aspect < 0.6;
    const left = narrow ? -9.0 : portrait ? -9.8 : -10.3;
    const right = narrow ? 8.0 : portrait ? 9.9 : 10.9;
    const hw = (right - left) / 2;
    const cx = (left + right) / 2;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = hw / (tan * aspect);
    const hh = hw / aspect;
    // موضع خط الأرض من أعلى الشاشة (الجوال: فوق لوح التحكم الأطول)
    const f = aspect < 0.6 ? 0.66 : aspect < 1 ? 0.71 : 0.74;
    const ty = (f - 0.5) * 2 * hh;
    base.tx = cx;
    base.ty = ty;
    base.x = cx - 1.2;
    base.y = ty + d * 0.12;
    base.z = d;
    camera.near = 0.5;
    camera.far = 900;
    camera.updateProjectionMatrix();
    placeCamera(0, 0);
    // القمر والكوكبة في أعلى السماء المرئية أيًا كانت النسبة
    camera.updateMatrixWorld();
    const onPlane = (nx: number, ny: number, z: number) => {
      ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const t = (z - ray.ray.origin.z) / ray.ray.direction.z;
      return ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
    };
    moonGroup.position.copy(onPlane(portrait ? 0.55 : 0.62, portrait ? 0.78 : 0.72, -260));
    const cp = onPlane(portrait ? -0.75 : -0.62, portrait ? 0.62 : 0.66, -14);
    constel.position.copy(cp);
    const k = portrait ? 0.9 : 1;
    constel.scale.setScalar(k);
    sky.position.copy(camera.position);
  }
  function placeCamera(px: number, py: number) {
    camera.position.set(base.x + px, base.y + py, base.z);
    camera.lookAt(base.tx + px * 0.35, base.ty, 0);
    sky.position.copy(camera.position);
  }

  /* ── الحلقة: حركة هادئة (لا وميض)، تتوقف مع تقليل الحركة أو إخفاء التبويب ── */
  let raf = 0;
  let px = 0;
  let py = 0;
  let tx = 0;
  let ty = 0;
  const onPointer = (e: PointerEvent) => {
    tx = (e.clientX / window.innerWidth - 0.5) * 1.4;
    ty = -(e.clientY / window.innerHeight - 0.5) * 0.5;
  };
  if (!opts.reducedMotion) window.addEventListener("pointermove", onPointer);
  const t0 = performance.now();
  function render() {
    renderer.render(scene, camera);
  }
  function tick() {
    const t = (performance.now() - t0) / 1000;
    px += (tx + Math.sin(t * 0.25) * 0.35 - px) * 0.04;
    py += (ty + Math.sin(t * 0.18) * 0.12 - py) * 0.04;
    placeCamera(px, py);
    // تلألؤ بطيء جدًا (دورة ٥ ثوانٍ تقريبًا)، أبعد ما يكون عن الوميض
    starLayers[1].opacity = (0.8 + Math.sin(t * 1.2) * 0.15) * (1 - dawn * 0.55);
    starLayers[0].opacity = (0.62 + Math.sin(t * 0.9 + 1) * 0.1) * (1 - dawn * 0.55);
    waves.forEach((w) => (w.position.x = w.userData.base + Math.sin(t * 0.35 + w.userData.ph) * 0.6));
    lanternGroup.forEach((g, i) => (g.rotation.z = Math.sin(t * 0.9 + i) * 0.04));
    freed.position.y = 6.9 + Math.sin(t * 0.8) * 0.12;
    (M.box as THREE.MeshToonMaterial).emissiveIntensity = 0.5 + Math.sin(t * 2.2) * 0.12;
    placeMeteor(METEOR_T + Math.sin(t * 0.7) * 0.03);
    core.rotation.set(t * 0.6, t * 0.9, 0);
    render();
    raf = requestAnimationFrame(tick);
  }
  const onVis = () => {
    cancelAnimationFrame(raf);
    if (document.visibilityState === "visible" && !opts.reducedMotion) raf = requestAnimationFrame(tick);
  };
  document.addEventListener("visibilitychange", onVis);
  const ro = new ResizeObserver(() => {
    frame();
    render();
  });
  ro.observe(canvas);

  frame();
  setAim(opts.angle, opts.power);
  render();
  if (!opts.reducedMotion) raf = requestAnimationFrame(tick);
  void lightbox;

  return {
    setAim,
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVis);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    },
  };
}
