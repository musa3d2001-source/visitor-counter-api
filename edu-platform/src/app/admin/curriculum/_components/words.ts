import { ar, type CountWord } from "@/lib/design";

/**
 * كلمات العدّ وتسميات المنهج المشتركة بين صفحتي المنهج ومكوّناتهما (بلا أي استيراد للخادم).
 */

export const TEXTBOOK: CountWord = { one: "كتاب", two: "كتابان", plural: "كتب", acc: "كتابًا" };
export const UNIT: CountWord = { one: "وحدة", two: "وحدتان", plural: "وحدات", acc: "وحدة", oneSuffix: "واحدة" };
export const LESSON: CountWord = { one: "درس", two: "درسان", plural: "دروس", acc: "درسًا" };
export const QUESTION: CountWord = { one: "سؤال", two: "سؤالان", plural: "أسئلة", acc: "سؤالًا" };
export const ROW: CountWord = { one: "صف", two: "صفّان", plural: "صفوف", acc: "صفًّا" };

/** «الفصل الأول» أو «الفصل الثاني» */
export function termName(term: number): string {
  return term === 2 ? "الفصل الثاني" : "الفصل الأول";
}

/** نطاق الصفحات: «ص ٤٥ إلى ٥٢» أو «ص ٤٥» لصفحة واحدة */
export function pagesLabel(start: number, end: number): string {
  return start === end ? `ص ${ar(start)}` : `ص ${ar(start)} إلى ${ar(end)}`;
}

/** تسمية الكتاب: المادة · الصف · الفصل */
export function textbookLabel(t: { subject_name: string; grade_name: string; term: number }): string {
  return `${t.subject_name} · ${t.grade_name} · ${termName(t.term)}`;
}

/** الكتاب مخفي عن الطلاب متى كانت مرحلته أو صفه أو مادته غير ظاهرة */
export function hiddenFromStudents(t: { stage_published: boolean; grade_published: boolean; subject_published: boolean }): boolean {
  return !(t.stage_published && t.grade_published && t.subject_published);
}
