// STAKK — studio world: renderer, hand-built softbox environments, food lighting, stage + griddle sets, steam & droplets.
import * as THREE from 'three';
import { fbm, ridged, smooth, mix, paint, paintMulti, hex, mixc, rng } from './noise.js';

export const PAL = { red: '#E23B2E', mustard: '#F2B705', cream: '#FFF3DC', charcoal: '#1F1C19' };
/** brand hex → display-referred sRGB triplet (for the composite pass; no colour-management conversion) */
export const srgb = h => new THREE.Vector3(...[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255));

export function makeRenderer(W, H) {
  const r = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, alpha: false, powerPreference: 'high-performance' });
  r.setPixelRatio(1); r.setSize(W, H);
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.toneMapping = THREE.NoToneMapping; // tone mapping happens in the final pass
  r.outputColorSpace = THREE.LinearSRGBColorSpace;
  return r;
}

/** Softbox studio environment, prefiltered with PMREM. bounce = colour of the floor/walls bouncing into food. */
export function studioEnv(renderer, { bounce = '#E23B2E', bounceK = 0.35, warm = 1.0 } = {}) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x000000);
  const box = (w, h, col, k, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...look); s.add(m); return m;
  };
  box(7, 5, '#FFF4E6', 3.2 * warm, [-1.5, 6, 3], [0, 0, 0]);          // big overhead softbox (front-left)
  box(1.2, 7, '#FFFFFF', 4.0, [5.5, 2.5, -2.5], [0, 1, 0]);          // right rim strip
  box(1.2, 7, '#FFE6C8', 2.6, [-5.5, 2.0, -3.0], [0, 1, 0]);         // left rim strip
  box(5, 1.5, '#FFD7A0', 1.2, [0, 1.0, 6.0], [0, 1, 0]);             // warm front card (catchlight)
  // floor / bounce: coloured hemisphere below the horizon
  const fl = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(bounce).multiplyScalar(bounceK), side: THREE.BackSide }));
  s.add(fl);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.035).texture;
  pm.dispose();
  return tex;
}

export function foodLights(scene) {
  const L = {};
  L.key = new THREE.SpotLight('#FFE1B8', 150, 0, 0.5, 0.85, 2);
  L.key.position.set(-3.4, 5.6, 4.4); L.key.target.position.set(0, 0.6, 0);
  L.key.castShadow = true; L.key.shadow.mapSize.set(2048, 2048); L.key.shadow.bias = -0.0003; L.key.shadow.normalBias = 0.015;
  L.key.shadow.camera.near = 3; L.key.shadow.camera.far = 16;
  L.rimR = new THREE.SpotLight('#FFF1DC', 260, 0, 0.55, 0.9, 2); L.rimR.position.set(3.6, 3.4, -4.2); L.rimR.target.position.set(0, 0.7, 0);
  L.rimL = new THREE.SpotLight('#FFD2A0', 140, 0, 0.6, 0.9, 2); L.rimL.position.set(-4.2, 2.6, -3.4); L.rimL.target.position.set(0, 0.7, 0);
  L.fill = new THREE.HemisphereLight('#FFF1E2', '#E23B2E', 0.12);
  for (const k in L) { scene.add(L[k]); if (L[k].target) scene.add(L[k].target); }
  return L;
}

/** Shadow-catcher floor + soft contact-shadow disc (writes only alpha → composited over the brand backdrop). */
export function stageFloor(scene) {
  const g = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.42, color: 0x000000 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  const ct = paint(256, 256, (u, v, c) => { const r = Math.hypot(u - 0.5, v - 0.5) * 2; c[0] = c[1] = c[2] = 0; c[3] = 255 * Math.pow(Math.max(0, 1 - r), 2.2); }, { srgb: false });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.9), new THREE.MeshBasicMaterial({ map: ct, transparent: true, opacity: 0.55, depthWrite: false, color: 0x000000 }));
  contact.rotation.x = -Math.PI / 2; contact.position.y = 0.003; contact.renderOrder = 1; g.add(contact);
  g.userData = { floor, contact };
  scene.add(g); return g;
}

// ------------------------------------------------------------------ griddle set (hook)
export function griddleSet(scene) {
  const g = new THREE.Group(); g.name = 'griddle';
  const [map, rough] = paintMulti(1024, 1024, [{ srgb: true }, {}], (u, v, [c, r]) => {
    const x = u * 12, z = v * 12;
    const scr = fbm(x * 0.6, z * 14, 1.1, 3), sm = fbm(x * 1.5, z * 1.5, 4.2, 4), sp = smooth(0.55, 0.7, fbm(x * 9, z * 9, 7, 2));
    let col = mixc(hex('#141312'), hex('#2A2622'), 0.5 + 0.5 * sm);
    col = mixc(col, hex('#3B2A1C'), smooth(0.2, 0.6, sm) * 0.5);        // seasoned brown patina
    col = mixc(col, hex('#0A0908'), sp * 0.6);
    c[0] = col[0]; c[1] = col[1]; c[2] = col[2];
    r[0] = r[1] = r[2] = 255 * Math.min(1, Math.max(0, 0.32 + 0.22 * sm + 0.1 * scr - 0.15 * sp));
  });
  map.wrapS = map.wrapT = rough.wrapS = rough.wrapT = THREE.RepeatWrapping; map.repeat.set(3, 3); rough.repeat.set(3, 3);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshPhysicalMaterial({ map, roughnessMap: rough, roughness: 1, metalness: 0.6, clearcoat: 0.5, clearcoatRoughness: 0.12 }));
  plate.rotation.x = -Math.PI / 2; plate.receiveShadow = true; g.add(plate);
  // grease pool around the patty (glossy dark film)
  const gp = paint(512, 512, (u, v, c) => { const x = (u - .5) * 2, z = (v - .5) * 2, r = Math.hypot(x, z) * (1 + 0.25 * fbm(x * 3, z * 3, 2, 3)); c[0] = 40; c[1] = 24; c[2] = 10; c[3] = 255 * smooth(1.0, 0.55, r) * 0.9; }, { srgb: true });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshPhysicalMaterial({ map: gp, transparent: true, roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.004; g.add(pool);
  // far kitchen practicals → bokeh after DOF
  const r = rng(77);
  const bk = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const col = new THREE.Color(['#FFB54A', '#FF8A2A', '#FFD27A', '#FFF0C8'][i % 4]).multiplyScalar(2.2 + r() * 3);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.07 + r() * 0.08, 12, 8), new THREE.MeshBasicMaterial({ color: col }));
    m.position.set((r() - 0.5) * 22, 0.8 + r() * 4.5, -9 - r() * 10); bk.add(m);
  }
  g.add(bk);
  g.userData = { plate, pool, bokeh: bk };
  scene.add(g); return g;
}

export function buildPress() {
  const g = new THREE.Group();
  const steel = new THREE.MeshPhysicalMaterial({ color: '#C9CCCF', metalness: 1, roughness: 0.2, clearcoat: 0.3, clearcoatRoughness: 0.2 });
  const plateGeo = new THREE.CylinderGeometry(1.32, 1.34, 0.09, 96, 1);
  const plate = new THREE.Mesh(plateGeo, steel); plate.position.y = 0.045; plate.castShadow = true; g.add(plate);
  const brush = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 48), new THREE.MeshPhysicalMaterial({ color: '#1A1816', roughness: 0.55, metalness: 0.0, clearcoat: 0.4 }));
  brush.position.y = 0.34; brush.castShadow = true; g.add(brush);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 20), brush.material); knob.scale.set(1, 0.7, 1); knob.position.y = 0.64; g.add(knob);
  return g;
}

// ------------------------------------------------------------------ steam (sprites, pure function of t)
export function steamTexture() {
  return paint(256, 256, (u, v, c) => {
    const x = (u - .5) * 2, z = (v - .5) * 2, r = Math.hypot(x, z);
    const n = 0.5 + 0.5 * fbm(x * 2.2, z * 2.2, 3.7, 4), w = 0.5 + 0.5 * fbm(x * 5, z * 5 + n, 9.1, 3);
    c[0] = c[1] = c[2] = 255; c[3] = 255 * Math.pow(Math.max(0, 1 - r), 1.6) * smooth(0.25, 0.85, n * 0.7 + w * 0.5) ;
  }, { srgb: true });
}

export class Steam {
  /** emitters: array of {x,y,z, spread, rate, t0, t1, life, rise, size, op} */
  constructor(scene, tex, max = 90, seed = 5) {
    this.r = rng(seed); this.max = max;
    this.sprites = Array.from({ length: max }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color('#FFF2E2').multiplyScalar(1.15) }));
      s.visible = false; s.renderOrder = 5; scene.add(s); return s;
    });
    this.rand = Array.from({ length: 4000 }, () => this.r());
    this.emitters = [];
  }
  update(t) {
    let n = 0; const R = this.rand;
    for (const s of this.sprites) s.visible = false;
    this.emitters.forEach((e, ei) => {
      const count = Math.floor((e.t1 - e.t0) * e.rate);
      for (let i = 0; i < count && n < this.max; i++) {
        const b = e.t0 + i / e.rate, age = t - b;
        if (age < 0 || age > e.life) continue;
        const k = age / e.life, q = (ei * 397 + i * 13) % 3900;
        const s = this.sprites[n++]; s.visible = true;
        const ang = R[q] * Math.PI * 2, rad = Math.sqrt(R[q + 1]) * e.spread;
        const sway = Math.sin(age * 2.1 + R[q + 2] * 6) * 0.12 * k;
        s.position.set(e.x + Math.cos(ang) * rad + sway + (e.drift || 0) * age, e.y + age * e.rise * (0.7 + 0.6 * R[q + 3]) , e.z + Math.sin(ang) * rad * 0.6);
        const sz = e.size * (0.35 + 1.1 * Math.pow(k, 0.6)) * (0.7 + 0.6 * R[q + 4]);
        s.scale.set(sz, sz * 1.25, 1);
        s.material.rotation = R[q + 5] * 6.28 + age * (R[q + 6] - 0.5) * 0.8;
        s.material.opacity = e.op * Math.sin(Math.PI * Math.min(1, k * 1.15)) ** 1.2 * (0.6 + 0.4 * R[q + 7]) * (e.gain ? e.gain(t) : 1);
      }
    });
  }
}

// ------------------------------------------------------------------ droplets (grease spatter / sauce splash), ballistic
export class Droplets {
  constructor(scene, { count = 60, color = '#3A1C08', rough = 0.08, size = 0.022, seed = 9, emissive = null } = {}) {
    this.r = rng(seed); this.count = count;
    const geo = new THREE.SphereGeometry(1, 12, 8);
    const mat = new THREE.MeshPhysicalMaterial({ color, roughness: rough, clearcoat: 1, clearcoatRoughness: 0.03, metalness: 0.0 });
    if (emissive) { mat.emissive = new THREE.Color(emissive); mat.emissiveIntensity = 0.15; }
    this.mesh = new THREE.InstancedMesh(geo, mat, count); this.mesh.frustumCulled = false; this.mesh.castShadow = false;
    this.p = Array.from({ length: count }, () => ({ a: this.r() * Math.PI * 2, v: 0.6 + this.r() * 1.0, up: 0.6 + this.r() * 1.6, s: (0.4 + this.r() * 0.9) * size, d: this.r() * 0.05 }));
    scene.add(this.mesh); this.m = new THREE.Matrix4(); this.hide();
  }
  hide() { this.m.makeScale(0, 0, 0); for (let i = 0; i < this.count; i++) this.mesh.setMatrixAt(i, this.m); this.mesh.instanceMatrix.needsUpdate = true; }
  /** burst at origin o (Vector3) at time t0; spread = radial speed scale */
  update(t, t0, o, { spread = 1.6, upK = 1.0, g = 9.0, life = 0.7, ring = 0.9 } = {}) {
    const age = t - t0;
    if (age < 0 || age > life) { this.hide(); return; }
    const q = new THREE.Quaternion(), sc = new THREE.Vector3(), P = new THREE.Vector3(), V = new THREE.Vector3();
    this.p.forEach((d, i) => {
      const a2 = Math.max(0, age - d.d);
      const vx = Math.cos(d.a) * d.v * spread, vz = Math.sin(d.a) * d.v * spread, vy = d.up * upK * 2.2;
      P.set(o.x + Math.cos(d.a) * ring + vx * a2, o.y + vy * a2 - 0.5 * g * a2 * a2, o.z + Math.sin(d.a) * ring + vz * a2);
      V.set(vx, vy - g * a2, vz);
      const sp = V.length(); const stretch = 1 + Math.min(3, sp * 0.06 * 30 / 30 * 2.5);
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), V.clone().normalize());
      const fade = 1 - smooth(0.7, 1, age / life);
      const s = a2 > 0 && P.y > -0.02 ? d.s * fade : 0;
      sc.set(s, s * stretch, s);
      this.m.compose(P, q, sc); this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
