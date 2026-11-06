/**
 * [تجربة المرحلة 0 - كود مؤقت]
 * جدول تصويب صحيح: (angleStep, powerStep) أعداد صحيحة ← سرعة إطلاق.
 * الزاوية من جدول cos/sin مولَّد مسبقًا (× 1e6)، والسرعة بالملّيمتر/ث، والقسمة الأخيرة
 * عملية IEEE واحدة مقرّبة بدقة فتعطي النتيجة نفسها في كل منصة.
 * المِرقاب يمينًا ويطلق يسارًا، فالسرعة الأفقية سالبة.
 */
import { ANGLE_STEPS, COS_1E6, SIN_1E6 } from "./aim-table.generated";

export { ANGLE_STEPS };
export const POWER_STEPS = 41; // 0..40
export const SPEED_MIN_MM = 6000; // 6 م/ث
export const SPEED_STEP_MM = 450; // حتى 24 م/ث

export function isValidAim(angleStep: number, powerStep: number): boolean {
  return (
    Number.isInteger(angleStep) &&
    Number.isInteger(powerStep) &&
    angleStep >= 0 &&
    angleStep < ANGLE_STEPS &&
    powerStep >= 0 &&
    powerStep < POWER_STEPS
  );
}

export function aimVelocity(angleStep: number, powerStep: number): { vx: number; vy: number } {
  if (!isValidAim(angleStep, powerStep)) throw new RangeError("aim out of range");
  const speedMm = SPEED_MIN_MM + powerStep * SPEED_STEP_MM;
  return {
    vx: -(COS_1E6[angleStep] * speedMm) / 1e9,
    vy: (SIN_1E6[angleStep] * speedMm) / 1e9,
  };
}
