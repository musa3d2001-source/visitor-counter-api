// HABBA — the shot table. frameSpec(t) describes everything the world needs at time t (pure function).
// Timings live in cues.json (read by audio.py too). Shot handoffs and camera moves are defined here.
import * as THREE from 'three';
import { clamp, lerp, tw, E, rng } from '/_system/motion/kit.js';
import { DIM } from './scene.js';

export const C = await (await fetch(new URL('./cues.json', import.meta.url))).json();
const EV = C.ev;
export const SHOT = Object.fromEntries(C.shots.map(s => [s.id, s]));
const shotAt = t => { for (let i = C.shots.length - 1; i >= 0; i--) if (t >= C.shots[i].at) return C.shots[i]; return C.shots[0]; };
const smoother = x => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const v3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

// ------------------------------------------------------------------ beans: two heroes land on the beat, others tumble through
const LAND = { x: 1.55, z: 1.15 };
const R = rng(2024);
const BEANS = [];
// heroes: «حبّة» … «حبّة»
BEANS.push({ tl: EV.bean1, x: LAND.x + 0.02, z: LAND.z + 0.02, vs: 0.55, yaw: 0.7, ax: [0.3, 1, 0.2], w: 2.4, ph: 0.4, hero: true, flip: true });
BEANS.push({ tl: EV.bean2, x: LAND.x + 0.15, z: LAND.z - 0.06, vs: 0.55, yaw: 2.2, ax: [1, 0.4, -0.3], w: -2.1, ph: 1.9, hero: true, flip: true });
// the rest of the slow pour: further back (soft), and a couple close to the lens (big bokeh shapes)
const others = [
  [7.18, -0.16, -0.42], [7.42, 0.12, -0.55], [7.95, -0.04, -0.75], [8.15, 0.22, -0.30], [8.75, -0.20, -0.50], [9.05, 0.15, -0.95],
  [7.55, 0.10, 0.36], [8.95, -0.08, 0.42],
];
for (const [tl, dx, dz] of others) BEANS.push({ tl, x: LAND.x + dx, z: LAND.z + dz, vs: 0.5 + R() * 0.15, yaw: R() * 6.28, ax: [R() - 0.5, R() - 0.5, R() - 0.5], w: (R() - 0.5) * 5, ph: R() * 6, flip: R() > 0.5 });
// beans already resting on the table (the set dressing)
const decor = [[0.98, 0.38, 0.4, 1], [1.12, 0.52, 2.1, 0], [0.9, 0.62, 4.0, 1], [-0.95, 0.55, 1.2, 0], [-1.08, 0.38, 5.1, 1], [1.3, 0.2, 3.3, 0]];
const qTmp = new THREE.Quaternion(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), ax = new THREE.Vector3(), eul = new THREE.Euler();
const REST_Y = 0.0175, REST_UP = 0.0300;   // flat face down / crease up (dome down)
function beanState(b, t, { landedOnly = false } = {}) {
  const dt = t - b.tl;
  if (landedOnly && dt < 0) return null;
  let y, x = b.x, z = b.z; const ry = b.flip ? REST_UP : REST_Y;
  ax.set(...b.ax).normalize();
  if (dt < 0) {                       // slow-motion fall: almost constant speed (we are at ~1/8 speed)
    const s = -dt; y = ry + b.vs * s + 0.08 * s * s;
    x += 0.03 * s; z -= 0.02 * s;
    if (y > 1.4) return null;
    qTmp.setFromAxisAngle(ax, b.ph + b.w * dt);
  } else {                             // land, a small slow bounce, settle flat-side down
    const T1 = 0.42, T2 = 0.24;
    y = ry + (dt < T1 ? 0.03 * Math.sin(Math.PI * dt / T1) : dt < T1 + T2 ? 0.008 * Math.sin(Math.PI * (dt - T1) / T2) : 0);
    x += 0.012 * E.outCubic(clamp(dt / 0.6)); z += 0.006 * E.outCubic(clamp(dt / 0.6));
    qA.setFromAxisAngle(ax, b.ph + b.w * Math.min(dt, 0.5) * 0.6);
    qB.setFromEuler(eul.set(b.flip ? Math.PI : 0, b.yaw, 0));
    qTmp.slerpQuaternions(qA, qB, E.outCubic(clamp(dt / 0.62)));
  }
  return { p: [x, y, z], q: [qTmp.x, qTmp.y, qTmp.z, qTmp.w] };
}
function beansAt(t, mode) {
  const out = [];
  for (let i = 0; i < 16; i++) out.push(null);
  BEANS.forEach((b, i) => { out[i] = mode === 'fall' ? beanState(b, t) : mode === 'landed' ? beanState(b, 99, { landedOnly: true }) : null; });
  decor.forEach(([x, z, yaw, f], k) => { qTmp.setFromEuler(eul.set(f ? Math.PI : 0, yaw, 0)); out[10 + k] = { p: [x, f ? REST_UP : REST_Y, z], q: [qTmp.x, qTmp.y, qTmp.z, qTmp.w] }; });
  return out;
}

// ------------------------------------------------------------------ steam
const SY = DIM.saucerY + DIM.liqY;
function steamAt(t, amt = 1, s = 1) {
  return [0, 1, 2].map(i => ({ p: [(i - 1) * 0.05 * s, SY + 0.62 * s, (i - 1) * 0.04], w: 0.95 * s, h: 1.25 * s, t: t * (0.95 + i * 0.07) + i * 3.1, amt: amt * (i === 1 ? 1 : 0.7) }));
}

// ------------------------------------------------------------------ latte states
const HEART = { uMilk: 1, uPull: 1, uStream: 0, uImp: [0, 0.2] };
const BLOB_C = 0.10;

// ------------------------------------------------------------------ camera helper: spherical orbit around a target
function orbit(target, dist, az, el, fov) {
  const ca = Math.cos(el);
  return { pos: [target[0] + dist * ca * Math.sin(az), target[1] + dist * Math.sin(el), target[2] + dist * ca * Math.cos(az)], target, fov };
}
const deg = Math.PI / 180;

export function frameSpec(t, { clean = false, poster = false } = {}) {
  if (poster) t = 1.95;                                  // poster background = the opened hero frame
  const sh = shotAt(t); const u = (t - sh.at) / sh.dur;  // u: 0..1 inside the shot
  const S = {
    shot: sh.id, u,
    blinds: { open: 1, slide: 0.18 * t, soft: 7, leaf: 0.55, sway: t, pool: [0.26, 0.48] },
    sun: 9, envI: 0.42, fill: 0.25, exposure: 1.0,
    cupRot: -0.62, heartYaw: 0.12, latte: { ...HEART, uT: 0, uRot: 0 }, stream: null,
    beans: beansAt(t, 'none'), steam: steamAt(t, 0.8), dof: { focus: 3, ap: 0 },
  };

  if (sh.id === 'S1') {
    // the blinds open: thin slits of light widen into bars; slow push and a small arc
    const o = tw(t, EV.blindsOpen, EV.blindsOpenDur, E.inOutSine);
    S.blinds.open = lerp(0.1, 1, o); S.blinds.soft = lerp(1.6, 7, o);
    S.exposure = lerp(1.15, 1.0, o);
    S.envI = lerp(0.16, 0.42, o); S.fill = lerp(0.08, 0.25, o);
    const k = t / 2.1;
    S.cam = orbit([0.04, 0.26, 0.05], lerp(5.6, 5.25, k), lerp(9, 5, k) * deg, lerp(50, 47, k) * deg, 30);
    S.steam = steamAt(t, lerp(0.5, 0.75, o));
    S.dof = { focus: 5.3, ap: 6 };
  } else if (sh.id === 'S2') {
    // macro at the rim, steam curling up through a bar of sun (dark room behind)
    const k = u;
    const tg = [0.0, 1.02, 0.0];
    S.cam = orbit(tg, lerp(4.9, 4.6, k), lerp(-118, -113, k) * deg, lerp(4.0, 5.0, k) * deg, 24);
    S.steam = steamAt(t, 1.0, 1.0);
    S.dof = { focus: lerp(4.9, 4.6, k), ap: 18 };
    S.exposure = 1.05;
  } else if (sh.id === 'S3') {
    // top-down: milk blooms into the crema and is drawn through into a heart
    const k = u, l = t - EV.milkStart;
    const milk = lerp(0.16, 1, E.outCubic(clamp(l / 1.65)));
    const pull = tw(t, EV.pull, EV.pullDur, E.inOutSine);
    const R = 0.62 * milk;
    const imp = pull > 0 ? [0, lerp(BLOB_C + R * 0.9, BLOB_C - R - 0.18, pull)] : [0.0, BLOB_C + 0.08 + 0.02 * Math.sin(l * 5)];
    const off = clamp((t - EV.streamOff) / 0.18);
    S.latte = { uMilk: milk, uPull: pull, uStream: 1 - off, uImp: imp, uT: t, uRot: 0 };
    S.cupRot = 0.0; S.heartYaw = 0;
    const az = lerp(-4, 5, k) * deg;
    const tg = [0, SY, 0.27];
    const c = orbit(tg, lerp(4.35, 4.05, k), az, 80 * deg, 30);
    c.up = [Math.sin(az) * -1, 0, -Math.cos(az)];
    S.cam = c;
    if (off < 1) {
      const ix = imp[0] * 0.437, iz = -imp[1] * 0.437;
      S.stream = { x: ix, z: iz, y0: SY - 0.03, y1: SY + 2.6, width: lerp(1, 0.55, pull) * (1 - off * 0.5), t, lift: off * 0.5 };
    }
    S.steam = steamAt(t, 0.0);
    S.blinds.slide = 0.18 * t; S.blinds.pool = [0.17, 0.36];   // a tighter pool: the lower frame falls into shade for the line
    S.exposure = 0.98;
  } else if (sh.id === 'S4') {
    // low on the table, slow motion: beans tumble through the light; two land on the beat
    const k = u;
    const tg = [LAND.x + 0.07, 0.10, LAND.z - 0.04];
    S.cam = orbit(tg, lerp(1.1, 1.02, k), lerp(-6, -9, k) * deg, lerp(12, 13.5, k) * deg, 30);
    S.beans = beansAt(t, 'fall');
    S.steam = steamAt(t, 0.6);
    S.dof = { focus: 1.06, ap: 30 };
    S.exposure = 1.0;
  } else {
    // S5 (and S6 in clean mode): the cup turns on its saucer, the mark comes round; slow push-in
    const tT = Math.min(t, EV.blindsClose + 3.0);
    const turn = tw(tT, EV.turnStart, EV.turnDur, E.outCubic);
    S.cupRot = lerp(Math.PI - 1.25, Math.PI, turn);
    S.latte = { ...HEART, uT: 0, uRot: 0 };
    S.heartYaw = S.cupRot - Math.PI;                  // the heart turns with the cup and faces us when it settles
    const k = (tT - SHOT.S5.at) / (C.duration - SHOT.S5.at);
    S.cam = orbit([-0.1, 0.62, 0.0], lerp(4.75, 4.25, E.outQuad(k)), lerp(4, -2, k) * deg, lerp(5, 7, k) * deg, 28);
    S.beans = beansAt(t, 'landed');
    S.steam = steamAt(t, lerp(0.6, 0.32, tw(t, EV.logoIn - 0.3, 0.8, E.inOutSine)), 0.85);
    S.dof = { focus: lerp(4.65, 4.15, k), ap: 10 };
    if (!clean && t >= EV.blindsClose) {               // the blinds close: light narrows to slits, room goes dark → TASH
      const c = tw(t, EV.blindsClose, EV.blindsCloseDur, E.inCubic);
      S.blinds.open = lerp(1, 0.0, c);
      S.fade = c * 0.85;
    }
  }
  return S;
}
