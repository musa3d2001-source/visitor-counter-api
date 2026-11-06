/**
 * يُشغَّل في عملية Node جديدة من tests/unit/game/levels.test.ts (بمحمّل tsx):
 * يعيد الحل المرجعي لكل مستوى بحالة باردة تمامًا (تهيئة Rapier جديدة) ويطبع البصمات JSON على stdout.
 * الاختبار يقارنها بالبصمات الذهبية وبتشغيل العملية نفسها؛ أي فرق يعني أن الحتمية تعتمد على حالة العملية.
 */
import { runHeadless } from "../../../src/game/core/headless";
import { LEVELS } from "../../../src/game/levels";
import { loadRapierNode } from "../../../src/game/physics/rapier-node";
import { readSolution } from "../../../scripts/validate-levels";

async function main() {
  const R = await loadRapierNode();
  const out: Record<string, string[]> = {};
  for (const level of LEVELS) {
    const sol = readSolution(level.key);
    if (!sol) throw new Error(`no reference solution for ${level.key}`);
    out[level.key] = runHeadless(R, level, sol.shots).hashes;
  }
  process.stdout.write(JSON.stringify(out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
