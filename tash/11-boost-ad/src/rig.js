// TASH boost ad «نقاط مشروعك»: the ONE camera + dot rig, shared by the 3D studio (scene3d.js) and the 2D page (main.js).
// Pure math, no Three.js: the page projects the dots with exactly the camera the studio renders with.
// World: 1 unit = 100 px on the word's front plane (z = 0) in the hero pose; x right, y up; origin = frame centre.
// A pose = { s:[sx,sy] (screen position of the pivot T = the ش slot), scale (px per unit at T), yaw, el (deg), fov (deg) }.
// The hero pose (scale 100, yaw 0, el 0) maps the front face 1:1 onto the flat 2D word, so 5.00 and 9.00 are match cuts.
import { clamp, lerp, E, typing } from '/_system/motion/kit.js';

const D2R = Math.PI / 180;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => mul(a, 1 / Math.hypot(...a));
const bez = (p0, p1, p2, k) => add(add(mul(p0, (1 - k) ** 2), mul(p1, 2 * k * (1 - k))), mul(p2, k * k));
const fp = (f, a, b) => clamp((f - a) / (b - a));

export function makeRig(C, { W, H, A }) {
  const S = C.studio, T = C.typing;
  const world = (px, py) => [(px - W / 2) / 100, (H / 2 - py) / 100];
  const [ax, ay] = world(A.x, A.y);
  const ZD = -0.07;                                    // dots sit at mid-depth of the extrusion
  const PIVOT = [ax, ay, ZD];
  const R0 = C.dot.d / 200;                            // dot radius in world units (0.14)
  const P = C.dot.pitch / 100;
  const home = i => [ax + (1 - i) * P, ay, ZD];        // i = 0 is the rightmost dot
  // the lamp stations (dot 1 top-back, dot 2 back-right high, dot 3 back-left high). Height is in world units over A.
  // just behind the front plane, so they rake the bevels and side walls but never reach the front faces
  const LAMP = [[ax - 0.35, ay + 2.45, -0.75], [ax + 3.05, ay + 1.25, -0.65], [ax - 5.25, ay + 1.45, -0.7]];
  const typ = (t, i, amp) => -typing(t + T.lead, i, { period: T.period, phase: T.phase, amp }); // px up (≥ 0)

  // ------------------------------------------------------------------ camera keys (frame → pose)
  const HERO = { s: [A.x, A.y], scale: 100, yaw: 0, el: 0, fov: 16 };
  const len14 = S.cut === 150 && S.lightsOn === 210;
  const BACK = { s: [A.x - 40, A.y + 150], scale: 70, yaw: 0, el: 5.5, fov: 24 };
  const DRIFT = { s: [A.x - 44, A.y + 160], scale: 68, yaw: 1.5, el: 5.5, fov: 24 };
  const ORBIT = { s: [A.x - 20, A.y + 110], scale: 80, yaw: -10.5, el: 0.9, fov: 20 };
  const KEYS = len14
    ? [[S.cut, HERO], [S.lift, BACK, E.outCubic], [S.fly[0][1], DRIFT, E.linear], [S.detach, ORBIT, E.inOutCubic], [S.lightsOn, HERO, E.inOutCubic]]
    : [[S.cut, HERO], [S.lift - 1, BACK, E.outCubic], [S.fly[0][1], DRIFT, E.linear], [S.detach - 1, ORBIT, E.inOutCubic], [S.lightsOn, HERO, E.inOutCubic]];

  function pose(f) {
    let p = HERO;
    if (f <= KEYS[0][0]) p = HERO;
    else if (f >= KEYS[KEYS.length - 1][0]) p = HERO;
    else for (let k = 1; k < KEYS.length; k++) {
      const [f0, a] = KEYS[k - 1], [f1, b, ease] = KEYS[k];
      if (f <= f1) {
        // log-interpolate scale and fov-dependent distance so dollies feel like dollies
        const q = ease(fp(f, f0, f1));
        p = { s: [lerp(a.s[0], b.s[0], q), lerp(a.s[1], b.s[1], q)], scale: Math.exp(lerp(Math.log(a.scale), Math.log(b.scale), q)), yaw: lerp(a.yaw, b.yaw, q), el: lerp(a.el, b.el, q), fov: lerp(a.fov, b.fov, q) };
        break;
      }
    }
    // after the lights come on: creep 1.00→1.03 about A, then the punch-in ×1.10 (rendered in 3D, so it stays sharp)
    if (f >= S.lightsOn) {
      const end = S.fallAway[0];
      const creep = lerp(1, 1.03, fp(f, S.lightsOn, end));
      const punch = f >= S.punch ? 1 + 0.10 * (0.86 + 0.14 * E.outCubic(fp(f, S.punch, S.punch + 12))) : 1;
      p = { ...p, scale: p.scale * creep * punch };
    }
    return p;
  }

  function camera(f) {
    const p = pose(f);
    const fpx = (H / 2) / Math.tan(p.fov * D2R / 2);           // focal length in px
    const dz = fpx / p.scale;                                  // distance to the pivot
    const yaw = p.yaw * D2R, el = p.el * D2R;
    const eye = add(PIVOT, [dz * Math.sin(yaw) * Math.cos(el), dz * Math.sin(el), dz * Math.cos(yaw) * Math.cos(el)]);
    const fwd = norm(sub(PIVOT, eye));
    const right = norm(cross(fwd, [0, 1, 0]));
    const up = cross(right, fwd);
    return { ...p, fpx, dz, eye, fwd, right, up, target: PIVOT };
  }

  function project(cam, P3, r = 0) {
    const v = sub(P3, cam.eye);
    const zc = dot(v, cam.fwd);
    return { x: cam.s[0] + dot(v, cam.right) / zc * cam.fpx, y: cam.s[1] - dot(v, cam.up) / zc * cam.fpx, r: r * cam.fpx / zc, z: zc };
  }

  // ------------------------------------------------------------------ dots in 3D (f in [cut, fallAway))
  function ampAt(f) {               // typing amplitude envelope inside the studio
    const t = f / C.fps;
    let a = T.amp * fp(f, S.cut, S.cut + 10);                       // the dots arrive resting; typing fades in
    if (f >= S.lightsOn) a = T.amp * fp(f, S.lightsOn + 2, S.lightsOn + 14);
    if (f >= S.punch) a = T.amp * lerp(1, 2.2, E.outCubic(fp(f, S.punch, S.punch + 4)));
    return a;
  }

  /** World position, squash and lamp state of dot i at frame f. */
  function dot3(f, i) {
    const t = f / C.fps;
    const [fs, fe] = S.fly[i];
    const lift = 0.24 * E.outCubic(fp(f, S.lift, S.lift + 4));
    let pos, sq = 0, lamp = 0, bob = 0;
    if (f < S.lift) {
      const h = home(i); pos = [h[0], h[1] + typ(t, i, ampAt(f)) / 100, h[2]];
    } else if (f < fs) {                                    // lifted, waiting its turn
      const h = home(i); pos = [h[0], h[1] + lift, h[2]];
      sq = 0.08 * (1 - fp(f, S.lift, S.lift + 3));
    } else if (f < S.detach) {
      const h = home(i), a = [h[0], h[1] + 0.24, h[2]], b = LAMP[i];
      const k = E.inOutCubic(fp(f, fs, fe));
      const ctrl = add(mul(add(a, b), 0.5), [0, 1.35, 0.6]);
      pos = bez(a, ctrl, b, k);
      if (f >= fe) {                                       // a lamp now: breathes on its own typing curve
        bob = typ(t, i, 6) * clamp((f - fe) / 6);
        pos = [b[0], b[1] + bob / 100, b[2]];
        lamp = E.outCubic(fp(f, fe, fe + 6));
      }
    } else if (f < S.lightsOn) {                           // home on 18-f arcs: row above the ش, compress, drop
      const h = home(i), above = [h[0], h[1] + 0.5, h[2]];
      const k = E.inOutCubic(fp(f, S.detach, S.homeRow));
      const ctrl = add(mul(add(LAMP[i], above), 0.5), [0, 1.0, 0.8]);
      pos = f < S.homeRow ? bez(LAMP[i], ctrl, above, k) : above;
      if (f >= S.homeCompress[0] && f < S.homeCompress[1]) sq = 0.08;
      if (f >= S.homeCompress[1]) { const d = E.inQuad(fp(f, S.homeCompress[1], S.lightsOn)); pos = [h[0], lerp(above[1], h[1], d), h[2]]; sq = -0.08 * d; }
    } else {                                               // home, typing on the lit ش
      const h = home(i);
      const hp = typ(t, i, ampAt(f));
      pos = [h[0], h[1] + hp / 100, h[2]];
      if (f < S.lightsOn + 3) sq = 0.18 * (1 - fp(f, S.lightsOn, S.lightsOn + 3));
      if (f >= S.compress && f < S.fallAway[0]) sq = 0.08;
    }
    return { pos, sq, lamp, bob, r: R0 };
  }

  /** Light rig state at frame f (intensities 0..1, multiplied by scene3d's calibrated maxima). */
  function lights(f) {
    const t = f / C.fps;
    const lamps = [0, 1, 2].map(i => {
      const [, fe] = S.fly[i];
      let k = f < fe ? 0 : E.outCubic(fp(f, fe, fe + 6));
      let pos = LAMP[i];
      if (f < S.detach) k *= 1 + 0.25 * (typ(t, i, 6) / 6);           // breathes with its dot
      if (f >= S.lightsOn) k *= lerp(1, 0.6, E.outCubic(fp(f, S.lightsOn, S.lightsOn + 6))) * (1 + 0.25 * typ(t, i, ampAt(f)) / T.amp);
      return { pos, k };
    });
    const key = E.outCubic(fp(f, S.lightsOn, S.lightsOn + 4));
    let flare = 0;                                                       // ≤ +0.15 stop per bounce, ≤ 3 a second
    if (f >= S.punch && f < S.fallAway[0]) flare = Math.max(...[0, 1, 2].map(i => typ(t, i, 1))) ** 2 * 0.15;
    const fill = 0.35 * key;
    const local = [0, 1, 2].map(i => (f >= S.lightsOn ? typ(t, i, 1) * key : 0));
    const pool = lerp(1, 0.42, key);                                    // the background pool dims as the key takes over
    return { lamps, key: key * Math.pow(2, flare), fill, local, pool };
  }

  return { pose, camera, project, dot3, lights, home, LAMP, PIVOT, R0, world, typ, ZD };
}
