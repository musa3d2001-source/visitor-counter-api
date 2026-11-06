/**
 * جدول التصويب الصحيح (GAME_DESIGN.md §3): الخطوات أعداد صحيحة، والسرعة بالمليمتر/ثانية مقرّبة إلى عدد صحيح،
 * فالقيمة نفسها في كل محرك. يُبنى مرة واحدة بجيب وتمام متعددَي حدود (لا Math.sin/cos/atan2).
 */
import { cosPoly, DEG, sinPoly, clampStep } from "./math";

/** الاتجاه الأفقي: 0..40 ⇐ من −20° إلى +20° (20 = مستقيم نحو الجزيرة) */
export const YAW_STEPS = 40;
export const YAW_CENTER = 20;
const YAW_MIN_DEG = -20;
/** الارتفاع: 0..60 ⇐ من 0° إلى 60° */
export const ANGLE_STEPS = 60;
/** القوة: 0..40 ⇐ من 8 إلى 28 م/ث */
export const POWER_STEPS = 40;
const SPEED_MIN = 8;
const SPEED_MAX = 28;

/** جيب وتمام كل خطوة، بأجزاء من مليون (أعداد صحيحة) */
const YAW_S = new Int32Array(YAW_STEPS + 1);
const YAW_C = new Int32Array(YAW_STEPS + 1);
for (let i = 0; i <= YAW_STEPS; i++) {
  const r = (YAW_MIN_DEG + i) * DEG;
  YAW_S[i] = Math.round(sinPoly(r) * 1e6);
  YAW_C[i] = Math.round(cosPoly(r) * 1e6);
}
const PITCH_S = new Int32Array(ANGLE_STEPS + 1);
const PITCH_C = new Int32Array(ANGLE_STEPS + 1);
for (let i = 0; i <= ANGLE_STEPS; i++) {
  const r = i * DEG;
  PITCH_S[i] = Math.round(sinPoly(r) * 1e6);
  PITCH_C[i] = Math.round(cosPoly(r) * 1e6);
}

export function speedOf(powerStep: number): number {
  return SPEED_MIN + ((SPEED_MAX - SPEED_MIN) * clampStep(powerStep, POWER_STEPS)) / POWER_STEPS;
}

/** السرعة الابتدائية (م/ث) قبل ضربها في speedScale للقذيفة */
export function aimVelocity(yawStep: number, angleStep: number, powerStep: number): { x: number; y: number; z: number } {
  const y = clampStep(yawStep, YAW_STEPS);
  const p = clampStep(angleStep, ANGLE_STEPS);
  const v = speedOf(powerStep);
  const h = (v * PITCH_C[p]) / 1e6;
  return {
    x: Math.round(h * YAW_S[y] * 1e-3) / 1000,
    y: Math.round(v * PITCH_S[p] * 1e-3) / 1000,
    z: -Math.round(h * YAW_C[y] * 1e-3) / 1000,
  };
}

/** زاويتا المرقاب بالراديان للعرض فقط */
export function aimAngles(yawStep: number, angleStep: number): { yaw: number; pitch: number } {
  return { yaw: (YAW_MIN_DEG + clampStep(yawStep, YAW_STEPS)) * DEG, pitch: clampStep(angleStep, ANGLE_STEPS) * DEG };
}

/**
 * أقرب تصويب صحيح نحو نقطة (لأدوات التصميم ومساعدة الدليل): بحث في الجداول الصحيحة بعمليات حسابية فقط،
 * ويفضّل المسار المنخفض (ارتفاع ≤ maxAngle). لا يدخل في المحاكاة.
 */
export function aimAt(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  opts: { speedScale?: number; maxAngle?: number; g?: number } = {},
): { yawStep: number; angleStep: number; powerStep: number } {
  const k = opts.speedScale ?? 1;
  const g = opts.g ?? 9.81;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  let yawStep = YAW_CENTER;
  let best = Infinity;
  for (let i = 0; i <= YAW_STEPS; i++) {
    const cross = Math.abs(dx * YAW_C[i] + dz * YAW_S[i]);
    const dot = dx * YAW_S[i] - dz * YAW_C[i];
    if (dot > 0 && cross < best) {
      best = cross;
      yawStep = i;
    }
  }
  const dist = Math.sqrt(dx * dx + dz * dz);
  const maxAngle = opts.maxAngle ?? 35;
  let pick = { angleStep: 10, powerStep: 20, err: Infinity };
  for (let p = 2; p <= maxAngle; p++) {
    for (let w = 0; w <= POWER_STEPS; w++) {
      const v = speedOf(w) * k;
      const vh = (v * PITCH_C[p]) / 1e6;
      const vy = (v * PITCH_S[p]) / 1e6;
      const t = dist / vh;
      const y = from.y + vy * t - 0.5 * g * t * t;
      const err = Math.abs(y - to.y) + w * 0.002;
      if (err < pick.err) pick = { angleStep: p, powerStep: w, err };
    }
  }
  return { yawStep, angleStep: pick.angleStep, powerStep: pick.powerStep };
}
