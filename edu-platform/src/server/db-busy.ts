import { DB_BUSY_DIGEST } from "@/lib/busy";

/**
 * الخطأ الواحد الذي يعني «قاعدة البيانات لم تُتح في المهلة»: انتظار اتصال طال، أو أمر تجاوز مهلته فأُلغي،
 * أو الاتصال نفسه لم يُفتح. مسارات API تحوله إلى 503 مع Retry-After، والصفحات تعرض حالة «المنصة مشغولة».
 *
 * الرسالة ثابتة وبلا أي تفصيل من الخطأ الأصلي (نص الأمر، عنوان الخادم، القيم)، والأصل في cause لمن يحقق محليًا فقط.
 * digest ثابت: Next يحترم digest موجودًا على الخطأ، فيعرفه حد الخطأ في المتصفح ولا يرى غيره.
 */
export type BusyReason = "queue" | "statement" | "connect" | "idle_in_transaction" | "unavailable" | "hash";

/** عدّادات الضغط في «صحة المنصة». الخطأ يولد مرة واحدة لكل حدث، فلا يتكرر العد مهما عبر من طبقات */
let busyObserver: ((reason: BusyReason) => void) | null = null;

export function observeDatabaseBusy(observer: ((reason: BusyReason) => void) | null) {
  busyObserver = observer;
}

export class DatabaseBusyError extends Error {
  readonly digest = DB_BUSY_DIGEST;
  readonly code = DB_BUSY_DIGEST;

  constructor(
    readonly reason: BusyReason,
    options?: { cause?: unknown },
  ) {
    super(`database busy: ${reason}`, options);
    this.name = "DatabaseBusyError";
    busyObserver?.(reason);
  }
}

/** رموز postgres.js وPostgreSQL التي تعني انشغالًا مؤقتًا يُعاد بعده، لا خطأ في الطلب */
const BUSY_CODES: Record<string, BusyReason> = {
  QUEUE_TIMEOUT: "queue",
  // query_canceled: مهلة الأمر (statement_timeout) أو إلغاء المهلة من العميل
  "57014": "statement",
  // idle_in_transaction_session_timeout
  "25P03": "idle_in_transaction",
  CONNECT_TIMEOUT: "connect",
  // too_many_connections من الخادم أو من الـ pooler
  "53300": "unavailable",
  // cannot_connect_now (الخادم يبدأ أو يتوقف)
  "57P03": "unavailable",
  ECONNREFUSED: "unavailable",
  CONNECTION_CLOSED: "unavailable",
};

export function busyReasonOf(err: unknown): BusyReason | null {
  if (err instanceof DatabaseBusyError) return err.reason;
  const code = typeof err === "object" && err !== null ? (err as { code?: unknown }).code : undefined;
  return typeof code === "string" ? (BUSY_CODES[code] ?? null) : null;
}

/** يحول خطأ انشغال إلى DatabaseBusyError ويعيد غيره كما هو */
export function toBusyError(err: unknown): unknown {
  if (err instanceof DatabaseBusyError) return err;
  const reason = busyReasonOf(err);
  return reason ? new DatabaseBusyError(reason, { cause: err }) : err;
}

/** يعرف الخطأ حتى بعد عبوره حدود الوحدات أو تسلسله، ببصمته */
export function isDatabaseBusy(err: unknown): boolean {
  if (err instanceof DatabaseBusyError) return true;
  return typeof err === "object" && err !== null && (err as { digest?: unknown }).digest === DB_BUSY_DIGEST;
}
