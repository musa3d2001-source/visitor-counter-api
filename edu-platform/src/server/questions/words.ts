/**
 * معدودات بنك الأسئلة لـ count(). منفصلة عن W في src/lib/design.ts عمدًا: إضافة مفاتيح إلى W
 * تزيد حزمة كل صفحة عامة (الكائن مشترك)، فتبقى كلمات لوحة التحكم هنا.
 */
import type { CountWord } from "@/lib/design";

export const QUESTION_WORD: CountWord = { one: "سؤال", two: "سؤالان", plural: "أسئلة", acc: "سؤالًا" };
export const ATTEMPT_WORD: CountWord = { one: "محاولة", two: "محاولتان", plural: "محاولات", acc: "محاولة", oneSuffix: "واحدة" };
