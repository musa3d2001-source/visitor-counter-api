/**
 * القذائف الخاصة (GAME_DESIGN.md §5): النيزك الثقيل وحده يكسر الحجر البحري، والمذنّب ينقسم ثلاثًا بلمسة،
 * ونبضة الفجر تدفع ما حولها. البصمات ذهبية ومقارنة بعملية Node جديدة، فأي تغيير في مسارات التفعيل
 * أو قاعدة الحجر يُكتشف هنا (قبلها كانت الحلول المرجعية كلها بالشهب فلا تختبر هذه المسارات).
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { runHeadless } from "@/game/core/headless";
import { createSim } from "@/game/core/sim";
import { QUIET } from "@/game/core/world";
import { loadRapierNode } from "@/game/physics/rapier-node";
import type { Rapier } from "@/game/physics/types";
import { AMMO_LEVEL, SCENARIOS, STONE_INDEX } from "./ammo-scenarios";

/** تُحدَّث فقط عند تغيير مقصود في الفيزياء أو السيناريو، مع ذكر السبب في الالتزام */
const GOLDEN: Record<string, string[]> = {
  heavyStone: ["cddda9ab", "ad6f490c"],
  meteorStone: ["cddda9ab", "a19efff4"],
  cometSplit: ["cddda9ab", "ab989095"],
  cometWhole: ["cddda9ab", "ce4f2841"],
  pulseBurst: ["cddda9ab", "8b2cbfe8"],
  pulseQuiet: ["cddda9ab", "aaf4a47f"],
};

let R: Rapier;
beforeAll(async () => {
  R = await loadRapierNode();
});

/** يطلق طلقة واحدة حتى السكون (القاعدة نفسها في settle) ويعيد أقصى عدد قذائف حية ونتيجة الحجر */
function play(name: string) {
  const sim = createSim(R, AMMO_LEVEL);
  sim.fire(SCENARIOS[name][0]);
  let maxLive = 0;
  let quiet = 0;
  for (let n = 0; n < QUIET.maxStepsPerShot; n++) {
    sim.step();
    maxLive = Math.max(maxLive, sim.bodies.filter((b) => b.kind === "projectile" && b.alive).length);
    quiet = sim.isQuiet() ? quiet + 1 : 0;
    if (quiet >= QUIET.steps) break;
  }
  const out = { maxLive, stoneAlive: sim.bodies[STONE_INDEX].alive, freed: sim.freedCount(), broken: sim.broken, hash: sim.hash() };
  sim.free();
  return out;
}

describe("القذائف الخاصة", () => {
  it("كل سيناريو يطابق بصمته الذهبية", () => {
    for (const [name, shots] of Object.entries(SCENARIOS)) expect(runHeadless(R, AMMO_LEVEL, shots).hashes, name).toEqual(GOLDEN[name]);
  });

  it("النيزك الثقيل يكسر الحجر البحري، والشهاب بالتصويب نفسه لا يكسره", () => {
    expect(play("heavyStone").stoneAlive).toBe(false);
    expect(play("meteorStone").stoneAlive).toBe(true);
  });

  it("المذنّب المفعَّل ينقسم إلى ثلاث قذائف حية، ونتيجته غير المذنّب بلا تفعيل", () => {
    const split = play("cometSplit");
    const whole = play("cometWhole");
    expect(split.maxLive).toBe(3);
    expect(whole.maxLive).toBe(1);
    expect(split.hash).not.toBe(whole.hash);
  });

  it("نبضة الفجر المفعَّلة قرب الهدف تغيّر النتيجة (تحرر قنديلًا إضافيًا هنا)", () => {
    const burst = play("pulseBurst");
    const quiet = play("pulseQuiet");
    expect(burst.hash).not.toBe(quiet.hash);
    expect(burst.freed).toBeGreaterThan(quiet.freed);
  });

  it("المذنّب ينفصل ±12° حول مسار الأصل دون أن يحرفه", () => {
    const sim = createSim(R, AMMO_LEVEL);
    const shot = SCENARIOS.cometSplit[0];
    sim.fire(shot);
    for (let n = 0; n < shot.activateAt - 1; n++) sim.step();
    const before = sim.leadProjectile()!;
    for (let n = 0; n < 3; n++) sim.step();
    const [lead, a, b] = sim.bodies.filter((x) => x.kind === "projectile" && x.alive).map((x) => x.rb!.linvel());
    // الأصل لا يتغير اتجاهه الأفقي (لا تصادم لحظة الانقسام)
    expect(Math.abs(lead.x / lead.z - before.vx / before.vz)).toBeLessThan(1e-3);
    // القطعتان على جانبي الأصل (حاصل ضرب اتجاهي بإشارتين متعاكستين)
    const side = (v: { x: number; z: number }) => Math.sign(lead.x * v.z - lead.z * v.x);
    expect(side(a) * side(b)).toBe(-1);
    sim.free();
  });

  it("عملية Node جديدة تطبع البصمات الذهبية نفسها", () => {
    const loader = pathToFileURL(createRequire(__filename).resolve("tsx")).href;
    const child = spawnSync(process.execPath, ["--import", loader, resolve(__dirname, "ammo-child.ts")], { cwd: resolve(__dirname, "../../.."), encoding: "utf8", timeout: 55_000 });
    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual(GOLDEN);
  }, 60_000);
});
