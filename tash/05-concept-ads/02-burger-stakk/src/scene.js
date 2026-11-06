// STAKK — 3D world + shot choreography. Everything is a pure function of t (seconds).
import * as THREE from 'three';
import { clamp, lerp, E, spring } from '/_system/motion/kit.js';
import { makeRenderer, studioEnv, foodLights, stageFloor, griddleSet, buildPress, steamTexture, Steam, Droplets, PAL, srgb } from './lib/world.js';
import { buildBurger, buildSmashPatty, ORDER } from './lib/burger.js';
import { Post } from './lib/post.js';

const sm = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const BG = { red: srgb(PAL.red), charcoal: srgb('#1D1A17'), mustard: srgb(PAL.mustard), deep: srgb('#120F0D') };

export async function createWorld(W, H, C) {
  const r = makeRenderer(W, H);
  const scene = new THREE.Scene();
  const env = {
    red: studioEnv(r, { bounce: PAL.red, bounceK: 0.3 }),
    charcoal: studioEnv(r, { bounce: '#3A2A1E', bounceK: 0.25 }),
    mustard: studioEnv(r, { bounce: PAL.mustard, bounceK: 0.25 }),
    griddle: studioEnv(r, { bounce: '#2A1A0E', bounceK: 0.3, warm: 0.7 }),
  };
  const L = foodLights(scene);
  const floor = stageFloor(scene);
  const B = buildBurger(); scene.add(B.group);
  const grid = griddleSet(scene);
  const smash = buildSmashPatty(); grid.add(smash);
  const press = buildPress(); grid.add(press);
  const gPatty = B.L.patty.children[0].clone(); gPatty.position.y = 0.068; grid.add(gPatty); // cooked patty on the griddle (S02)
  const steamTex = steamTexture();
  const steam = new Steam(scene, steamTex, 110, 5);
  const grease = new Droplets(scene, { count: 70, color: '#4A2408', size: 0.026, seed: 9, rough: 0.05 });
  const sauceSplash = new Droplets(scene, { count: 46, color: '#F09A62', size: 0.03, seed: 19, rough: 0.1, emissive: '#ff5a20' });
  // grease bubbles around the patty on the griddle
  const bub = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: '#3A1A06', roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.0, transmission: 0, metalness: 0.1 }), 90);
  bub.frustumCulled = false; grid.add(bub);
  const bubData = Array.from({ length: 90 }, (_, i) => { const a = i * 2.39996 + 0.3, rr = 1.12 + ((i * 37) % 23) / 23 * 0.42; return { x: Math.cos(a) * rr, z: Math.sin(a) * rr, ph: ((i * 53) % 97) / 97, sp: 1.6 + ((i * 29) % 13) / 13 * 2.2, s: 0.012 + ((i * 17) % 11) / 11 * 0.03 }; });

  const cam = new THREE.PerspectiveCamera(24, W / H, 0.05, 80);
  const post = new Post(r, W, H);
  const D = C.drops;
  const impacts = [C.smash, ...Object.values(D)];

  // ---------------------------------------------------------------- burger state (independent of shot/camera)
  function drop(t, land, { fall = 0.26, h = 2.8, spin = 0.5, tilt = 0.18, sq = 0.14 } = {}) {
    if (t < land - fall) return { vis: false, dy: h, ry: 0, tx: 0, sy: 1 };
    if (t < land) { const p = (t - (land - fall)) / fall; return { vis: true, dy: h * (1 - p * p), ry: spin * (1 - p), tx: tilt * (1 - p), sy: 1 + 0.06 * p }; }
    const a = t - land;
    const s = sq * Math.exp(-a * 11) * Math.cos(a * 2 * Math.PI * 4.2);
    return { vis: true, dy: 0.035 * Math.exp(-a * 13) * Math.abs(Math.sin(a * 17)), ry: 0, tx: 0, sy: 1 - s };
  }
  function burgerState(t) {
    const g = B.group;
    for (const k of ORDER) {
      const o = B.L[k], land = D[k];
      const opt = k === 'crown' ? { fall: 0.25, h: 3.4, spin: 0.35, tilt: 0.22, sq: 0.2 } : k === 'heel' ? { fall: 0.25, h: 3.0 } : k.startsWith('cheese') ? { fall: 0.2, h: 2.4, spin: 0.25, tilt: 0.1, sq: 0.05 } : { fall: k === 'sauce' ? 0.25 : 0.22, h: 2.6 };
      const s = drop(t, land, opt);
      o.visible = s.vis;
      o.position.y = o.userData.restY + s.dy;
      o.rotation.y = (o.userData.ry0 || 0) + s.ry;
      o.rotation.x = s.tx + (k === 'crown' ? -0.035 * sm(land, land + 0.3, t) : 0);
      o.rotation.z = k === 'crown' ? 0.025 * sm(land, land + 0.3, t) : 0;
      const sxz = 1 + (1 - s.sy) * 0.45;
      o.scale.set(sxz, s.sy, sxz);
    }
    // cheese melt: rigid while falling → drapes with its weight → keeps melting
    const melt = (land, slow) => { const a = t - land; if (a < 0) return [0, 0]; const d = 0.5 * spring(clamp(a / 0.5), { freq: 1.4, damp: 6 }) + 0.42 * sm(0.1, slow, a); return [Math.min(0.95, d), sm(0.45, slow + 0.4, a)]; };
    const [d1, r1] = melt(D.cheese, 1.4), [d2, r2] = melt(D.cheese2, 1.6);
    B.cheese.update(d1, r1); B.cheese2.update(d2, r2);
    // sauce: blob → splat on landing, then ooze
    const sa = t - D.sauce, sm1 = B.L.sauce.userData.mesh;
    sm1.morphTargetInfluences[0] = sa < 0 ? 0 : clamp(1 - Math.exp(-sa * 40) * Math.cos(sa * 30) * 1.0);
    B.L.sauce.userData.ooze(sm(0.05, 0.9, sa));
    // stack compression on every landing
    let c = 0; for (const k of ORDER) { const a = t - D[k]; if (a > 0 && a < 0.6) c += (k === 'crown' ? 0.05 : 0.025) * Math.exp(-a * 12) * Math.cos(a * 22); }
    g.scale.set(1 + c * 0.4, 1 - c, 1 + c * 0.4);
    // turntable after the crown lands (eased start)
    const h0 = D.crown;
    const sp = 0.42, ramp = 0.8, a = Math.max(0, t - h0);
    const ang = a < ramp ? sp * a * a / (2 * ramp) : sp * (ramp / 2 + (a - ramp));
    g.rotation.y = -0.15 + ang + 0.04 * Math.sin(t * 0.7);
  }

  // ---------------------------------------------------------------- steam emitters (world space)
  const pe = (ph, rr = 1.12) => ({ x: Math.cos(ph) * rr, z: Math.sin(ph) * rr });
  steam.emitters = [
    // hook: smash puff + griddle steam
    { ...pe(0, 0), y: 0.3, spread: 1.0, rate: 22, t0: 0.0, t1: 2.2, life: 1.4, rise: 0.8, size: 0.9, op: 0.22 },
    { x: 0, z: 0.2, y: 0.15, spread: 1.3, rate: 40, t0: 0.4, t1: 0.75, life: 1.0, rise: 1.4, size: 1.0, op: 0.35, drift: 0.1 },
    // patty landing puff + gentle steam from the stack during build & hero
    { x: 0, z: 0.3, y: 0.55, spread: 0.9, rate: 24, t0: 3.4, t1: 4.0, life: 1.2, rise: 1.0, size: 0.8, op: 0.2 },
    { x: 0.1, z: 0.2, y: 0.6, spread: 1.1, rate: 7, t0: 3.6, t1: 8.3, life: 1.8, rise: 0.6, size: 0.9, op: 0.1 },
    { x: 0, z: 0.0, y: 1.2, spread: 0.9, rate: 6, t0: 8.2, t1: 14, life: 2.2, rise: 0.5, size: 1.0, op: 0.09 },
  ];

  // ---------------------------------------------------------------- shots
  const v3 = new THREE.Vector3();
  function orbit({ az, el, d, ty = 0.7, tx = 0, tz = 0, fov = 24, roll = 0 }) {
    cam.fov = fov; cam.updateProjectionMatrix();
    cam.position.set(tx + Math.sin(az) * Math.cos(el) * d, ty + Math.sin(el) * d, tz + Math.cos(az) * Math.cos(el) * d);
    cam.up.set(Math.sin(roll), Math.cos(roll), 0);
    cam.lookAt(tx, ty, tz);
  }
  function shake(t, list = impacts) {
    let x = 0, y = 0;
    for (const ti of list) { const a = t - ti; if (a > 0 && a < 0.45) { const k = Math.exp(-a * 14); x += Math.sin(a * 83) * k; y += Math.cos(a * 71) * k; } }
    return [x, y];
  }
  function punch(t, list = impacts) { let p = 0; for (const ti of list) { const a = t - ti; if (a > 0 && a < 0.5) p += Math.exp(-a * 9) * Math.sin(Math.min(a * 14, Math.PI / 2)); } return p; }

  let world = '';
  function setWorld(w, envKey) {
    if (world !== w) {
      world = w;
      const stage = w === 'stage';
      B.group.visible = stage; floor.visible = stage; grid.visible = !stage;
      if (stage) {
        L.key.position.set(-3.4, 5.6, 4.4); L.key.target.position.set(0, 0.6, 0); L.key.intensity = 150;
        L.rimR.position.set(3.6, 3.4, -4.2); L.rimR.intensity = 260; L.rimL.intensity = 140; L.front.intensity = 70; L.fill.intensity = 0.12;
      } else {
        L.key.position.set(-2.5, 4.5, 1.5); L.key.target.position.set(0, 0, 0); L.key.intensity = 90;
        L.rimR.position.set(2.2, 2.2, -4.0); L.rimR.intensity = 420; L.rimL.intensity = 220; L.front.intensity = 25; L.fill.intensity = 0.05;
      }
    }
    scene.environment = env[envKey]; scene.environmentIntensity = w === 'stage' ? 0.4 : 0.55;
  }

  /** camera + world + look for time t (shot-dependent). Returns {dof, grade}. */
  function shotState(t) {
    const S = C.shots; let s = S[0]; for (const x of S) if (t >= x.at) s = x;
    const id = s.id, lt = t - s.at, k = clamp(lt / (s.end - s.at));
    const [shx, shy] = shake(t);
    let dof = { focus: 10, aperture: 0 }, grade = { bg: BG.red, exposure: 0.8, bgSpot: new THREE.Vector3(0.5, 0.56, 0.2), vignette: 0.26 };
    if (id === 'S01') {
      setWorld('griddle', 'griddle');
      const d = lerp(3.5, 3.05, E.outCubic(k));
      orbit({ az: lerp(-0.25, -0.15, k), el: 0.1, d, ty: 0.42, fov: 30, roll: shx * 0.006 });
      cam.position.y += shy * 0.025; cam.position.x += shx * 0.02;
      dof = { focus: d, aperture: 16, maxR: 22 };
      grade = { bg: BG.deep, exposure: 0.85, vignette: 0.42 };
    } else if (id === 'S02') {
      setWorld('griddle', 'griddle');
      const whip = sm(C.whip[0], C.shots[1].end, t);
      const tyw = 0.05 + E.inCubic(whip) * 6.5;
      orbit({ az: lerp(0.3, 0.5, k), el: lerp(1.05, 0.98, k) - whip * 0.2, d: lerp(3.1, 2.85, k), ty: tyw, fov: 32 });
      dof = { focus: 3.0, aperture: 12, maxR: 18 };
      grade = { bg: BG.deep, exposure: 0.88, vignette: 0.4 };
    } else if (id === 'S03' || id === 'S05' || id === 'S07' || id === 'S09' || id === 'S10' || id === 'S11' || id === 'S12') {
      const bgk = id === 'S07' ? 'charcoal' : 'red';
      setWorld('stage', bgk);
      const p = punch(t) * 0.35;
      let o;
      if (id === 'S03') {
        const win = 1 - E.outCubic(sm(C.whip[0] + 0.2, C.whip[1] + 0.05, t)); // whip-in from below
        o = { az: lerp(-0.42, -0.28, k), el: 0.15, d: lerp(11.2, 10.6, k), ty: 0.55 - win * 6.0, fov: 24 - p };
      } else if (id === 'S05') o = { az: lerp(0.4, 0.3, k), el: 0.2, d: lerp(10.4, 10.0, k), ty: 0.62, fov: 24 - p };
      else if (id === 'S07') o = { az: lerp(-0.22, -0.05, k), el: 0.13, d: lerp(10.9, 10.3, k), ty: 0.72, fov: 24 - p };
      else if (id === 'S09') o = { az: lerp(0.18, 0.12, k), el: 0.12, d: lerp(11.4, 12.2, E.outCubic(k)), ty: 0.85, fov: 24 };
      else { // hero (S10 + clean continuation)
        const hk = clamp((t - 8.4) / 5.4);
        o = { az: 0.08, el: lerp(0.075, 0.03, E.outCubic(hk)), d: lerp(9.0, 7.5, E.outCubic(hk)), ty: lerp(0.86, 0.84, hk), fov: 24 - p * 0.8 };
      }
      orbit(o);
      cam.position.y += shy * 0.03; cam.position.x += shx * 0.025;
      dof = { focus: o.d, aperture: id === 'S10' || t > 8.4 ? 5 : 3, maxR: 10 };
      grade = { bg: bgk === 'charcoal' ? BG.charcoal : BG.red, exposure: bgk === 'charcoal' ? 0.85 : 0.8, bgSpot: new THREE.Vector3(0.5, 0.56, 0.22), vignette: bgk === 'charcoal' ? 0.38 : 0.24 };
    } else if (id === 'S04') {
      setWorld('stage', 'charcoal');
      // macro slide along the lacy edge of patty 1
      const az = lerp(0.62, 0.86, k);
      const rr = 1.12;
      orbit({ az: az + 0.55, el: 0.06, d: 1.9, tx: Math.sin(az) * rr * 0.92, tz: Math.cos(az) * rr * 0.92, ty: B.REST.patty + 0.02, fov: 30 });
      dof = { focus: 1.9, aperture: 28, maxR: 22 };
      grade = { bg: BG.charcoal, exposure: 0.9, vignette: 0.45 };
    } else if (id === 'S06') {
      setWorld('stage', 'charcoal');
      // the cheese corner hanging over the patty edge, slow push (half-time)
      const az = lerp(0.95, 0.9, k);
      orbit({ az: az + 0.25, el: lerp(0.1, 0.06, k), d: lerp(2.9, 2.4, E.inOutSine(k)), tx: Math.sin(az) * 1.15, tz: Math.cos(az) * 1.15, ty: B.REST.patty - 0.04, fov: 28 });
      dof = { focus: lerp(2.9, 2.4, E.inOutSine(k)), aperture: 26, maxR: 22 };
      grade = { bg: BG.charcoal, exposure: 0.9, vignette: 0.45 };
    } else if (id === 'S08') {
      setWorld('stage', 'red');
      orbit({ az: lerp(0.15, 0.3, k), el: 0.62, d: lerp(3.6, 3.3, k), ty: B.REST.sauce, fov: 30 });
      cam.position.y += shy * 0.02;
      dof = { focus: lerp(3.6, 3.3, k), aperture: 18, maxR: 18 };
      grade = { bg: BG.red, exposure: 0.82, vignette: 0.32 };
    }
    cam.updateMatrixWorld();
    return { id, dof, grade };
  }

  // ---------------------------------------------------------------- hook (griddle) state
  function hookState(t) {
    const hit = C.smash;
    // press: accelerating descent → contact at 0.40 → squash → hold → lifts away during S02
    let py;
    if (t < hit) { const p = clamp(t / hit); py = 1.0 + 2.2 * (1 - p * p); }
    else { const a = t - hit; py = lerp(1.0, 0.165, E.outExpo(clamp(a / 0.11))) + 0.006 * Math.exp(-a * 9) * Math.sin(a * 60); }
    press.position.y = py; press.visible = t < C.shots[1].at;
    const m = t < hit ? 0 : clamp((1.0 - py) / (1.0 - 0.165));
    smash.morphTargetInfluences[0] = m;
    smash.visible = t < C.shots[1].at; gPatty.visible = t >= C.shots[1].at;
    gPatty.rotation.y = 0.6;
    // bubbles pop in cycles (only after the smash)
    const mtx = new THREE.Matrix4();
    bubData.forEach((b, i) => {
      const on = t > hit + 0.05 ? 1 : 0;
      const c = ((t * b.sp + b.ph) % 1);
      const s = on * b.s * Math.sin(Math.PI * c) * (c < 0.9 ? 1 : 0);
      mtx.makeScale(s, s * 0.8, s); mtx.setPosition(b.x, 0.004, b.z); bub.setMatrixAt(i, mtx);
    });
    bub.instanceMatrix.needsUpdate = true;
    grease.update(t, hit + 0.01, new THREE.Vector3(0, 0.08, 0), { spread: 1.5, upK: 0.9, g: 9.5, life: 0.8, ring: 0.85 });
  }

  /** motion-blur policy: number of sub-frames for time t */
  function subCount(t) {
    if (t >= C.whip[0] && t <= C.whip[1]) return 7;
    if (t > C.smash - 0.08 && t < C.smash + 0.12) return 5;
    for (const k of ORDER) { const l = D[k]; if (t > l - 0.27 && t < l + 0.02) return 5; }
    return 1;
  }

  const state = t => { burgerState(t); hookState(t); steam.update(t); sauceSplash.update(t, D.sauce + 0.005, new THREE.Vector3(0, B.REST.sauce + 0.04, 0), { spread: 1.3, upK: 0.75, g: 8, life: 0.75, ring: 0.3 }); };

  function render(t, { clean = false } = {}) {
    const fps = C.fps, N = subCount(t), shutter = 0.5 / fps;
    const st = shotState(t);
    const sub = Array.from({ length: N }, (_, i) => () => {
      const ts = N > 1 ? t + (i / (N - 1) - 0.5) * shutter : t;
      state(ts); shotState(ts);
    });
    post.render(scene, cam, { sub, dof: st.dof, grade: st.grade });
    return st;
  }
  // project a world point (e.g. a layer edge) to screen px for 2D leader lines
  function project(x, y, z) { v3.set(x, y, z).applyMatrix4(B.group.matrixWorld).project(cam); return [(v3.x * 0.5 + 0.5) * W, (-v3.y * 0.5 + 0.5) * H]; }

  return { renderer: r, canvas: r.domElement, render, project, B, cam, shotState };
}
