/**
 * التحقق من مستويات اللعبة (GAME_DESIGN.md §12): لكل ملف JSON في src/game/levels/
 *  - يطابق المخطط (levelSchema) ومُدرج في src/game/levels/index.ts.
 *  - يستقر في الافتتاح (أقل من 900 خطوة)، والرمية الضائعة في البحر لا تحرر شيئًا.
 *  - حله المرجعي (tests/fixtures/game-solutions/<key>.json) بالشهب فقط يحقق الهدف ضمن par، والبصمات مطابقة.
 *  - الرميات نفسها بالحصى لا تحقق الهدف (حتى لا يكفي التخمين).
 *
 *   npx tsx scripts/validate-levels.ts            يطبع جدولًا، ويخرج بالرمز 1 عند أي فشل
 *   npx tsx scripts/validate-levels.ts --update   يعيد كتابة البصمات من طلقات الحل الحالية (لتغيير مقصود في تصميم فقط)
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ANGLE_STEPS, POWER_STEPS, YAW_STEPS } from "../src/game/core/aim-table";
import { runHeadless, type HeadlessResult } from "../src/game/core/headless";
import { levelSchema, type Level } from "../src/game/core/level-schema";
import { createSim, type Shot } from "../src/game/core/sim";
import { LANTERN_SIZE, LAUNCH, QUIET } from "../src/game/core/world";
import { LEVELS } from "../src/game/levels";
import type { Rapier } from "../src/game/physics/types";
import { loadRapierNode } from "../src/game/physics/rapier-node";

export const LEVELS_DIR = resolve(__dirname, "../src/game/levels");
export const SOLUTIONS_DIR = resolve(__dirname, "../tests/fixtures/game-solutions");

/** البنى على الجزيرة بهامش 50 سم من حافتها (سم، لأطراف الأجسام لا مراكزها فقط) */
export const ISLAND_CM = { x: 850, z: 650 } as const;
/** ظل 19°: القناديل داخل مخروط الاتجاه (±20°) بهامش درجة */
const AIM_CONE_TAN = 0.3443;

/** رمية ضائعة مقصودة: يسار الجزيرة بانخفاض وسرعة قصوى، فتسقط في البحر */
export const MISS_SHOT: Shot = { idx: 0, ammo: "meteor", yawStep: 0, angleStep: 5, powerStep: 40, activateAt: -1 };

/** الحل المرجعي كما يُحفظ في tests/fixtures/game-solutions/<key>.json */
export type Solution = { key: string; version: number; shots: Shot[]; hashes: string[]; finalHash: string; clearedAfterShot: number };

export function solutionPath(key: string): string {
  return resolve(SOLUTIONS_DIR, `${key}.json`);
}

export function readSolution(key: string): Solution | null {
  const file = solutionPath(key);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as Solution;
}

/** الطلقات نفسها بقذيفة أخرى (فحص الحصى) */
export function withAmmo(shots: readonly Shot[], ammo: Shot["ammo"]): Shot[] {
  return shots.map((s) => ({ ...s, ammo }));
}

/** حل جديد من طلقات: يعيد المحاكاة ويجمع البصمات */
export function makeSolution(R: Rapier, level: Level, shots: readonly Shot[]): Solution {
  const r = runHeadless(R, level, shots);
  return { key: level.key, version: level.version, shots: shots.map((s) => ({ ...s })), hashes: r.hashes, finalHash: r.finalHash, clearedAfterShot: r.clearedAfterShot };
}

/** كائن مسطح في سطر واحد بنمط prettier ({ "k": v }) */
function inline(o: object): string {
  return `{ ${Object.entries(o)
    .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(", ")} }`;
}

export function serializeSolution(s: Solution): string {
  const shots = s.shots.length === 1 ? `[${inline(s.shots[0])}]` : `[\n${s.shots.map((x) => `    ${inline(x)}`).join(",\n")}\n  ]`;
  return [
    "{",
    `  "key": ${JSON.stringify(s.key)},`,
    `  "version": ${s.version},`,
    `  "shots": ${shots},`,
    `  "hashes": [${s.hashes.map((h) => JSON.stringify(h)).join(", ")}],`,
    `  "finalHash": ${JSON.stringify(s.finalHash)},`,
    `  "clearedAfterShot": ${s.clearedAfterShot}`,
    "}",
    "",
  ].join("\n");
}

export function writeSolution(s: Solution): void {
  writeFileSync(solutionPath(s.key), serializeSolution(s));
}

export type LevelReport = {
  key: string;
  title: string;
  tier: number;
  bodies: number;
  lanterns: number;
  par: number;
  slots: number;
  openingSteps: number;
  missFreed: number;
  refShots: number;
  clearedAfterShot: number;
  pebbleCleared: boolean;
  replayMs: number;
  errors: string[];
};

/** فحص كل ما سبق لتصميم واحد وحله؛ errors فارغة = ناجح */
export function checkLevel(R: Rapier, level: Level, sol: Solution | null, now: () => number = () => 0): LevelReport {
  const errors: string[] = [];
  const rep: LevelReport = {
    key: level.key,
    title: level.title,
    tier: level.tier,
    bodies: level.bodies.length,
    lanterns: level.lanterns.length,
    par: level.par,
    slots: level.slots,
    openingSteps: 0,
    missFreed: -1,
    refShots: sol?.shots.length ?? 0,
    clearedAfterShot: -1,
    pebbleCleared: false,
    replayMs: 0,
    errors,
  };
  if (level.streakReward !== "heavy") errors.push(`streakReward ${level.streakReward} (MVP-A: heavy)`);
  if (level.slots < 4 || level.slots > 6) errors.push(`slots ${level.slots} outside 4..6`);
  if (level.slots < level.par - 1) errors.push(`slots ${level.slots} < par - 1`);
  level.bodies.forEach((b, i) => {
    if (Math.abs(b.x) + b.w / 2 > ISLAND_CM.x || Math.abs(b.z) + b.d / 2 > ISLAND_CM.z) errors.push(`body ${i} (${b.m}) leaves the island`);
  });
  level.lanterns.forEach((l, i) => {
    if (Math.abs(l.x) + LANTERN_SIZE.w / 2 > ISLAND_CM.x || Math.abs(l.z) + LANTERN_SIZE.d / 2 > ISLAND_CM.z) errors.push(`lantern ${i} leaves the island`);
    // داخل مخروط الاتجاه (±20° مع هامش درجة) فيمكن التصويب نحوه مباشرة
    if (Math.abs(l.x) > AIM_CONE_TAN * (LAUNCH.z * 100 - l.z)) errors.push(`lantern ${i} is outside the ±19° aim cone`);
  });

  // الافتتاح والرمية الضائعة
  const sim = createSim(R, level);
  rep.openingSteps = sim.openingSteps;
  if (sim.openingSteps >= QUIET.maxStepsPerShot) errors.push(`opening did not settle (${sim.openingSteps} steps)`);
  rep.missFreed = sim.runShot(MISS_SHOT).freed;
  sim.free();
  if (rep.missFreed !== 0) errors.push(`a miss into the sea freed ${rep.missFreed}`);

  if (!sol) {
    errors.push("no reference solution");
    return rep;
  }
  if (sol.key !== level.key || sol.version !== level.version) errors.push(`solution is for ${sol.key} v${sol.version}`);
  sol.shots.forEach((s, i) => {
    const ok =
      s.idx === i &&
      s.ammo === "meteor" &&
      s.activateAt === -1 &&
      [s.yawStep, s.angleStep, s.powerStep].every(Number.isInteger) &&
      s.yawStep >= 0 &&
      s.yawStep <= YAW_STEPS &&
      s.angleStep >= 0 &&
      s.angleStep <= ANGLE_STEPS &&
      s.powerStep >= 0 &&
      s.powerStep <= POWER_STEPS;
    if (!ok) errors.push(`shot ${i} is not a plain meteor with idx ${i} and integer steps`);
  });

  const r: HeadlessResult = runHeadless(R, level, sol.shots, now);
  rep.replayMs = r.ms;
  rep.clearedAfterShot = r.clearedAfterShot;
  if (!r.cleared) errors.push(`reference solution frees ${r.freed}/${r.lanterns}`);
  if (sol.shots.length > level.par) errors.push(`reference solution has ${sol.shots.length} shots > par ${level.par}`);
  if (r.clearedAfterShot !== sol.shots.length - 1) errors.push(`cleared after shot ${r.clearedAfterShot}, expected the last (${sol.shots.length - 1})`);
  if (r.clearedAfterShot !== sol.clearedAfterShot) errors.push(`clearedAfterShot ${r.clearedAfterShot} != fixture ${sol.clearedAfterShot}`);
  if (r.finalHash !== sol.finalHash) errors.push(`finalHash ${r.finalHash} != fixture ${sol.finalHash}`);
  if (r.hashes.join() !== sol.hashes.join()) errors.push("per-shot hashes differ from the fixture");
  const again = runHeadless(R, level, sol.shots);
  if (again.hashes.join() !== r.hashes.join()) errors.push("two in-process replays differ");

  const pebbles = runHeadless(R, level, withAmmo(sol.shots, "pebble"));
  rep.pebbleCleared = pebbles.cleared;
  if (pebbles.cleared) errors.push("the same aims with pebbles clear the level");
  return rep;
}

/** ملفات JSON في مجلد المستويات، مُحلَّلة بالمخطط */
export function readLevelFiles(): { file: string; level: Level | null; error: string | null }[] {
  return readdirSync(LEVELS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      const parsed = levelSchema.safeParse(JSON.parse(readFileSync(resolve(LEVELS_DIR, file), "utf8")));
      return parsed.success ? { file, level: parsed.data, error: null } : { file, level: null, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    });
}

function pad(v: string | number, n: number): string {
  const s = String(v);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

async function main() {
  const update = process.argv.includes("--update");
  const R = await loadRapierNode();
  const files = readLevelFiles();
  let failed = 0;
  const indexed = new Set(LEVELS.map((l) => l.key));
  const rows: LevelReport[] = [];
  for (const { file, level, error } of files) {
    if (!level) {
      console.log(`FAIL ${file}: schema: ${error}`);
      failed++;
      continue;
    }
    const extra: string[] = [];
    if (file !== `${level.key}.json`) extra.push(`file name ${file} != key ${level.key}`);
    if (!indexed.has(level.key)) extra.push("missing from src/game/levels/index.ts");
    let sol = readSolution(level.key);
    if (update && sol) {
      sol = makeSolution(R, level, sol.shots);
      writeSolution(sol);
    }
    const rep = checkLevel(R, level, sol, () => performance.now());
    rep.errors.push(...extra);
    rows.push(rep);
  }
  for (const key of indexed) if (!files.some((f) => f.level?.key === key)) (console.log(`FAIL index.ts lists ${key} without a JSON file`), failed++);
  // ترتيب الصعوبة كما في index.ts
  const order = (k: string) => {
    const i = LEVELS.findIndex((l) => l.key === k);
    return i < 0 ? LEVELS.length : i;
  };
  rows.sort((a, b) => order(a.key) - order(b.key));

  const head = ["", "key", "tier", "bodies", "lanterns", "par", "slots", "opening", "miss", "ref", "pebbles", "ms"];
  const widths = [5, 16, 5, 7, 9, 4, 6, 8, 5, 4, 8, 6];
  console.log(head.map((h, i) => pad(h, widths[i])).join(" "));
  for (const r of rows) {
    const ok = r.errors.length === 0;
    if (!ok) failed++;
    const cells = [ok ? "ok" : "FAIL", r.key, r.tier, r.bodies, r.lanterns, r.par, r.slots, r.openingSteps, r.missFreed, r.refShots, r.pebbleCleared ? "CLEAR" : "no", r.replayMs.toFixed(0)];
    console.log(`${cells.map((c, i) => pad(c, widths[i])).join(" ")} ${r.title}`);
    for (const e of r.errors) console.log(`      - ${e}`);
  }
  console.log(failed ? `\n${failed} failure(s)` : `\nall ${rows.length} levels ok${update ? " (fixtures rewritten)" : ""}`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && /validate-levels\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
