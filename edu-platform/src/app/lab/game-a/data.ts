/**
 * بيانات تجريبية للمختبر فقط (اتجاه فني «فانوس الساحل»): ليست من قاعدة البيانات ولا تُعرض للطلاب.
 * الأسئلة والشروح مكتوبة للمعاينة، والمرجع بصيغة مرجع الكتاب المطلوبة في الأمر (§4.2) لا نقلًا من كتاب.
 */

export type Screen = "scene" | "question" | "results" | "map";
export const SCREENS: { key: Screen; label: string }[] = [
  { key: "scene", label: "مشهد المستوى" },
  { key: "question", label: "لوح السؤال" },
  { key: "results", label: "النتائج" },
  { key: "map", label: "خريطة العالم" },
];

export const LEVEL = {
  subject: "العلوم",
  grade: "الصف السابع",
  unit: 2,
  lesson: 3,
  title: "حالات المادة",
  slots: 5,
  par: 4,
  lanterns: 3,
  freed: 1,
};

export type Choice = { id: string; letter: string; text: string };
export const LETTERS = ["أ", "ب", "ج", "د"] as const;

export const QUESTION = {
  slot: 3,
  stem: "ماذا يحدث لجزيئات الماء عندما نسخّن قطعة ثلج حتى تنصهر؟",
  choices: [
    { id: "c1", letter: "أ", text: "تتوقف عن الحركة تمامًا" },
    { id: "c2", letter: "ب", text: "يصغر حجم كل جزيء منها" },
    { id: "c3", letter: "ج", text: "تزداد سرعة حركتها وتتباعد قليلًا" },
    { id: "c4", letter: "د", text: "تتحول إلى نوع جديد من المادة" },
  ] satisfies Choice[],
  correctId: "c3",
  pickedId: "c2",
  explanation:
    "عند التسخين تكتسب الجزيئات طاقة فتتحرك أسرع وتضعف قوى التجاذب بينها، فتنتقل المادة من الحالة الصلبة إلى السائلة. حجم الجزيء نفسه لا يتغير، والماء يبقى ماءً.",
  reference: "كتاب العلوم، الصف السابع، الفصل الأول، الوحدة ٢، الدرس ٣، ص ٤٥",
};

export type StarResult = { key: "complete" | "knowledge" | "skill"; title: string; earned: boolean; text: string };
export const RESULTS = {
  shots: 4,
  par: 4,
  correct: 3,
  answered: 5,
  points: "١٬٢٤٠",
  stars: [
    { key: "complete", title: "نجمة الإتمام", earned: true, text: "حرّرت القناديل الثلاثة وأجبت عن ٥ أسئلة، والمطلوب ٣ أسئلة على الأقل." },
    {
      key: "knowledge",
      title: "نجمة المعرفة",
      earned: false,
      text: "تحتاج دقة ٨٠٪ على ٥ أسئلة. أجبت ٣ من ٥ صحيحة (٦٠٪)، فينقصك سؤال واحد صحيح لتنالها في المحاولة القادمة.",
    },
    { key: "skill", title: "نجمة المهارة", earned: true, text: "أنهيت المستوى بـ ٤ طلقات، والحد ٤ طلقات أو أقل." },
  ] satisfies StarResult[],
  mistakes: [
    {
      stem: "ماذا يحدث لجزيئات الماء عندما نسخّن قطعة ثلج حتى تنصهر؟",
      picked: "يصغر حجم كل جزيء منها",
      correct: "تزداد سرعة حركتها وتتباعد قليلًا",
      reference: "كتاب العلوم، الصف السابع، الفصل الأول، الوحدة ٢، الدرس ٣، ص ٤٥",
    },
    {
      stem: "أي العمليات التالية تحوّل الغاز إلى سائل؟",
      picked: "التبخر",
      correct: "التكثف",
      reference: "كتاب العلوم، الصف السابع، الفصل الأول، الوحدة ٢، الدرس ٣، ص ٤٧",
    },
  ],
};

/** الإتقان: من آخر ٨ إجابات مؤهلة (§4.4). السطوع يعكسه. */
export type Mastery = "mastered" | "progress" | "review" | "few" | "locked";
export const MASTERY_LABEL: Record<Mastery, string> = {
  mastered: "متقن",
  progress: "يتقدّم",
  review: "يحتاج مراجعة",
  few: "بيانات قليلة",
  locked: "مقفل",
};

export type MapNode = { n: number; title: string; mastery: Mastery; stars: number; current?: boolean };
export type MapUnit = { n: number; title: string; lessons: MapNode[]; challenge: { mastery: Mastery; stars: number } };

export const WORLD = {
  subject: "العلوم",
  grade: "الصف السابع",
  term: "الفصل الأول",
  lanternsFreed: 21,
  lanternsTotal: 45,
  units: [
    {
      n: 1,
      title: "المادة من حولنا",
      lessons: [
        { n: 1, title: "ما المادة؟", mastery: "mastered", stars: 3 },
        { n: 2, title: "الكتلة والحجم", mastery: "mastered", stars: 3 },
        { n: 3, title: "الكثافة", mastery: "progress", stars: 2 },
        { n: 4, title: "قياس الأشياء", mastery: "review", stars: 1 },
      ],
      challenge: { mastery: "progress", stars: 2 },
    },
    {
      n: 2,
      title: "حالات المادة وتحوّلاتها",
      lessons: [
        { n: 1, title: "الصلب والسائل والغاز", mastery: "mastered", stars: 3 },
        { n: 2, title: "حركة الجزيئات", mastery: "progress", stars: 2 },
        { n: 3, title: "حالات المادة", mastery: "few", stars: 0, current: true },
        { n: 4, title: "الانصهار والتجمد", mastery: "locked", stars: 0 },
      ],
      challenge: { mastery: "locked", stars: 0 },
    },
    {
      n: 3,
      title: "المخاليط والمحاليل",
      lessons: [
        { n: 1, title: "المخاليط", mastery: "locked", stars: 0 },
        { n: 2, title: "المحاليل", mastery: "locked", stars: 0 },
        { n: 3, title: "فصل المخاليط", mastery: "locked", stars: 0 },
        { n: 4, title: "الذوبان", mastery: "locked", stars: 0 },
      ],
      challenge: { mastery: "locked", stars: 0 },
    },
  ] satisfies MapUnit[],
};

/** المواد الست (§4.1) بألوانها في هذا الاتجاه، لدليل المختبر */
export const MATERIALS = [
  { key: "frond", name: "سعف", note: "خفيف، يتمايل وينكسر بسهولة" },
  { key: "teak", name: "خشب ساج", note: "متين ومتوسط الوزن" },
  { key: "stone", name: "حجر بحري", note: "ثقيل، يكسره النيزك الثقيل" },
  { key: "glass", name: "زجاج ملوّن", note: "هش، يتشظى بلمسة" },
  { key: "cloud", name: "غيم", note: "شديد الارتداد" },
  { key: "lightbox", name: "صندوق ضوء", note: "نبضة تدفع ما حوله" },
] as const;
