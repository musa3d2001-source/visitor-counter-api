// TASH boost ad «نقاط مشروعك»: the 3D paper studio (5.00–12.62). 100% code: Three.js r180, no textures, no AI.
// «مشروعك» = ONE unioned outline (tools/word_export.py, skia-pathops) extruded thin with a small bevel, standing on a
// matte warm-grey paper sweep. Lights: a background pool behind the word (so the word starts as a silhouette), three
// lamp PointLights at the dots' stations (edge light only: they sit behind the front plane, so the dotless word is
// never front-lit), and a front key that floods only when the dots are home (9.00). Camera = rig.js (shared with 2D).
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const PAPER = 0xF5F5E9, SWEEP = 0x8C887E, LAMP = 0xF2FFD6;

/** SVG path (absolute M L H V Q C Z, as written by fontTools' SVGPathPen) → contours of [x, y] points. */
export function pathContours(d, qSeg = 10, cSeg = 14) {
  const tok = d.match(/[MLHVQCZ]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/gi);
  const out = []; let cur = null, x = 0, y = 0, i = 0, cmd = null;
  const num = () => parseFloat(tok[i++]);
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    if (cmd === 'M') { x = num(); y = num(); cur = [[x, y]]; out.push(cur); cmd = 'L'; continue; }
    if (cmd === 'Z' || cmd === 'z') { cur = null; continue; }
    if (cmd === 'L') { x = num(); y = num(); cur.push([x, y]); }
    else if (cmd === 'H') { x = num(); cur.push([x, y]); }
    else if (cmd === 'V') { y = num(); cur.push([x, y]); }
    else if (cmd === 'Q') {
      const cx = num(), cy = num(), ex = num(), ey = num();
      for (let k = 1; k <= qSeg; k++) { const s = k / qSeg, a = (1 - s) ** 2, b = 2 * s * (1 - s), c = s * s; cur.push([a * x + b * cx + c * ex, a * y + b * cy + c * ey]); }
      x = ex; y = ey;
    } else if (cmd === 'C') {
      const c1x = num(), c1y = num(), c2x = num(), c2y = num(), ex = num(), ey = num();
      for (let k = 1; k <= cSeg; k++) { const s = k / cSeg, a = (1 - s) ** 3, b = 3 * s * (1 - s) ** 2, c = 3 * s * s * (1 - s), e = s ** 3; cur.push([a * x + b * c1x + c * c2x + e * ex, a * y + b * c1y + c * c2y + e * ey]); }
      x = ex; y = ey;
    } else throw new Error('path command ' + cmd);
  }
  // drop repeated points, then closing duplicates
  return out.map(c => c.filter((p, k) => k === 0 || Math.hypot(p[0] - c[k - 1][0], p[1] - c[k - 1][1]) > 1e-3)).map(c => (c.length > 2 && Math.hypot(c[0][0] - c.at(-1)[0], c[0][1] - c.at(-1)[1]) < 1e-6 ? c.slice(0, -1) : c)).filter(c => c.length > 2);
}

const area = c => c.reduce((s, p, k) => { const q = c[(k + 1) % c.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
function inside(pt, c) {
  let r = false;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const [xi, yi] = c[i], [xj, yj] = c[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) r = !r;
  }
  return r;
}

/** Contours (world units) → THREE.Shapes with holes, by winding relative to the largest contour + containment. */
function toShapes(contours) {
  const big = contours.reduce((a, c) => (Math.abs(area(c)) > Math.abs(area(a)) ? c : a));
  const outerSign = Math.sign(area(big));
  const outers = contours.filter(c => Math.sign(area(c)) === outerSign).map(c => ({ c, shape: new THREE.Shape(c.map(p => new THREE.Vector2(p[0], p[1]))) }));
  for (const h of contours.filter(c => Math.sign(area(c)) !== outerSign)) {
    const host = outers.filter(o => inside(h[0], o.c)).sort((a, b) => Math.abs(area(a.c)) - Math.abs(area(b.c)))[0];
    if (host) host.shape.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p[0], p[1]))));
  }
  return outers.map(o => o.shape);
}

/** Thin extrusion, smooth creased side walls, flat caps; front cap at z = 0, silhouette = the flat outline. */
function extrudeWord(shapes, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 4, curveSegments: 1, steps: 1 });
  g.translate(0, 0, -(depth + bevel));
  // one group per shape and material: gather every cap group and every side group
  const part = mi => {
    const src = g.attributes.position.array, chunks = g.groups.filter(x => x.materialIndex === mi).map(x => src.slice(x.start * 3, (x.start + x.count) * 3));
    const arr = new Float32Array(chunks.reduce((n, c) => n + c.length, 0)); let o = 0; for (const c of chunks) { arr.set(c, o); o += c.length; }
    const b = new THREE.BufferGeometry(); b.setAttribute('position', new THREE.BufferAttribute(arr, 3)); return b;
  };
  const caps = part(0); caps.computeVertexNormals();
  const sides = toCreasedNormals(part(1), 0.5);
  const m = mergeGeometries([caps, sides]); g.dispose();
  return m;
}

/** Floor → cove → wall, as one smooth strip along x (profile in the z–y plane). uv.y carries an emissive level 0..1
 *  (the lit sweep): bright on the floor just in front of the word, falling off toward the camera; the wall stays dark
 *  except for the light pool behind the word. */
function sweepGeometry(yFloor, zCove, R, floorLevel, wallLevel = 0, xHalf = 90, zFront = 140, wallTop = 60) {
  const lerpN = (a, b, k) => a + (b - a) * k;
  const prof = [];
  for (let k = 0; k <= 90; k++) { const z = zFront + (zCove - zFront) * (1 - Math.pow(1 - k / 90, 2.2)); prof.push([z, yFloor, 0, 1, floorLevel(z)]); }
  for (let k = 1; k <= 28; k++) { const a = (k / 28) * Math.PI / 2; prof.push([zCove - R * Math.sin(a), yFloor + R - R * Math.cos(a), Math.sin(a), Math.cos(a), lerpN(floorLevel(zCove), wallLevel, k / 28)]); }
  prof.push([zCove - R, yFloor + wallTop, 1, 0, wallLevel]);
  const pos = [], nor = [], uv = [], idx = [];
  prof.forEach(([z, y, nz, ny, e]) => { for (const x of [-xHalf, xHalf]) { pos.push(x, y, z); nor.push(0, ny, nz); uv.push(x > 0 ? 1 : 0, e); } });
  for (let j = 0; j < prof.length - 1; j++) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export async function createStudio(canvas, { W, H, A, word, baseline, rig, tune = {} }) {
  const TU = { exposure: 1.0, amb: 0.12, pool: 520, poolAngle: 0.3, floorE: 0.11, wallE: 0.14, lamp: 56, key: 800, fill: 2.0, local: 0.35, depth: 0.14, bevel: 0.04, lampRange: 5.0, ...tune };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = TU.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141412);

  // ---- the word: px (y down, origin at advance start on the baseline) → world
  const ox = A.x - word.slot[0];
  const contours = pathContours(word.d).map(c => c.map(([x, y]) => [(ox + x - W / 2) / 100, (H / 2 - (baseline + y)) / 100]));
  const geo = extrudeWord(toShapes(contours), TU.depth, TU.bevel);
  const wordMat = new THREE.MeshStandardMaterial({ color: PAPER, roughness: 0.48, metalness: 0, dithering: true });
  const mesh = new THREE.Mesh(geo, wordMat); mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);

  // ---- the paper sweep: floor at the word's lowest ink, cove well behind it (lamp spill on the wall stays soft)
  const yFloor = (H / 2 - (baseline + word.ink[3])) / 100 - 0.004;
  const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  // emissive level along the floor (z = depth toward the camera); the long lens maps z 40–62 onto most of the lower frame
  // the floor is brightest just in front of the word; behind it, it falls to the wall level so there is no lit seam
  const floorLevel = z => (z < 0.6 ? lerpS(TU.wallE, 1.0, smooth(-6, 0.6, z)) : 0.45 + 0.55 * (1 - smooth(2, 45, z)));
  const lerpS = (a, b, k) => a + (b - a) * k;
  const ramp = new THREE.DataTexture(new Uint8Array([...Array(256)].flatMap((_, k) => [k, k, k, 255])), 1, 256);
  ramp.needsUpdate = true; ramp.magFilter = ramp.minFilter = THREE.LinearFilter; ramp.colorSpace = THREE.NoColorSpace;
  const sweepMat = new THREE.MeshStandardMaterial({ color: SWEEP, roughness: 0.93, metalness: 0, dithering: true, emissive: 0xE8E0D0, emissiveMap: ramp, emissiveIntensity: TU.floorE });
  const sweep = new THREE.Mesh(sweepGeometry(yFloor, -15.0, 6.0, floorLevel, TU.wallE), sweepMat); sweep.receiveShadow = true;
  scene.add(sweep);
  // contact shadow: a soft dark decal on the floor under the word's footprint (grounds it; no levitation)
  {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
    const grd = g.createRadialGradient(256, 64, 4, 256, 64, 64); grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.scale(4, 1); g.fillStyle = grd; g.fillRect(0, 0, 128, 128); g.restore();
    const tex = new THREE.CanvasTexture(c);
    const w = (word.ink[2] - word.ink[0]) / 100 * 1.12, d = 1.5;
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.62, depthWrite: false, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2 }));
    decal.rotation.x = -Math.PI / 2;
    decal.position.set((ox + (word.ink[0] + word.ink[2]) / 2 - W / 2) / 100, yFloor + 0.003, -0.12);
    scene.add(decal);
  }

  const [ax, ay] = rig.world(A.x, A.y);
  const cx = (ox + (word.ink[0] + word.ink[2]) / 2 - W / 2) / 100;

  // ---- lights
  const hemi = new THREE.HemisphereLight(0xfff6e8, 0x3a362e, TU.amb); scene.add(hemi);
  // background pool: a wide soft spot on the floor BEHIND the word, aimed low at the cove (never reaches the front faces)
  const pool = new THREE.SpotLight(0xfff0d8, TU.pool, 0, TU.poolAngle, 1.0, 2);
  pool.position.set(cx + 0.2, yFloor + 0.5, -2.2); pool.target.position.set(cx + 0.1, yFloor + 2.6, -21.0);
  scene.add(pool, pool.target);
  // three lamps (the dots' stations): point lights, decay 2
  const lamps = [0, 1, 2].map(() => { const l = new THREE.PointLight(LAMP, 0, TU.lampRange, 2); scene.add(l); return l; });   // range-capped: rims, no wash on the floor seam or the wall
  // key: a softbox front-right, 45° high; fill front-left; three tiny local lights on the ش tops
  const key = new THREE.SpotLight(0xfffaf0, 0, 0, 0.5, 0.95, 2);
  key.position.set(ax + 7.5, ay + 7.5, 9.5); key.target.position.set(cx, yFloor + 0.9, 0);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.01; key.shadow.radius = 6;
  key.shadow.camera.near = 4; key.shadow.camera.far = 40;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xf3f0ff, 0); fill.position.set(ax - 9, ay + 2, 12); fill.target.position.set(cx, yFloor + 0.8, 0);
  scene.add(fill, fill.target);
  const locals = [0, 1, 2].map(i => { const l = new THREE.PointLight(LAMP, 0, 1.0, 2); l.position.set(rig.home(i)[0], ay - 0.12, 0.25); scene.add(l); return l; });

  const cam = new THREE.PerspectiveCamera(16, W / H, 1, 400);

  function render(f) {
    const c = rig.camera(f);
    cam.position.set(...c.eye); cam.up.set(0, 1, 0); cam.lookAt(...c.target);
    cam.fov = c.fov; cam.aspect = W / H; cam.near = 1; cam.far = c.dz + 160; cam.updateProjectionMatrix();
    const ndcX = (c.s[0] - W / 2) / (W / 2), ndcY = -(c.s[1] - H / 2) / (H / 2);
    cam.projectionMatrix.elements[8] = -ndcX; cam.projectionMatrix.elements[9] = -ndcY;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    cam.updateMatrixWorld(true);

    const L = rig.lights(f);
    L.lamps.forEach((s, i) => { lamps[i].position.set(...s.pos); lamps[i].intensity = TU.lamp * s.k; });
    key.intensity = TU.key * L.key;
    pool.intensity = TU.pool * L.pool;
    fill.intensity = TU.fill * L.fill;
    locals.forEach((l, i) => { l.intensity = TU.local * L.local[i]; });
    renderer.render(scene, cam);
  }
  return { render, renderer, scene, cam, mesh, TU };
}
