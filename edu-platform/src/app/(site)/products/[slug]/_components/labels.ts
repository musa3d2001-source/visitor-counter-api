import { count, countAcc, W } from "@/lib/design";
import { termLabel, type ProductType } from "@/lib/labels";

/** «الفصل الأول» بدل «الفصل الدراسي الأول» */
export function shortTermLabel(term: number | null | undefined): string {
  return term ? termLabel(term).replace("الفصل الدراسي ", "الفصل ") : "";
}

/** «تصفّح أول صفحتين مجانًا» بصيغة العدد الصحيحة وبالأرقام العربية */
export function previewLabel(pages: number | null) {
  if (!pages) return "تصفّح المعاينة مجانًا";
  if (pages === 1) return "تصفّح الصفحة الأولى مجانًا";
  if (pages === 2) return "تصفّح أول صفحتين مجانًا";
  return `تصفّح أول ${count(pages, W.page)} مجانًا`;
}

/** «تضم منتجين» / «تضم ٤ منتجات» بإعراب صحيح بعد الفعل */
export function includesLabel(n: number): string {
  return `تضم ${countAcc(n, W.product)}`;
}

/** عنوان قسم «نبذة» معرّفًا بحسب نوع المنتج: «عن هذه الباقة» بدل «عن باقة» */
const ABOUT_TITLES: Record<ProductType, string> = {
  final_notes: "عن هذه المذكرة",
  exam_night: "عن هذه المذكرة",
  review_notes: "عن هذه المذكرة",
  exam_model: "عن هذا النموذج",
  answer_key: "عن نموذج الإجابة",
  video_lesson: "عن هذا الدرس",
  unit: "عن شرح الوحدة",
  quiz_review: "عن هذه المراجعة",
  exam_review: "عن هذه المراجعة",
  video_course: "عن هذه الدورة",
  bundle: "عن هذه الباقة",
};
export function aboutTitle(type: ProductType): string {
  return ABOUT_TITLES[type] ?? "نبذة عن المحتوى";
}
