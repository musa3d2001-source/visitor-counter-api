import { z } from "zod";
import { normalizeKuwaitPhone } from "./phone";
import { parseKwdToFils } from "./money";
import { PRODUCT_TYPES, PRODUCT_STATUSES } from "./labels";
import { isAnonymizedEmail } from "./anonymize";

/** مخططات التحقق المشتركة — تُستخدم على الخادم دائمًا (والعميل اختياريًا) */

export const emailSchema = z
  .string({ error: "البريد الإلكتروني مطلوب" })
  .trim()
  .toLowerCase()
  .min(5, "البريد الإلكتروني غير صحيح")
  .max(254, "البريد الإلكتروني طويل جدًا")
  .email("البريد الإلكتروني غير صحيح")
  // نطاق القيم البديلة للحسابات المحذوفة: لا يُسجَّل به أحد ولا يُحجز مسبقًا
  .refine((v) => !isAnonymizedEmail(v), "البريد الإلكتروني غير صحيح");

export const passwordSchema = z
  .string({ error: "كلمة المرور مطلوبة" })
  .min(8, "كلمة المرور يجب أن تكون ٨ أحرف على الأقل")
  .max(128, "كلمة المرور طويلة جدًا");

export const fullNameSchema = z
  .string({ error: "الاسم مطلوب" })
  .trim()
  .min(2, "الاسم قصير جدًا")
  .max(100, "الاسم طويل جدًا")
  .refine((v) => !/[<>]/.test(v), "الاسم يحتوي على رموز غير مسموحة");

export const optionalPhoneSchema = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = normalizeKuwaitPhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "رقم الهاتف الكويتي غير صحيح (٨ أرقام)" });
      return z.NEVER;
    }
    return n;
  });

export const registerSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
  phone: optionalPhoneSchema,
  gradeId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "كلمة المرور مطلوبة").max(128),
});

export const priceSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const fils = parseKwdToFils(v);
    if (fils === null) {
      ctx.addIssue({ code: "custom", message: "السعر غير صحيح، مثال: 2.500" });
      return z.NEVER;
    }
    return fils;
  });

export const optionalPriceSchema = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const fils = parseKwdToFils(v);
    if (fils === null) {
      ctx.addIssue({ code: "custom", message: "السعر السابق غير صحيح" });
      return z.NEVER;
    }
    return fils;
  });

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "الرابط يجب أن يحتوي أحرفًا إنجليزية صغيرة وأرقامًا وشرطات فقط");

export const academicYearSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{4}$/, "العام الدراسي بصيغة 2026-2027")
  .refine((v) => {
    const [a, b] = v.split("-").map(Number);
    return b === a + 1;
  }, "العام الدراسي غير صحيح");

export const productTypeSchema = z.enum(PRODUCT_TYPES, { error: "نوع المنتج غير صحيح" });
export const productStatusSchema = z.enum(PRODUCT_STATUSES, { error: "حالة النشر غير صحيحة" });

export const uuidSchema = z.string().uuid("معرف غير صحيح");

/** يحوّل أخطاء zod إلى رسائل لكل حقل */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
