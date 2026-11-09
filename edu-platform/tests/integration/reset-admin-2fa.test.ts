import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loginWithPassword } from "@/server/auth/service";
import { getDb } from "@/server/db";
import { parseResetArgs, ResetRefusedError, resetAdminTwoFactor } from "../../scripts/reset-admin-2fa";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser, TEST_PASSWORD } from "../helpers/factories";
import { enrolAdmin } from "../helpers/two-factor";
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
