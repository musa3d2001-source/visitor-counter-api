/**
 * محرك العميل (src/game/game.ts) والمدخلات (src/game/input):
 *  - createGame بلا canvas يعمل في Node ولا يحمّل three، وبصماته بعد كل رمية تساوي runHeadless (ما يعيده الخادم)
 *    مهما كان حجم دفعات { type: "step" }، ومع التفعيل الحي بلمسة (activateAt = stepInShot + 1).
 *  - settled مرة واحدة لكل رمية، والإطلاق مرفوض أثناء الطيران وبعد cleared، واللقطة لا تُستبدل بلا تغيير.
 *  - الجودة التلقائية: وسيط آخر 120 إطارًا فوق 22 م.ث.
 *  - السحب كالنابض ولوحة المفاتيح تعطي أعدادًا صحيحة محصورة دائمًا.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";

// three لا يُستورد أبدًا بلا canvas: أي استيراد له هنا يفشل الاختبار
vi.mock("three", () => {
  throw new Error("three must not be imported by a headless game");
});

import { ANGLE_STEPS, POWER_STEPS, YAW_CENTER, YAW_STEPS, aimAt } from "@/game/core/aim-table";
import { AMMO } from "@/game/core/ammo";
import { runHeadless } from "@/game/core/headless";
import { parseLevel, type Level } from "@/game/core/level-schema";
import { createSim, type Shot } from "@/game/core/sim";
import { LAUNCH, QUIET } from "@/game/core/world";
import { AUTO_QUALITY, createFrameMonitor, createGame, type EngineEvents, type Game } from "@/game/game";
import { dragToAim, isDrag, keyToCommand, nudgeAim, targetHandlesKey } from "@/game/input";
import { LEVELS } from "@/game/levels";
import { loadRapierNode } from "@/game/physics/rapier-node";
import type { Rapier } from "@/game/physics/types";

/** تصميم صغير يغطي الخامات كلها تقريبًا، ويتحرر بالرمية الثالثة (مقيس بـ runHeadless) */
const LEVEL: Level = parseLevel({
  key: "engine-test",
  title: "اختبار المحرك",
  version: 1,
  tier: 1,
  slots: 4,
  par: 3,
  streakReward: "heavy",
  bodies: [
    { m: "stone", x: 0, y: 20, z: 0, w: 120, h: 40, d: 60 },
    { m: "teak", x: -40, y: 80, z: 0, w: 20, h: 80, d: 20 },
    { m: "teak", x: 40, y: 80, z: 0, w: 20, h: 80, d: 20 },
    { m: "glass", x: 0, y: 130, z: 0, w: 120, h: 20, d: 60 },
    { m: "frond", x: 0, y: 165, z: 0, w: 30, h: 50, d: 30 },
    { m: "lightbox", x: 150, y: 30, z: -40, w: 60, h: 60, d: 60 },
  ],
  lanterns: [
    { x: 0, y: 220, z: 0 },
    { x: 150, y: 90, z: -40 },
    { x: -150, y: 30, z: 20 },
  ],
});

const at = (x: number, y: number, z: number, k = 1) => aimAt(LAUNCH, { x, y, z }, { speedScale: k });
/** ثلاث رميات تحرر القناديل كلها: شهاب، ثم نيزك ثقيل، ثم مذنّب ينقسم في الخطوة 30 */
const SHOTS: Shot[] = [
  { idx: 0, ammo: "meteor", ...at(0, 1.6, 0), activateAt: -1 },
  { idx: 1, ammo: "heavy", ...at(1.5, 0.5, -0.4, AMMO.heavy.speedScale), activateAt: -1 },
  { idx: 2, ammo: "comet", ...at(-1.5, 0.4, 0.2), activateAt: 30 },
];

let R: Rapier;
beforeAll(async () => {
  R = await loadRapierNode();
});

type Settled = EngineEvents["settled"];

/** يطلق ثم يخطو بدفعات حتى settled؛ يعيد الحدث */
function playShot(game: Game, shot: Shot, chunk: number): Settled {
  let got: Settled | null = null;
  const off = game.on("settled", (p) => {
    got = p;
  });
  game.dispatch({ type: "fire", shot });
  expect(game.getSnapshot().status).toBe("flight");
  for (let guard = 0; !got && guard < 10_000; guard++) game.dispatch({ type: "step", steps: chunk });
  off();
  expect(got).not.toBeNull();
  return got as unknown as Settled;
}

describe("createGame بلا واجهة = runHeadless", () => {
  it("gives the same hash after every shot, whatever the step batch size", () => {
    const ref = runHeadless(R, LEVEL, SHOTS);
    const opening = createSim(R, LEVEL);
    const openingSteps = opening.openingSteps;
    opening.free();
    expect(ref.cleared).toBe(true);
    expect(ref.clearedAfterShot).toBe(2);
    expect(ref.broken).toBeGreaterThan(0);
    for (const chunk of [1, 7, 64, QUIET.maxStepsPerShot]) {
      const game = createGame({ R, level: LEVEL, seed: 7 });
      expect(game.getSnapshot()).toMatchObject({ status: "aim", shotsFired: 0, freed: 0, lanterns: 3, cleared: false, lastHash: null, quality: "high" });
      const hashes: string[] = [];
      let steps = 0;
      SHOTS.forEach((s) => {
        const ev = playShot(game, s, chunk);
        expect(ev.shot).toEqual(s);
        hashes.push(ev.hash);
        steps += ev.steps;
        expect(ev.steps).toBeLessThanOrEqual(QUIET.maxStepsPerShot);
        expect(game.getSnapshot().lastHash).toBe(ev.hash);
        expect(game.getSnapshot().status).toBe("settled");
      });
      expect(hashes).toEqual(ref.hashes.slice(1));
      const snap = game.getSnapshot();
      expect(snap).toMatchObject({ shotsFired: 3, freed: ref.freed, broken: ref.broken, cleared: true });
      // خطوات الرميات = كل خطوات الخادم ناقص الافتتاح
      expect(steps).toBe(ref.steps - openingSteps);
      game.destroy();
    }
  });

  it("records a live tap as activateAt = stepInShot + 1, and that shot replays to the same hash", () => {
    const game = createGame({ R, level: LEVEL, seed: 1 });
    playShot(game, SHOTS[0], 50);
    playShot(game, SHOTS[1], 50);
    const activations: number[] = [];
    game.on("activated", (p) => activations.push(p.step));
    let settled: Settled | null = null;
    game.on("settled", (p) => {
      settled = p;
    });
    game.dispatch({ type: "fire", shot: { ...SHOTS[2], activateAt: -1 } });
    expect(game.getSnapshot().activatable).toBe(true);
    game.dispatch({ type: "step", steps: 29 });
    game.dispatch({ type: "activate" });
    game.dispatch({ type: "activate" }); // اللمسة الثانية لا أثر لها
    expect(activations).toEqual([30]);
    expect(game.getSnapshot().activatable).toBe(false);
    while (!settled) game.dispatch({ type: "step", steps: 100 });
    const ev = settled as unknown as Settled;
    expect(ev.shot.activateAt).toBe(30);
    const ref = runHeadless(R, LEVEL, [SHOTS[0], SHOTS[1], ev.shot]);
    expect(ev.hash).toBe(ref.hashes[3]);
    expect(ev.hash).toBe(runHeadless(R, LEVEL, SHOTS).hashes[3]);
    game.destroy();
  });

  it("emits settled exactly once per shot, rejects fire in flight and after cleared, and keeps the snapshot object stable", () => {
    const game = createGame({ R, level: LEVEL, seed: 3 });
    const settled: Settled[] = [];
    game.on("settled", (p) => settled.push(p));
    let notified = 0;
    const unsub = game.subscribe(() => notified++);

    // لا تغيير ← اللقطة نفسها، ولا إشعار
    const s0 = game.getSnapshot();
    expect(game.getSnapshot()).toBe(s0);
    game.dispatch({ type: "aim", ...s0.aim });
    expect(game.getSnapshot()).toBe(s0);
    expect(notified).toBe(0);
    game.dispatch({ type: "setDawn", progress: 0.5 }); // عرض فقط
    expect(game.getSnapshot()).toBe(s0);

    // التصويب يُحصر أعدادًا صحيحة
    game.dispatch({ type: "aim", yawStep: 99, angleStep: -4, powerStep: 12.9 });
    const s1 = game.getSnapshot();
    expect(s1).not.toBe(s0);
    expect(s1.aim).toEqual({ yawStep: YAW_STEPS, angleStep: 0, powerStep: 12 });
    expect(notified).toBe(1);

    game.dispatch({ type: "fire", shot: SHOTS[0] });
    expect(game.getSnapshot().aim).toEqual({ yawStep: SHOTS[0].yawStep, angleStep: SHOTS[0].angleStep, powerStep: SHOTS[0].powerStep });
    const inFlight = game.getSnapshot();
    game.dispatch({ type: "fire", shot: SHOTS[1] }); // مرفوض أثناء الطيران
    expect(game.getSnapshot().shotsFired).toBe(1);
    expect(game.getSnapshot()).toBe(inFlight);
    // الإيقاف لا يمس الخطوات اليدوية ولا البصمة
    game.dispatch({ type: "pause" });
    game.dispatch({ type: "step", steps: QUIET.maxStepsPerShot * 2 });
    game.dispatch({ type: "resume" });
    game.dispatch({ type: "step", steps: 500 }); // بعد السكون: لا خطوات
    expect(settled).toHaveLength(1);

    // إطلاقات غير صالحة تُتجاهل
    game.dispatch({ type: "fire", shot: { ...SHOTS[1], ammo: "laser" as never } });
    game.dispatch({ type: "fire", shot: { ...SHOTS[1], activateAt: 2.5 } });
    game.dispatch({ type: "fire", shot: { ...SHOTS[1], idx: -1 } });
    expect(game.getSnapshot().shotsFired).toBe(1);
    expect(game.getSnapshot().status).toBe("settled");
    game.dispatch({ type: "aim", ...game.getSnapshot().aim });
    expect(game.getSnapshot().status).toBe("aim");

    playShot(game, SHOTS[1], 30);
    playShot(game, SHOTS[2], 30);
    expect(settled).toHaveLength(3);
    expect(settled[2].cleared).toBe(true);
    // بعد تحرر كل القناديل تُرفض الرميات
    const done = game.getSnapshot();
    game.dispatch({ type: "fire", shot: { idx: 3, ammo: "pebble", yawStep: YAW_CENTER, angleStep: 16, powerStep: 15, activateAt: -1 } });
    expect(game.getSnapshot()).toBe(done);
    expect(done).toMatchObject({ cleared: true, freed: 3, shotsFired: 3, activatable: false });
    expect(Object.isFrozen(done)).toBe(true);

    unsub();
    const before = notified;
    game.dispatch({ type: "setQuality", quality: "low" });
    expect(game.getSnapshot().quality).toBe("low");
    expect(notified).toBe(before);

    game.destroy();
    game.destroy(); // مرتان بلا خطأ (StrictMode)
    game.dispatch({ type: "fire", shot: SHOTS[0] });
    expect(game.getSnapshot()).toMatchObject({ shotsFired: 3, quality: "low" });
  });
});

describe("التصاميم الحقيقية بحلولها المرجعية", () => {
  const dir = fileURLToPath(new URL("../../fixtures/game-solutions/", import.meta.url));
  const cases = LEVELS.map((l) => ({ level: l, file: `${dir}${l.key}.json` })).filter((c) => existsSync(c.file));

  it("the engine replays every reference solution to the same hashes as runHeadless", () => {
    expect(cases.length).toBeGreaterThan(0);
    for (const { level, file } of cases) {
      const shots = (JSON.parse(readFileSync(file, "utf8")) as { shots: Shot[] }).shots;
      const ref = runHeadless(R, level, shots);
      const game = createGame({ R, level, seed: 11 });
      const hashes: string[] = [];
      for (const s of shots) {
        if (game.getSnapshot().cleared) break;
        hashes.push(playShot(game, s, 13).hash);
      }
      expect({ key: level.key, hashes }).toEqual({ key: level.key, hashes: ref.hashes.slice(1, 1 + hashes.length) });
      expect(game.getSnapshot().cleared).toBe(ref.cleared);
      game.destroy();
    }
  });
});

describe("الجودة التلقائية", () => {
  it("drops only when the median of the last 120 frames exceeds 22 ms", () => {
    expect(AUTO_QUALITY).toMatchObject({ frames: 120, medianMs: 22 });
    const m = createFrameMonitor();
    for (let i = 0; i < 119; i++) m.push(30);
    expect(m.overBudget()).toBe(false); // النافذة لم تمتلئ
    m.push(30);
    expect(m.overBudget()).toBe(true);
    m.reset();
    // 70 إطارًا سريعًا و 50 بطيئًا: الوسيط سريع
    for (let i = 0; i < 70; i++) m.push(16);
    for (let i = 0; i < 50; i++) m.push(40);
    expect(m.median()).toBe(16);
    expect(m.overBudget()).toBe(false);
    // نافذة منزلقة: 120 إطارًا بطيئًا جديدًا تطرد القديمة
    for (let i = 0; i < 120; i++) m.push(23);
    expect(m.median()).toBe(23);
    expect(m.overBudget()).toBe(true);
    m.push(Number.NaN);
    m.push(-5);
    expect(m.count).toBe(120);
  });
});

describe("السحب كالنابض", () => {
  const vp = { w: 390, h: 844 };
  const start = { yawStep: 20, angleStep: 18, powerStep: 16 };

  it("pulling down (toward the player) adds power, pushing up removes it", () => {
    expect(dragToAim(start, 0, 0, vp)).toEqual(start);
    const down = dragToAim(start, 0, 60, vp);
    expect(down.powerStep).toBeGreaterThan(start.powerStep);
    expect(down.yawStep).toBe(start.yawStep);
    expect(down.angleStep).toBe(start.angleStep);
    expect(dragToAim(start, 0, -60, vp).powerStep).toBeLessThan(start.powerStep);
  });

  it("horizontal drag turns the launcher the opposite way, like a spring", () => {
    expect(dragToAim(start, 80, 0, vp).yawStep).toBeLessThan(start.yawStep);
    expect(dragToAim(start, -80, 0, vp).yawStep).toBeGreaterThan(start.yawStep);
    // نصف مدى السحب ≈ نصف مدى الاتجاه
    expect(dragToAim(start, -0.45 * 390, 0, vp).yawStep).toBe(start.yawStep + YAW_STEPS / 2);
  });

  it("always returns integers clamped to the step ranges", () => {
    const cases: [number, number][] = [
      [1e6, 1e6],
      [-1e6, -1e6],
      [3.3, 7.7],
      [Number.NaN, Number.POSITIVE_INFINITY],
      [-0.2, -0.2],
    ];
    for (const [dx, dy] of cases) {
      for (const vpx of [vp, { w: 1440, h: 900 }, { w: 0, h: 0 }]) {
        const a = dragToAim({ yawStep: 40.7, angleStep: 99, powerStep: -3 }, dx, dy, vpx);
        for (const [v, max] of [
          [a.yawStep, YAW_STEPS],
          [a.angleStep, ANGLE_STEPS],
          [a.powerStep, POWER_STEPS],
        ] as const) {
          expect(Number.isInteger(v)).toBe(true);
          expect(Object.is(v, -0)).toBe(false);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(max);
        }
      }
    }
    expect(dragToAim(start, 1e6, 1e6, vp)).toEqual({ yawStep: 0, angleStep: 18, powerStep: POWER_STEPS });
    expect(dragToAim({ yawStep: Number.NaN, angleStep: 10, powerStep: 10 }, 0, 0, vp).yawStep).toBe(YAW_CENTER);
  });

  it("tells a tap from a drag", () => {
    expect(isDrag(3, 4)).toBe(false);
    expect(isDrag(8, 0)).toBe(true);
  });
});

describe("لوحة المفاتيح", () => {
  const aim = { yawStep: 20, angleStep: 18, powerStep: 16 };

  it("maps arrows, PageUp/PageDown, Space and digits to commands", () => {
    expect(keyToCommand({ code: "ArrowRight" }, aim)).toEqual({ type: "aim", yawStep: 21, angleStep: 18, powerStep: 16 });
    expect(keyToCommand({ code: "ArrowLeft" }, aim)).toEqual({ type: "aim", yawStep: 19, angleStep: 18, powerStep: 16 });
    expect(keyToCommand({ code: "ArrowUp" }, aim)).toEqual({ type: "aim", yawStep: 20, angleStep: 19, powerStep: 16 });
    expect(keyToCommand({ key: "ArrowDown" }, aim)).toEqual({ type: "aim", yawStep: 20, angleStep: 17, powerStep: 16 });
    expect(keyToCommand({ code: "PageUp" }, aim)).toEqual({ type: "aim", yawStep: 20, angleStep: 18, powerStep: 17 });
    expect(keyToCommand({ code: "PageDown", shiftKey: true }, aim)).toEqual({ type: "aim", yawStep: 20, angleStep: 18, powerStep: 11 });
    expect(keyToCommand({ code: "Space", key: " " }, aim)).toEqual({ type: "fire" });
    expect(keyToCommand({ code: "Space", repeat: true }, aim)).toBeNull();
    expect(keyToCommand({ code: "Digit1" }, aim)).toEqual({ type: "answer", choice: 0 });
    expect(keyToCommand({ code: "Numpad4" }, aim)).toEqual({ type: "answer", choice: 3 });
    expect(keyToCommand({ key: "٣" }, aim)).toEqual({ type: "answer", choice: 2 });
    expect(keyToCommand({ code: "Digit5" }, aim)).toBeNull();
    expect(keyToCommand({ code: "KeyA" }, aim)).toBeNull();
    expect(keyToCommand({ code: "ArrowUp", ctrlKey: true }, aim)).toBeNull();
  });

  it("clamps at the ends of every range", () => {
    expect(keyToCommand({ code: "ArrowRight", shiftKey: true }, { yawStep: YAW_STEPS - 1, angleStep: 0, powerStep: 0 })).toEqual({ type: "aim", yawStep: YAW_STEPS, angleStep: 0, powerStep: 0 });
    expect(keyToCommand({ code: "ArrowDown" }, { yawStep: 0, angleStep: 0, powerStep: 0 })).toEqual({ type: "aim", yawStep: 0, angleStep: 0, powerStep: 0 });
    expect(nudgeAim({ yawStep: 0, angleStep: ANGLE_STEPS, powerStep: POWER_STEPS }, "power", 9)).toEqual({ yawStep: 0, angleStep: ANGLE_STEPS, powerStep: POWER_STEPS });
  });

  it("leaves keys to the focused control that handles them natively", () => {
    const el = (tagName: string, extra: { type?: string; role?: string } = {}) => ({ tagName, type: extra.type, getAttribute: (n: string) => (n === "role" ? (extra.role ?? null) : null) });
    expect(targetHandlesKey(null, { code: "ArrowUp" })).toBe(false);
    expect(targetHandlesKey(el("INPUT", { type: "range" }), { code: "ArrowUp" })).toBe(true);
    expect(targetHandlesKey(el("INPUT", { type: "range" }), { code: "Space" })).toBe(false);
    expect(targetHandlesKey(el("BUTTON"), { code: "Space" })).toBe(true);
    expect(targetHandlesKey(el("BUTTON"), { code: "ArrowUp" })).toBe(false);
    expect(targetHandlesKey(el("DIV", { role: "slider" }), { code: "PageUp" })).toBe(true);
    expect(targetHandlesKey(el("INPUT", { type: "text" }), { code: "Digit1" })).toBe(true);
    expect(targetHandlesKey(el("DIV"), { code: "Space" })).toBe(false);
  });
});
