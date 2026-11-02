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
}

export { closeDb, sql };
