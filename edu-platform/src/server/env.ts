import "server-only";
import { z } from "zod";

/** عناوين الأمثلة لا تستلم ردودًا ولا تجتاز SPF، فوجودها دليل على أن المتغير لم يُضبط */
const PLACEHOLDER_MAIL_DOMAINS = new Set(["example.com", "example.org", "example.net", "your-domain.com"]);

/** سبب رفض MAIL_FROM، أو null إن كان صالحًا. الصيغة: address@domain أو «الاسم <address@domain>» */
export function mailFromProblem(value: string): string | null {
  const match = /^\s*(?:[^<>\r\n]*<([^<>\s]+)>|([^<>\s]+))\s*$/.exec(value);
  const address = match?.[1] ?? match?.[2];
  if (!address || !z.email().safeParse(address).success) return "MAIL_FROM يجب أن يكون بريدًا صحيحًا، مثل: منصة فرقد <no-reply@your-real-domain.com>";
  if (PLACEHOLDER_MAIL_DOMAINS.has(address.split("@")[1].toLowerCase())) return "MAIL_FROM ما زال عنوان مثال، اضبطه على بريد من نطاق المنصة الحقيقي";
  return null;
}

/**
 * متغيرات البيئة — تُقرأ وتُتحقق منها مرة واحدة على الخادم فقط.
 * لا تضع أي مفتاح سري في متغير يبدأ بـ NEXT_PUBLIC_.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL مطلوب"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  /** true عند الاتصال عبر Supabase pooler (وضع transaction) */
  DATABASE_PGBOUNCER: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /** سر لتوقيع الروابط المؤقتة (رفع الملفات المحلي) — 32 حرفًا على الأقل */
  APP_SECRET: z.string().min(32, "APP_SECRET يجب أن يكون 32 حرفًا على الأقل"),

  STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("./storage"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_PRIVATE_BUCKET: z.string().default("private-content"),
  SUPABASE_PUBLIC_BUCKET: z.string().default("public-media"),

  /** disabled: لا دفع إلكتروني | sandbox: بيئة اختبار MyFatoorah | live: إنتاج */
  PAYMENTS_MODE: z.enum(["disabled", "sandbox", "live"]).default("disabled"),
  MYFATOORAH_API_KEY: z.string().optional(),
  MYFATOORAH_BASE_URL: z.string().url().optional(),
  MYFATOORAH_WEBHOOK_SECRET: z.string().optional(),
  /** يجب ضبطه صراحةً على true لتفعيل وضع الإنتاج (حماية من التفعيل الخاطئ) */
  MYFATOORAH_LIVE_CONFIRMED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /** يسمح بوضع sandbox على نشر NODE_ENV=production بنطاق لا يدل على بيئة اختبار (للتجارب المقصودة فقط) */
  ALLOW_SANDBOX_ON_PRODUCTION: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /** يضبطه Vercel تلقائيًا: production | preview | development */
  VERCEL_ENV: z.string().optional(),
  /** سر وظائف Cron: يرسله Vercel في Authorization: Bearer. غيابه يعني رفض كل استدعاء */
  CRON_SECRET: z.string().optional(),

  MAIL_DRIVER: z.enum(["log", "smtp"]).default("log"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  MAIL_FROM: z.string().default("المنصة التعليمية <no-reply@example.com>"),

  /** مزود الفيديو للرفع الجديد: file (التخزين الخاص للمنصة) أو bunny (Bunny Stream — موصى به للإنتاج) */
  VIDEO_PROVIDER: z.enum(["file", "bunny"]).default("file"),
  BUNNY_STREAM_LIBRARY_ID: z.string().optional(),
  /** مفتاح API للمكتبة (AccessKey) — سري، على الخادم فقط */
  BUNNY_STREAM_API_KEY: z.string().optional(),
  /** مفتاح توقيع روابط التضمين (Embed Token Authentication) */
  BUNNY_STREAM_TOKEN_KEY: z.string().optional(),
  /** مفتاح القراءة فقط للمكتبة — يُستخدم للتحقق من توقيع Webhook حسب وثائق Bunny */
  BUNNY_STREAM_READONLY_API_KEY: z.string().optional(),
  /** نطاق CDN الخاص بالمكتبة لصور المعاينة (مثل vz-xxxx.b-cdn.net) */
  BUNNY_STREAM_CDN_HOSTNAME: z.string().optional(),
  BUNNY_STREAM_API_BASE: z.string().url().default("https://video.bunnycdn.com"),
  BUNNY_STREAM_TUS_ENDPOINT: z.string().url().default("https://video.bunnycdn.com/tusupload"),
  BUNNY_STREAM_EMBED_BASE: z.string().url().default("https://iframe.mediadelivery.net"),

  /**
   * التحقق بخطوتين لحسابات الإدارة: إلزامي في الإنتاج ما لم يُضبط هذا المتغير على false.
   * انظر adminTwoFactorRequired. القيمة true تفرضه خارج الإنتاج أيضًا.
   */
  ADMIN_2FA_REQUIRED: z.enum(["true", "false"]).optional(),

  /** يُفعَّل فقط عند تشغيل الخادم خلف وكيل موثوق (Vercel) لقراءة IP العميل */
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
}).superRefine((e, ctx) => {
  if (e.MAIL_DRIVER !== "smtp") return;
  if (!e.SMTP_HOST) ctx.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "MAIL_DRIVER=smtp يتطلب SMTP_HOST" });
  const problem = mailFromProblem(e.MAIL_FROM);
  if (problem) ctx.addIssue({ code: "custom", path: ["MAIL_FROM"], message: problem });
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`إعدادات البيئة غير صحيحة:\n${issues}`);
  }
  const e = parsed.data;
  if (e.VIDEO_PROVIDER === "bunny" && (!e.BUNNY_STREAM_LIBRARY_ID || !e.BUNNY_STREAM_API_KEY || !e.BUNNY_STREAM_TOKEN_KEY)) {
    throw new Error("VIDEO_PROVIDER=bunny يتطلب BUNNY_STREAM_LIBRARY_ID و BUNNY_STREAM_API_KEY و BUNNY_STREAM_TOKEN_KEY");
  }
  if (e.STORAGE_DRIVER === "supabase" && (!e.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error("STORAGE_DRIVER=supabase يتطلب SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY");
  }
  cached = e;
  return e;
}

/** هل التحقق بخطوتين إلزامي على حسابات الإدارة في هذا النشر؟ */
export function adminTwoFactorRequired(): boolean {
  const e = env();
  if (e.ADMIN_2FA_REQUIRED) return e.ADMIN_2FA_REQUIRED === "true";
  return e.NODE_ENV === "production";
}

/** لإعادة القراءة في الاختبارات */
export function resetEnvCache() {
  cached = null;
}
