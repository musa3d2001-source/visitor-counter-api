/**
 * تنقية النصوص قبل أن تخرج من مسار الطلب إلى سجل، أو جدول مراقبة، أو بريد تنبيه.
 * ملف بلا اعتماديات، يستخدمه الخادم وسكربتات النسخ الاحتياطي معًا.
 *
 * redactSecrets: للنص الذي نعرف شكله (رسائل البريد): رموز الروابط والسلاسل الطويلة فقط.
 * scrubForOps: لنص خطأ لا نعرف ما فيه: كل ما قد يكون سرًا أو بيانات شخص يُستبدل.
 *
 * حد هذه التنقية: لا تعرف الأسماء لأنها لا شكل لها. لذلك لا يصل إليها إلا message من الخطأ نفسه،
 * ولا تُمرَّر إليها أبدًا بيانات الطلب أو ترويساته أو parameters الخاصة باستعلام قاعدة البيانات.
 */

const REDACTED = "[REDACTED]";
const SECRET_PARAM = /([?&#;](?:token|code|key|secret|password|pass|otp)=)[^\s&#"'<>]+/gi;
/** أي سلسلة طويلة بلا فواصل تشبه رمزًا (رموزنا ٤٣ حرفًا، ومعرّف UUID ٣٦ فلا يتأثر) */
const OPAQUE_RUN = /[A-Za-z0-9_-]{40,}/g;

export function redactSecrets(text: string): string {
  return text.replace(SECRET_PARAM, `$1${REDACTED}`).replace(OPAQUE_RUN, REDACTED);
}

/** قيم مفاتيح هذا النشر: إن ظهرت حرفيًا في أي خطأ تُحذف قبل كل شيء. تُقرأ مباشرة لأن env() قد يكون هو ما فشل */
const SECRET_ENV_NAMES = [
  "APP_SECRET",
  "CRON_SECRET",
  "DATABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MYFATOORAH_API_KEY",
  "MYFATOORAH_WEBHOOK_SECRET",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "BUNNY_STREAM_API_KEY",
  "BUNNY_STREAM_TOKEN_KEY",
  "BUNNY_STREAM_READONLY_API_KEY",
] as const;

const URLS = /\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s"'<>]+/gi;
const EMAILS = /[^\s@<>"'()\[\],;:]+@[^\s@<>"'()\[\],;:]+\.[^\s@<>"'()\[\],;:]+/g;
const BEARER = /\bBearer\s+[^\s"',;]+/gi;
const SECRET_PAIRS = /\b(authorization|set-cookie|cookie|password|passwd|pwd|secret|token|api[-_]?key|access[-_]?key|session|otp|cvv|cvc|card[-_ ]?(?:number|no)|pan)\b(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi;
const UUIDS = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
/** كل مجموعة تنتهي بنقطتين، فلا طريقة ثانية لتقسيم سلسلة الحروف: زمن خطي. النمط المتداخل السابق كان أُسيًا */
const IPV6 = /(?<![\w:])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![\w:])/gi;
/** النص الذي تفحصه الأنماط. نص الخطأ قد يحمل ردًا كاملًا من خدمة خارجية، والمخزَّن منه ٥٠٠ حرف على الأكثر */
const MAX_SCAN = 2000;
/** رقم بطاقة: من ١٣ إلى ١٩ رقمًا، بمسافات أو شرطات أو بدونها */
const CARD = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;
/** هاتف أو أي رقم طويل مشابه: أرقام الكويت ٨ خانات */
const LONG_NUMBER = /(?<!\d)\+?\d[\d ()-]{6,}\d(?!\d)/g;
const OPAQUE_OPS = /[A-Za-z0-9_-]{32,}/g;
const HOME_DIRS = /(?:[A-Za-z]:\\Users\\[^\\\s)]+|\/(?:home|Users)\/[^/\s)]+)/g;
/** أسماء كائنات قاعدة البيانات مفيدة للتشخيص وليست من مدخلات أحد. ما عداها بين علامتي اقتباس قد يكون قيمة أدخلها شخص */
const QUOTED = /(?<!(?:constraint|column|relation|table|index|function|type) )(["'])(?:(?!\1)[^\n]){1,300}\1/gi;
const CONTROL = /[\u0000-\u001f\u007f]+/g;

const easternDigits = (text: string) => text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));

/** حذف قيم المفاتيح الحرفية. رابط قاعدة البيانات يُفكك أيضًا لأن الخطأ قد يذكر جزءًا منه */
function withoutKnownSecrets(text: string): string {
  let out = text;
  for (const name of SECRET_ENV_NAMES) {
    const value = process.env[name];
    if (!value || value.length < 6) continue;
    out = out.split(value).join(REDACTED);
    if (name === "DATABASE_URL") {
      try {
        const url = new URL(value);
        for (const part of [decodeURIComponent(url.password), decodeURIComponent(url.username), url.hostname]) {
          if (part.length >= 4) out = out.split(part).join(REDACTED);
        }
      } catch {
        // قيمة ليست رابطًا: حُذفت كاملة أعلاه
      }
    }
  }
  return out;
}

/**
 * القص قبل الأنماط حتى لا يطول زمنها مع طول النص. وما قُص في منتصف كلمة يُحذف باقيه،
 * لأن نصف رمز أو نصف بريد لا يطابق نمطه فيخرج كما هو
 */
function boundedForScan(text: string): string {
  if (text.length <= MAX_SCAN) return text;
  return text.slice(0, MAX_SCAN).replace(/\S+$/, "");
}

/** نص آمن للتخزين والإرسال، بطول محدود وعلى سطر واحد */
export function scrubForOps(text: string, maxLength = 300): string {
  const cleaned = easternDigits(boundedForScan(withoutKnownSecrets(text)))
    .replace(CONTROL, " ")
    .replace(URLS, "[url]")
    .replace(EMAILS, "[email]")
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(SECRET_PAIRS, `$1$2${REDACTED}`)
    .replace(UUIDS, "[id]")
    .replace(IPV4, "[ip]")
    .replace(IPV6, "[ip]")
    .replace(CARD, "[card]")
    .replace(LONG_NUMBER, "[number]")
    .replace(HOME_DIRS, "[home]")
    .replace(QUOTED, "$1[value]$1")
    .replace(OPAQUE_OPS, REDACTED)
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, maxLength);
}

/** أسطر الاستدعاء فقط، بلا السطر الأول الذي يكرر الرسالة */
export function scrubStack(stack: string | undefined | null, maxFrames = 8, maxLength = 1500): string | null {
  if (!stack) return null;
  const frames = stack
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("at "))
    .slice(0, maxFrames)
    .map((line) => scrubForOps(line, 200));
  return frames.length ? frames.join("\n").slice(0, maxLength) : null;
}
