/**
 * السحب كالنابض (GAME_DESIGN.md §11): دوال نقية بلا DOM، تحوّل إزاحة المؤشر إلى خطوات التصويب الصحيحة نفسها.
 *  - السحب أفقيًا يدير المرقاب عكس اتجاه السحب (كشدّ نابض): السحب يمينًا يوجّه الرمية يسارًا.
 *  - السحب إلى الأسفل (نحو اللاعب، أي شدّ النابض للخلف) يزيد القوة، وإلى الأعلى ينقصها.
 *  - الارتفاع لا يتغير بالسحب: له المنزلق والأسهم (التصويب الدقيق).
 * المخرجات أعداد صحيحة محصورة في YAW_STEPS و ANGLE_STEPS و POWER_STEPS دائمًا.
 */
import { ANGLE_STEPS, POWER_STEPS, YAW_CENTER, YAW_STEPS } from "../core/aim-table";

export type AimSteps = { yawStep: number; angleStep: number; powerStep: number };
export type Viewport = { w: number; h: number };

/** عرض السحب (كسرًا من أصغر بُعدي الشاشة) الذي يقطع مدى الاتجاه كله */
export const DRAG_YAW_SPAN = 0.9;
/** طول السحب الرأسي (كسرًا من أصغر بُعدي الشاشة) الذي يقطع مدى القوة كله */
export const DRAG_POWER_SPAN = 0.6;
/** أقل حركة (بكسل) تُعد سحبًا لا لمسة */
export const DRAG_SLOP_PX = 6;

/** عدد صحيح محصور في [0, max]؛ غير العددي يعود إلى البديل */
export function clampInt(v: number, max: number, fallback = 0): number {
  if (!Number.isFinite(v)) return Math.min(max, Math.max(0, Math.round(Number.isFinite(fallback) ? fallback : 0)));
  const r = Math.round(v);
  // ‎<= 0‎ يحوّل ‎-0‎ إلى صفر موجب أيضًا
  return r <= 0 ? 0 : r > max ? max : r;
}

/** يحصر تصويبًا كاملًا في المدى الصحيح */
export function clampAim(a: AimSteps): AimSteps {
  return { yawStep: clampInt(a.yawStep, YAW_STEPS, YAW_CENTER), angleStep: clampInt(a.angleStep, ANGLE_STEPS), powerStep: clampInt(a.powerStep, POWER_STEPS) };
}

/**
 * التصويب بعد سحب (dx, dy) بكسل من نقطة البدء، نسبةً إلى التصويب عند البدء.
 * dx موجب = يمينًا، dy موجب = إلى الأسفل (اتجاه الشاشة).
 */
export function dragToAim(start: AimSteps, dx: number, dy: number, viewport: Viewport): AimSteps {
  const base = clampAim(start);
  const u = Math.max(1, Math.min(viewport.w > 0 ? viewport.w : 1, viewport.h > 0 ? viewport.h : 1));
  const x = Number.isFinite(dx) ? dx : 0;
  const y = Number.isFinite(dy) ? dy : 0;
  const yawPerPx = YAW_STEPS / (DRAG_YAW_SPAN * u);
  const powerPerPx = POWER_STEPS / (DRAG_POWER_SPAN * u);
  return {
    yawStep: clampInt(base.yawStep - x * yawPerPx, YAW_STEPS),
    angleStep: base.angleStep,
    powerStep: clampInt(base.powerStep + y * powerPerPx, POWER_STEPS),
  };
}

/** هل تجاوزت الحركة حد اللمسة؟ (المسافة بمربعها) */
export function isDrag(dx: number, dy: number): boolean {
  return dx * dx + dy * dy > DRAG_SLOP_PX * DRAG_SLOP_PX;
}

/** خطوة واحدة (أو أكثر) على محور مع الحصر */
export function nudgeAim(a: AimSteps, axis: "yaw" | "angle" | "power", delta: number): AimSteps {
  const b = clampAim(a);
  if (axis === "yaw") return { ...b, yawStep: clampInt(b.yawStep + delta, YAW_STEPS) };
  if (axis === "angle") return { ...b, angleStep: clampInt(b.angleStep + delta, ANGLE_STEPS) };
  return { ...b, powerStep: clampInt(b.powerStep + delta, POWER_STEPS) };
}

export function sameAim(a: AimSteps, b: AimSteps): boolean {
  return a.yawStep === b.yawStep && a.angleStep === b.angleStep && a.powerStep === b.powerStep;
}
