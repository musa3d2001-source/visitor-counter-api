/**
 * استعادة حساب إدارة فقد جهاز المصادقة ورموز الاسترداد، أو بعد تغيير APP_SECRET:
 *   npm run admin:reset-2fa -- --email owner@example.com              معاينة فقط (الافتراضي، قراءة دون أي تعديل)
 *   npm run admin:reset-2fa -- --email owner@example.com --apply      تنفيذ
 *
 * التنفيذ يحذف سر TOTP ورموز الاسترداد وخطوات الدخول المعلقة وعدّاد الرموز الخاطئة، وينهي كل جلسات الحساب، ويسجل العملية في سجل التدقيق.
 * عند الدخول التالي بكلمة المرور يُسجَّل التحقق بخطوتين من جديد (إن كان إلزاميًا).
 * يتطلب الوصول لقاعدة البيانات، ولا يطبع أي سر. يُشغَّل من جهازك برابط الاتصال المباشر، والخطوات في README.
 * المعاينة تطبع host: اسم قاعدة البيانات هو postgres في كل مشاريع Supabase، فهو وحده لا يدل على الوجهة.
 */
import postgres from "postgres";
import { loadEnvFile, scriptDbOptions } from "./_env";
import { twoFactorFailureKey } from "../src/server/auth/two-factor-core";

export type ResetOptions = { email: string; apply: boolean; reason: string | null };

export type ResetReport = {
  database: string;
  host: string;
  applied: boolean;
  email: string;
  twoFactorEnabled: boolean;
  recoveryCodes: number;
  sessions: number;
  pendingChallenges: number;
};

export class ResetRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResetRefusedError";
  }
}

const USAGE = "Usage: npm run admin:reset-2fa -- --email <admin email> [--reason <text>] [--apply]. Nothing was changed.";

export function parseResetArgs(argv: string[]): ResetOptions {
  let email: string | null = null;
  let reason: string | null = null;
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") apply = true;
    else if (arg === "--email" && argv[i + 1] && !argv[i + 1].startsWith("--")) email = argv[++i].trim().toLowerCase();
    else if (arg === "--reason" && argv[i + 1] && !argv[i + 1].startsWith("--")) reason = argv[++i].trim().slice(0, 500);
    else throw new ResetRefusedError(`Unknown or incomplete argument: ${arg}. ${USAGE}`);
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ResetRefusedError(`An explicit --email is required. ${USAGE}`);
  return { email, apply, reason };
}

type Db = postgres.Sql | postgres.TransactionSql;

async function inspect(db: Db, userId: string) {
  const [row] = await db<{ enabled: boolean; recovery: number; sessions: number; challenges: number }[]>`
    select
      exists (select 1 from user_totp t where t.user_id = ${userId} and t.enabled_at is not null) as enabled,
      (select count(*)::int from user_recovery_codes r where r.user_id = ${userId} and r.used_at is null) as recovery,
      (select count(*)::int from sessions s where s.user_id = ${userId}) as sessions,
      (select count(*)::int from login_challenges c where c.user_id = ${userId}) as challenges
  `;
  return row;
}

/** القفل عند التنفيذ فقط: معاملة القراءة وحدها ترفض select for update */
async function findAdmin(db: Db, email: string, lock: boolean): Promise<string> {
  const [user] = await db<{ id: string; role: string }[]>`select id, role from users where email = ${email} ${lock ? db`for no key update` : db``}`;
  if (!user || user.role !== "admin") throw new ResetRefusedError("No admin account with that email. Nothing was changed.");
  return user.id;
}

/** المعاينة في معاملة للقراءة فقط، والتنفيذ كله في معاملة واحدة */
export async function resetAdminTwoFactor(sql: postgres.Sql, opts: ResetOptions): Promise<ResetReport> {
  const [{ database }] = await sql<{ database: string }[]>`select current_database() as database`;
  return (await sql.begin(opts.apply ? "read write" : "read only", async (tx) => {
    const userId = await findAdmin(tx, opts.email, opts.apply);
    const before = await inspect(tx, userId);
    const out: ResetReport = {
      database,
      host: sql.options.host.join(","),
      applied: opts.apply,
      email: opts.email,
      twoFactorEnabled: before.enabled,
      recoveryCodes: before.recovery,
      sessions: before.sessions,
      pendingChallenges: before.challenges,
    };
    if (!opts.apply) return out;
    await tx`delete from user_totp where user_id = ${userId}`;
    await tx`delete from user_recovery_codes where user_id = ${userId}`;
    await tx`delete from login_challenges where user_id = ${userId}`;
    await tx`delete from sessions where user_id = ${userId}`;
    // الأخطاء السابقة لا تؤخر أول رمز صحيح من الجوال الجديد
    await tx`delete from rate_limits where key = ${twoFactorFailureKey(userId)}`;
    await tx`
      insert into audit_logs (actor_id, action, entity_type, entity_id, reason, metadata)
      values (null, 'two_factor.reset_via_cli', 'user', ${userId}, ${opts.reason ?? "reset-admin-2fa script"}, ${tx.json({ twoFactorEnabled: before.enabled, recoveryCodes: before.recovery, sessions: before.sessions })})
    `;
    return out;
  })) as ResetReport;
}

async function main() {
  loadEnvFile();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL غير مضبوط");
    process.exit(1);
  }
  const opts = parseResetArgs(process.argv.slice(2));
  const sql = postgres(url, scriptDbOptions());
  try {
    const out = await resetAdminTwoFactor(sql, opts);
    console.log(out.applied ? "Applied:" : "Dry run, nothing was changed. Add --apply to act:");
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith("reset-admin-2fa.ts")) {
  main().catch((err) => {
    console.error(err instanceof ResetRefusedError ? err.message : err);
    process.exit(err instanceof ResetRefusedError ? 2 : 1);
  });
}
