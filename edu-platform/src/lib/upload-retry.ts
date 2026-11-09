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
  /** لن تفيد الإعادة: رفض صريح من التخزين */
  | { kind: "fatal"; message: string };

const NETWORK_MESSAGE = "انقطع الاتصال أثناء الرفع";

export const networkFailure = (): PutOutcome => ({ kind: "retry", message: NETWORK_MESSAGE });

/** رد التخزين: 408 و425 و429 و5xx عوارض. غيرها رفض نهائي */
export function classifyPutResponse(status: number, body: string, attempt: number): PutOutcome {
  if (status >= 200 && status < 300) return { kind: "ok" };
  // Supabase يرد 400 ببدن statusCode 409 أو Duplicate عند وجود المفتاح، والتخزين المحلي 409
  if (attempt > 1 && (status === 409 || (status === 400 && /duplicate|already exists|"statusCode"\s*:\s*"?409/i.test(body)))) return { kind: "already_stored" };
  if (status === 0) return networkFailure();
  if (status === 408 || status === 425 || status === 429 || status >= 500) return { kind: "retry", message: `تعذر الرفع مؤقتًا (${status})` };
  let message = "فشل رفع الملف";
  try {
    message = (JSON.parse(body) as { error?: string }).error ?? message;
  } catch {
    /* بدن غير JSON */
  }
  return { kind: "fatal", message: `${message} (${status})` };
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
    if (outcome.kind === "fatal") return { ok: false, error: outcome.message, canRetry: false };
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
