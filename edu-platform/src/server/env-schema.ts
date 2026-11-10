import { z } from "zod";
import { bunnyConfigProblem } from "../lib/bunny-keys";

/**
 * مخطط متغيرات البيئة، بلا "server-only" ولا اعتماديات خادم، لأن next.config يقرؤه وقت البناء أيضًا.
 * الخادم يقرأ المتغيرات من env.ts، لا من هنا.
 */

/** عناوين الأمثلة لا تستلم ردودًا ولا تجتاز SPF، فوجودها دليل على أن المتغير لم يُضبط */
export const PLACEHOLDER_MAIL_DOMAINS = new Set(["example.com", "example.org", "example.net", "your-domain.com"]);

/** سبب رفض MAIL_FROM، أو null إن كان صالحًا. الصيغة: address@domain أو «الاسم <address@domain>» */
export function mailFromProblem(value: string): string | null {
  const match = /^\s*(?:[^<>\r\n]*<([^<>\s]+)>|([^<>\s]+))\s*$/.exec(value);
  const address = match?.[1] ?? match?.[2];
  if (!address || !z.email().safeParse(address).success) return "MAIL_FROM يجب أن يكون بريدًا صحيحًا، مثل: منصة فرقد <no-reply@your-real-domain.com>";
  if (PLACEHOLDER_MAIL_DOMAINS.has(address.split("@")[1].toLowerCase())) return "MAIL_FROM ما زال عنوان مثال، اضبطه على بريد من نطاق المنصة الحقيقي";
  return null;
}

const flag = (fallback: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(fallback)
    .transform((v) => v === "true");

/** عدد صحيح داخل مدى. قيمة لا تُقرأ لا توقف الموقع: تسري القيمة الافتراضية ويظهر اسم المتغير للمالك في «صحة المنصة» */
const LENIENT_INTS = {
  /** الثواني التي يبقى فيها اتصال قاعدة البيانات الخامل مفتوحًا قبل إغلاقه */
  DATABASE_IDLE_TIMEOUT_SECONDS: { min: 1, max: 3600, fallback: 60 },
  /** أقصى مدة لأمر SQL واحد في طلب عادي، بالمللي ثانية. بعدها يُلغى ويرد الطلب «مشغول» */
  DATABASE_STATEMENT_TIMEOUT_MS: { min: 1000, max: 120_000, fallback: 10_000 },
  /** أقصى انتظار لاتصال شاغر في الحوض، بالمللي ثانية. بعده يرد الطلب «مشغول» بدل أن يعلق */
  DATABASE_QUEUE_TIMEOUT_MS: { min: 500, max: 60_000, fallback: 8_000 },
  /** عمر البيانات العامة في ذاكرة الخادم بالثواني. ٥٥ حدًا أعلى ليبقى ظهور تعديل المالك داخل دقيقة شاملًا وقت عرض الصفحة. صفر يوقفها */
  PUBLIC_CACHE_SECONDS: { min: 0, max: 55, fallback: 55 },
} as const;
type LenientKey = keyof typeof LENIENT_INTS;

function readLenientInt(value: unknown, key: LenientKey): number | undefined {
  const { min, max } = LENIENT_INTS[key];
  if (typeof value === "number") return Number.isInteger(value) && value >= min && value <= max ? value : undefined;
  if (typeof value !== "string" || !/^\s*\d{1,9}\s*$/.test(value)) return undefined;
  const n = Number(value);
  return n >= min && n <= max ? n : undefined;
}

const lenientInt = (key: LenientKey) => z.preprocess((v) => readLenientInt(v, key), z.number().int().default(LENIENT_INTS[key].fallback));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    APP_URL: z.string().url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL مطلوب"),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
    /** true عند الاتصال عبر Supabase pooler (وضع transaction) */
    DATABASE_PGBOUNCER: flag("false"),
    DATABASE_IDLE_TIMEOUT_SECONDS: lenientInt("DATABASE_IDLE_TIMEOUT_SECONDS"),
    DATABASE_STATEMENT_TIMEOUT_MS: lenientInt("DATABASE_STATEMENT_TIMEOUT_MS"),
    DATABASE_QUEUE_TIMEOUT_MS: lenientInt("DATABASE_QUEUE_TIMEOUT_MS"),
    PUBLIC_CACHE_SECONDS: lenientInt("PUBLIC_CACHE_SECONDS"),
    /** سر لتوقيع الروابط المؤقتة (رفع الملفات المحلي) — 32 حرفًا على الأقل */
    APP_SECRET: z.string().min(32, "APP_SECRET يجب أن يكون 32 حرفًا على الأقل"),

    STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
    LOCAL_STORAGE_DIR: z.string().default("./storage"),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_PRIVATE_BUCKET: z.string().default("private-content"),
    SUPABASE_PUBLIC_BUCKET: z.string().default("public-media"),
    /** خطة Supabase: free حدها 50 ميجابايت للملف الواحد. الافتراضي الأضيق حتى لا يُرفض الملف بعد اكتمال رفعه */
    STORAGE_PLAN: z.enum(["free", "paid"]).default("free"),
    /** حد صريح للملف الواحد بالميجابايت، يطابق «Global file size limit» في إعدادات Storage. يتقدم على الخطة */
    STORAGE_MAX_FILE_MB: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(1).max(8192).optional()),

    /** disabled: لا دفع إلكتروني | sandbox: بيئة اختبار MyFatoorah | live: إنتاج */
    PAYMENTS_MODE: z.enum(["disabled", "sandbox", "live"]).default("disabled"),
    MYFATOORAH_API_KEY: z.string().optional(),
    MYFATOORAH_BASE_URL: z.string().url().optional(),
    MYFATOORAH_WEBHOOK_SECRET: z.string().optional(),
    /** يجب ضبطه صراحةً على true لتفعيل وضع الإنتاج (حماية من التفعيل الخاطئ) */
    MYFATOORAH_LIVE_CONFIRMED: flag("false"),
    /** يسمح بوضع sandbox على نشر NODE_ENV=production بنطاق لا يدل على بيئة اختبار (للتجارب المقصودة فقط) */
    ALLOW_SANDBOX_ON_PRODUCTION: flag("false"),
    /** يضبطه Vercel تلقائيًا: production | preview | development */
    VERCEL_ENV: z.string().optional(),
    /** سر وظائف Cron: يرسله Vercel في Authorization: Bearer. غيابه يعني رفض كل استدعاء */
    CRON_SECRET: z.string().optional(),
    /** بريد المالك لرسائل التنبيه. غيابه أو خطؤه لا يوقف الخادم: يظهر تحذير في «صحة المنصة» ولا تُرسل رسائل */
    OPS_ALERT_EMAIL: z.string().optional(),

    MAIL_DRIVER: z.enum(["log", "smtp"]).default("log"),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_SECURE: flag("false"),
    MAIL_FROM: z.string().default("المنصة التعليمية <no-reply@example.com>"),

    /** مزود الفيديو للرفع الجديد: file (التخزين الخاص للمنصة) أو bunny (Bunny Stream — موصى به للإنتاج) */
    VIDEO_PROVIDER: z.enum(["file", "bunny"]).default("file"),
    /**
     * false: لا فهرسة في محركات البحث على هذا النشر. رابط vercel.app لا يُفهرس أصلًا مهما كانت القيمة.
     * متغير شكلي: قيمة غير مفهومة لا توقف الموقع، بل تُخفيه عن البحث (الأسلم) وتظهر في «خطوات الإطلاق»
     */
    SITE_INDEXABLE: z
      .string()
      .optional()
      .transform((v) => v === undefined || v === "true"),
    /** يسمح بنشر وبيع فيديو ملف خام (رابط MP4 يمكن تنزيله) على نشر NODE_ENV=production. الافتراضي الإطلاق بالمذكرات فقط */
    ALLOW_FILE_VIDEO: flag("false"),
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
    TRUST_PROXY: flag("true"),
  })
  .superRefine((e, ctx) => {
    if (e.MAIL_DRIVER !== "smtp") return;
    if (!e.SMTP_HOST) ctx.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "MAIL_DRIVER=smtp يتطلب SMTP_HOST" });
    const problem = mailFromProblem(e.MAIL_FROM);
    if (problem) ctx.addIssue({ code: "custom", path: ["MAIL_FROM"], message: problem });
  });

export type Env = z.infer<typeof envSchema>;

/** كل متغير يقرؤه الخادم. اختبار tests/unit/env-example.test.ts يفشل إن اختلف عنها ملف .env.example */
export const ENV_KEYS = Object.keys(envSchema.shape) as (keyof Env)[];

/**
 * المتغيرات التي قيمها كلمات ثابتة (true و false و live...). المالك يكتبها من هاتف بنصيحة صفحة الإطلاق،
 * فحرف كبير أول أو مسافة ملصوقة لا يصح أن يوقف الموقع كله. الفراغ يعني «غير مضبوط» فتسري القيمة الافتراضية
 */
const WORD_KEYS = [
  "DATABASE_PGBOUNCER",
  "STORAGE_DRIVER",
  "STORAGE_PLAN",
  "PAYMENTS_MODE",
  "MYFATOORAH_LIVE_CONFIRMED",
  "ALLOW_SANDBOX_ON_PRODUCTION",
  "MAIL_DRIVER",
  "SMTP_SECURE",
  "VIDEO_PROVIDER",
  "SITE_INDEXABLE",
  "ALLOW_FILE_VIDEO",
  "ADMIN_2FA_REQUIRED",
  "TRUST_PROXY",
] as const;

export function normaliseEnv(source: Record<string, string | undefined>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...source };
  // متغير أُنشئ في Vercel بقيمة فارغة، كما في سطر مثال، يعني «غير مضبوط»: لا يصح أن يوقف رابط فارغ الموقع كله
  for (const key of ENV_KEYS) {
    const value = out[key];
    if (typeof value === "string" && value.trim() === "") out[key] = undefined;
  }
  for (const key of WORD_KEYS) {
    const value = out[key];
    if (typeof value !== "string") continue;
    const word = value.trim().toLowerCase();
    out[key] = word === "" ? undefined : word;
  }
  return out;
}

/** هل هذا نشر على Vercel؟ Vercel يضبط VERCEL_ENV بنفسه على كل نشر */
export function isVercelDeployment(e: Pick<Env, "VERCEL_ENV">): boolean {
  return e.VERCEL_ENV === "production" || e.VERCEL_ENV === "preview";
}

function isLocalHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h.endsWith(".localhost") || h === "0.0.0.0" || h === "::1" || /^127\./.test(h);
}

/**
 * قيم تطوير محلي لا يصح أن يعمل بها نشر حقيقي على Vercel: روابط البريد وعودة الدفع إلى localhost، أو ملفات على قرص يضيع مع كل نسخة.
 * خارج Vercel (التشغيل المحلي، اختبارات E2E، أداة الحمل) لا تُرفض، فهناك localhost هو العنوان الصحيح.
 */
export function deploymentProblems(e: Env): string[] {
  const problems: string[] = [];
  if (e.STORAGE_DRIVER === "supabase" && (!e.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY)) problems.push("STORAGE_DRIVER=supabase يتطلب SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY");
  if (!isVercelDeployment(e)) return problems;
  const url = new URL(e.APP_URL);
  if (url.protocol !== "https:" || isLocalHost(url.hostname)) problems.push("APP_URL على Vercel يجب أن يكون عنوان الموقع الحقيقي ويبدأ بـ https://");
  if (e.STORAGE_DRIVER === "local") problems.push("STORAGE_DRIVER=local لا يصلح على Vercel لأن قرص الخادم يُمسح، اضبطه على supabase");
  return problems;
}

/**
 * كل ما يمنع الخادم من البدء بهذه البيئة، بأسماء المتغيرات وحدها ولا قيمة لأي منها.
 * الخادم يتوقف عند البدء بالشروط نفسها، والبناء على Vercel يفشل بها فتبقى النسخة السابقة تعمل.
 */
export function envProblems(source: Record<string, string | undefined>): string[] {
  const normalised = normaliseEnv(source);
  const parsed = envSchema.safeParse(normalised);
  if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`);
  const problems: string[] = [];
  const bunny = bunnyConfigProblem(normalised);
  if (bunny) problems.push(bunny);
  problems.push(...deploymentProblems(parsed.data));
  return problems;
}

/**
 * متغيرات اختيارية بقيمة لا تُقرأ: الخادم يعمل بالقيمة الافتراضية، والمالك يرى الاسم في «صحة المنصة». الأسماء وحدها، بلا قيم
 */
export function envWarnings(source: Record<string, string | undefined>): string[] {
  const normalised = normaliseEnv(source);
  return (Object.keys(LENIENT_INTS) as LenientKey[]).filter((key) => normalised[key] !== undefined && readLenientInt(normalised[key], key) === undefined);
}
