import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL } from "../test-env";

/**
 * 0014_hardening.sql: لا أحد غير مالك الدوال ينفذها — لا PUBLIC، ولا anon و authenticated على Supabase،
 * لا للدوال الموجودة ولا لما يُنشأ بعدها.
 * الفحوص التي تغير الأدوار أو الصلاحيات الافتراضية تجري داخل معاملة تُلغى في آخرها، فلا يبقى منها شيء.
 */
const db = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
const MIGRATION = readFileSync(resolve(__dirname, "../../db/migrations/0014_hardening.sql"), "utf8");

afterAll(async () => {
  await db.end({ timeout: 5 });
});

class Rollback extends Error {}

/** يشغل fn داخل معاملة ثم يلغيها دائمًا */
async function inRolledBackTx(fn: (tx: postgres.TransactionSql) => Promise<void>) {
  await db
    .begin(async (tx) => {
      await fn(tx);
      throw new Rollback();
    })
    .catch((err) => {
      if (!(err instanceof Rollback)) throw err;
    });
}

type Sql = postgres.Sql | postgres.TransactionSql;

/** دوال schema public التي يستطيع الدور تنفيذها، عدا ما يملكه الدور نفسه */
async function executableBy(tx: Sql, role: string): Promise<string[]> {
  const rows = await tx<{ name: string }[]>`
    select p.proname as name
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege(${role}, p.oid, 'EXECUTE')
    order by 1`;
  return rows.map((r) => r.name);
}

async function publicGrants(tx: Sql): Promise<string[]> {
  // proacl فارغ يعني «الافتراضي»، والافتراضي يمنح PUBLIC
  const rows = await tx<{ name: string }[]>`
    select p.proname as name
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))
    order by 1`;
  return rows.map((r) => r.name);
}

const PROBE = "create function public.zz_probe_after_0014() returns int language sql as 'select 1'";

describe("0014: EXECUTE on database functions", () => {
  it("is applied, and no existing function in public is executable by PUBLIC", async () => {
    const [applied] = await db`select 1 as ok from schema_migrations where name = '0014_hardening.sql'`;
    expect(applied?.ok).toBe(1);
    const names = (await db<{ name: string }[]>`select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f'`).map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(["set_updated_at", "check_bundle_item", "redaction_pick", "redact_gateway_status", "redact_webhook_payload", "consent_records_append_only"]));
    expect(await publicGrants(db)).toEqual([]);
  });

  it("keeps PUBLIC off functions created later, starting from PostgreSQL's default", async () => {
    await inRolledBackTx(async (tx) => {
      // الحالة قبل 0014: المنح العام الافتراضي، ودوال قائمة ممنوحة للجميع
      await tx.unsafe("alter default privileges grant execute on functions to public");
      await tx.unsafe("grant execute on all functions in schema public to public");
      expect((await publicGrants(tx)).length).toBeGreaterThan(0);
      await tx.unsafe(MIGRATION);
      expect(await publicGrants(tx)).toEqual([]);
      await tx.unsafe(PROBE);
      expect(await publicGrants(tx)).toEqual([]);
    });
  });

  it("removes anon and authenticated (Supabase's REST roles) from existing and future functions", async () => {
    await inRolledBackTx(async (tx) => {
      for (const role of ["anon", "authenticated"]) {
        const [exists] = await tx`select 1 as ok from pg_roles where rolname = ${role}`;
        if (!exists) await tx.unsafe(`create role ${role} nologin`);
        await tx.unsafe(`grant usage on schema public to ${role}`);
        // كما يفعل Supabase: منح صريح وافتراضي في schema public
        await tx.unsafe(`grant execute on all functions in schema public to ${role}`);
        await tx.unsafe(`alter default privileges in schema public grant execute on functions to ${role}`);
      }
      await tx.unsafe("create function public.zz_probe_before_0014() returns int language sql as 'select 1'");
      expect(await executableBy(tx, "anon")).toContain("redaction_pick");
      await tx.unsafe(MIGRATION);
      await tx.unsafe(PROBE);
      expect(await executableBy(tx, "anon")).toEqual([]);
      expect(await executableBy(tx, "authenticated")).toEqual([]);
    });
  });
});
