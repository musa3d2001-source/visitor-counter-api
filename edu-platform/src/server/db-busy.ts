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

/** رموز postgres.js وPostgreSQL والشبكة التي تعني انشغالًا مؤقتًا يُعاد بعده، لا خطأ في الطلب */
const BUSY_CODES: Record<string, BusyReason> = {
  QUEUE_TIMEOUT: "queue",
  // query_canceled: مهلة الأمر (statement_timeout) أو إلغاء المهلة من العميل
  "57014": "statement",
  // idle_in_transaction_session_timeout
  "25P03": "idle_in_transaction",
  CONNECT_TIMEOUT: "connect",
  // too_many_connections: PostgreSQL نفسه بلغ max_connections (Supavisor يعيد خطأ الخادم كما هو حين يتعذر عليه فتح اتصال إليه)
  "53300": "unavailable",
  // cannot_connect_now (الخادم يبدأ أو يتوقف)
  "57P03": "unavailable",
  // admin_shutdown و crash_shutdown: أُنهي الاتصال لإعادة تشغيل أو تبديل الخادم، والمحاولة التالية تفتح اتصالًا جديدًا
  "57P01": "unavailable",
  "57P02": "unavailable",
  // أخطاء الشبكة كما يمررها postgres.js عند فتح الاتصال، بلا تغيير. ENOTFOUND خارجها عمدًا: اسم خادم خاطئ خطأ إعداد لا انشغال
  ECONNREFUSED: "unavailable",
  ECONNRESET: "unavailable",
  ETIMEDOUT: "unavailable",
  EPIPE: "unavailable",
  EAI_AGAIN: "unavailable",
  CONNECTION_CLOSED: "unavailable",
};

/**
 * Supavisor (الـ pooler في Supabase) يرفض بخطأ FATAL رمزه XX000 العام، والسبب في أول الرسالة بين قوسين:
 * lib/supavisor/error.ex (https://github.com/supabase/supavisor/blob/main/lib/supavisor/error.ex) يبني
 * {"S" => "FATAL", "C" => "XX000", "M" => "(CODE) ..."}. نقرأ الوسم وحده، ولا نعد XX000 بلا وسم معروف انشغالًا:
 * «(ETENANTNOTFOUND) Tenant or user not found» وأخطاء كلمة المرور خطأ إعداد يجب أن يظهر عطلًا للمالك.
 */
const SUPAVISOR_BUSY: Record<string, BusyReason> = {
  // max client connections reached, limit: N — حد عملاء الـ pooler لحجم الحوسبة (٢٠٠ في Micro و٤٠٠ في Small)
  EMAXCONN: "unavailable",
  // max clients reached in session mode - max clients are limited to pool_size: N
  EMAXCONNSESSION: "unavailable",
  // max pools count reached
  EMAXPOOLSREACHED: "unavailable",
  // unable to check out connection from the pool after Nms in Transaction mode: كل اتصالات الخادم مشغولة
  ECHECKOUTTIMEOUT: "queue",
  // failed to check out a connection after multiple retries
  ECHECKOUTRETRIES: "queue",
  // DbHandler exited: الاتصال بالخادم انقطع أثناء إعادة تشغيله
  EDBHANDLEREXITED: "unavailable",
};
/** قاطع الدائرة في Supavisor: بعد محاولات اتصال فاشلة بقاعدة البيانات يمنع الجديد مؤقتًا. أنواعه الأخرى (كلمة مرور خاطئة) ليست انشغالًا */
const SUPAVISOR_DB_CIRCUIT = /too many failed attempts to connect to the database/i;
/** نص الحد القديم في Supabase، كما في جدول الأخطاء في https://supabase.com/docs/guides/database/supavisor */
const POOLER_FULL_TEXT = /max client connections reached/i;
/**
 * PgBouncer (src/client.c و src/janitor.c في https://github.com/pgbouncer/pgbouncer، والرمز من send_pooler_error في src/proto.c):
 * الرفض FATAL برمز 08P01 والسبب نص.
 * «server login has been failing» خارجها عمدًا: كلمة مرور أو إعداد خاطئ، لا ازدحام.
 */
const PGBOUNCER_BUSY: [RegExp, BusyReason][] = [
  [/no more connections allowed \(max_client_conn\)/i, "unavailable"],
  [/client connections exceeded \(max_(?:db|user)_client_connections\)/i, "unavailable"],
  [/query_wait_timeout/i, "queue"],
];

function poolerReason(code: string, message: string): BusyReason | null {
  if (code === "XX000") {
    const tag = /^\(([A-Z_]+)\)/.exec(message)?.[1];
    if (tag && SUPAVISOR_BUSY[tag]) return SUPAVISOR_BUSY[tag];
    if (tag === "ECIRCUITBREAKER" && SUPAVISOR_DB_CIRCUIT.test(message)) return "unavailable";
  }
  if (code === "XX000" || code === "08P01") {
    if (POOLER_FULL_TEXT.test(message)) return "unavailable";
  }
  if (code === "08P01") {
    for (const [pattern, reason] of PGBOUNCER_BUSY) if (pattern.test(message)) return reason;
  }
  return null;
}

export function busyReasonOf(err: unknown): BusyReason | null {
  if (err instanceof DatabaseBusyError) return err.reason;
  if (typeof err !== "object" || err === null) return null;
  const { code, message } = err as { code?: unknown; message?: unknown };
  if (typeof code !== "string") return null;
  return BUSY_CODES[code] ?? (typeof message === "string" ? poolerReason(code, message) : null);
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
