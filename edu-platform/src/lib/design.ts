/**
 * أدوات نظام التصميم «الفصل المشمس» (v2-c): ألوان المواد والصفوف، والعدّ العربي الصحيح.
 * المرجع: src/app/lab/v2-c/lib.ts — وهذا هو الإصدار المعتمد للمنصة كلها.
 * القيم هنا تطابق أصناف .tone-* و .grade-* في src/app/globals.css.
 */
import type { CSSProperties } from "react";

export type Tone = { from: string; to: string; deep: string; soft: string; ink: string };
export type GradeTone = Tone & { mid: string; name: string };

/** ألوان المواد: تدرج (من/إلى)، حافة داكنة، خلفية فاتحة، ولون نص AA فوق الخلفية الفاتحة */
export const SUBJECT_TONES: Record<string, Tone> = {
  math: { from: "#5B9BFF", to: "#3B3FD8", deep: "#2B2EA8", soft: "#E8EEFF", ink: "#2B33B5" },
  science: { from: "#34D9A0", to: "#0B8A66", deep: "#076B4F", soft: "#DEF8EE", ink: "#0A6F52" },
  english: { from: "#FF85B8", to: "#C42F86", deep: "#962267", soft: "#FFE6F1", ink: "#A8256F" },
  arabic: { from: "#FFA266", to: "#E2463A", deep: "#B4322A", soft: "#FFEBDF", ink: "#B83A22" },
  islamic: { from: "#3DD0C4", to: "#0B7482", deep: "#085A66", soft: "#DDF6F4", ink: "#0A6670" },
  social: { from: "#FFC93F", to: "#E2780E", deep: "#B25A06", soft: "#FFF2D6", ink: "#9A4F05" },
};
export const FALLBACK_TONE: Tone = { from: "#A880FF", to: "#6A3FE0", deep: "#5230B8", soft: "#F0EAFF", ink: "#5A34C9" };

/** ترتيب المواد الثابت في الواجهات */
export const SUBJECT_ORDER = ["arabic", "english", "math", "science", "islamic", "social"] as const;

/** ألوان شريط «قوس قزح المواد» */
export const RAINBOW = ["#FF6B5A", "#FFC531", "#18B9A7", "#4D8DFF", "#9B5CF6"] as const;

export function subjectTone(slug: string | null | undefined): Tone {
  return (slug && SUBJECT_TONES[slug]) || FALLBACK_TONE;
}

/** ألوان الصفوف: ٦ شروق، ٧ بحر، ٨ سماء، ٩ توت */
export const GRADE_TONES: Record<number, GradeTone> = {
  6: { from: "#FFD25E", mid: "#FF9F43", to: "#FF6B5A", deep: "#D9512F", soft: "#FFF1DE", ink: "#A9401F", name: "شروق" },
  7: { from: "#6EEBD3", mid: "#18B9A7", to: "#0B7F86", deep: "#08636A", soft: "#DDF7F2", ink: "#08656B", name: "بحر" },
  8: { from: "#86CBFF", mid: "#4D8DFF", to: "#5948E0", deep: "#3E33B3", soft: "#E6EEFF", ink: "#3A35B0", name: "سماء" },
  9: { from: "#D0A4FF", mid: "#9B5CF6", to: "#E0509A", deep: "#8E2C83", soft: "#F6E9FF", ink: "#7A2C8E", name: "توت" },
};
export function gradeTone(level: number | null | undefined): GradeTone {
  return (level != null && GRADE_TONES[level]) || { ...FALLBACK_TONE, mid: "#8B5CF6", name: "" };
}

/** «grade-9» ← 9 (أو null إن لم يكن بالصيغة المتوقعة) */
export function gradeLevelFromSlug(slug: string | null | undefined): number | null {
  const m = /(\d{1,2})$/.exec(slug ?? "");
  return m ? Number(m[1]) : null;
}

/** صنف CSS لمتغيرات لون المادة: «tone-math» … أو «tone-default» */
export function toneClass(slug: string | null | undefined): string {
  return slug && SUBJECT_TONES[slug] ? `tone-${slug}` : "tone-default";
}
/** صنف CSS لمتغيرات لون الصف: «grade-6» … (أو tone-default لصف غير معروف) */
export function gradeClass(level: number | null | undefined): string {
  return level != null && GRADE_TONES[level] ? `grade-${level}` : "tone-default";
}

export type ToneVars = CSSProperties & Record<`--${string}`, string>;
/** متغيرات CSS (‎--a --b --d --soft --tink‎) لأي نغمة: style={toneVars(subjectTone(slug))} */
export function toneVars(t: Tone): ToneVars {
  return { "--a": t.from, "--b": t.to, "--d": t.deep, "--soft": t.soft, "--tink": t.ink };
}
export function subjectVars(slug: string | null | undefined): ToneVars {
  return toneVars(subjectTone(slug));
}
/** متغيرات الصف، مع ‎--m‎ (اللون الأوسط في التدرج الثلاثي) */
export function gradeVars(level: number | null | undefined): ToneVars {
  const g = gradeTone(level);
  return { ...toneVars(g), "--m": g.mid };
}

/* ───────────── الأرقام والعدّ ───────────── */

const AR = "٠١٢٣٤٥٦٧٨٩";
/** أرقام هندية عربية للأعداد والسنوات والخطوات (الأسعار بالأرقام اللاتينية) */
export const ar = (n: number | string) => String(n).replace(/\d/g, (d) => AR[Number(d)]);

export type CountWord = { one: string; two: string; plural: string; acc: string; single?: string; oneSuffix?: string; none?: string; oneAcc?: string; twoAcc?: string };

/**
 * العدد والمعدود بقواعد العربية:
 * ١ ← «درس واحد»، ٢ ← «درسان»، ٣–١٠ ← «٣ دروس»، ١١–٩٩ ← «١١ درسًا»، ١٠٠ ← «١٠٠ درس»
 */
export function count(n: number, w: CountWord): string {
  if (n === 0 && w.none) return w.none;
  if (n === 1) return w.single ?? `${w.one} ${w.oneSuffix ?? "واحد"}`;
  if (n === 2) return w.two;
  const m = n % 100;
  if (m >= 3 && m <= 10) return `${ar(n)} ${w.plural}`;
  if (m >= 11 && m <= 99) return `${ar(n)} ${w.acc}`;
  return `${ar(n)} ${w.one}`;
}

/**
 * الرقم والمعدود منفصلين (للأرقام البارزة): ٢٤ + «درسًا مرئيًا».
 * الواحد والاثنان لا يُكتبان برقم في العربية: ١ ← «معلم» + «واحد»، ٢ ← «معلمان».
 */
export function countParts(n: number, w: CountWord): { num: string; label: string } {
  if (n === 1) return w.single ? { num: w.single, label: "" } : { num: w.one, label: w.oneSuffix ?? "واحد" };
  if (n === 2) return { num: w.two, label: "" };
  const m = n % 100;
  const label = m >= 3 && m <= 10 ? w.plural : m >= 11 && m <= 99 ? w.acc : w.one;
  return { num: ar(n), label };
}

/** المعدود منصوبًا بعد فعل: «تضم منتجًا واحدًا» / «تضم منتجين» / «تضم ٤ منتجات» */
export function countAcc(n: number, w: CountWord): string {
  if (n === 1 && w.oneAcc) return w.oneAcc;
  if (n === 2 && w.twoAcc) return w.twoAcc;
  return count(n, w);
}

/** صيغ المعدودات الشائعة في المنصة */
export const W = {
  lesson: { one: "درس", two: "درسان", plural: "دروس", acc: "درسًا" },
  videoLesson: { one: "درس مرئي", two: "درسان مرئيان", plural: "دروس مرئية", acc: "درسًا مرئيًا" },
  teacher: { one: "معلم", two: "معلمان", plural: "معلمين", acc: "معلمًا" },
  grade: { one: "صف", two: "صفّان", plural: "صفوف", acc: "صفًّا" },
  subject: { one: "مادة", two: "مادتان", plural: "مواد", acc: "مادة", oneSuffix: "واحدة" },
  product: { one: "منتج", two: "منتجان", plural: "منتجات", acc: "منتجًا", oneAcc: "منتجًا واحدًا", twoAcc: "منتجين" },
  page: { one: "صفحة", two: "صفحتان", plural: "صفحات", acc: "صفحة", oneSuffix: "واحدة" },
  note: { one: "مذكرة", two: "مذكرتان", plural: "مذكرات", acc: "مذكرة", oneSuffix: "واحدة" },
  item: { one: "عنصر", two: "عنصران", plural: "عناصر", acc: "عنصرًا" },
  order: { one: "طلب", two: "طلبان", plural: "طلبات", acc: "طلبًا" },
  student: { one: "طالب", two: "طالبان", plural: "طلاب", acc: "طالبًا" },
  day: { one: "يوم", two: "يومان", plural: "أيام", acc: "يومًا" },
  minute: { one: "دقيقة", two: "دقيقتان", plural: "دقائق", acc: "دقيقة", single: "دقيقة", oneSuffix: "واحدة" },
  hour: { one: "ساعة", two: "ساعتان", plural: "ساعات", acc: "ساعة", single: "ساعة", oneSuffix: "واحدة" },
} as const satisfies Record<string, CountWord>;

/** المدة المختصرة: ثوانٍ قليلة تُعرض «أقل من دقيقة» بدل رقم مضلل */
export function duration(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "";
  if (sec < 60) return "أقل من دقيقة";
  const m = Math.round(sec / 60);
  if (m < 60) return count(m, W.minute);
  const h = Math.floor(m / 60);
  const r = m % 60;
  const hs = count(h, W.hour);
  return r ? `${hs} و${ar(r)} د` : hs;
}

/** «2026-2027» ← «٢٠٢٦/٢٠٢٧» */
export function academicYearLabel(year: string | null | undefined): string {
  return ar((year ?? "").replace("-", "/"));
}

/* ───────────── الأسماء والأسعار ───────────── */

/** الحرف الأول من اسم المعلم بعد حذف اللقب «أ.» */
export function initial(name: string | null | undefined): string {
  const clean = (name ?? "").replace(/^\s*(أ\.|د\.|م\.|الأستاذة|الأستاذ|المعلمة|المعلم)\s*/u, "").trim();
  return clean.charAt(0) || "د";
}

/** الاسم بدون اللاحقة التجريبية لعرضه في المساحات الضيقة */
export function shortName(name: string | null | undefined): string {
  return (name ?? "").replace(/\s*\((معلم|معلمة) تجريبي(ة)?\)\s*/u, "").trim();
}

/** التوفير الحقيقي فقط: يعيد null ما لم يكن السعر قبل الخصم أعلى من السعر الحالي */
export function savings(price: number, compare: number | null | undefined) {
  if (!compare || compare <= price) return null;
  const fils = compare - price;
  return { fils, pct: Math.round((fils / compare) * 100) };
}
