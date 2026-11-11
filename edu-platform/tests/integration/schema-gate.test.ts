import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DB_MAINTENANCE_DIGEST, DB_MAINTENANCE_MESSAGE, DB_MAINTENANCE_TITLE } from "@/lib/busy";
import { REQUIRED_MIGRATIONS } from "@/lib/migrations";
import { isDatabaseBusy, resetSchemaGateForTests, schemaStatus, SchemaNotReadyError } from "@/server/db";
import { resetHealthCacheForTests } from "@/server/platform/health";
import { resetOpsWatchdogForTests } from "@/server/platform/scheduled-jobs";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser } from "../helpers/factories";
import { TEST_DATABASE_URL } from "../test-env";

/**
 * كود جديد على قاعدة لم تُطبق عليها ترحيلاته (F26): لا 500 ولا دخول مكسور، بل «قيد التحديث» في كل مكان،
 * و503 مع Retry-After لكل API، وفحص الصحة يسمي الناقص. وحين يُطبق الترحيل يعود الموقع وحده.
 * على PostgreSQL محلي حقيقي: الترحيل «الناقص» صف يُحذف من schema_migrations ثم يعاد.
 */
// ترويسات الطلب وملف تعريف الجهاز لا وجود لهما خارج Next. المسار الحقيقي بعدهما: loginWithPassword على قاعدة البيانات
vi.mock("@/server/http", async (original) => ({ ...(await original<typeof import("@/server/http")>()), clientIp: async () => "192.0.2.1", userAgent: async () => "vitest" }));
vi.mock("@/server/auth/device-cookie", () => ({ readLoginDeviceCookie: async () => undefined, setLoginDeviceCookie: vi.fn() }));

const { GET: health } = await import("@/app/api/health/route");
const { withBusyGuard } = await import("@/server/busy-response");
const { loginAction } = await import("@/app/(site)/(auth)/actions");

const admin = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
const LAST = REQUIRED_MIGRATIONS[REQUIRED_MIGRATIONS.length - 1];
let saved: { name: string; applied_at: Date } | null = null;

async function removeMigration(name: string) {
  [saved] = await admin<{ name: string; applied_at: Date }[]>`delete from schema_migrations where name = ${name} returning name, applied_at`;
  resetSchemaGateForTests();
}

async function restoreMigration() {
  if (saved) await admin`insert into schema_migrations (name, applied_at) values (${saved.name}, ${saved.applied_at}) on conflict do nothing`;
  saved = null;
}

async function failure(p: PromiseLike<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (err) {
    return err;
  }
  throw new Error("expected a failure");
}

beforeAll(resetDb);
beforeEach(() => {
  resetHealthCacheForTests();
  resetOpsWatchdogForTests();
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await restoreMigration();
  resetSchemaGateForTests();
});
afterAll(async () => {
  await closeDb();
  await admin.end();
});

describe("a database that lacks a migration this code needs", () => {
  it("refuses every query before it is sent, with one calm maintenance error naming nothing to the user", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await removeMigration(LAST);
    // جدول غير موجود كان سيعطي 42P01 لو أُرسل الأمر: المنع قبل الإرسال
    const err = await failure(sql`select * from a_table_that_does_not_exist`);
    expect(err).toBeInstanceOf(SchemaNotReadyError);
    expect(isDatabaseBusy(err)).toBe(true);
    expect((err as SchemaNotReadyError).digest).toBe(DB_MAINTENANCE_DIGEST);
    expect((err as SchemaNotReadyError).missing).toEqual([LAST]);
    expect((err as Error).message).not.toContain(LAST);
    expect(await failure(sql.unsafe("select 1"))).toBeInstanceOf(SchemaNotReadyError);
    let ran = false;
    expect(
      await failure(
        sql.begin(async () => {
          ran = true;
        }),
      ),
    ).toBeInstanceOf(SchemaNotReadyError);
    expect(ran).toBe(false);
    expect(schemaStatus()).toEqual({ state: "missing", missing: [LAST] });
    // سطر واحد في سجل الخادم لتغير الحالة، لا سطر لكل طلب
    expect(logged.mock.calls.filter((c) => String(c[0]).includes("[db]"))).toHaveLength(1);
    expect(String(logged.mock.calls[0]?.[0])).toContain(LAST);
  });

  it("every API answers 503 with Retry-After and the maintenance message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await removeMigration(LAST);
    const route = withBusyGuard(async () => Response.json(await sql`select 1 as ok`));
    const res = await route();
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(await res.json()).toEqual({ error: DB_MAINTENANCE_MESSAGE, busy: true, maintenance: true });
    const page = await withBusyGuard(async () => Response.json(await sql`select 1 as ok`), "html")();
    expect(page.status).toBe(503);
    expect(await page.text()).toContain(DB_MAINTENANCE_TITLE);
  });

  it("the health check is down and names the missing migration", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await removeMigration(LAST);
    const res = await health();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "down", reason: "migrations", missing: [LAST] });
  });

  it("sign-in answers in its own form and asks to wait, instead of breaking", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = await createUser();
    await removeMigration(LAST);
    const fd = new FormData();
    fd.set("email", user.email);
    fd.set("password", "any-password-123");
    await expect(loginAction(null, fd)).resolves.toEqual({ error: DB_MAINTENANCE_MESSAGE, values: { email: user.email }, retryAfter: 30 });
  });

  it("a database with no migrations table at all is in maintenance with every migration missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await admin`alter table schema_migrations rename to schema_migrations_hidden`;
    try {
      resetSchemaGateForTests();
      const err = await failure(sql`select 1`);
      expect((err as SchemaNotReadyError).missing).toEqual([...REQUIRED_MIGRATIONS]);
    } finally {
      await admin`alter table schema_migrations_hidden rename to schema_migrations`;
    }
  });

  it("comes back by itself once the migration is applied, checking at most every 10 seconds meanwhile", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["Date"] });
    await removeMigration(LAST);
    expect(await failure(sql`select 1`)).toBeInstanceOf(SchemaNotReadyError);
    await restoreMigration();
    // داخل نافذة إعادة الفحص: ما زال مرفوضًا دون سؤال قاعدة البيانات
    vi.setSystemTime(Date.now() + 9_000);
    expect(await failure(sql`select 1`)).toBeInstanceOf(SchemaNotReadyError);
    vi.setSystemTime(Date.now() + 2_000);
    const [row] = await sql<{ ok: number }[]>`select 1 as ok`;
    expect(row.ok).toBe(1);
    expect(schemaStatus().state).toBe("ready");
    expect(info.mock.calls.filter((c) => String(c[0]).includes("[db]"))).toHaveLength(1);
  });
});

describe("a database that has every migration", () => {
  it("is checked once per instance and never again, so a present schema costs nothing", async () => {
    resetSchemaGateForTests();
    expect((await sql<{ ok: number }[]>`select 1 as ok`)[0].ok).toBe(1);
    expect(schemaStatus()).toEqual({ state: "ready", missing: [] });
    // بعد الجاهزية لا يُعاد الفحص: حذف صف لا يغير شيئًا على هذه النسخة
    [saved] = await admin<{ name: string; applied_at: Date }[]>`delete from schema_migrations where name = ${LAST} returning name, applied_at`;
    expect((await sql<{ ok: number }[]>`select 1 as ok`)[0].ok).toBe(1);
    expect(await sql.begin(async (tx) => (await tx<{ ok: number }[]>`select 1 as ok`)[0].ok)).toBe(1);
    expect(schemaStatus().state).toBe("ready");
  });
});
