import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { env, mailFromProblem, resetEnvCache } from "@/server/env";
import { redactSecrets, sendMail } from "@/server/platform/mailer";
import { lastMailSentAt, listMailFailures, mailHealth } from "@/server/platform/mail-status";
import { requestPasswordReset, resetPassword } from "@/server/auth/service";
import { startSmtpSink, type SmtpSink } from "../mocks/smtp-sink";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser } from "../helpers/factories";
import { TEST_ENV } from "../test-env";

/** نلتقط الرمز الخام وقت توليده، لأن هدف هذه الاختبارات ألا يوجد في أي مكان آخر */
const generated = vi.hoisted(() => ({ tokens: [] as string[] }));
vi.mock("@/server/auth/session", async (original) => {
  const actual = await original<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    generateToken: () => {
      const token = actual.generateToken();
      generated.tokens.push(token);
      return token;
    },
  };
});
vi.mock("next/navigation", async (original) => ({ ...(await original<typeof import("next/navigation")>()), usePathname: () => "/admin/mail" }));
vi.mock("@/server/auth/permissions", async (original) => ({ ...(await original<typeof import("@/server/auth/permissions")>()), requireOwnerPage: async () => ({ kind: "owner" }) }));

const { default: MailPage } = await import("@/app/admin/mail/page");

let sink: SmtpSink;

beforeAll(async () => {
  await resetDb();
  sink = await startSmtpSink();
});
afterAll(async () => {
  await sink.close();
  await closeDb();
});
beforeEach(() => {
  generated.tokens.length = 0;
  sink.clear();
});
afterEach(() => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.MAIL_FROM;
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
});

function realMail() {
  process.env.MAIL_DRIVER = "smtp";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(sink.port);
  process.env.MAIL_FROM = "منصة فرقد <no-reply@farqad.test>";
  resetEnvCache();
}

/** كل الأعمدة النصية في كل صفوف السجل كنص واحد، حتى لا يفلت مكان لم نفكر فيه */
async function wholeMailLog(): Promise<string> {
  const rows = await sql`select * from email_log`;
  return JSON.stringify(rows);
}

async function expectNoRawToken() {
  expect(generated.tokens.length, "يجب أن يكون المسار قد ولّد رمزًا فعلًا").toBeGreaterThan(0);
  const log = await wholeMailLog();
  for (const token of generated.tokens) expect(log).not.toContain(token);
}

describe("redaction at the point of logging", () => {
  const token = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCd0";

  it("removes the token from every link shape and keeps the rest readable", () => {
    expect(redactSecrets(`الرابط:\nhttp://x.test/reset-password?token=${token}\nشكرًا`)).toBe("الرابط:\nhttp://x.test/reset-password?token=[REDACTED]\nشكرًا");
    expect(redactSecrets(`http://x.test/a?b=1&token=short&c=2`)).toBe("http://x.test/a?b=1&token=[REDACTED]&c=2");
    expect(redactSecrets(`http://x.test/a?CODE=123456`)).toBe("http://x.test/a?CODE=[REDACTED]");
  });

  it("catches a long opaque value even with no parameter name", () => {
    expect(redactSecrets(`http://x.test/verify/${token}`)).toBe("http://x.test/verify/[REDACTED]");
  });

  it("does not touch order links, which tests and receipts need", () => {
    const link = "http://x.test/orders/550e8400-e29b-41d4-a716-446655440000";
    expect(redactSecrets(link)).toBe(link);
  });
});

describe("email_log never holds a raw reset token", () => {
  it("in log mode the row exists but its link is redacted", async () => {
    const u = await createUser();
    await requestPasswordReset(u.email, "203.0.113.10");
    const [row] = await sql<{ body: string; status: string }[]>`select body, status from email_log where to_email = ${u.email} and template = 'password_reset'`;
    expect(row.status).toBe("logged");
    expect(row.body).toContain("/reset-password?token=[REDACTED]");
    await expectNoRawToken();
  });

  it("in smtp mode the student gets the real, working link and the table gets no body at all", async () => {
    realMail();
    const u = await createUser();
    await requestPasswordReset(u.email, "203.0.113.11");
    const [row] = await sql<{ body: string | null; status: string }[]>`select body, status from email_log where to_email = ${u.email} and template = 'password_reset'`;
    expect(row).toMatchObject({ body: null, status: "sent" });
    await expectNoRawToken();
    const mail = sink.messages.find((m) => m.to.includes(u.email))!;
    expect(mail.from).toContain("no-reply@farqad.test");
    expect(mail.subject).toContain("استعادة كلمة المرور");
    const link = /https?:\/\/\S+reset-password\?token=(\S+)/.exec(mail.text)!;
    expect(decodeURIComponent(link[1]!)).toBe(generated.tokens.at(-1));
    await expect(resetPassword(decodeURIComponent(link[1]!), "Fresh-Student-Pass-1")).resolves.toEqual({ ok: true });
  });

  it("a failed send stores the reason, never the link, and is reported as not sent", async () => {
    realMail();
    const u = await createUser();
    sink.rejectNext();
    await requestPasswordReset(u.email, "203.0.113.12");
    const [row] = await sql<{ body: string | null; status: string; error: string }[]>`select body, status, error from email_log where to_email = ${u.email}`;
    expect(row).toMatchObject({ body: null, status: "failed" });
    expect(row.error.length).toBeGreaterThan(0);
    await expectNoRawToken();
  });

  it("an error message that quotes a link is redacted before it is stored", async () => {
    realMail();
    const token = "ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210_-AbCd0";
    process.env.SMTP_HOST = `no-such-host-${token.slice(0, 8).toLowerCase()}.invalid`;
    resetEnvCache();
    await expect(sendMail({ to: "x@farqad.test", subject: `s?token=${token}`, text: "t", template: "password_reset" })).resolves.toBe(false);
    const [row] = await sql<{ subject: string }[]>`select subject from email_log where to_email = 'x@farqad.test'`;
    expect(row.subject).toBe("s?token=[REDACTED]");
  });

  it("the migration scrubs links stored before this release, and only those", async () => {
    const old = "OldRawToken1234567890OldRawToken1234567890";
    await sql`
      insert into email_log (to_email, subject, template, body, status) values
        ('old@farqad.test', 's', 'password_reset', ${`افتح:\nhttp://x.test/reset-password?token=${old}\nشكرًا`}, 'logged'),
        ('keep@farqad.test', 's', 'order_confirmation', 'تفاصيل الطلب http://x.test/orders/1', 'logged')
    `;
    const migration = readFileSync(resolve(process.cwd(), "db/migrations/0011_accounts_hardening.sql"), "utf8");
    const start = migration.indexOf("update email_log");
    await sql.unsafe(migration.slice(start, migration.indexOf(";", start) + 1));
    const [scrubbed] = await sql<{ body: string }[]>`select body from email_log where to_email = 'old@farqad.test'`;
    expect(scrubbed.body).toBe("افتح:\nhttp://x.test/reset-password?token=[REDACTED]\nشكرًا");
    const [kept] = await sql<{ body: string }[]>`select body from email_log where to_email = 'keep@farqad.test'`;
    expect(kept.body).toBe("تفاصيل الطلب http://x.test/orders/1");
  });
});

describe("what the owner sees", () => {
  beforeEach(() => sql`truncate table email_log restart identity`);

  it("flags log mode only when running in production", async () => {
    expect((await mailHealth()).logOnlyInProduction).toBe(false);
    Object.assign(process.env, { NODE_ENV: "production" });
    resetEnvCache();
    expect((await mailHealth()).logOnlyInProduction).toBe(true);
    realMail();
    expect((await mailHealth()).logOnlyInProduction).toBe(false);
  });

  it("counts recent failures only and lists them with no body or token", async () => {
    realMail();
    sink.rejectNext();
    await sendMail({ to: "a@farqad.test", subject: "s", text: "http://x.test/?token=abcdefghijklmnop", template: "password_reset" });
    await sendMail({ to: "b@farqad.test", subject: "s", text: "x", template: "order_confirmation" });
    await sql`insert into email_log (to_email, subject, template, status, error, created_at) values ('old@farqad.test', 's', 'order_refund', 'failed', 'boom', now() - interval '8 days')`;
    expect((await mailHealth()).failedRecently).toBe(1);
    const failures = await listMailFailures();
    expect(failures.map((f) => f.to_email)).toEqual(["a@farqad.test", "old@farqad.test"]);
    expect(Object.keys(failures[0]!).sort()).toEqual(["created_at", "error", "id", "template", "to_email"]);
    expect(await lastMailSentAt()).not.toBeNull();
  });

  it("counts verification links that failed in the last day, and only those", async () => {
    realMail();
    sink.rejectNext(2);
    await sendMail({ to: "v1@farqad.test", subject: "s", text: "x", template: "email_verification" });
    await sendMail({ to: "other@farqad.test", subject: "s", text: "x", template: "order_confirmation" });
    await sendMail({ to: "v-ok@farqad.test", subject: "s", text: "x", template: "email_verification" });
    await sql`insert into email_log (to_email, subject, template, status, error, created_at) values ('yesterday@farqad.test', 's', 'email_verification', 'failed', 'boom', now() - interval '25 hours')`;
    const health = await mailHealth();
    expect(health.verificationFailedToday).toBe(1);
    expect(health.failedRecently).toBe(3);
  });

  it("the failures page shows who and why, without a message body", async () => {
    realMail();
    sink.rejectNext();
    await sendMail({ to: "shown@farqad.test", subject: "s", text: "SECRET-BODY-TEXT http://x.test/?token=abcdefghijklmnop", template: "email_verification" });
    const html = renderToStaticMarkup(await MailPage());
    expect(html).toContain("shown@farqad.test");
    expect(html).toContain("رابط تأكيد البريد");
    expect(html).not.toContain("SECRET-BODY-TEXT");
    expect(html).not.toContain("abcdefghijklmnop");
  });

  it("tells the owner plainly when nothing leaves the platform", async () => {
    expect(renderToStaticMarkup(await MailPage())).toContain("البريد غير مفعّل على هذا النشر");
    realMail();
    expect(renderToStaticMarkup(await MailPage())).not.toContain("البريد غير مفعّل على هذا النشر");
  });
});

describe("MAIL_FROM is validated when real mail is on", () => {
  it("accepts a bare address and a named address", () => {
    expect(mailFromProblem("no-reply@farqad.com")).toBeNull();
    expect(mailFromProblem("منصة فرقد <no-reply@farqad.com>")).toBeNull();
    expect(mailFromProblem('"Farqad Platform" <no-reply@farqad.com>')).toBeNull();
  });

  it("rejects garbage and the placeholders shipped in the defaults", () => {
    for (const bad of ["", "no-reply", "a@b", "x <not-an-address>", "a@b.com, c@d.com", "x <a@b.com> trailing", "المنصة التعليمية <no-reply@example.com>", "no-reply@your-domain.com"]) {
      expect(mailFromProblem(bad), bad).not.toBeNull();
    }
  });

  it("env() refuses to start with smtp and an unset sender or host, and says which", () => {
    process.env.MAIL_DRIVER = "smtp";
    delete process.env.MAIL_FROM;
    delete process.env.SMTP_HOST;
    resetEnvCache();
    expect(() => env()).toThrow(/MAIL_FROM/);
    expect(() => env()).toThrow(/SMTP_HOST/);
    process.env.SMTP_HOST = "mail.farqad.test";
    process.env.MAIL_FROM = "no-reply@farqad.test";
    resetEnvCache();
    expect(env().MAIL_DRIVER).toBe("smtp");
  });

  it("does not bother the log driver, so development keeps working with no mail settings", () => {
    delete process.env.MAIL_FROM;
    resetEnvCache();
    expect(env().MAIL_DRIVER).toBe("log");
  });
});
