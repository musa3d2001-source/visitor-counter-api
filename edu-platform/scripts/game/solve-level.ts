/**
 * باحث الحلول المرجعية للمستويات (GAME_DESIGN.md §12): بحث حزمي (beam) على خطوات التصويب الصحيحة بالشهب فقط.
 * لكل حالة: تصويب aimAt() نحو كل قنديل غير محرَّر وما يسنده وما أمامه بعدة أقواس، ثم تسلّق جوار أفضلها (±1 و±2).
 * أول عمق يتحقق فيه الهدف هو طول الحل؛ ويُختار بين حلوله ما لا تحققه الحصى بالتصويب نفسه، ثم الأثبت لجواره.
 *
 *   npx tsx scripts/game/solve-level.ts <key...|all> [--beam 8] [--depth 7] [--write]
 *   npx tsx scripts/game/solve-level.ts <key> --shots "20,11,18/31,4,22" [--write]   يتحقق من حل معروف ويسجّله بلا بحث
 *
 * --write يكتب tests/fixtures/game-solutions/<key>.json (الطلقات والبصمات). par المقترح = طول الحل (+1 للطبقتين 1 و 2).
 * كل تقييم يعيد المحاكاة من البداية (لا استنساخ لعالم Rapier)، وهذا رخيص: 5–20 م.ث للطلقة.
 */
import { aimAt, ANGLE_STEPS, POWER_STEPS, YAW_STEPS } from "../../src/game/core/aim-table";
import type { Level } from "../../src/game/core/level-schema";
import { createSim, type Shot } from "../../src/game/core/sim";
import { FREE_D2, LAUNCH } from "../../src/game/core/world";
import { LEVELS } from "../../src/game/levels";
import type { Rapier } from "../../src/game/physics/types";
import { loadRapierNode } from "../../src/game/physics/rapier-node";
import { makeSolution, MISS_SHOT, withAmmo, writeSolution } from "../validate-levels";
import { runHeadless } from "../../src/game/core/headless";

type Aim = { yawStep: number; angleStep: number; powerStep: number };
type Vec = { x: number; y: number; z: number };

type Node = {
  aims: Aim[];
  /** القناديل المحررة بعد كل طلقة */
  freedAfter: number[];
  freed: number;
  cleared: boolean;
  score: number;
  hash: string;
  /** مواضع القناديل غير المحررة والكتل الحية (لتوليد المرشحين) */
  open: Vec[];
  blocks: (Vec & { h: number })[];
};

const ARCS = [6, 11, 17, 24, 32, 42, 55];

export function toShots(aims: readonly Aim[]): Shot[] {
  return aims.map((a, idx) => ({ idx, ammo: "meteor", yawStep: a.yawStep, angleStep: a.angleStep, powerStep: a.powerStep, activateAt: -1 }));
}

const aimKey = (a: Aim) => `${a.yawStep},${a.angleStep},${a.powerStep}`;

function inRange(a: Aim): boolean {
  return a.yawStep >= 0 && a.yawStep <= YAW_STEPS && a.angleStep >= 0 && a.angleStep <= ANGLE_STEPS && a.powerStep >= 0 && a.powerStep <= POWER_STEPS;
}

/** يعيد المحاكاة من البداية بالطلقات ويقيّم الحالة الناتجة */
function evaluate(R: Rapier, level: Level, aims: Aim[]): Node {
  const sim = createSim(R, level);
  const home: Vec[] = [];
  // القنديل الذي سقط في الافتتاح (لا يحدث في تصميم سليم) يُعدّ محرَّرًا في sim، فمكانه هنا لا يُستعمل
  for (let i = sim.lanternStart; i < sim.layoutCount; i++) home.push(sim.bodies[i].rb ? { ...sim.bodies[i].rb!.translation() } : { x: 0, y: 0, z: 0 });
  const freedAfter: number[] = [];
  let hash = sim.hash();
  for (const s of toShots(aims)) {
    const r = sim.runShot(s);
    freedAfter.push(r.freed);
    hash = r.hash;
  }
  const open: Vec[] = [];
  let progress = 0;
  for (let i = sim.lanternStart; i < sim.layoutCount; i++) {
    const b = sim.bodies[i];
    if (sim.isFreed(i) || !b.rb) continue;
    const p = b.rb.translation();
    const h = home[i - sim.lanternStart];
    const d2 = (p.x - h.x) * (p.x - h.x) + (p.y - h.y) * (p.y - h.y) + (p.z - h.z) * (p.z - h.z);
    progress += Math.min(d2 / FREE_D2, 1);
    open.push({ x: p.x, y: p.y, z: p.z });
  }
  const blocks: Node["blocks"] = [];
  for (let i = 0; i < sim.lanternStart; i++) {
    const b = sim.bodies[i];
    if (b.alive && b.rb) blocks.push({ ...b.rb.translation(), h: b.h });
  }
  const freed = sim.freedCount();
  const cleared = sim.isCleared();
  sim.free();
  return { aims, freedAfter, freed, cleared, score: freed * 1000 + progress * 150 + (level.bodies.length - blocks.length) * 3, hash, open, blocks };
}

/** نقاط التصويب: كل قنديل مفتوح (وسطه وأسفله)، والكتل التي تسنده، والكتل التي أمامه نحو المرقاب */
function targets(n: Node): Vec[] {
  const out: Vec[] = [];
  for (const l of n.open) {
    out.push(l, { x: l.x, y: l.y - 0.22, z: l.z });
    const near = (f: (b: Vec & { h: number }) => boolean) =>
      n.blocks
        .filter(f)
        .map((b) => ({ b, d2: (b.x - l.x) * (b.x - l.x) + (b.z - l.z) * (b.z - l.z) }))
        .sort((a, b) => a.d2 - b.d2)
        .slice(0, 2)
        .map((x) => x.b);
    out.push(...near((b) => b.y < l.y && Math.abs(b.x - l.x) < 0.9 && Math.abs(b.z - l.z) < 0.9));
    out.push(...near((b) => b.z > l.z + 0.2 && Math.abs(b.x - l.x) < 1 && b.y + b.h / 2 > l.y - 0.3));
  }
  return out;
}

function baseCandidates(n: Node): Aim[] {
  const seen = new Set<string>();
  const out: Aim[] = [];
  for (const t of targets(n)) {
    for (const maxAngle of ARCS) {
      const a = aimAt(LAUNCH, t, { maxAngle });
      const k = aimKey(a);
      if (!seen.has(k)) (seen.add(k), out.push(a));
    }
  }
  return out;
}

const NEIGHBOURS: Aim[] = [
  { yawStep: 1, angleStep: 0, powerStep: 0 },
  { yawStep: -1, angleStep: 0, powerStep: 0 },
  { yawStep: 0, angleStep: 1, powerStep: 0 },
  { yawStep: 0, angleStep: -1, powerStep: 0 },
  { yawStep: 0, angleStep: 0, powerStep: 1 },
  { yawStep: 0, angleStep: 0, powerStep: -1 },
];
const WIDE: Aim[] = [
  ...NEIGHBOURS,
  { yawStep: 0, angleStep: 2, powerStep: 0 },
  { yawStep: 0, angleStep: -2, powerStep: 0 },
  { yawStep: 0, angleStep: 0, powerStep: 2 },
  { yawStep: 0, angleStep: 0, powerStep: -2 },
];
const add = (a: Aim, d: Aim): Aim => ({ yawStep: a.yawStep + d.yawStep, angleStep: a.angleStep + d.angleStep, powerStep: a.powerStep + d.powerStep });

/** ثبات الحل: نسبة الجيران (±1 لكل محور في كل طلقة) التي تحرر بعدها العدد نفسه على الأقل */
export function robustness(R: Rapier, level: Level, aims: Aim[], freedAfter: number[]): number {
  let ok = 0;
  let total = 0;
  for (let i = 0; i < aims.length; i++) {
    for (const d of NEIGHBOURS) {
      const a = add(aims[i], d);
      if (!inRange(a)) continue;
      total++;
      const n = evaluate(R, level, [...aims.slice(0, i), a]);
      if (n.freed >= freedAfter[i]) ok++;
    }
  }
  return total ? ok / total : 0;
}

export type SolveResult = { aims: Aim[]; shots: Shot[]; robustness: number; evaluations: number; ms: number };

export function solve(R: Rapier, level: Level, opts: { beam?: number; depth?: number; perParent?: number; log?: (s: string) => void } = {}): SolveResult | null {
  const beamWidth = opts.beam ?? 8;
  const maxDepth = opts.depth ?? 7;
  const perParent = opts.perParent ?? 3;
  const log = opts.log ?? (() => {});
  const t0 = performance.now();
  let evaluations = 0;
  const ev = (aims: Aim[]) => (evaluations++, evaluate(R, level, aims));
  let beam: Node[] = [ev([])];
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next: Node[] = [];
    for (const parent of beam) {
      const seen = new Set<string>();
      const kids: Node[] = [];
      const tryAim = (a: Aim) => {
        const k = aimKey(a);
        if (!inRange(a) || seen.has(k)) return;
        seen.add(k);
        kids.push(ev([...parent.aims, a]));
      };
      for (const a of baseCandidates(parent)) tryAim(a);
      // تسلّق الجوار مرتين من أفضل ثلاثة
      for (let round = 0; round < 2; round++) {
        const top = [...kids].sort((a, b) => b.score - a.score).slice(0, 3);
        for (const t of top) for (const d of WIDE) tryAim(add(t.aims[t.aims.length - 1], d));
      }
      kids.sort((a, b) => b.score - a.score);
      // كل الحلول المكتملة تُحفظ، والباقي أفضل perParent حالات مختلفة البصمة
      const hashes = new Set<string>();
      let kept = 0;
      for (const k of kids) {
        if (k.cleared) next.push(k);
        else if (kept < perParent && !hashes.has(k.hash)) (hashes.add(k.hash), next.push(k), kept++);
      }
    }
    const done = next.filter((n) => n.cleared);
    log(
      `depth ${depth}: ${next.length} states, best freed ${Math.max(...next.map((n) => n.freed))}/${level.lanterns.length}, cleared ${done.length}, evals ${evaluations}, ${((performance.now() - t0) / 1000).toFixed(1)}s`,
    );
    if (done.length) {
      // يُفضَّل ما لا تحققه الحصى، ثم الأثبت
      const scored = done.slice(0, 24).map((n) => {
        const pebble = runHeadless(R, level, withAmmo(toShots(n.aims), "pebble")).cleared;
        return { n, pebble, rob: pebble ? 0 : robustness(R, level, n.aims, n.freedAfter) };
      });
      scored.sort((a, b) => Number(a.pebble) - Number(b.pebble) || b.rob - a.rob);
      const best = scored[0];
      if (!best.pebble) return { aims: best.n.aims, shots: toShots(best.n.aims), robustness: best.rob, evaluations, ms: performance.now() - t0 };
      log("  every solution at this depth also clears with pebbles; searching deeper");
    }
    const uniq = new Map<string, Node>();
    for (const n of next) if (!n.cleared && !uniq.has(n.hash)) uniq.set(n.hash, n);
    beam = [...uniq.values()].sort((a, b) => b.score - a.score).slice(0, beamWidth);
  }
  return null;
}

function parseAims(text: string): Aim[] {
  return text.split("/").map((t) => {
    const [yawStep, angleStep, powerStep] = t.split(",").map(Number);
    const a = { yawStep, angleStep, powerStep };
    if (![yawStep, angleStep, powerStep].every(Number.isInteger) || !inRange(a)) throw new Error(`bad aim "${t}" (yaw 0..40, angle 0..60, power 0..40)`);
    return a;
  });
}

/** يتحقق من حل معروف: يحقق الهدف بالطلقة الأخيرة بالشهب، ولا تحققه الحصى */
function checkGiven(R: Rapier, level: Level, aims: Aim[]): SolveResult | null {
  const t0 = performance.now();
  const n = evaluate(R, level, aims);
  const pebble = runHeadless(R, level, withAmmo(toShots(aims), "pebble")).cleared;
  const early = n.freedAfter.findIndex((f) => f === level.lanterns.length);
  console.log(`  given: freed after each shot ${n.freedAfter.join(", ")} of ${level.lanterns.length}; pebbles ${pebble ? "CLEAR (rejected)" : "do not clear"}`);
  if (!n.cleared || pebble || early !== aims.length - 1) return null;
  return { aims, shots: toShots(aims), robustness: robustness(R, level, aims, n.freedAfter), evaluations: 1, ms: performance.now() - t0 };
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name: string, def: number) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : def);
  const flags = new Set(["--beam", "--depth", "--per-parent", "--shots"]);
  const keys = args.filter((a, i) => !a.startsWith("--") && !flags.has(args[i - 1]));
  const write = args.includes("--write");
  // --shots "20,11,18/31,4,22": حل معروف (yaw,angle,power لكل طلقة) يُتحقق منه ويُسجَّل بلا بحث
  const given = args.includes("--shots") ? parseAims(args[args.indexOf("--shots") + 1]) : null;
  if (given && keys.length !== 1) {
    console.error("--shots needs exactly one level key");
    process.exit(2);
  }
  const R = await loadRapierNode();
  const levels = keys.includes("all") ? LEVELS : keys.map((k) => LEVELS.find((l) => l.key === k) ?? null);
  let failed = 0;
  for (const level of levels) {
    if (!level) {
      console.error(`unknown level; known: ${LEVELS.map((l) => l.key).join(", ")}`);
      process.exit(2);
    }
    console.log(`\n${level.key} «${level.title}» tier ${level.tier}, ${level.bodies.length} bodies, ${level.lanterns.length} lanterns`);
    const res = given ? checkGiven(R, level, given) : solve(R, level, { beam: opt("--beam", 8), depth: opt("--depth", 7), perParent: opt("--per-parent", 3), log: (s) => console.log(`  ${s}`) });
    if (!res) {
      console.log(given ? "  REJECTED: the given shots must clear on the last shot with meteors and not with pebbles" : "  NO SOLUTION within the depth");
      failed++;
      continue;
    }
    const sol = makeSolution(R, level, res.shots);
    const miss = createSim(R, level);
    const missFreed = miss.runShot(MISS_SHOT).freed;
    miss.free();
    const par = res.shots.length + (level.tier <= 2 ? 1 : 0);
    console.log(`  solution (${res.shots.length} shots, robustness ${(res.robustness * 100).toFixed(0)}%, ${res.evaluations} evals, ${(res.ms / 1000).toFixed(1)}s):`);
    for (const s of res.shots) console.log(`    { yawStep: ${s.yawStep}, angleStep: ${s.angleStep}, powerStep: ${s.powerStep} }`);
    console.log(`  hashes ${sol.hashes.join(" ")}  miss frees ${missFreed}`);
    console.log(`  suggested par ${par} (level has par ${level.par}, slots ${level.slots})${par !== level.par ? "  <-- update build-levels.ts" : ""}`);
    if (write) {
      writeSolution(sol);
      console.log(`  wrote tests/fixtures/game-solutions/${level.key}.json`);
    }
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && /solve-level\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
