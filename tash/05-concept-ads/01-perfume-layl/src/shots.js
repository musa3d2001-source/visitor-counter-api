// LAYL — shot list. Times are LOCKED once rendered (the launch-ad editor cuts from ?clean=1). See SCRIPT.md.
// 80 BPM grid: 1 beat = 0.75 s. Every cut lands on a beat.
import { clamp, lerp, E } from '/_system/motion/kit.js';

export const BEAT = 0.75;
export const SHOTS = [
  { id: 'S1', name: 'light sweep — macro glass edge', at: 0.00, end: 1.50 },
  { id: 'S2', name: 'amber glow — liquid wakes up', at: 1.50, end: 3.00 },
  { id: 'S3', name: 'orbit — gold dust (the notes)', at: 3.00, end: 6.00 },
  { id: 'S4', name: 'atomiser — slow-motion mist', at: 6.00, end: 8.25 },
  { id: 'S5', name: 'typographic beat — mist lingers', at: 8.25, end: 10.50 },
  { id: 'S6', name: 'hero pack shot — glossy floor', at: 10.50, end: 15.90 },
];
export const T = {
  endcard: 12.00,   // client end card over the hero (final only)
  lightsOut: 13.20, // night falls (final only)
  sting: 13.50,     // TASH signature starts
  duration: 15.90,
  spray: 6.30,      // atomiser fires (cap press) — audio cue
};

export const shotAt = t => { for (let i = SHOTS.length - 1; i >= 0; i--) if (t >= SHOTS[i].at) return SHOTS[i]; return SHOTS[0]; };
export const local = (s, t) => clamp((t - s.at) / (s.end - s.at));
const V = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const ease = E.inOutSine;

// warm / cool light colours (linear-ish RGB multipliers)
const WARM = [1.0, 0.78, 0.52], COOL = [0.72, 0.84, 1.0], NEUTRAL = [1, 0.95, 0.88], AMBER = [1.0, 0.55, 0.16];
const STUDIO = { keyL: [...WARM, 2.6], keyR: [...NEUTRAL, 1.0], sideL: [...WARM, 1.8], sideR: [...COOL, 2.0], rimL: [...WARM, 1.0], rimR: [...COOL, 1.4],
  top: [...NEUTRAL, 1.1], fill: [...WARM, 1.2], back: [...AMBER, 1.4] };

/** Returns everything the renderer needs for time t. */
export function frameSpec(t) {
  const s = shotAt(t), k = local(s, t), st = t - s.at;
  const spec = { shot: s.id, k, cam: null, env: null, envKey: null, key: 0, rim: 0, glow: 0, glowY: 2, stripX: 9, stripI: 0, floor: true, refl: 0.5, pool: 1, backdrop: 1,
    dust: 0, mist: 0, sim: 0, focus: 3, aperture: 0, capPress: 0, sweepBack: null, bloom: 0.18, exposure: 1.0, shiftY: 0 };

  if (s.id === 'S1') {
    // Darkness. A soft light bar travels right→left behind the flask: through the glass it is refracted sharp and
    // bends at every bevel; it lights a band of amber inside the liquid; a matching env strip glints the front bevels.
    const sw = E.inOutSine(clamp((t + 0.05) / 1.5));
    const camPos = V([-0.30, 1.00, 1.30], [-0.24, 1.04, 1.14], ease(k));
    spec.cam = { pos: camPos, target: V([-0.16, 1.10, 0.0], [-0.14, 1.12, 0.0], ease(k)), fov: 38 };
    const stripX = lerp(0.55, -0.95, sw), stripZ = -1.5;
    spec.sweepBack = { x: stripX, z: stripZ, I: 2.4 * clamp(t / 0.12) };
    // where the bar is seen through the liquid plane (z≈0), in bottle-local x
    spec.stripX = camPos[0] + (stripX - camPos[0]) * camPos[2] / (camPos[2] - stripZ);
    spec.stripI = 1.25 * clamp(t / 0.2);
    const th = lerp(0.9, -0.9, sw);
    spec.env = { sweep: [...NEUTRAL, 6.0], top: [...WARM, 0.25], sideL: [...WARM, 0.25], sideR: [...COOL, 0.3], sweepPos: [3.4 * Math.sin(th), 1.3, 3.4 * Math.cos(th)] };
    spec.envKey = null; // re-baked every frame
    spec.key = 0; spec.rim = 0.0;
    spec.glow = 0.04 + 0.22 * clamp((t - 0.9) / 0.6); spec.glowY = 2.0;
    spec.floor = false; spec.focus = 1.16; spec.aperture = 30; spec.backdrop = 0;
    spec.bloom = 0.22;
  } else if (s.id === 'S2') {
    // The liquid wakes: amber light rises through it from the base. Slow crane up the front face.
    spec.cam = { pos: V([0.0, 0.70, 3.05], [0.0, 0.74, 2.70], ease(k)), target: V([0.0, 0.70, 0.0], [0.0, 0.74, 0.0], ease(k)), fov: 30 };
    spec.env = { keyL: [...WARM, 1.2], keyR: [...NEUTRAL, 0.5], back: [...AMBER, 1.0], top: [...WARM, 0.8], fill: [...WARM, 1.0], sideR: [...COOL, 1.6], sideL: [...WARM, 1.4], rimL: [...WARM, 0.8], rimR: [...COOL, 0.8] };
    spec.envKey = 'S2';
    spec.key = 0.6; spec.rim = 0.5;
    spec.glow = lerp(0.10, 0.85, E.outCubic(clamp(k * 1.25))); spec.glowY = lerp(0.18, 1.6, E.inOutSine(clamp(k * 1.15)));
    spec.floor = false; spec.focus = lerp(2.85, 2.5, ease(k)); spec.aperture = 10; spec.backdrop = 0.7;
  } else if (s.id === 'S3') {
    // Slow orbit; gold dust drifts through the frame — the notes.
    const a = lerp(-0.62, 0.30, ease(k));
    const r = lerp(5.3, 4.9, k);
    spec.cam = { pos: [r * Math.sin(a), 1.32, r * Math.cos(a)], target: [0, 0.98, 0], fov: 36, shiftY: 0.05 };
    spec.env = STUDIO;
    spec.envKey = 'studio';
    spec.key = 1.0; spec.rim = 1.0; spec.glow = 0.85; spec.glowY = 2;
    spec.dust = 1; spec.focus = r; spec.aperture = 14; spec.refl = 0.55;
  } else if (s.id === 'S4') {
    // Macro on the brass atomiser; mist leaves the orifice in slow motion and catches the back light.
    spec.cam = { pos: V([-0.50, 1.78, 1.40], [-0.66, 1.80, 1.30], ease(k)), target: V([-0.30, 1.64, 0.0], [-0.42, 1.68, 0.0], ease(k)), fov: 36 };
    spec.env = { keyL: [...WARM, 1.8], sideL: [...WARM, 1.6], rimL: [...WARM, 2.0], rimR: [...COOL, 1.2], top: [...NEUTRAL, 1.0], back: [...AMBER, 0.8] };
    spec.envKey = 'S4';
    spec.key = 1.0; spec.rim = 1.2; spec.glow = 0.8; spec.glowY = 2;
    spec.floor = false; spec.focus = 1.32; spec.aperture = 26;
    spec.mist = 1; spec.sim = Math.max(0, (t - T.spray)) * 0.22; // slow motion: ~4.5x
    const press = clamp((t - (T.spray - 0.12)) / 0.12), rel = clamp((t - (T.spray + 0.75)) / 0.3);
    spec.capPress = E.outCubic(press) * (1 - E.inOutSine(rel));
  } else if (s.id === 'S5') {
    // The mist hangs in the dark; the bottle is a soft shape behind it. Text beat (final only).
    spec.cam = { pos: V([-0.95, 1.86, 2.05], [-1.10, 1.86, 1.85], ease(k)), target: V([-0.55, 1.55, 0.0], [-0.62, 1.58, 0.0], ease(k)), fov: 38 };
    spec.env = { keyL: [...WARM, 0.6], sideL: [...WARM, 1.0], rimL: [...WARM, 1.6], rimR: [...COOL, 0.8], back: [...AMBER, 0.6] };
    spec.envKey = 'S5';
    spec.key = 0.25; spec.rim = 0.8; spec.glow = 0.55; spec.glowY = 2;
    spec.floor = false; spec.focus = 2.0; spec.aperture = 22; spec.backdrop = 0.5;
    spec.mist = 0.8; spec.sim = (T.spray + 1.95 - T.spray) * 0.22 + (t - s.at) * 0.08 + 0.0; // keeps drifting, slower
    spec.sim = 0.43 + (t - s.at) * 0.10;
    spec.bloom = 0.2;
  } else if (s.id === 'S6') {
    // Low hero on the glossy black floor; slow push-in. Lens shift keeps verticals straight.
    const kk = clamp((t - s.at) / 3.6);
    const a = lerp(0.16, 0.04, ease(kk));
    const r = lerp(7.4, 6.6, E.outCubic(kk));
    spec.cam = { pos: [r * Math.sin(a), 0.36, r * Math.cos(a)], target: [0, 0.36, 0], fov: 40, shiftY: 0.36 };
    spec.env = STUDIO;
    spec.envKey = 'studio';
    spec.key = 1.1; spec.rim = 1.1; spec.glow = 0.9; spec.glowY = 2;
    spec.dust = 0.7; spec.focus = r; spec.aperture = 6; spec.refl = 0.6; spec.pool = 1.0;
  }
  return spec;
}
