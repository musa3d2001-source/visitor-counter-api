/**
 * تجربة المرحلة 0 في Node: الحتمية وزمن إعادة المحاكاة لكل التصاميم بالحزمة -compat
 * (الحزمة split تحتاج دعم استيراد ‎.wasm‎ كوحدة ES، فتُقاس في Node عبر --experimental-wasm-modules في سكربت منفصل).
 *
 *   npx tsx scripts/game-spike/node-replay.ts [--runs 20] [--json out.json]
 *
 * يطبع: بصمة كل تصميم (3 تشغيلات في العملية نفسها + تشغيل في عملية فرعية جديدة)، وزمن الإعادة p50/p95/max، وكلفة الخطوة.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { SPIKE_LAYOUTS } from "../../src/game/spike/layouts";
import { runHeadless } from "../../src/game/spike/sim";
import { loadRapierNode } from "../../src/game/spike/rapier-node";

const args = process.argv.slice(2);
const childMode = args.includes("--child");
const runs = Number(args[args.indexOf("--runs") + 1]) || 20;
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;

async function main() {
  const R = await loadRapierNode();
  if (childMode) {
    const out: Record<string, string[]> = {};
    for (const l of SPIKE_LAYOUTS) out[l.key] = runHeadless(R, l).hashes;
    process.stdout.write(JSON.stringify(out));
    return;
  }
  const now = () => performance.now();
  const report: Record<string, unknown> = { node: process.version, platform: `${process.platform}-${process.arch}`, layouts: {} };
  const childOut = JSON.parse(
    execFileSync(process.execPath, [...process.execArgv, __filename, "--child"], { encoding: "utf8", timeout: 120_000 }),
  ) as Record<string, string[]>;
  let allOk = true;
  for (const l of SPIKE_LAYOUTS) {
    const first = runHeadless(R, l, now);
    const times: number[] = [];
    let same = true;
    for (let i = 0; i < runs; i++) {
      const r = runHeadless(R, l, now);
      times.push(r.ms);
      if (r.hashes.join() !== first.hashes.join()) same = false;
    }
    const childSame = childOut[l.key].join() === first.hashes.join();
    times.sort((a, b) => a - b);
    const q = (p: number) => times[Math.min(times.length - 1, Math.floor(p * times.length))];
    const row = {
      bodies: l.bodies.length,
      shots: l.shots.length,
      steps: first.steps,
      freed: `${first.freed}/${first.lanterns}`,
      finalHash: first.finalHash,
      inProcessStable: same,
      childProcessMatch: childSame,
      p50ms: +q(0.5).toFixed(1),
      p95ms: +q(0.95).toFixed(1),
      maxMs: +times[times.length - 1].toFixed(1),
      usPerStep: +((q(0.5) * 1000) / first.steps).toFixed(1),
      hashes: first.hashes,
    };
    if (!same || !childSame) allOk = false;
    (report.layouts as Record<string, unknown>)[l.key] = row;
    console.log(
      `${l.key.padEnd(15)} bodies=${String(row.bodies).padStart(2)} steps=${String(row.steps).padStart(5)} freed=${row.freed.padEnd(4)} hash=${row.finalHash} stable=${same} child=${childSame} p50=${row.p50ms}ms p95=${row.p95ms}ms max=${row.maxMs}ms ${row.usPerStep}µs/step`,
    );
  }
  report.allDeterministic = allOk;
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  console.log(allOk ? "ALL DETERMINISTIC" : "MISMATCH");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
