import "server-only";
import { z } from "zod";
import { bunnyConfigProblem } from "@/lib/bunny-keys";
import { deploymentProblems, envSchema, envWarnings, normaliseEnv, PLACEHOLDER_MAIL_DOMAINS, type Env } from "./env-schema";

export { ENV_KEYS, isVercelDeployment, mailFromProblem, type Env } from "./env-schema";

/**
 * متغيرات البيئة — تُقرأ وتُتحقق منها مرة واحدة على الخادم فقط. المخطط في env-schema.ts لأن البناء يقرؤه أيضًا.
 * لا تضع أي مفتاح سري في متغير يبدأ بـ NEXT_PUBLIC_.
 */
let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  // «True» أو «true » من لوحة Vercel على الهاتف تُقرأ true، ولا توقف الموقع
  const source = normaliseEnv(process.env);
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`إعدادات البيئة غير صحيحة:\n${issues}`);
  }
  const e = parsed.data;
  // بدون مفتاح القراءة فقط لا يمكن التحقق من Webhook، فتبقى الدروس عالقة قيد المعالجة ويفشل الطالب عند التشغيل بدل فشل واضح عند البدء
  const bunnyProblem = bunnyConfigProblem(source);
  if (bunnyProblem) throw new Error(bunnyProblem);
  const [problem] = deploymentProblems(e);
  if (problem) throw new Error(problem);
  cached = e;
  return e;
}

/** أسماء متغيرات اختيارية قيمها لا تُقرأ فسرت عليها القيمة الافتراضية. للمالك في «صحة المنصة» */
export function configWarnings(): string[] {
  return envWarnings(process.env);
}

/** عنوان تنبيهات المالك إن كان صالحًا، وإلا null. لا يرمي أبدًا: متغير تشغيلي ناقص لا يوقف موقعًا سليمًا */
export function opsAlertEmail(): string | null {
  const value = env().OPS_ALERT_EMAIL?.trim();
  if (!value || !z.email().safeParse(value).success) return null;
  return PLACEHOLDER_MAIL_DOMAINS.has(value.split("@")[1].toLowerCase()) ? null : value;
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
