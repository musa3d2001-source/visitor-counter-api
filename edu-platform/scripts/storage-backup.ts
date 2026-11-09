/**
 * نسخة احتياطية لملفات التخزين (الخاصة والعامة) في مجلد محلي، بمرجعية صفوف قاعدة البيانات.
 *
 * الاستخدام:
 *   npm run storage:backup                                    معاينة فقط: ما سيُنسخ وما هو مفقود
 *   npm run storage:backup -- --apply --out <مجلد خارج المشروع>     النسخ الفعلي، ويمكن تكراره فلا يُعاد تنزيل ما لم يتغير
 *
 * رمز الخروج غير صفر إن كانت النسخة ناقصة أو هناك ملف مفقود. ما لا يغطيه هذا السكربت مكتوب في README.
 */
import postgres from "postgres";
import { BackupRefusedError, formatBackupReport, runBackup, storeFromEnv } from "./_storage-backup";
import { loadEnvFile, scriptDbOptions } from "./_env";

export type BackupArgs = { apply: boolean; outDir: string | null };

export function parseBackupArgs(argv: string[]): BackupArgs {
  const opts: BackupArgs = { apply: false, outDir: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") opts.apply = true;
    else if (arg === "--out" && argv[i + 1] && !argv[i + 1].startsWith("--")) opts.outDir = argv[++i];
    else throw new BackupRefusedError(`Unknown or incomplete argument: ${arg}. Nothing was written.`);
  }
  return opts;
}

async function main() {
  loadEnvFile();
  const url = process.env.DATABASE_URL;
  if (!url) throw new BackupRefusedError("DATABASE_URL is not set. Nothing was written.");
  const opts = parseBackupArgs(process.argv.slice(2));
  const sql = postgres(url, scriptDbOptions());
  try {
    const report = await runBackup(sql, storeFromEnv(), opts);
    console.log(formatBackupReport(report));
    if (!report.complete) process.exitCode = 3;
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith("storage-backup.ts")) {
  main().catch((err) => {
    console.error(err instanceof BackupRefusedError ? err.message : "The backup stopped because of an unexpected error.", err instanceof BackupRefusedError ? "" : err instanceof Error ? err.name : "");
    process.exit(err instanceof BackupRefusedError ? 2 : 1);
  });
}
