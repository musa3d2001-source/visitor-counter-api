import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { sql } from "../db";
import { env } from "../env";

/**
 * جلسات مخزنة في قاعدة البيانات:
 * - الرمز العشوائي (256 بت) في كوكي httpOnly، وقاعدة البيانات تحفظ SHA-256 له فقط.
 * - مدة الجلسة 30 يومًا مع تجديد تلقائي عند الاستخدام بعد مرور 15 يومًا.
 */
export const SESSION_COOKIE = "session";
const SESSION_DAYS = 30;
const RENEW_AFTER_DAYS = 15;

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: "student" | "admin";
  gradeId: string | null;
  isActive: boolean;
};

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string } = {}) {
  const token = generateToken();
  const id = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await sql`
    insert into sessions (id, user_id, expires_at, ip, user_agent)
    values (${id}, ${userId}, ${expiresAt}, ${meta.ip ?? null}, ${meta.userAgent ?? null})
  `;
  await sql`update users set last_login_at = now() where id = ${userId}`;
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, secure: env().NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

/** التحقق من رمز الجلسة وإرجاع المستخدم (أو null) */
export async function validateSessionToken(token: string): Promise<{ user: SessionUser; sessionId: string; expiresAt: Date } | null> {
  if (!token || token.length > 100) return null;
  const id = hashToken(token);
  const rows = await sql<
    {
      session_id: string;
      expires_at: Date;
      id: string;
      email: string;
      full_name: string;
      phone: string | null;
      role: "student" | "admin";
      grade_id: string | null;
      is_active: boolean;
    }[]
  >`
    select s.id as session_id, s.expires_at, u.id, u.email, u.full_name, u.phone, u.role, u.grade_id, u.is_active
    from sessions s join users u on u.id = s.user_id
    where s.id = ${id}
  `;
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now() || !row.is_active) {
    await sql`delete from sessions where id = ${id}`;
    return null;
  }
  let expiresAt = new Date(row.expires_at);
  if (expiresAt.getTime() - Date.now() < (SESSION_DAYS - RENEW_AFTER_DAYS) * 86400_000) {
    expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
    await sql`update sessions set expires_at = ${expiresAt} where id = ${id}`;
  }
  return {
    sessionId: id,
    expiresAt,
    user: {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      phone: row.phone,
      role: row.role,
      gradeId: row.grade_id,
      isActive: row.is_active,
    },
  };
}

export async function invalidateSession(sessionId: string) {
  await sql`delete from sessions where id = ${sessionId}`;
}

export async function invalidateAllUserSessions(userId: string, exceptSessionId?: string) {
  if (exceptSessionId) {
    await sql`delete from sessions where user_id = ${userId} and id <> ${exceptSessionId}`;
  } else {
    await sql`delete from sessions where user_id = ${userId}`;
  }
}

/** الجلسة الحالية (مخزنة مؤقتًا لكل طلب) */
export const getCurrentSession = cache(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(token);
});

export async function getCurrentUser(): Promise<SessionUser | null> {
  const s = await getCurrentSession();
  return s?.user ?? null;
}
