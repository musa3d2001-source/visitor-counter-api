/**
 * مختبر فقط (المرحلة ٠، ليس كود إنتاج): بيانات تجريبية للاتجاه الفني ج «سماء الشروق».
 * ليست من قاعدة البيانات ولا تُعرض للطلاب. الأسئلة والشروح مكتوبة للمعاينة،
 * والمرجع بصيغة مرجع الكتاب المطلوبة في الأمر (§4.2) لا نقلًا من كتاب.
 */
import type { CountWord } from "@/lib/design";

export type Screen = "scene" | "question" | "results" | "map";
export const SCREENS: { key: Screen; label: string }[] = [
  { key: "scene", label: "مشهد المستوى" },
  { key: "question", label: "لوح السؤال" },
  { key: "results", label: "النتائج" },
  { key: "map", label: "خريطة العالم" },
];

/** معدودات اللعبة (تُمرَّر إلى count / countParts) */
export const GW = {
  shot: { one: "طلقة", two: "طلقتان", plural: "طلقات", acc: "طلقة", oneSuffix: "واحدة" },
  slot: { one: "خانة", two: "خانتان", plural: "خانات", acc: "خانة", oneSuffix: "واحدة" },
  question: { one: "سؤال", two: "سؤالان", plural: "أسئلة", acc: "سؤالًا" },
  level: { one: "مستوى", two: "مستويان", plural: "مستويات", acc: "مستوى" },
  lantern: { one: "قنديل", two: "قنديلان", plural: "قناديل", acc: "قنديلًا" },
  point: { one: "نقطة", two: "نقطتان", plural: "نقاط", acc: "نقطة", oneSuffix: "واحدة" },
} as const satisfies Record<string, CountWord>;

export const LEVEL = {
  subject: "العلوم",
  grade: "الصف السابع",
  term: "الفصل الأول",
  unit: 2,
  lesson: 3,
  title: "تغيّر حالات المادة",
  slots: 5,
  /** خانات استُهلكت: [نوع الطلقة التي أطلقتها] */
  spent: ["meteor", "pebble"] as const,
  /** الخانة الحالية ربحت شهابًا */
  current: "meteor" as const,
  par: 4,
  lanterns: 3,
  angle: 40,
  power: 64,
  special: { name: "نيزك ثقيل", hint: "المسه أثناء الطيران", count: 1 },
};

export type ChoiceKey = "a" | "b" | "c" | "d";
export const LETTERS: Record<ChoiceKey, string> = { a: "أ", b: "ب", c: "ج", d: "د" };

export const QUESTION = {
  slot: 3,
  stem: "عند تسخين مكعب جليد حتى يصير ماءً سائلًا، ماذا يحدث لجسيماته؟",
  choices: [
    { key: "a", text: "تتوقف عن الحركة تمامًا" },
    { key: "b", text: "تزداد سرعة حركتها وتتحرر من مواقعها الثابتة" },
    { key: "c", text: "يقل عددها لأن جزءًا منها يذوب" },
    { key: "d", text: "تتحول كلها إلى غاز في الحال" },
  ] as { key: ChoiceKey; text: string }[],
  correct: "b" as ChoiceKey,
  picked: "c" as ChoiceKey,
  explanation:
    "الحرارة تزيد طاقة حركة الجسيمات، فتهتز أسرع حتى تتحرر من مواقعها الثابتة ويصير الجليد سائلًا. عدد الجسيمات لا يتغير أبدًا، الذي يتغير هو سرعتها والمسافات بينها.",
  reference: "كتاب العلوم، الصف السابع، الفصل الأول، الوحدة ٢، الدرس ٣، ص ٤٥",
};

export type StarKey = "complete" | "knowledge" | "skill";
export const RESULTS = {
  points: 1240,
  answered: 5,
  correct: 3,
  shots: 4,
  par: 4,
  stars: [
    {
      key: "complete" as StarKey,
      name: "الإتمام",
      earned: true,
      reason: "حرّرت القناديل الثلاثة وأجبت عن ٥ أسئلة، والمطلوب ٣ على الأقل.",
    },
    {
      key: "knowledge" as StarKey,
      name: "المعرفة",
      earned: false,
      reason: "دقتك هذه الجولة ٦٠٪: ٣ إجابات صحيحة من ٥.",
      missing: "تحتاج دقة ٨٠٪ فأكثر على ٥ أسئلة على الأقل، أي ٤ صحيحة من ٥.",
    },
    {
      key: "skill" as StarKey,
      name: "المهارة",
      earned: true,
      reason: "أنهيت المستوى بـ ٤ طلقات، والحد ٤ طلقات.",
    },
  ],
  mistakes: [
    {
      stem: "عند تسخين مكعب جليد حتى يصير ماءً سائلًا، ماذا يحدث لجسيماته؟",
      yours: "يقل عددها لأن جزءًا منها يذوب",
      right: "تزداد سرعة حركتها وتتحرر من مواقعها الثابتة",
      reference: "كتاب العلوم، الصف السابع، الفصل الأول، الوحدة ٢، الدرس ٣، ص ٤٥",
    },
    {
      stem: "أي حالات المادة لها شكل ثابت وحجم ثابت؟",
      yours: "الحالة السائلة",
      right: "الحالة الصلبة",
      reference: "كتاب العلوم، الصف السابع، الفصل الأول، الوحدة ٢، الدرس ١، ص ٣٨",
    },
  ],
};

/** الإتقان من آخر ٨ إجابات مؤهلة (§4.4) */
export type Mastery = "mastered" | "progressing" | "review" | "few" | "locked";
export const MASTERY: Record<Mastery, { label: string; hint: string }> = {
  mastered: { label: "متقن", hint: "٨٠٪ فأكثر" },
  progressing: { label: "يتقدّم", hint: "من ٥٠٪ إلى ٧٩٪" },
  review: { label: "يحتاج مراجعة", hint: "أقل من ٥٠٪" },
  few: { label: "بيانات قليلة", hint: "أقل من ٤ إجابات" },
  locked: { label: "مقفل", hint: "أكمل ما قبله" },
};

export type MapStar = {
  id: string;
  name: string;
  /** موضع النجمة في عنقود الوحدة (viewBox ‎320×240‎)، الدرس الأول يمينًا */
  x: number;
  y: number;
  mastery: Mastery;
  /** قناع النجوم الثلاث: الإتمام، المعرفة، المهارة */
  stars: [boolean, boolean, boolean];
  challenge?: boolean;
  current?: boolean;
};
export type MapUnit = { n: number; title: string; color: string; stars: MapStar[] };

export const WORLD: { subject: string; grade: string; term: string; units: MapUnit[] } = {
  subject: "العلوم",
  grade: "الصف السابع",
  term: "الفصل الأول",
  units: [
    {
      n: 1,
      title: "المادة وخصائصها",
      color: "#18B9A7",
      stars: [
        { id: "1-1", name: "ما المادة؟", x: 268, y: 150, mastery: "mastered", stars: [true, true, true] },
        { id: "1-2", name: "الكتلة والحجم", x: 196, y: 58, mastery: "mastered", stars: [true, true, false] },
        { id: "1-3", name: "الكثافة", x: 124, y: 150, mastery: "progressing", stars: [true, false, true] },
        { id: "1-c", name: "تحدّي الوحدة", x: 52, y: 62, mastery: "progressing", stars: [true, false, false], challenge: true },
      ],
    },
    {
      n: 2,
      title: "حالات المادة",
      color: "#FF9F43",
      stars: [
        { id: "2-1", name: "الحالة الصلبة", x: 276, y: 58, mastery: "progressing", stars: [true, true, false] },
        { id: "2-2", name: "السوائل والغازات", x: 218, y: 150, mastery: "review", stars: [true, false, false] },
        { id: "2-3", name: "تغيّر الحالات", x: 160, y: 58, mastery: "few", stars: [false, false, false], current: true },
        { id: "2-4", name: "الحرارة والضغط", x: 102, y: 150, mastery: "locked", stars: [false, false, false] },
        { id: "2-c", name: "تحدّي الوحدة", x: 42, y: 62, mastery: "locked", stars: [false, false, false], challenge: true },
      ],
    },
    {
      n: 3,
      title: "الخلائط والمحاليل",
      color: "#D9468F",
      stars: [
        { id: "3-1", name: "الخلائط", x: 268, y: 150, mastery: "locked", stars: [false, false, false] },
        { id: "3-2", name: "المحاليل", x: 196, y: 58, mastery: "locked", stars: [false, false, false] },
        { id: "3-3", name: "فصل المخاليط", x: 124, y: 150, mastery: "locked", stars: [false, false, false] },
        { id: "3-c", name: "تحدّي الوحدة", x: 52, y: 62, mastery: "locked", stars: [false, false, false], challenge: true },
      ],
    },
  ],
};

/** المستوى مكتمل بنجمة الإتمام (§4.4) */
export function worldProgress() {
  const all = WORLD.units.flatMap((u) => u.stars);
  const done = all.filter((s) => s.stars[0]).length;
  return { done, total: all.length, dawn: done / all.length };
}
