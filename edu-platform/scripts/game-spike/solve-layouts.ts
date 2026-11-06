// [تجربة المرحلة 0 - كود مؤقت] يبحث عن حل مرجعي لكل تصميم بخطوات المنزلقين الصحيحة (بحث جشع على شبكة).
// التشغيل: node --import tsx scripts/game-spike/solve-layouts.ts [key...]
// يكتب src/app/admin/game/spike/_engine/layouts/solutions.json (البذرة ثابتة 20261106 لكل تصميم).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LAYOUTS } from "../../src/app/admin/game/spike/_engine/layouts";
import type { Level, Shot } from "../../src/app/admin/game/spike/_engine/level-schema";
import type { AmmoId } from "../../src/app/admin/game/spike/_engine/materials";
import { ANGLE_STEPS, POWER_STEPS } from "../../src/app/admin/game/spike/_engine/aim-table";
import { Simulation } from "../../src/app/admin/game/spike/_engine/sim";
import { stepCap } from "../../src/app/admin/game/spike/_engine/run-headless";
import type { RapierModule } from "../../src/app/admin/game/spike/_engine/physics-adapter";
import { loadRapierNode } from "./rapier-node";

const SEED = 20261106;
/** خطة الذخيرة لكل تصميم: الحصاة تمثل إجابة خاطئة، والنيزك الثقيل قذيفة خاصة */
const PLAN: Record<string, AmmoId[]> = {
  "t1-first-tower": ["meteor"],
  "t1-glass-window": ["pebble", "meteor"],
  "t2-teak-scaffold": ["meteor", "meteor"],
  "t2-cloud-bounce": ["pebble", "meteor"],
  "t3-stone-keep": ["meteor", "pebble", "heavy"],
  "t3-lightbox-chain": ["pebble", "meteor"],
  "t4-domino-row": ["meteor", "pebble", "meteor"],
  "t4-grand-observatory": ["meteor", "pebble", "meteor", "meteor"],
};
const OUT = join(process.cwd(), "src/app/admin/game/spike/_engine/layouts/solutions.json");

function score(R: RapierModule, level: Level, shots: Shot[]): { freed: number; disp: number; cleared: boolean } {
  const sim = new Simulation(R, level, SEED);
  const cap = stepCap(shots.length);
  const o = new Float64Array(6);
  try {
    sim.settle(cap);
    for (const s of shots) {
      if (sim.isCleared()) break;
      sim.fire(s);
      sim.settle(cap);
    }
    let disp = 0;
    for (let i = 1; i < sim.bodies.length; i++) {
      const b = sim.bodies[i];
      if (b.role === "projectile" || b.fixed) continue;
      if (!b.alive) {
        disp += 4;
        continue;
      }
      sim.read(i, o);
      disp += Math.min(4, Math.abs(o[0] - b.x0) + Math.abs(o[1] - b.y0));
    }
    return { freed: sim.freedCount(), disp, cleared: sim.isCleared() };
  } finally {
    sim.destroy();
  }
}

async function main() {
  const R = await loadRapierNode("compat");
  const only = process.argv.slice(2);
  const existing = JSON.parse(readFileSync(OUT, "utf8")) as Record<string, { seed: number; shots: Shot[] }>;
  for (const level of LAYOUTS) {
    if (only.length && !only.includes(level.key)) continue;
    const shots: Shot[] = [];
    const t0 = Date.now();
    let cleared = false;
    const plan = PLAN[level.key] ?? ["meteor"];
    while (shots.length < level.par && !cleared) {
      const k = shots.length;
      const ammo: AmmoId = plan[Math.min(k, plan.length - 1)];
      // قبل الطلقة الأخيرة في الخطة نختار أفضل طلقة لا تُنهي المستوى، لتكون الحلول متعددة الطلقات كما في اللعب الفعلي
      const mustNotClear = k < plan.length - 1;
      let best: { shot: Shot; freed: number; disp: number; cleared: boolean } | null = null;
      for (let a = 2; a < ANGLE_STEPS; a += 3) {
        for (let p = 4; p < POWER_STEPS; p += 2) {
          const shot: Shot = { idx: k, ammo, angleStep: a, powerStep: p, activateAt: -1 };
          const s = score(R, level, [...shots, shot]);
          if (mustNotClear && s.cleared) continue;
          if (!best || (s.cleared && !best.cleared) || (s.cleared === best.cleared && (s.freed > best.freed || (s.freed === best.freed && s.disp > best.disp)))) best = { shot, ...s };
        }
      }
      if (!best) break;
      shots.push(best.shot);
      cleared = best.cleared;
      console.log(level.key, "shot", best.shot.idx, best.shot.ammo, `a=${best.shot.angleStep} p=${best.shot.powerStep}`, "freed", best.freed, "/", level.lanterns.length, "disp", best.disp.toFixed(1));
    }
    console.log(level.key, cleared ? "SOLVED" : "NOT SOLVED", "shots", shots.length, "par", level.par, "in", ((Date.now() - t0) / 1000).toFixed(1), "s");
    if (cleared) existing[level.key] = { seed: SEED, shots };
  }
  writeFileSync(OUT, JSON.stringify(existing, null, 1) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
