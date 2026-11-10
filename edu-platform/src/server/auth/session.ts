import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { sql, type Db } from "../db";
import { adminTwoFactorRequired, env } from "../env";

/**
 * جلسات مخزنة في قاعدة البيانات:
 * - الرمز العشوائي (256 بت) في كوكي httpOnly، وقاعدة البيانات تحفظ SHA-256 له فقط.
 * - مدة الجلسة 30 يومًا مع تجديد تلقائي عند الاستخدام بعد مرور 15 يومًا.
 * - جلسة المدير ١٢ ساعة من لحظة الدخول، بلا تجديد.
 * - جلسة المعلم ٧ أيام من لحظة الدخول، بلا تجديد: حسابه يصل إلى أرباحه ومحتواه، وليس عليه عامل ثانٍ بعد.
 * - الطالب ٣ جلسات فعالة على الأكثر، والدخول الجديد يُخرج الأقدم.
 */
export const SESSION_COOKIE = "session";
export const SESSION_DAYS = 30;
const RENEW_AFTER_DAYS = 15;
export const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000;
export const TEACHER_SESSION_MS = 7 * 86400_000;
export const STUDENT_ACTIVE_SESSIONS = 3;

/** عمر مطلق يُحسب من وقت الدخول ولا يتجدد. الدور الذي لا يرد هنا جلسته متجددة */
const ABSOLUTE_SESSION_MS: Partial<Record<SessionUser["role"], number>> = { admin: ADMIN_SESSION_MS, teacher: TEACHER_SESSION_MS };

/** حساب موقوف لا تُفتح له جلسة، ولو أُوقف بعد فحص كلمة المرور بلحظة */
export class InactiveAccountError extends Error {
  constructor() {
    super("account is suspended");
    this.name = "InactiveAccountError";
  }
}

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: "student" | "admin" | "teacher";
  gradeId: string | null;
  isActive: boolean;
};

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

type SessionMeta = { ip?: string; userAgent?: string };
export type SecondFactorMethod = "totp" | "recovery";
type SessionOptions = { ttlMs?: number; twoFactorVerified?: boolean; twoFactorMethod?: SecondFactorMethod | null };

/**
 * إنشاء جلسة داخل معاملة قائمة. قفل صف المستخدم يجعل دخول الحساب الواحد تسلسليًا:
 * حذف الأقدم وإضافة الجديدة يظهران معًا، فلا يتجاوز الطالب الحد مهما تزامنت الطلبات.
 * no key update لا يعطل المفاتيح الخارجية (إدراج طلب أو سجل وصول للمستخدم نفسه).
 * وقت الإنشاء من clock_timestamp لا now: ترتيب «الأقدم» هو ترتيب الحصول على القفل، فلا تُطرد آخر جلسة دخلت.
 */
export async function createSessionIn(db: Db, userId: string, meta: SessionMeta = {}, options: SessionOptions = {}) {
  const [user] = await db<{ role: SessionUser["role"]; anonymized_at: Date | null; is_active: boolean }[]>`select role, anonymized_at, is_active from users where id = ${userId} for no key update`;
  // حُذفت بيانات الحساب بين فحص كلمة المرور وهذا القفل
  if (!user || user.anonymized_at) throw new Error("createSession: unknown user");
  // القفل ينتظر معاملة الإيقاف ثم يرى قيمتها: لا تولد جلسة بعد الإيقاف فتعود للعمل عند إعادة التفعيل
  if (!user.is_active) throw new InactiveAccountError();
  const token = generateToken();
  const id = hashToken(token);
  const requestedMs = options.ttlMs ?? SESSION_DAYS * 86400_000;
  const absolute = ABSOLUTE_SESSION_MS[user.role];
  const expiresAt = new Date(Date.now() + (absolute === undefined ? requestedMs : Math.min(requestedMs, absolute)));
  if (user.role === "student") {
    // الفعالة أولًا ثم الأحدث: المنتهية تقع في الذيل فتُحذف قبل أي جلسة تعمل
    await db`
      delete from sessions where id in (
        select id from sessions where user_id = ${userId}
        order by (expires_at > now()) desc, created_at desc, id desc
        offset ${STUDENT_ACTIVE_SESSIONS - 1}
      )
    `;
  }
  await db`
    insert into sessions (id, user_id, expires_at, ip, user_agent, two_factor_at, two_factor_method, created_at)
    values (${id}, ${userId}, ${expiresAt}, ${meta.ip ?? null}, ${meta.userAgent ?? null}, ${options.twoFactorVerified ? new Date() : null}, ${options.twoFactorMethod ?? null}, clock_timestamp())
  `;
  await db`update users set last_login_at = now() where id = ${userId}`;
  return { token, expiresAt };
}

export async function createSession(userId: string, meta: SessionMeta = {}, options: SessionOptions = {}) {
  return sql.begin((tx) => createSessionIn(tx, userId, meta, options));
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
export async function validateSessionToken(token: string): Promise<{ user: SessionUser; sessionId: string; expiresAt: Date; mustChangePassword: boolean; needsTwoFactorEnrolment: boolean } | null> {
  if (!token || token.length > 100) return null;
  const id = hashToken(token);
  const rows = await sql<
    {
      session_id: string;
      expires_at: Date;
      session_created_at: Date;
      two_factor_at: Date | null;
      two_factor_enabled: boolean;
      id: string;
      email: string;
      full_name: string;
      phone: string | null;
      role: "student" | "admin" | "teacher";
      grade_id: string | null;
      is_active: boolean;
      must_change_password: boolean;
    }[]
  >`
    select s.id as session_id, s.expires_at, s.created_at as session_created_at, s.two_factor_at,
      exists (select 1 from user_totp t where t.user_id = u.id and t.enabled_at is not null) as two_factor_enabled,
      u.id, u.email, u.full_name, u.phone, u.role, u.grade_id, u.is_active, u.must_change_password
    from sessions s join users u on u.id = s.user_id
    where s.id = ${id}
  `;
  const row = rows[0];
  if (!row) return null;
  const isAdmin = row.role === "admin";
  const absolute = ABSOLUTE_SESSION_MS[row.role];
  // الحد يُحسب من وقت الدخول أيضًا: جلسات المدير والمعلم الأقدم من هذا الإصدار كتبت انتهاءً بعد ٣٠ يومًا
  let expiresAt = new Date(absolute === undefined ? new Date(row.expires_at).getTime() : Math.min(new Date(row.expires_at).getTime(), new Date(row.session_created_at).getTime() + absolute));
  // جلسة مدير لم تمر بالعامل الثاني لا تعمل على حساب فعّله، مهما كان الطريق الذي فتحها
  const missingSecondFactor = isAdmin && row.two_factor_enabled && !row.two_factor_at;
  if (expiresAt.getTime() <= Date.now() || !row.is_active || missingSecondFactor) {
    await sql`delete from sessions where id = ${id}`;
    return null;
  }
  // جلسة كلمة المرور المؤقتة قصيرة عن قصد ولا تُجدَّد، ولا جلسة لها عمر مطلق
  if (absolute === undefined && !row.must_change_password && expiresAt.getTime() - Date.now() < (SESSION_DAYS - RENEW_AFTER_DAYS) * 86400_000) {
    expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
    await sql`update sessions set expires_at = ${expiresAt} where id = ${id}`;
  }
  return {
    sessionId: id,
    expiresAt,
    mustChangePassword: row.must_change_password,
    needsTwoFactorEnrolment: isAdmin && !row.two_factor_enabled && adminTwoFactorRequired(),
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

/**
 * المستخدم الحالي. جلسة كلمة المرور المؤقتة لا تُعد دخولًا: كل صفحة وإجراء وواجهة API يراها زائرًا،
 * ولا يفتحها إلا مسار /change-password الذي يقرأ getCurrentSession مباشرة.
 * وكذلك جلسة مدير لم يسجّل التحقق بخطوتين وهو إلزامي: لا يفتحها إلا مسار التسجيل.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const s = await getCurrentSession();
  if (!s || s.mustChangePassword || s.needsTwoFactorEnrolment) return null;
  return s.user;
}
