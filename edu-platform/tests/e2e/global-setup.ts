import postgres from "postgres";
import { rmSync } from "node:fs";
import { migrate } from "../../scripts/migrate";
import { seedDemo, seedStructure } from "../../scripts/seed";
import { seedDemoTeachers } from "../../scripts/demo-teachers";
import { closeDemoBrowser } from "../../scripts/demo-pdf";
import { hashPassword } from "../../src/server/auth/password-core";
import { sealTotpSecret } from "../../src/server/auth/two-factor-core";
import { E2E_ADMIN, E2E_ADMIN_TOTP_SECRET, E2E_DATABASE_URL, E2E_SERVER_ENV, E2E_STORAGE_DIR } from "./e2e-env";

/**
 * يجهّز قاعدة بيانات E2E من الصفر قبل تشغيل الاختبارات:
 * ترحيل → تفريغ → هيكل دراسي → منتجات تجريبية منشورة → حساب مدير
 */
export default async function globalSetup() {
  if (!/e2e|test/.test(new URL(E2E_DATABASE_URL).pathname)) throw new Error("E2E database name must contain e2e/test");
  const adminUrl = new URL(E2E_DATABASE_URL);
  const dbName = adminUrl.pathname.slice(1);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  const exists = await admin`select 1 from pg_database where datname = ${dbName}`;
  if (!exists.length) await admin.unsafe(`create database "${dbName}"`);
  await admin.end();

  await migrate(E2E_DATABASE_URL, false);
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const tables = await sql<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations'`;
    await sql.unsafe(`truncate table ${tables.map((t) => `"${t.tablename}"`).join(", ")} restart identity cascade`);
    rmSync(E2E_STORAGE_DIR, { recursive: true, force: true });
    await seedStructure(sql);
    await sql`insert into settings (key, value) values ('fee_rules_confirmed_at', ${sql.json("2026-01-01T00:00:00.000Z")})`;
    await seedDemo(sql, { publish: true, storageDir: E2E_STORAGE_DIR, academicYear: "2026-2027" });
    await seedDemoTeachers(sql, { publish: true, storageDir: E2E_STORAGE_DIR, academicYear: "2026-2027" });
    await closeDemoBrowser();
    const [owner] = await sql<{ id: string }[]>`
      insert into users (email, password_hash, full_name, role, email_verified_at)
      values (${E2E_ADMIN.email}, ${await hashPassword(E2E_ADMIN.password)}, 'مدير الاختبار', 'admin', now())
      returning id
    `;
    await sql`insert into user_totp (user_id, secret_ciphertext, enabled_at) values (${owner.id}, ${sealTotpSecret(E2E_ADMIN_TOTP_SECRET, E2E_SERVER_ENV.APP_SECRET, owner.id)}, now())`;
  } finally {
    await sql.end();
  }
}
