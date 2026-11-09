/**
 * أدوات المبالغ المالية — كل المبالغ تُخزَّن وتُحسب بالفلس (عدد صحيح).
 * 1 دينار كويتي = 1000 فلس.
 */
export const FILS_PER_KWD = 1000;

/** تحويل نص بالدينار (مثل "2.500") إلى فلس بدقة دون أخطاء الكسور العشرية */
export function parseKwdToFils(input: string | number): number | null {
  const s = String(input).trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace("٫", ".");
  if (!/^\d{1,7}(\.\d{1,3})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * FILS_PER_KWD + Number(frac.padEnd(3, "0"));
}

/** تمثيل المبلغ بالدينار بثلاث خانات عشرية (للبوابة والتخزين النصي) */
export function filsToKwdString(fils: number): string {
  if (!Number.isInteger(fils)) throw new Error("fils must be an integer");
  const sign = fils < 0 ? "-" : "";
  const abs = Math.abs(fils);
  const whole = Math.floor(abs / FILS_PER_KWD);
  const frac = String(abs % FILS_PER_KWD).padStart(3, "0");
  return `${sign}${whole}.${frac}`;
}

/** عرض السعر للمستخدم: "2.500 د.ك" (أرقام لاتينية لوضوح الأسعار) */
export function formatKwd(fils: number): string {
  return `${filsToKwdString(fils)} د.ك`;
}

/**
 * مقاس المبلغ الطويل داخل بطاقة ضيقة (انظر FIT_AMOUNT): تصغّره البطاقة بقدر طوله
 * حتى يبقى الرقم سطرًا واحدًا، فلا يُقص آخره ولا تنزل خانة منه إلى السطر التالي.
 */
export function longAmount(text: string): "s" | "m" | "l" | undefined {
  if (text.length >= 11) return "l";
  if (text.length === 10) return "m";
  return text.length === 9 ? "s" : undefined;
}

/** تحويل قيمة البوابة (رقم عشري بالدينار) إلى فلس مع التقريب الآمن */
export function kwdNumberToFils(value: number): number {
  return Math.round(value * FILS_PER_KWD);
}

/** حساب الخصم بالفلس — النسبة تُقرَّب لأقرب فلس للأسفل لصالح العميل لا يتجاوز الإجمالي */
export function computeDiscount(subtotalFils: number, kind: "percent" | "fixed", value: number): number {
  if (subtotalFils <= 0) return 0;
  const raw = kind === "percent" ? Math.floor((subtotalFils * value) / 100) : value;
  return Math.max(0, Math.min(subtotalFils, raw));
}
