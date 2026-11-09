import { existsSync, readFileSync } from "node:fs";

/**
 * خيارات اتصال السكربتات. رابط Transaction Pooler لا يقبل prepared statements، فمن نسخ رابط التطبيق
 * مع DATABASE_PGBOUNCER=true يعمل معه السكربت كما يعمل التطبيق، بدل خطأ غامض في لحظة استعادة الحساب.
 */
export function scriptDbOptions(env: Record<string, string | undefined> = process.env) {
  const pgbouncer = env.DATABASE_PGBOUNCER === "true";
  return { max: 1, onnotice: () => {}, prepare: !pgbouncer, ...(pgbouncer && { max_pipeline: 1 }) };
}

/** تحميل .env.local ثم .env للسكربتات (Next.js يحمّلها تلقائيًا للتطبيق) */
export function loadEnvFile() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, key, rawVal] = m;
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawVal.replace(/^["']|["']$/g, "");
    }
  }
}
