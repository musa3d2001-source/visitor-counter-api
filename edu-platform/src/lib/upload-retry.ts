/**
 * منطق إعادة محاولة رفع الملف من المتصفح، منفصل عن XHR حتى يُختبر وحده.
 * إعادة الرفع آمنة: المفتاح ثابت، والخادم يتحقق من الملف كاملًا عند التأكيد.
 * «موجود مسبقًا» في محاولة لاحقة يعني أن المحاولة السابقة وصلت وضاع ردها فقط.
 */
export const UPLOAD_RETRY = {
  /** عدد المحاولات الكلي للرفع */
  attempts: 4,
  baseDelayMs: 2_000,
  maxDelayMs: 15_000,
  /** بلا أي تقدم طوال هذه المدة نعد الاتصال معلقًا ونقطعه */
  stallMs: 60_000,
  /** أقصى انتظار لعودة الشبكة قبل أن نترك القرار للمستخدم */
  offlineWaitMs: 5 * 60_000,
} as const;

export type PutOutcome =
  | { kind: "ok" }
  | { kind: "already_stored" }
  /** عطل عابر: الشبكة أو الخادم */
  | { kind: "retry"; message: string }
  /** لن تفيد إعادة الطلب نفسه: رفض صريح من التخزين. canRetry يعني أن رفعًا جديدًا برابط جديد قد ينجح */
  | { kind: "fatal"; message: string; canRetry?: boolean };

const NETWORK_MESSAGE = "انقطع الاتصال أثناء الرفع";

export const networkFailure = (): PutOutcome => ({ kind: "retry", message: NETWORK_MESSAGE });

/** Supabase يلف أغلب أخطائه في HTTP 400 والرقم الحقيقي في حقل statusCode داخل البدن */
function storageStatus(status: number, body: string): number {
  if (status !== 400) return status;
  try {
    const code = Number((JSON.parse(body) as { statusCode?: unknown }).statusCode);
    return Number.isInteger(code) && code >= 100 && code < 600 ? code : status;
  } catch {
    return status;
  }
}

/** رد التخزين: 408 و425 و429 و5xx عوارض، وغيرها رفض. نص المزود الإنجليزي لا يصل إلى المعلم أبدًا */
export function classifyPutResponse(status: number, body: string, attempt: number): PutOutcome {
  if (status >= 200 && status < 300) return { kind: "ok" };
  const real = storageStatus(status, body);
  // Supabase يرد 400 ببدن statusCode 409 أو Duplicate عند وجود المفتاح، والتخزين المحلي 409
  if (attempt > 1 && (real === 409 || (status === 400 && /duplicate|already exists/i.test(body)))) return { kind: "already_stored" };
  if (status === 0) return networkFailure();
  if (real === 408 || real === 425 || real === 429 || real >= 500) return { kind: "retry", message: "تعذر الوصول إلى التخزين مؤقتًا" };
  if (real === 413) return { kind: "fatal", message: "حجم الملف أكبر مما يقبله التخزين حاليًا. صغّر حجمه أو قسّمه ثم ارفعه." };
  if (real === 415) return { kind: "fatal", message: "صيغة هذا الملف غير مقبولة. ارفعه بالصيغة المطلوبة." };
  if (real === 401 || real === 403 || /invalidjwt|exp.{0,20}claim|expired/i.test(body)) return { kind: "fatal", message: "انتهت صلاحية رابط الرفع. أعد المحاولة.", canRetry: true };
  return { kind: "fatal", message: "رفض التخزين هذا الملف. تأكد منه ثم ارفعه من جديد، وإن تكرر ذلك فتواصل مع إدارة المنصة." };
}

export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(UPLOAD_RETRY.maxDelayMs, UPLOAD_RETRY.baseDelayMs * 2 ** (attempt - 1));
  // تفاوت بسيط حتى لا تعود الملفات المتعددة كلها في اللحظة نفسها
  return Math.round(ceiling * (0.75 + random() * 0.25));
}

export type RetryNotice = { reason: "retrying"; attempt: number; of: number } | { reason: "offline" };

export type RetryDeps = {
  sleep: (ms: number) => Promise<void>;
  isOffline: () => boolean;
  /** يعود true عند رجوع الشبكة، وfalse عند انتهاء مهلة الانتظار */
  waitForOnline: (timeoutMs: number) => Promise<boolean>;
  onNotice: (n: RetryNotice) => void;
  random?: () => number;
};

export type PutResult = { ok: true } | { ok: false; error: string; canRetry: boolean };

export async function putWithRetry(send: (attempt: number) => Promise<PutOutcome>, deps: RetryDeps): Promise<PutResult> {
  let last = NETWORK_MESSAGE;
  for (let attempt = 1; attempt <= UPLOAD_RETRY.attempts; attempt++) {
    if (deps.isOffline()) {
      deps.onNotice({ reason: "offline" });
      const back = await deps.waitForOnline(UPLOAD_RETRY.offlineWaitMs);
      if (!back) return { ok: false, error: "لا يوجد اتصال بالإنترنت. تأكد من الشبكة ثم أعد المحاولة.", canRetry: true };
    }
    const outcome = await send(attempt);
    if (outcome.kind === "ok" || outcome.kind === "already_stored") return { ok: true };
    if (outcome.kind === "fatal") return { ok: false, error: outcome.message, canRetry: outcome.canRetry === true };
    last = outcome.message;
    if (attempt < UPLOAD_RETRY.attempts) {
      deps.onNotice({ reason: "retrying", attempt: attempt + 1, of: UPLOAD_RETRY.attempts });
      await deps.sleep(retryDelayMs(attempt, deps.random));
    }
  }
  return { ok: false, error: `${last}. لم يكتمل رفع الملف، أعد المحاولة.`, canRetry: true };
}

/** الردود التي تستحق إعادة طلبات الخادم (التجهيز والتأكيد): أعطال البوابة فقط، لا أخطاء التحقق */
export const isTransientServerStatus = (status: number) => status === 502 || status === 503 || status === 504;
