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
    griddle: studioEnv(r, { bounce: '#2A1A0E', bounceK: 0.3, warm: 0.8, top: false }),
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
  const grease = new Droplets(scene, { count: 170, color: '#E0A84A', size: 0.0085, seed: 9, rough: 0.03, emissive: '#8a5200' });
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
  const inShots = (t, ids) => { for (const x of C.shots) if (ids.includes(x.id) && t >= x.at && t < x.end) return 1; return 0; };
  steam.emitters = [
    // hook: wisps off the hot griddle around the ball, the smash puff, then crust steam (edges only, not over the top)
    { ...pe(0.4, 0.75), y: 0.2, spread: 0.6, rate: 9, t0: -1.0, t1: 0.9, life: 1.3, rise: 0.7, size: 0.7, op: 0.12 },
    { x: 0, z: -0.2, y: 0.12, spread: 1.3, rate: 60, t0: 0.4, t1: 0.75, life: 1.0, rise: 1.6, size: 1.0, op: 0.42, drift: 0.12 },
    { ...pe(2.2, 1.25), y: 0.15, spread: 0.5, rate: 10, t0: 0.4, t1: 2.2, life: 1.2, rise: 0.8, size: 0.6, op: 0.1 },
    { ...pe(-0.6, 1.25), y: 0.15, spread: 0.5, rate: 10, t0: 0.4, t1: 2.2, life: 1.2, rise: 0.8, size: 0.6, op: 0.1 },
    // macro inserts on charcoal (backlit wisps behind the patty edge)
    { x: 0.3, z: -0.4, y: 0.6, spread: 0.8, rate: 22, t0: 3.0, t1: 6.0, life: 1.3, rise: 0.7, size: 0.7, op: 0.16, gain: t => inShots(t, ['S04', 'S06']) },
    // hero: a soft breath of steam rising behind the bun (rim-lit)
    { x: 0.1, z: -0.5, y: 1.3, spread: 0.6, rate: 5, t0: 7.6, t1: 14, life: 2.4, rise: 0.45, size: 1.0, op: 0.07, gain: t => (t > 8.4 ? 1 : 0) },
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

  // every frame re-applies the full light rig (pure function of t: no state leaks between frames/workers)
  function setWorld(w, envKey) {
    const stage = w === 'stage';
    B.group.visible = stage; floor.visible = stage; grid.visible = !stage;
    if (stage) {
      L.key.position.set(-3.4, 5.6, 4.4); L.key.target.position.set(0, 0.6, 0); L.key.intensity = 150;
      L.rimR.position.set(3.6, 3.4, -4.2); L.rimR.intensity = 260; L.rimL.intensity = 140; L.front.intensity = 45; L.fill.intensity = 0.12;
    } else {
      L.key.position.set(-2.5, 4.5, 1.5); L.key.target.position.set(0, 0, 0); L.key.intensity = 90;
      L.rimR.position.set(2.2, 2.2, -4.0); L.rimR.intensity = 420; L.rimL.intensity = 220; L.front.intensity = 25; L.fill.intensity = 0.05;
    }
    L.rimL.position.set(-4.2, 2.6, -3.4);
    L.key.target.updateMatrixWorld();
    scene.environment = env[envKey]; scene.environmentIntensity = stage ? 0.4 : 0.55;
  }

  /** camera + world + look for time t (shot-dependent). Returns {dof, grade}. */
  function shotState(t) {
    const S = C.shots; let s = S[0]; for (const x of S) if (t >= x.at) s = x;
    const id = s.id, lt = t - s.at, k = clamp(lt / (s.end - s.at));
    const [shx, shy] = shake(t);
    let dof = { focus: 10, aperture: 0 }, grade = { bg: BG.red, exposure: 0.8, bgSpot: new THREE.Vector3(0.5, 0.56, 0.2), vignette: 0.26 };
    const gradeBase = { flash: 0, bgSpot: new THREE.Vector3(0.5, 0.6, 0.24) }; // matches the value the full render carried into the inserts
    if (id === 'S01') {
      setWorld('griddle', 'charcoal');
      L.key.position.set(-2.0, 5.0, 3.2); L.key.intensity = 150;
      L.rimR.position.set(2.6, 1.6, -3.6); L.rimR.intensity = 520; L.rimL.position.set(-3.0, 1.9, -3.2); L.rimL.intensity = 320; L.front.intensity = 40;
      const d = lerp(5.4, 4.7, E.outCubic(k));
      const ty = lerp(0.62, 0.22, E.inOutCubic(sm(C.smash - 0.05, C.smash + 0.4, t)));
      orbit({ az: lerp(-0.3, -0.2, k), el: lerp(0.16, 0.22, k), d, ty, fov: 26, roll: shx * 0.006 });
      cam.position.y += shy * 0.025; cam.position.x += shx * 0.02;
      dof = { focus: d, aperture: 16, maxR: 22 };
      const fl = t >= C.smash && t < C.smash + 0.2 ? 0.3 * Math.exp(-(t - C.smash) * 30) : 0; // impact flash
      grade = { bg: BG.deep, exposure: 0.95, vignette: 0.4, flash: fl };
    } else if (id === 'S02') {
      setWorld('griddle', 'griddle');
      L.key.position.set(-3.6, 1.5, 1.2); // raking light reveals the crust relief
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
        o = { az: lerp(-0.42, -0.3, k), el: 0.16, d: lerp(11.0, 10.4, k), ty: 0.72 - win * 6.0, fov: 24 - p };
      } else if (id === 'S05') o = { az: lerp(0.42, 0.32, k), el: 0.2, d: lerp(10.6, 10.2, k), ty: 0.78, fov: 24 - p };
      else if (id === 'S07') o = { az: lerp(-0.24, -0.08, k), el: 0.15, d: lerp(9.8, 9.2, k), ty: 0.84, fov: 24 - p };
      else if (id === 'S09') o = { az: lerp(0.16, 0.1, k), el: 0.1, d: lerp(12.0, 12.8, E.outCubic(k)), ty: 0.98, fov: 24 };
      else { // hero (S10 + clean continuation)
        const hk = clamp((t - 8.4) / 5.4);
        o = { az: 0.08, el: lerp(0.065, 0.03, E.outCubic(hk)), d: lerp(11.6, 10.6, E.outCubic(hk)), ty: lerp(0.98, 0.92, hk), fov: 24 - p * 0.8 };
      }
      orbit(o);
      cam.position.y += shy * 0.03; cam.position.x += shx * 0.025;
      dof = { focus: o.d, aperture: 0, maxR: 10 }; // flat brand backdrop: DOF would be invisible here
      grade = { bg: bgk === 'charcoal' ? BG.charcoal : BG.red, exposure: bgk === 'charcoal' ? 1.15 : 0.8, bgSpot: new THREE.Vector3(0.5, 0.6, 0.24), vignette: bgk === 'charcoal' ? 0.3 : 0.24, flash: t >= D.crown && t < D.crown + 0.02 ? 0.2 : 0 };
      if (bgk === 'charcoal') { L.front.intensity = 80; L.key.intensity = 190; } else { L.front.intensity = 45; L.key.intensity = 150; }
    } else if (id === 'S04') {
      setWorld('stage', 'charcoal');
      // macro slide along the lacy edge of patty 1
      const az = lerp(0.55, 0.8, k);
      const rr = 1.1;
      orbit({ az: az + 0.5, el: 0.34, d: 2.3, tx: Math.sin(az) * rr * 0.9, tz: Math.cos(az) * rr * 0.9, ty: B.REST.patty + 0.04, fov: 30 });
      dof = { focus: 2.3, aperture: 24, maxR: 22 };
      grade = { bg: BG.charcoal, exposure: 0.9, vignette: 0.45 };
    } else if (id === 'S06') {
      setWorld('stage', 'charcoal');
      // the cheese corner hanging over the patty edge, slow push (half-time)
      // aim at the front (dripping) corner of cheese 1
      const cp = B.cheese.cornerPts[2]; v3.set(cp[0], cp[1], cp[2]); B.L.cheese.updateWorldMatrix(true, false); v3.applyMatrix4(B.L.cheese.matrixWorld);
      const caz = Math.atan2(v3.x, v3.z), dd = lerp(2.9, 2.35, E.inOutSine(k));
      orbit({ az: caz + lerp(0.42, 0.34, k), el: lerp(0.14, 0.1, k), d: dd, tx: v3.x * 0.97, tz: v3.z * 0.97, ty: v3.y - 0.06, fov: 28 });
      dof = { focus: dd, aperture: 24, maxR: 22 };
      grade = { bg: BG.charcoal, exposure: 0.9, vignette: 0.45 };
    } else if (id === 'S08') {
      setWorld('stage', 'charcoal');
      L.front.intensity = 45; L.key.intensity = 170;
      orbit({ az: lerp(0.15, 0.3, k), el: 0.82, d: lerp(5.4, 5.0, k), ty: B.REST.sauce, fov: 27 });
      cam.position.y += shy * 0.02;
      dof = { focus: lerp(5.4, 5.0, k), aperture: 12, maxR: 18 };
      grade = { bg: BG.charcoal, exposure: 0.95, vignette: 0.36 };
    }
    cam.updateMatrixWorld();
    return { id, dof, grade: { ...gradeBase, ...grade } };
  }

  // ---------------------------------------------------------------- hook (griddle) state
  function hookState(t) {
    const hit = C.smash;
    // press: accelerating descent → contact at 0.40 → squash → hold → lifts away during S02
    let py;
    const wind = 0.22;
    if (t < wind) py = 1.62 + 0.12 * E.outCubic(t / wind);                                  // anticipation: lifts a touch
    else if (t < hit) { const p = (t - wind) / (hit - wind); py = lerp(1.74, 1.0, p * p * p); } // slam (accelerating)
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
    grease.update(t, hit + 0.01, new THREE.Vector3(0, 0.06, 0), { spread: 2.2, upK: 0.75, g: 9.5, life: 0.6, ring: 0.7 });
  }

  /** motion-blur policy: number of sub-frames for time t */
  function subCount(t) {
    if (t >= C.whip[0] && t <= C.whip[1]) return 6;
    if (t > C.smash - 0.045 && t < C.smash + 0.045) return 9;   // the slam itself: smooth, not strobed
    if (t > C.smash - 0.08 && t < C.smash + 0.12) return 5;
    if (t > D.sauce && t < D.sauce + 0.18) return 4;
    if (t > C.smash && t < C.smash + 0.25) return 4;
    const THIN = ['cheese', 'cheese2', 'pickles', 'onions'];  // thin layers need dense sub-frames or the blur steps into ghost copies
    for (const k of ORDER) { const l = D[k]; if (t > l - 0.16 && t < l - 0.005) return THIN.includes(k) ? 10 : 4; } // blur the visible fall; the impact frame stays crisp
    return 1;
  }

  const state = t => { burgerState(t); hookState(t); steam.update(t); sauceSplash.update(t, D.sauce + 0.005, new THREE.Vector3(0, B.REST.sauce + 0.04, 0), { spread: 2.6, upK: 1.5, g: 9, life: 0.55, ring: 0.45 }); };

  const POSTER_CAM = { az: 0.12, el: 0.07, d: 11.6, ty: 1.02, fov: 24 };
  function render(t, { clean = false, aa = 0, posterCam = false } = {}) {
    const fps = C.fps, mb = posterCam ? 1 : subCount(t), N = Math.max(mb, aa || 1), shutter = mb > 1 ? 0.5 / fps : 0;
    const st = shotState(t);
    if (posterCam) { orbit(POSTER_CAM); cam.updateMatrixWorld(); st.dof = { focus: POSTER_CAM.d, aperture: 5, maxR: 10 }; }
    const sub = Array.from({ length: N }, (_, i) => () => {
      const ts = N > 1 ? t + (i / (N - 1) - 0.5) * shutter : t;
      state(ts); shotState(ts);
      if (posterCam) { orbit(POSTER_CAM); cam.updateMatrixWorld(); }
    });
    post.render(scene, cam, { sub, dof: st.dof, grade: st.grade });
    return st;
  }
  // project a world point (e.g. a layer edge) to screen px for 2D leader lines
  function project(x, y, z) { v3.set(x, y, z).applyMatrix4(B.group.matrixWorld).project(cam); return [(v3.x * 0.5 + 0.5) * W, (-v3.y * 0.5 + 0.5) * H]; }

  return { renderer: r, canvas: r.domElement, render, project, B, cam, shotState, L };
}
