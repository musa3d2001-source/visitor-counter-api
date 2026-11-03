import type { CountWord } from "@/lib/design";
import { filsToKwdString } from "@/lib/money";
import { cn } from "@/lib/utils";

/** مبلغ بالدينار: أرقام لاتينية داخل .num ثم «د.ك» بخط أصغر */
export function Kwd({ fils, className, unitClassName }: { fils: number; className?: string; unitClassName?: string }) {
  return (
    <span className={cn("whitespace-nowrap", className)}>
      <span className="num">{filsToKwdString(fils)}</span> <span className={cn("text-[0.72em] font-bold text-muted", unitClassName)}>د.ك</span>
    </span>
  );
}

/** «عملية بيع واحدة / عمليتا بيع / ٣ عمليات بيع / ١١ عملية بيع» */
export const SALE: CountWord = { one: "عملية بيع", two: "عمليتا بيع", plural: "عمليات بيع", acc: "عملية بيع", single: "عملية بيع واحدة" };

/** «عملية واحدة / عمليتان / ٣ عمليات / ١١ عملية» */
export const OP: CountWord = { one: "عملية", two: "عمليتان", plural: "عمليات", acc: "عملية", oneSuffix: "واحدة" };

/** «ملف واحد / ملفان / ٣ ملفات / ١١ ملفًا» */
export const FILE: CountWord = { one: "ملف", two: "ملفان", plural: "ملفات", acc: "ملفًا" };

/** «تسوية واحدة / تسويتان / ٣ تسويات» */
export const PAYOUT: CountWord = { one: "تسوية", two: "تسويتان", plural: "تسويات", acc: "تسوية", oneSuffix: "واحدة" };

/** «محتوى واحد / محتويان / ٣ محتويات / ١١ محتوى» */
export const CONTENT: CountWord = { one: "محتوى", two: "محتويان", plural: "محتويات", acc: "محتوى" };

/** تاريخ اليوم بالعربية (توقيت الكويت، أرقام هندية): «الثلاثاء ٣ نوفمبر» */
export function todayLabel(d = new Date()) {
  try {
    return new Intl.DateTimeFormat("ar-KW-u-nu-arab", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kuwait" }).format(d);
  } catch {
    return "";
  }
}
