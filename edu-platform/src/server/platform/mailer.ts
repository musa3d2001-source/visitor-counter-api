import "server-only";
import { sql } from "../db";
import { env } from "../env";

/**
 * إرسال البريد:
 * - log: يسجّل الرسالة في جدول email_log (للتطوير والاختبار فقط)
 * - smtp: إرسال فعلي عبر خادم SMTP (يُخزن في السجل بدون نص الرسالة)
 */
export type MailMessage = { to: string; subject: string; text: string; html?: string; template: string };

export async function sendMail(msg: MailMessage): Promise<boolean> {
  const e = env();
  if (e.MAIL_DRIVER === "log") {
    await sql`
      insert into email_log (to_email, subject, template, body, status)
      values (${msg.to}, ${msg.subject}, ${msg.template}, ${msg.text}, 'logged')
    `;
    if (e.NODE_ENV === "development") console.info(`[mail:log] to=${msg.to} subject=${msg.subject}\n${msg.text}`);
    return true;
  }
  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT ?? 587,
      secure: e.SMTP_SECURE,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
    });
    await transport.sendMail({ from: e.MAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
    await sql`
      insert into email_log (to_email, subject, template, status)
      values (${msg.to}, ${msg.subject}, ${msg.template}, 'sent')
    `;
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[mail] send failed", message);
    await sql`
      insert into email_log (to_email, subject, template, status, error)
      values (${msg.to}, ${msg.subject}, ${msg.template}, 'failed', ${message.slice(0, 500)})
    `;
    return false;
  }
}
