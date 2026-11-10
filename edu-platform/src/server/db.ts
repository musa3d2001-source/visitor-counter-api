import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import postgres, { type ISql, type Sql } from "postgres";
import { DatabaseBusyError, toBusyError } from "./db-busy";
import { env } from "./env";

export { DatabaseBusyError, isDatabaseBusy } from "./db-busy";

/**
 * اتصال PostgreSQL واحد مشترك (Supabase أو محلي).
 * يُحفظ في globalThis لتجنب فتح اتصالات جديدة مع كل إعادة تحميل في التطوير.
 *
 * لا طلب يعلق على قاعدة البيانات، بثلاثة حدود:
 *  1) انتظار اتصال شاغر محدود (queue_timeout = DATABASE_QUEUE_TIMEOUT_MS). بعده QUEUE_TIMEOUT ولا يُرسل الأمر أصلًا.
 *  2) داخل كل معاملة: set_config(..., true) أي SET LOCAL لمهلة الأمر ولمهلة الخمول داخل المعاملة. يعمل عبر
 *     Supabase pooler بوضع transaction لأن المعاملة كلها على اتصال خادم واحد، وينتهي أثره مع نهايتها.
 *     (SET على مستوى الجلسة لا يصلح هناك: الاتصال يتبدل بين المعاملات).
 *  3) الأمر المنفرد خارج المعاملات: مهلة في العميل ترسل طلب إلغاء عند انتهائها، وإن لم يصل الرد خلال مهلة قصيرة إضافية
 *     (pooler لا يمرر الإلغاء مثلًا) يُرفض الوعد للمستدعي فورًا. الاتصال نفسه يبقى مشغولًا حتى يرد الخادم، فيصطدم ما بعده
 *     بالحد الأول ويرد «مشغول» بدل أن يعلق.
 * كل ذلك يصل إلى المستدعي خطأً واحدًا: DatabaseBusyError (انظر db-busy.ts).
 *
 * المهام الطويلة (التصدير، التنظيف اليومي) تطلب مهلتها صراحة بـ withDbDeadline. الترحيلات والنسخ الاحتياطي
 * تعمل بعميل postgres خاص بها في scripts/ فلا تمر من هنا أصلًا.
 */
const globalForDb = globalThis as unknown as { __sql?: Sql };

/** المهلة الإضافية بعد طلب الإلغاء قبل أن يُرفض الوعد في العميل */
const CANCEL_GRACE_MS = 2_000;
/** المهام الطويلة الصريحة: تصدير التقارير والتنظيف اليومي. أقل من مهلة دالة الوظائف المجدولة (١٢٠ ثانية) */
export const LONG_JOB_STATEMENT_MS = 60_000;
/** الخمول داخل معاملة (كود يحمل أقفالًا ولا يرسل شيئًا) لا يقل عن هذا، فعمل JavaScript قصير بين أمرين لا يقطعها */
const MIN_IDLE_IN_TRANSACTION_MS = 30_000;

function createClient(): Sql {
  const e = env();
  return postgres(e.DATABASE_URL, {
    max: e.DATABASE_POOL_MAX,
    idle_timeout: e.DATABASE_IDLE_TIMEOUT_SECONDS,
    connect_timeout: 10,
    queue_timeout: e.DATABASE_QUEUE_TIMEOUT_MS / 1000,
    // Supabase pooler بوضع transaction لا يدعم الاستعلامات المُحضّرة
    prepare: !e.DATABASE_PGBOUNCER,
    // ولا يحتمل تمرير عدة استعلامات دفعة واحدة على اتصال واحد (pipelining):
    // تتعلق الاستعلامات حتى statement timeout عندما تزيد عن عدد الاتصالات
    ...(e.DATABASE_PGBOUNCER && { max_pipeline: 1 }),
    onnotice: () => {},
    connection: { application_name: "edu-platform" },
  });
}

export function getDb(): Sql {
  if (!globalForDb.__sql) globalForDb.__sql = createClient();
  return globalForDb.__sql;
}

// ---------------------------------------------------------------------
// المهلة
// ---------------------------------------------------------------------

const deadlineScope = new AsyncLocalStorage<{ statementMs: number }>();

/**
 * يشغل fn بمهلة أمر مختلفة عن مهلة الطلبات العادية. للمهام الطويلة المعروفة فقط، ودائمًا بحد: لا يوجد «بلا مهلة».
 */
export function withDbDeadline<T>(statementMs: number, fn: () => Promise<T>): Promise<T> {
  if (!Number.isInteger(statementMs) || statementMs < 1) throw new Error("withDbDeadline needs a positive number of milliseconds");
  return deadlineScope.run({ statementMs }, fn);
}

export function currentStatementMs(): number {
  return deadlineScope.getStore()?.statementMs ?? env().DATABASE_STATEMENT_TIMEOUT_MS;
}

/** للاختبارات فقط: يحاكي pooler يُسقط طلبات الإلغاء، ويقصر المهلة الإضافية */
export const dbTestHooks = { dropCancel: false, cancelGraceMs: CANCEL_GRACE_MS };

/**
 * ما نحتاجه من داخل Query في postgres.js 4.0.0 (مثبت بنسخة محددة في package.json). الاختبار
 * tests/integration/db-deadline.test.ts يكسر إن تغير شيء منها في ترقية لاحقة.
 */
type InternalQuery = {
  executed: boolean;
  settled: boolean;
  handle(): void;
  resolve(x: unknown): void;
  reject(x: unknown): void;
  cancel(): Promise<void>;
};

/**
 * يربط المهلة بالأمر عند تنفيذه، لا عند إنشائه: أجزاء sql`` المضمنة في أمر آخر لا تُنفذ أبدًا فلا يبدأ لها مؤقت.
 * ويحول أخطاء الانشغال إلى DatabaseBusyError.
 */
function guardQuery<Q>(query: Q, statementMs: number): Q {
  const q = query as unknown as InternalQuery;
  const handle = q.handle;
  const resolve = q.resolve;
  const reject = q.reject;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let grace: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    if (timer) clearTimeout(timer);
    if (grace) clearTimeout(grace);
    timer = grace = null;
  };
  q.resolve = function (x) {
    stop();
    return resolve.call(this, x);
  };
  q.reject = function (x) {
    stop();
    return reject.call(this, toBusyError(x));
  };
  q.handle = function () {
    if (!this.executed && !timer) {
      timer = setTimeout(() => {
        timer = null;
        if (this.settled) return;
        // ما زال ينتظر اتصالًا: يُزال من الطابور ويُرفض فورًا. وما أُرسل: يُطلب إلغاؤه من الخادم
        if (!dbTestHooks.dropCancel) this.cancel().catch(() => {});
        grace = setTimeout(() => {
          grace = null;
          if (!this.settled) this.reject(new DatabaseBusyError("statement"));
        }, dbTestHooks.cancelGraceMs);
        grace.unref?.();
      }, statementMs);
      timer.unref?.();
    }
    return handle.call(this);
  };
  return query;
}

function isTemplateCall(args: unknown[]): boolean {
  const first = args[0] as { raw?: unknown } | undefined;
  return Array.isArray(first) && Array.isArray(first.raw);
}

type TxFn = (tx: unknown) => unknown;

/** sql.begin مع مهلة SET LOCAL في أول المعاملة، وأخطاء الانشغال بالنوع الواحد */
function guardedBegin(db: Sql) {
  return (...args: unknown[]) => {
    const fn = args[args.length - 1] as TxFn;
    const mode = args.length > 1 ? (args[0] as string) : null;
    const statementMs = currentStatementMs();
    const idleMs = Math.max(MIN_IDLE_IN_TRANSACTION_MS, statementMs);
    const run = async (tx: unknown) => {
      const t = tx as (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
      await t`select set_config('statement_timeout', ${String(statementMs)}, true), set_config('idle_in_transaction_session_timeout', ${String(idleMs)}, true)`;
      const out = fn(tx);
      // postgres.js ينفذ مصفوفة أوامر معادة من الدالة، فنحفظ هذا السلوك
      return Array.isArray(out) ? Promise.all(out) : out;
    };
    const begin = db.begin as unknown as (...a: unknown[]) => Promise<unknown>;
    const started = mode === null ? begin.call(db, run) : begin.call(db, mode, run);
    return started.catch((err: unknown) => {
      throw toBusyError(err);
    });
  };
}

/** استخدام مختصر: sql`select ...` */
export const sql: Sql = new Proxy(function () {} as unknown as Sql, {
  apply(_t, _this, args) {
    const out = (getDb() as unknown as (...a: unknown[]) => unknown)(...args);
    return isTemplateCall(args) ? guardQuery(out, currentStatementMs()) : out;
  },
  get(_t, prop) {
    const db = getDb();
    if (prop === "begin") return guardedBegin(db);
    if (prop === "unsafe") return (...a: unknown[]) => guardQuery((db.unsafe as unknown as (...x: unknown[]) => unknown)(...a), currentStatementMs());
    const value = (db as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(db) : value;
  },
});

export async function closeDb() {
  if (globalForDb.__sql) {
    await globalForDb.__sql.end({ timeout: 5 });
    globalForDb.__sql = undefined;
  }
}

/** نوع مشترك للاتصال العادي أو داخل معاملة (transaction) */
export type Db = ISql;
