/**
 * تجربة 3D: معايرة سريعة لكل تصميم (Node، الحزمة -compat).
 *   npx tsx scripts/game-spike/tune3d.ts
 * يطبع لكل رمية: الخطوات والمكسور والقناديل المحررة، وأعلى ذروة قوة لكل مادة قبل الرمي (الحمل الساكن) وبعده.
 * القاعدة: الحمل الساكن لكل مادة أقل من نصف عتبة كسرها، وإلا انهار التصميم وحده.
 */
import { MATERIALS3, SPIKE3D_LAYOUTS, type MaterialKey } from "../../src/game/spike3d/layouts3d";
import { createSim3, type ForceTrace } from "../../src/game/spike3d/sim3d";
import { loadRapier3Node } from "../../src/game/spike3d/rapier3d-node";

async function main() {
  const R = await loadRapier3Node();
  const rest: Partial<Record<MaterialKey, number>> = {};
  for (const l of SPIKE3D_LAYOUTS) {
    const trace: ForceTrace = { opening: {}, shots: {} };
    const t0 = performance.now();
    const sim = createSim3(R, l, trace);
    const rows = [`opening ${sim.openingSteps} steps`];
    for (const s of l.shots) {
      const r = sim.runShot(s);
      rows.push(`${s.ammo}(y${s.yawStep} p${s.pitchStep} w${s.powerStep}) ${r.steps}st broken=${r.broken} freed=${r.freed}/${sim.lanternCount}`);
    }
    const ms = performance.now() - t0;
    for (const [m, f] of Object.entries(trace.opening)) rest[m as MaterialKey] = Math.max(rest[m as MaterialKey] ?? 0, f!);
    const fmt = (o: Partial<Record<MaterialKey, number>>) =>
      Object.entries(o)
        .map(([k, v]) => `${k}=${Math.round(v!)}`)
        .join(" ");
    console.log(`\n${l.key} (${l.bodies.length} bodies, ${ms.toFixed(0)} ms, ${sim.totalSteps} steps)\n  ${rows.join("\n  ")}\n  rest peaks: ${fmt(trace.opening)}\n  shot peaks: ${fmt(trace.shots)}`);
    sim.free();
  }
  console.log("\nmax static peak vs break force:");
  for (const [m, f] of Object.entries(rest)) {
    const b = MATERIALS3[m as MaterialKey].breakForce;
    console.log(`  ${m.padEnd(9)} rest ${Math.round(f!)} N / break ${b} N ${f! < b / 2 ? "OK" : "TOO CLOSE"}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
