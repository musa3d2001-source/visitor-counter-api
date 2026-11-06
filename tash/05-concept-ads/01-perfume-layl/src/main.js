// LAYL — concept ad #1 (luxury perfume). Page = pure function of time. ?clean=1 · ?pass=wire|clay · ?poster=1
import * as THREE from 'three';
import { boot, grain } from '/_system/motion/kit.js';
import { makeStudio, makeBottle, makeFloor, makeBackdrop, makeParticles, makePost, DIM } from './scene.js';
import { frameSpec, T } from './shots.js';
import { makeOverlay } from './overlay.js';

const q = new URLSearchParams(location.search);
const PASS = q.get('pass') || 'final';           // final | wire | clay
const CLEAN = q.has('clean') || PASS !== 'final'; // BTS passes are always clean footage
const POSTER = q.has('poster');
const W = 1080, H = 1920;

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement); // under vignette, grain and type
renderer.domElement.id = 'gl';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0, 0, 0);
const camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 60);

const fontsReady = Promise.all([
  document.fonts.load('300 120px Alexandria'), document.fonts.load('400 120px Alexandria'),
  document.fonts.load('300 60px Archivo'), document.fonts.load('400 60px Archivo'),
  document.fonts.load('600 22px "JetBrains Mono"'), document.fonts.load('400 26px "IBM Plex Sans Arabic"'),
  document.fonts.load('700 56px Alexandria'),
]);
await fontsReady; await document.fonts.ready; // the label CanvasTexture needs the real fonts

const bottle = makeBottle();
scene.add(bottle.group);
const floor = makeFloor(W, H); scene.add(floor);
const backdrop = makeBackdrop(); scene.add(backdrop);

const studio = makeStudio(renderer);

// the physical sweep strip (seen refracted through the glass during the hook)
const sweepBack = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, map: studio.soft, transparent: false }));
sweepBack.position.set(0, 1, -1.6); sweepBack.name = 'sweepStrip'; scene.add(sweepBack);

// direct lights: warm key (shapes brass + liquid), cool rim
const key = new THREE.SpotLight(0xffd2a0, 0, 12, 0.55, 0.8, 1.5); key.position.set(-2.4, 3.0, 2.6); key.target.position.set(0, 0.9, 0);
const rim = new THREE.DirectionalLight(0xbcd4ff, 0); rim.position.set(2.5, 2.2, -2.5); rim.target.position.set(0, 0.8, 0);
scene.add(key, key.target, rim, rim.target);

// particles (separate scene: drawn after depth-of-field with their own bokeh)
const fx = new THREE.Scene();
const dustNear = makeParticles({ count: 420, kind: 0, seed: 11, color: '#f3c46a', size: 0.010, opacity: 0.9, box: [-1.6, 1.6, -0.1, 2.6, -1.6, 2.2] });
const dustFar = makeParticles({ count: 260, kind: 0, seed: 23, color: '#d99a3c', size: 0.012, opacity: 0.6, box: [-3.5, 3.5, -0.1, 3.0, -4.0, -1.0] });
const mistDrops = makeParticles({ count: 5200, kind: 1, seed: 31, color: '#ffe2b0', size: 0.0032, opacity: 0.55 });
const mistCloud = makeParticles({ count: 900, kind: 2, seed: 37, color: '#c98a45', size: 0.06, opacity: 0.018 });
fx.add(dustFar, dustNear, mistCloud, mistDrops);
const PARTS = [dustNear, dustFar, mistDrops, mistCloud];

const post = makePost(renderer, W, H);

// ---------------------------------------------------------------------------------------------- BTS passes
const passMats = {};
if (PASS !== 'final') {
  const wire = c => new THREE.MeshBasicMaterial({ color: c, wireframe: true });
  const clay = (c, r = 0.7) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 });
  const M = PASS === 'wire'
    ? { glass: wire('#8e8a80'), cavity: wire('#5a5650'), liquid: wire('#c98a3a'), cap: wire('#c9a15b'), nozzle: wire('#c9a15b'), nozzleRing: wire('#c9a15b'), label: wire('#e6d6b0') }
    : { glass: clay('#b9b4aa', 0.55), cavity: null, liquid: clay('#9c968c', 0.6), cap: clay('#a8a298', 0.45), nozzle: clay('#3a3835'), nozzleRing: clay('#a8a298'), label: null };
  bottle.group.traverse(o => {
    if (!o.isMesh) return;
    const m = M[o.name];
    if (m === null) o.visible = false; else if (m) o.material = m;
  });
  floor.visible = false; floor.userData.off = true;
  if (PASS === 'wire') {
    const grid = new THREE.GridHelper(16, 64, 0x3a3833, 0x232220); grid.position.y = 0.0005; scene.add(grid);
    backdrop.visible = false; sweepBack.material = wire('#555');
  } else {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), clay('#5d5a55', 0.9)); ground.rotation.x = -Math.PI / 2; scene.add(ground);
    passMats.ground = ground;
  }
  for (const p of PARTS) { p.material.blending = THREE.NormalBlending; p.material.uniforms.uNormal.value = 1; p.material.uniforms.uColor.value.set(PASS === 'wire' ? '#a8a49a' : '#e9e4da'); }
  mistCloud.visible = false;
}

// debug switches (never used for deliverables): ?hide=cavity,liquid  ?nodof
const HIDE = (q.get('hide') || '').split(',').filter(Boolean);
scene.traverse(o => { if (HIDE.includes(o.name)) o.userData.hidden = true; });
const NODOF = q.has('nodof');

const overlay = makeOverlay(stage, { W, H, clean: CLEAN, poster: POSTER });
const grainCv = document.getElementById('grain');

// ---------------------------------------------------------------------------------------------- render one frame
function applyCamera(c) {
  camera.fov = c.fov; camera.position.set(...c.pos); camera.up.set(0, 1, 0); camera.lookAt(...c.target);
  camera.updateProjectionMatrix();
  if (c.shiftY) { // vertical lens shift (keeps verticals straight in the low hero shot)
    camera.projectionMatrix.elements[9] = c.shiftY;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  camera.updateMatrixWorld();
}

function renderFrame(t) {
  const s = frameSpec(t);
  if (POSTER && s.shot === 'S6') { // cover framing: a touch wider so the lockup + slate sit above the cap
    const a = 0.07, r = 7.7; s.cam = { ...s.cam, pos: [r * Math.sin(a), 0.36, r * Math.cos(a)], shiftY: 0.403 }; s.focus = r;
  }
  applyCamera(s.cam);

  // environment (bake on change; the hook re-bakes every frame as the strip travels)
  scene.environment = studio.build(s.env, s.envKey);
  scene.environmentIntensity = 1.0;
  key.intensity = s.key * 38; rim.intensity = s.rim * 2.2;
  bottle.liqUniforms.uGlow.value = s.glow; bottle.liqUniforms.uGlowY.value = s.glowY;
  bottle.liqUniforms.uStripX.value = s.stripX; bottle.liqUniforms.uStripI.value = s.stripI;
  bottle.cap.position.y = DIM.plateau - 0.004 - s.capPress * 0.014;
  floor.visible = s.floor && !floor.userData.off;
  if (passMats.ground) passMats.ground.visible = s.floor;
  floor.material.uniforms.uRefl.value = s.refl; floor.material.uniforms.uPool.value = s.pool;
  backdrop.material.uniforms.uAmt.value = s.backdrop;
  sweepBack.visible = !!s.sweepBack;
  if (s.sweepBack) { sweepBack.position.set(s.sweepBack.x, 1, s.sweepBack.z); sweepBack.material.color.setRGB(1, 0.86, 0.66).multiplyScalar(PASS === 'final' ? s.sweepBack.I : 1); sweepBack.lookAt(camera.position.x, 1, camera.position.z); }
  renderer.toneMappingExposure = s.exposure;

  // particles
  const nozzle = bottle.nozzleWorld();
  for (const p of PARTS) {
    const u = p.material.uniforms;
    u.uTime.value = t; u.uFocus.value = s.focus; u.uAperture.value = PASS === 'wire' ? 0 : s.aperture; u.uPx.value = H / (2 * Math.tan(THREE.MathUtils.degToRad(s.cam.fov) / 2));
    u.tDepth.value = post.rtMain.depthTexture; u.uNear.value = camera.near; u.uFar.value = camera.far;
    u.uSim.value = s.sim; u.uOrigin.value.copy(nozzle).add(new THREE.Vector3(-0.012, 0, 0));
    u.uDirMist.value.set(-1, 0.16, 0.12).normalize(); u.uLightDir.value.set(-0.45, 0.25, -1).normalize();
  }
  dustNear.visible = dustFar.visible = s.dust > 0;
  dustNear.material.uniforms.uOpacity.value = 0.9 * s.dust; dustFar.material.uniforms.uOpacity.value = 0.6 * s.dust;
  mistDrops.visible = s.mist > 0; mistCloud.visible = s.mist > 0 && PASS !== 'clay' && PASS !== 'wire';
  mistDrops.material.uniforms.uOpacity.value = 0.55 * s.mist; mistCloud.material.uniforms.uOpacity.value = 0.018 * s.mist;

  scene.traverse(o => { if (o.userData.hidden) o.visible = false; });
  // 1) scene → MSAA HDR target (+depth)
  renderer.setRenderTarget(post.rtMain); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, camera);
  // 2) depth of field
  const ap = (PASS === 'wire' || NODOF) ? 0 : s.aperture;
  const target = ap > 0 ? post.dof.run(renderer, post.rtMain, camera, s.focus, ap) : post.dof.copy(renderer, post.rtMain);
  // 3) particles with their own bokeh, occluded by scene depth
  renderer.setRenderTarget(target); renderer.autoClear = false; renderer.render(fx, camera); renderer.autoClear = true;
  // 4) gentle highlight bloom (halation, not glow), 5) tone-map → screen
  if (PASS !== 'wire' && s.bloom > 0) { post.bloom.strength = s.bloom; post.bloom.render(renderer, null, target, 0, false); }
  post.output.render(renderer, target, s.exposure, Math.round(t * 30), PASS === 'wire' ? 0.4 : 1);
  renderer.setRenderTarget(null);
}

async function seek(t) {
  renderFrame(t);
  overlay.render(t);
  grain(grainCv, Math.round(t * 30), { amount: 26, scale: 2 });
}

boot({ width: W, height: H, fps: 30, duration: T.duration, seek, ready: fontsReady.then(() => overlay.ready) });
