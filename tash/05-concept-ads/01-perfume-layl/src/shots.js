// LAYL — shot list + per-frame look. Timing comes from src/cues.json (shared with src/audio.py).
// Times are LOCKED: the launch-ad editor cuts from ?clean=1. See SCRIPT.md.
// 80 BPM grid: 1 beat = 0.75 s. Every cut lands on a beat.
import { clamp, lerp, E } from '/_system/motion/kit.js';

export const CUES = await (await fetch(new URL('./cues.json', import.meta.url))).json();
export const BEAT = CUES.beat;
export const SHOTS = CUES.shots;
export const T = { ...CUES.t, duration: CUES.duration };

export const shotAt = t => { for (let i = SHOTS.length - 1; i >= 0; i--) if (t >= SHOTS[i].at) return SHOTS[i]; return SHOTS[0]; };
export const local = (s, t) => clamp((t - s.at) / (s.end - s.at));
const V = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
/** Camera "cruise": never at rest on a cut — starts moving, accelerates slightly into the next cut. */
const cruise = k => k * (0.82 + 0.18 * k * k);

// warm / cool light colours (linear RGB multipliers)
const WARM = [1.0, 0.78, 0.52], COOL = [0.72, 0.84, 1.0], NEUTRAL = [1, 0.95, 0.88], AMBER = [1.0, 0.55, 0.16];
// dark-field studio: two tall strips just outside the silhouette (white edge lines on black), warm key, cool rim
const STUDIO = { keyL: [...WARM, 2.6], keyR: [...NEUTRAL, 1.0], sideL: [...WARM, 1.8], sideR: [...COOL, 2.0], rimL: [...WARM, 1.0], rimR: [...COOL, 1.4],
  top: [...NEUTRAL, 1.1], fill: [...WARM, 1.2], back: [...AMBER, 1.4], frontL: [...NEUTRAL, 0], frontR: [...NEUTRAL, 0] };
// hero: front streaks placed (by angle) near the edges of the face for the far, low camera
const HERO = { ...STUDIO, frontL: [...NEUTRAL, 4.0], frontR: [...NEUTRAL, 2.6], pos: { frontL: [-0.60, 1.0, 4.6], frontR: [-0.10, 1.0, 4.6] } };
const ORBIT = { ...STUDIO, frontL: [...NEUTRAL, 6], frontR: [...NEUTRAL, 4] };

/** Everything the renderer needs for time t (pure function of t). */
export function frameSpec(t) {
  const s = shotAt(t), k = local(s, t);
  const spec = { shot: s.id, k, cam: null, env: null, envKey: null, key: 0, rim: 0, glow: 0, glowY: 2, stripX: 9, stripI: 0, floor: true, refl: 0.5, pool: 1, backdrop: 1,
    dust: 0, mist: 0, sim: 0, focus: 3, aperture: 0, capPress: 0, sweepBack: null, bloom: 0.07, exposure: 1.0 };

  if (s.id === 'S1') {
    // Frame 0 is already a composition: the arch edge in near-dark, a thin bar of light already entering from the right.
    // The bar travels right→left behind the flask (refracted sharp through the glass, bending at every bevel) and lights
    // a band of amber inside the liquid; a matching env strip glints the front bevels. The one light sweep of the piece.
    const sw = clamp((t + 0.10) / 1.62); const swE = sw * (0.75 + 0.25 * sw); // already moving at frame 0
    const camPos = V([-0.30, 1.00, 1.30], [-0.24, 1.04, 1.14], cruise(k));
    spec.cam = { pos: camPos, target: V([-0.16, 1.10, 0.0], [-0.14, 1.12, 0.0], cruise(k)), fov: 38 };
    const stripX = lerp(0.30, -0.80, swE), stripZ = -1.5;
    spec.sweepBack = { x: stripX, z: stripZ, I: 3.0 };
    // where the bar is seen through the liquid plane (z≈0), in bottle-local x
    spec.stripX = camPos[0] + (stripX - camPos[0]) * camPos[2] / (camPos[2] - stripZ);
    spec.stripI = 1.25;
    const th = lerp(0.9, -0.9, swE);
    spec.env = { sweep: [...NEUTRAL, 7.0], top: [...WARM, 0.25], sideL: [...WARM, 0.25], sideR: [...COOL, 0.3], sweepPos: [3.4 * Math.sin(th), 1.3, 3.4 * Math.cos(th)] };
    spec.envKey = null; // re-baked every frame (previous target disposed)
    spec.glow = 0.04 + 0.42 * E.inQuad(clamp((t - 0.75) / 0.75));
    spec.floor = false; spec.focus = 1.16; spec.aperture = 30; spec.backdrop = 0;
    spec.bloom = 0.08;
  } else if (s.id === 'S2') {
    // The arch lights up from within like a window at night; slow push, two softbox streaks on the face.
    spec.cam = { pos: V([0.0, 0.70, 3.05], [0.0, 0.74, 2.66], cruise(k)), target: V([0.0, 0.70, 0.0], [0.0, 0.74, 0.0], cruise(k)), fov: 30 };
    spec.env = { keyL: [...WARM, 1.6], keyR: [...NEUTRAL, 0.9], back: [...AMBER, 1.0], top: [...WARM, 0.8], fill: [...WARM, 1.0], sideR: [...COOL, 1.6], sideL: [...WARM, 1.4], rimL: [...WARM, 0.8], rimR: [...COOL, 0.8], frontL: [...NEUTRAL, 15], frontR: [...NEUTRAL, 10] };
    spec.envKey = 'S2';
    spec.key = 0.6; spec.rim = 0.5;
    spec.glow = lerp(0.12, 0.72, E.outCubic(clamp(k * 1.25))); spec.glowY = lerp(0.2, 1.6, E.inOutSine(clamp(k * 1.15)));
    spec.floor = false; spec.focus = lerp(2.85, 2.48, cruise(k)); spec.aperture = 10; spec.backdrop = 0.7;
  } else if (s.id === 'S3') {
    // Slow 50° orbit; gold dust drifts through the frame — the notes. Env stays fixed, reflections slide.
    const a = lerp(-0.62, 0.30, cruise(k));
    const r = lerp(5.3, 4.9, k);
    spec.cam = { pos: [r * Math.sin(a), 1.32, r * Math.cos(a)], target: [0, 0.98, 0], fov: 36, shiftY: 0.05 };
    spec.env = ORBIT; spec.envKey = 'orbit';
    spec.key = 1.0; spec.rim = 1.0; spec.glow = 0.85;
    spec.dust = 1; spec.focus = r; spec.aperture = 14; spec.refl = 0.55;
  } else if (s.id === 'S4') {
    // Macro on the brass atomiser (the cap IS the actuator). Press, then mist in slow motion (speed ramp ≈0.22×),
    // backlit so it glows. The camera follows the mist leftward (forward, in RTL).
    spec.cam = { pos: V([-0.50, 1.78, 1.40], [-0.66, 1.80, 1.30], cruise(k)), target: V([-0.30, 1.64, 0.0], [-0.42, 1.68, 0.0], cruise(k)), fov: 36 };
    spec.env = { keyL: [...WARM, 1.8], sideL: [...WARM, 1.6], rimL: [...WARM, 2.0], rimR: [...COOL, 1.2], top: [...NEUTRAL, 1.0], back: [...AMBER, 0.8] };
    spec.envKey = 'S4';
    spec.key = 1.0; spec.rim = 1.2; spec.glow = 0.8;
    spec.floor = false; spec.focus = 1.32; spec.aperture = 26;
    spec.mist = 1; spec.sim = Math.max(0, (t - T.spray)) * 0.22;
    const press = clamp((t - (T.spray - 0.10)) / 0.10), rel = clamp((t - (T.spray + 0.75)) / 0.3);
    spec.capPress = E.outCubic(press) * (1 - E.inOutSine(rel));
  } else if (s.id === 'S5') {
    // The mist hangs in the dark and keeps drifting; the camera follows it. Text beat (final only).
    spec.cam = { pos: V([-0.92, 1.62, 1.75], [-1.02, 1.64, 1.52], cruise(k)), target: V([-0.98, 1.66, 0.0], [-1.04, 1.68, 0.0], cruise(k)), fov: 38 };
    spec.env = { keyL: [...WARM, 0.6], sideL: [...WARM, 1.0], rimL: [...WARM, 1.6], rimR: [...COOL, 0.8], back: [...AMBER, 0.6] };
    spec.envKey = 'S5';
    spec.key = 0.25; spec.rim = 0.8; spec.glow = 0.5;
    spec.floor = false; spec.focus = 1.62; spec.aperture = 18; spec.backdrop = 0.0;
    spec.mist = 0.8; spec.sim = (s.at - T.spray) * 0.22 + (t - s.at) * 0.10; // continuous with S4, slower
  } else if (s.id === 'S6') {
    // Low hero on the glossy black floor; one long push-in to the end (lens shift keeps verticals straight).
    const kk = clamp((t - s.at) / (s.end - s.at));
    const a = lerp(0.085, 0.05, kk);
    const r = lerp(7.45, 6.55, E.outQuad(kk));
    spec.cam = { pos: [r * Math.sin(a), 0.36, r * Math.cos(a)], target: [0, 0.36, 0], fov: 40, shiftY: 0.415 };
    spec.env = HERO; spec.envKey = 'hero';
    spec.key = 1.1; spec.rim = 1.1; spec.glow = 0.9;
    spec.dust = 0.7; spec.focus = r; spec.aperture = 6; spec.refl = 0.6; spec.pool = 1.0;
  }
  return spec;
}
