// HABBA — concept ad #3 (specialty coffee). The page is a pure function of time.
// URL: ?clean=1 (pure footage, same timeline) · ?poster=1 (designed cover) · ?t=… / ?play (preview)
import * as THREE from 'three';
import { boot, grain, clamp, lerp, tw, E, rng } from '/_system/motion/kit.js';
import { bakeTextures, makeGobo, makeEnv, makeRoom, makeCup, makeSaucer, makeBeans, makeSteam, makeLatte, makeStream, makePost, DIM } from './scene.js';
import { C, frameSpec } from './shots.js';

const q = new URLSearchParams(location.search);
const CLEAN = q.has('clean');
const POSTER = q.has('poster');
const W = 1080, H = 1920;

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement); renderer.domElement.id = 'gl';

await Promise.all([
  document.fonts.load('300 140px Alexandria'), document.fonts.load('400 40px Archivo'), document.fonts.load('500 40px Archivo'),
  document.fonts.load('600 22px "JetBrains Mono"'), document.fonts.load('400 26px "IBM Plex Sans Arabic"'), document.fonts.load('700 56px Alexandria'),
]);
await document.fonts.ready;

// ---------------------------------------------------------------- world
const scene = new THREE.Scene();
scene.background = new THREE.Color(0.035, 0.022, 0.015);
const tex = bakeTextures(renderer);
const env = makeEnv(renderer);
scene.environment = env; scene.environmentIntensity = 0.42;
const gobo = makeGobo(renderer);
const room = makeRoom(tex); scene.add(room.group);
const saucer = makeSaucer(tex); scene.add(saucer);
const cup = makeCup(tex, env); cup.group.position.y = DIM.saucerY; scene.add(cup.group);
await cup.logoTex.ready;
const beans = makeBeans(16); scene.add(beans.group);
const steam = makeSteam(gobo); const steamScene = new THREE.Scene(); steamScene.add(steam.group);
const latte = makeLatte(renderer); cup.liqMat.map = latte.rt.texture; cup.liqMat.needsUpdate = true;
const stream = makeStream(); scene.add(stream.mesh);

// the sun through the blinds: a far, narrow spot with the blinds as its gobo (map needs castShadow)
const SUN_DIR = new THREE.Vector3(0.80, -0.50, -0.34).normalize();
const sun = new THREE.SpotLight(0xffdcb0, 9, 0, 0.20, 0.3, 0);
const SUN_AIM = new THREE.Vector3(0.25, 0.25, -0.7);
sun.position.copy(SUN_DIR.clone().multiplyScalar(-14)).add(SUN_AIM);
sun.target.position.copy(SUN_AIM);
sun.map = gobo.tex; sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.01; sun.shadow.radius = 4; sun.shadow.blurSamples = 8;
sun.shadow.camera.near = 6; sun.shadow.camera.far = 24;
scene.add(sun, sun.target);
const fill = new THREE.HemisphereLight(0xffe7cc, 0x5a3a26, 0.25); scene.add(fill);

const camera = new THREE.PerspectiveCamera(30, W / H, 0.03, 40);
const post = makePost(renderer, W, H);
const grainCv = document.getElementById('grain');

// ---------------------------------------------------------------- overlay (type, end card, TASH tail)
let overlay = { render() {} };
if (!CLEAN) { const m = await import('./overlay.js'); overlay = await m.makeOverlay(stage, { W, H, poster: POSTER }); }

const sunMat = new THREE.Matrix4();
let lastLatte = '';
function apply(S, t) {
  // camera
  camera.fov = S.cam.fov; camera.position.set(...S.cam.pos); camera.up.set(...(S.cam.up || [0, 1, 0])); camera.lookAt(...S.cam.target); camera.updateProjectionMatrix();
  // light
  const aim = S.sunAim ? new THREE.Vector3(...S.sunAim) : SUN_AIM;          // the poster may re-aim the sun (same direction)
  sun.position.copy(SUN_DIR).multiplyScalar(-14).add(aim); sun.target.position.copy(aim); sun.target.updateMatrixWorld();
  gobo.draw(S.blinds); if (S._T) S._mark('gobo', S._T);
  sun.intensity = S.sun;
  scene.environmentIntensity = S.envI; fill.intensity = S.fill;
  // cup + saucer
  cup.group.rotation.y = S.cupRot;
  cup.liq.rotation.z = (S.heartYaw ?? 0) - S.cupRot;   // the heart's world yaw (liquid turns with the cup unless told)
  // latte surface (re-render only when it changes)
  const lk = JSON.stringify(S.latte);
  if (lk !== lastLatte) { latte.render(S.latte); lastLatte = lk; }
  // stream
  stream.mesh.visible = !!S.stream;
  if (S.stream) stream.set(S.stream);
  // beans
  beans.beans.forEach((b, i) => {
    const st = S.beans[i];
    b.mesh.visible = !!st;
    if (st) { b.mesh.position.set(...st.p); b.mesh.quaternion.set(...st.q); }
  });
  // steam billboards (face the camera around the vertical axis)
  sun.updateMatrixWorld(); sun.shadow.camera.updateMatrixWorld();
  sunMat.multiplyMatrices(sun.shadow.camera.projectionMatrix, sun.shadow.camera.matrixWorldInverse);
  steam.planes.forEach((pl, i) => {
    const sp = S.steam[i];
    pl.visible = !!sp && sp.amt > 0.001;
    if (!pl.visible) return;
    pl.position.set(...sp.p); pl.scale.set(sp.w, sp.h, 1);
    pl.lookAt(camera.position.x, pl.position.y, camera.position.z);
    const u = pl.material.uniforms; u.uT.value = sp.t; u.uAmt.value = sp.amt; u.uSun.value.copy(sunMat);
  });
}

const PROF = q.has('prof');
const gl = renderer.getContext();
const px = new Uint8Array(4);
const mark = (lab, T) => { if (PROF) { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const n = performance.now(); T.push(lab + ' ' + (n - T.last).toFixed(0)); T.last = n; } };
async function seek(t) {
  const T = []; T.last = performance.now();
  const S = frameSpec(t, { clean: CLEAN, poster: POSTER });
  S._T = T; S._mark = mark;
  apply(S, t); mark('apply', T);
  // the shadow camera must match the gobo projection used by the steam shader: render once to update it if needed
  post.render(scene, camera, { focus: S.dof.focus, aperture: S.dof.ap, exposure: S.exposure, frame: Math.round(t * 30), vig: 1, fade: S.fade || 0, steamScene, mark: lab => mark(lab, T) });
  mark('gl', T);
  grain(grainCv, Math.round(t * 30), { amount: 26, scale: 2 }); mark('grain', T);
  overlay.render(t, S); mark('overlay', T);
  if (PROF) console.warn(`t=${t} ` + T.join(' | '));
}

boot({ width: W, height: H, fps: 30, duration: C.duration, seek });
