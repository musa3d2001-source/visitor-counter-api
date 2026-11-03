import "server-only";
import postgres, { type ISql, type Sql } from "postgres";
import { env } from "./env";

/**
 * اتصال PostgreSQL واحد مشترك (Supabase أو محلي).
 * يُحفظ في globalThis لتجنب فتح اتصالات جديدة مع كل إعادة تحميل في التطوير.
 */
const globalForDb = globalThis as unknown as { __sql?: Sql };

function createClient(): Sql {
  const e = env();
  return postgres(e.DATABASE_URL, {
    max: e.DATABASE_POOL_MAX,
    idle_timeout: 20,
    connect_timeout: 10,
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

/** استخدام مختصر: sql`select ...` */
export const sql: Sql = new Proxy(function () {} as unknown as Sql, {
  apply(_t, _this, args) {
    return (getDb() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_t, prop) {
    const db = getDb() as unknown as Record<string | symbol, unknown>;
    const value = db[prop];
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
