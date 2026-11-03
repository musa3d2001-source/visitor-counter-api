/** أدوات الاتجاه v2-c «الفصل المشمس»: ألوان المواد والصفوف، والعدّ العربي الصحيح */

export type Tone = { from: string; to: string; deep: string; soft: string; ink: string };

/** ألوان المواد: تدرج (من/إلى)، حافة داكنة، خلفية فاتحة، ولون نص فوق الخلفية الفاتحة */
export const SUBJECT_TONES: Record<string, Tone> = {
  math: { from: "#5B9BFF", to: "#3B3FD8", deep: "#2B2EA8", soft: "#E8EEFF", ink: "#2B33B5" },
  science: { from: "#34D9A0", to: "#0B8A66", deep: "#076B4F", soft: "#DEF8EE", ink: "#0A6F52" },
  english: { from: "#FF85B8", to: "#C42F86", deep: "#962267", soft: "#FFE6F1", ink: "#A8256F" },
  arabic: { from: "#FFA266", to: "#E2463A", deep: "#B4322A", soft: "#FFEBDF", ink: "#B83A22" },
  islamic: { from: "#3DD0C4", to: "#0B7482", deep: "#085A66", soft: "#DDF6F4", ink: "#0A6670" },
  social: { from: "#FFC93F", to: "#E2780E", deep: "#B25A06", soft: "#FFF2D6", ink: "#9A4F05" },
};
export const FALLBACK_TONE: Tone = { from: "#A880FF", to: "#6A3FE0", deep: "#5230B8", soft: "#F0EAFF", ink: "#5A34C9" };

export function subjectTone(slug: string | null | undefined): Tone {
  return (slug && SUBJECT_TONES[slug]) || FALLBACK_TONE;
}

/** ألوان الصفوف: ٦ شروق، ٧ بحر، ٨ سماء، ٩ توت */
export const GRADE_TONES: Record<number, Tone & { mid: string; name: string }> = {
  6: { from: "#FFD25E", mid: "#FF9F43", to: "#FF6B5A", deep: "#D9512F", soft: "#FFF1DE", ink: "#A9401F", name: "شروق" },
  7: { from: "#6EEBD3", mid: "#18B9A7", to: "#0B7F86", deep: "#08636A", soft: "#DDF7F2", ink: "#08656B", name: "بحر" },
  8: { from: "#86CBFF", mid: "#4D8DFF", to: "#5948E0", deep: "#3E33B3", soft: "#E6EEFF", ink: "#3A35B0", name: "سماء" },
  9: { from: "#D0A4FF", mid: "#9B5CF6", to: "#E0509A", deep: "#8E2C83", soft: "#F6E9FF", ink: "#7A2C8E", name: "توت" },
};
export function gradeTone(level: number) {
  return GRADE_TONES[level] ?? { ...FALLBACK_TONE, mid: "#8B5CF6", name: "" };
}

/** خريطة أسماء المواد إلى مفاتيحها (للبطاقات التي لا تحمل المفتاح) */
export const SUBJECT_ORDER = ["arabic", "english", "math", "science", "islamic", "social"] as const;

const AR = "٠١٢٣٤٥٦٧٨٩";
export const ar = (n: number | string) => String(n).replace(/\d/g, (d) => AR[Number(d)]);

/**
 * العدد والمعدود بقواعد العربية:
 * ١ ← «درس واحد»، ٢ ← «درسان»، ٣–١٠ ← «٣ دروس»، ١١–٩٩ ← «١١ درسًا»، ١٠٠ ← «١٠٠ درس»
 */
export function count(
  n: number,
  w: { one: string; two: string; plural: string; acc: string; single?: string; oneSuffix?: string },
): string {
  if (n === 1) return w.single ?? `${w.one} ${w.oneSuffix ?? "واحد"}`;
  if (n === 2) return w.two;
  const m = n % 100;
  if (m >= 3 && m <= 10) return `${ar(n)} ${w.plural}`;
  if (m >= 11 && m <= 99) return `${ar(n)} ${w.acc}`;
  return `${ar(n)} ${w.one}`;
}

/** الرقم والمعدود منفصلين (للأرقام البارزة): ٢٤ + «درسًا مرئيًا» */
export function countParts(n: number, w: { one: string; two: string; plural: string; acc: string }) {
  const m = n % 100;
  const label = n === 2 ? w.two : m >= 3 && m <= 10 ? w.plural : m >= 11 && m <= 99 ? w.acc : w.one;
  return { num: ar(n), label };
}

export const W = {
  lesson: { one: "درس", two: "درسان", plural: "دروس", acc: "درسًا" },
  videoLesson: { one: "درس مرئي", two: "درسان مرئيان", plural: "دروس مرئية", acc: "درسًا مرئيًا" },
  teacher: { one: "معلم", two: "معلمان", plural: "معلمين", acc: "معلمًا" },
  grade: { one: "صف", two: "صفّان", plural: "صفوف", acc: "صفًّا" },
  subject: { one: "مادة", two: "مادتان", plural: "مواد", acc: "مادة", oneSuffix: "واحدة" },
  product: { one: "منتج", two: "منتجان", plural: "منتجات", acc: "منتجًا" },
  page: { one: "صفحة", two: "صفحتان", plural: "صفحات", acc: "صفحة", oneSuffix: "واحدة" },
} as const;

/** المدة: ثوانٍ قليلة تُعرض «أقل من دقيقة» بدل رقم مضلل */
export function duration(sec: number): string {
  if (!sec) return "";
  if (sec < 60) return "أقل من دقيقة";
  const m = Math.round(sec / 60);
  if (m < 60) return m === 1 ? "دقيقة" : m === 2 ? "دقيقتان" : m <= 10 ? `${ar(m)} دقائق` : `${ar(m)} دقيقة`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  const hs = h === 1 ? "ساعة" : h === 2 ? "ساعتان" : `${ar(h)} ساعات`;
  return r ? `${hs} و${ar(r)} د` : hs;
}

/** الحرف الأول من اسم المعلم بعد حذف اللقب «أ.» */
export function initial(name: string | null | undefined): string {
  const clean = (name ?? "").replace(/^\s*(أ\.|د\.|م\.)\s*/, "").trim();
  return clean.charAt(0) || "د";
}

/** الاسم بدون اللاحقة التجريبية لعرضه في المساحات الضيقة */
export function shortName(name: string | null | undefined): string {
  return (name ?? "").replace(/\s*\((معلم|معلمة) تجريبي(ة)?\)\s*/, "").trim();
}

export function savings(price: number, compare: number | null) {
  if (!compare || compare <= price) return null;
  const fils = compare - price;
  return { fils, pct: Math.round((fils / compare) * 100) };
}
