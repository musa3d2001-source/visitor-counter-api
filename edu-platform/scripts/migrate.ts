/**
 * مشغّل الترحيلات: يطبّق ملفات db/migrations/*.sql بالترتيب مرة واحدة فقط
 * ويسجلها في جدول schema_migrations. الاستخدام: npm run db:migrate
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { loadEnvFile } from "./_env";

loadEnvFile();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL غير مضبوط");
  process.exit(1);
}

export async function migrate(databaseUrl: string, log = true) {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    await sql`alter table schema_migrations enable row level security`;
    const dir = join(process.cwd(), "db", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const applied = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
    for (const f of files) {
      if (applied.has(f)) continue;
      const content = readFileSync(join(dir, f), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`insert into schema_migrations (name) values (${f})`;
      });
      if (log) console.log(`✔ applied ${f}`);
    }
    if (log) console.log("الترحيلات مكتملة");
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith("migrate.ts")) {
  migrate(url).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
