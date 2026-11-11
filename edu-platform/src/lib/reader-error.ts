/** رسالة القارئ حين يتعذر فتح الملف، مبنية على ما يعيده الخادم أو محرك pdf.js */
export const FILE_NEEDS_REPAIR_MESSAGE = "هذا الملف يحتاج إلى إصلاح من إدارة المنصة، وقد سُجلت المشكلة لديهم. وصولك إليه محفوظ.";

/** الخادم يجهز ملفات طلاب آخرين الآن (503 مع Retry-After). القارئ يعيد المحاولة وحده */
export const FILE_BUSY_MESSAGE = "يفتح كثير من الطلاب ملفاتهم الآن. سنعيد المحاولة تلقائيًا بعد ثوانٍ.";
/** نسختك المختومة قيد التجهيز في طلب آخر (429 مع Retry-After). القارئ يعيد المحاولة وحده */
export const FILE_PREPARING_MESSAGE = "نجهز نسختك من الملف الآن. سنعيد المحاولة تلقائيًا بعد ثوانٍ.";
/** حد الفتح للحساب: لا إعادة تلقائية */
export const FILE_TOO_MANY_OPENS_MESSAGE = "فتحت ملفات كثيرة في وقت قصير. انتظر بضع دقائق ثم حاول مرة أخرى.";
/** انتهت محاولات القارئ التلقائية والخادم ما زال مشغولًا */
export const FILE_STILL_BUSY_MESSAGE = "المنصة مشغولة الآن. حاول فتح الملف مرة أخرى بعد دقيقة.";

/** ترويسة يرسلها القارئ: يقبل رابطًا مؤقتًا لنسخته بدل البايتات (القرار F22). قارئ قديم بلا هذه الترويسة يأخذ البايتات كما كان */
export const READER_DELIVERY_HEADER = "x-reader-delivery";

/** جواب مسار الملفات للقارئ حين تكون نسخته محفوظة: رابط لدقيقة واحدة يتبعه دون كوكي */
export type FileLinkAnswer = { url: string; size: number | null; expiresIn: number };

/**
 * رمز ثابت في كل رد JSON من مسار الملفات (البند R017): يفرّق الانشغال المؤقت عن الملف المعيب دون قراءة نص الرسالة.
 * busy و preparing: مؤقت، مع Retry-After و retry: true. too_many_opens: حد الفتح، مع Retry-After و retry: false.
 * repair: الملف نفسه يحتاج إصلاحًا من الإدارة (503 بلا Retry-After). الباقي رفض نهائي لهذا الطلب.
 * انشغال قاعدة البيانات يمر بالرد الموحد للمنصة (busy: true مع Retry-After) ولا يحمل code.
 */
export const FILE_ANSWER_CODES = ["busy", "preparing", "too_many_opens", "repair", "signin", "denied", "not_found", "read_only", "open_from_library", "failed"] as const;
export type FileAnswerCode = (typeof FILE_ANSWER_CODES)[number];

/**
 * retryable: الخادم أرسل Retry-After (انشغال أو تجهيز). 503 بلا Retry-After يعني ملفًا معيبًا،
 * وإعادة المحاولة لا تفيده.
 */
export function readerErrorMessage(err: unknown): string {
  const { status, name, retryable } = (err ?? {}) as { status?: number; name?: string; retryable?: boolean };
  if (status === 401) return "انتهت جلستك، سجّل الدخول مرة أخرى.";
  if (status === 403) return "لا تملك صلاحية فتح هذا الملف.";
  if (status === 429 && !retryable) return FILE_TOO_MANY_OPENS_MESSAGE;
  if ((status === 503 || status === 429) && retryable) return FILE_STILL_BUSY_MESSAGE;
  // ملف محمي بكلمة مرور لا يفيده الاتصال ولا إعادة المحاولة
  if (status === 503 || name === "PasswordException") return FILE_NEEDS_REPAIR_MESSAGE;
  return "تعذر فتح الملف. تحقق من اتصالك وحاول مرة أخرى.";
}

/** أطول انتظار يقبله القارئ من Retry-After، وعدد المحاولات التلقائية قبل أن يقول إن المنصة مشغولة */
export const READER_RETRY = { maxWaitSeconds: 30, minWaitSeconds: 2, attempts: 6 } as const;

/**
 * كم ينتظر القارئ قبل المحاولة التالية، أو null: لا إعادة تلقائية.
 * يعيد فقط ما قال الخادم إنه مؤقت: Retry-After مع retry: true في الجسم (حد الفتح للحساب يرسل retry: false).
 */
export function readerRetryDelaySeconds(status: number, retryAfter: string | null, retryFlag: unknown, attempt: number): number | null {
  if (status !== 503 && status !== 429) return null;
  if (retryAfter === null || retryFlag !== true || attempt >= READER_RETRY.attempts) return null;
  const seconds = Number(retryAfter);
  if (!Number.isFinite(seconds) || seconds > 600) return null;
  return Math.min(READER_RETRY.maxWaitSeconds, Math.max(READER_RETRY.minWaitSeconds, seconds));
}
