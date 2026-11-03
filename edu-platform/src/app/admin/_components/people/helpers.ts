import type { AdminTone } from "@/components/admin/tones";
import { isPdfType, isVideoType } from "@/lib/labels";

/**
 * أدوات عرض صغيرة لصفحات «الأشخاص» (الطلبات، الطلاب، المعلمون). عرض فقط، بلا منطق بيانات.
 */

const PERSON_TONES: AdminTone[] = ["violet", "sky", "coral", "green", "gold", "pink", "teal"];

/** لون ثابت لكل اسم (نفس الاسم يأخذ اللون نفسه في كل الصفحات) */
export function personTone(seed: string | null | undefined): AdminTone {
  const s = seed ?? "";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PERSON_TONES[h % PERSON_TONES.length];
}

/** «الصف التاسع» ← 9 (لتلوين كبسولة الصف بلون الصف) */
export function gradeLevelFromName(name: string | null | undefined): number | null {
  const n = name ?? "";
  if (/السادس/u.test(n)) return 6;
  if (/السابع/u.test(n)) return 7;
  if (/الثامن/u.test(n)) return 8;
  if (/التاسع/u.test(n)) return 9;
  const m = /(\d{1,2})/.exec(n);
  return m ? Number(m[1]) : null;
}

/** مفتاح المادة من اسمها العربي (نسخة محلية آمنة للاستخدام في مكونات العميل) */
export function subjectSlugOf(name: string | null | undefined): string | null {
  const n = name ?? "";
  if (/عرب/u.test(n)) return "arabic";
  if (/إنجليز|انجليز|English/iu.test(n)) return "english";
  if (/رياض/u.test(n)) return "math";
  if (/علوم/u.test(n)) return "science";
  if (/إسلام|اسلام/u.test(n)) return "islamic";
  if (/اجتماع/u.test(n)) return "social";
  return null;
}

/** لون حالة الطلب في الرؤوس والأيقونات (يطابق ألوان StatusPill) */
export function orderTone(status: string): AdminTone {
  return status === "paid" ? "green" : status === "pending" ? "gold" : status === "refunded" ? "violet" : status === "cancelled" ? "slate" : "coral";
}

/** نوع المنتج ← لون مربع الأيقونة */
export type ProductKind = "video" | "pdf" | "bundle";
export function productKind(type: string): ProductKind {
  if (type === "bundle") return "bundle";
  if (isVideoType(type)) return "video";
  if (isPdfType(type)) return "pdf";
  return "pdf";
}
export const KIND_TONE: Record<ProductKind, AdminTone> = { video: "sky", pdf: "coral", bundle: "gold" };

/** «عملية بيع» بقواعد العدد (غير موجودة في W المشتركة) */
export const SALE_WORD = { one: "عملية", two: "عمليتان", plural: "عمليات", acc: "عملية", oneSuffix: "واحدة", none: "لا مبيعات" } as const;

const timeFmt = new Intl.DateTimeFormat("ar-KW-u-nu-latn", { timeStyle: "short", timeZone: "Asia/Kuwait" });
/** الوقت فقط بتوقيت الكويت (حين يظهر التاريخ بجواره) */
export function formatTime(d: Date | string | null | undefined): string {
  return d ? timeFmt.format(new Date(d)) : "";
}
