import "server-only";
import { sql } from "../db";
import { env } from "../env";

/**
 * ما يعرفه المالك عن البريد الصادر. لا يقرأ هذا الملف عمود body أبدًا:
 * قائمة الإخفاقات فيها المستلم والنوع والوقت وسبب الفشل فقط.
 */
const RECENT_DAYS = 7;

export type MailFailure = { id: string; to_email: string; template: string; error: string | null; created_at: Date };

export type MailHealth = {
  driver: "log" | "smtp";
  /** الإنتاج يعمل بمشغل log: لا تصل أي رسالة إلى أحد */
  logOnlyInProduction: boolean;
  failedRecently: number;
  recentDays: number;
};

export async function mailHealth(): Promise<MailHealth> {
  const e = env();
  const [row] = await sql<{ failed: number }[]>`
    select count(*)::int as failed from email_log
    where status = 'failed' and created_at > now() - make_interval(days => ${RECENT_DAYS})
  `;
  return { driver: e.MAIL_DRIVER, logOnlyInProduction: e.NODE_ENV === "production" && e.MAIL_DRIVER === "log", failedRecently: row.failed, recentDays: RECENT_DAYS };
}

export async function listMailFailures(limit = 100): Promise<MailFailure[]> {
  return sql<MailFailure[]>`
    select id::text, to_email, template, error, created_at from email_log
    where status = 'failed' order by created_at desc limit ${limit}
  `;
}

export async function lastMailSentAt(): Promise<Date | null> {
  const [row] = await sql<{ created_at: Date }[]>`select created_at from email_log where status = 'sent' order by created_at desc limit 1`;
  return row?.created_at ?? null;
}
