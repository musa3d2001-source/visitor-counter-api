import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { configurePoolHold, POOL_HOLD_EXTRA_MS, resetPoolHoldForTests, type PoolHoldConfig } from "@/server/db-pool-hold";
import { getDb } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { closeDb, sql } from "../helpers/db";
import { TEST_DATABASE_URL } from "../test-env";

/**
 * على Vercel (Fluid) تُعلق النسخة بعد آخر طلب ومؤقت الخمول لا يعمل وهي معلقة، فيبقى اتصالها بالـ pooler محجوزًا (R015).
 * بعد كل أمر أو معاملة يُسجل وعد عند Vercel (after() ‏= waitUntil) يبقي النسخة حية حتى تمر مهلة الخمول وتُغلق الاتصالات.
 * على PostgreSQL محلي حقيقي بمهلة خمول ثانية واحدة، و after() مستبدل بمسجل يحفظ الوعود (خارج Next لا طلب لها).
 */
const admin = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
const savedIdle = process.env.DATABASE_IDLE_TIMEOUT_SECONDS;
let holds: Promise<void>[] = [];
let previous: PoolHoldConfig;

const settledWithin = (p: Promise<unknown>, ms: number) =>
  Promise.race([p.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), ms))]);

async function backendAlive(pid: number) {
  const [row] = await admin<{ n: number }[]>`select count(*)::int as n from pg_stat_activity where pid = ${pid}`;
  return row.n === 1;
}

async function poolOpen() {
  const stats = getDb().stats;
  return stats.connections + stats.opening;
}

beforeAll(async () => {
  process.env.DATABASE_IDLE_TIMEOUT_SECONDS = "1";
  resetEnvCache();
  // عميل جديد يقرأ مهلة الخمول الجديدة
  await closeDb();
  // فحص الترحيلات الأول أمر هو أيضًا: يُنجز قبل أن يبدأ العد
  await sql`select 1`;
  previous = configurePoolHold({ enabled: () => true, register: (p) => void holds.push(p) });
});

afterEach(() => {
  resetPoolHoldForTests();
  holds = [];
  // مهلة الحوض وعدد اتصالاته الحقيقيان من db.ts، ومسجل الاختبار
  configurePoolHold({ ...previous, enabled: () => true, register: (p) => void holds.push(p) });
});

afterAll(async () => {
  configurePoolHold(previous);
  if (savedIdle === undefined) delete process.env.DATABASE_IDLE_TIMEOUT_SECONDS;
  else process.env.DATABASE_IDLE_TIMEOUT_SECONDS = savedIdle;
  resetEnvCache();
  await closeDb();
  await admin.end();
});

describe("holding a Vercel instance until its idle connections close", () => {
  it("keeps the instance alive past the idle timeout, and lets it go once the pool is empty", async () => {
    const started = Date.now();
    const [{ pid }] = await sql<{ pid: number }[]>`select pg_backend_pid() as pid`;
    expect(holds).toHaveLength(1);
    expect(await backendAlive(pid)).toBe(true);
    await holds[0];
    const held = Date.now() - started;
    // مهلة الخمول (ثانية) ثم ١٠٠ مللي ثانية، ولا أكثر من ثانية إضافية تنتظر الإغلاق
    expect(held).toBeGreaterThanOrEqual(1_000);
    expect(held).toBeLessThan(1_100 + POOL_HOLD_EXTRA_MS + 500);
    // حين انتهى الوعد كان الحوض فارغًا: لا مقعد محجوز عند الـ pooler لو عُلقت النسخة الآن
    expect(await poolOpen()).toBe(0);
    let alive = await backendAlive(pid);
    for (let i = 0; alive && i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50));
      alive = await backendAlive(pid);
    }
    expect(alive).toBe(false);
  });

  it("if the pool is still open when the timeout is due, waits for it to close, but never more than a second longer", async () => {
    // مهلة الحوض الحقيقية ثانية، والوعد يظنها صفرًا: يجب أن ينتظر الإغلاق الفعلي لا المهلة وحدها
    configurePoolHold({ idleMs: () => 0 });
    let started = Date.now();
    await sql`select 1`;
    await holds[0];
    expect(Date.now() - started).toBeGreaterThanOrEqual(800);
    expect(await poolOpen()).toBe(0);
    // اتصال لا يُغلق أبدًا: يُترك الوعد بعد ثانية إضافية، فلا تبقى النسخة حية بلا حد
    configurePoolHold({ connections: () => 1 });
    started = Date.now();
    await sql`select 1`;
    await holds[1];
    const held = Date.now() - started;
    expect(held).toBeGreaterThanOrEqual(POOL_HOLD_EXTRA_MS);
    expect(held).toBeLessThan(POOL_HOLD_EXTRA_MS + 600);
  });

  it("holds after a transaction too", async () => {
    await sql.begin(async (tx) => tx`select 1`);
    expect(holds.length).toBeGreaterThanOrEqual(1);
    expect(await settledWithin(holds[holds.length - 1], 200)).toBe(false);
  });

  it("a newer use ends the earlier hold at once, so one hold waits per instance", async () => {
    await sql`select 1`;
    await sql`select 2`;
    expect(holds).toHaveLength(2);
    expect(await settledWithin(holds[0], 50)).toBe(true);
    expect(await settledWithin(holds[1], 200)).toBe(false);
  });

  it("a use outside any request does not throw, and stretches the hold that is waiting", async () => {
    const started = Date.now();
    await sql`select 1`;
    expect(holds).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 400));
    configurePoolHold({
      register: () => {
        throw new Error("`after` was called outside a request scope");
      },
    });
    const [row] = await sql<{ ok: number }[]>`select 1 as ok`;
    expect(row.ok).toBe(1);
    expect(holds).toHaveLength(1);
    await holds[0];
    // يغطي الأمر الثاني (بعد ٤٠٠ مللي ثانية) لا الأول وحده
    expect(Date.now() - started).toBeGreaterThanOrEqual(1_400);
  });

  it("off Vercel nothing is registered and queries behave as before", async () => {
    configurePoolHold({ enabled: () => false });
    const [row] = await sql<{ ok: number }[]>`select 1 as ok`;
    await sql.begin(async (tx) => tx`select 1`);
    expect(row.ok).toBe(1);
    expect(holds).toHaveLength(0);
  });
});
