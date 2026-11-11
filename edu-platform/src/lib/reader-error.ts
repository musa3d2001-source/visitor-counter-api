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
/** انقطع الاتصال أثناء الطلب أو التنزيل، بعد إعادة واحدة تلقائية */
export const FILE_CONNECTION_MESSAGE = "تعذر تحميل الملف. تحقق من اتصالك وحاول مرة أخرى.";
/** خطأ في الخادم نفسه (500): ليس الاتصال وليس الملف */
export const FILE_SERVER_FAILED_MESSAGE = "تعذر تحميل الملف حاليًا. حاول مرة أخرى بعد قليل.";
/** محرك القارئ أو عامله لم يُحمَّل: شبكة انقطعت، أو متصفح أقدم من أن يشغّله */
export const READER_ENGINE_FAILED_MESSAGE = "تعذر تشغيل قارئ الملفات على هذا المتصفح. حاول مرة أخرى، وإن تكرر ذلك فحدّث المتصفح أو افتح الملف من Safari أو Chrome.";
/** وصل الملف كاملًا وفحصه الخادم عند رفعه، لكن المتصفح لم يستطع فتحه */
export const READER_OPEN_FAILED_MESSAGE = "وصل الملف كاملًا، لكن هذا المتصفح لم يستطع عرضه. حاول مرة أخرى، وإن تكرر ذلك فحدّث المتصفح أو افتح الملف من Safari أو Chrome.";
/** صفحة واحدة لم تُرسم (القرار F27): تُقال على الصفحة نفسها مع زر لإعادة رسمها */
export const READER_PAGE_FAILED_MESSAGE = "تعذر عرض هذه الصفحة على هذا المتصفح.";

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

/** رد غير ناجح من مسار الملفات كما يقرؤه القارئ */
export type FileAnswer = {
  status: number;
  retryAfter: string | null;
  /** جسم JSON من التطبيق نفسه ({ error, ... })، لا صفحة خطأ من المنصة */
  appJson: boolean;
  /** ترويسة x-vercel-error: الرد من منصة الاستضافة لا من التطبيق */
  platformError: string | null;
  body: { retry?: unknown; busy?: unknown; code?: unknown };
};

/**
 * نوع الرد:
 *  - app: انشغال قاله التطبيق صراحة (retry: true من مسار الملفات، أو busy: true من الرد الموحد لانشغال قاعدة البيانات أو التحديث)
 *  - platform: 502 أو 503 أو 504 بلا JSON من التطبيق، أو بترويسة x-vercel-error. Vercel عند حد التنفيذ المتزامن
 *    (FUNCTION_THROTTLED) يرد 503 بلا Retry-After: ليس ملفًا معيبًا، وإعادة المحاولة بعد ثوانٍ تنجح عادة
 *  - final: كل ما سواهما، ومنه حد الفتح للحساب (retry: false) والملف المعيب (code: repair) والرفض
 */
export function fileAnswerKind(a: FileAnswer): "app" | "platform" | "final" {
  if ((a.status === 503 || a.status === 429) && a.appJson && (a.body.retry === true || a.body.busy === true)) return "app";
  if ((a.status === 502 || a.status === 503 || a.status === 504) && (!a.appJson || a.platformError !== null)) return "platform";
  return "final";
}

/**
 * حدود الإعادة التلقائية: انتظار Retry-After بين حديه، وعدد المحاولات لكل نوع.
 * رد المنصة بلا Retry-After يُعاد مرتين فقط بعد 5 ثم 15 ثانية: كل إعادة استدعاء جديد قد يُرد هو أيضًا وقت الذروة.
 * انقطاع الشبكة يُعاد مرة واحدة.
 */
export const READER_RETRY = { maxWaitSeconds: 30, minWaitSeconds: 2, attempts: 6, platformAttempts: 2, platformWaits: [5, 15], networkAttempts: 1, networkWaitSeconds: 2 } as const;

/**
 * كم ينتظر القارئ قبل المحاولة التالية (قبل التوزيع العشوائي)، أو null: لا إعادة تلقائية.
 * attempt: عدد ما أُعيد من النوع نفسه قبل هذا الرد. ما قاله الخادم في Retry-After لا يُقصَّر أبدًا إلا إلى حده الأعلى.
 */
export function readerRetryDelaySeconds(a: FileAnswer, attempt: number): number | null {
  const kind = fileAnswerKind(a);
  if (kind === "final") return null;
  if (attempt >= (kind === "app" ? READER_RETRY.attempts : READER_RETRY.platformAttempts)) return null;
  const said = a.retryAfter === null ? null : Number(a.retryAfter.trim());
  const valid = said !== null && a.retryAfter!.trim() !== "" && Number.isFinite(said) && said >= 0 && said <= 600;
  // التطبيق يرسل Retry-After دائمًا مع الانشغال؛ رد بلا مهلة صالحة منه ليس ما يعرفه القارئ فلا يُخمَّن
  if (kind === "app" && !valid) return null;
  const seconds = valid ? said! : READER_RETRY.platformWaits[Math.min(attempt, READER_RETRY.platformWaits.length - 1)];
  return Math.min(READER_RETRY.maxWaitSeconds, Math.max(READER_RETRY.minWaitSeconds, seconds));
}

/**
 * الانتظار الفعلي بالمللي ثانية: المهلة نفسها وجزء عشوائي منها حتى ضعفها (البند R017).
 * طلاب رُدوا في اللحظة نفسها لا يعودون في اللحظة نفسها، ولا يعود أحد قبل ما قاله الخادم.
 */
export function jitteredWaitMs(seconds: number, random: number = Math.random()): number {
  const r = Math.min(1, Math.max(0, random));
  return Math.round(seconds * 1000 * (1 + r));
}

/** كم ينتظر القارئ قبل إعادة طلب انقطع في الشبكة، أو null بعد المحاولة المسموحة */
export function networkRetryDelaySeconds(attempt: number): number | null {
  return attempt < READER_RETRY.networkAttempts ? READER_RETRY.networkWaitSeconds : null;
}

/** تعثر يحمل مرحلته، لتقول الرسالة ما حدث فعلًا */
export type ReaderFailure =
  | { stage: "answer"; status: number; code: string | null; kind: "app" | "platform" | "final" }
  | { stage: "network" }
  | { stage: "engine" }
  | { stage: "open" };

export function readerFailure(failure: ReaderFailure, cause?: unknown): Error & ReaderFailure {
  return Object.assign(new Error(`reader ${failure.stage}`, { cause }), failure);
}

/** من رد غير ناجح إلى تعثر بعد أن انتهت إعادته أو لم تكن له إعادة */
export function answerFailure(a: FileAnswer): Error & ReaderFailure {
  return readerFailure({ stage: "answer", status: a.status, code: typeof a.body.code === "string" ? a.body.code : null, kind: fileAnswerKind(a) });
}

export function readerErrorMessage(err: unknown): string {
  const e = (err ?? {}) as Partial<ReaderFailure> & { name?: string; status?: number; code?: unknown; kind?: string };
  // ملف محمي بكلمة مرور لا يفيده الاتصال ولا إعادة المحاولة
  if (e.name === "PasswordException") return FILE_NEEDS_REPAIR_MESSAGE;
  if (e.stage === "engine") return READER_ENGINE_FAILED_MESSAGE;
  if (e.stage === "open") return READER_OPEN_FAILED_MESSAGE;
  if (e.stage === "network") return FILE_CONNECTION_MESSAGE;
  if (e.stage !== "answer") return FILE_CONNECTION_MESSAGE;
  // الملف معيب فقط حين يقول الخادم ذلك برمزه، لا من رقم الحالة: 503 المنصة ليس ملفًا معيبًا
  if (e.code === "repair") return FILE_NEEDS_REPAIR_MESSAGE;
  if (e.kind === "app" || e.kind === "platform") return FILE_STILL_BUSY_MESSAGE;
  if (e.status === 401) return "انتهت جلستك، سجّل الدخول مرة أخرى.";
  if (e.status === 403) return "لا تملك صلاحية فتح هذا الملف.";
  if (e.status === 404) return "لم نجد هذا الملف. ارجع وافتحه من جديد.";
  if (e.status === 429) return FILE_TOO_MANY_OPENS_MESSAGE;
  if (e.code === "open_from_library") return "افتح الملف من صفحة «مكتبتي».";
  if ((e.status ?? 0) >= 500) return FILE_SERVER_FAILED_MESSAGE;
  return FILE_CONNECTION_MESSAGE;
}
