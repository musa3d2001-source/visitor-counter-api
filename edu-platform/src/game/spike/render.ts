/**
 * نموذج المرحلة 0: عرض three.js مباشر بخامات toon وكاميرا منظورية مائلة وطبقات parallax.
 * يقرأ لقطة المحاكاة فقط (لا يكتب فيها)، فالجودة لا تمس الفيزياء.
 * لكل مادة InstancedMesh واحدة (+ قشرة حدود اختيارية)، فعدد draw calls ثابت مهما زادت الأجسام.
 */
import * as THREE from "three";
import type { MaterialKey } from "./layouts";
import type { Sim } from "./sim";
import { SPIKE_STYLE, type SceneStyle } from "./style";

export type Quality = "high" | "low";

export { SPIKE_STYLE, type SceneStyle } from "./style";

const MAT_KEYS: MaterialKey[] = ["frond", "teak", "stone", "glass", "cloud", "lightbox"];

function gradientMap(steps: number) {
  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) {
    const v = Math.round(((i + 0.6) / steps) * 255);
    data.set([v, v, v, 255], i * 4);
  }
  const t = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** أفق إجرائي مبسّط (كتل وقباب عامة، لا معالم حقيقية) للطبقات البعيدة */
function skylineShape(seedOffset: number, height: number, width: number) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  let x = -width / 2;
  let k = seedOffset;
  while (x < width / 2) {
    k = (k * 9301 + 49297) % 233280;
    const w = 1.2 + (k / 233280) * 3;
    k = (k * 9301 + 49297) % 233280;
    const h = height * (0.35 + (k / 233280) * 0.65);
    s.lineTo(x, h);
    if (k % 5 === 0) {
      s.quadraticCurveTo(x + w / 2, h + w * 0.7, x + w, h);
    } else s.lineTo(x + w, h);
    x += w;
    s.lineTo(x, 0.4 * height);
  }
  s.lineTo(width / 2, 0);
  s.lineTo(-width / 2, 0);
  return new THREE.ShapeGeometry(s);
}

export type RenderStats = { frames: number; medianMs: number; p95Ms: number; fps: number; drawCalls: number; triangles: number; dpr: number; quality: Quality };

export type View = { minX: number; maxX: number; minY: number; maxY: number };
export const DEFAULT_VIEW: View = { minX: -4, maxX: 37, minY: -1, maxY: 13 };

export function createRenderer(canvas: HTMLCanvasElement, opts: { style?: SceneStyle; quality: Quality; maxBodies: number; view?: View }) {
  const style = opts.style ?? SPIKE_STYLE;
  let quality = opts.quality;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === "high", alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 200);
  const grad = gradientMap(style.toonSteps);
  const disposables: { dispose(): void }[] = [grad];

  // إضاءة
  const hemi = new THREE.HemisphereLight(style.hemi[0], style.hemi[1], style.hemi[2]);
  const moon = new THREE.DirectionalLight(style.moon[0], style.moon[1]);
  moon.position.set(-14, 26, 22);
  moon.target.position.set(15, 0, 0);
  moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { left: -24, right: 24, top: 18, bottom: -6, near: 1, far: 80 });
  scene.add(hemi, moon, moon.target);

  // الأرض والبحر
  const groundGeo = new THREE.BoxGeometry(80, 1, 8);
  const groundMat = new THREE.MeshToonMaterial({ color: style.groundTop, gradientMap: grad });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.set(15, -0.5, 0);
  ground.receiveShadow = true;
  scene.add(ground);
  disposables.push(groundGeo, groundMat);
  const baseGeo = new THREE.BoxGeometry(80, 6, 8.2);
  const baseMat = new THREE.MeshToonMaterial({ color: style.ground, gradientMap: grad });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.set(15, -4, 0);
  scene.add(base);
  disposables.push(baseGeo, baseMat);
  if (style.sea) {
    const seaGeo = new THREE.PlaneGeometry(260, 60);
    const seaMat = new THREE.MeshBasicMaterial({ color: style.sea });
    const sea = new THREE.Mesh(seaGeo, seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(15, -1.2, -30);
    scene.add(sea);
    disposables.push(seaGeo, seaMat);
  }

  // parallax داخل WebGL (اختياري)
  const parallaxMeshes: THREE.Mesh[] = [];
  style.parallax?.forEach((p, i) => {
    const g = skylineShape(17 + i * 31, p.height, 160);
    const m = new THREE.MeshBasicMaterial({ color: p.color });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(15, -0.5, p.z);
    scene.add(mesh);
    parallaxMeshes.push(mesh);
    disposables.push(g, m);
  });

  // النجوم (draw call واحد)
  if (style.stars) {
    const pos = new Float32Array(style.stars * 3);
    let k = 7;
    for (let i = 0; i < style.stars; i++) {
      k = (k * 16807) % 2147483647;
      pos[i * 3] = -70 + (k / 2147483647) * 170;
      k = (k * 16807) % 2147483647;
      pos[i * 3 + 1] = 6 + (k / 2147483647) * 40;
      pos[i * 3 + 2] = -80;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: "#fff6dc", size: 0.35, sizeAttenuation: true });
    scene.add(new THREE.Points(g, m));
    disposables.push(g, m);
  }

  // الأجسام: InstancedMesh لكل مادة
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const ballGeo = new THREE.IcosahedronGeometry(0.5, 2);
  disposables.push(boxGeo, ballGeo);
  const cap = opts.maxBodies;
  const outlineMat = style.outline ? new THREE.MeshBasicMaterial({ color: style.outline.color, side: THREE.BackSide }) : null;
  if (outlineMat) disposables.push(outlineMat);

  type Layer = { mesh: THREE.InstancedMesh; outline: THREE.InstancedMesh | null };
  const makeLayer = (geo: THREE.BufferGeometry, color: string, emissive?: string): Layer => {
    const mat = new THREE.MeshToonMaterial({ color, gradientMap: grad, emissive: emissive ?? "#000000", emissiveIntensity: emissive ? 0.9 : 0 });
    disposables.push(mat);
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.count = 0;
    mesh.frustumCulled = false;
    scene.add(mesh);
    let outline: THREE.InstancedMesh | null = null;
    if (outlineMat) {
      outline = new THREE.InstancedMesh(geo, outlineMat, cap);
      outline.count = 0;
      outline.frustumCulled = false;
      scene.add(outline);
    }
    return { mesh, outline };
  };
  const layers = new Map<string, Layer>();
  for (const k of MAT_KEYS) layers.set(k, makeLayer(boxGeo, style.mats[k], k === "lightbox" ? "#7a5a00" : k === "glass" ? "#0b6f86" : undefined));
  layers.set("lantern", makeLayer(ballGeo, style.mats.lantern, "#8a4b00"));
  layers.set("projectile", makeLayer(ballGeo, style.projectile, style.projectile));

  // وهج القناديل (sprites بلا خامة خارجية: تدرج دائري مرسوم)
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = glowCanvas.height = 64;
  const gctx = glowCanvas.getContext("2d")!;
  const rg = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, "rgba(255,255,255,0.95)");
  rg.addColorStop(0.35, "rgba(255,255,255,0.35)");
  rg.addColorStop(1, "rgba(255,255,255,0)");
  gctx.fillStyle = rg;
  gctx.fillRect(0, 0, 64, 64);
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: style.lanternGlow, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  disposables.push(glowTex, glowMat);
  const glows: THREE.Sprite[] = [];

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const v3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();

  function applyQuality(qa: Quality) {
    quality = qa;
    const dpr = qa === "high" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    renderer.setPixelRatio(dpr);
    renderer.shadowMap.enabled = qa === "high";
    moon.castShadow = qa === "high";
    renderer.shadowMap.needsUpdate = true;
    // تغيير الظلال يتطلب إعادة ترجمة الخامات
    scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (mat) mat.needsUpdate = true;
    });
    resize();
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // نُبقي إطار التصميم كاملًا ظاهرًا داخل «المنطقة الآمنة» بين شريط الأعلى ولوح الأسفل في أي نسبة
    const v = view;
    const safe = Math.max(0.2, 1 - insets.top - insets.bottom);
    const tanH = Math.tan(((camera.fov * Math.PI) / 180) / 2);
    const worldH = v.maxY - v.minY;
    const distForW = (v.maxX - v.minX) / 2 / (tanH * camera.aspect);
    const distForH = worldH / 2 / (tanH * safe);
    const dist = Math.max(distForW, distForH) * 1.04;
    const cx = (v.minX + v.maxX) / 2;
    const extraH = Math.max(0, dist * tanH * safe - worldH / 2);
    const cy = (v.minY + v.maxY) / 2 + extraH * 0.82;
    camera.position.set(cx, cy + dist * 0.1, dist);
    camera.lookAt(cx, cy, 0);
    const yoff = ((insets.bottom - insets.top) / 2) * h;
    if (Math.abs(yoff) > 0.5) camera.setViewOffset(w, h, 0, yoff, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  // المرقاب: حامل ثلاثي وأنبوب بحلقات ذهبية، وقبة مرصد صغيرة خلفه (هندسة إجرائية)
  let view: View = opts.view ?? DEFAULT_VIEW;
  let insets = { top: 0, bottom: 0 };
  const launcher = new THREE.Group();
  const lmat = new THREE.MeshToonMaterial({ color: style.mats.teak, gradientMap: grad });
  const tubeMat = new THREE.MeshToonMaterial({ color: "#2f4f7a", gradientMap: grad });
  const goldMat = new THREE.MeshToonMaterial({ color: "#ffc531", gradientMap: grad, emissive: "#6b4a00", emissiveIntensity: 0.4 });
  const legGeo = new THREE.CylinderGeometry(0.07, 0.09, 2.3, 8);
  const tubeGeo = new THREE.CylinderGeometry(0.24, 0.34, 2.4, 16);
  const ringGeo = new THREE.TorusGeometry(0.33, 0.06, 8, 20);
  disposables.push(lmat, tubeMat, goldMat, legGeo, tubeGeo, ringGeo);
  for (const [dx, rz] of [[-0.45, -0.35], [0.45, 0.35], [0, 0]] as const) {
    const leg = new THREE.Mesh(legGeo, lmat);
    leg.position.set(dx * 0.9, -1.05, dx === 0 ? -0.35 : 0.15);
    leg.rotation.z = rz;
    launcher.add(leg);
  }
  const tube = new THREE.Group();
  const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
  tubeMesh.rotation.z = Math.PI / 2;
  tubeMesh.position.x = -0.5;
  const ring1 = new THREE.Mesh(ringGeo, goldMat);
  ring1.rotation.y = Math.PI / 2;
  ring1.position.x = -1.5;
  const ring2 = ring1.clone();
  ring2.position.x = 0.4;
  tube.add(tubeMesh, ring1, ring2);
  launcher.add(tube);
  launcher.position.set(34, 2.2, 0);
  scene.add(launcher);
  const domeGeo = new THREE.SphereGeometry(1.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const domeBaseGeo = new THREE.CylinderGeometry(1.7, 1.8, 1.8, 24);
  const domeMat = new THREE.MeshToonMaterial({ color: "#f3ead8", gradientMap: grad });
  disposables.push(domeGeo, domeBaseGeo, domeMat);
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.position.set(38.3, 1.8, -2.2);
  const domeBase = new THREE.Mesh(domeBaseGeo, domeMat);
  domeBase.position.set(38.3, 0.9, -2.2);
  const slit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.2), goldMat);
  slit.position.set(37.4, 2.6, -1);
  slit.rotation.z = 0.5;
  scene.add(dome, domeBase, slit);

  // دليل التصويب: نقاط (draw call واحد)
  const guideGeo = new THREE.BufferGeometry();
  guideGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3 * 40), 3));
  const guideMat = new THREE.PointsMaterial({ color: "#ffe9a8", size: 0.32, transparent: true, opacity: 0.95, depthWrite: false });
  const guide = new THREE.Points(guideGeo, guideMat);
  guide.frustumCulled = false;
  guideGeo.setDrawRange(0, 0);
  scene.add(guide);
  disposables.push(guideGeo, guideMat);

  const frameTimes: number[] = [];
  let last = 0;
  const snap = new Float32Array(cap * 4);

  function draw(sim: Sim | null, panX = 0) {
    const now = performance.now();
    if (last) frameTimes.push(now - last);
    if (frameTimes.length > 600) frameTimes.shift();
    last = now;
    const counts = new Map<string, number>();
    for (const l of layers.values()) l.mesh.count = 0;
    let glowN = 0;
    if (sim) {
      sim.snapshot(snap);
      for (const b of sim.bodies) {
        const o = b.i * 4;
        if (o + 3 >= snap.length || snap[o + 3] === 0) continue;
        const key = b.kind === "projectile" ? "projectile" : b.kind === "lantern" ? "lantern" : (b.mat as string);
        const layer = layers.get(key);
        if (!layer) continue;
        const n = counts.get(key) ?? 0;
        counts.set(key, n + 1);
        v3.set(snap[o], snap[o + 1], 0);
        q.setFromAxisAngle(zAxis, snap[o + 2]);
        const depth = b.kind === "block" ? style.depth : b.w;
        s3.set(b.w, b.h, depth);
        m4.compose(v3, q, s3);
        layer.mesh.setMatrixAt(n, m4);
        if (layer.outline) {
          const k = style.outline!.scale;
          s3.set(b.w + (k - 1) * 0.6, b.h + (k - 1) * 0.6, depth + (k - 1) * 0.6);
          m4.compose(v3, q, s3);
          layer.outline.setMatrixAt(n, m4);
        }
        if (b.kind === "lantern") {
          let g = glows[glowN];
          if (!g) {
            g = new THREE.Sprite(glowMat);
            g.scale.set(1.9, 1.9, 1);
            scene.add(g);
            glows.push(g);
          }
          g.visible = true;
          g.position.set(snap[o], snap[o + 1], 0.8);
          glowN++;
        }
      }
    }
    for (const [key, l] of layers) {
      const n = counts.get(key) ?? 0;
      l.mesh.count = n;
      l.mesh.instanceMatrix.needsUpdate = true;
      if (l.outline) {
        l.outline.count = n;
        l.outline.instanceMatrix.needsUpdate = true;
      }
    }
    for (let i = glowN; i < glows.length; i++) glows[i].visible = false;
    parallaxMeshes.forEach((m, i) => (m.position.x = 15 + panX * (0.15 + i * 0.12)));
    renderer.render(scene, camera);
  }

  function stats(): RenderStats {
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
    };
  }

  applyQuality(quality);
  return {
    /** زاوية المرقاب بالراديان (0 = أفقي نحو اليسار) */
    setLauncher(angle: number) {
      tube.rotation.z = -angle;
    },
    setGuide(points: { x: number; y: number }[]) {
      const arr = guideGeo.getAttribute("position") as THREE.BufferAttribute;
      const n = Math.min(points.length, 40);
      for (let i = 0; i < n; i++) arr.setXYZ(i, points[i].x, points[i].y, 0.6);
      arr.needsUpdate = true;
      guideGeo.setDrawRange(0, n);
    },
    /** موضع نقطة من العالم على الشاشة رأسيًا (0 أعلى، 1 أسفل) لمحاذاة طبقات DOM خلف canvas شفاف */
    projectY(y: number, z: number, x = 20) {
      const p = new THREE.Vector3(x, y, z).project(camera);
      return (1 - p.y) / 2;
    },
    /** أجزاء الشاشة المغطاة بالواجهة (0..1) أعلى وأسفل، ليُؤطَّر الملعب في الباقي */
    setInsets(top: number, bottom: number) {
      insets = { top, bottom };
      resize();
    },
    setView(v: View) {
      view = v;
      resize();
    },
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
    dispose() {
      for (const l of layers.values()) {
        l.mesh.dispose();
        l.outline?.dispose();
      }
      for (const d of disposables) d.dispose();
      renderer.dispose();
    },
  };
}
