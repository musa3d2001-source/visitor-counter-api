import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loginWithPassword } from "@/server/auth/service";
import { getDb } from "@/server/db";
import { readFileSync } from "node:fs";
import { beginTwoFactorEnrolment, confirmTwoFactorEnrolment, verifyStepUpCode } from "@/server/auth/two-factor";
import { createSession, hashToken } from "@/server/auth/session";
import { base32Decode } from "@/server/auth/two-factor-core";
import { hashPassword } from "@/server/auth/password-core";
import { scriptDbOptions } from "../../scripts/_env";
import { parseResetArgs, ResetRefusedError, resetAdminTwoFactor } from "../../scripts/reset-admin-2fa";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser, TEST_PASSWORD } from "../helpers/factories";
import { codeAt, currentStep, enrolAdmin, wrongCode } from "../helpers/two-factor";
import { TEST_DATABASE_URL } from "../test-env";

const run = promisify(execFile);
const meta = { ip: "192.0.2.60", userAgent: "vitest" };

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closeDb();
});

describe("the admin two-factor reset command", () => {
  const options = (email: string, apply: boolean) => ({ email, apply, reason: "فقدان الجوال" });
  const state = async (userId: string) => {
    const [row] = await sql<{ totp: number; codes: number; sessions: number; challenges: number; audits: number }[]>`
      select
        (select count(*)::int from user_totp where user_id = ${userId}) as totp,
        (select count(*)::int from user_recovery_codes where user_id = ${userId}) as codes,
        (select count(*)::int from sessions where user_id = ${userId}) as sessions,
        (select count(*)::int from login_challenges where user_id = ${userId}) as challenges,
        (select count(*)::int from audit_logs where entity_id = ${userId} and action = 'two_factor.reset_via_cli') as audits
    `;
    return row;
  };
  async function enrolled() {
    const user = await createUser({ role: "admin" });
    await enrolAdmin(user);
    await sql`insert into login_challenges (id, user_id, expires_at) values (${"a".repeat(64)}, ${user.id}, now() + interval '5 minutes')`;
    return user;
  }

  it("requires an explicit email, and defaults to doing nothing", () => {
    expect(parseResetArgs(["--email", "Owner@Example.com"])).toEqual({ email: "owner@example.com", apply: false, reason: null });
    expect(parseResetArgs(["--email", "a@b.co", "--apply", "--reason", "x"])).toEqual({ email: "a@b.co", apply: true, reason: "x" });
    for (const bad of [[], ["--apply"], ["--email"], ["--email", "--apply"], ["--email", "not-an-email"], ["--email", "a@b.co", "--force"]]) expect(() => parseResetArgs(bad)).toThrow(ResetRefusedError);
  });

  it("says which server it is about to touch, since the database name is postgres everywhere", async () => {
    const user = await enrolled();
    const report = await resetAdminTwoFactor(getDb(), options(user.email, false));
    expect(report.host).toBe(new URL(TEST_DATABASE_URL).hostname);
  });

  it("the first code from the new phone is accepted even after a run of wrong ones", async () => {
    const user = await createUser({ role: "admin" });
    const { secret } = await enrolAdmin(user);
    for (let i = 0; i < 7; i++) await verifyStepUpCode({ userId: user.id, code: wrongCode(secret), ip: "192.0.2.61" });
    await resetAdminTwoFactor(getDb(), options(user.email, true));

    const session = await createSession(user.id, { ip: "192.0.2.61", userAgent: "vitest" });
    const sessionId = hashToken(session.token);
    const details = await beginTwoFactorEnrolment({ userId: user.id, sessionId, account: user.email, issuer: "فرقد" });
    const fresh = base32Decode(details!.manualKey.replace(/\s/g, ""));
    expect(await confirmTwoFactorEnrolment({ password: TEST_PASSWORD, userId: user.id, sessionId, code: codeAt(fresh, currentStep()), ip: "192.0.2.61" })).toMatchObject({ ok: true });
  });

  it("the dry run reports and changes nothing", async () => {
    const user = await enrolled();
    const before = await state(user.id);
    await expect(resetAdminTwoFactor(getDb(), options(user.email, false))).resolves.toMatchObject({ applied: false, email: user.email, twoFactorEnabled: true, recoveryCodes: 10, sessions: 1, pendingChallenges: 1 });
    expect(await state(user.id)).toEqual(before);
  });

  it("applying removes every factor and session, and is audited without any secret", async () => {
    const user = await enrolled();
    await expect(resetAdminTwoFactor(getDb(), options(user.email, true))).resolves.toMatchObject({ applied: true });
    expect(await state(user.id)).toEqual({ totp: 0, codes: 0, sessions: 0, challenges: 0, audits: 1 });
    const [log] = await sql<{ actor_id: string | null; reason: string; metadata: unknown }[]>`select actor_id, reason, metadata from audit_logs where entity_id = ${user.id} and action = 'two_factor.reset_via_cli'`;
    expect(log.actor_id).toBeNull();
    expect(log.reason).toBe("فقدان الجوال");
    expect(JSON.stringify(log)).not.toMatch(/secret|code_hash|v1\./);
    await expect(loginWithPassword(user.email, TEST_PASSWORD, meta)).resolves.toMatchObject({ ok: true });
  });

  it("refuses a non-admin or unknown account", async () => {
    const student = await createUser();
    await expect(resetAdminTwoFactor(getDb(), options(student.email, true))).rejects.toThrow(ResetRefusedError);
    await expect(resetAdminTwoFactor(getDb(), options("nobody@example.com", false))).rejects.toThrow(ResetRefusedError);
  });

  it("the command line does nothing without --apply, acts with it, and fails without an email", async () => {
    const user = await enrolled();
    const cli = async (args: string[]) => {
      // مجلد مؤقت حتى لا يقرأ السكربت أي ملف بيئة، وقاعدة الاختبار صراحةً
      const cwd = mkdtempSync(join(tmpdir(), "reset-2fa-cli-"));
      try {
        return await run(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/reset-admin-2fa.ts"), ...args], { cwd, env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, DATABASE_PGBOUNCER: "false" }, timeout: 60_000 });
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    };
    const dry = await cli(["--email", user.email]);
    expect(dry.stdout).toContain("Dry run");
    expect((await state(user.id)).totp).toBe(1);
    await expect(cli(["--apply"])).rejects.toMatchObject({ code: 2 });
    expect((await state(user.id)).totp).toBe(1);
    const applied = await cli(["--email", user.email, "--apply"]);
    expect(applied.stdout).toContain("Applied");
    expect((await state(user.id)).totp).toBe(0);
  });
});

describe("the commands an owner runs from their own computer", () => {
  const scriptCli = async (script: string, args: string[], env: Record<string, string>) => {
    const cwd = mkdtempSync(join(tmpdir(), "admin-cli-"));
    try {
      return await run(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve(script), ...args], { cwd, env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, ...env }, timeout: 60_000 });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  };
  const NEW_PASSWORD = "Fresh-Owner-Pass-2026";

  it("a pooler connection turns prepared statements off, as the app does", () => {
    expect(scriptDbOptions({ DATABASE_PGBOUNCER: "true" })).toMatchObject({ max: 1, prepare: false, max_pipeline: 1 });
    expect(scriptDbOptions({ DATABASE_PGBOUNCER: "false" })).toMatchObject({ max: 1, prepare: true });
    expect(scriptDbOptions({})).toMatchObject({ prepare: true });
    expect(scriptDbOptions({})).not.toHaveProperty("max_pipeline");
  });

  it.each(["scripts/create-admin.ts", "scripts/reset-admin-2fa.ts"])("%s connects through those options", (script) => {
    expect(readFileSync(script, "utf8")).toMatch(/postgres\([^)]*scriptDbOptions\(\)\)/);
  });

  it("create-admin also works with pooler settings", async () => {
    await scriptCli("scripts/create-admin.ts", ["--email", "pooled-owner@farqad.test"], { DATABASE_PGBOUNCER: "true", ADMIN_PASSWORD: NEW_PASSWORD });
    await expect(loginWithPassword("pooled-owner@farqad.test", NEW_PASSWORD, meta)).resolves.toMatchObject({ ok: true });
  });

  it("recovering a forgotten owner password leaves nothing behind from the old state", async () => {
    const admin = await createUser({ role: "admin" });
    const hash = await hashPassword("Some-Old-Temp-Pass-1");
    await sql`update users set password_hash = ${hash}, must_change_password = true, temp_password_expires_at = now() - interval '1 hour' where id = ${admin.id}`;
    await sql`insert into password_reset_tokens (id, user_id, expires_at) values (${hashToken("stale-reset")}, ${admin.id}, now() + interval '1 hour')`;
    await sql`insert into email_verification_tokens (id, user_id, email, expires_at) values (${hashToken("stale-verify")}, ${admin.id}, ${admin.email}, now() + interval '1 hour')`;
    await sql`insert into rate_limits (key, count, reset_at) values (${`login:fail:${admin.email}|192.0.2.60`}, 50, now() + interval '1 hour')`;
    const old = await createSession(admin.id);

    const out = await scriptCli("scripts/create-admin.ts", ["--email", admin.email], { DATABASE_PGBOUNCER: "false", ADMIN_PASSWORD: NEW_PASSWORD });
    expect(out.stdout).not.toContain(NEW_PASSWORD);

    const login = await loginWithPassword(admin.email, NEW_PASSWORD, meta);
    expect(login).toMatchObject({ ok: true });
    expect(login.ok && login.mustChangePassword).toBeFalsy();
    expect(await sql`select 1 from sessions where id = ${hashToken(old.token)}`).toHaveLength(0);
    expect(await sql`select 1 from password_reset_tokens where user_id = ${admin.id} and used_at is null`).toHaveLength(0);
    expect(await sql`select 1 from email_verification_tokens where user_id = ${admin.id} and used_at is null`).toHaveLength(0);
  });
});
