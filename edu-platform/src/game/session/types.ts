/**
 * أنواع جلسة الجولة (GAME_DESIGN.md §6): آلة حالات نقية يشترك فيها العميل والخادم، والخادم صاحب السلطة.
 * الحالة كائن JSON عادي (يُخزَّن ويُرسَل كما هو) ولا يُغيَّر أبدًا: كل حدث يعيد حالة جديدة وآثارًا.
 * الحدث المرفوض يعيد الحالة نفسها وأثر rejected بسببه (لا استثناء)، والخادم يحوّله إلى 409.
 */
import type { AmmoKey, SpecialAmmo } from "../core/ammo";
import type { Shot } from "../core/sim";
import type { RunSummary, StreakState } from "../rules";

/**
 * أطوار الجولة:
 *   opening → aim(idx 0، شهاب مجاني) → flight → settle → [question → aim → flight → settle]* → sunrise → finished
 * settle طور عابر: الحدث settled ينقل من flight عبره إلى ما بعده في الخطوة نفسها، فلا تبقى فيه الحالة.
 * وضع الأسئلة فقط: opening → question → question … → finished، بلا رميات.
 */
export type Phase = "opening" | "question" | "aim" | "flight" | "settle" | "sunrise" | "finished";

export type SessionMode = "scene" | "questions";

/**
 * إعداد الجولة من التصميم والطالب: slots و par و streakReward من التصميم، و failStreak الإخفاقات المتتالية
 * في المستوى قبل هذه الجولة، و allowSpecials من ملف العمر (age-profile).
 */
export type SessionConfig = Readonly<{ mode: SessionMode; slots: number; par: number; streakReward: SpecialAmmo; failStreak: number; allowSpecials: boolean }>;

/** مجموع أسئلة الجولة المطلوب (الخانات ثم الشروق، أو وضع الأسئلة فقط) */
export const RUN_QUESTIONS = 5;
/** أقل عدد إجابات يسمح بالتخطي، وهو شرط نجمة الإتمام نفسه */
export const SKIP_MIN_ANSWERS = 3;
/** الإخفاقات المتتالية في المستوى التي تضيف خانة */
export const FAIL_STREAK_FOR_EXTRA_SLOT = 3;

export type SessionState = Readonly<{
  /** الإعداد بعد التطبيع (slots هنا كما في التصميم، والفعلي في slots أدناه) */
  config: SessionConfig;
  phase: Phase;
  /** فهرس الطلقة التالية: 0 للافتتاح ثم خانة بعد خانة */
  nextIdx: number;
  /** الخانات الفعلية: slots التصميم، وواحدة إضافية بعد 3 إخفاقات متتالية */
  slots: number;
  /** الخانات المستهلكة: كل رمية بعد الافتتاح (الافتتاح مجاني) */
  slotsUsed: number;
  /** القذيفة الجاهزة في aim (شهاب أو حصاة)، وإلا null */
  readyAmmo: AmmoKey | null;
  /** عدّاد الإجابات الصحيحة المتتالية والقذائف الخاصة المخزّنة (rules/streak) */
  streak: StreakState;
  /** إجابات الجولة كلها (الخانات والشروق ووضع الأسئلة) */
  answered: number;
  correct: number;
  /** التحدي مرة في الجولة */
  challengeUsed: boolean;
  /** التحدي مطلوب أو معروض ولم يُجب بعد */
  challengePending: boolean;
  /** محاولة السؤال المعروض الآن، أو null قبل عرضه */
  pendingAttemptId: string | null;
  cleared: boolean;
  /** فهرس الطلقة التي تحرر بعدها كل القناديل، أو −1 */
  clearedAfterShot: number;
  /** الطلقات المسجّلة بترتيبها (يعيدها الخادم في /finish) */
  shots: readonly Shot[];
  /** مجموع الإجابات الذي ينتهي عنده الشروق: الخانات الباقية، ثم إضافية حتى 5 (0 قبل الشروق) */
  sunriseTarget: number;
  sunriseAnswered: number;
  sunriseCorrect: number;
  /** نفدت الخانات بلا cleared («كِدت!») */
  failed: boolean;
  /** غادر الطالب الجولة قبل نهايتها */
  abandoned: boolean;
}>;

export type SessionEvent =
  /** opening: يجهّز شهاب الافتتاح المجاني (idx 0)، أو أول سؤال في وضع الأسئلة فقط */
  | { type: "begin" }
  /** aim فقط: idx يساوي nextIdx، والقذيفة هي الجاهزة أو خاصة مخزّنة (تستهلكها وتستبدل نوع رمية الخانة) */
  | { type: "fired"; shot: Shot }
  /**
   * flight فقط: السكون بعد الرمية. activateAt اختياري: خطوة لمسة التفعيل (stepInShot + 1) التي لا تُعرف
   * إلا أثناء الطيران، فتُسجَّل في الطلقة الأخيرة إن أُطلقت بلا تفعيل (−1) وكانت قذيفتها قابلة للتفعيل.
   */
  | { type: "settled"; cleared: boolean; activateAt?: number }
  /** question أو sunrise قبل عرض سؤال؛ isChallenge يطابق طلب التحدي */
  | { type: "questionShown"; attemptId: string; isChallenge: boolean }
  /** إجابة السؤال المعروض: في الخانة شهاب أو حصاة ثم aim، وفي الشروق ووضع الأسئلة سؤال نقاط */
  | { type: "answered"; attemptId: string; correct: boolean }
  /** مرة في الجولة، في question قبل عرض السؤال (وضع المشهد ومع القذائف الخاصة فقط) */
  | { type: "challengeRequested" }
  /** الشروق (أو وضع الأسئلة فقط) متى بلغت إجابات الجولة 3 */
  | { type: "skipSunrise" }
  | { type: "abandon" };

/** أسباب الرفض (رموز ثابتة يسجّلها الخادم مع 409) */
export type RejectReason =
  | "finished"
  | "wrong_phase"
  | "invalid_event"
  | "wrong_idx"
  | "wrong_ammo"
  | "invalid_shot"
  | "invalid_activation"
  | "question_pending"
  | "no_question"
  | "attempt_mismatch"
  | "challenge_used"
  | "challenge_unavailable"
  | "challenge_mismatch"
  | "too_few_answers";

export type Effect =
  | { type: "requestQuestion"; challenge: boolean }
  | { type: "readyAmmo"; ammo: AmmoKey }
  | { type: "specialGranted"; ammo: SpecialAmmo }
  /** نهاية طبيعية (cleared ثم الشروق، أو نفاد الخانات، أو التخطي، أو وضع الأسئلة): الملخص لـ rules/runStars */
  | { type: "finish"; summary: RunSummary }
  /** مغادرة قبل النهاية: الملخص للإحصاءات فقط، ولا تُحسب منه نجوم */
  | { type: "abandoned"; summary: RunSummary }
  | { type: "rejected"; reason: RejectReason };

export type ReduceResult = { state: SessionState; effects: Effect[] };
