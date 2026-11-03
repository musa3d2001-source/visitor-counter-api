/**
 * ألوان المواد والصفوف لاتجاه «ألوان المواد» (v2-a).
 * كل مادة لها تدرج + لون نص داكن متباين (AA) فوق الخلفية الفاتحة tint.
 * النص الأبيض يوضع دائمًا فوق الطرف الداكن من التدرج (to) أو فوق غشاء داكن.
 */
import { ARABIC_DIGITS } from "../data";

export type SubjectKey = "math" | "science" | "arabic" | "english" | "islamic" | "social" | "other";

export type Tone = {
  key: SubjectKey;
  /** طرف التدرج الفاتح */
  from: string;
  /** طرف التدرج الداكن (يحمل النص الأبيض، تباين 4.5 أو أعلى) */
  to: string;
  solid: string;
  /** خلفية فاتحة جدًا */
  tint: string;
  /** لون نص فوق tint والأبيض (AA) */
  ink: string;
};

export const SUBJECT_TONES: Record<SubjectKey, Tone> = {
  math: { key: "math", from: "#3D8BFF", to: "#2647D8", solid: "#2F6BF0", tint: "#EAF1FF", ink: "#1D3FB8" },
  science: { key: "science", from: "#16B97A", to: "#05865A", solid: "#0E9F6A", tint: "#E6F7EF", ink: "#06724D" },
  arabic: { key: "arabic", from: "#FF8A5B", to: "#D93636", solid: "#F05A43", tint: "#FFEEE8", ink: "#B8321F" },
  english: { key: "english", from: "#F25C9E", to: "#B9257A", solid: "#DE3F8C", tint: "#FDEAF3", ink: "#A61D66" },
  islamic: { key: "islamic", from: "#14B3A8", to: "#0B6F86", solid: "#0F9A9A", tint: "#E3F6F5", ink: "#0A6670" },
  social: { key: "social", from: "#FFB22E", to: "#C2540A", solid: "#F28A1A", tint: "#FFF3E0", ink: "#A34A06" },
  other: { key: "other", from: "#8F6BFF", to: "#5631F0", solid: "#6C47FF", tint: "#F0ECFF", ink: "#4C2BC9" },
};

/** ترتيب عرض «طيف المواد» */
export const SUBJECT_ORDER: { key: SubjectKey; name: string }[] = [
  { key: "math", name: "الرياضيات" },
  { key: "science", name: "العلوم" },
  { key: "arabic", name: "اللغة العربية" },
  { key: "english", name: "اللغة الإنجليزية" },
  { key: "islamic", name: "التربية الإسلامية" },
  { key: "social", name: "الاجتماعيات" },
];

/** مطابقة المادة باسمها المختصر (slug) أو اسمها العربي، مع لون احتياطي */
export function subjectKey(slug?: string | null, name?: string | null): SubjectKey {
  const s = (slug ?? "").toLowerCase();
  const n = name ?? "";
  if (s.includes("math") || n.includes("رياضيات")) return "math";
  if (s.includes("scien") || n.includes("علوم")) return "science";
  if (s.includes("arab") || n.includes("العربية")) return "arabic";
  if (s.includes("engl") || n.includes("الإنجليزية") || n.includes("الانجليزية")) return "english";
  if (s.includes("islam") || n.includes("الإسلامية") || n.includes("دين")) return "islamic";
  if (s.includes("social") || n.includes("اجتماعيات")) return "social";
  return "other";
}

export function toneFor(slug?: string | null, name?: string | null): Tone {
  return SUBJECT_TONES[subjectKey(slug, name)];
}

/** تدرجات الصفوف: بطاقات جريئة برقم ضخم */
export type GradeTone = { from: string; via: string; to: string; ink: string; glow: string };
const GRADE_TONES: GradeTone[] = [
  { from: "#FFB443", via: "#FF7A45", to: "#F0466E", ink: "#B8321F", glow: "rgb(255 106 69 / 0.45)" },
  { from: "#3FE0B5", via: "#14B3A8", to: "#0B7E8C", ink: "#0A6670", glow: "rgb(20 179 168 / 0.45)" },
  { from: "#5FB2FF", via: "#4A7BFF", to: "#5B36F0", ink: "#3A2BC9", glow: "rgb(74 123 255 / 0.45)" },
  { from: "#C77DFF", via: "#A24DF0", to: "#E0408A", ink: "#8E1F7A", glow: "rgb(196 72 200 / 0.45)" },
];
export function gradeTone(level: number): GradeTone {
  return GRADE_TONES[(((level - 6) % 4) + 4) % 4];
}

export const grad = (t: { from: string; to: string }, angle = 135) => `linear-gradient(${angle}deg, ${t.from}, ${t.to})`;

/**
 * العدد والمعدود بالعربية:
 * ١ و٢ بصيغهما الخاصة، ٣ إلى ١٠ جمع، ١١ إلى ٩٩ مفرد منصوب، المئات مفرد مجرور.
 */
export function countAr(n: number, f: { one: string; two: string; few: string; many: string; hundred?: string }): string {
  if (n === 1) return f.one;
  if (n === 2) return f.two;
  const r = n % 100;
  const num = ARABIC_DIGITS(n);
  if (n >= 3 && n <= 10) return `${num} ${f.few}`;
  if (r >= 3 && r <= 10) return `${num} ${f.few}`;
  if (r >= 11 && r <= 99) return `${num} ${f.many}`;
  return `${num} ${f.hundred ?? f.many}`;
}

export const LESSONS = { one: "درس واحد", two: "درسان", few: "دروس", many: "درسًا", hundred: "درس" };
export const VIDEO_LESSONS = { one: "درس مرئي واحد", two: "درسان مرئيان", few: "دروس مرئية", many: "درسًا مرئيًا", hundred: "درس مرئي" };
export const SUBJECTS = { one: "مادة واحدة", two: "مادتان", few: "مواد", many: "مادة", hundred: "مادة" };
export const ITEMS = { one: "شرح أو مذكرة", two: "عنصران", few: "شروحات ومذكرات", many: "شرحًا ومذكرة", hundred: "شرح ومذكرة" };
export const TEACHERS = { one: "معلم واحد", two: "معلمان", few: "معلمين", many: "معلمًا", hundred: "معلم" };
export const PAGES = { one: "صفحة واحدة", two: "صفحتان", few: "صفحات", many: "صفحةً", hundred: "صفحة" };
export const GRADES = { one: "صف واحد", two: "صفان", few: "صفوف", many: "صفًا", hundred: "صف" };
export const PRODUCTS = { one: "منتج واحد", two: "منتجان", few: "منتجات", many: "منتجًا", hundred: "منتج" };

/** العدد منفصلًا عن المعدود (لبطاقات الإحصاء: رقم كبير وتحته الاسم) */
export function countParts(n: number, f: { one: string; two: string; few: string; many: string; hundred?: string }): { num: string; label: string } {
  const r = n % 100;
  const label = n === 1 ? f.one : n === 2 ? f.two : (r >= 3 && r <= 10) || (n >= 3 && n <= 10) ? f.few : r >= 11 ? f.many : (f.hundred ?? f.many);
  return { num: ARABIC_DIGITS(n), label };
}

/** الحرف الأول من اسم المعلم بعد اللقب */
export function initialOf(name: string): string {
  const clean = name.replace(/^\s*(أ\.|أ\/|د\.|م\.|الأستاذة?|الأستاذ)\s*/u, "").trim();
  return Array.from(clean)[0] ?? "؟";
}

/** نسبة التوفير الحقيقية (مقربة للأسفل كي لا نبالغ) */
export function savePercent(price: number, compareAt: number | null): number {
  if (!compareAt || compareAt <= price) return 0;
  return Math.floor(((compareAt - price) / compareAt) * 100);
}
