/**
 * مستويات MVP-A (GAME_DESIGN.md §2 و§5 و§12): كل تصميم يطابق المخطط وقواعد التصميم، ويستقر في الافتتاح،
 * ولا تحرر الرمية الضائعة شيئًا، ويحله حله المرجعي بالشهب ضمن par ببصمات ذهبية ثابتة (في العملية نفسها وفي عملية جديدة)،
 * ولا تحله الرميات نفسها بالحصى.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runHeadless } from "@/game/core/headless";
import { levelSchema } from "@/game/core/level-schema";
import { createSim } from "@/game/core/sim";
import { LANTERN_SIZE, LEVEL_LIMITS, QUIET } from "@/game/core/world";
import { getLevel, LEVELS } from "@/game/levels";
import { loadRapierNode } from "@/game/physics/rapier-node";
import type { Rapier } from "@/game/physics/types";
import { ISLAND_CM, LEVELS_DIR, MISS_SHOT, readSolution, withAmmo } from "../../../scripts/validate-levels";

const ROOT = resolve(__dirname, "../../..");

let R: Rapier;
const report: { key: string; title: string; tier: number; bodies: number; lanterns: number; par: number; slots: number; shots: number; replayMs: number }[] = [];

beforeAll(async () => {
  R = await loadRapierNode();
}, 60_000);

afterAll(() => {
  if (report.length) console.table(report);
});

describe("level files", () => {
  it("eight levels, two per tier 1..4, in order of difficulty", () => {
    expect(LEVELS).toHaveLength(8);
    expect(LEVELS.map((l) => l.tier)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(new Set(LEVELS.map((l) => l.key)).size).toBe(8);
  }, 10_000);

  it("every JSON file parses with the schema and is listed in index.ts", () => {
    const files = readdirSync(LEVELS_DIR).filter((f) => f.endsWith(".json"));
    expect(files.sort()).toEqual(LEVELS.map((l) => `${l.key}.json`).sort());
    for (const f of files) {
      const parsed = levelSchema.parse(JSON.parse(readFileSync(resolve(LEVELS_DIR, f), "utf8")));
      expect(getLevel(parsed.key)).toEqual(parsed);
    }
    expect(getLevel("no-such-level")).toBeNull();
    expect(Object.isFrozen(LEVELS) && Object.isFrozen(LEVELS[0]) && Object.isFrozen(LEVELS[0].bodies[0])).toBe(true);
  }, 10_000);

  it("coral stone appears in at least two levels", () => {
    expect(LEVELS.filter((l) => l.bodies.some((b) => b.m === "stone")).length).toBeGreaterThanOrEqual(2);
  }, 10_000);
});

for (const level of LEVELS) {
  describe(`${level.key} (tier ${level.tier})`, () => {
    const sol = readSolution(level.key);

    it("follows the design rules (§2, §12)", () => {
      expect(level.streakReward).toBe("heavy");
      expect(level.slots).toBeGreaterThanOrEqual(4);
      expect(level.slots).toBeLessThanOrEqual(6);
      expect(level.par).toBeLessThanOrEqual(level.slots + 1);
      expect(level.bodies.length).toBeLessThanOrEqual(LEVEL_LIMITS.maxBodies);
      expect(level.lanterns.length).toBeGreaterThanOrEqual(1);
      expect(level.lanterns.length).toBeLessThanOrEqual(LEVEL_LIMITS.maxLanterns);
      for (const b of level.bodies) {
        expect(Math.abs(b.x) + b.w / 2).toBeLessThanOrEqual(ISLAND_CM.x);
        expect(Math.abs(b.z) + b.d / 2).toBeLessThanOrEqual(ISLAND_CM.z);
      }
      for (const l of level.lanterns) {
        expect(Math.abs(l.x) + LANTERN_SIZE.w / 2).toBeLessThanOrEqual(ISLAND_CM.x);
        expect(Math.abs(l.z) + LANTERN_SIZE.d / 2).toBeLessThanOrEqual(ISLAND_CM.z);
      }
    }, 10_000);

    it("reference solution clears within par with the golden hashes, meteors only", () => {
      expect(sol, `missing tests/fixtures/game-solutions/${level.key}.json`).not.toBeNull();
      const s = sol!;
      expect(s.key).toBe(level.key);
      expect(s.version).toBe(level.version);
      s.shots.forEach((shot, i) => expect(shot).toEqual({ idx: i, ammo: "meteor", yawStep: shot.yawStep, angleStep: shot.angleStep, powerStep: shot.powerStep, activateAt: -1 }));
      const r = runHeadless(R, level, s.shots, () => performance.now());
      expect(r.hashes).toEqual(s.hashes);
      expect(r.finalHash).toBe(s.finalHash);
      expect(r.cleared).toBe(true);
      expect(r.clearedAfterShot).toBe(s.shots.length - 1);
      expect(s.clearedAfterShot).toBe(s.shots.length - 1);
      expect(s.shots.length).toBeLessThanOrEqual(level.par);
      // par = طول الحل المرجعي، +1 لطبقتي البداية
      expect(level.par).toBe(s.shots.length + (level.tier <= 2 ? 1 : 0));
      expect(r.ms).toBeLessThan(500);
      report.push({
        key: level.key,
        title: level.title,
        tier: level.tier,
        bodies: level.bodies.length,
        lanterns: level.lanterns.length,
        par: level.par,
        slots: level.slots,
        shots: s.shots.length,
        replayMs: Math.round(r.ms),
      });
    }, 30_000);

    it("three in-process runs give identical hashes", () => {
      const runs = [0, 1, 2].map(() => runHeadless(R, level, sol!.shots).hashes.join());
      expect(new Set(runs).size).toBe(1);
      expect(runs[0]).toBe(sol!.hashes.join());
    }, 30_000);

    it("settles in the opening, and a miss into the sea frees nothing", () => {
      const sim = createSim(R, level);
      try {
        expect(sim.openingSteps).toBeLessThan(QUIET.maxStepsPerShot);
        expect(sim.freedCount()).toBe(0);
        const r = sim.runShot(MISS_SHOT);
        expect(r.freed).toBe(0);
        expect(r.cleared).toBe(false);
      } finally {
        sim.free();
      }
    }, 30_000);

    it("the same aims fired with pebbles do not clear it", () => {
      const r = runHeadless(R, level, withAmmo(sol!.shots, "pebble"));
      expect(r.cleared).toBe(false);
      expect(r.freed).toBeLessThan(level.lanterns.length);
    }, 30_000);
  });
}

describe("determinism across processes", () => {
  it("a fresh child process prints the golden hashes", () => {
    const loader = pathToFileURL(createRequire(__filename).resolve("tsx")).href;
    const child = spawnSync(process.execPath, ["--import", loader, resolve(__dirname, "determinism-child.ts")], { cwd: ROOT, encoding: "utf8", timeout: 55_000 });
    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    const out = JSON.parse(child.stdout) as Record<string, string[]>;
    expect(Object.keys(out).sort()).toEqual(LEVELS.map((l) => l.key).sort());
    for (const level of LEVELS) expect(out[level.key], level.key).toEqual(readSolution(level.key)!.hashes);
  }, 60_000);
});
