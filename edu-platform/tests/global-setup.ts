import { mkdirSync, rmSync } from "node:fs";
import postgres from "postgres";
import { TEST_DATABASE_URL, TEST_STORAGE_DIR } from "./test-env";

/**
 * يُنفذ مرة واحدة قبل كل الاختبارات:
 * يعيد إنشاء schema public في قاعدة edu_test ويطبق الترحيلات من db/migrations
 * (نفس المشغّل المستخدم في الإنتاج: scripts/migrate.ts).
 */
export default async function globalSetup() {
  rmSync(TEST_STORAGE_DIR, { recursive: true, force: true });
  mkdirSync(TEST_STORAGE_DIR, { recursive: true });

  const sql = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const [{ db }] = await sql<{ db: string }[]>`select current_database() as db`;
    if (!/test/.test(db)) throw new Error(`Refusing to reset non-test database: ${db}`);
    await sql.unsafe("drop schema if exists public cascade; create schema public;");
  } finally {
    await sql.end();
  }
  // migrate.ts يقرأ DATABASE_URL عند التحميل — نضبطه قبل الاستيراد
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  const { migrate } = await import("../scripts/migrate");
  await migrate(TEST_DATABASE_URL, false);
}
