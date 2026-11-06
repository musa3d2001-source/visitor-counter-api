/**
 * [تجربة المرحلة 0 - كود مؤقت، ليس إنتاجيًا]
 * عارض three.js للمحاكاة نفسها (2.5D): MeshToonMaterial، كاميرا منظورية مائلة، طبقات parallax
 * (نجوم بعيدة، تلال ساحلية عامة، بحر، مستوى اللعب). لا معالم حقيقية ولا أصول خارجية.
 * يُستورد كسولًا فقط من spike-client عبر import()، فلا يدخل three أي حزمة أولية.
 * الجودة: high (DPR حتى 2، ظلال حقيقية، تنعيم) / low (DPR 1، بلا ظلال، بلا تنعيم). لا post-processing في الحالتين.
 * الجودة لا تمس الفيزياء: العارض يقرأ الحالة فقط، وتياره العشوائي "render" منفصل.
 */
import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  DirectionalLight,
  DynamicDrawUsage,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RedFormat,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Simulation } from "../_engine/sim";
import type { MaterialId } from "../_engine/materials";
import { aimVelocity } from "../_engine/aim-table";

export type Quality = "high" | "low";

export interface RendererStats {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  pixelRatio: number;
  shadows: boolean;
}

export interface SpikeRenderer {
  setSim(sim: Simulation): void;
  render(timeMs: number): void;
  setAim(angleStep: number, powerStep: number, visible: boolean): void;
  resize(): void;
  stats(): RendererStats;
  destroy(): void;
}

const PALETTE: Record<MaterialId | "ground", number> = {
  ground: 0xd9b77e,
  frond: 0x8fbf5a,
  teak: 0xb06a3b,
  stone: 0x8aa3a8,
  glass: 0x5fd3e6,
  cloud: 0xf3f6ff,
  lightbox: 0xffd25e,
  lantern: 0xffb22e,
};
const AMMO_COLOR = { meteor: 0xff8a3d, pebble: 0xc9c2b6, heavy: 0x6d5bd0 };
const DEPTH = 0.9;
const MAX_SHARDS = 240;

function toonRamp(): DataTexture {
  const data = new Uint8Array([90, 170, 255]);
  const t = new DataTexture(data, 3, 1, RedFormat);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.needsUpdate = true;
  return t;
}

export function createSpikeRenderer(canvas: HTMLCanvasElement, quality: Quality): SpikeRenderer {
  const high = quality === "high";
  const renderer = new WebGLRenderer({ canvas, antialias: high, powerPreference: "high-performance" });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio || 1, 2) : 1);
  renderer.shadowMap.enabled = high;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  scene.background = new Color(0x0d1b3d);
  scene.fog = new Fog(0x0d1b3d, 45, 140);
  const camera = new PerspectiveCamera(38, 1, 0.5, 200);
  const ramp = toonRamp();
  const disposables: { dispose(): void }[] = [ramp];
  const toon = (color: number, extra: Partial<{ emissive: number; transparent: boolean; opacity: number }> = {}) => {
    const m = new MeshToonMaterial({ color, gradientMap: ramp, ...extra });
    disposables.push(m);
    return m;
  };

  // الإضاءة: سماء ليلية كحلية مع ضوء قمري فيروزي وذهبي دافئ
  scene.add(new HemisphereLight(0x9fe3ff, 0x2a2140, 1.1));
  scene.add(new AmbientLight(0x404a80, 0.6));
  const sun = new DirectionalLight(0xfff1cf, 2.2);
  sun.position.set(-8, 18, 14);
  sun.castShadow = high;
  if (high) {
    sun.shadow.mapSize.set(1024, 1024);
    const c = sun.shadow.camera;
    c.left = -18;
    c.right = 18;
    c.top = 14;
    c.bottom = -4;
    c.near = 1;
    c.far = 60;
  }
  sun.target.position.set(12, 0, 0);
  scene.add(sun, sun.target);

  // طبقات parallax (بعيدة إلى قريبة)
  const layerFar = new Group();
  const layerMid = new Group();
  const layerNear = new Group();
  scene.add(layerFar, layerMid, layerNear);

  const sea = new Mesh(new PlaneGeometry(220, 60), toon(0x123a63));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(12, -0.05, -32);
  layerMid.add(sea);
  disposables.push(sea.geometry);

  const ground = new Mesh(new BoxGeometry(80, 1, 6), toon(PALETTE.ground));
  ground.position.set(20, -0.5, 0);
  ground.receiveShadow = high;
  layerNear.add(ground);
  disposables.push(ground.geometry);

  const launcher = new Group();
  const base = new Mesh(new CylinderGeometry(0.35, 0.5, 0.6, 12), toon(0x2f6f8f));
  const tube = new Mesh(new CylinderGeometry(0.14, 0.2, 1.2, 12), toon(0xf2c14e));
  tube.position.y = 0.6;
  tube.rotation.z = 0.8;
  launcher.add(base, tube);
  layerNear.add(launcher);
  disposables.push(base.geometry, tube.geometry);

  // خط دليل التصويب (جزئي)
  const aimGeom = new BufferGeometry();
  aimGeom.setAttribute("position", new BufferAttribute(new Float32Array(24 * 3), 3));
  const aimLine = new Line(aimGeom, new LineBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.85 }));
  aimLine.visible = false;
  layerNear.add(aimLine);
  disposables.push(aimGeom, aimLine.material as LineBasicMaterial);

  // حلقة النبضة (تُعاد استخدامها)
  const ring = new Mesh(new RingGeometry(0.8, 1, 48), new MeshBasicMaterial({ color: 0xffe9a3, transparent: true, opacity: 0 }));
  ring.position.z = 0.6;
  layerNear.add(ring);
  disposables.push(ring.geometry, ring.material as MeshBasicMaterial);

  const boxGeom = new BoxGeometry(1, 1, DEPTH);
  const ballGeom = new IcosahedronGeometry(1, high ? 2 : 1);
  const shardGeom = new BoxGeometry(0.09, 0.09, 0.09);
  disposables.push(boxGeom, ballGeom, shardGeom);
  const shards = new InstancedMesh(shardGeom, toon(0xbff4ff, { emissive: 0x1d4f5c }), MAX_SHARDS);
  shards.instanceMatrix.setUsage(DynamicDrawUsage);
  shards.count = 0;
  shards.frustumCulled = false;
  layerNear.add(shards);
  const shardState = new Float32Array(MAX_SHARDS * 5); // x, y, vx, vy, age

  let sim: Simulation | null = null;
  let meshes: { mesh: InstancedMesh; bodies: number[]; ball: boolean }[] = [];
  let seenEvents = 0;
  let pulseAt = -1;
  let lastTime = 0;
  const tmp = new Float64Array(6);
  const obj = new Object3D();
  const zero = new Matrix4().makeScale(0, 0, 0);

  function buildStars(rng: Simulation["renderRng"]) {
    layerFar.clear();
    const n = high ? 900 : 400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = -60 + rng.nextFloat() * 150;
      pos[i * 3 + 1] = 2 + rng.nextFloat() * 50;
      pos[i * 3 + 2] = -70 - rng.nextFloat() * 20;
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    const pts = new Points(g, new PointsMaterial({ color: 0xfff6d8, size: high ? 0.35 : 0.45, sizeAttenuation: true, fog: false }));
    layerFar.add(pts);
    disposables.push(g, pts.material as PointsMaterial);
    const moon = new Mesh(new CircleGeometry(3, 32), new MeshBasicMaterial({ color: 0xfff1c1, fog: false }));
    moon.position.set(-20, 30, -68);
    layerFar.add(moon);
    disposables.push(moon.geometry, moon.material as MeshBasicMaterial);
    // تلال ساحلية عامة (طبقة وسطى) بلا معالم حقيقية
    const hills = new InstancedMesh(new BoxGeometry(1, 1, 1), toon(0x1e3157), 14);
    for (let i = 0; i < 14; i++) {
      const w = 6 + rng.nextFloat() * 8;
      const h = 1.5 + rng.nextFloat() * 4;
      obj.position.set(-30 + i * 7.5, h / 2 - 0.2, -45);
      obj.scale.set(w, h, 4);
      obj.rotation.set(0, 0, 0);
      obj.updateMatrix();
      hills.setMatrixAt(i, obj.matrix);
    }
    layerMid.add(hills);
    disposables.push(hills.geometry);
  }

  function setSim(next: Simulation) {
    sim = next;
    seenEvents = 0;
    shards.count = 0;
    for (const m of meshes) layerNear.remove(m.mesh);
    meshes = [];
    buildStars(next.renderRng);
    const groups = new Map<string, number[]>();
    next.bodies.forEach((b, i) => {
      if (b.role === "ground") return;
      const key = b.role === "projectile" ? `ammo:${b.ammo}` : `${b.shape}:${b.material}`;
      const list = groups.get(key) ?? [];
      list.push(i);
      groups.set(key, list);
    });
    // القذائف تُضاف أثناء اللعب: نحجز لها خانات مسبقًا
    for (const ammo of ["meteor", "pebble", "heavy"] as const) if (!groups.has(`ammo:${ammo}`)) groups.set(`ammo:${ammo}`, []);
    for (const [key, list] of groups) {
      const [kind, id] = key.split(":");
      const isBall = kind === "ammo" || kind === "ball";
      const color = kind === "ammo" ? AMMO_COLOR[id as keyof typeof AMMO_COLOR] : PALETTE[id as MaterialId];
      const mat =
        id === "glass"
          ? toon(color, { transparent: true, opacity: 0.72, emissive: 0x0b3a44 })
          : id === "lantern" || id === "lightbox"
            ? toon(color, { emissive: id === "lantern" ? 0xa35a00 : 0x7a5200 })
            : toon(color);
      const cap = kind === "ammo" ? 8 : list.length;
      const mesh = new InstancedMesh(isBall ? ballGeom : boxGeom, mat, Math.max(cap, 1));
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.castShadow = high;
      mesh.receiveShadow = high;
      mesh.frustumCulled = false;
      layerNear.add(mesh);
      meshes.push({ mesh, bodies: kind === "ammo" ? [] : list, ball: isBall });
      (mesh.userData as { ammo?: string }).ammo = kind === "ammo" ? id : undefined;
    }
    const L = next.level.launcher;
    launcher.position.set(L.x / 100, 0, 0.2);
  }

  function spawnShards(x: number, y: number, n: number) {
    const rng = sim!.renderRng;
    for (let k = 0; k < n; k++) {
      let slot = shards.count;
      if (slot >= MAX_SHARDS) slot = rng.nextInt(0, MAX_SHARDS - 1);
      else shards.count++;
      const o = slot * 5;
      shardState[o] = x;
      shardState[o + 1] = y;
      shardState[o + 2] = (rng.nextFloat() - 0.5) * 6;
      shardState[o + 3] = rng.nextFloat() * 5;
      shardState[o + 4] = 0;
    }
  }

  function syncBodies() {
    if (!sim) return;
    // القذائف الجديدة تُسند إلى مجموعتها
    for (const m of meshes) {
      const ammo = (m.mesh.userData as { ammo?: string }).ammo;
      if (!ammo) continue;
      m.bodies = [];
      sim.bodies.forEach((b, i) => {
        if (b.role === "projectile" && b.ammo === ammo) m.bodies.push(i);
      });
    }
    for (const m of meshes) {
      let n = 0;
      for (const i of m.bodies) {
        if (n >= m.mesh.instanceMatrix.count) break;
        const b = sim.bodies[i];
        if (!b.alive) {
          m.mesh.setMatrixAt(n++, zero);
          continue;
        }
        sim.read(i, tmp);
        obj.position.set(tmp[0], tmp[1], 0);
        obj.rotation.set(0, 0, tmp[2]);
        if (m.ball) obj.scale.setScalar(b.r);
        else obj.scale.set(b.hx * 2, b.hy * 2, b.material === "cloud" ? DEPTH * 1.6 : 1);
        obj.updateMatrix();
        m.mesh.setMatrixAt(n++, obj.matrix);
      }
      m.mesh.count = n;
      m.mesh.instanceMatrix.needsUpdate = true;
    }
    // أحداث العرض (شظايا ونبضات) دون تأثير في الفيزياء
    const evs = sim.events;
    for (; seenEvents < evs.length; seenEvents++) {
      const e = evs[seenEvents];
      if (e.type === "break") spawnShards(e.x, e.y, sim.bodies[e.body].material === "glass" ? 18 : 10);
      if (e.type === "pulse") {
        pulseAt = lastTime;
        ring.position.x = e.x;
        ring.position.y = e.y;
      }
    }
  }

  function updateFx(dt: number, timeMs: number) {
    for (let k = 0; k < shards.count; k++) {
      const o = k * 5;
      shardState[o + 2] *= 0.99;
      shardState[o + 3] -= 9.8 * dt;
      shardState[o] += shardState[o + 2] * dt;
      shardState[o + 1] = Math.max(0.05, shardState[o + 1] + shardState[o + 3] * dt);
      shardState[o + 4] += dt;
      const s = shardState[o + 4] > 1.6 ? 0 : 1;
      obj.position.set(shardState[o], shardState[o + 1], 0.3);
      obj.rotation.set(shardState[o + 4] * 4, shardState[o + 4] * 3, 0);
      obj.scale.setScalar(s);
      obj.updateMatrix();
      shards.setMatrixAt(k, obj.matrix);
    }
    shards.instanceMatrix.needsUpdate = true;
    const ringMat = ring.material as MeshBasicMaterial;
    if (pulseAt >= 0) {
      const t = (timeMs - pulseAt) / 600;
      if (t >= 1) {
        ringMat.opacity = 0;
        pulseAt = -1;
      } else {
        ring.scale.setScalar(0.5 + t * 3.2);
        ringMat.opacity = 0.8 * (1 - t);
      }
    }
  }

  const target = new Vector3();
  function render(timeMs: number) {
    const dt = lastTime ? Math.min(0.05, (timeMs - lastTime) / 1000) : 0;
    lastTime = timeMs;
    syncBodies();
    updateFx(dt, timeMs);
    // الكاميرا تتبع آخر قذيفة حيّة بانزياح خفيف (يُظهر الـ parallax)
    let fx = 13;
    if (sim) {
      for (let i = sim.bodies.length - 1; i > 0; i--) {
        const b = sim.bodies[i];
        if (b.role === "projectile" && b.alive) {
          sim.read(i, tmp);
          fx = Math.min(24, Math.max(6, tmp[0]));
          break;
        }
      }
    }
    const sway = Math.sin(timeMs / 2400) * 0.6;
    camera.position.x += (fx + sway - camera.position.x) * 0.05;
    camera.position.y = 5.5;
    camera.position.z = 22;
    target.set(camera.position.x - 0.5, 2.6, 0);
    camera.lookAt(target);
    renderer.render(scene, camera);
  }

  function setAim(angleStep: number, powerStep: number, visible: boolean) {
    aimLine.visible = visible && !!sim;
    if (!sim || !visible) return;
    const v = aimVelocity(angleStep, powerStep);
    const L = sim.level.launcher;
    const arr = aimGeom.getAttribute("position") as BufferAttribute;
    let x = L.x / 100;
    let y = L.y / 100;
    let vx = v.vx;
    let vy = v.vy;
    for (let i = 0; i < 24; i++) {
      arr.setXYZ(i, x, y, 0.4);
      const h = 0.03;
      x += vx * h;
      y += vy * h;
      vy -= 9.81 * h;
    }
    arr.needsUpdate = true;
  }

  function resize() {
    const w = canvas.clientWidth || 800;
    const h = canvas.clientHeight || 450;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  camera.position.set(13, 6.5, 24);
  resize();

  return {
    setSim,
    render,
    setAim,
    resize,
    stats() {
      const i = renderer.info;
      return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, pixelRatio: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled };
    },
    destroy() {
      for (const m of meshes) layerNear.remove(m.mesh);
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
