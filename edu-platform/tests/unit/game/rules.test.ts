/**
 * قواعد اللعبة النقية (src/game/rules، GAME_DESIGN.md §6–§10):
 * النجوم والشارات، والقذيفة الخاصة، والفتح، والإتقان، وملاءمة العمر، وطول دليل التصويب.
 */
import { describe, expect, it } from "vitest";
import {
  ageProfile,
  consumeSpecial,
  guidePoints,
  initialStreak,
  isComplete,
  isQualifying,
  MASTERY_LABELS,
  masteryFromQualifying,
  MAX_STORED_SPECIALS,
  mergeStars,
  onChallengeAnswer,
  onSlotAnswer,
  QUALIFY_GAP_MS,
  qonlyPassed,
  runStars,
  STAR,
  STREAK_FOR_SPECIAL,
  unlockedLevelIds,
  type AnswerRecord,
  type LevelProgress,
  type RunSummary,
  type StreakState,
  type UnlockLevel,
} from "@/game/rules";

/** جولة مشهد صالحة تُغيَّر حقولها في كل اختبار */
function scene(over: Partial<RunSummary> = {}): RunSummary {
  return { mode: "scene", cleared: true, answered: 5, correct: 5, shotsUsed: 3, par: 3, ...over };
}

const has = (mask: number, bit: number) => (mask & bit) !== 0;

describe("النجوم (§7)", () => {
  it("الإتمام يحتاج cleared و3 إجابات على الأقل", () => {
    expect(has(runStars(scene({ answered: 2, correct: 2 })).mask, STAR.completion)).toBe(false);
    expect(has(runStars(scene({ answered: 3, correct: 0 })).mask, STAR.completion)).toBe(true);
    expect(has(runStars(scene({ cleared: false, answered: 8, correct: 8 })).mask, STAR.completion)).toBe(false);
    const short = runStars(scene({ answered: 2, correct: 2 })).reasons.find((r) => r.star === "completion");
    expect(short?.earned).toBe(false);
    expect(short?.missing).toContain("٣");
  });

  it("المعرفة: 5 إجابات على الأقل ودقة 80% بمقارنة صحيحة", () => {
    const k = (answered: number, correct: number) => has(runStars(scene({ answered, correct })).mask, STAR.knowledge);
    expect(k(5, 4)).toBe(true);
    expect(k(5, 3)).toBe(false);
    expect(k(10, 8)).toBe(true);
    expect(k(9, 7)).toBe(false);
    expect(k(4, 4)).toBe(false);
    expect(k(5, 5)).toBe(true);
    // الدقة لا تتجاوز 100% حتى لو أخطأ المستدعي
    expect(k(4, 9)).toBe(false);
    expect(qonlyPassed(5, 4)).toBe(true);
    expect(qonlyPassed(5, 3)).toBe(false);
    expect(qonlyPassed(10, 8)).toBe(true);
    expect(qonlyPassed(9, 7)).toBe(false);
    expect(qonlyPassed(4, 4)).toBe(false);
    const miss = runStars(scene({ answered: 9, correct: 7 })).reasons.find((r) => r.star === "knowledge");
    // ⌈9 × 0.8⌉ = 8
    expect(miss?.missing).toContain("٨ من ٩");
  });

  it("المهارة: الإتمام والرميات (ومنها الافتتاح والحصى) ≤ par", () => {
    expect(has(runStars(scene({ shotsUsed: 3, par: 3 })).mask, STAR.skill)).toBe(true);
    expect(has(runStars(scene({ shotsUsed: 2, par: 3 })).mask, STAR.skill)).toBe(true);
    // الافتتاح + شهابان + حصاة = 4 رميات والحد 3
    const opening = 1;
    const meteors = 2;
    const pebbles = 1;
    expect(has(runStars(scene({ shotsUsed: opening + meteors + pebbles, par: 3 })).mask, STAR.skill)).toBe(false);
    // بلا إتمام لا مهارة ولو برمية واحدة
    expect(has(runStars(scene({ answered: 2, correct: 2, shotsUsed: 1 })).mask, STAR.skill)).toBe(false);
    expect(has(runStars(scene({ cleared: false, shotsUsed: 1 })).mask, STAR.skill)).toBe(false);
  });

  it("الجولة الكاملة تعطي القناع 7 وأسبابًا لكل نجمة", () => {
    const r = runStars(scene());
    expect(r.mask).toBe(7);
    expect(r.reasons.map((x) => x.star)).toEqual(["completion", "knowledge", "skill"]);
    expect(r.reasons.every((x) => x.earned && x.why.length > 0 && x.missing === undefined)).toBe(true);
  });

  it("شارة «رمية الفرقد»: cleared برمية واحدة إجمالًا في وضع المشهد", () => {
    expect(runStars(scene({ shotsUsed: 1 })).badges).toEqual(["farqad-shot"]);
    expect(runStars(scene({ shotsUsed: 2 })).badges).toEqual([]);
    expect(runStars(scene({ cleared: false, shotsUsed: 1 })).badges).toEqual([]);
    // شارة لا نجمة: لا تغيّر القناع
    expect(runStars(scene({ shotsUsed: 1 })).mask).toBe(runStars(scene({ shotsUsed: 2 })).mask);
  });

  it("وضع الأسئلة فقط يمنح المعرفة وحدها", () => {
    const pass = runStars({ mode: "questions", cleared: true, answered: 5, correct: 5, shotsUsed: 1, par: 3 });
    expect(pass.mask).toBe(STAR.knowledge);
    expect(pass.badges).toEqual([]);
    expect(pass.reasons.filter((r) => r.earned).map((r) => r.star)).toEqual(["knowledge"]);
    const fail = runStars({ mode: "questions", cleared: false, answered: 5, correct: 3, shotsUsed: 0, par: 3 });
    expect(fail.mask).toBe(0);
  });

  it("النصوص بالأرقام الهندية وبلا كلمة «طلقة»", () => {
    const runs = [
      scene(),
      scene({ answered: 2, correct: 1 }),
      scene({ answered: 12, correct: 7, shotsUsed: 11, par: 4 }),
      scene({ cleared: false }),
      scene({ shotsUsed: 1 }),
      scene({ shotsUsed: 2, par: 1 }),
      { ...scene(), mode: "questions" as const },
    ];
    for (const run of runs) {
      for (const r of runStars(run).reasons) {
        const text = `${r.why} ${r.missing ?? ""}`;
        expect(text).not.toMatch(/[0-9]/);
        expect(text).not.toContain("طلقة");
      }
    }
    const over = runStars(scene({ shotsUsed: 4, par: 3 })).reasons.find((r) => r.star === "skill");
    expect(over?.why).toContain("٤ رميات");
    expect(over?.why).toContain("٣");
  });

  it("mergeStars: OR عبر الجولات محصور في 0..7", () => {
    expect(mergeStars(0, STAR.completion)).toBe(1);
    expect(mergeStars(STAR.completion, STAR.knowledge)).toBe(3);
    expect(mergeStars(3, STAR.skill)).toBe(7);
    expect(mergeStars(7, 0)).toBe(7);
    expect(mergeStars(5, 1)).toBe(5);
    expect(mergeStars(8, 1)).toBe(1);
    expect(mergeStars(-1, 0)).toBe(7);
    // النجوم لا تُفقد بجولة أضعف
    let mask = 0;
    for (const run of [scene({ shotsUsed: 5 }), scene({ answered: 3, correct: 0 }), scene({ answered: 5, correct: 5, shotsUsed: 2 }), scene({ cleared: false })]) {
      mask = mergeStars(mask, runStars(run).mask);
    }
    expect(mask).toBe(7);
  });

  it("نجمة المعرفة ممكنة في الجولة الثالثة وإن كان البنك 8 أسئلة فقط", () => {
    // البنك: 8 أسئلة؛ كل جولة 5 أسئلة مختلفة (لا تكرار داخل الجولة)، والتكرار بين الجولات مسموح
    const bank = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"];
    const pick = (run: number) => Array.from({ length: 5 }, (_, i) => bank[(run * 5 + i) % bank.length]);
    // الطالب يتعلم من الشرح بعد كل إجابة: ما أخطأ فيه مرة يصيبه في المرة التالية
    const learned = new Set<string>();
    const firstTry = new Set(["q1", "q2", "q3"]);
    let mask = 0;
    const runs: { questions: string[]; mask: number }[] = [];
    for (let run = 0; run < 3; run++) {
      const questions = pick(run);
      expect(new Set(questions).size).toBe(5);
      let correct = 0;
      for (const q of questions) {
        if (firstTry.has(q) || learned.has(q)) correct++;
        else learned.add(q);
      }
      const r = runStars(scene({ answered: questions.length, correct }));
      runs.push({ questions, mask: r.mask });
      mask = mergeStars(mask, r.mask);
    }
    expect(runs[0].questions).toEqual(["q1", "q2", "q3", "q4", "q5"]);
    expect(runs[2].questions).toEqual(["q3", "q4", "q5", "q6", "q7"]);
    expect(has(runs[0].mask, STAR.knowledge)).toBe(false);
    expect(has(runs[1].mask, STAR.knowledge)).toBe(false);
    expect(has(runs[2].mask, STAR.knowledge)).toBe(true);
    expect(has(mask, STAR.knowledge)).toBe(true);
  });
});

describe("القذيفة الخاصة (§6.4)", () => {
  /** يطبّق إجابات خانات متتالية ويعيد الحالة والمنح */
  function slots(s: StreakState, answers: boolean[], allow = true) {
    const granted: (string | null)[] = [];
    for (const a of answers) {
      const r = onSlotAnswer(s, a, "heavy", allow);
      s = r.state;
      granted.push(r.granted);
    }
    return { state: s, granted };
  }

  it("ثلاث صحيحة متتالية تمنح قذيفة ويبدأ العدّاد من جديد", () => {
    expect(STREAK_FOR_SPECIAL).toBe(3);
    const r = slots(initialStreak(), [true, true, true]);
    expect(r.granted).toEqual([null, null, "heavy"]);
    expect(r.state).toEqual({ streak: 0, stored: ["heavy"] });
  });

  it("الخطأ يصفّر العدّاد", () => {
    const r = slots(initialStreak(), [true, true, false, true, true]);
    expect(r.granted.every((g) => g === null)).toBe(true);
    expect(r.state.streak).toBe(2);
    expect(onSlotAnswer(r.state, true, "comet").granted).toBe("comet");
  });

  it("اثنتان مخزّنتان على الأكثر، والزائدة لا تُمنح", () => {
    expect(MAX_STORED_SPECIALS).toBe(2);
    const r = slots(initialStreak(), [true, true, true, true, true, true, true, true, true]);
    expect(r.granted.filter((g) => g !== null)).toHaveLength(2);
    expect(r.state).toEqual({ streak: 0, stored: ["heavy", "heavy"] });
  });

  it("بلا قذائف خاصة (ملف العمر 1–5) لا يُمنح شيء", () => {
    const r = slots(initialStreak(), [true, true, true, true, true, true], false);
    expect(r.granted.every((g) => g === null)).toBe(true);
    expect(r.state.stored).toEqual([]);
    expect(onChallengeAnswer(initialStreak(), true, "pulse", false).granted).toBeNull();
  });

  it("التحدي الصحيح يمنح قذيفة ولا يغيّر العدّاد، والخاطئ يصفّره", () => {
    const two = slots(initialStreak(), [true, true]).state;
    const c = onChallengeAnswer(two, true, "pulse");
    expect(c.granted).toBe("pulse");
    expect(c.state).toEqual({ streak: 2, stored: ["pulse"] });
    // الصحيحة التالية تكمل الثلاث
    const next = onSlotAnswer(c.state, true, "heavy");
    expect(next.granted).toBe("heavy");
    expect(next.state).toEqual({ streak: 0, stored: ["pulse", "heavy"] });
    // المخزن ممتلئ: التحدي الصحيح لا يمنح
    expect(onChallengeAnswer(next.state, true, "comet").granted).toBeNull();
    const wrong = onChallengeAnswer(two, false, "pulse");
    expect(wrong).toEqual({ state: { streak: 0, stored: [] }, granted: null });
  });

  it("consumeSpecial يزيل واحدة مخزّنة، وnull إن لم تكن مخزّنة", () => {
    const s: StreakState = { streak: 1, stored: ["heavy", "comet"] };
    expect(consumeSpecial(s, "comet")).toEqual({ streak: 1, stored: ["heavy"] });
    expect(consumeSpecial(s, "pulse")).toBeNull();
    const twice: StreakState = { streak: 0, stored: ["heavy", "heavy"] };
    expect(consumeSpecial(twice, "heavy")).toEqual({ streak: 0, stored: ["heavy"] });
    expect(consumeSpecial(initialStreak(), "heavy")).toBeNull();
  });

  it("الدوال نقية: لا تغيّر الحالة الواردة", () => {
    const s: StreakState = { streak: 2, stored: ["heavy"] };
    const snapshot = JSON.stringify(s);
    onSlotAnswer(s, true, "comet");
    onSlotAnswer(s, false, "comet");
    onChallengeAnswer(s, true, "pulse");
    consumeSpecial(s, "heavy");
    expect(JSON.stringify(s)).toBe(snapshot);
    expect(initialStreak()).not.toBe(initialStreak());
  });
});

describe("الفتح (§8)", () => {
  const lesson = (id: string, order: number, published = true, unitId = "u1"): UnlockLevel => ({ id, unitId, order, kind: "lesson", published });
  const challenge = (id: string, order: number, published = true, unitId = "u1"): UnlockLevel => ({ id, unitId, order, kind: "challenge", published });
  const done: LevelProgress = { starsMask: STAR.completion, qonlyPassed: false };
  const sorted = (s: Set<string>) => [...s].sort();

  // L2 غير منشور بين L1 وL3
  const unit = [challenge("C", 99), lesson("L4", 4), lesson("L2", 2, false), lesson("L1", 1), lesson("L3", 3)];

  it("isComplete بنجمة الإتمام أو qonly_passed", () => {
    expect(isComplete(undefined)).toBe(false);
    expect(isComplete({ starsMask: 0, qonlyPassed: false })).toBe(false);
    expect(isComplete({ starsMask: STAR.knowledge | STAR.skill, qonlyPassed: false })).toBe(false);
    expect(isComplete({ starsMask: STAR.completion, qonlyPassed: false })).toBe(true);
    expect(isComplete({ starsMask: 0, qonlyPassed: true })).toBe(true);
  });

  it("أول درس منشور مفتوح دائمًا", () => {
    expect(sorted(unlockedLevelIds(unit, {}))).toEqual(["L1"]);
    // إن لم يُنشر الأول فأول منشور بعده هو المفتوح
    expect(sorted(unlockedLevelIds([lesson("A", 1, false), lesson("B", 2)], {}))).toEqual(["B"]);
  });

  it("الفتح بالسلسلة مع تجاوز غير المنشور، وغير المنشور لا يُفتح أبدًا", () => {
    expect(sorted(unlockedLevelIds(unit, { L1: done }))).toEqual(["L1", "L3"]);
    expect(sorted(unlockedLevelIds(unit, { L1: done, L3: done }))).toEqual(["L1", "L3", "L4"]);
    // تقدم قديم على غير المنشور لا يفتحه ولا يفتح ما بعده
    expect(sorted(unlockedLevelIds(unit, { L2: done }))).toEqual(["L1"]);
    const all = unlockedLevelIds(unit, { L1: done, L2: done, L3: done, L4: done });
    expect(all.has("L2")).toBe(false);
  });

  it("المستوى يُفتح باكتمال أقرب درس منشور قبله وحده", () => {
    // L3 مكتمل وL1 لا: L4 يُفتح لأن أقرب منشور قبله L3
    expect(sorted(unlockedLevelIds(unit, { L3: done }))).toEqual(["L1", "L4"]);
  });

  it("تحدّي الوحدة بعد اكتمال كل دروسها المنشورة", () => {
    expect(unlockedLevelIds(unit, { L1: done, L3: done }).has("C")).toBe(false);
    expect(sorted(unlockedLevelIds(unit, { L1: done, L3: done, L4: done }))).toEqual(["C", "L1", "L3", "L4"]);
    // تحدٍّ غير منشور لا يُفتح
    const hidden = [lesson("L1", 1), challenge("C", 9, false)];
    expect(unlockedLevelIds(hidden, { L1: done }).has("C")).toBe(false);
    // وحدة بلا دروس منشورة: لا تحدّي
    expect(sorted(unlockedLevelIds([lesson("L1", 1, false), challenge("C", 9)], { L1: done }))).toEqual([]);
  });

  it("qonly_passed يُحسب اكتمالًا", () => {
    const q: LevelProgress = { starsMask: 0, qonlyPassed: true };
    expect(sorted(unlockedLevelIds(unit, { L1: q, L3: q, L4: q }))).toEqual(["C", "L1", "L3", "L4"]);
    // نجمة المعرفة وحدها في وضع المشهد ليست اكتمالًا
    expect(sorted(unlockedLevelIds(unit, { L1: { starsMask: STAR.knowledge, qonlyPassed: false } }))).toEqual(["L1"]);
  });

  it("الوحدات مستقلة، والترتيب من order لا من ترتيب المدخلات", () => {
    const levels = [...unit, lesson("M2", 2, true, "u2"), lesson("M1", 1, true, "u2"), challenge("MC", 3, true, "u2")];
    expect(sorted(unlockedLevelIds(levels, { L1: done }))).toEqual(["L1", "L3", "M1"]);
    expect(sorted(unlockedLevelIds([...levels].reverse(), { M1: done, M2: done }))).toEqual(["L1", "M1", "M2", "MC"]);
    // مفتاح يشبه خاصية النموذج الأولي لا يُقرأ تقدمًا
    expect(sorted(unlockedLevelIds([lesson("constructor", 1), lesson("x", 2)], {}))).toEqual(["constructor"]);
  });
});

describe("الإتقان (§9)", () => {
  const HOUR = 60 * 60 * 1000;
  const T0 = 1_800_000_000_000;
  const rec = (root: string, correct: boolean, at: number): AnswerRecord => ({ questionRootId: root, correct, answeredAt: at });
  /** "1" صحيحة و"0" خاطئة، بترتيب زمني */
  const bools = (s: string) => [...s].map((c) => ({ correct: c === "1" }));

  it("الإجابة المؤهلة: أول ظهور، أو بعد 24 ساعة على الأقل من آخر إجابة للجذر نفسه", () => {
    expect(QUALIFY_GAP_MS).toBe(24 * HOUR);
    expect(isQualifying([], "a", T0)).toBe(true);
    const history = [rec("a", true, T0), rec("b", false, T0 + 30 * HOUR)];
    expect(isQualifying(history, "a", T0 + 24 * HOUR)).toBe(true);
    expect(isQualifying(history, "a", T0 + 24 * HOUR - 1)).toBe(false);
    expect(isQualifying(history, "a", T0 + 2 * HOUR)).toBe(false);
    // جذر آخر لا يؤثر
    expect(isQualifying(history, "c", T0)).toBe(true);
    // آخر إجابة هي المعتبرة مهما كان ترتيب السجل
    const unordered = [rec("a", true, T0 + 40 * HOUR), rec("a", false, T0)];
    expect(isQualifying(unordered, "a", T0 + 50 * HOUR)).toBe(false);
    expect(isQualifying(unordered, "a", T0 + 64 * HOUR)).toBe(true);
  });

  it("النطاقات عند الحدود (مقارنات صحيحة)", () => {
    const band = (s: string) => masteryFromQualifying(bools(s)).band;
    expect(band("")).toBe("little-data");
    expect(band("111")).toBe("little-data");
    expect(band("1111")).toBe("mastered");
    expect(band("1110")).toBe("progressing"); // 75%
    expect(band("1100")).toBe("progressing"); // 50%
    expect(band("1000")).toBe("needs-review"); // 25%
    expect(band("11110")).toBe("mastered"); // 80%
    expect(band("11100")).toBe("progressing"); // 60%
    expect(band("11000")).toBe("needs-review"); // 40%
    expect(band("11111110")).toBe("mastered"); // 87.5%
    expect(band("11111100")).toBe("progressing"); // 75%
    expect(band("11110000")).toBe("progressing"); // 50%
    expect(band("11100000")).toBe("needs-review"); // 37.5%
    expect(MASTERY_LABELS).toEqual({ "little-data": "بيانات قليلة", mastered: "متقن", progressing: "يتقدّم", "needs-review": "يحتاج مراجعة" });
  });

  it("تُحسب آخر 8 إجابات فقط", () => {
    const r = masteryFromQualifying(bools("0000" + "11111111"));
    expect(r).toEqual({ band: "mastered", count: 8, correct: 8 });
    expect(masteryFromQualifying(bools("1111" + "00000000"))).toEqual({ band: "needs-review", count: 8, correct: 0 });
  });

  it("الإتقان يتحسن بالإعادات المؤهلة بعد 24 ساعة، والإعادة قبلها لا تُحسب", () => {
    const history: AnswerRecord[] = [];
    const qualifying: { correct: boolean }[] = [];
    const answer = (root: string, correct: boolean, at: number) => {
      if (isQualifying(history, root, at)) qualifying.push({ correct });
      history.push(rec(root, correct, at));
    };
    const roots = ["r1", "r2", "r3", "r4"];

    // اليوم الأول: أربعة أسئلة جديدة، كلها خطأ
    roots.forEach((r, i) => answer(r, false, T0 + i * 60_000));
    expect(masteryFromQualifying(qualifying).band).toBe("needs-review");

    // بعد ساعتين يعيدها صحيحة: رأى الإجابة للتو، فلا تُحسب
    roots.forEach((r, i) => answer(r, true, T0 + 2 * HOUR + i * 60_000));
    expect(qualifying).toHaveLength(4);
    expect(masteryFromQualifying(qualifying).band).toBe("needs-review");

    // بعد يومين: صحيحة ومؤهلة
    roots.forEach((r, i) => answer(r, true, T0 + 48 * HOUR + i * 60_000));
    expect(qualifying).toHaveLength(8);
    expect(masteryFromQualifying(qualifying)).toEqual({ band: "progressing", count: 8, correct: 4 });

    // بعد يومين آخرين: آخر 8 كلها صحيحة
    roots.forEach((r, i) => answer(r, true, T0 + 96 * HOUR + i * 60_000));
    expect(masteryFromQualifying(qualifying)).toEqual({ band: "mastered", count: 8, correct: 8 });
  });
});

describe("ملاءمة العمر (§10)", () => {
  it("النطاقات 1–5 و6–9 و10–12", () => {
    const primary = { fontScale: 1.2, minChoices: 2, maxChoices: 3, guideFactor: 1.5, specialsAllowed: false };
    const middle = { fontScale: 1, minChoices: 2, maxChoices: 4, guideFactor: 1, specialsAllowed: true };
    const secondary = { fontScale: 1, minChoices: 2, maxChoices: 4, guideFactor: 0.75, specialsAllowed: true };
    for (const g of [1, 3, 5]) expect(ageProfile(g)).toEqual(primary);
    for (const g of [6, 7, 9]) expect(ageProfile(g)).toEqual(middle);
    for (const g of [10, 11, 12]) expect(ageProfile(g)).toEqual(secondary);
  });

  it("خارج المدى يُحصر في أقرب نطاق", () => {
    expect(ageProfile(0).specialsAllowed).toBe(false);
    expect(ageProfile(-4).fontScale).toBe(1.2);
    expect(ageProfile(13).guideFactor).toBe(0.75);
    expect(ageProfile(99).guideFactor).toBe(0.75);
    expect(ageProfile(Number.NaN).specialsAllowed).toBe(false);
  });

  it("يعيد نسخة لا تشترك في الحالة", () => {
    const p = ageProfile(7);
    p.maxChoices = 9;
    expect(ageProfile(7).maxChoices).toBe(4);
  });
});

describe("دليل التصويب (§10)", () => {
  it("الأساس حسب الطبقة بمعامل العمر العادي", () => {
    expect([1, 2, 3, 4].map((t) => guidePoints(t, 7, 0))).toEqual([30, 24, 18, 14]);
  });

  it("معامل العمر، و×1.5 بعد 3 إخفاقات متتالية، والتقريب والحصر في 8..64", () => {
    expect([1, 2, 3, 4].map((t) => guidePoints(t, 3, 0))).toEqual([45, 36, 27, 21]);
    // 22.5 ← 23، و13.5 ← 14، و10.5 ← 11
    expect([1, 2, 3, 4].map((t) => guidePoints(t, 11, 0))).toEqual([23, 18, 14, 11]);
    expect(guidePoints(1, 7, 2)).toBe(30);
    expect(guidePoints(1, 7, 3)).toBe(45);
    expect(guidePoints(4, 7, 5)).toBe(21);
    // 15.75 ← 16
    expect(guidePoints(4, 11, 3)).toBe(16);
    // 67.5 تُحصر في 64، و54 تحت السقف
    expect(guidePoints(1, 3, 3)).toBe(64); // 30 × 1.5 × 1.5 = 67.5 ← السقف 64
    expect(guidePoints(2, 3, 3)).toBe(54);
    expect(guidePoints(3, 3, 3)).toBe(41);
  });

  it("الطبقة خارج 1..4 تُحصر", () => {
    expect(guidePoints(0, 7, 0)).toBe(30);
    expect(guidePoints(9, 7, 0)).toBe(14);
    expect(guidePoints(Number.NaN, 7, 0)).toBe(30);
  });
});
