import { existsSync, readFileSync } from "node:fs";

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
