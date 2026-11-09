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
  /** الرسوم المعتمدة لحساب صافي أرباح المعلمين: نسبة (نقاط أساس 100 = 1%) + مبلغ ثابت لكل طلب بالفلس */
  fee_percent_bps: z.number().int().min(0).max(2000),
  fee_fixed_fils: z.number().int().min(0).max(10000),
  /** متى اعتمد المالك الرسوم صراحة. وجود القيم لا يكفي، فالصفر قيمة افتراضية وقد يكون قرارًا. قبله لا يُباع محتوى أي معلم */
  fee_rules_confirmed_at: z.string().nullable(),
});

export type PlatformSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: PlatformSettings = {
  site_name: "منصة فرقد",
  tagline: "شروحات فيديو ومذكرات لطلاب الكويت",
  hero_title: "اختر صفك، وابدأ من الدرس الذي تحتاجه اليوم.",
  hero_subtitle:
    "شرح بالفيديو لكل وحدة، ومراجعات قبل الاختبارات القصيرة وليلة الاختبار، ومذكرات جاهزة للطباعة. ادفع لما تحتاجه فقط، ويظهر في مكتبتك فور تأكيد الدفع.",
  logo_key: null,
  primary_color: "#0a6b66",
  accent_color: "#ffc531",
  whatsapp_number: "",
  contact_email: "",
  contact_phone: "",
  instagram_url: "",
  academic_year: "2026-2027",
  videos_enabled: true,
  watermark_enabled: true,
  faq: [
    {
      q: "أين أجد ما اشتريته؟",
      a: "بعد تأكيد الدفع يظهر الشرح أو المذكرة مباشرة في صفحة «مكتبتي»، وتفتحه من أي جهاز بعد تسجيل الدخول، وتكمل الفيديو من حيث توقفت.",
    },
    {
      q: "كم مدة الوصول إلى الشروحات؟",
      a: "مكتوبة في صفحة كل شرح بجوار السعر: بعضها بلا تاريخ انتهاء، وبعضها لعدد أيام من تاريخ الشراء أو حتى نهاية الفصل.",
    },
    {
      q: "هل أستطيع المشاهدة قبل الشراء؟",
      a: "نعم. أغلب الشروحات فيها درس مجاني للمعاينة، وأغلب المذكرات فيها أول صفحات مجانًا، بدون الحاجة لحساب.",
    },
    {
      q: "ما الفرق بين شرح الوحدة والدورة الكاملة والمراجعة؟",
      a: "شرح الوحدة يغطي وحدة واحدة بالفيديو. الدورة الكاملة تجمع وحدات الفصل كلها بسعر أقل من شرائها منفردة. مراجعة الاختبار القصير وليلة الاختبار دروس مركزة على الأسئلة المتوقعة.",
    },
    {
      q: "ما طرق الدفع المتاحة؟",
      a: "الدفع إلكتروني عبر بوابة ماي فاتورة، ويشمل كي نت والبطاقات البنكية حسب الوسائل المفعّلة. لا نحتفظ ببيانات بطاقتك.",
    },
    {
      q: "هل يمكن استرجاع المبلغ؟",
      a: "نعم في حالات محددة: إذا خُصم المبلغ ولم يظهر المحتوى في مكتبتك، أو تكرر الدفع بالخطأ، أو كان الملف تالفًا ولم نصلحه. تواصل معنا خلال ٧ أيام من الشراء مع رقم الطلب.",
    },
    {
      q: "هل يمكنني طباعة المذكرة؟",
      a: "بعض المذكرات متاحة للتنزيل والطباعة، وبعضها للقراءة داخل المنصة فقط. يظهر ذلك بوضوح في صفحة كل مذكرة.",
    },
  ],
  footer_note: "جميع الحقوق محفوظة. المحتوى مخصص للاستخدام الشخصي للطالب فقط.",
  fee_percent_bps: 0,
  fee_fixed_fils: 0,
  fee_rules_confirmed_at: null,
};

/**
 * قراءة الإعدادات عبر اتصال محدد. داخل معاملة مرّر tx: طلب اتصال ثانٍ من الحوض
 * أثناء حجز المعاملة لاتصالها قد يعلّق تأكيد الدفع عندما يمتلئ الحوض.
 */
export async function readSettings(db: Db = sql): Promise<PlatformSettings> {
  const rows = await db<{ key: string; value: unknown }[]>`select key, value from settings`;
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in DEFAULT_SETTINGS) merged[r.key] = r.value;
  }
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export const getSettings = cache((): Promise<PlatformSettings> => readSettings());

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
