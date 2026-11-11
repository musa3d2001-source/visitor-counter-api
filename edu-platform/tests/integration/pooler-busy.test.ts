import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, DatabaseBusyError, dbTestHooks, isDatabaseBusy, sql } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { pendingSaturation, resetSaturationForTests } from "@/server/platform/saturation";
import { startFakePooler, type FakePooler, type FakePoolerMode } from "../mocks/fake-pooler";
import { TEST_ENV } from "../test-env";

/**
 * Supavisor الممتلئ يرد «مشغول» لا عطلًا (F25): الرفض يصل بالرمز XX000 العام والسبب في نص الرسالة.
 * pooler مزيف يتحدث بروتوكول PostgreSQL ويرد بالرسائل نفسها التي يبنيها Supavisor، فيمر الخطأ في postgres.js كله
 * كما سيمر على Vercel: من فتح الاتصال، أو من BEGIN الممسوك، حتى withBusyGuard ورد 503.
 */
vi.mock("@/server/platform/report-error", () => ({ reportError: async () => undefined }));
const { withBusyGuard } = await import("@/server/busy-response");

const POOL = { DATABASE_PGBOUNCER: "true", DATABASE_POOL_MAX: "2", DATABASE_QUEUE_TIMEOUT_MS: "600", DATABASE_STATEMENT_TIMEOUT_MS: "1500" };
let pooler: FakePooler | null = null;

async function useFakePooler(mode: FakePoolerMode) {
  await closeDb();
  pooler = await startFakePooler(mode);
  Object.assign(process.env, POOL, { DATABASE_URL: pooler.url });
  resetEnvCache();
  return pooler;
}

beforeEach(() => resetSaturationForTests({ holdWrites: true }));

afterEach(async () => {
  dbTestHooks.cancelGraceMs = 2_000;
  await closeDb();
  await pooler?.close();
  pooler = null;
  for (const key of Object.keys(POOL)) delete process.env[key];
  Object.assign(process.env, TEST_ENV);
  resetEnvCache();
  resetSaturationForTests();
});

afterAll(closeDb);

async function settle<T>(p: Promise<T>, ms: number): Promise<{ ms: number; error: unknown; timedOut: boolean }> {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<"limit">((resolve) => {
    timer = setTimeout(() => resolve("limit"), ms);
  });
  try {
    const out = await Promise.race([p.then(() => "done" as const), limit]);
    return { ms: Date.now() - start, error: null, timedOut: out === "limit" };
  } catch (error) {
    return { ms: Date.now() - start, error, timedOut: false };
  } finally {
    clearTimeout(timer);
  }
}

describe("a pooler that refuses new clients", () => {
  const full = { kind: "refuse", code: "XX000", message: "(EMAXCONN) max client connections reached, limit: 200" } as const;

  it("is busy for a single query, counted as waiting for a connection", async () => {
    await useFakePooler(full);
    const { error } = await settle(sql`select 1`, 5_000);
    expect(error).toBeInstanceOf(DatabaseBusyError);
    expect((error as DatabaseBusyError).reason).toBe("unavailable");
    expect((error as DatabaseBusyError).message).toBe("database busy: unavailable");
    expect(pendingSaturation()).toEqual({ db_pool_wait: 1 });
  });

  it("is busy for a transaction, and its body never runs", async () => {
    await useFakePooler(full);
    let ran = false;
    const { error } = await settle(
      sql.begin(async () => {
        ran = true;
      }),
      5_000,
    );
    expect(isDatabaseBusy(error)).toBe(true);
    expect(ran).toBe(false);
  });

  it("reaches an API route as 503 with Retry-After, not as an error page", async () => {
    await useFakePooler(full);
    const route = withBusyGuard(async () => {
      await sql`select 1`;
      return Response.json({ ok: true });
    });
    const res = await route();
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
    expect(await res.json()).toMatchObject({ busy: true });
  });

  it("the older wording of the same limit is busy too", async () => {
    await useFakePooler({ kind: "refuse", code: "XX000", message: "Max client connections reached" });
    expect(isDatabaseBusy((await settle(sql`select 1`, 5_000)).error)).toBe(true);
  });

  it("a wrong project or user stays a real error the owner sees", async () => {
    await useFakePooler({ kind: "refuse", code: "XX000", message: "(ETENANTNOTFOUND) Tenant or user not found" });
    const { error } = await settle(sql`select 1`, 5_000);
    expect(isDatabaseBusy(error)).toBe(false);
    expect((error as { code?: string }).code).toBe("XX000");
    expect(pendingSaturation()).toEqual({});
  });
});

describe("a transaction whose BEGIN the pooler holds", () => {
  it("gives up at its start deadline with busy, and its body never runs even when BEGIN arrives later", async () => {
    const fake = await useFakePooler({ kind: "hold-begin" });
    dbTestHooks.cancelGraceMs = 200;
    let ran = false;
    const { ms, error, timedOut } = await settle(
      sql.begin(async (tx) => {
        ran = true;
        await tx`insert into nothing values (1)`;
      }),
      4_000,
    );
    expect(timedOut, "the transaction waited past its deadline").toBe(false);
    expect(error).toBeInstanceOf(DatabaseBusyError);
    expect((error as DatabaseBusyError).reason).toBe("queue");
    // ٦٠٠ مللي ثانية انتظار الحوض + ٢٠٠ مهلة إضافية
    expect(ms).toBeGreaterThanOrEqual(700);
    expect(ms).toBeLessThan(2_000);
    expect(fake.queries.some((q) => /^begin\b/i.test(q))).toBe(true);

    // يصل BEGIN متأخرًا: يُتراجع عن المعاملة فورًا، ولا يُرسل شيء من داخلها
    fake.releaseBegin();
    const deadline = Date.now() + 3_000;
    while (!fake.queries.some((q) => /^rollback\b/i.test(q)) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    expect(fake.queries.filter((q) => /^rollback\b/i.test(q))).toHaveLength(1);
    expect(ran).toBe(false);
    expect(fake.parsed.join(" ")).not.toMatch(/insert|set_config/);
    // الانشغال عُدّ مرة واحدة، لا مرة للمستدعي ومرة للتراجع المتأخر
    expect(pendingSaturation()).toEqual({ db_pool_wait: 1 });
  });

  it("a BEGIN the pooler answers with its checkout timeout is busy", async () => {
    await useFakePooler({ kind: "fail-begin", code: "XX000", message: "(ECHECKOUTTIMEOUT) unable to check out connection from the pool after 15000ms in Transaction mode" });
    const { error, timedOut } = await settle(sql.begin(async () => undefined), 4_000);
    expect(timedOut).toBe(false);
    expect(isDatabaseBusy(error)).toBe(true);
  });
});
