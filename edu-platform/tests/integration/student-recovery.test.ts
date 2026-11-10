import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resetEnvCache } from "@/server/env";
import { AdminError } from "@/server/admin/common";
import { correctStudentEmail, generateTemporaryPassword, markStudentEmailVerified, resetStudentPassword } from "@/server/admin/student-accounts";
import { confirmEmailToken, emailVerificationRequired, requestEmailCorrection } from "@/server/auth/email-verification";
import { completeForcedPasswordChange, loginWithPassword, resetPassword } from "@/server/auth/service";
import { createSession, hashToken, SESSION_COOKIE, validateSessionToken } from "@/server/auth/session";
import { verifyPassword } from "@/server/auth/password";
import { startSmtpSink, type SmtpSink } from "../mocks/smtp-sink";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser, TEST_PASSWORD } from "../helpers/factories";
import { provenOwner } from "../helpers/step-up";
import { TEST_ENV } from "../test-env";

/** جلسة حقيقية عبر كوكي: هذه الاختبارات تفحص البوابة نفسها، فلا نستبدل getCurrentUser */
const ctx = vi.hoisted(() => ({ cookie: null as string | null, redirected: [] as string[], setCookies: [] as unknown[] }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "session" && ctx.cookie ? { value: ctx.cookie } : undefined),
    set: (...args: unknown[]) => ctx.setCookies.push(args),
  }),
  headers: async () => new Headers({ "x-pathname": "/library" }),
}));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  redirect: (url: string) => {
    ctx.redirected.push(url);
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh() {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { getCurrentUser, getCurrentSession } = await import("@/server/auth/session");
const { requireUser } = await import("@/server/auth/guards");
const { getActor, requireOwnerPage } = await import("@/server/auth/permissions");
const { changePasswordAction } = await import("@/app/(site)/account/actions");
const { changeTemporaryPasswordAction, loginAction } = await import("@/app/(site)/(auth)/actions");
const { correctStudentEmailAction, markStudentEmailVerifiedAction, resetStudentPasswordAction } = await import("@/app/admin/students/actions");
const { default: ChangePasswordPage } = await import("@/app/(site)/(auth)/change-password/page");

let sink: SmtpSink;
const meta = { ip: "192.0.2.50", userAgent: "vitest" };
const NEW_PASSWORD = "My-Own-Fresh-Pass-9";

beforeAll(async () => {
  await resetDb();
  sink = await startSmtpSink();
});
afterAll(async () => {
  await sink.close();
  await closeDb();
});
beforeEach(() => {
  sink.clear();
  ctx.cookie = null;
  ctx.redirected = [];
  ctx.setCookies = [];
  return sql`delete from rate_limits`;
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
  process.env.MAIL_FROM = "no-reply@farqad.test";
  resetEnvCache();
}

function form(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

const tokenOf = (link: string) => decodeURIComponent(link.split("token=")[1]!);

async function issued() {
  const [admin, student] = await Promise.all([createUser({ role: "admin" }), createUser()]);
  const secrets = await resetStudentPassword({ studentId: student.id, adminId: admin.id, reason: "طلب ولي الأمر", ip: "192.0.2.1" });
  return { admin, student, ...secrets };
}

describe("owner reset of a student's password", () => {
  it("issues a working one-time link and temporary password in the expected shape", async () => {
    const { link, temporaryPassword } = await issued();
    expect(link).toMatch(/^http:\/\/localhost:3000\/reset-password\?token=[A-Za-z0-9_-]{43}$/);
    expect(temporaryPassword).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    const many = new Set(Array.from({ length: 200 }, generateTemporaryPassword));
    expect(many.size).toBe(200);
  });

  it("the old password and every open session stop working at once", async () => {
    const [admin, student] = await Promise.all([createUser({ role: "admin" }), createUser()]);
    const a = await createSession(student.id);
    const b = await createSession(student.id);
    await resetStudentPassword({ studentId: student.id, adminId: admin.id, reason: "فقد الجهاز" });
    expect(await validateSessionToken(a.token)).toBeNull();
    expect(await validateSessionToken(b.token)).toBeNull();
    expect((await loginWithPassword(student.email, TEST_PASSWORD, meta)).ok).toBe(false);
  });

  it("stores no secret anywhere: only hashes, and the audit row has the reason but neither secret", async () => {
    const { student, link, temporaryPassword, admin } = await issued();
    const token = tokenOf(link);
    const [user] = await sql<{ password_hash: string }[]>`select password_hash from users where id = ${student.id}`;
    expect(user.password_hash).not.toContain(temporaryPassword);
    expect(await verifyPassword(temporaryPassword, user.password_hash)).toBe(true);
    const tokens = await sql<{ id: string }[]>`select id from password_reset_tokens where user_id = ${student.id} and used_at is null`;
    expect(tokens.map((t) => t.id)).toEqual([hashToken(token)]);
    const logs = await sql`select * from audit_logs where entity_id = ${student.id}`;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actor_id: admin.id, action: "student.password_reset", reason: "طلب ولي الأمر", ip: "192.0.2.1" });
    const everything = JSON.stringify([logs, await sql`select * from email_log`, await sql`select * from rate_limits`]);
    expect(everything).not.toContain(temporaryPassword);
    expect(everything).not.toContain(token);
  });

  it("cancels links issued earlier", async () => {
    const { student, admin, link: first } = await issued();
    const second = await resetStudentPassword({ studentId: student.id, adminId: admin.id, reason: "رابط جديد" });
    expect((await resetPassword(tokenOf(first), NEW_PASSWORD)).ok).toBe(false);
    expect((await resetPassword(tokenOf(second.link), NEW_PASSWORD)).ok).toBe(true);
  });

  it("refuses teachers and admins, leaving them untouched", async () => {
    const admin = await createUser({ role: "admin" });
    for (const target of [await createUser({ role: "teacher" }), await createUser({ role: "admin" })]) {
      await expect(resetStudentPassword({ studentId: target.id, adminId: admin.id, reason: "اختبار" })).rejects.toThrow(AdminError);
      expect((await loginWithPassword(target.email, TEST_PASSWORD, meta)).ok).toBe(true);
      expect(await sql`select 1 from audit_logs where entity_id = ${target.id}`).toHaveLength(0);
    }
  });

  it("is limited per student", async () => {
    const { student, admin } = await issued();
    for (let i = 0; i < 4; i++) await resetStudentPassword({ studentId: student.id, adminId: admin.id, reason: "مرة أخرى" });
    await expect(resetStudentPassword({ studentId: student.id, adminId: admin.id, reason: "زيادة" })).rejects.toThrow(/محاولات كثيرة/);
  });

  it("a missing student is a clean error", async () => {
    const admin = await createUser({ role: "admin" });
    await expect(resetStudentPassword({ studentId: "550e8400-e29b-41d4-a716-446655440000", adminId: admin.id, reason: "اختبار" })).rejects.toThrow("المستخدم غير موجود");
  });

  it("clears the student's login delay, so the temporary password works straight away", async () => {
    const [admin, student] = await Promise.all([createUser({ role: "admin" }), createUser()]);
    for (let i = 0; i < 7; i++) await loginWithPassword(student.email, "wrong-password", meta);
    const { temporaryPassword } = await resetStudentPassword({ studentId: student.id, adminId: admin.id, reason: "نسي كلمته" });
    expect((await loginWithPassword(student.email, temporaryPassword, meta)).ok).toBe(true);
  });

  it("with real mail: tells the student it happened, without any credential", async () => {
    realMail();
    const { student, link, temporaryPassword } = await issued();
    const [mail] = sink.messages.filter((m) => m.to.includes(student.email));
    expect(mail!.subject).toContain("إعادة تعيين");
    expect(mail!.text).not.toContain(temporaryPassword);
    expect(mail!.text).not.toContain(tokenOf(link));
    expect(mail!.text).not.toContain("reset-password");
  });

  it("with log mail: no notice is written", async () => {
    const { student } = await issued();
    expect(await sql`select 1 from email_log where to_email = ${student.email}`).toHaveLength(0);
  });

  it("a failed notice does not lose the credentials", async () => {
    realMail();
    sink.rejectNext();
    const { link, temporaryPassword } = await issued();
    expect(link).toContain("token=");
    expect(temporaryPassword).toBeTruthy();
  });
});

describe("temporary password login", () => {
  it("opens one short session flagged for a forced change", async () => {
    const { student, temporaryPassword } = await issued();
    const r = await loginWithPassword(student.email, temporaryPassword, meta);
    expect(r).toMatchObject({ ok: true, mustChangePassword: true });
    if (!r.ok) throw new Error("login");
    expect(r.expiresAt.getTime()).toBeLessThan(Date.now() + 61 * 60_000);
    expect((await validateSessionToken(r.token))?.mustChangePassword).toBe(true);
  });

  it("works one time only", async () => {
    const { student, temporaryPassword } = await issued();
    expect((await loginWithPassword(student.email, temporaryPassword, meta)).ok).toBe(true);
    const again = await loginWithPassword(student.email, temporaryPassword, meta);
    expect(again).toMatchObject({ ok: false, error: expect.stringContaining("سبق استخدامها") });
  });

  it("two logins at the same moment still produce one session", async () => {
    const { student, temporaryPassword } = await issued();
    const results = await Promise.all([loginWithPassword(student.email, temporaryPassword, meta), loginWithPassword(student.email, temporaryPassword, meta), loginWithPassword(student.email, temporaryPassword, meta)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("expires after its time", async () => {
    const { student, temporaryPassword } = await issued();
    await sql`update users set temp_password_expires_at = now() - interval '1 second' where id = ${student.id}`;
    expect(await loginWithPassword(student.email, temporaryPassword, meta)).toMatchObject({ ok: false, error: expect.stringContaining("انتهت صلاحية") });
  });

  it("a short session is never renewed", async () => {
    const { student, temporaryPassword } = await issued();
    const r = await loginWithPassword(student.email, temporaryPassword, meta);
    if (!r.ok) throw new Error("login");
    const [before] = await sql<{ expires_at: Date }[]>`select expires_at from sessions where user_id = ${student.id}`;
    await validateSessionToken(r.token);
    const [after] = await sql<{ expires_at: Date }[]>`select expires_at from sessions where user_id = ${student.id}`;
    expect(after.expires_at).toEqual(before.expires_at);
  });
});

describe("the forced-change gate", () => {
  async function tempSession() {
    const out = await issued();
    const r = await loginWithPassword(out.student.email, out.temporaryPassword, meta);
    if (!r.ok) throw new Error("login");
    ctx.cookie = r.token;
    return { ...out, token: r.token };
  }

  it("the rest of the platform treats the session as logged out", async () => {
    await tempSession();
    expect(await getCurrentUser()).toBeNull();
    expect(await getActor()).toBeNull();
    expect((await getCurrentSession())?.mustChangePassword).toBe(true);
  });

  it("pages send the student to the change form, not to login", async () => {
    await tempSession();
    await expect(requireUser("/library")).rejects.toThrow("NEXT_REDIRECT /change-password");
  });

  it("an admin panel page is closed too", async () => {
    await tempSession();
    await expect(requireOwnerPage()).rejects.toThrow("NEXT_REDIRECT /change-password");
  });

  it("the ordinary change-password action refuses this session", async () => {
    const { temporaryPassword } = await tempSession();
    const r = await changePasswordAction(null, form({ currentPassword: temporaryPassword, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }));
    expect(r).toEqual({ error: "انتهت الجلسة، سجّل الدخول مرة أخرى" });
  });

  it("the change page opens only for such a session", async () => {
    await tempSession();
    expect(renderToStaticMarkup(await ChangePasswordPage())).toContain("change-password-form");
    ctx.cookie = null;
    await expect(ChangePasswordPage()).rejects.toThrow("NEXT_REDIRECT /login");
    const normal = await createUser();
    ctx.cookie = (await createSession(normal.id)).token;
    await expect(ChangePasswordPage()).rejects.toThrow("NEXT_REDIRECT /account");
  });

  it("login sends the student to the change form, whatever the next address", async () => {
    const { student, temporaryPassword } = await issued();
    await expect(loginAction(null, form({ email: student.email, password: temporaryPassword, next: "/admin" }))).rejects.toThrow("NEXT_REDIRECT /change-password");
  });

  it("finishing replaces the password, ends every session and opens a full one", async () => {
    const { student, token, temporaryPassword, link } = await tempSession();
    const r = await completeForcedPasswordChange(student.id, NEW_PASSWORD, meta);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("change");
    expect(await validateSessionToken(token)).toBeNull();
    const fresh = await validateSessionToken(r.token);
    expect(fresh?.mustChangePassword).toBe(false);
    expect(r.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);
    expect((await loginWithPassword(student.email, NEW_PASSWORD, meta)).ok).toBe(true);
    expect((await loginWithPassword(student.email, temporaryPassword, meta)).ok).toBe(false);
    expect((await resetPassword(tokenOf(link), "Other-Password-7")).ok).toBe(false);
    expect(await sql`select 1 from audit_logs where entity_id = ${student.id} and action = 'user.temporary_password_replaced'`).toHaveLength(1);
  });

  it("the action sets the new cookie and goes to the library", async () => {
    await tempSession();
    await expect(changeTemporaryPasswordAction(null, form({ password: NEW_PASSWORD, passwordConfirm: NEW_PASSWORD }))).rejects.toThrow("NEXT_REDIRECT /library");
    expect(ctx.setCookies).toHaveLength(1);
    expect((ctx.setCookies[0] as unknown[])[0]).toBe(SESSION_COOKIE);
  });

  it("refuses reusing the temporary password, a short one, or a mismatch", async () => {
    const { temporaryPassword } = await tempSession();
    expect(await changeTemporaryPasswordAction(null, form({ password: temporaryPassword, passwordConfirm: temporaryPassword }))).toEqual({ fieldErrors: { password: "اختر كلمة مرور غير الكلمة المؤقتة." } });
    expect((await changeTemporaryPasswordAction(null, form({ password: "short", passwordConfirm: "short" })))?.fieldErrors?.password).toContain("٨ أحرف");
    expect((await changeTemporaryPasswordAction(null, form({ password: NEW_PASSWORD, passwordConfirm: "different-one-1" })))?.fieldErrors?.passwordConfirm).toBeTruthy();
  });

  it("using the owner's link instead also clears the gate and kills the temporary password", async () => {
    const { student, link, temporaryPassword } = await issued();
    expect(await resetPassword(tokenOf(link), NEW_PASSWORD)).toEqual({ ok: true });
    const r = await loginWithPassword(student.email, NEW_PASSWORD, meta);
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.mustChangePassword).toBeFalsy();
    expect((await loginWithPassword(student.email, temporaryPassword, meta)).ok).toBe(false);
  });
});

describe("owner actions are for the owner", () => {
  async function asRole(role: "student" | "teacher") {
    const u = await createUser({ role });
    ctx.cookie = (await createSession(u.id)).token;
    return u;
  }

  it.each(["student", "teacher"] as const)("a %s cannot reset or correct anything", async (role) => {
    await asRole(role);
    const victim = await createUser();
    expect(await resetStudentPasswordAction(null, form({ userId: victim.id, reason: "سبب كاف" }))).toEqual({ error: "غير مصرح لك بتنفيذ هذا الإجراء" });
    expect(await correctStudentEmailAction(null, form({ userId: victim.id, reason: "سبب كاف", email: "x@farqad.test" }))).toEqual({ error: "غير مصرح لك بتنفيذ هذا الإجراء" });
    expect(await markStudentEmailVerifiedAction(null, form({ userId: victim.id, reason: "سبب كاف" }))).toEqual({ error: "غير مصرح لك بتنفيذ هذا الإجراء" });
    expect((await sql<{ email_verified_at: Date | null }[]>`select email_verified_at from users where id = ${victim.id}`)[0]!.email_verified_at).toBeNull();
    expect((await loginWithPassword(victim.email, TEST_PASSWORD, meta)).ok).toBe(true);
  });

  it("the owner gets both secrets once, and a reason is required", async () => {
    const admin = await createUser({ role: "admin" });
    ctx.cookie = (await provenOwner(admin)).session.token;
    const student = await createUser();
    expect(await resetStudentPasswordAction(null, form({ userId: student.id, reason: "" }))).toMatchObject({ error: expect.stringContaining("سبب") });
    expect((await loginWithPassword(student.email, TEST_PASSWORD, meta)).ok).toBe(true);
    const r = await resetStudentPasswordAction(null, form({ userId: student.id, reason: "طلب الطالب" }));
    expect(r?.ok).toBe(true);
    expect(r?.secrets?.link).toContain("/reset-password?token=");
    expect(r?.secrets?.temporaryPassword).toMatch(/^.{4}-.{4}-.{4}$/);
    expect(r?.message).not.toContain(r!.secrets!.temporaryPassword!);
  });
});

describe("owner correction of a student's email", () => {
  async function correct(newEmail: string, student?: { id: string }) {
    const admin = await createUser({ role: "admin" });
    const s = student ?? (await createUser());
    const out = await correctStudentEmail({ studentId: s.id, newEmail, adminId: admin.id, reason: "خطأ إملائي", ip: "192.0.2.2" });
    return { admin, student: s, out };
  }

  it("moves the account, resets verification and audits both addresses", async () => {
    const student = await createUser();
    await sql`update users set email_verified_at = now() where id = ${student.id}`;
    const { admin } = await correct("Fixed.Address@Farqad.Test", student);
    const [row] = await sql<{ email: string; email_verified_at: Date | null }[]>`select email, email_verified_at from users where id = ${student.id}`;
    expect(row).toEqual({ email: "fixed.address@farqad.test", email_verified_at: null });
    const [log] = await sql<{ actor_id: string; reason: string; metadata: { from: string; to: string } }[]>`select actor_id, reason, metadata from audit_logs where entity_id = ${student.id}`;
    expect(log).toMatchObject({ actor_id: admin.id, reason: "خطأ إملائي", metadata: { from: student.email ?? "", to: "fixed.address@farqad.test" } });
    expect((await loginWithPassword("fixed.address@farqad.test", TEST_PASSWORD, meta)).ok).toBe(true);
  });

  it("refuses an address another account holds, ignoring case, and changes nothing", async () => {
    const other = await createUser({ email: "taken@farqad.test" });
    const student = await createUser();
    const admin = await createUser({ role: "admin" });
    await expect(correctStudentEmail({ studentId: student.id, newEmail: "TAKEN@farqad.test", adminId: admin.id, reason: "اختبار" })).rejects.toMatchObject({ fieldErrors: { email: "هذا البريد مستخدم في حساب آخر" } });
    const [row] = await sql<{ email: string }[]>`select email from users where id = ${student.id}`;
    expect(row.email).toBe(student.email);
    expect(other.email).toBe("taken@farqad.test");
    expect(await sql`select 1 from audit_logs where entity_id = ${student.id}`).toHaveLength(0);
  });

  it("refuses the same address and a malformed one", async () => {
    const student = await createUser();
    await expect(correct(student.email, student)).rejects.toThrow("هذا هو البريد الحالي للطالب");
    await expect(correct("not-an-email", student)).rejects.toThrow("البريد الإلكتروني غير صحيح");
  });

  it("refuses staff accounts", async () => {
    const teacher = await createUser({ role: "teacher" });
    await expect(correct("new-teacher@farqad.test", teacher)).rejects.toThrow("لحسابات الطلاب فقط");
  });

  it("voids links that went to the wrong address", async () => {
    const student = await createUser();
    const token = "link-sent-to-the-mistyped-address-000";
    await sql`insert into password_reset_tokens (id, user_id, expires_at) values (${hashToken(token)}, ${student.id}, now() + interval '1 hour')`;
    await sql`insert into email_verification_tokens (id, user_id, email, expires_at) values (${hashToken(`${token}x`)}, ${student.id}, ${student.email}, now() + interval '1 hour')`;
    await correct("right-address@farqad.test", student);
    expect((await resetPassword(token, NEW_PASSWORD)).ok).toBe(false);
    expect(await sql`select 1 from email_verification_tokens where user_id = ${student.id} and used_at is null`).toHaveLength(0);
  });

  it("with real mail: the old address is told, without the new one, and the new address gets a link", async () => {
    realMail();
    const student = await createUser({ fullName: "اسم الطالب السري" });
    await correct("new-home@farqad.test", student);
    const old = sink.messages.find((m) => m.to.includes(student.email))!;
    expect(old.subject).toContain("تغيّر البريد");
    expect(old.text).not.toContain("new-home");
    expect(old.text).not.toContain("اسم الطالب السري");
    const fresh = sink.messages.find((m) => m.to.includes("new-home@farqad.test"))!;
    expect(fresh.text).toContain("/verify-email/confirm?token=");
  });

  describe("what the owner is told about the mail", () => {
    async function viaAction(email: string, student: { id: string }) {
      const admin = await createUser({ role: "admin" });
      ctx.cookie = (await provenOwner(admin)).session.token;
      return correctStudentEmailAction(null, form({ userId: student.id, email, reason: "خطأ إملائي" }));
    }

    it("both accepted: says so, as a plain success", async () => {
      realMail();
      const student = await createUser();
      const r = await viaAction("both-ok@farqad.test", student);
      expect(r).toEqual({ ok: true, message: "تم تصحيح البريد وإرسال رابط تأكيد إلى العنوان الجديد وتنبيه إلى القديم." });
    });

    it("the link refused: the owner is not told it went out, and is told what to do", async () => {
      realMail();
      const student = await createUser();
      sink.rejectAddress("no-link@farqad.test");
      const r = await viaAction("no-link@farqad.test", student);
      expect(r?.ok).toBe(true);
      expect(r?.partial).toBe(true);
      expect(r?.message).toContain("تعذر إرسال رابط التأكيد");
      expect(r?.message).not.toContain("والتنبيه إلى القديم");
      expect(r?.message).toContain("أكّد بريده من هذه الصفحة");
      expect(sink.messages.some((m) => m.to.includes(student.email))).toBe(true);
      expect(await sql`select 1 from email_verification_tokens where user_id = ${student.id} and used_at is null`).toHaveLength(0);
      expect((await sql<{ email: string }[]>`select email from users where id = ${student.id}`)[0]!.email).toBe("no-link@farqad.test");
    });

    it("the old address refused: the link is reported as sent, the notice as failed", async () => {
      realMail();
      const student = await createUser();
      sink.rejectAddress(student.email);
      const r = await viaAction("link-ok@farqad.test", student);
      expect(r).toMatchObject({ ok: true, partial: true, message: expect.stringContaining("تعذر إرسال التنبيه إلى العنوان القديم") });
      expect(sink.messages.some((m) => m.to.includes("link-ok@farqad.test"))).toBe(true);
    });

    it("both refused: the owner hears about both", async () => {
      realMail();
      const student = await createUser();
      sink.rejectNext(2);
      const r = await viaAction("none-ok@farqad.test", student);
      expect(r).toMatchObject({ ok: true, partial: true, message: expect.stringContaining("رابط التأكيد إلى العنوان الجديد والتنبيه إلى القديم") });
    });

    it("the service reports each message separately", async () => {
      realMail();
      const student = await createUser();
      sink.rejectAddress("service-no-link@farqad.test");
      const { out } = await correct("service-no-link@farqad.test", student);
      expect(out).toEqual({ email: "service-no-link@farqad.test", oldNotified: true, linkSent: false });
    });
  });

  it("with log mail: nobody is told, because nothing would arrive", async () => {
    const student = await createUser();
    await correct("quiet@farqad.test", student);
    expect(await sql`select 1 from email_log where to_email in (${student.email}, 'quiet@farqad.test')`).toHaveLength(0);
  });

  it("is limited per student", async () => {
    const student = await createUser();
    for (let i = 0; i < 5; i++) await correct(`loop-${i}@farqad.test`, student);
    await expect(correct("one-more@farqad.test", student)).rejects.toThrow(/محاولات كثيرة/);
  });
});

describe("owner confirmation of a student's email", () => {
  async function setup() {
    const [admin, student] = await Promise.all([createUser({ role: "admin" }), createUser()]);
    return { admin, student };
  }
  const verifiedAt = async (id: string) => (await sql<{ email_verified_at: Date | null }[]>`select email_verified_at from users where id = ${id}`)[0]!.email_verified_at;

  it("releases a student who could not pay, and records who vouched for which address and why", async () => {
    realMail();
    const { admin, student } = await setup();
    expect(await emailVerificationRequired(student.id)).toBe(true);
    await markStudentEmailVerified({ studentId: student.id, adminId: admin.id, reason: "تحققت من ولي الأمر بالهاتف", ip: "192.0.2.9" });
    expect(await emailVerificationRequired(student.id)).toBe(false);
    const [log] = await sql<{ actor_id: string; reason: string; ip: string; metadata: { email: string } }[]>`select actor_id, reason, ip, metadata from audit_logs where entity_id = ${student.id} and action = 'student.email_marked_verified'`;
    expect(log).toEqual({ actor_id: admin.id, reason: "تحققت من ولي الأمر بالهاتف", ip: "192.0.2.9", metadata: { email: student.email } });
  });

  it("voids a correction link still pending, because this address is the one confirmed", async () => {
    realMail();
    const { admin, student } = await setup();
    await requestEmailCorrection(student.id, "attacker@farqad.test", TEST_PASSWORD, "192.0.2.10");
    const token = decodeURIComponent(/token=(\S+)/.exec(sink.messages.find((m) => m.to.includes("attacker@farqad.test"))!.text)![1]!);
    await markStudentEmailVerified({ studentId: student.id, adminId: admin.id, reason: "تحقق بالهاتف" });
    expect((await confirmEmailToken(token, "192.0.2.10")).ok).toBe(false);
    expect((await sql<{ email: string }[]>`select email from users where id = ${student.id}`)[0]!.email).toBe(student.email);
  });

  it("refuses what is already confirmed, without a second audit entry or a new date", async () => {
    const { admin, student } = await setup();
    await markStudentEmailVerified({ studentId: student.id, adminId: admin.id, reason: "تحقق بالهاتف" });
    const before = await verifiedAt(student.id);
    await expect(markStudentEmailVerified({ studentId: student.id, adminId: admin.id, reason: "مرة ثانية" })).rejects.toThrow("مؤكد بالفعل");
    expect(await verifiedAt(student.id)).toEqual(before);
    expect(await sql`select 1 from audit_logs where entity_id = ${student.id} and action = 'student.email_marked_verified'`).toHaveLength(1);
  });

  it("is for live student accounts only", async () => {
    const admin = await createUser({ role: "admin" });
    const teacher = await createUser({ role: "teacher" });
    await expect(markStudentEmailVerified({ studentId: teacher.id, adminId: admin.id, reason: "تحقق" })).rejects.toBeInstanceOf(AdminError);
    expect(await verifiedAt(teacher.id)).toBeNull();
    await expect(markStudentEmailVerified({ studentId: "00000000-0000-4000-8000-000000000000", adminId: admin.id, reason: "تحقق" })).rejects.toThrow("غير موجود");
    const gone = await createUser();
    await sql`update users set anonymized_at = now(), is_active = false, full_name = ${`طالب محذوف ${gone.id.slice(0, 8)}`}, phone = null, grade_id = null, email = ${`deleted-${gone.id}@anonymized.invalid`}, password_hash = '!anonymized' where id = ${gone.id}`;
    await expect(markStudentEmailVerified({ studentId: gone.id, adminId: admin.id, reason: "تحقق" })).rejects.toThrow("حُذفت بيانات هذا الحساب");
    expect(await verifiedAt(gone.id)).toBeNull();
  });

  it("needs a reason through the owner's action", async () => {
    const { admin, student } = await setup();
    ctx.cookie = (await createSession(admin.id)).token;
    expect(await markStudentEmailVerifiedAction(null, form({ userId: student.id, reason: "" }))).toMatchObject({ error: expect.stringContaining("سبب") });
    expect(await verifiedAt(student.id)).toBeNull();
    expect(await markStudentEmailVerifiedAction(null, form({ userId: student.id, reason: "تحقق بالهاتف" }))).toEqual({ ok: true, message: "تم تأكيد البريد. يستطيع الطالب إكمال الدفع الآن." });
    expect(await verifiedAt(student.id)).not.toBeNull();
  });

  it("is limited per student", async () => {
    const { admin, student } = await setup();
    await sql`insert into rate_limits (key, count, reset_at) values (${`owner-verify:user:${student.id}`}, 5, now() + interval '1 hour')`;
    await expect(markStudentEmailVerified({ studentId: student.id, adminId: admin.id, reason: "تحقق" })).rejects.toThrow(/محاولات كثيرة/);
    expect(await verifiedAt(student.id)).toBeNull();
  });
});
