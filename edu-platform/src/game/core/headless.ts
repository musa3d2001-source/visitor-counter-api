/**
 * إعادة جولة بلا عرض (GAME_DESIGN.md §4): الأساس لـ /finish على الخادم، والاستئناف، والتحقق من الحلول المرجعية.
 * الجولة تتحدد بالتصميم وإصداره والطلقات (البذرة لا تغيّر البنية ولا الفيزياء).
 */
import type { Rapier } from "../physics/types";
import type { Level } from "./level-schema";
import { createSim, type Shot } from "./sim";

export type HeadlessResult = {
  key: string;
  version: number;
  /** البصمة بعد الافتتاح ثم بعد كل طلقة */
  hashes: string[];
  finalHash: string;
  /** فهرس أول طلقة (في المصفوفة) تحقق بعدها الهدف، أو −1 */
  clearedAfterShot: number;
  cleared: boolean;
  freed: number;
  lanterns: number;
  broken: number;
  steps: number;
  shots: number;
  ms: number;
};

export function runHeadless(R: Rapier, level: Level, shots: readonly Shot[], now: () => number = () => 0): HeadlessResult {
  const t0 = now();
  const sim = createSim(R, level);
  const hashes = [sim.hash()];
  let clearedAfterShot = -1;
  for (let i = 0; i < shots.length; i++) {
    const r = sim.runShot(shots[i]);
    hashes.push(r.hash);
    if (r.cleared && clearedAfterShot < 0) clearedAfterShot = i;
  }
  const res: HeadlessResult = {
    key: level.key,
    version: level.version,
    hashes,
    finalHash: hashes[hashes.length - 1],
    clearedAfterShot,
    cleared: sim.isCleared(),
    freed: sim.freedCount(),
    lanterns: sim.lanternCount,
    broken: sim.broken,
    steps: sim.totalSteps,
    shots: shots.length,
    ms: 0,
  };
  sim.free();
  res.ms = now() - t0;
  return res;
}
