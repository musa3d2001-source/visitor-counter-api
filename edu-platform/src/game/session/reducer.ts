/**
 * آلة حالات الجولة (GAME_DESIGN.md §6): reduce(state, event) → { state, effects } نقية تمامًا.
 *  - لا تغيّر الحالة الواردة ولا الحدث؛ كل انتقال ينسخ ما يتغير (الطلقات والمخزن مصفوفات جديدة).
 *  - الحدث المرفوض يعيد الحالة نفسها (المرجع نفسه) وأثرًا واحدًا rejected، ولا ترمي أبدًا.
 *  - قواعد القذيفة الخاصة والنجوم من rules/، فالعميل والخادم يحسبان الشيء نفسه.
 * بلا Date ولا عشوائية: الجولة تتحدد بإعدادها وتسلسل أحداثها.
 */
import { ANGLE_STEPS, POWER_STEPS, YAW_STEPS } from "../core/aim-table";
import { AMMO, AMMO_KEYS, SPECIAL_AMMO, type AmmoKey, type SpecialAmmo } from "../core/ammo";
import type { Shot } from "../core/sim";
import { QUIET } from "../core/world";
import { consumeSpecial, initialStreak, onChallengeAnswer, onSlotAnswer, type RunSummary } from "../rules";
import { FAIL_STREAK_FOR_EXTRA_SLOT, RUN_QUESTIONS, SKIP_MIN_ANSWERS, type Effect, type ReduceResult, type RejectReason, type SessionConfig, type SessionEvent, type SessionState } from "./types";

// ───────────────────────── أدوات ─────────────────────────

/** عدد صحيح غير سالب (NaN وما لا ينتهي وما دون الصفر ← 0) */
function count(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** عدد صحيح في [0, max] بلا تكميم: القيمة الخارجة عن المدى مرفوضة لا محصورة */
function inRange(v: unknown, max: number): boolean {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
}

function isAmmoKey(a: unknown): a is AmmoKey {
  return typeof a === "string" && (AMMO_KEYS as readonly string[]).includes(a);
}

function isSpecialAmmo(a: unknown): a is SpecialAmmo {
  return typeof a === "string" && (SPECIAL_AMMO as readonly string[]).includes(a);
}

/** خطوة التفعيل: −1 (بلا تفعيل)، أو خطوة في مدى الطلقة لقذيفة قابلة للتفعيل فقط */
function validActivation(ammo: AmmoKey, at: unknown): boolean {
  if (!Number.isInteger(at)) return false;
  if (at === -1) return true;
  return AMMO[ammo].activatable && inRange(at, QUIET.maxStepsPerShot);
}

function ok(state: SessionState, effects: Effect[] = []): ReduceResult {
  return { state, effects };
}

/** الرفض: الحالة نفسها بلا أي تغيير */
function reject(state: SessionState, reason: RejectReason): ReduceResult {
  return { state, effects: [{ type: "rejected", reason }] };
}

/** حقول الحدث كما وصلت: تُفحص أنواعها وقت التشغيل (الحدث قد يأتي من شبكة أو JSON) */
type Fields = Readonly<Record<string, unknown>>;
const isObject = (v: unknown): v is Fields => typeof v === "object" && v !== null;

// ───────────────────────── الإنشاء والملخص ─────────────────────────

/**
 * جولة جديدة في طور opening. الخانات slots التصميم، وواحدة إضافية بعد 3 إخفاقات متتالية في المستوى.
 * الإعداد يُطبَّع (أعداد صحيحة غير سالبة)، فالحالة لا تحمل قيمة غير صالحة.
 */
export function createSession(config: SessionConfig): SessionState {
  const cfg: SessionConfig = {
    mode: config.mode === "questions" ? "questions" : "scene",
    slots: count(config.slots),
    par: count(config.par),
    streakReward: isSpecialAmmo(config.streakReward) ? config.streakReward : "heavy",
    failStreak: count(config.failStreak),
    allowSpecials: config.allowSpecials === true,
  };
  return {
    config: cfg,
    phase: "opening",
    nextIdx: 0,
    slots: cfg.slots + (cfg.failStreak >= FAIL_STREAK_FOR_EXTRA_SLOT ? 1 : 0),
    slotsUsed: 0,
    readyAmmo: null,
    streak: initialStreak(),
    answered: 0,
    correct: 0,
    challengeUsed: false,
    challengePending: false,
    pendingAttemptId: null,
    cleared: false,
    clearedAfterShot: -1,
    shots: [],
    sunriseTarget: 0,
    sunriseAnswered: 0,
    sunriseCorrect: 0,
    failed: false,
    abandoned: false,
  };
}

/** ملخص الجولة لـ rules/runStars: الرميات كلها (ومنها الافتتاح والحصى)، والإجابات كلها (ومنها الشروق) */
export function summaryOf(s: SessionState): RunSummary {
  return { mode: s.config.mode, cleared: s.cleared, answered: s.answered, correct: s.correct, shotsUsed: s.shots.length, par: s.config.par };
}

/** الخانات الباقية (تصير أسئلة نقاط في الشروق) */
export function remainingSlots(s: SessionState): number {
  return s.slots > s.slotsUsed ? s.slots - s.slotsUsed : 0;
}

/** نهاية طبيعية: يُغلق كل ما هو معلّق، ويُرسل الملخص */
function finish(s: SessionState): ReduceResult {
  const state: SessionState = { ...s, phase: "finished", readyAmmo: null, pendingAttemptId: null, challengePending: false };
  return ok(state, [{ type: "finish", summary: summaryOf(state) }]);
}

/** طلب سؤال عادي (كائن جديد في كل أثر) */
const ask = (): Effect => ({ type: "requestQuestion", challenge: false });

// ───────────────────────── الأحداث ─────────────────────────

function onBegin(s: SessionState): ReduceResult {
  if (s.phase !== "opening") return reject(s, "wrong_phase");
  if (s.config.mode === "questions") return ok({ ...s, phase: "question" }, [ask()]);
  // شهاب الافتتاح المجاني: لا يستهلك خانة
  return ok({ ...s, phase: "aim", readyAmmo: "meteor" }, [{ type: "readyAmmo", ammo: "meteor" }]);
}

function onFired(s: SessionState, shot: unknown): ReduceResult {
  if (s.phase !== "aim") return reject(s, "wrong_phase");
  if (!isObject(shot)) return reject(s, "invalid_shot");
  if (shot.idx !== s.nextIdx) return reject(s, "wrong_idx");
  const ammo = shot.ammo;
  if (!isAmmoKey(ammo)) return reject(s, "wrong_ammo");

  // القذيفة الجاهزة، أو خاصة مخزّنة تستبدل نوع رمية الخانة ولا تضيف رمية
  let streak = s.streak;
  if (ammo !== s.readyAmmo) {
    const after = isSpecialAmmo(ammo) ? consumeSpecial(s.streak, ammo) : null;
    if (!after) return reject(s, "wrong_ammo");
    streak = after;
  }
  if (!inRange(shot.yawStep, YAW_STEPS) || !inRange(shot.angleStep, ANGLE_STEPS) || !inRange(shot.powerStep, POWER_STEPS)) return reject(s, "invalid_shot");
  if (!validActivation(ammo, shot.activateAt)) return reject(s, "invalid_activation");

  // نسخة بالحقول المعروفة فقط: ما يضيفه المرسل لا يدخل الحالة، وتغييره لاحقًا لا يمسها
  const recorded: Shot = {
    idx: s.nextIdx,
    ammo,
    yawStep: shot.yawStep as number,
    angleStep: shot.angleStep as number,
    powerStep: shot.powerStep as number,
    activateAt: shot.activateAt as number,
  };
  return ok({
    ...s,
    phase: "flight",
    nextIdx: s.nextIdx + 1,
    slotsUsed: s.nextIdx === 0 ? s.slotsUsed : s.slotsUsed + 1,
    readyAmmo: null,
    streak,
    shots: [...s.shots, recorded],
  });
}

function onSettled(s: SessionState, e: Fields): ReduceResult {
  if (s.phase !== "flight") return reject(s, "wrong_phase");
  if (typeof e.cleared !== "boolean") return reject(s, "invalid_event");
  const last = s.shots[s.shots.length - 1];
  if (!last) return reject(s, "wrong_phase");

  // لمسة التفعيل تُعرف أثناء الطيران: تُسجَّل مرة واحدة في طلقة أُطلقت بلا تفعيل
  let shots = s.shots;
  if (e.activateAt !== undefined && e.activateAt !== last.activateAt) {
    if (last.activateAt !== -1 || e.activateAt === -1 || !validActivation(last.ammo, e.activateAt)) return reject(s, "invalid_activation");
    shots = [...s.shots.slice(0, -1), { ...last, activateAt: e.activateAt as number }];
  }

  // settle: cleared ← الشروق (أو النهاية إن اكتملت الأسئلة)، وإلا سؤال الخانة التالية، وإلا الفشل
  if (e.cleared) {
    const target = Math.max(s.answered + remainingSlots(s), RUN_QUESTIONS);
    const next: SessionState = { ...s, shots, phase: "sunrise", cleared: true, clearedAfterShot: last.idx, sunriseTarget: target };
    if (s.answered >= target) return finish(next);
    return ok(next, [ask()]);
  }
  if (s.slotsUsed < s.slots) return ok({ ...s, shots, phase: "question" }, [ask()]);
  return finish({ ...s, shots, failed: true });
}

function onQuestionShown(s: SessionState, e: Fields): ReduceResult {
  if (s.phase !== "question" && s.phase !== "sunrise") return reject(s, "wrong_phase");
  if (s.pendingAttemptId !== null) return reject(s, "question_pending");
  if (typeof e.attemptId !== "string" || e.attemptId.length === 0 || typeof e.isChallenge !== "boolean") return reject(s, "invalid_event");
  if (e.isChallenge !== s.challengePending) return reject(s, "challenge_mismatch");
  return ok({ ...s, pendingAttemptId: e.attemptId });
}

function onAnswered(s: SessionState, e: Fields): ReduceResult {
  if (s.phase !== "question" && s.phase !== "sunrise") return reject(s, "wrong_phase");
  if (s.pendingAttemptId === null) return reject(s, "no_question");
  if (typeof e.attemptId !== "string" || typeof e.correct !== "boolean") return reject(s, "invalid_event");
  if (e.attemptId !== s.pendingAttemptId) return reject(s, "attempt_mismatch");

  const right = e.correct;
  const base: SessionState = { ...s, answered: s.answered + 1, correct: s.correct + (right ? 1 : 0), pendingAttemptId: null, challengePending: false };

  // سؤال نقاط في الشروق: الخانات الباقية ثم إضافية حتى يبلغ المجموع 5
  if (s.phase === "sunrise") {
    const next: SessionState = { ...base, sunriseAnswered: s.sunriseAnswered + 1, sunriseCorrect: s.sunriseCorrect + (right ? 1 : 0) };
    if (next.answered >= s.sunriseTarget) return finish(next);
    return ok(next, [ask()]);
  }

  // وضع الأسئلة فقط: سؤال بعد سؤال حتى 5
  if (s.config.mode === "questions") {
    if (base.answered >= RUN_QUESTIONS) return finish(base);
    return ok(base, [ask()]);
  }

  // سؤال الخانة (أو التحدي بدله): صحيحة ← شهاب، خاطئة ← حصاة، والعدّاد من rules/streak
  const { streakReward, allowSpecials } = s.config;
  const step = s.challengePending ? onChallengeAnswer(s.streak, right, streakReward, allowSpecials) : onSlotAnswer(s.streak, right, streakReward, allowSpecials);
  const ammo: AmmoKey = right ? "meteor" : "pebble";
  const effects: Effect[] = [{ type: "readyAmmo", ammo }];
  if (step.granted) effects.push({ type: "specialGranted", ammo: step.granted });
  return ok({ ...base, phase: "aim", readyAmmo: ammo, streak: step.state }, effects);
}

function onChallengeRequested(s: SessionState): ReduceResult {
  if (s.phase !== "question" || s.config.mode !== "scene") return reject(s, "wrong_phase");
  // مكافأة التحدي قذيفة خاصة، فلا تحدّي لملف عمر بلا قذائف خاصة
  if (!s.config.allowSpecials) return reject(s, "challenge_unavailable");
  if (s.challengeUsed) return reject(s, "challenge_used");
  if (s.pendingAttemptId !== null) return reject(s, "question_pending");
  return ok({ ...s, challengeUsed: true, challengePending: true }, [{ type: "requestQuestion", challenge: true }]);
}

function onSkip(s: SessionState): ReduceResult {
  const skippable = s.phase === "sunrise" || (s.phase === "question" && s.config.mode === "questions");
  if (!skippable) return reject(s, "wrong_phase");
  if (s.answered < SKIP_MIN_ANSWERS) return reject(s, "too_few_answers");
  return finish(s);
}

function onAbandon(s: SessionState): ReduceResult {
  const state: SessionState = { ...s, phase: "finished", abandoned: true, readyAmmo: null, pendingAttemptId: null, challengePending: false };
  return ok(state, [{ type: "abandoned", summary: summaryOf(state) }]);
}

/** الانتقال الوحيد للجولة. الجولة المنتهية ترفض كل حدث */
export function reduce(state: SessionState, event: SessionEvent): ReduceResult {
  if (state.phase === "finished") return reject(state, "finished");
  const e: unknown = event;
  if (!isObject(e)) return reject(state, "invalid_event");
  switch (e.type) {
    case "begin":
      return onBegin(state);
    case "fired":
      return onFired(state, e.shot);
    case "settled":
      return onSettled(state, e);
    case "questionShown":
      return onQuestionShown(state, e);
    case "answered":
      return onAnswered(state, e);
    case "challengeRequested":
      return onChallengeRequested(state);
    case "skipSunrise":
      return onSkip(state);
    case "abandon":
      return onAbandon(state);
    default:
      return reject(state, "invalid_event");
  }
}

/** طي تسلسل أحداث (الاستئناف أو إعادة البناء من سجل الخادم): الآثار بترتيبها، ومنها الرفض */
export function reduceAll(state: SessionState, events: readonly SessionEvent[]): ReduceResult {
  let s = state;
  const effects: Effect[] = [];
  for (const ev of events) {
    const r = reduce(s, ev);
    s = r.state;
    effects.push(...r.effects);
  }
  return { state: s, effects };
}

// ───────────────────────── أسئلة للواجهة ─────────────────────────

const accepted = (r: ReduceResult): boolean => !r.effects.some((x) => x.type === "rejected");

/** هل يُقبل التخطي الآن (يُحسب بالمخفّض نفسه فلا يفترق عنه) */
export function canSkip(s: SessionState): boolean {
  return accepted(reduce(s, { type: "skipSunrise" }));
}

/** هل يُقبل طلب التحدي الآن */
export function canRequestChallenge(s: SessionState): boolean {
  return accepted(reduce(s, { type: "challengeRequested" }));
}

/** القذائف المتاحة للرمية الآن: الجاهزة أولًا، ثم الخاصة المخزّنة بلا تكرار */
export function availableAmmo(s: SessionState): AmmoKey[] {
  if (s.phase !== "aim" || s.readyAmmo === null) return [];
  const out: AmmoKey[] = [s.readyAmmo];
  for (const a of s.streak.stored) if (!out.includes(a)) out.push(a);
  return out;
}
