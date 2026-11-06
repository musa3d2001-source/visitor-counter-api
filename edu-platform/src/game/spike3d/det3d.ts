/**
 * تجربة 3D (المرحلة 2، قبل كود الإنتاج): التصويب الحتمي في ثلاثة أبعاد.
 * المدخلات أعداد صحيحة { yawStep, pitchStep, powerStep }، والتحويل إلى سرعة من جدول صحيح يُبنى مرة واحدة
 * بجيب وتمام متعددَي حدود (لا Math.sin/cos/atan2، فالجدول متطابق بتًا في V8 و JavaScriptCore).
 * المرقاب خلف الملعب عند z موجبة ويرمي نحو z السالبة (عمق المشهد).
 */

/** جيب الزاوية بسلسلة تايلور حتى الحد الحادي عشر (خطأ < 1e-7 على [-1.1, 1.1]) */
export function sinPoly(x: number): number {
  const x2 = x * x;
  return x * (1 - (x2 / 6) * (1 - (x2 / 20) * (1 - (x2 / 42) * (1 - (x2 / 72) * (1 - x2 / 110)))));
}
export function cosPoly(x: number): number {
  const x2 = x * x;
  return 1 - (x2 / 2) * (1 - (x2 / 12) * (1 - (x2 / 30) * (1 - (x2 / 56) * (1 - (x2 / 90) * (1 - x2 / 132)))));
}
const PI = 3.141592653589793;
const RAD = PI / 180;

/** الاتجاه الأفقي: 0..YAW_STEPS ⇐ من −20° (يسار) إلى +20° (يمين)، درجة لكل خطوة */
export const YAW_STEPS = 40;
const YAW_MIN_DEG = -20;
/** الارتفاع: 0..PITCH_STEPS ⇐ من 0° إلى 60°، درجة لكل خطوة */
export const PITCH_STEPS = 60;
/** القوة: 0..POWER_STEPS ⇐ من 8 إلى 28 م/ث، نصف متر لكل خطوة */
export const POWER_STEPS = 40;
const SPEED_MIN = 8;
const SPEED_MAX = 28;

/** جيب وتمام كل خطوة اتجاه وارتفاع، بأجزاء من مليون (أعداد صحيحة) */
const YAW_S = new Int32Array(YAW_STEPS + 1);
const YAW_C = new Int32Array(YAW_STEPS + 1);
for (let i = 0; i <= YAW_STEPS; i++) {
  const r = (YAW_MIN_DEG + i) * RAD;
  YAW_S[i] = Math.round(sinPoly(r) * 1e6);
  YAW_C[i] = Math.round(cosPoly(r) * 1e6);
}
const PITCH_S = new Int32Array(PITCH_STEPS + 1);
const PITCH_C = new Int32Array(PITCH_STEPS + 1);
for (let i = 0; i <= PITCH_STEPS; i++) {
  const r = i * RAD;
  PITCH_S[i] = Math.round(sinPoly(r) * 1e6);
  PITCH_C[i] = Math.round(cosPoly(r) * 1e6);
}

export function speedOf(powerStep: number): number {
  return SPEED_MIN + ((SPEED_MAX - SPEED_MIN) * powerStep) / POWER_STEPS;
}

function clampInt(v: number, max: number): number {
  return v < 0 ? 0 : v > max ? max : v | 0;
}

/**
 * السرعة الابتدائية بالمليمتر/ثانية مقرّبة إلى عدد صحيح ثم مقسومة على 1000: القيمة نفسها في كل محرك.
 * x يمين، y أعلى، z نحو الكاميرا (الرمي نحو z السالبة).
 */
export function aimVelocity3(yawStep: number, pitchStep: number, powerStep: number): { x: number; y: number; z: number } {
  const y = clampInt(yawStep, YAW_STEPS);
  const p = clampInt(pitchStep, PITCH_STEPS);
  const v = speedOf(clampInt(powerStep, POWER_STEPS));
  const h = (v * PITCH_C[p]) / 1e6;
  return {
    x: Math.round(h * YAW_S[y] * 1e-3) / 1000,
    y: Math.round(v * PITCH_S[p] * 1e-3) / 1000,
    z: -Math.round(h * YAW_C[y] * 1e-3) / 1000,
  };
}

/** زاوية الاتجاه والارتفاع بالراديان للعرض فقط (المرقاب) */
export function aimAngles(yawStep: number, pitchStep: number): { yaw: number; pitch: number } {
  return { yaw: (YAW_MIN_DEG + clampInt(yawStep, YAW_STEPS)) * RAD, pitch: clampInt(pitchStep, PITCH_STEPS) * RAD };
}

/**
 * يختار أقرب تصويب صحيح نحو هدف (لبناء رميات التصاميم التجريبية): بحث في الجداول الصحيحة بعمليات حسابية فقط،
 * فالنتيجة نفسها في Node والمتصفح. يفضّل المسار المنخفض (ارتفاع ≤ maxPitch).
 */
export function aimAt(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  opts: { speedScale?: number; maxPitch?: number; g?: number } = {},
): { yawStep: number; pitchStep: number; powerStep: number } {
  const k = opts.speedScale ?? 1;
  const g = opts.g ?? 9.81;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  // الاتجاه: أصغر |حاصل الضرب الاتجاهي| بين (dx, -dz) و(sin, cos) مع اتجاه موجب
  let yawStep = 0;
  let best = Infinity;
  for (let i = 0; i <= YAW_STEPS; i++) {
    const cross = Math.abs(dx * YAW_C[i] - -dz * YAW_S[i]);
    const dot = dx * YAW_S[i] + -dz * YAW_C[i];
    if (dot > 0 && cross < best) {
      best = cross;
      yawStep = i;
    }
  }
  const dist = Math.sqrt(dx * dx + dz * dz);
  const maxPitch = opts.maxPitch ?? 35;
  let pick = { pitchStep: 10, powerStep: 20, err: Infinity };
  for (let p = 2; p <= maxPitch; p++) {
    for (let w = 0; w <= POWER_STEPS; w++) {
      const v = speedOf(w) * k;
      const vh = (v * PITCH_C[p]) / 1e6;
      const vy = (v * PITCH_S[p]) / 1e6;
      const t = dist / vh;
      const y = from.y + vy * t - 0.5 * g * t * t;
      // خطأ الارتفاع، مع تفضيل خفيف للرمية الأسرع (مسار أقرب للمستقيم)
      const err = Math.abs(y - to.y) + w * 0.002;
      if (err < pick.err) pick = { pitchStep: p, powerStep: w, err };
    }
  }
  return { yawStep, pitchStep: pick.pitchStep, powerStep: pick.powerStep };
}
