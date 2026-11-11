import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { migrate, MigrationStopped } from "../../scripts/migrate";
import { TEST_DATABASE_URL } from "../test-env";

/**
 * الترحيل يُشغَّل على قاعدة حية والموقع يخدم (F26): لا ينتظر قفلًا طويلًا يوقف الطلبات خلفه، ولا يترك ملفًا نصف مطبق،
 * ويقول للمطور ماذا يفعل. على PostgreSQL محلي حقيقي، في schema مستقلة لا تمس جداول الاختبارات الأخرى.
 */
const SCHEMA = "migrate_runner_probe";
const admin = postgres(TEST_DATABASE_URL, { max: 2, onnotice: () => {} });
const target = `${TEST_DATABASE_URL}${TEST_DATABASE_URL.includes("?") ? "&" : "?"}search_path=${SCHEMA}`;
const dir = mkdtempSync(join(tmpdir(), "migrate-runner-"));
const file = (name: string, sql: string) => writeFileSync(join(dir, name), sql);
const recorded = async () => (await admin<{ name: string }[]>`select name from ${admin(SCHEMA)}.schema_migrations order by name`).map((r) => r.name);
const exists = async (table: string) => (await admin<{ n: number }[]>`select count(*)::int as n from information_schema.tables where table_schema = ${SCHEMA} and table_name = ${table}`)[0].n === 1;

beforeAll(async () => {
  await admin.unsafe(`drop schema if exists ${SCHEMA} cascade; create schema ${SCHEMA}`);
  file("0001_probe.sql", "create table probe_items (id int primary key); insert into probe_items values (1);");
  await migrate(target, false, { dir });
});

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  await admin.unsafe(`drop schema if exists ${SCHEMA} cascade`);
  await admin.end();
  rmSync(dir, { recursive: true, force: true });
});

describe("the migration runner on a live database", () => {
  it("gives up on a table the site is using after a short wait, retries, and leaves the file wholly unapplied", async () => {
    file("0002_probe_alter.sql", "create table probe_marker (id int); alter table probe_items add column note text not null default 'x';");
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    // طلب من الموقع ما زال في معاملة على الجدول: ALTER يحتاج قفلًا حصريًا لا يأخذه
    const site = await admin.reserve();
    try {
      await site`begin`;
      await site`select * from ${site(SCHEMA)}.probe_items`;
      const started = Date.now();
      const err = await migrate(target, true, { dir, lockTimeoutMs: 300, attempts: 2, pauseMs: 100 }).then(
        () => null,
        (e: unknown) => e,
      );
      const ms = Date.now() - started;
      expect(err).toBeInstanceOf(MigrationStopped);
      expect((err as MigrationStopped).file).toBe("0002_probe_alter.sql");
      expect((err as Error).message).toContain("لم يتغير شيء من هذا الملف");
      expect((err as Error).message).toContain("npm run db:migrate");
      expect(((err as Error).cause as { code?: string }).code).toBe("55P03");
      // محاولتان بانتظار قفل ٣٠٠ مللي ثانية وبينهما ١٠٠، لا انتظار مفتوح
      expect(ms).toBeLessThan(3_000);
      expect(out.mock.calls.flat().join(" ")).toContain("محاولة 2 من 2");
      // الملف كله تراجع: لا الجدول الجديد الذي سبق ALTER فيه، ولا سطر في السجل
      expect(await exists("probe_marker")).toBe(false);
      expect(await recorded()).toEqual(["0001_probe.sql"]);
    } finally {
      await site`rollback`;
      site.release();
    }
    // بعد أن تحرر الجدول، الإعادة تكمل من حيث توقفت
    await migrate(target, false, { dir, lockTimeoutMs: 300, attempts: 2, pauseMs: 100 });
    expect(await exists("probe_marker")).toBe(true);
    expect(await recorded()).toEqual(["0001_probe.sql", "0002_probe_alter.sql"]);
  });

  it("stops a statement that runs past its limit and applies nothing of that file", async () => {
    file("0003_probe_slow.sql", "create table probe_slow (id int); select pg_sleep(3);");
    const err = await migrate(target, false, { dir, statementTimeoutMs: 300 }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(MigrationStopped);
    expect((err as Error).message).toContain("0003_probe_slow.sql");
    expect((err as Error).message).toContain("أُلغي");
    expect(await exists("probe_slow")).toBe(false);
    expect(await recorded()).not.toContain("0003_probe_slow.sql");
    rmSync(join(dir, "0003_probe_slow.sql"));
  });

  it("keeps its limits inside each file's transaction, so they never outlive it", async () => {
    file("0004_probe_settings.sql", "create table probe_settings as select current_setting('lock_timeout') as lock_timeout, current_setting('statement_timeout') as statement_timeout;");
    await migrate(target, false, { dir });
    const [row] = await admin<{ lock_timeout: string; statement_timeout: string }[]>`select * from ${admin(SCHEMA)}.probe_settings`;
    expect(row).toEqual({ lock_timeout: "3s", statement_timeout: "2min" });
  });
});
