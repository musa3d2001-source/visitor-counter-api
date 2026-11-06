/**
 * [تجربة المرحلة 0 - كود مؤقت]
 * runHeadless(R, layout, seed, shots): إعادة محاكاة كاملة دون عرض (الخادم والقياسات والعميل).
 * يتوقف عن تطبيق الطلقات بعد تحرير كل القناديل (الخادم يرفض الطلقات بعد cleared).
 */
import type { Level, Shot } from "./level-schema";
import type { RapierModule } from "./physics-adapter";
import { SETTLE_MAX_STEPS, Simulation } from "./sim";

export interface HeadlessResult {
  cleared: boolean;
  clearedAfterShot: number | null;
  stateHash: string;
  steps: number;
  freed: number;
  lanterns: number;
  perShot: { idx: number; steps: number; hash: string; freed: number }[];
}

/** حد خطوات الخادم: سكون أولي + سكون بعد كل طلقة */
export function stepCap(shots: number): number {
  return (shots + 1) * SETTLE_MAX_STEPS + 10;
}

export function runHeadless(R: RapierModule, layout: Level, seed: number, shots: readonly Shot[]): HeadlessResult {
  const sim = new Simulation(R, layout, seed);
  const cap = stepCap(shots.length);
  try {
    sim.settle(cap);
    let clearedAfterShot: number | null = null;
    const perShot: HeadlessResult["perShot"] = [];
    for (const shot of shots) {
      if (sim.isCleared()) break;
      sim.fire(shot);
      sim.settle(cap);
      perShot.push({ idx: shot.idx, steps: sim.steps, hash: sim.stateHash(), freed: sim.freedCount() });
      if (clearedAfterShot === null && sim.isCleared()) clearedAfterShot = shot.idx;
    }
    return {
      cleared: sim.isCleared(),
      clearedAfterShot,
      stateHash: sim.stateHash(),
      steps: sim.steps,
      freed: sim.freedCount(),
      lanterns: layout.lanterns.length,
      perShot,
    };
  } finally {
    sim.destroy();
  }
}
