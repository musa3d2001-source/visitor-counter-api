// [تجربة المرحلة 0 - كود مؤقت] قياس إعادة المحاكاة في Node للحزمتين.
// التشغيل (من edu-platform):
//   node --import tsx --import ./scripts/game-spike/node-hooks/register.mjs --experimental-wasm-modules --no-warnings \
//        scripts/game-spike/node-bench.ts [--runs 25]
// يكتب: docs/game/spike/node-results.json و src/app/admin/game/spike/_engine/layouts/golden.json
// وضع الابن (عملية جديدة لكل حزمة): ... node-bench.ts --child standard|compat  → JSON على stdout
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import { LAYOUTS, SOLUTIONS } from "../../src/app/admin/game/spike/_engine/layouts";
import type { RapierPackage } from "../../src/app/admin/game/spike/_engine/load-rapier";
import type { RapierModule } from "../../src/app/admin/game/spike/_engine/physics-adapter";
import { runHeadless, stepCap } from "../../src/app/admin/game/spike/_engine/run-headless";
import { Simulation } from "../../src/app/admin/game/spike/_engine/sim";
import { loadRapierNode } from "./rapier-node";

const PKGS: RapierPackage[] = ["standard", "compat"];
const now = () => Number(process.hrtime.bigint()) / 1e6;

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}
const r2 = (x: number) => Math.round(x * 100) / 100;

function hashesOnce(R: RapierModule) {
  const out: Record<string, { hash: string; steps: number; cleared: boolean; clearedAfterShot: number | null; perShot: string[] }> = {};
  for (const l of LAYOUTS) {
    const sol = SOLUTIONS[l.key];
    const r = runHeadless(R, l, sol.seed, sol.shots);
    out[l.key] = { hash: r.stateHash, steps: r.steps, cleared: r.cleared, clearedAfterShot: r.clearedAfterShot, perShot: r.perShot.map((s) => s.hash) };
  }
  return out;
}

/** نسخة من حلقة runHeadless مع توقيت كل خطوة (التوقيت خارج المحرك) */
function stepProfile(R: RapierModule, key: string) {
  const l = LAYOUTS.find((x) => x.key === key)!;
  const sol = SOLUTIONS[key];
  const sim = new Simulation(R, l, sol.seed);
  const cap = stepCap(sol.shots.length);
  const times: number[] = [];
  const timed = () => {
    while (!sim.isSettled()) {
      if (sim.steps >= cap) throw new Error("cap");
      const t = now();
      sim.step();
      times.push((now() - t) * 1000);
    }
  };
  try {
    timed();
    for (const s of sol.shots) {
      if (sim.isCleared()) break;
      sim.fire(s);
      timed();
    }
  } finally {
    sim.destroy();
  }
  times.sort((a, b) => a - b);
  return { steps: times.length, p50us: r2(pct(times, 50)), p95us: r2(pct(times, 95)), maxus: r2(times[times.length - 1]), meanus: r2(times.reduce((a, b) => a + b, 0) / times.length) };
}

async function child(pkg: RapierPackage) {
  const t0 = now();
  const R = await loadRapierNode(pkg);
  const loadMs = now() - t0;
  const hashes = hashesOnce(R);
  process.stdout.write(JSON.stringify({ pkg, pid: process.pid, loadMs: r2(loadMs), hashes }));
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--child") return child(args[1] as RapierPackage);
  const runs = Number(args[args.indexOf("--runs") + 1]) || 25;
  const result: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    cpu: cpus()[0]?.model,
    cpuCount: cpus().length,
    runsPerLayout: runs,
    command:
      "node --import tsx --import ./scripts/game-spike/node-hooks/register.mjs --experimental-wasm-modules --no-warnings scripts/game-spike/node-bench.ts --runs " + runs,
  };
  const perPkg: Record<string, unknown> = {};
  const golden: Record<string, unknown> = {};
  const hashByPkg: Record<string, Record<string, string>> = {};
  for (const pkg of PKGS) {
    const t0 = now();
    const R = await loadRapierNode(pkg);
    const loadMs = now() - t0;
    // ثلاث تشغيلات داخل العملية نفسها للحتمية
    const inProc = [hashesOnce(R), hashesOnce(R), hashesOnce(R)];
    const layouts: Record<string, unknown> = {};
    for (const l of LAYOUTS) {
      const sol = SOLUTIONS[l.key];
      runHeadless(R, l, sol.seed, sol.shots); // إحماء
      const times: number[] = [];
      const hashes = new Set<string>();
      let last = null as ReturnType<typeof runHeadless> | null;
      for (let i = 0; i < runs; i++) {
        const t = now();
        last = runHeadless(R, l, sol.seed, sol.shots);
        times.push(now() - t);
        hashes.add(last.stateHash);
      }
      times.sort((a, b) => a - b);
      const seedProbe = runHeadless(R, l, sol.seed + 1, sol.shots);
      const prof = stepProfile(R, l.key);
      layouts[l.key] = {
        tier: l.tier,
        dynamicBodies: l.bodies.filter((b) => !b.fixed).length + l.lanterns.length,
        shots: sol.shots.length,
        par: l.par,
        cleared: last!.cleared,
        clearedAfterShot: last!.clearedAfterShot,
        steps: last!.steps,
        stateHash: last!.stateHash,
        perShotHashes: last!.perShot.map((s) => s.hash),
        distinctHashesOverRuns: hashes.size,
        inProcess3RunsEqual: inProc.every((h) => h[l.key].hash === last!.stateHash && h[l.key].perShot.join() === last!.perShot.map((s) => s.hash).join()),
        replayMs: { p50: r2(pct(times, 50)), p95: r2(pct(times, 95)), min: r2(times[0]), max: r2(times[times.length - 1]) },
        avgStepUs: r2((pct(times, 50) * 1000) / last!.steps),
        stepProfileUs: prof,
        otherSeed: { seed: sol.seed + 1, stateHash: seedProbe.stateHash, cleared: seedProbe.cleared, differs: seedProbe.stateHash !== last!.stateHash },
      };
      (hashByPkg[pkg] ??= {})[l.key] = last!.stateHash;
      if (pkg === "standard") golden[l.key] = { seed: sol.seed, stateHash: last!.stateHash, steps: last!.steps, cleared: last!.cleared, clearedAfterShot: last!.clearedAfterShot, perShot: last!.perShot.map((s) => s.hash) };
      console.log(pkg, l.key, last!.stateHash, "steps", last!.steps, "cleared", last!.cleared, "p50", r2(pct(times, 50)), "p95", r2(pct(times, 95)), "ms", "step p50/p95/max us", prof.p50us, prof.p95us, prof.maxus);
    }
    // عملية ابن جديدة (تحميل بارد للحزمة) ومقارنة البصمات
    const execArgs = ["--import", "tsx", "--import", "./scripts/game-spike/node-hooks/register.mjs", "--experimental-wasm-modules", "--no-warnings", "scripts/game-spike/node-bench.ts", "--child", pkg];
    const cp = spawnSync(process.execPath, execArgs, { encoding: "utf8", cwd: process.cwd() });
    const childOut = JSON.parse(cp.stdout) as { pid: number; loadMs: number; hashes: Record<string, { hash: string }> };
    const childEqual = LAYOUTS.every((l) => childOut.hashes[l.key].hash === hashByPkg[pkg][l.key]);
    perPkg[pkg] = { loadMs: r2(loadMs), childProcess: { pid: childOut.pid, loadMs: childOut.loadMs, allHashesEqual: childEqual }, layouts };
    console.log(pkg, "load ms", r2(loadMs), "child pid", childOut.pid, "child hashes equal", childEqual);
  }
  const crossPackageEqual = LAYOUTS.every((l) => hashByPkg.standard[l.key] === hashByPkg.compat[l.key]);
  result.packages = perPkg;
  result.crossPackageEqual = crossPackageEqual;
  console.log("standard vs compat hashes equal:", crossPackageEqual);
  writeFileSync(join(process.cwd(), "docs/game/spike/node-results.json"), JSON.stringify(result, null, 2) + "\n");
  writeFileSync(join(process.cwd(), "src/app/admin/game/spike/_engine/layouts/golden.json"), JSON.stringify(golden, null, 1) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
