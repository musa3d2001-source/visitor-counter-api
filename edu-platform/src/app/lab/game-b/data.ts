/**
 * مختبر فقط (المرحلة ٠، ليس كود إنتاج): بيانات تجريبية للاتجاه الفني ب «مرصد البلّور».
 * ليست من قاعدة البيانات ولا تُعرض للطلاب. السؤال والشرح مكتوبان للمعاينة،
 * والمرجع بصيغة مرجع الكتاب المطلوبة في الأمر (§4.2) لا نقلًا من كتاب.
 */
import { ar } from "../_game-kit/fmt";

export type Screen = "scene" | "question" | "results" | "map";
export const SCREENS: { key: Screen; label: string }[] = [
  { key: "scene", label: "مشهد المستوى" },
  { key: "question", label: "لوح السؤال" },
  { key: "results", label: "النتائج" },
  { key: "map", label: "خريطة العالم" },
];

export const LEVEL = {
  subject: "العلوم",
  subjectSlug: "science",
  grade: "الصف السابع",
  term: "الفصل الأول",
  unit: 2,
  lesson: 3,
  title: "حالات المادة",
  slots: 5,
  slotsUsed: 2,
  par: 4,
  lanterns: 3,
  freed: 1,
  angle: 38,
  power: 64,
  special: { name: "نيزك ثقيل", hint: "يكسر الحجر البحري", count: 1 },
  /** تدرج السماء من الليل (٠) إلى الشروق (١) */
  dawn: 0.34,
};

/** المواد الست كما ستُعرّف في core/materials.ts (أسماء العرض فقط هنا) */
export const MATERIALS = [
  { key: "frond", name: "سعف", note: "خفيف ينثني" },
  { key: "teak", name: "خشب ساج", note: "متين" },
  { key: "stone", name: "حجر بحري", note: "ثقيل جدًا" },
  { key: "glass", name: "زجاج ملوّن", note: "هش" },
  { key: "cloud", name: "غيم", note: "شديد الارتداد" },
  { key: "lightbox", name: "صندوق ضوء", note: "نبضة تدفع ما حوله" },
] as const;

export type Choice = { id: string; letter: string; text: string };

export const QUESTION = {
  slot: 3,
  stem: "ماذا يحدث لجزيئات الماء عندما نسخّن قطعة ثلج حتى تنصهر؟",
  choices: [
    { id: "c1", letter: "أ", text: "تتوقف عن الحركة تمامًا" },
    { id: "c2", letter: "ب", text: "يكبر حجم كل جزيء منها" },
    { id: "c3", letter: "ج", text: "تزداد سرعة حركتها وتتباعد قليلًا" },
    { id: "c4", letter: "د", text: "تتحول إلى مادة جديدة مختلفة" },
  ] satisfies Choice[],
  correctId: "c3",
  pickedId: "c2",
  explanation:
    "التسخين يمنح الجزيئات طاقة، فتتحرك أسرع وتضعف قوى التجاذب بينها، فتتحول المادة من صلبة إلى سائلة. حجم الجزيء نفسه لا يتغير، والماء يبقى ماءً.",
  reference: `كتاب العلوم، الصف السابع، الفصل الأول، الوحدة ${ar(2)}، الدرس ${ar(3)}، ص ${ar(45)}`,
};

export type StarResult = { key: "complete" | "knowledge" | "skill"; title: string; earned: boolean; why: string };

export const RESULTS = {
  shots: 4,
  par: 4,
  correct: 3,
  answered: 5,
  lanterns: 3,
  points: 1240,
  stars: [
    { key: "complete", title: "الإتمام", earned: true, why: `حرّرت القناديل الثلاثة وأجبت عن ${ar(5)} أسئلة، والشرط ${ar(3)} أسئلة على الأقل.` },
    {
      key: "knowledge",
      title: "المعرفة",
      earned: false,
      why: `تحتاج دقة ${ar(80)}٪ على ${ar(5)} أسئلة. أجبت ${ar(3)} من ${ar(5)} صحيحة (${ar(60)}٪)، وينقصك سؤال صحيح واحد.`,
    },
    { key: "skill", title: "المهارة", earned: true, why: `أنهيت المستوى بـ ${ar(4)} طلقات، والحد ${ar(4)} طلقات أو أقل.` },
  ] satisfies StarResult[],
  mistakes: [
    {
      stem: "ماذا يحدث لجزيئات الماء عندما نسخّن قطعة ثلج حتى تنصهر؟",
      picked: "يكبر حجم كل جزيء منها",
      correct: "تزداد سرعة حركتها وتتباعد قليلًا",
      ref: `الوحدة ${ar(2)}، الدرس ${ar(3)}، ص ${ar(45)}`,
    },
    {
      stem: "أي حالات المادة لها شكل ثابت وحجم ثابت؟",
      picked: "السائلة",
      correct: "الصلبة",
      ref: `الوحدة ${ar(2)}، الدرس ${ar(3)}، ص ${ar(43)}`,
    },
  ],
};

/** الإتقان من آخر ٨ إجابات مؤهلة (الأمر §4.4) */
export type Mastery = "mastered" | "progress" | "review" | "few" | "locked" | "new";

export const MASTERY: Record<Mastery, { label: string; glow: number }> = {
  mastered: { label: "متقن", glow: 1 },
  progress: { label: "يتقدّم", glow: 0.7 },
  review: { label: "يحتاج مراجعة", glow: 0.45 },
  few: { label: "بيانات قليلة", glow: 0.3 },
  new: { label: "مفتوح، لم يبدأ", glow: 0.2 },
  locked: { label: "مقفل", glow: 0 },
};

export type MapLesson = { n: number; title: string; mastery: Mastery; stars: number };
export type MapUnit = { n: number; title: string; lessons: MapLesson[]; challenge: { open: boolean; stars: number } };

/** كوكبة العالم: العلوم × الفصل الأول (تجريبي). الإحداثيات تُحسب في lab.tsx حسب عرض الشاشة. */
export const WORLD = {
  subject: "العلوم",
  grade: "الصف السابع",
  term: "الفصل الأول",
  litStars: 9,
  totalStars: 30,
  units: [
    {
      n: 1,
      title: "المادة وخواصها",
      lessons: [
        { n: 1, title: "ما المادة؟", mastery: "mastered", stars: 3 },
        { n: 2, title: "الكتلة والحجم", mastery: "mastered", stars: 3 },
        { n: 3, title: "الكثافة", mastery: "progress", stars: 2 },
      ],
      challenge: { open: true, stars: 1 },
    },
    {
      n: 2,
      title: "حالات المادة وتحوّلاتها",
      lessons: [
        { n: 1, title: "الصلب والسائل والغاز", mastery: "progress", stars: 2 },
        { n: 2, title: "حركة الجزيئات", mastery: "review", stars: 1 },
        { n: 3, title: "حالات المادة", mastery: "few", stars: 0 },
        { n: 4, title: "الانصهار والتبخر", mastery: "new", stars: 0 },
      ],
      challenge: { open: false, stars: 0 },
    },
    {
      n: 3,
      title: "المخاليط والمحاليل",
      lessons: [
        { n: 1, title: "المخاليط", mastery: "locked", stars: 0 },
        { n: 2, title: "المحاليل", mastery: "locked", stars: 0 },
        { n: 3, title: "فصل المخاليط", mastery: "locked", stars: 0 },
      ],
      challenge: { open: false, stars: 0 },
    },
  ] satisfies MapUnit[],
  current: { unit: 2, lesson: 3 },
};
