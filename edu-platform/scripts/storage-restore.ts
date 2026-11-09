/**
 * استعادة نسخة storage:backup إلى التخزين المضبوط في البيئة. يضيف الناقص فقط ولا يكتب فوق أي ملف.
 *
 * الاستخدام:
 *   npm run storage:restore -- --from <مجلد النسخة>                     معاينة فقط، وتفحص بصمة كل ملف
 *   npm run storage:restore -- --from <مجلد النسخة> --apply             الاستعادة إلى التخزين المحلي
 *   npm run storage:restore -- --from <مجلد النسخة> --apply --confirm-target <النطاق>   الاستعادة إلى Supabase
 *
 * رمز الخروج غير صفر إن بقي شيء لم يُستعد.
 */
import { BackupRefusedError, formatRestoreReport, runRestore, storeFromEnv } from "./_storage-backup";
import { loadEnvFile } from "./_env";

export type RestoreArgs = { apply: boolean; fromDir: string | null; confirmTarget: string | null };

export function parseRestoreArgs(argv: string[]): RestoreArgs {
  const opts: RestoreArgs = { apply: false, fromDir: null, confirmTarget: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") opts.apply = true;
    else if (arg === "--from" && argv[i + 1] && !argv[i + 1].startsWith("--")) opts.fromDir = argv[++i];
    else if (arg === "--confirm-target" && argv[i + 1] && !argv[i + 1].startsWith("--")) opts.confirmTarget = argv[++i];
    else throw new BackupRefusedError(`Unknown or incomplete argument: ${arg}. Nothing was changed.`);
  }
  return opts;
}

async function main() {
  loadEnvFile();
  const opts = parseRestoreArgs(process.argv.slice(2));
  if (!opts.fromDir) throw new BackupRefusedError("--from <backup folder> is required. Nothing was changed.");
  const report = await runRestore(storeFromEnv(), { apply: opts.apply, fromDir: opts.fromDir, confirmTarget: opts.confirmTarget });
  console.log(formatRestoreReport(report));
  if (!report.complete) process.exitCode = 3;
}

if (process.argv[1] && process.argv[1].endsWith("storage-restore.ts")) {
  main().catch((err) => {
    console.error(err instanceof BackupRefusedError ? err.message : "The restore stopped because of an unexpected error.", err instanceof BackupRefusedError ? "" : err instanceof Error ? err.name : "");
    process.exit(err instanceof BackupRefusedError ? 2 : 1);
  });
}
