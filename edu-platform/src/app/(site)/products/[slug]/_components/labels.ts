import { count, countAcc, W } from "@/lib/design";
import { termLabel } from "@/lib/labels";

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
