import "server-only";
import { sql } from "../db";
import { env } from "../env";
import { isAnonymizedEmail } from "@/lib/anonymize";

/**
 * إرسال البريد:
 * - log: يسجّل الرسالة في جدول email_log ولا تخرج إلى أحد (للتطوير والاختبار فقط)
 * - smtp: إرسال فعلي عبر خادم SMTP (يُخزن في السجل بدون نص الرسالة)
 *
 * قاعدة: كل ما يصل إلى email_log أو إلى سجل الخادم يمر على redactSecrets،
 * فرمز رابط الاستعادة أو التأكيد لا يوجد خامًا إلا في الرسالة نفسها.
 */
export type MailMessage = { to: string; subject: string; text: string; html?: string; template: string };

const REDACTED = "[REDACTED]";
const SECRET_PARAM = /([?&#;](?:token|code|key|secret|password|pass|otp)=)[^\s&#"'<>]+/gi;
/** أي سلسلة طويلة بلا فواصل تشبه رمزًا (رموزنا ٤٣ حرفًا، ومعرّف UUID ٣٦ فلا يتأثر) */
const OPAQUE_RUN = /[A-Za-z0-9_-]{40,}/g;

export function redactSecrets(text: string): string {
  return text.replace(SECRET_PARAM, `$1${REDACTED}`).replace(OPAQUE_RUN, REDACTED);
}

/** هل تخرج الرسائل فعلًا إلى صناديق البريد؟ */
export function mailIsReal(): boolean {
  return env().MAIL_DRIVER === "smtp";
}

export async function sendMail(msg: MailMessage): Promise<boolean> {
  // حساب حُذفت بياناته: لا نرسل إلى عنوان وهمي، ولا نعيد كتابة صف في سجل البريد
  if (isAnonymizedEmail(msg.to)) return false;
  const e = env();
  const subject = redactSecrets(msg.subject);
  if (e.MAIL_DRIVER === "log") {
    const body = redactSecrets(msg.text);
    await sql`
      insert into email_log (to_email, subject, template, body, status)
      values (${msg.to}, ${subject}, ${msg.template}, ${body}, 'logged')
    `;
    if (e.NODE_ENV === "development") console.info(`[mail:log] to=${msg.to} subject=${subject}\n${body}`);
    return true;
  }
  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT ?? 587,
      secure: e.SMTP_SECURE,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
      // بدونها ينتظر nodemailer دقائق: خادم بريد معطل لا يعلّق طلب المستخدم
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    await transport.sendMail({ from: e.MAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
    await sql`
      insert into email_log (to_email, subject, template, status)
      values (${msg.to}, ${subject}, ${msg.template}, 'sent')
    `;
    return true;
  } catch (err) {
    const message = redactSecrets(err instanceof Error ? err.message : String(err));
    console.error("[mail] send failed", msg.template, message);
    await sql`
      insert into email_log (to_email, subject, template, status, error)
      values (${msg.to}, ${subject}, ${msg.template}, 'failed', ${message.slice(0, 500)})
    `;
    return false;
  }
}
