/**
 * النجوم والشارات (GAME_DESIGN.md §7). ثلاث نجوم مستقلة تُجمع عبر الجولات قناعًا بتّيًا (OR).
 * الحساب بأعداد صحيحة فقط (الدقة 80% ⇔ correct × 5 ≥ answered × 4)، والنصوص للطالب بالأرقام الهندية.
 * في نصوص الطالب «رمية» لا «طلقة».
 */

/** بتات النجوم في القناع */
export const STAR = { completion: 1, knowledge: 2, skill: 4 } as const;

/** أقل عدد إجابات للإتمام، ولنجمة المعرفة */
const MIN_ANSWERS_COMPLETION = 3;
const MIN_ANSWERS_KNOWLEDGE = 5;

export type StarReason = { star: "completion" | "knowledge" | "skill"; earned: boolean; why: string; missing?: string };

/** ملخص جولة واحدة كما يحسبه الخادم بعد إعادة المحاكاة (الرميات تشمل الافتتاح والحصى) */
export type RunSummary = { mode: "scene" | "questions"; cleared: boolean; answered: number; correct: number; shotsUsed: number; par: number };

export type Badge = "farqad-shot";

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
/** الأرقام الهندية لنصوص الطالب (نسخة محلية: src/game لا يستورد من @/lib) */
function arNum(n: number): string {
  return String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);
}

/** العدد والمعدود للرميات: واحدة، رميتان، من ٣ إلى ١٠ جمع، وما بعدها مفرد */
function throwsAr(n: number): string {
  if (n === 1) return "رمية واحدة";
  if (n === 2) return "رميتين";
  if (n >= 3 && n <= 10) return `${arNum(n)} رميات`;
  return `${arNum(n)} رمية`;
}

/** عدد صحيح غير سالب (المدخلات من الخادم، والحماية هنا رخيصة) */
function count(n: number): number {
  return n > 0 ? Math.trunc(n) : 0;
}

/** وضع الأسئلة فقط: 5 إجابات على الأقل بدقة 80% فأكثر (يضبط qonly_passed) */
export function qonlyPassed(answered: number, correct: number): boolean {
  const a = count(answered);
  const c = Math.min(count(correct), a);
  return a >= MIN_ANSWERS_KNOWLEDGE && c * 5 >= a * 4;
}

const QUESTIONS_ONLY = "وضع الأسئلة فقط يمنح نجمة المعرفة وحدها.";
const PLAY_SCENE = "العب المستوى بالمرقاب لتكسب هذه النجمة.";

function knowledgeReason(answered: number, correct: number): StarReason {
  if (qonlyPassed(answered, correct)) {
    return { star: "knowledge", earned: true, why: `إجاباتك الصحيحة ${arNum(correct)} من ${arNum(answered)}، أي ٨٠٪ فأكثر.` };
  }
  if (answered < MIN_ANSWERS_KNOWLEDGE) {
    return {
      star: "knowledge",
      earned: false,
      why: `أجبت في هذه الجولة عن أقل من ${arNum(MIN_ANSWERS_KNOWLEDGE)} أسئلة.`,
      missing: `تحتاج ${arNum(MIN_ANSWERS_KNOWLEDGE)} إجابات على الأقل بدقة ٨٠٪ (لديك ${arNum(answered)}).`,
    };
  }
  // أقل عدد صحيح يبلغ 80%: ⌈answered × 4 / 5⌉
  const need = Math.ceil((answered * 4) / 5);
  return {
    star: "knowledge",
    earned: false,
    why: `إجاباتك الصحيحة ${arNum(correct)} من ${arNum(answered)}، أقل من ٨٠٪.`,
    missing: `المطلوب ${arNum(need)} من ${arNum(answered)} صحيحة على الأقل.`,
  };
}

/**
 * نجوم جولة واحدة وأسبابها:
 *  - الإتمام: cleared مع 3 إجابات على الأقل.
 *  - المعرفة: 5 إجابات على الأقل بدقة 80% فأكثر.
 *  - المهارة: الإتمام، والرميات (ومنها الافتتاح والحصى) ≤ par.
 *  - شارة «رمية الفرقد»: cleared برمية واحدة إجمالًا (شارة لا نجمة).
 * وضع الأسئلة فقط لا يمنح إلا المعرفة.
 */
export function runStars(r: RunSummary): { mask: number; reasons: StarReason[]; badges: Badge[] } {
  const answered = count(r.answered);
  const correct = Math.min(count(r.correct), answered);
  const knowledge = knowledgeReason(answered, correct);

  if (r.mode === "questions") {
    return {
      mask: knowledge.earned ? STAR.knowledge : 0,
      reasons: [{ star: "completion", earned: false, why: QUESTIONS_ONLY, missing: PLAY_SCENE }, knowledge, { star: "skill", earned: false, why: QUESTIONS_ONLY, missing: PLAY_SCENE }],
      badges: [],
    };
  }

  const shots = count(r.shotsUsed);
  const par = count(r.par);

  let completion: StarReason;
  if (!r.cleared) {
    completion = { star: "completion", earned: false, why: "لم تتحرر كل القناديل في هذه الجولة.", missing: "حرّر كل القناديل." };
  } else if (answered < MIN_ANSWERS_COMPLETION) {
    completion = {
      star: "completion",
      earned: false,
      why: `تحررت القناديل، لكن إجاباتك أقل من ${arNum(MIN_ANSWERS_COMPLETION)}.`,
      missing: `أجب عن ${arNum(MIN_ANSWERS_COMPLETION)} أسئلة على الأقل (لديك ${arNum(answered)}).`,
    };
  } else {
    completion = { star: "completion", earned: true, why: `حرّرت كل القناديل وأجبت عن ${arNum(MIN_ANSWERS_COMPLETION)} أسئلة على الأقل.` };
  }

  let skill: StarReason;
  if (!completion.earned) {
    skill = {
      star: "skill",
      earned: false,
      why: "نجمة المهارة تحتاج نجمة الإتمام أولًا.",
      missing: `أتمم المستوى بعدد رميات لا يزيد على ${arNum(par)}.`,
    };
  } else if (shots <= par) {
    skill = { star: "skill", earned: true, why: `أتممت المستوى بـ${throwsAr(shots)}، والحد ${arNum(par)}.` };
  } else {
    skill = {
      star: "skill",
      earned: false,
      why: `استعملت ${throwsAr(shots)}، والحد ${arNum(par)}.`,
      missing: `أعد المستوى بعدد رميات لا يزيد على ${arNum(par)} (الافتتاح والحصى تُحسب).`,
    };
  }

  let mask = 0;
  if (completion.earned) mask |= STAR.completion;
  if (knowledge.earned) mask |= STAR.knowledge;
  if (skill.earned) mask |= STAR.skill;

  const badges: Badge[] = r.cleared && shots === 1 ? ["farqad-shot"] : [];
  return { mask, reasons: [completion, knowledge, skill], badges };
}

/** جمع النجوم عبر الجولات: OR بتّي محصور في 0..7 */
export function mergeStars(prevMask: number, runMask: number): number {
  return (prevMask | runMask) & (STAR.completion | STAR.knowledge | STAR.skill);
}
