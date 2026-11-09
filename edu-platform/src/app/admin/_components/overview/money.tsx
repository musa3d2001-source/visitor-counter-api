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

/** «تنبيه واحد / تنبيهان / ٣ تنبيهات / ١١ تنبيهًا» */
export const ALERT: CountWord = { one: "تنبيه", two: "تنبيهان", plural: "تنبيهات", acc: "تنبيهًا" };

/** «دفعة زائدة واحدة / دفعتان زائدتان / ٣ دفعات زائدة / ١١ دفعة زائدة» */
export const EXTRA_PAYMENT: CountWord = { one: "دفعة زائدة", two: "دفعتان زائدتان", plural: "دفعات زائدة", acc: "دفعة زائدة", single: "دفعة زائدة واحدة" };

/** «استرداد واحد / استردادان / ٣ استردادات / ١١ استردادًا» */
export const REFUND: CountWord = { one: "استرداد", two: "استردادان", plural: "استردادات", acc: "استردادًا" };

/** «إشعار واحد / إشعاران / ٣ إشعارات / ١١ إشعارًا» */
export const DELIVERY: CountWord = { one: "إشعار", two: "إشعاران", plural: "إشعارات", acc: "إشعارًا" };

/** «رسالة واحدة / رسالتان / ٣ رسائل / ١١ رسالة» */
export const MAIL_MESSAGE: CountWord = { one: "رسالة", two: "رسالتان", plural: "رسائل", acc: "رسالة", oneSuffix: "واحدة" };

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
