/**
 * جلسة الجولة (src/game/session، GAME_DESIGN.md §6): آلة الحالات النقية التي يشترك فيها العميل والخادم.
 * كل حدث مقبول في هذا الملف يمر عبر apply()، فيُجمَّد الدخل ويُقارن قبل الحدث وبعده: النقاء مُختبَر في كل خطوة.
 */
import { describe, expect, it } from "vitest";
import type { AmmoKey } from "@/game/core/ammo";
import type { Shot } from "@/game/core/sim";
import { runStars, STAR } from "@/game/rules";
import {
  availableAmmo,
  canRequestChallenge,
  canSkip,
  createSession,
  reduce,
  reduceAll,
  remainingSlots,
  type Effect,
  type ReduceResult,
  type RejectReason,
  type SessionConfig,
  type SessionEvent,
  type SessionState,
} from "@/game/session";

const SCENE: SessionConfig = { mode: "scene", slots: 5, par: 3, streakReward: "heavy", failStreak: 0, allowSpecials: true };
const cfg = (over: Partial<SessionConfig> = {}): SessionConfig => ({ ...SCENE, ...over });

function shot(idx: number, ammo: AmmoKey, over: Partial<Shot> = {}): Shot {
  return { idx, ammo, yawStep: 20, angleStep: 18, powerStep: 24, activateAt: -1, ...over };
}

function deepFreeze<T>(v: T): T {
  if (typeof v === "object" && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

/** الحدث مقبول، والحالة الواردة (مجمَّدة) لم تتغير */
function apply(s: SessionState, e: SessionEvent): ReduceResult {
  const before = structuredClone(s);
  deepFreeze(s);
  deepFreeze(e);
  const r = reduce(s, e);
  expect(s).toEqual(before);
  expect(r.effects.filter((x) => x.type === "rejected")).toEqual([]);
  return r;
}

/** الحدث مرفوض: الحالة نفسها (المرجع نفسه) وأثر واحد بسببه */
function refuse(s: SessionState, e: SessionEvent, reason: RejectReason): void {
  const before = structuredClone(s);
  deepFreeze(s);
  const r = reduce(s, e);
  expect(r.state).toBe(s);
  expect(r.effects).toEqual([{ type: "rejected", reason }]);
  expect(s).toEqual(before);
}

/** يعرض سؤالًا (أو تحديًا مطلوبًا) ويجيب عنه */
function answer(s: SessionState, correct: boolean): ReduceResult {
  const attemptId = `att-${s.answered}-${s.nextIdx}`;
  const shown = apply(s, { type: "questionShown", attemptId, isChallenge: s.challengePending });
  expect(shown.effects).toEqual([]);
  return apply(shown.state, { type: "answered", attemptId, correct });
}

/** رمية بالقذيفة الجاهزة (أو ammo) ثم السكون */
function shoot(s: SessionState, cleared = false, ammo?: AmmoKey): ReduceResult {
  const fired = apply(s, { type: "fired", shot: shot(s.nextIdx, ammo ?? (s.readyAmmo as AmmoKey)) });
  expect(fired.state.phase).toBe("flight");
  return apply(fired.state, { type: "settled", cleared });
}

/** بداية الجولة ورمية الافتتاح */
function opening(c: SessionConfig = SCENE, cleared = false): ReduceResult {
  const begun = apply(createSession(c), { type: "begin" });
  return shoot(begun.state, cleared);
}

/** خانة كاملة: سؤال ثم رمية */
function slot(s: SessionState, correct: boolean, cleared = false): ReduceResult {
  return shoot(answer(s, correct).state, cleared);
}

const finishOf = (r: ReduceResult) => r.effects.find((x): x is Extract<Effect, { type: "finish" }> => x.type === "finish");

describe("الافتتاح (§6.2)", () => {
  it("createSession starts in opening with the level's slots", () => {
    const s = createSession(SCENE);
    expect(s.phase).toBe("opening");
    expect(s.slots).toBe(5);
    expect(s.nextIdx).toBe(0);
    expect(s.slotsUsed).toBe(0);
    expect(s.readyAmmo).toBeNull();
    expect(s.shots).toEqual([]);
    expect(s.streak).toEqual({ streak: 0, stored: [] });
  });

  it("begin readies a free meteor at idx 0, and only once", () => {
    const r = apply(createSession(SCENE), { type: "begin" });
    expect(r.state.phase).toBe("aim");
    expect(r.state.readyAmmo).toBe("meteor");
    expect(r.effects).toEqual([{ type: "readyAmmo", ammo: "meteor" }]);
    refuse(r.state, { type: "begin" }, "wrong_phase");
  });

  it("the opening shot is free: slotsUsed stays 0, and the first question follows", () => {
    const begun = apply(createSession(SCENE), { type: "begin" }).state;
    const fired = apply(begun, { type: "fired", shot: shot(0, "meteor") });
    expect(fired.effects).toEqual([]);
    expect(fired.state).toMatchObject({ phase: "flight", nextIdx: 1, slotsUsed: 0, readyAmmo: null });
    expect(fired.state.shots).toEqual([shot(0, "meteor")]);
    const settled = apply(fired.state, { type: "settled", cleared: false });
    expect(settled.state.phase).toBe("question");
    expect(settled.state.slotsUsed).toBe(0);
    expect(remainingSlots(settled.state)).toBe(5);
    expect(settled.effects).toEqual([{ type: "requestQuestion", challenge: false }]);
  });

  it("events out of order are rejected without touching the state", () => {
    const s = createSession(SCENE);
    refuse(s, { type: "fired", shot: shot(0, "meteor") }, "wrong_phase");
    refuse(s, { type: "settled", cleared: false }, "wrong_phase");
    refuse(s, { type: "questionShown", attemptId: "a", isChallenge: false }, "wrong_phase");
    refuse(s, { type: "answered", attemptId: "a", correct: true }, "wrong_phase");
    refuse(s, { type: "skipSunrise" }, "wrong_phase");
    refuse(s, { type: "challengeRequested" }, "wrong_phase");
    refuse(s, { type: "teleport" } as unknown as SessionEvent, "invalid_event");
    refuse(s, null as unknown as SessionEvent, "invalid_event");
  });
});

describe("كل خانة سؤال ثم رمية (§6.3)", () => {
  it("a wrong answer readies a pebble, a correct one a meteor", () => {
    const q = opening().state;
    const wrong = answer(q, false);
    expect(wrong.state).toMatchObject({ phase: "aim", readyAmmo: "pebble", answered: 1, correct: 0 });
    expect(wrong.effects).toEqual([{ type: "readyAmmo", ammo: "pebble" }]);
    const right = answer(q, true);
    expect(right.state).toMatchObject({ phase: "aim", readyAmmo: "meteor", answered: 1, correct: 1 });
    expect(right.effects).toEqual([{ type: "readyAmmo", ammo: "meteor" }]);
  });

  it("each slot shot consumes a slot; the pebble shot is recorded as a pebble", () => {
    const after = slot(opening().state, false).state;
    expect(after).toMatchObject({ phase: "question", nextIdx: 2, slotsUsed: 1 });
    expect(after.shots.map((x) => x.ammo)).toEqual(["meteor", "pebble"]);
    expect(remainingSlots(after)).toBe(4);
  });

  it("answers need the shown question and its exact attempt id", () => {
    const q = opening().state;
    refuse(q, { type: "answered", attemptId: "a", correct: true }, "no_question");
    const shown = apply(q, { type: "questionShown", attemptId: "a", isChallenge: false }).state;
    expect(shown.pendingAttemptId).toBe("a");
    refuse(shown, { type: "questionShown", attemptId: "b", isChallenge: false }, "question_pending");
    refuse(shown, { type: "answered", attemptId: "b", correct: true }, "attempt_mismatch");
    refuse(shown, { type: "answered", attemptId: "a", correct: "yes" } as unknown as SessionEvent, "invalid_event");
    refuse(shown, { type: "fired", shot: shot(1, "meteor") }, "wrong_phase");
    refuse(q, { type: "questionShown", attemptId: "", isChallenge: false }, "invalid_event");
    const done = apply(shown, { type: "answered", attemptId: "a", correct: true }).state;
    expect(done.pendingAttemptId).toBeNull();
    refuse(done, { type: "answered", attemptId: "a", correct: true }, "wrong_phase");
  });
});

describe("القذيفة الخاصة (§6.4)", () => {
  it("three correct slot answers in a row grant the level's special, and the streak restarts", () => {
    let s = opening().state;
    s = slot(s, true).state;
    s = slot(s, true).state;
    const third = answer(s, true);
    expect(third.effects).toEqual([
      { type: "readyAmmo", ammo: "meteor" },
      { type: "specialGranted", ammo: "heavy" },
    ]);
    expect(third.state.streak).toEqual({ streak: 0, stored: ["heavy"] });
    expect(availableAmmo(third.state)).toEqual(["meteor", "heavy"]);
  });

  it("a wrong answer resets the count", () => {
    let s = opening(cfg({ slots: 8 })).state;
    for (const c of [true, true, false, true, true]) s = slot(s, c).state;
    expect(s.streak).toEqual({ streak: 2, stored: [] });
    const r = answer(s, true);
    expect(r.effects).toContainEqual({ type: "specialGranted", ammo: "heavy" });
  });

  it("at most two are stored: the third grant is lost and the count still restarts", () => {
    let s = opening(cfg({ slots: 10 })).state;
    const granted: number[] = [];
    for (let i = 1; i <= 9; i++) {
      const r = answer(s, true);
      if (r.effects.some((x) => x.type === "specialGranted")) granted.push(i);
      s = shoot(r.state).state;
    }
    expect(granted).toEqual([3, 6]);
    expect(s.streak).toEqual({ streak: 0, stored: ["heavy", "heavy"] });
  });

  it("no specials for an age profile without them", () => {
    let s = opening(cfg({ allowSpecials: false })).state;
    s = slot(s, true).state;
    s = slot(s, true).state;
    const r = answer(s, true);
    expect(r.effects).toEqual([{ type: "readyAmmo", ammo: "meteor" }]);
    expect(r.state.streak).toEqual({ streak: 0, stored: [] });
  });

  it("using a special replaces the slot's ammo and adds no shot", () => {
    let s = opening().state;
    s = slot(s, true).state;
    s = slot(s, true).state;
    const aim = answer(s, true).state;
    expect(aim).toMatchObject({ readyAmmo: "meteor", nextIdx: 3, slotsUsed: 2 });
    const fired = apply(aim, { type: "fired", shot: shot(3, "heavy") }).state;
    expect(fired).toMatchObject({ phase: "flight", nextIdx: 4, slotsUsed: 3, readyAmmo: null });
    expect(fired.shots).toHaveLength(4);
    expect(fired.shots[3].ammo).toBe("heavy");
    expect(fired.streak.stored).toEqual([]);
    // الخاصة استُهلكت: الخانة التالية لا تقبلها
    const next = answer(apply(fired, { type: "settled", cleared: false }).state, true).state;
    refuse(next, { type: "fired", shot: shot(4, "heavy") }, "wrong_ammo");
  });

  it("a stored special can replace a pebble too", () => {
    let s = opening().state;
    s = slot(s, true).state;
    s = slot(s, true).state;
    s = slot(s, true).state; // الخاصة مخزّنة ولم تُستعمل
    const pebbleReady = answer(s, false).state;
    expect(pebbleReady.readyAmmo).toBe("pebble");
    expect(availableAmmo(pebbleReady)).toEqual(["pebble", "heavy"]);
    const fired = apply(pebbleReady, { type: "fired", shot: shot(4, "heavy") }).state;
    expect(fired.shots.map((x) => x.ammo)).toEqual(["meteor", "meteor", "meteor", "meteor", "heavy"]);
    expect(fired.streak.stored).toEqual([]);
  });

  it("the touch step of an activatable special is recorded at settle, once", () => {
    let s = opening(cfg({ streakReward: "comet" })).state;
    s = slot(s, true).state;
    s = slot(s, true).state;
    const aim = answer(s, true).state;
    const flight = apply(aim, { type: "fired", shot: shot(3, "comet") }).state;
    refuse(flight, { type: "settled", cleared: false, activateAt: 901 }, "invalid_activation");
    refuse(flight, { type: "settled", cleared: false, activateAt: 2.5 }, "invalid_activation");
    const settled = apply(flight, { type: "settled", cleared: false, activateAt: 12 }).state;
    expect(settled.shots[3]).toEqual(shot(3, "comet", { activateAt: 12 }));
    // طلقة أُرسلت بتفعيلها: settled بالقيمة نفسها مقبول، وبغيرها مرفوض
    const known = apply(aim, { type: "fired", shot: shot(3, "comet", { activateAt: 7 }) }).state;
    refuse(known, { type: "settled", cleared: false, activateAt: 9 }, "invalid_activation");
    expect(apply(known, { type: "settled", cleared: false, activateAt: 7 }).state.shots[3].activateAt).toBe(7);
    // الشهاب لا يُفعَّل
    const meteor = apply(answer(settled, true).state, { type: "fired", shot: shot(4, "meteor") }).state;
    refuse(meteor, { type: "settled", cleared: false, activateAt: 5 }, "invalid_activation");
  });
});

describe("التحقق من الرمية", () => {
  const aim = () => apply(createSession(SCENE), { type: "begin" }).state;

  it("rejects a wrong idx", () => {
    const s = aim();
    for (const idx of [1, -1, 0.5, Number.NaN]) refuse(s, { type: "fired", shot: shot(idx, "meteor") }, "wrong_idx");
  });

  it("rejects ammo that is neither ready nor a stored special", () => {
    const s = aim();
    refuse(s, { type: "fired", shot: shot(0, "pebble") }, "wrong_ammo");
    refuse(s, { type: "fired", shot: shot(0, "heavy") }, "wrong_ammo");
    refuse(s, { type: "fired", shot: shot(0, "comet") }, "wrong_ammo");
    refuse(s, { type: "fired", shot: shot(0, "rocket" as AmmoKey) }, "wrong_ammo");
    const pebble = answer(opening().state, false).state;
    refuse(pebble, { type: "fired", shot: shot(1, "meteor") }, "wrong_ammo");
  });

  it("rejects steps out of range or not integers, and activation on non-activatable ammo", () => {
    const s = aim();
    refuse(s, { type: "fired", shot: shot(0, "meteor", { yawStep: 41 }) }, "invalid_shot");
    refuse(s, { type: "fired", shot: shot(0, "meteor", { angleStep: -1 }) }, "invalid_shot");
    refuse(s, { type: "fired", shot: shot(0, "meteor", { powerStep: 2.5 }) }, "invalid_shot");
    refuse(s, { type: "fired", shot: shot(0, "meteor", { powerStep: 41 }) }, "invalid_shot");
    refuse(s, { type: "fired", shot: shot(0, "meteor", { activateAt: 5 }) }, "invalid_activation");
    refuse(s, { type: "fired", shot: shot(0, "meteor", { activateAt: -2 }) }, "invalid_activation");
    refuse(s, { type: "fired", shot: null as unknown as Shot }, "invalid_shot");
  });

  it("records a copy with the known fields only", () => {
    const sent = { ...shot(0, "meteor", { yawStep: 0, angleStep: 60, powerStep: 40 }), extra: "x" };
    const r = reduce(aim(), { type: "fired", shot: sent });
    sent.yawStep = 33;
    expect(r.state.shots).toEqual([shot(0, "meteor", { yawStep: 0, angleStep: 60, powerStep: 40 })]);
  });
});

describe("cleared والشروق (§6.6 و§6.7)", () => {
  it("cleared moves to sunrise, records the shot, and every later shot is rejected", () => {
    let s = opening().state;
    s = slot(s, true).state;
    const r = slot(s, false, true);
    expect(r.state).toMatchObject({ phase: "sunrise", cleared: true, clearedAfterShot: 2, sunriseTarget: 5, readyAmmo: null });
    expect(r.effects).toEqual([{ type: "requestQuestion", challenge: false }]);
    for (const a of ["meteor", "pebble", "heavy"] as const) refuse(r.state, { type: "fired", shot: shot(3, a) }, "wrong_phase");
    refuse(r.state, { type: "settled", cleared: true }, "wrong_phase");
    refuse(r.state, { type: "challengeRequested" }, "wrong_phase");
  });

  it("sunrise asks the remaining slots: cleared after 2 slots → 3 points questions, 5 in total", () => {
    let s = opening().state;
    s = slot(s, true).state;
    s = slot(s, true, true).state;
    expect(s.answered).toBe(2);
    for (let i = 0; i < 2; i++) {
      const r = answer(s, i === 0);
      expect(r.effects).toEqual([{ type: "requestQuestion", challenge: false }]);
      s = r.state;
    }
    const last = answer(s, true);
    expect(last.state).toMatchObject({ phase: "finished", answered: 5, correct: 4, sunriseAnswered: 3, sunriseCorrect: 2, failed: false });
    expect(finishOf(last)?.summary).toEqual({ mode: "scene", cleared: true, answered: 5, correct: 4, shotsUsed: 3, par: 3 });
  });

  it("with fewer than 5 slots, extra questions follow until the run has 5 answers", () => {
    let s = opening(cfg({ slots: 3, par: 2 }), true).state;
    expect(s.sunriseTarget).toBe(5);
    for (let i = 0; i < 4; i++) {
      s = answer(s, true).state;
      expect(s.phase).toBe("sunrise");
    }
    const r = answer(s, true);
    expect(r.state.phase).toBe("finished");
    expect(finishOf(r)?.summary.answered).toBe(5);
  });

  it("with more slots (failStreak), every remaining slot is a points question", () => {
    let s = opening(cfg({ failStreak: 3 }), true).state;
    expect(s.sunriseTarget).toBe(6);
    for (let i = 0; i < 5; i++) s = answer(s, true).state;
    expect(s.phase).toBe("sunrise");
    expect(answer(s, true).state).toMatchObject({ phase: "finished", answered: 6 });
  });

  it("cleared on the last slot with 5 answers finishes at once, without a sunrise question", () => {
    let s = opening().state;
    for (let i = 0; i < 4; i++) s = slot(s, true).state;
    const r = slot(s, true, true);
    expect(r.state).toMatchObject({ phase: "finished", cleared: true, clearedAfterShot: 5, answered: 5, slotsUsed: 5 });
    expect(r.effects).toHaveLength(1);
    expect(finishOf(r)?.summary).toEqual({ mode: "scene", cleared: true, answered: 5, correct: 5, shotsUsed: 6, par: 3 });
  });
});

describe("التخطي ونجمة الإتمام (§6.7، §7)", () => {
  it("skip is allowed only at 3 answers or more", () => {
    let s = opening(SCENE, true).state;
    for (let i = 0; i < 3; i++) {
      expect(canSkip(s)).toBe(false);
      refuse(s, { type: "skipSunrise" }, "too_few_answers");
      s = answer(s, true).state;
    }
    expect(canSkip(s)).toBe(true);
    const r = apply(s, { type: "skipSunrise" });
    expect(r.state.phase).toBe("finished");
    expect(finishOf(r)?.summary).toEqual({ mode: "scene", cleared: true, answered: 3, correct: 3, shotsUsed: 1, par: 3 });
  });

  it("skip is refused outside sunrise in a scene run", () => {
    let s = opening().state;
    for (let i = 0; i < 3; i++) s = slot(s, true).state;
    expect(s.answered).toBe(3);
    refuse(s, { type: "skipSunrise" }, "wrong_phase");
    refuse(answer(s, true).state, { type: "skipSunrise" }, "wrong_phase");
  });

  it("completion is impossible with fewer than 3 answers: cleared on the opening shot still needs 3 sunrise answers", () => {
    let s = opening(SCENE, true).state;
    expect(s).toMatchObject({ phase: "sunrise", cleared: true, clearedAfterShot: 0, answered: 0 });
    // كل طريق إلى النهاية الطبيعية من هنا يمر بثلاث إجابات على الأقل
    refuse(s, { type: "skipSunrise" }, "too_few_answers");
    s = answer(s, false).state;
    s = answer(s, true).state;
    refuse(s, { type: "skipSunrise" }, "too_few_answers");
    s = answer(s, true).state;
    const r = apply(s, { type: "skipSunrise" });
    const stars = runStars(finishOf(r)!.summary);
    expect(stars.mask & STAR.completion).toBe(STAR.completion);
    expect(stars.mask & STAR.skill).toBe(STAR.skill);
    expect(stars.badges).toEqual(["farqad-shot"]);
    // المغادرة قبل ذلك لا تعطي finish، بل abandoned
    const left = apply(opening(SCENE, true).state, { type: "abandon" });
    expect(left.effects.map((x) => x.type)).toEqual(["abandoned"]);
  });
});

describe("الفشل (§6.9)", () => {
  it("running out of slots without cleared finishes as failed; every shot (opening and pebbles) counts", () => {
    let s = opening().state;
    const answers = [true, false, true, false, true];
    let r: ReduceResult | null = null;
    for (const c of answers) {
      r = slot(s, c);
      s = r.state;
    }
    expect(s).toMatchObject({ phase: "finished", failed: true, cleared: false, clearedAfterShot: -1, slotsUsed: 5, nextIdx: 6 });
    const summary = finishOf(r!)!.summary;
    expect(summary).toEqual({ mode: "scene", cleared: false, answered: 5, correct: 3, shotsUsed: 6, par: 3 });
    expect(s.shots.map((x) => x.ammo)).toEqual(["meteor", "meteor", "pebble", "meteor", "pebble", "meteor"]);
    expect(runStars(summary).mask & STAR.completion).toBe(0);
    refuse(s, { type: "begin" }, "finished");
    refuse(s, { type: "abandon" }, "finished");
  });

  it("failStreak ≥ 3 adds one slot", () => {
    expect(createSession(cfg({ failStreak: 2 })).slots).toBe(5);
    expect(createSession(cfg({ failStreak: 3 })).slots).toBe(6);
    expect(createSession(cfg({ failStreak: 9 })).slots).toBe(6);
    expect(createSession(cfg({ failStreak: 9 })).config.slots).toBe(5);
    let s = opening(cfg({ failStreak: 3 })).state;
    for (let i = 0; i < 5; i++) s = slot(s, true).state;
    expect(s.phase).toBe("question");
    expect(remainingSlots(s)).toBe(1);
    s = slot(s, true).state;
    expect(s).toMatchObject({ phase: "finished", failed: true, slotsUsed: 6 });
  });
});

describe("التحدي (§6.5)", () => {
  it("is requested in question before the question is shown, and replaces it with a challenge", () => {
    const q = opening().state;
    expect(canRequestChallenge(q)).toBe(true);
    const r = apply(q, { type: "challengeRequested" });
    expect(r.effects).toEqual([{ type: "requestQuestion", challenge: true }]);
    expect(r.state).toMatchObject({ challengeUsed: true, challengePending: true });
    refuse(r.state, { type: "challengeRequested" }, "challenge_used");
    refuse(r.state, { type: "questionShown", attemptId: "a", isChallenge: false }, "challenge_mismatch");
    const shown = apply(r.state, { type: "questionShown", attemptId: "a", isChallenge: true }).state;
    const right = apply(shown, { type: "answered", attemptId: "a", correct: true });
    expect(right.effects).toEqual([
      { type: "readyAmmo", ammo: "meteor" },
      { type: "specialGranted", ammo: "heavy" },
    ]);
    expect(right.state).toMatchObject({ challengePending: false, challengeUsed: true, answered: 1 });
  });

  it("only once per run", () => {
    let s = opening().state;
    s = answer(apply(s, { type: "challengeRequested" }).state, false).state;
    expect(s.readyAmmo).toBe("pebble");
    s = shoot(s).state;
    expect(canRequestChallenge(s)).toBe(false);
    refuse(s, { type: "challengeRequested" }, "challenge_used");
  });

  it("not after the question is shown, and not outside a scene slot question", () => {
    const q = opening().state;
    const shown = apply(q, { type: "questionShown", attemptId: "a", isChallenge: false }).state;
    refuse(shown, { type: "challengeRequested" }, "question_pending");
    refuse(q, { type: "questionShown", attemptId: "a", isChallenge: true }, "challenge_mismatch");
    refuse(apply(createSession(SCENE), { type: "begin" }).state, { type: "challengeRequested" }, "wrong_phase");
    refuse(opening(SCENE, true).state, { type: "challengeRequested" }, "wrong_phase");
    refuse(opening(cfg({ allowSpecials: false })).state, { type: "challengeRequested" }, "challenge_unavailable");
  });

  it("a correct challenge keeps the streak, a wrong one resets it", () => {
    let s = opening().state;
    s = slot(s, true).state;
    expect(s.streak.streak).toBe(1);
    const asked = apply(s, { type: "challengeRequested" }).state;
    expect(answer(asked, true).state.streak).toEqual({ streak: 1, stored: ["heavy"] });
    expect(answer(asked, false).state.streak).toEqual({ streak: 0, stored: [] });
  });
});

describe("وضع الأسئلة فقط", () => {
  const Q = cfg({ mode: "questions" });

  it("never fires: question after question until 5 answers", () => {
    const begun = apply(createSession(Q), { type: "begin" });
    expect(begun.state.phase).toBe("question");
    expect(begun.effects).toEqual([{ type: "requestQuestion", challenge: false }]);
    let s = begun.state;
    let r: ReduceResult | null = null;
    for (let i = 0; i < 5; i++) {
      refuse(s, { type: "fired", shot: shot(0, "meteor") }, "wrong_phase");
      refuse(s, { type: "challengeRequested" }, "wrong_phase");
      r = answer(s, i !== 2);
      s = r.state;
      if (i < 4) expect(r.effects).toEqual([{ type: "requestQuestion", challenge: false }]);
    }
    expect(s).toMatchObject({ phase: "finished", answered: 5, correct: 4, nextIdx: 0, shots: [] });
    const summary = finishOf(r!)!.summary;
    expect(summary).toEqual({ mode: "questions", cleared: false, answered: 5, correct: 4, shotsUsed: 0, par: 3 });
    expect(runStars(summary).mask).toBe(STAR.knowledge);
  });

  it("skip is allowed from 3 answers", () => {
    let s = apply(createSession(Q), { type: "begin" }).state;
    for (let i = 0; i < 2; i++) s = answer(s, true).state;
    refuse(s, { type: "skipSunrise" }, "too_few_answers");
    s = answer(s, true).state;
    const r = apply(s, { type: "skipSunrise" });
    expect(finishOf(r)?.summary).toMatchObject({ mode: "questions", answered: 3, shotsUsed: 0 });
  });
});

describe("المغادرة والطي", () => {
  it("abandon ends the run from any open phase with an abandoned summary", () => {
    const flight = apply(apply(createSession(SCENE), { type: "begin" }).state, { type: "fired", shot: shot(0, "meteor") }).state;
    const r = apply(flight, { type: "abandon" });
    expect(r.state).toMatchObject({ phase: "finished", abandoned: true, failed: false });
    expect(r.effects).toEqual([{ type: "abandoned", summary: { mode: "scene", cleared: false, answered: 0, correct: 0, shotsUsed: 1, par: 3 } }]);
    refuse(r.state, { type: "settled", cleared: true }, "finished");
    expect(apply(createSession(SCENE), { type: "abandon" }).state.phase).toBe("finished");
  });

  it("reduceAll folds a log into the same state, keeping effects (rejections included) in order", () => {
    const events: SessionEvent[] = [
      { type: "begin" },
      { type: "fired", shot: shot(0, "meteor") },
      { type: "fired", shot: shot(1, "meteor") },
      { type: "settled", cleared: false },
      { type: "questionShown", attemptId: "q1", isChallenge: false },
      { type: "answered", attemptId: "q1", correct: false },
    ];
    const r = reduceAll(createSession(SCENE), events);
    expect(r.state).toMatchObject({ phase: "aim", readyAmmo: "pebble", nextIdx: 1, answered: 1 });
    expect(r.effects.map((x) => x.type)).toEqual(["readyAmmo", "rejected", "requestQuestion", "readyAmmo"]);
  });
});

describe("النقاء", () => {
  it("the input state is deep-equal before and after every event, accepted or rejected", () => {
    const events: SessionEvent[] = [
      { type: "begin" },
      { type: "fired", shot: shot(1, "meteor") },
      { type: "fired", shot: shot(0, "meteor") },
      { type: "settled", cleared: false },
      { type: "challengeRequested" },
      { type: "questionShown", attemptId: "c", isChallenge: true },
      { type: "answered", attemptId: "c", correct: true },
      { type: "fired", shot: shot(1, "heavy") },
      { type: "settled", cleared: true },
      { type: "skipSunrise" },
      { type: "questionShown", attemptId: "s1", isChallenge: false },
      { type: "answered", attemptId: "s1", correct: true },
      { type: "questionShown", attemptId: "s2", isChallenge: false },
      { type: "answered", attemptId: "s2", correct: false },
      { type: "skipSunrise" },
      { type: "abandon" },
    ];
    let s = createSession(SCENE);
    const seen: [SessionState, SessionState][] = [];
    for (const e of events) {
      const before = structuredClone(s);
      deepFreeze(s);
      const r = reduce(s, e);
      expect(s).toEqual(before);
      seen.push([s, before]);
      s = r.state;
    }
    expect(s).toMatchObject({ phase: "finished", cleared: true, answered: 3, correct: 2, abandoned: false });
    expect(s.shots.map((x) => x.ammo)).toEqual(["meteor", "heavy"]);
    // ولا حالة سابقة تغيّرت بعد ذلك (الحالات تتشارك أجزاءها، فالتغيير في واحدة يظهر في غيرها)
    for (const [state, snapshot] of seen) expect(state).toEqual(snapshot);
  });

  it("does not mutate the event, and the recorded shot does not alias it", () => {
    const begun = apply(createSession(SCENE), { type: "begin" }).state;
    const ev: SessionEvent = { type: "fired", shot: shot(0, "meteor") };
    const copy = structuredClone(ev);
    const r = reduce(begun, ev);
    expect(ev).toEqual(copy);
    expect(r.state.shots[0]).not.toBe(ev.shot);
  });
});
