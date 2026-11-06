/**
 * [تجربة المرحلة 0 - كود مؤقت] مدخل المحرك للعميل (يُحمَّل كسولًا بـ import() من spike-client).
 * لا react ولا next ولا server-only هنا.
 */
import "./zod-jitless"; // يجب أن يبقى أول استيراد (قبل تحليل التصاميم)
export { Simulation } from "./sim";
export { runHeadless, stepCap, type HeadlessResult } from "./run-headless";
export { loadRapier, RAPIER_PACKAGE_NAMES, type RapierPackage } from "./load-rapier";
export { LAYOUTS, SOLUTIONS } from "./layouts";
export { ANGLE_STEPS, POWER_STEPS, aimVelocity } from "./aim-table";
export type { RapierModule } from "./physics-adapter";
export type { Level, Shot } from "./level-schema";
