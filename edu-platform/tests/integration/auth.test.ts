import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSession, hashToken, invalidateAllUserSessions, invalidateSession, validateSessionToken } from "@/server/auth/session";
import { clearRateLimit, hitRateLimit, peekRateLimit } from "@/server/auth/rate-limit";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser, TEST_PASSWORD } from "../helpers/factories";
import { loginWithPassword } from "@/server/auth/service";

beforeAll(resetDb);
afterAll(closeDb);

describe("sessions (DB-backed, token hashed)", () => {
  it("creates a session storing only the sha256 of the token", async () => {
    const u = await createUser();
    const { token, expiresAt } = await createSession(u.id, { ip: "1.2.3.4", userAgent: "vitest" });
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);
    const rows = await sql<{ id: string }[]>`select id from sessions where user_id = ${u.id}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(hashToken(token));
    expect(rows[0].id).not.toBe(token);
    const [{ last_login_at }] = await sql<{ last_login_at: Date | null }[]>`select last_login_at from users where id = ${u.id}`;
    expect(last_login_at).not.toBeNull();
  });

  it("validates a token and returns the user", async () => {
    const u = await createUser({ role: "admin", fullName: "مدير" });
    const { token } = await createSession(u.id);
    const s = await validateSessionToken(token);
    expect(s?.user).toMatchObject({ id: u.id, role: "admin", fullName: "مدير", isActive: true });
  });

  it("rejects unknown, oversized and empty tokens", async () => {
    expect(await validateSessionToken("nope")).toBeNull();
    expect(await validateSessionToken("")).toBeNull();
    expect(await validateSessionToken("x".repeat(500))).toBeNull();
  });

  it("expired sessions are rejected and deleted", async () => {
    const u = await createUser();
    const { token } = await createSession(u.id);
    await sql`update sessions set expires_at = now() - interval '1 minute' where id = ${hashToken(token)}`;
    expect(await validateSessionToken(token)).toBeNull();
    expect(await sql`select 1 from sessions where id = ${hashToken(token)}`).toHaveLength(0);
  });

  it("sessions of a deactivated user are rejected", async () => {
    const u = await createUser();
    const { token } = await createSession(u.id);
    await sql`update users set is_active = false where id = ${u.id}`;
    expect(await validateSessionToken(token)).toBeNull();
  });

  it("renews sessions that are past the renewal threshold", async () => {
    const u = await createUser();
    const { token } = await createSession(u.id);
    await sql`update sessions set expires_at = now() + interval '5 days' where id = ${hashToken(token)}`;
    const s = await validateSessionToken(token);
    expect(s!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);
  });

  it("invalidation (logout / password change) removes sessions", async () => {
    const u = await createUser();
    const a = await createSession(u.id);
    const b = await createSession(u.id);
    const c = await createSession(u.id);
    await invalidateSession(hashToken(a.token));
    expect(await validateSessionToken(a.token)).toBeNull();
    await invalidateAllUserSessions(u.id, hashToken(b.token));
    expect(await validateSessionToken(b.token)).not.toBeNull();
    expect(await validateSessionToken(c.token)).toBeNull();
    await invalidateAllUserSessions(u.id);
    expect(await validateSessionToken(b.token)).toBeNull();
  });
});

describe("rate limiting (fixed window in DB)", () => {
  it("allows up to the limit then blocks", async () => {
    const key = "login:test@example.com";
    for (let i = 1; i <= 3; i++) {
      const r = await hitRateLimit(key, 3, 60);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(3 - i);
    }
    const blocked = await hitRateLimit(key, 3, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect((await peekRateLimit(key, 3)).blocked).toBe(true);
  });

  it("resets after the window expires", async () => {
    const key = "login:window";
    await hitRateLimit(key, 1, 60);
    expect((await hitRateLimit(key, 1, 60)).allowed).toBe(false);
    await sql`update rate_limits set reset_at = now() - interval '1 second' where key = ${key}`;
    expect((await peekRateLimit(key, 1)).blocked).toBe(false);
    const r = await hitRateLimit(key, 1, 60);
    expect(r.allowed).toBe(true);
  });

  it("is safe under concurrent hits (atomic upsert)", async () => {
    const key = "login:concurrent";
    const results = await Promise.all(Array.from({ length: 10 }, () => hitRateLimit(key, 5, 60)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    const [{ count }] = await sql<{ count: number }[]>`select count from rate_limits where key = ${key}`;
    expect(count).toBe(10);
  });

  it("clearRateLimit removes the key", async () => {
    await hitRateLimit("login:clear", 1, 60);
    await clearRateLimit("login:clear");
    expect((await peekRateLimit("login:clear", 1)).blocked).toBe(false);
  });
});

describe("login limits per IP (school networks behind one NAT)", () => {
  it("successful logins from one IP never lock it; repeated failures do", async () => {
    const ip = "203.0.113.77";
    const users = await Promise.all(Array.from({ length: 4 }, () => createUser()));
    // 60 دخولًا ناجحًا من نفس الشبكة (فصل كامل)
    for (let i = 0; i < 60; i++) {
      const u = users[i % users.length];
      const r = await loginWithPassword(u.email, TEST_PASSWORD, { ip, userAgent: "t" });
      expect(r.ok, `login ${i}`).toBe(true);
    }
    // ١٠٠ حساب مختلف فشل الدخول إليها تقفل الـ IP
    for (let i = 0; i < 100; i++) await loginWithPassword(`nobody-${i}@example.com`, "wrong-password", { ip, userAgent: "t" });
    const blocked = await loginWithPassword(users[0].email, TEST_PASSWORD, { ip, userAgent: "t" });
    expect(blocked.ok).toBe(false);
    // شبكة أخرى لا تتأثر
    const other = await loginWithPassword(users[0].email, TEST_PASSWORD, { ip: "198.51.100.5", userAgent: "t" });
    expect(other.ok).toBe(true);
  }, 120_000);
});
