import { closeDb, getDb, sql } from "@/server/db";
import { seedStructure } from "../../scripts/seed";

/** يفرغ كل الجداول ويعيد بذر الهيكل الدراسي (يُستدعى في beforeAll لكل ملف تكامل) */
export async function resetDb() {
  const tables = await sql<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations'
  `;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await sql.unsafe(`truncate table ${list} restart identity cascade`);
  await seedStructure(getDb());
  // المالك اعتمد الرسوم في بيئة الاختبار، واختبار fee-rules يحذف هذا الصف ليختبر ما قبل الاعتماد
  await sql`insert into settings (key, value) values ('fee_rules_confirmed_at', ${sql.json("2026-01-01T00:00:00.000Z")})`;
}

export { closeDb, sql };
