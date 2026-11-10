import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { passwordPolicyError, STAFF_PASSWORD_MIN, STUDENT_PASSWORD_MIN } from "@/lib/password-policy";
import { changePassword, completeForcedPasswordChange, loginWithPassword, requestPasswordReset, resetPassword } from "@/server/auth/service";
import { createSession, hashToken, validateSessionToken } from "@/server/auth/session";
import { hashPassword } from "@/server/auth/password-core";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser, TEST_PASSWORD } from "../helpers/factories";

beforeAll(resetDb);
afterAll(closeDb);
afterEach(() => sql`delete from rate_limits`);

const STRONG = "Sand-Harbor-Lantern-41";

async function issueResetToken(userId: string, token = `token-${userId}`.slice(0, 40)) {
  await sql`insert into password_reset_tokens (id, user_id, expires_at) values (${hashToken(token)}, ${userId}, now() + interval '1 hour')`;
  return token;
}

describe("password policy rules", () => {
  it("students keep the eight character minimum", () => {
    expect(passwordPolicyError("student", "blue-kite".slice(0, STUDENT_PASSWORD_MIN))).toBeNull();
    expect(passwordPolicyError("student", "blue-kite".slice(0, STUDENT_PASSWORD_MIN - 1))).toBe("كلمة المرور يجب أن تكون ٨ أحرف على الأقل");
  });

  it.each(["12345678", "99887766", "٠٥٠١٢٣٤٥٦", "2012/05/14", "1234 5678", "aaaaaaaa", "abababab", "aabbccaa", "abcdefgh", "hgfedcba", "qwertyui", "asdfghjk", "!@#$%^&*", "ضصثقفغعه", "abcdabcd", "qwerqwer", "password", "Password1", "P@ssw0rd", "p@ssw0rd123", "Passw0rd!", "qwerty123", "ahmed2012", "Mohammed1", "football10", "iloveyou2", "محمد2012", "فاطمة1234", "1a2b3c4d"])(
    "refuses the easy guess %s for a student, in words a child can act on",
    (bad) => {
      expect(passwordPolicyError("student", bad)).toContain("سهلة التخمين");
    },
  );

  it.each(["blue kite 7", "my cat Lulu", "قمر فوق البحر", "sand4harbor", "Student-Pass-1", "kuwait city bus"])("accepts %s, with no demand for symbols or capitals", (good) => {
    expect(passwordPolicyError("student", good)).toBeNull();
  });

  it("refuses a student password built on the account's own email", () => {
    expect(passwordPolicyError("student", "khaled.m2012", "khaled.m@school.test")).toContain("سهلة التخمين");
    expect(passwordPolicyError("student", "blue kite 7", "khaled.m@school.test")).toBeNull();
  });

  it("the student word list does not reach staff, so no teacher who passed before is sent to change", () => {
    expect(passwordPolicyError("teacher", "Mohammed-Mohammed-2026", null)).toBeNull();
  });

  it("existing passwords are never re-judged at sign-in", async () => {
    const hash = await hashPassword("12345678");
    const u = await createUser();
    await sql`update users set password_hash = ${hash} where id = ${u.id}`;
    await expect(loginWithPassword(u.email, "12345678", { ip: "192.0.2.2", userAgent: "t" })).resolves.toMatchObject({ ok: true });
    expect((await sql<{ must_change_password: boolean }[]>`select must_change_password from users where id = ${u.id}`)[0].must_change_password).toBe(false);
  });

  it.each(["teacher", "admin"] as const)("%s needs at least twelve characters, with a clear Arabic message", (role) => {
    expect(passwordPolicyError(role, STRONG.slice(0, STAFF_PASSWORD_MIN - 1))).toBe("كلمة مرور حسابات الإدارة والمعلمين يجب أن تكون ١٢ حرفًا على الأقل");
    expect(passwordPolicyError(role, STRONG)).toBeNull();
  });

  it.each(["aaaaaaaaaaaaaaaa", "abababababababab", "123456789012", "Password123456!", "admin@admin@2026", "qwerty123456", "Farqad-2026-2026", "12345678-Admin"])("refuses the easy guess %s for staff", (bad) => {
    expect(passwordPolicyError("admin", bad)).toContain("سهلة التخمين");
  });

  it("refuses a staff password built on the account's own email", () => {
    expect(passwordPolicyError("teacher", "Mohammed.Ali-2026-x", "mohammed.ali@school.test")).toContain("سهلة التخمين");
    expect(passwordPolicyError("teacher", "Sand-Harbor-Lantern-41", "mohammed.ali@school.test")).toBeNull();
  });

  it("accepts a long Arabic passphrase", () => {
    expect(passwordPolicyError("admin", "قمر فوق بحر الخليج")).toBeNull();
  });

  it("caps length for everyone", () => {
    expect(passwordPolicyError("student", "x".repeat(129))).toBe("كلمة المرور طويلة جدًا");
    expect(passwordPolicyError("admin", `${STRONG}${"y".repeat(120)}`)).toBe("كلمة المرور طويلة جدًا");
  });
});

describe("enforced when a password is set", () => {
  it("teacher changing from the account: too short is refused and nothing changes", async () => {
    const u = await createUser({ role: "teacher" });
    const s = await createSession(u.id);
    const r = await changePassword(u.id, TEST_PASSWORD, "Short-Pass1", hashToken(s.token));
    expect(r).toEqual({ ok: false, error: "كلمة مرور حسابات الإدارة والمعلمين يجب أن تكون ١٢ حرفًا على الأقل", field: "newPassword" });
    expect((await loginWithPassword(u.email, TEST_PASSWORD, { ip: "192.0.2.1", userAgent: "t" })).ok).toBe(true);
  });

  it("student changing from the account stays at eight, ends other sessions, keeps this one, voids open links", async () => {
    const u = await createUser();
    const keep = await createSession(u.id);
    const other = await createSession(u.id);
    const link = await issueResetToken(u.id);
    expect(await changePassword(u.id, TEST_PASSWORD, "Eight-ch", hashToken(keep.token))).toEqual({ ok: true });
    expect(await validateSessionToken(keep.token)).not.toBeNull();
    expect(await validateSessionToken(other.token)).toBeNull();
    expect((await resetPassword(link, "Another-Pass-2")).ok).toBe(false);
  });

  it("the current password cannot be guessed from an open session", async () => {
    const u = await createUser();
    const s = await createSession(u.id);
    for (let i = 0; i < 5; i++) expect(await changePassword(u.id, `guess-${i}`, "New-Password-1", hashToken(s.token))).toMatchObject({ error: "كلمة المرور الحالية غير صحيحة." });
    expect(await changePassword(u.id, TEST_PASSWORD, "New-Password-1", hashToken(s.token))).toEqual({ ok: false, error: "محاولات كثيرة. حاول مرة أخرى بعد قليل.", field: "currentPassword" });
  });

  it("reset link: a weak staff password is refused and the link still works", async () => {
    const u = await createUser({ role: "teacher" });
    const token = await issueResetToken(u.id);
    expect(await resetPassword(token, "Short-Pass1")).toEqual({ ok: false, error: "كلمة مرور حسابات الإدارة والمعلمين يجب أن تكون ١٢ حرفًا على الأقل", field: "password" });
    expect(await resetPassword(token, STRONG)).toEqual({ ok: true });
  });

  it("forced change after a temporary password: staff rules still apply", async () => {
    const u = await createUser({ role: "teacher" });
    await sql`update users set must_change_password = true where id = ${u.id}`;
    expect(await completeForcedPasswordChange(u.id, "Short-Pass1", { ip: "192.0.2.9", userAgent: "t" })).toEqual({ ok: false, error: "كلمة مرور حسابات الإدارة والمعلمين يجب أن تكون ١٢ حرفًا على الأقل", field: "password" });
    expect((await completeForcedPasswordChange(u.id, STRONG, { ip: "192.0.2.9", userAgent: "t" })).ok).toBe(true);
  });

  it("reset link: a student keeps the eight character rule", async () => {
    const u = await createUser();
    expect(await resetPassword(await issueResetToken(u.id), "Eight-ch")).toEqual({ ok: true });
  });
});

describe("the owner account does not recover by email", () => {
  it("a reset request sends a notice with no link and stores no token", async () => {
    const admin = await createUser({ role: "admin" });
    await requestPasswordReset(admin.email, "192.0.2.5");
    expect(await sql`select 1 from password_reset_tokens where user_id = ${admin.id}`).toHaveLength(0);
    const [mail] = await sql<{ template: string; body: string }[]>`select template, body from email_log where to_email = ${admin.email}`;
    expect(mail.template).toBe("password_reset_refused");
    expect(mail.body).not.toContain("reset-password");
    expect(mail.body).toContain("admin:create");
  });

  it("a token that somehow exists for an admin is refused", async () => {
    const admin = await createUser({ role: "admin" });
    const token = await issueResetToken(admin.id);
    expect(await resetPassword(token, STRONG)).toMatchObject({ ok: false, error: "انتهت صلاحية الرابط أو سبق استخدامه. اطلب رابطًا جديدًا." });
    expect((await loginWithPassword(admin.email, TEST_PASSWORD, { ip: "192.0.2.6", userAgent: "t" })).ok).toBe(true);
  });
});
