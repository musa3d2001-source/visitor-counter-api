import { ARABIC_DIGITS, minutes } from "../data";
import { filsToKwdString } from "@/lib/money";
import type { ProductCard } from "@/server/catalog/queries";

/** أدوات العرض الخاصة بنموذج «ليلة الاختبار» (v2-b) */

export const ar = ARABIC_DIGITS;
export const kwd = filsToKwdString;

/** صيغ العدد والمعدود: [واحد، اثنان، ٣–١٠، ١١ فما فوق] */
export type Forms = readonly [string, string, string, string];

export const LESSONS: Forms = ["درس واحد", "درسان", "دروس", "درسًا"];
export const VIDEO_LESSONS: Forms = ["درس مرئي واحد", "درسان مرئيان", "دروس مرئية", "درسًا مرئيًا"];
export const SUBJECTS: Forms = ["مادة واحدة", "مادتان", "مواد", "مادة"];
export const ITEMS: Forms = ["شرح واحد", "شرحان", "شروح ومذكرات", "شرحًا ومذكرة"];
export const PAGES: Forms = ["صفحة واحدة", "صفحتان", "صفحات", "صفحة"];
export const TEACHERS: Forms = ["معلم واحد", "معلمان", "معلمين", "معلمًا"];
export const GRADES: Forms = ["صف واحد", "صفان", "صفوف", "صفًا"];
export const CONTENT: Forms = ["شرح واحد", "شرحان", "شروح", "شرحًا"];

export function count(n: number, f: Forms): string {
  if (n === 1) return f[0];
  if (n === 2) return f[1];
  const r = n % 100;
  if (r >= 3 && r <= 10) return `${ar(n)} ${f[2]}`;
  return `${ar(n)} ${f[3]}`;
}

export const ORDINALS = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"];

/** مدة صادقة: الثواني القليلة تُعرض «أقل من دقيقة» بدل تقريبها إلى دقيقة */
export function duration(sec: number): string {
  if (!sec) return "";
  if (sec < 60) return "أقل من دقيقة";
  return minutes(sec);
}

export function initial(name: string | null): string {
  return (name ?? "د").replace(/^أ\.\s*/, "").trim().charAt(0) || "د";
}

export function shortTeacher(name: string | null): string {
  return (name ?? "").replace(/\s*\((معلم|معلمة) تجريبي(ة)?\)\s*/, "").trim();
}

export function previewHref(p: ProductCard): string {
  return p.previewLessonId ? `/watch/${p.id}?lesson=${p.previewLessonId}` : `/products/${p.slug}`;
}

export function saving(p: ProductCard): number {
  return p.compareAtPriceFils && p.compareAtPriceFils > p.priceFils ? p.compareAtPriceFils - p.priceFils : 0;
}

export function percentOff(p: ProductCard): number {
  return p.compareAtPriceFils && p.compareAtPriceFils > p.priceFils ? Math.round((1 - p.priceFils / p.compareAtPriceFils) * 100) : 0;
}

export type SubjectKey = "math" | "science" | "english" | "arabic" | "islamic" | "social" | "other";

export function subjectKey(name: string | null): SubjectKey {
  const n = name ?? "";
  if (n.includes("رياضيات")) return "math";
  if (n.includes("علوم")) return "science";
  if (n.includes("إنجليزي")) return "english";
  if (n.includes("عربية")) return "arabic";
  if (n.includes("إسلامية")) return "islamic";
  if (n.includes("اجتماعيات")) return "social";
  return "other";
}

/** تدرجات المواد: فاتح ← مشبع ← عميق (النص الأبيض يوضع دائمًا فوق الطرف العميق أو طبقة تعتيم) */
export const SUBJECT_THEME: Record<SubjectKey, { c1: string; c2: string; c3: string }> = {
  math: { c1: "#FFB648", c2: "#F2603A", c3: "#7E1846" },
  science: { c1: "#3EE8C3", c2: "#0E8F86", c3: "#0B2F55" },
  english: { c1: "#B3A6FF", c2: "#6146F0", c3: "#23126F" },
  arabic: { c1: "#FF97BE", c2: "#D13A78", c3: "#561642" },
  islamic: { c1: "#86E8A0", c2: "#1E9E5A", c3: "#0B3732" },
  social: { c1: "#74D0FF", c2: "#2B6BEA", c3: "#16216B" },
  other: { c1: "#A3AEFF", c2: "#4F46E5", c3: "#1B1E5E" },
};

export function themeVars(name: string | null): React.CSSProperties {
  const t = SUBJECT_THEME[subjectKey(name)];
  return { "--c1": t.c1, "--c2": t.c2, "--c3": t.c3 } as React.CSSProperties;
}

/** ألوان الصفوف: لكل صف هوية لونية ثابتة في الصفحة كلها */
export const GRADE_THEME: Record<number, { g1: string; g2: string }> = {
  6: { g1: "#4BF0C8", g2: "#13A0C9" },
  7: { g1: "#86BFFF", g2: "#6157F5" },
  8: { g1: "#E596FF", g2: "#EE4C93" },
  9: { g1: "#FFD45E", g2: "#FF7A2F" },
};

export function gradeVars(level: number | undefined): React.CSSProperties {
  const t = GRADE_THEME[level ?? 0] ?? { g1: "#A3AEFF", g2: "#4F46E5" };
  return { "--g1": t.g1, "--g2": t.g2 } as React.CSSProperties;
}
