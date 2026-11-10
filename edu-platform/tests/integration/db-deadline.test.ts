import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, DatabaseBusyError, dbTestHooks, isDatabaseBusy, sql, withDbDeadline } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { TEST_DATABASE_URL } from "../test-env";

/**
 * لا طلب يعلق على قاعدة البيانات (F5): انتظار اتصال محدود، مهلة لكل أمر، والخطأ الواحد DatabaseBusyError.
 * على PostgreSQL محلي حقيقي بـ pg_sleep. ما لا يثبته إلا Supabase pooler الحقيقي مكتوب في handoff.md.
 */
// كما على Vercel: pooler بوضع transaction، أمر واحد على كل اتصال
const POOL = { DATABASE_PGBOUNCER: "true", DATABASE_POOL_MAX: "2", DATABASE_QUEUE_TIMEOUT_MS: "600", DATABASE_STATEMENT_TIMEOUT_MS: "1500" };
const saved = new Map<string, string | undefined>();
const admin = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });

beforeAll(async () => {
  await closeDb();
  for (const [k, v] of Object.entries(POOL)) {
    saved.set(k, process.env[k]);
    process.env[k] = v;
  }
  resetEnvCache();
  await sql`create table if not exists deadline_probe (id int primary key)`;
});

beforeEach(async () => {
  await admin`delete from deadline_probe`;
});

afterEach(() => {
  dbTestHooks.dropCancel = false;
  dbTestHooks.cancelGraceMs = 2_000;
});

afterAll(async () => {
  await sql`drop table if exists deadline_probe`;
  await closeDb();
  await admin.end();
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCache();
});

async function timed<T>(p: Promise<T>): Promise<{ ms: number; error: unknown }> {
  const start = Date.now();
  try {
    await p;
    return { ms: Date.now() - start, error: null };
  } catch (error) {
    return { ms: Date.now() - start, error };
  }
}

/** أوامر pg_sleep ما زالت تعمل على الخادم من اتصالات التطبيق */
async function sleepersRunning(): Promise<number> {
  const [{ n }] = await admin<{ n: number }[]>`
    select count(*)::int as n from pg_stat_activity
    where application_name = 'edu-platform' and state = 'active' and query like '%pg_sleep%'
  `;
  return n;
}

async function until(cond: () => Promise<boolean>, ms = 5000) {
  const start = Date.now();
  while (!(await cond())) {
    if (Date.now() - start > ms) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe("a single statement outside a transaction", () => {
  it("is cancelled on the server at its deadline and reaches the caller as DatabaseBusyError", async () => {
    const { ms, error } = await timed(withDbDeadline(300, () => sql`select pg_sleep(5)`));
    expect(error).toBeInstanceOf(DatabaseBusyError);
    expect((error as DatabaseBusyError).reason).toBe("statement");
    expect((error as DatabaseBusyError).digest).toBe("DB_BUSY");
    expect(ms).toBeLessThan(2_000);
    // الإلغاء وصل الخادم فعلًا: لم يبق pg_sleep يشغل الاتصال
    await until(async () => (await sleepersRunning()) === 0);
    expect((await sql<{ ok: number }[]>`select 1 as ok`)[0].ok).toBe(1);
  });

  it("still releases the caller when the cancel request never reaches the server (a pooler that drops it)", async () => {
    dbTestHooks.dropCancel = true;
    dbTestHooks.cancelGraceMs = 200;
    const { ms, error } = await timed(withDbDeadline(300, () => sql`select pg_sleep(2)`));
    expect(isDatabaseBusy(error)).toBe(true);
    expect(ms).toBeLessThan(1_200);
    // الخادم ما زال ينفذه: الاتصال مشغول ولا يُستخدم حتى ينتهي، ثم يعود الحوض سليمًا
    expect(await sleepersRunning()).toBe(1);
    await until(async () => (await sleepersRunning()) === 0);
    expect((await sql<{ ok: number }[]>`select 1 as ok`)[0].ok).toBe(1);
  });

  it("uses the env deadline when no long-job deadline is asked for", async () => {
    const { ms, error } = await timed(sql`select pg_sleep(4)`);
    expect(isDatabaseBusy(error)).toBe(true);
    expect(ms).toBeGreaterThanOrEqual(1_400);
    expect(ms).toBeLessThan(3_500);
  });

  it("a long job that asks for more time gets it", async () => {
    const { error } = await timed(withDbDeadline(5_000, () => sql`select pg_sleep(1.8)`));
    expect(error).toBeNull();
  });

  it("does not arm a deadline on a fragment that is only embedded, even after the deadline passed", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const { f: fragment } = await withDbDeadline(100, async () => ({ f: sql`2` }));
      await new Promise((r) => setTimeout(r, 2_600));
      const [row] = await sql<{ n: number }[]>`select 1 + ${fragment}::int as n`;
      expect(row.n).toBe(3);
      await new Promise((r) => setTimeout(r, 50));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("keeps every other database error as it is", async () => {
    const { error } = await timed(sql`select 1 / 0`);
    expect(isDatabaseBusy(error)).toBe(false);
    expect((error as { code?: string }).code).toBe("22012");
  });
});

describe("waiting for a free connection", () => {
  it("gives up after DATABASE_QUEUE_TIMEOUT_MS with DatabaseBusyError, without sending the query", async () => {
    const holders = [withDbDeadline(5_000, async () => void (await sql`select pg_sleep(1.5)`)), withDbDeadline(5_000, async () => void (await sql`select pg_sleep(1.5)`))];
    await until(async () => (await sleepersRunning()) === 2);
    const { ms, error } = await timed(sql`insert into deadline_probe (id) values (1)`);
    expect(error).toBeInstanceOf(DatabaseBusyError);
    expect((error as DatabaseBusyError).reason).toBe("queue");
    expect(ms).toBeLessThan(1_300);
    await Promise.all(holders);
    // لم يُرسل: لا صف
    expect(await admin`select id from deadline_probe`).toHaveLength(0);
  });

  it("a transaction waiting for a connection gives up the same way", async () => {
    const holders = [withDbDeadline(5_000, async () => void (await sql`select pg_sleep(1.5)`)), withDbDeadline(5_000, async () => void (await sql`select pg_sleep(1.5)`))];
    await until(async () => (await sleepersRunning()) === 2);
    const { error } = await timed(sql.begin((tx) => tx`insert into deadline_probe (id) values (2)`));
    expect(error).toBeInstanceOf(DatabaseBusyError);
    expect((error as DatabaseBusyError).reason).toBe("queue");
    await Promise.all(holders);
    expect(await admin`select id from deadline_probe`).toHaveLength(0);
  });
});

describe("a transaction", () => {
  it("sets the statement deadline with SET LOCAL, which ends with the transaction", async () => {
    const inside = await withDbDeadline(2_345, () => sql.begin(async (tx) => (await tx<{ statement_timeout: string; idle: string }[]>`select current_setting('statement_timeout') as statement_timeout, current_setting('idle_in_transaction_session_timeout') as idle`)[0]));
    expect(inside.statement_timeout).toBe("2345ms");
    expect(inside.idle).toBe("30s");
    // بعد المعاملة لا يبقى للإعداد أثر على الاتصال، فلا يرثه أمر آخر يمر عبر الـ pooler
    const after = await Promise.all([1, 2].map(() => sql<{ s: string }[]>`select current_setting('statement_timeout') as s`));
    expect(after.map((r) => r[0].s)).toEqual(["0", "0"]);
  });

  it("rolls back whole when a statement in the middle passes the deadline", async () => {
    const { error } = await timed(
      withDbDeadline(400, () =>
        sql.begin(async (tx) => {
          await tx`insert into deadline_probe (id) values (3)`;
          await tx`select pg_sleep(3)`;
          await tx`insert into deadline_probe (id) values (4)`;
        }),
      ),
    );
    expect(error).toBeInstanceOf(DatabaseBusyError);
    expect(await admin`select id from deadline_probe`).toHaveLength(0);
    expect(await sleepersRunning()).toBe(0);
  });

  it("keeps the array form of postgres.js: every returned query runs", async () => {
    const out = await sql.begin((tx) => [tx`select 1 as n`, tx`select 2 as n`]);
    expect((out as unknown as { n: number }[][]).map((r) => r[0].n)).toEqual([1, 2]);
  });

  it("keeps the mode argument", async () => {
    const level = await sql.begin("isolation level serializable", async (tx) => (await tx<{ l: string }[]>`select current_setting('transaction_isolation') as l`)[0].l);
    expect(level).toBe("serializable");
  });
});
