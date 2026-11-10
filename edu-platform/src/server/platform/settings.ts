import "server-only";
import { cache } from "react";
import { z } from "zod";
import { sql, type Db } from "../db";
import { DEFAULT_FAQ, DEFAULT_FOOTER_NOTE, DEFAULT_HERO_SUBTITLE, DEFAULT_HERO_TITLE, DEFAULT_TAGLINE } from "@/lib/site-truth";

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
  /** يظهر رابطًا في تذييل كل صفحة: https فقط (لا javascript: ولا data: ولا http) */
  instagram_url: z
    .string()
    .url()
    .refine((u) => {
      try {
        return new URL(u).protocol === "https:";
      } catch {
        return false;
      }
    }, "الرابط يجب أن يبدأ بـ https://")
    .or(z.literal("")),
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
  /** هوية البائع: تظهر في التذييل والصفحات القانونية متى أدخلها المالك */
  seller_legal_name: z.string().max(120),
  seller_license_number: z.string().max(60),
  seller_address: z.string().max(240),
  /** اسم شركة إرسال البريد كما يُذكر في سياسة الخصوصية */
  mail_provider_name: z.string().max(60),
});

export type PlatformSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: PlatformSettings = {
  site_name: "منصة فرقد",
  tagline: DEFAULT_TAGLINE,
  hero_title: DEFAULT_HERO_TITLE,
  hero_subtitle: DEFAULT_HERO_SUBTITLE,
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
  faq: DEFAULT_FAQ,
  footer_note: DEFAULT_FOOTER_NOTE,
  fee_percent_bps: 0,
  fee_fixed_fils: 0,
  fee_rules_confirmed_at: null,
  seller_legal_name: "",
  seller_license_number: "",
  seller_address: "",
  mail_provider_name: "",
};

/** أسماء الحقول كما يراها المالك في صفحة الإعدادات */
export const SETTINGS_LABELS: Record<keyof PlatformSettings, string> = {
  site_name: "اسم المنصة",
  tagline: "الشعار النصي",
  hero_title: "عنوان الصفحة الرئيسية",
  hero_subtitle: "النص التعريفي",
  logo_key: "الشعار",
  primary_color: "اللون الأساسي",
  accent_color: "اللون المساعد",
  whatsapp_number: "رقم واتساب",
  contact_email: "البريد",
  contact_phone: "الهاتف",
  instagram_url: "رابط إنستغرام",
  academic_year: "العام الدراسي",
  videos_enabled: "تفعيل الفيديو",
  watermark_enabled: "العلامة المائية",
  faq: "الأسئلة الشائعة",
  footer_note: "نص التذييل",
  fee_percent_bps: "نسبة الرسوم",
  fee_fixed_fils: "الرسوم الثابتة",
  fee_rules_confirmed_at: "اعتماد قواعد الرسوم",
  seller_legal_name: "الاسم النظامي للبائع",
  seller_license_number: "رقم الرخصة التجارية",
  seller_address: "عنوان البائع",
  mail_provider_name: "اسم مزود البريد",
};

export type SettingsReport = {
  settings: PlatformSettings;
  /** مفاتيح محفوظة لم تعد قيمتها مقبولة (بعد تغيير قاعدة مثلًا)، فاستُعملت قيمتها الافتراضية وحدها */
  invalid: (keyof PlatformSettings)[];
};

/**
 * قراءة الإعدادات مع ما تعذر قبوله. كل مفتاح يُفحص وحده: قيمة واحدة مرفوضة تعود إلى افتراضيها هي فقط،
 * ولا تمحو اسم المنصة ووسائل التواصل واعتماد الرسوم معها.
 * داخل معاملة مرّر tx: طلب اتصال ثانٍ من الحوض أثناء حجز المعاملة لاتصالها قد يعلّق تأكيد الدفع عندما يمتلئ الحوض.
 */
export async function readSettingsReport(db: Db = sql): Promise<SettingsReport> {
  const rows = await db<{ key: string; value: unknown }[]>`select key, value from settings`;
  const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  const invalid: (keyof PlatformSettings)[] = [];
  const shape = settingsSchema.shape;
  for (const r of rows) {
    if (!Object.hasOwn(shape, r.key)) continue;
    const key = r.key as keyof PlatformSettings;
    const parsed = shape[key].safeParse(r.value);
    if (parsed.success) settings[key] = parsed.data;
    else invalid.push(key);
  }
  return { settings: settings as PlatformSettings, invalid };
}

export async function readSettings(db: Db = sql): Promise<PlatformSettings> {
  return (await readSettingsReport(db)).settings;
}

export const getSettingsReport = cache((): Promise<SettingsReport> => readSettingsReport());

export const getSettings = cache(async (): Promise<PlatformSettings> => (await getSettingsReport()).settings);

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
