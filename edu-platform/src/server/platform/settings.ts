import "server-only";
import { cache } from "react";
import { z } from "zod";
import { sql, type Db } from "../db";

/**
 * إعدادات المنصة القابلة للتعديل من لوحة الإدارة (الاسم، الشعار، الألوان، التواصل، الأسئلة الشائعة...)
 * تُخزن كمفاتيح JSON في جدول settings مع قيم افتراضية آمنة.
 */
const faqItem = z.object({ q: z.string().min(2).max(200), a: z.string().min(2).max(1500) });

export const settingsSchema = z.object({
  site_name: z.string().min(2).max(60),
  tagline: z.string().max(140),
  hero_title: z.string().min(2).max(120),
  hero_subtitle: z.string().max(300),
  logo_key: z.string().nullable(),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  whatsapp_number: z.string().regex(/^\+?\d{8,15}$/).or(z.literal("")),
  contact_email: z.string().email().or(z.literal("")),
  contact_phone: z.string().max(30),
  instagram_url: z.string().url().or(z.literal("")),
  academic_year: z.string().regex(/^\d{4}-\d{4}$/),
  videos_enabled: z.boolean(),
  watermark_enabled: z.boolean(),
  faq: z.array(faqItem).max(30),
  footer_note: z.string().max(300),
});

export type PlatformSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: PlatformSettings = {
  site_name: "منصة درب",
  tagline: "مذكرات ونماذج المرحلة المتوسطة في الكويت",
  hero_title: "ذاكر بذكاء… كل مذكراتك في مكان واحد",
  hero_subtitle:
    "مذكرات نهائية، مراجعات ليلة الاختبار، ونماذج اختبارات مع إجاباتها — مرتبة حسب صفك ومادتك، وتوصلك فورًا بعد الدفع.",
  logo_key: null,
  primary_color: "#0f5257",
  accent_color: "#d4973b",
  whatsapp_number: "",
  contact_email: "",
  contact_phone: "",
  instagram_url: "",
  academic_year: "2026-2027",
  videos_enabled: false,
  watermark_enabled: true,
  faq: [
    {
      q: "كيف أحصل على المذكرة بعد الشراء؟",
      a: "بعد تأكيد الدفع تظهر المذكرة مباشرة في صفحة «مكتبتي»، ويمكنك فتحها من أي جهاز بعد تسجيل الدخول.",
    },
    {
      q: "هل يمكنني معاينة جزء من المذكرة قبل الشراء؟",
      a: "نعم، أغلب المذكرات فيها معاينة مجانية لأول صفحات بدون الحاجة لتسجيل حساب.",
    },
    {
      q: "ما طرق الدفع المتاحة؟",
      a: "الدفع إلكتروني وآمن عبر بوابة MyFatoorah، ويشمل كي نت والبطاقات البنكية حسب الوسائل المفعّلة.",
    },
    {
      q: "هل يمكنني طباعة المذكرة؟",
      a: "بعض المذكرات متاحة للتنزيل والطباعة، وبعضها للقراءة داخل المنصة فقط. يظهر ذلك بوضوح في صفحة كل مذكرة.",
    },
  ],
  footer_note: "جميع الحقوق محفوظة. المحتوى مخصص للاستخدام الشخصي للطالب فقط.",
};

export const getSettings = cache(async (): Promise<PlatformSettings> => {
  const rows = await sql<{ key: string; value: unknown }[]>`select key, value from settings`;
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in DEFAULT_SETTINGS) merged[r.key] = r.value;
  }
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
});

export async function saveSettings(patch: Partial<PlatformSettings>, actorId: string, db: Db = sql) {
  const current = await getSettings();
  const next = settingsSchema.parse({ ...current, ...patch });
  for (const key of Object.keys(patch) as (keyof PlatformSettings)[]) {
    const value = next[key];
    await db`
      insert into settings (key, value, updated_by, updated_at)
      values (${key}, ${db.json(value as never)}, ${actorId}, now())
      on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()
    `;
  }
  return next;
}
