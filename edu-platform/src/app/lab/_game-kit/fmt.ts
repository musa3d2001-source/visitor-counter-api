/**
 * [مختبر المرحلة 0 - ليس كود إنتاج] نسخة محلية من ar() وcount() في @/lib/design لمكوّنات العميل في /lab/game-*.
 *
 * لماذا نسخة؟ Turbopack يهزّ الوحدة المشتركة @/lib/design على العميل مرة واحدة لكل التطبيق، فاستيراد
 * count() من مكوّن عميل جديد يضيفها إلى جزء design المشترك فيكبر JS كل الصفحات القائمة
 * (قيس في بوابة المرحلة 0: +250 بايت لكل صفحة، و+500 في لوحة الإدارة). الأنواع تُستورد من المصدر (بلا أثر).
 * في كود الإنتاج: النصوص المعدودة تُحسب على الخادم وتُمرَّر جاهزة، أو تُقبل الزيادة بقرار موثّق.
 */
import type { CountWord } from "@/lib/design";

const AR = "٠١٢٣٤٥٦٧٨٩";
export const ar = (n: number | string) => String(n).replace(/\d/g, (d) => AR[Number(d)]);

/** مطابقة لـ count() في @/lib/design */
export function count(n: number, w: CountWord): string {
  if (n === 0 && w.none) return w.none;
  if (n === 1) return w.single ?? `${w.one} ${w.oneSuffix ?? "واحد"}`;
  if (n === 2) return w.two;
  const m = n % 100;
  if (m >= 3 && m <= 10) return `${ar(n)} ${w.plural}`;
  if (m >= 11 && m <= 99) return `${ar(n)} ${w.acc}`;
  return `${ar(n)} ${w.one}`;
}
