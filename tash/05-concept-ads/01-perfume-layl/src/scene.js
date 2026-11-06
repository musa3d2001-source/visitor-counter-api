// LAYL — 3D set: studio environment, bottle, floor, particles and a small deterministic post pipeline.
// Everything here is built procedurally (no external assets). Units: 1 = bottle width ≈ 10 cm.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { rng } from '/_system/motion/kit.js';

export const PAL = {
  black: '#050403', amber: '#E09A2D', honey: '#F2B35A', brass: '#C9A15B', ivory: '#EFE3C8',
};

// ------------------------------------------------------------------------------------------ geometry
/** Pointed (two-centred) arch outline, flat-topped where the neck sits. Returns array of Vector2 (CCW). */
export function archPoints({ a = 0.48, hs = 0.8, R = 0.62, f = 0.11, y0 = 0, rc = 0.04, n = 160, yClip = null }) {
  const pts = [];
  const cxR = a - R; // centre of the right arc (sits left of the axis)
  const angTop = Math.acos((f - cxR) / R);
  // bottom-right rounded corner
  const corner = (cx, cy, a0, a1) => { for (let i = 0; i <= 14; i++) { const t = a0 + (a1 - a0) * i / 14; pts.push(new THREE.Vector2(cx + rc * Math.cos(t), cy + rc * Math.sin(t))); } };
  corner(-a + rc, y0 + rc, Math.PI, Math.PI * 1.5);
  corner(a - rc, y0 + rc, -Math.PI / 2, 0);
  // right side up to the spring line, then right arc to the neck plateau
  for (let i = 0; i <= n; i++) { const t = angTop * i / n; pts.push(new THREE.Vector2(cxR + R * Math.cos(t), hs + R * Math.sin(t))); }
  // left arc (mirror), from plateau down to spring line
  for (let i = n; i >= 0; i--) { const t = angTop * i / n; pts.push(new THREE.Vector2(-(cxR + R * Math.cos(t)), hs + R * Math.sin(t))); }
  let out = pts;
  if (yClip != null) { // clip convex polygon to y <= yClip
    out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const pin = p.y <= yClip, qin = q.y <= yClip;
      if (pin) out.push(p);
      if (pin !== qin) { const k = (yClip - p.y) / (q.y - p.y); out.push(new THREE.Vector2(p.x + (q.x - p.x) * k, yClip)); }
    }
  }
  // de-duplicate consecutive points
  return out.filter((p, i, arr) => i === 0 || p.distanceTo(arr[i - 1]) > 1e-5);
}

/** Extrude with smooth side walls (bevel + sides share normals) and perfectly flat front/back faces.
 *  ExtrudeGeometry is non-indexed, so its normals are per facet — refraction through it shows every facet. */
function extrudeArch(opts, depth, bevel, bevelSeg = 8) {
  const shape = new THREE.Shape(archPoints(opts));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: bevelSeg, curveSegments: 64, steps: 1 });
  g.translate(0, 0, -depth / 2);
  const part = (grp) => {
    const out = new THREE.BufferGeometry();
    const src = g.attributes.position.array.slice(grp.start * 3, (grp.start + grp.count) * 3);
    out.setAttribute('position', new THREE.BufferAttribute(src, 3));
    return out;
  };
  const caps = part(g.groups.find(x => x.materialIndex === 0));
  let sides = part(g.groups.find(x => x.materialIndex === 1));
  caps.computeVertexNormals();                       // flat
  sides = mergeVertices(sides, 1e-5); sides.computeVertexNormals(); sides = sides.toNonIndexed();
  const merged = mergeGeometries([caps, sides]);
  // planar UVs (x,y) for completeness
  const P = merged.attributes.position, uv = new Float32Array(P.count * 2);
  for (let i = 0; i < P.count; i++) { uv[i * 2] = P.getX(i) + 0.5; uv[i * 2 + 1] = P.getY(i) / 1.5; }
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.dispose();
  return merged;
}

export const DIM = (() => {
  const body = { a: 0.48, hs: 0.80, R: 0.62, f: 0.115, y0: 0, rc: 0.05 };
  const bevel = 0.04, depth = 0.34;
  const cxR = body.a - body.R;
  const plateau = body.hs + Math.sqrt(body.R ** 2 - (body.f - cxR) ** 2) + bevel; // top of glass incl. bevel
  const inset = 0.13;
  const cav = { a: body.a - inset, hs: body.hs, R: body.R - inset, f: 0.03, y0: 0.25, rc: 0.035 };
  return { body, bevel, depth, plateau, cav, cavDepth: 0.15, cavBevel: 0.025, fill: 1.06 };
})();

// ------------------------------------------------------------------------------------------ textures
function brushedTexture(seed = 3) {
  const w = 1024, h = 512, c = new OffscreenCanvas(w, h), x = c.getContext('2d');
  const r = rng(seed);
  x.fillStyle = '#808080'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) { // fine long streaks along u (around the lathe)
    const y = r() * h, len = 200 + r() * 900, x0 = r() * w, v = 112 + r() * 34, a = 0.05 + r() * 0.12;
    x.strokeStyle = `rgba(${v},${v},${v},${a})`; x.lineWidth = 0.35 + r() * 0.5;
    x.beginPath(); x.moveTo(x0, y); x.lineTo(x0 + len, y); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Hot-foil label printed on the glass plinth: «ليل» + LAYL + EAU DE PARFUM · No.07 (real fonts). */
function labelTexture() {
  const w = 1600, h = 520, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.clearRect(0, 0, w, h);
  x.fillStyle = '#fff';
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  // Arabic: never letter-spaced
  x.direction = 'rtl'; x.font = '300 230px Alexandria'; x.letterSpacing = '0px';
  x.fillText('ليل', w / 2, 250);
  // Latin: Archivo expanded, wide tracking
  x.direction = 'ltr'; x.fontStretch = 'expanded'; x.font = '300 92px Archivo'; x.letterSpacing = '46px';
  x.fillText('LAYL', w / 2 + 23, 390);
  x.font = '400 34px Archivo'; x.letterSpacing = '13px';
  x.fillText('EAU DE PARFUM  ·  No.07', w / 2 + 6, 470);
  // hairline
  x.fillRect(w / 2 - 70, 300, 140, 2);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------------------------------ studio env
/** Emissive strip-softbox studio, rendered to a PMREM. Strips are named so shots can re-light. */
export function makeStudio(renderer) {
  const env = new THREE.Scene(); env.background = new THREE.Color(0, 0, 0);
  const strips = {};
  // softbox falloff: flat centre, smooth edges across the width and at the ends (no aliasing in macro reflections)
  const sc = document.createElement('canvas'); sc.width = 64; sc.height = 256; const sx = sc.getContext('2d');
  const gx = sx.createLinearGradient(0, 0, 64, 0);
  gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(0.22, '#fff'); gx.addColorStop(0.78, '#fff'); gx.addColorStop(1, 'rgba(255,255,255,0)');
  sx.fillStyle = gx; sx.fillRect(0, 0, 64, 256);
  sx.globalCompositeOperation = 'destination-in';
  const gy = sx.createLinearGradient(0, 0, 0, 256); gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.08, '#000'); gy.addColorStop(0.92, '#000'); gy.addColorStop(1, 'rgba(0,0,0,0)');
  sx.fillStyle = gy; sx.fillRect(0, 0, 64, 256);
  const soft = new THREE.CanvasTexture(sc); soft.colorSpace = THREE.NoColorSpace;
  const add = (name, w, h, pos, look = [0, 0.8, 0]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, map: soft }));
    m.position.set(...pos); m.lookAt(...look); m.userData.home = { pos: [...pos], look: [...look] }; env.add(m); strips[name] = m; return m;
  };
  add('keyL', 0.7, 8, [-1.7, 1.2, 4.2]);       // tall warm strip behind camera-left: long vertical streak on the front face
  add('keyR', 0.35, 8, [1.9, 1.2, 4.0]);       // thinner partner, camera-right
  add('sideL', 0.5, 8, [-4.0, 1.0, -0.4]);     // side strips: bright bevel edges (rim)
  add('sideR', 0.5, 8, [4.0, 1.0, -0.6]);
  add('rimL', 0.25, 7, [-3.0, 1.0, -2.6]);     // thin back rims
  add('rimR', 0.35, 7, [3.0, 1.0, -2.2]);
  add('top', 3.0, 1.4, [0, 5.0, 1.0]);         // overhead softbox (top bevels, cap top, liquid surface)
  add('fill', 2.4, 0.22, [0.0, 0.05, 3.6]);    // low front kicker (bottom bevel line)
  add('frontL', 0.065, 9, [-0.33, 1.0, 4.6]);   // narrow strips behind camera: crisp streaks on the flat front face
  add('frontR', 0.05, 9, [0.44, 1.0, 4.4]);
  add('sweep', 0.09, 12, [0, 1, 3]);           // the hook strip (animated)
  add('back', 2.6, 1.4, [0, 0.6, -3.6]);       // warm back card: seen through the liquid
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileCubemapShader();
  let rt = null;
  const cache = new Map();
  /** cfg: {name: [r,g,b,intensity] | null}, plus sweepPos [x,y,z]. key = cache key (null = no cache). */
  function build(cfg, key = null) {
    if (key && cache.has(key)) return cache.get(key).texture;
    for (const n in strips) {
      const v = cfg[n];
      strips[n].visible = !!v;
      if (v) strips[n].material.color.setRGB(v[0] * v[3], v[1] * v[3], v[2] * v[3]);
    }
    for (const n in strips) { const h = strips[n].userData.home; const p = (cfg.pos && cfg.pos[n]) || h.pos; strips[n].position.set(...p); strips[n].lookAt(...h.look); }
    if (cfg.sweepPos) { strips.sweep.position.set(...cfg.sweepPos); strips.sweep.lookAt(0, 0.8, 0); }
    const target = pmrem.fromScene(env, 0, 0.1, 50, { size: 512, position: new THREE.Vector3(0, 0.8, 0) });
    if (key) cache.set(key, target); else { if (rt) rt.dispose(); rt = target; }
    return target.texture;
  }
  return { env, strips, build, soft };
}

// ------------------------------------------------------------------------------------------ bottle
export function makeBottle() {
  const g = new THREE.Group(); g.name = 'bottle';
  const D = DIM;

  // glass block
  const glassGeo = extrudeArch(D.body, D.depth, D.bevel, 10);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.02, transmission: 1, thickness: 1.1, ior: 1.5,
    attenuationColor: new THREE.Color('#f4ead6'), attenuationDistance: 3.0, specularIntensity: 1, envMapIntensity: 1.3,
    dispersion: 0.25, side: THREE.FrontSide,
  });
  const glass = new THREE.Mesh(glassGeo, glassMat); glass.name = 'glass';
  g.add(glass);

  // inner cavity interface (glass→air), visible only as faint reflections (additive, refracted by the outer glass)
  const cavGeo = extrudeArch(D.cav, D.cavDepth, D.cavBevel, 6);
  const cavMat = new THREE.MeshPhysicalMaterial({ color: 0x000000, metalness: 0, roughness: 0.04, envMapIntensity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide, transparent: false });
  const cavity = new THREE.Mesh(cavGeo, cavMat); cavity.name = 'cavity';
  g.add(cavity);

  // liquid: inner arch clipped at the fill line, slightly smaller than the cavity
  const liqOpts = { ...D.cav, a: D.cav.a - 0.006, R: D.cav.R - 0.006, y0: D.cav.y0 + 0.006, yClip: D.fill };
  const liqGeo = extrudeArch(liqOpts, D.cavDepth - 0.012, D.cavBevel, 6);
  const liqUniforms = { uGlow: { value: 1 }, uGlowY: { value: 2.0 }, uFill: { value: D.fill }, uBase: { value: D.cav.y0 }, uRefr: { value: 0.35 }, uStripX: { value: 9 }, uStripI: { value: 0 } };
  const liqMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#2a1203'), roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, emissive: new THREE.Color('#e8801c'), emissiveIntensity: 1, envMapIntensity: 0.5 });
  liqMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, liqUniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocalPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalPos = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocalPos; uniform float uGlow, uGlowY, uFill, uBase, uRefr, uStripX, uStripI;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float hy = clamp((vLocalPos.y - uBase) / (uFill - uBase), 0.0, 1.0);
        float facing = abs(dot(normalize(vNormal), normalize(vViewPosition)));
        // backlit flask: brightest low-centre (light focusing through the thick plinth), deep toward the top & edges
        float gx = vLocalPos.x / 0.36;
        float radial = exp(-gx * gx * 1.3 - pow(hy - 0.18, 2.0) * 2.4);
        float caustic = exp(-pow((hy - 0.035) / 0.03, 2.0)) * (1.0 - abs(gx) * 0.8);
        float front = smoothstep(uGlowY, uGlowY - 0.45, vLocalPos.y);
        float I = uGlow * front * (0.10 + 0.90 * radial + 0.6 * caustic) * mix(0.45, 1.0, pow(facing, 1.2));
        // the hook: a strip light passing behind the flask lights a vertical band of amber
        float band = exp(-pow((vLocalPos.x - uStripX) / 0.075, 2.0)) + 0.35 * exp(-pow((vLocalPos.x - uStripX) / 0.22, 2.0));
        I += uStripI * band * mix(0.55, 1.0, 1.0 - hy) * mix(0.5, 1.0, pow(facing, 1.2));
        // intensity-dependent hue: thin/bright light reads honey-gold, deep/dim reads red-brown amber
        vec3 amb = mix(vec3(0.42, 0.075, 0.006), vec3(1.0, 0.52, 0.13), smoothstep(0.0, 0.9, I));
        totalEmissiveRadiance = amb * I * 1.35;`)
      .replace('#include <opaque_fragment>', `
        #ifdef USE_ENVMAP
        {
          vec3 rv = refract(-normalize(vViewPosition), normalize(vNormal), 0.75);
          rv = inverseTransformDirection(rv, viewMatrix);
          vec3 seen = textureCubeUV(envMap, envMapRotation * rv, 0.12).rgb;
          float facing2 = abs(dot(normalize(vNormal), normalize(vViewPosition)));
          vec3 absorb = vec3(0.9, 0.36, 0.06) * mix(0.25, 1.0, facing2);
          outgoingLight += seen * absorb * uRefr;
        }
        #endif
        #include <opaque_fragment>`);
  };
  const liquid = new THREE.Mesh(liqGeo, liqMat); liquid.name = 'liquid';
  g.add(liquid);

  // brass cap (lathe): collar → heavy cylinder with chamfers and a fine groove
  const P = [];
  const add = (r, y) => P.push(new THREE.Vector2(r, y));
  add(0.0, 0.0); add(0.085, 0.0); add(0.085, 0.045); add(0.09, 0.05);
  add(0.235, 0.05); add(0.25, 0.062);            // underside chamfer
  add(0.25, 0.135); add(0.243, 0.142); add(0.243, 0.152); add(0.25, 0.159); // groove
  add(0.25, 0.338); add(0.236, 0.352);            // top chamfer
  add(0.0, 0.352);
  const capGeo = new THREE.LatheGeometry(P, 128);
  const brushed = brushedTexture(5);
  brushed.repeat.set(1, 1);
  const brass = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#c9a15b'), metalness: 1, roughness: 0.34, roughnessMap: brushed, anisotropy: 0.8, anisotropyRotation: 0, bumpMap: brushed, bumpScale: 0.15, envMapIntensity: 1.25, clearcoat: 0.0 });
  const cap = new THREE.Group(); cap.name = 'capGroup';
  const capMesh = new THREE.Mesh(capGeo, brass); capMesh.name = 'cap';
  cap.add(capMesh);
  // atomiser orifice on the cap's left side: dark pin-hole + polished ring
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.016, 32), new THREE.MeshBasicMaterial({ color: 0x020100 }));
  hole.name = 'nozzle';
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 16, 48), new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#d8b46e'), metalness: 1, roughness: 0.12, envMapIntensity: 1.4 }));
  ring.name = 'nozzleRing';
  const nozzle = new THREE.Group(); nozzle.add(hole, ring);
  nozzle.position.set(-0.2515, 0.245, 0); nozzle.rotation.y = -Math.PI / 2;
  cap.add(nozzle);
  cap.position.y = D.plateau - 0.004;
  g.add(cap);

  // hot-foil label on the clear glass plinth (front face)
  const labelTex = labelTexture();
  const labelMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#e2c27f'), metalness: 0.85, roughness: 0.28, alphaMap: labelTex, transparent: true, envMapIntensity: 1.2, emissive: new THREE.Color('#3a2a10'), emissiveIntensity: 1, depthWrite: false });
  const labelW = 0.56, labelH = labelW * 520 / 1600;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(labelW, labelH), labelMat); label.name = 'label';
  label.position.set(0, 0.115, D.depth / 2 + D.bevel + 0.0015);
  g.add(label);

  return {
    group: g, glass, cavity, liquid, cap, capMesh, nozzle, label, liqUniforms,
    nozzleWorld: () => nozzle.getWorldPosition(new THREE.Vector3()),
    mats: { glass: glassMat, cav: cavMat, liq: liqMat, brass, label: labelMat },
  };
}

// ------------------------------------------------------------------------------------------ floor + backdrop
const floorShader = {
  name: 'LaylFloor',
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uRefl: { value: 0.5 }, uPool: { value: 1 }, uPoolColor: { value: new THREE.Color(0.018, 0.008, 0.002) } },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() { vUv = textureMatrix * vec4(position, 1.0); vWorld = (modelMatrix * vec4(position,1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 color; uniform sampler2D tDiffuse; uniform float uRefl, uPool; uniform vec3 uPoolColor;
    varying vec4 vUv; varying vec3 vWorld;
    #include <logdepthbuf_pars_fragment>
    void main() {
      #include <logdepthbuf_fragment>
      vec3 refl = texture2DProj(tDiffuse, vUv).rgb;
      float r = length(vWorld.xz);
      float fadeR = 1.0 - smoothstep(0.6, 3.2, r);
      vec3 col = vec3(0.0006, 0.0005, 0.0004);
      col += uPoolColor * uPool * exp(-r * r * 2.6);            // warm light pool under the bottle
      // glossy black acrylic at a grazing view: strong near the contact, never fully gone (it also mirrors the backdrop)
      float dz = max(vWorld.z - 0.22, 0.0);
      col += refl * uRefl * (0.50 * exp(-dz * 0.22) + 0.18);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export function makeFloor(W, H) {
  const geo = new THREE.PlaneGeometry(40, 40);
  const floor = new Reflector(geo, { clipBias: 0.002, textureWidth: W / 2, textureHeight: H / 2, color: 0xffffff, shader: floorShader });
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0;
  floor.name = 'floor';
  return floor;
}

export function makeBackdrop() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uWarm: { value: new THREE.Color(0.030, 0.0135, 0.004) }, uAmt: { value: 1 }, uDir: { value: new THREE.Vector3(0, 0.12, -1).normalize() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix*vec4(position,1.0)).xyz - vec3(0.0,0.8,0.0)); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uWarm; uniform float uAmt; uniform vec3 uDir; varying vec3 vDir;
      void main(){ float k = max(dot(normalize(vDir), uDir), 0.0); vec3 c = vec3(0.0006,0.0005,0.0004) + uWarm * pow(k, 18.0) * uAmt; gl_FragColor = vec4(c,1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(30, 48, 24), mat); m.name = 'backdrop';
  m.renderOrder = -10;
  return m;
}

// ------------------------------------------------------------------------------------------ particles
const particleVS = /* glsl */`
  attribute vec4 aSeed;          // x,y,z: random 0..1, w: size seed
  attribute vec3 aBase;          // base position
  attribute vec3 aVel;           // drift velocity
  uniform float uTime, uFocus, uAperture, uPx, uSize, uOpacity;
  uniform vec3 uLightDir;        // direction TOWARD the back light (world)
  uniform float uKind;           // 0 dust, 1 mist droplet, 2 mist cloud
  uniform float uSim;            // spray sim time (s)
  uniform vec3 uOrigin, uDirMist;
  varying float vA; varying float vSoft; varying vec3 vCol;
  vec3 hash3(vec3 p){ return fract(sin(vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6))))*43758.5453); }
  void main(){
    vec3 p; float bright = 1.0; float size = uSize * (0.35 + aSeed.w * 0.9);
    if (uKind < 0.5) {
      // gold dust: slow drift + swirl, wraps inside a box
      p = aBase + aVel * uTime;
      p.x += sin(uTime * (0.3 + aSeed.x * 0.5) + aSeed.y * 6.28) * 0.08;
      p.z += cos(uTime * (0.25 + aSeed.z * 0.4) + aSeed.x * 6.28) * 0.08;
      p.y = mod(p.y, 2.8) - 0.1;
      // flakes catch the light as they tumble
      float tw = pow(0.5 + 0.5 * sin(uTime * (1.2 + aSeed.y * 2.5) + aSeed.z * 40.0), 10.0);
      bright = 0.28 + 2.6 * tw;
    } else {
      // atomiser mist: droplets leave the orifice in a cone and slow down in the air
      float birth = aSeed.w * 0.22;
      float age = max(uSim - birth, 0.0);
      float alive = step(birth, uSim);
      vec3 dir = normalize(uDirMist + (aSeed.xyz - 0.5) * vec3(0.32, 0.30, 0.32) * (uKind > 1.5 ? 1.6 : 1.0));
      float speed = (uKind > 1.5 ? 2.2 : 3.2) * (0.6 + aSeed.y * 0.8);
      float k = uKind > 1.5 ? 2.2 : 3.4;
      float travel = speed * (1.0 - exp(-k * age)) / k;
      vec3 turb = (hash3(aSeed.xyz * 13.0) - 0.5) * 0.25 * age;
      turb += vec3(sin(age * 2.0 + aSeed.x * 9.0), sin(age * 1.6 + aSeed.y * 7.0) + 0.6, cos(age * 1.8 + aSeed.z * 5.0)) * 0.05 * age;
      p = uOrigin + dir * travel + turb;
      float fadeIn = smoothstep(0.0, 0.02, age);
      float life = uKind > 1.5 ? 1.0 - smoothstep(0.6, 2.2, age) : 1.0 - smoothstep(0.5, 1.8, age);
      bright = alive * fadeIn * life;
      if (uKind > 1.5) size = uSize * (0.4 + 2.2 * (1.0 - exp(-1.6 * age))) * (0.6 + aSeed.w * 0.8);
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = -mv.z;
    // forward scattering: brighter when the light sits behind the particle (toward camera)
    vec3 viewDir = normalize(cameraPosition - p);
    float fwd = pow(max(dot(-viewDir, uLightDir), 0.0), 3.0);
    bright *= (uKind < 0.5 ? 1.0 : (0.25 + 2.2 * fwd));
    // fake depth of field: blur radius grows away from the focus distance, energy is conserved
    float coc = uAperture * abs(dist - uFocus) / max(dist, 0.05);
    float px = size * uPx / dist;
    float blur = px + coc;
    gl_PointSize = clamp(blur, 1.0, 140.0);
    vA = bright * uOpacity * clamp((px * px) / (blur * blur) * 1.0, 0.02, 1.0);
    vSoft = clamp(coc / max(blur, 1.0), 0.0, 1.0);
    vCol = vec3(1.0);
    gl_Position = projectionMatrix * mv;
    vViewZ = mv.z;
  }`;

const particleFS = /* glsl */`
  uniform vec3 uColor; uniform sampler2D tDepth; uniform vec2 uRes; uniform float uNear, uFar, uOcclude, uKindF, uNormal;
  varying float vA; varying float vSoft; varying vec3 vCol;
  float linDepth(float d){ float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
  void main(){
    vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
    if (r > 1.0) discard;
    // sharp core when in focus, flat bokeh disc with a soft rim when defocused
    float core = exp(-r * r * 6.0);
    float disc = smoothstep(1.0, 0.82, r) * (0.75 + 0.25 * smoothstep(0.5, 0.95, r));
    float shape = uKindF > 1.5 ? exp(-r * r * 2.6) : mix(core, disc, vSoft);
    float a = vA * shape;
    // occlusion against the scene depth (particles are drawn after DOF)
    float sceneZ = linDepth(texture2D(tDepth, gl_FragCoord.xy / uRes).r);
    float myZ = -vViewZ;
    a *= mix(1.0, uOcclude, step(sceneZ + 0.02, myZ));
    gl_FragColor = uNormal > 0.5 ? vec4(uColor * vCol, clamp(a, 0.0, 1.0)) : vec4(uColor * vCol * a, 1.0);
  }`;

export function makeParticles({ count, kind, seed, color, size, opacity = 1, box = null }) {
  const r = rng(seed);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), s4 = new Float32Array(count * 4), base = new Float32Array(count * 3), vel = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    s4.set([r(), r(), r(), r()], i * 4);
    if (box) {
      base.set([box[0] + r() * (box[1] - box[0]), box[2] + r() * (box[3] - box[2]), box[4] + r() * (box[5] - box[4])], i * 3);
      vel.set([(r() - 0.5) * 0.04, 0.03 + r() * 0.06, (r() - 0.5) * 0.04], i * 3);
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(s4, 4));
  geo.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
  geo.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 100);
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'varying float vViewZ;\n' + particleVS, fragmentShader: 'varying float vViewZ;\n' + particleFS,
    uniforms: {
      uTime: { value: 0 }, uFocus: { value: 3 }, uAperture: { value: 0 }, uPx: { value: 1000 }, uSize: { value: size }, uOpacity: { value: opacity },
      uLightDir: { value: new THREE.Vector3(0, 0, -1) }, uKind: { value: kind }, uKindF: { value: kind }, uSim: { value: 0 },
      uOrigin: { value: new THREE.Vector3() }, uDirMist: { value: new THREE.Vector3(-1, 0.2, 0) },
      uColor: { value: new THREE.Color(color) }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(1080, 1920) },
      uNear: { value: 0.05 }, uFar: { value: 60 }, uOcclude: { value: 0.25 }, uNormal: { value: 0 },
    },
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
  return pts;
}

// ------------------------------------------------------------------------------------------ post
const quadVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** Depth-of-field: half-res gather blur, then full-res composite by circle of confusion. */
export function makeDOF(W, H) {
  const half = new THREE.WebGLRenderTarget(W / 2, H / 2, { type: THREE.HalfFloatType, depthBuffer: false });
  const out = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false });
  const common = `uniform sampler2D tColor, tDepth; uniform float uNear, uFar, uFocus, uAperture, uMaxCoc; uniform vec2 uRes;
    float linDepth(float d){ float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
    float coc(vec2 uv){ float z = linDepth(texture2D(tDepth, uv).r); return clamp(uAperture * abs(z - uFocus) / max(z, 0.05), 0.0, uMaxCoc); }`;
  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tColor: { value: null }, tDepth: { value: null }, uNear: { value: 0.05 }, uFar: { value: 60 }, uFocus: { value: 3 }, uAperture: { value: 20 }, uMaxCoc: { value: 26 }, uRes: { value: new THREE.Vector2(W, H) } },
    vertexShader: quadVS,
    fragmentShader: common + `
      varying vec2 vUv;
      void main(){
        float cz = linDepth(texture2D(tDepth, vUv).r);
        float cc = clamp(uAperture * abs(cz - uFocus) / max(cz, 0.05), 0.0, uMaxCoc);
        vec3 acc = texture2D(tColor, vUv).rgb; float tot = 1.0;
        float radius = 1.0; float ang = 0.0;
        for (int i = 0; i < 56; i++) {
          vec2 tc = vUv + vec2(cos(ang), sin(ang)) * radius / uRes;
          vec3 sc = texture2D(tColor, tc).rgb;
          float sz = linDepth(texture2D(tDepth, tc).r);
          float ss = clamp(uAperture * abs(sz - uFocus) / max(sz, 0.05), 0.0, uMaxCoc);
          if (sz > cz) ss = min(ss, cc * 2.0);
          float m = smoothstep(radius - 1.0, radius + 1.0, ss);
          acc += mix(acc / tot, sc, m); tot += 1.0;
          radius += uMaxCoc / 56.0; ang += 2.39996323;
        }
        gl_FragColor = vec4(acc / tot, cc);
      }`,
  });
  const compMat = new THREE.ShaderMaterial({
    uniforms: { tColor: { value: null }, tDepth: { value: null }, tBlur: { value: half.texture }, uNear: { value: 0.05 }, uFar: { value: 60 }, uFocus: { value: 3 }, uAperture: { value: 20 }, uMaxCoc: { value: 26 }, uRes: { value: new THREE.Vector2(W, H) } },
    vertexShader: quadVS,
    fragmentShader: common + `
      uniform sampler2D tBlur; varying vec2 vUv;
      void main(){
        vec3 sharp = texture2D(tColor, vUv).rgb;
        vec4 b = texture2D(tBlur, vUv);
        float k = smoothstep(1.0, 4.0, max(coc(vUv), b.a));
        gl_FragColor = vec4(mix(sharp, b.rgb, k), 1.0);
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  const qs = new THREE.Scene(); qs.add(quad);
  const qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  function run(renderer, src, cam, focus, aperture, maxCoc = 26) {
    for (const m of [blurMat, compMat]) {
      m.uniforms.tColor.value = src.texture; m.uniforms.tDepth.value = src.depthTexture;
      m.uniforms.uNear.value = cam.near; m.uniforms.uFar.value = cam.far; m.uniforms.uFocus.value = focus;
      m.uniforms.uAperture.value = aperture; m.uniforms.uMaxCoc.value = maxCoc;
    }
    // blur is computed in full-res pixel units but stored at half res
    quad.material = blurMat; renderer.setRenderTarget(half); renderer.render(qs, qc);
    quad.material = compMat; renderer.setRenderTarget(out); renderer.render(qs, qc);
    return out;
  }
  function copy(renderer, src) { // no DOF: plain copy into the out target
    compMat.uniforms.tColor.value = src.texture; compMat.uniforms.tDepth.value = src.depthTexture; compMat.uniforms.uAperture.value = 0;
    compMat.uniforms.tBlur.value = src.texture;
    quad.material = compMat; renderer.setRenderTarget(out); renderer.render(qs, qc);
    compMat.uniforms.tBlur.value = half.texture;
    return out;
  }
  return { run, copy, out };
}

export function makePost(renderer, W, H) {
  const rtMain = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  rtMain.depthTexture = new THREE.DepthTexture(W, H);
  rtMain.depthTexture.type = THREE.FloatType;
  const dof = makeDOF(W, H);
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.18, 0.55, 0.92);
  const output = makeOutput();
  return { rtMain, dof, bloom, output };
}

/** Final pass: ACES filmic (same curve as three.js) → sRGB → vignette → seeded triangular dither (kills 8-bit banding
 *  in the near-black gradients; deterministic per frame). */
function makeOutput() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uExposure: { value: 1 }, uFrame: { value: 0 }, uVig: { value: 1 } },
    vertexShader: quadVS, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uExposure, uFrame, uVig; varying vec2 vUv;
      vec3 laylRRT(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
      vec3 laylACES(vec3 c){
        const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
        const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
        c *= uExposure / 0.6; c = I * c; c = laylRRT(c); c = O * c; return clamp(c, 0.0, 1.0); }
      vec3 laylSRGB(vec3 v){ return mix(pow(v, vec3(0.41666)) * 1.055 - vec3(0.055), v * 12.92, vec3(lessThanEqual(v, vec3(0.0031308)))); }
      float laylHash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
      void main(){
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        vec2 q = (vUv - 0.5) * vec2(1.0, 1.0);
        float v = smoothstep(0.98, 0.30, length(q * vec2(1.05, 0.82)) * 1.25);
        c *= mix(1.0, mix(0.74, 1.0, v), uVig);
        c = laylSRGB(laylACES(c));
        c = vec3(0.010, 0.008, 0.006) + c * 0.988;   // one grade: warm lifted blacks, never pure #000
        vec2 fc = gl_FragCoord.xy + vec2(uFrame * 17.0, uFrame * 31.0);
        c += (laylHash(fc) + laylHash(fc + 71.3) - 1.0) / 255.0;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); const qs = new THREE.Scene(); qs.add(quad);
  const qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return { mat, render(renderer, src, exposure, frame, vig = 1) { mat.uniforms.tDiffuse.value = src.texture; mat.uniforms.uExposure.value = exposure; mat.uniforms.uFrame.value = frame; mat.uniforms.uVig.value = vig; renderer.setRenderTarget(null); renderer.render(qs, qc); } };
}

export { THREE };
