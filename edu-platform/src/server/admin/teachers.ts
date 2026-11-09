import "server-only";
import { sql, type Db } from "../db";
import { storage } from "../storage";
import { audit } from "../platform/audit";
import { hashPassword } from "../auth/password";
import { revokeEmailLinks } from "../auth/email-verification";
import { loginFailurePrefix } from "../auth/service";
import { saleLines, teacherBalance, teacherSalesSummary } from "../commerce/earnings";
import { mailIsReal, redactSecrets, sendMail } from "../platform/mailer";
import { getSettings } from "../platform/settings";
import { AdminError } from "./common";
import { enforceOwnerLimits, generateTemporaryPassword } from "./student-accounts";
import { randomSuffix } from "@/lib/utils";
import { REFUND_HOLD_DAYS } from "@/lib/teacher-terms";

/**
 * إدارة المعلمين (للمالك فقط — الاستدعاءات تأتي من إجراءات adminAction):
 *  - managed      : ملف عام يديره المالك ويرفع المحتوى نيابةً عنه، بلا حساب دخول
 *  - self_managed : حساب دخول بدور teacher مرتبط بالملف
 * التحويل بين الوضعين لا يمس المحتوى أو المبيعات أو صلاحيات الطلاب (كلها مرتبطة بـ teachers.id).
 */

export type TeacherRow = {
  id: string;
  slug: string;
  display_name: string;
  headline: string;
  bio: string;
  photo_key: string | null;
  mode: "managed" | "self_managed";
  user_id: string | null;
  can_upload: boolean;
  is_published: boolean;
  revenue_share_bps: number | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
  account_email: string | null;
  account_active: boolean | null;
  account_last_login: Date | null;
};

export type TeacherListRow = TeacherRow & { products: number; published_products: number; paid_items: number; paid_gross: string; balance: number };

export async function listTeachersAdmin(q?: string): Promise<TeacherListRow[]> {
  const rows = await sql<(TeacherRow & { products: number; published_products: number; paid_items: number; paid_gross: string; earned: string; paid_out: string })[]>`
    select t.*, u.email as account_email, u.is_active as account_active, u.last_login_at as account_last_login,
      (select count(*)::int from products p where p.teacher_id = t.id and p.status <> 'archived') as products,
      (select count(*)::int from products p where p.teacher_id = t.id and p.status = 'published') as published_products,
      (select count(*)::int from ${saleLines()} l join orders o on o.id = l.order_id where l.teacher_id = t.id and o.status = 'paid' and not o.is_test) as paid_items,
      (select coalesce(sum(l.gross_fils), 0)::bigint from ${saleLines()} l join orders o on o.id = l.order_id where l.teacher_id = t.id and o.status = 'paid' and not o.is_test) as paid_gross,
      (select coalesce(sum(te.teacher_fils), 0)::bigint from teacher_earnings te where te.teacher_id = t.id and te.status = 'active' and not te.is_test
        and te.created_at <= now() - make_interval(days => ${REFUND_HOLD_DAYS})) as earned,
      (select coalesce(sum(tp.amount_fils), 0)::bigint from teacher_payouts tp where tp.teacher_id = t.id and tp.voided_at is null) as paid_out
    from teachers t left join users u on u.id = t.user_id
    where true ${q ? sql`and (t.display_name ilike ${"%" + q + "%"} or t.slug ilike ${"%" + q + "%"} or u.email ilike ${"%" + q + "%"})` : sql``}
    order by t.sort_order, t.display_name
  `;
  return rows.map((r) => ({ ...r, balance: Number(r.earned) - Number(r.paid_out) }));
}

export async function getTeacherAdmin(id: string): Promise<TeacherRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [t] = await sql<TeacherRow[]>`
    select t.*, u.email as account_email, u.is_active as account_active, u.last_login_at as account_last_login
    from teachers t left join users u on u.id = t.user_id where t.id = ${id}
  `;
  return t ?? null;
}

export async function teacherSubjectIds(teacherId: string): Promise<string[]> {
  const rows = await sql<{ subject_id: string }[]>`select subject_id from teacher_subjects where teacher_id = ${teacherId}`;
  return rows.map((r) => r.subject_id);
}

export async function teacherSubjectsLabeled(teacherId: string) {
  return sql<{ subject_id: string; subject_name: string; grade_name: string }[]>`
    select s.id as subject_id, s.name as subject_name, g.name as grade_name
    from teacher_subjects ts join subjects s on s.id = ts.subject_id join grades g on g.id = s.grade_id
    where ts.teacher_id = ${teacherId} order by g.level, s.sort_order
  `;
}

export type TeacherInput = {
  slug?: string;
  displayName: string;
  headline: string;
  bio: string;
  isPublished: boolean;
  canUpload: boolean;
  revenueShareBps: number | null;
  sortOrder: number;
  subjectIds: string[];
};

async function uniqueTeacherSlug(base: string): Promise<string> {
  const clean = base
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  let slug = clean && /^[a-z0-9]/.test(clean) ? clean : `teacher-${randomSuffix(6)}`;
  for (let i = 0; i < 5; i++) {
    const [exists] = await sql`select 1 from teachers where slug = ${slug}`;
    if (!exists) return slug;
    slug = `${clean || "teacher"}-${randomSuffix(4)}`;
  }
  return `teacher-${randomSuffix(8)}`;
}

async function writeSubjects(teacherId: string, subjectIds: string[]) {
  const valid = subjectIds.length
    ? (await sql<{ id: string }[]>`select id from subjects where id = any(${subjectIds}::uuid[])`).map((r) => r.id)
    : [];
  await sql.begin(async (tx) => {
    await tx`delete from teacher_subjects where teacher_id = ${teacherId}`;
    for (const sid of valid) await tx`insert into teacher_subjects (teacher_id, subject_id) values (${teacherId}, ${sid}) on conflict do nothing`;
  });
}

export async function createTeacher(input: TeacherInput, ownerId: string, ip?: string): Promise<string> {
  const slug = await uniqueTeacherSlug(input.slug || "");
  const [row] = await sql<{ id: string }[]>`
    insert into teachers (slug, display_name, headline, bio, is_published, can_upload, revenue_share_bps, sort_order, created_by, mode)
    values (${slug}, ${input.displayName}, ${input.headline}, ${input.bio}, ${input.isPublished}, ${input.canUpload},
            ${input.revenueShareBps}, ${input.sortOrder}, ${ownerId}, 'managed')
    returning id
  `;
  await writeSubjects(row.id, input.subjectIds);
  await audit({ actorId: ownerId, action: "teacher.create", entityType: "teacher", entityId: row.id, metadata: { displayName: input.displayName, slug, revenueShareBps: input.revenueShareBps }, ip });
  return row.id;
}

export async function updateTeacher(id: string, input: TeacherInput, ownerId: string, ip?: string) {
  const current = await getTeacherAdmin(id);
  if (!current) throw new AdminError("المعلم غير موجود");
  let slug = current.slug;
  if (input.slug && input.slug !== current.slug) {
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(input.slug)) throw new AdminError("الرابط: أحرف إنجليزية صغيرة وأرقام وشرطات فقط", { slug: "رابط غير صالح" });
    const [exists] = await sql`select 1 from teachers where slug = ${input.slug} and id <> ${id}`;
    if (exists) throw new AdminError("الرابط مستخدم لمعلم آخر", { slug: "اختر رابطًا آخر" });
    slug = input.slug;
  }
  if (input.revenueShareBps === null && current.revenue_share_bps !== null) {
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from products where teacher_id = ${id} and status = 'published' and not is_free`;
    if (n > 0) throw new AdminError("للمعلم منتجات منشورة مدفوعة، ولا تُحذف نسبته حتى لا تُسجَّل مبيعاتها دون حقه. أخفِ منتجاته أولًا أو أبقِ النسبة", { revenueShare: "النسبة مطلوبة" });
  }
  await sql`
    update teachers set slug = ${slug}, display_name = ${input.displayName}, headline = ${input.headline}, bio = ${input.bio},
      is_published = ${input.isPublished}, can_upload = ${input.canUpload}, revenue_share_bps = ${input.revenueShareBps},
      sort_order = ${input.sortOrder}
    where id = ${id}
  `;
  await writeSubjects(id, input.subjectIds);
  const changes: Record<string, unknown> = {};
  if (current.revenue_share_bps !== input.revenueShareBps) changes.revenueShareBps = { from: current.revenue_share_bps, to: input.revenueShareBps };
  if (current.can_upload !== input.canUpload) changes.canUpload = input.canUpload;
  if (current.is_published !== input.isPublished) changes.isPublished = input.isPublished;
  if (current.display_name !== input.displayName) changes.displayName = { from: current.display_name, to: input.displayName };
  if (current.slug !== slug) changes.slug = { from: current.slug, to: slug };
  await audit({
    actorId: ownerId,
    action: changes.revenueShareBps ? "teacher.share_change" : "teacher.update",
    entityType: "teacher",
    entityId: id,
    metadata: changes,
    ip,
  });
}

/** مدة الكلمة المؤقتة، كما في استعادة الطالب بيد المالك */
const TEMP_PASSWORD_HOURS = 24;

/** كل ما كان صالحًا قبل الكلمة المؤقتة يسقط معها: الجلسات والروابط ومحاولات الدخول المحتسبة */
async function closeOldAccess(tx: Db, userId: string, email: string) {
  await tx`update password_reset_tokens set used_at = now() where user_id = ${userId} and used_at is null`;
  await revokeEmailLinks(tx, userId);
  await tx`delete from sessions where user_id = ${userId}`;
  await tx`delete from rate_limits where starts_with(key, ${loginFailurePrefix(email)})`;
}

const LINK_EXISTING_REFUSED = "هذا البريد مسجل لحساب موجود، فلن تتم ترقيته دون موافقتك. إن كان هذا حساب المعلم فعلًا، ضع علامة على خانة الموافقة ثم أعد المحاولة.";

export type EnabledTeacherAccount = { email: string; password: string; linkedExisting: boolean; noticeSent: boolean };

/**
 * تفعيل حساب دخول للمعلم (managed → self_managed). قرار D17: كلمة مؤقتة تُعرض للمالك مرة واحدة،
 * تعمل ٢٤ ساعة ومرة واحدة، ولا تفتح إلا صفحة اختيار كلمة جديدة.
 *  - بريد جديد: إنشاء حساب بدور teacher.
 *  - بريد موجود (طالب): لا يُرقّى إلا بموافقة صريحة من المالك. تُستبدل كلمة مروره، فمن كان يعرفها أو
 *    كان هو من سجّل هذا البريد لا يدخل لوحة المعلم بها، وتُغلق جلساته، ويصله إشعار بالبريد.
 *    حساب موقوف يبقى موقوفًا: الإيقاف قرار منفصل.
 *  - حساب المالك والحساب المحذوف لا يُستخدمان.
 */
export async function enableTeacherAccount(
  teacherId: string,
  input: { email: string; fullName: string; confirmLinkExisting?: boolean },
  ownerId: string,
  ip?: string,
): Promise<EnabledTeacherAccount> {
  const t = await getTeacherAdmin(teacherId);
  if (!t) throw new AdminError("المعلم غير موجود");
  if (t.mode === "self_managed" && t.user_id) throw new AdminError("الحساب مفعّل مسبقًا");
  const email = input.email.trim().toLowerCase();
  await enforceOwnerLimits("owner-teacher-enable", ownerId, email);
  const password = generateTemporaryPassword();
  const hash = await hashPassword(password);

  const result = await sql.begin(async (tx) => {
    const [existing] = await tx<{ id: string; role: string; anonymized_at: Date | null }[]>`select id, role, anonymized_at from users where email = ${email} for update`;
    let userId: string;
    if (existing) {
      if (existing.role === "admin") throw new AdminError("لا يمكن ربط حساب المالك بملف معلم", { email: "استخدم بريدًا آخر" });
      if (existing.anonymized_at) throw new AdminError("حُذفت بيانات هذا الحساب، فلا يمكن استخدامه.", { email: "استخدم بريدًا آخر" });
      const [other] = await tx`select 1 from teachers where user_id = ${existing.id} and id <> ${teacherId}`;
      if (other) throw new AdminError("هذا البريد مرتبط بمعلم آخر", { email: "استخدم بريدًا آخر" });
      if (!input.confirmLinkExisting) throw new AdminError(LINK_EXISTING_REFUSED, { email: "هذا البريد مسجل لحساب موجود" });
      await tx`
        update users set role = 'teacher', password_hash = ${hash}, must_change_password = true,
          temp_password_expires_at = now() + make_interval(hours => ${TEMP_PASSWORD_HOURS})
        where id = ${existing.id}
      `;
      await closeOldAccess(tx, existing.id, email);
      userId = existing.id;
    } else {
      const [u] = await tx<{ id: string }[]>`
        insert into users (email, password_hash, full_name, role, email_verified_at, must_change_password, temp_password_expires_at)
        values (${email}, ${hash}, ${input.fullName.trim() || t.display_name}, 'teacher', now(), true, now() + make_interval(hours => ${TEMP_PASSWORD_HOURS}))
        returning id
      `;
      userId = u.id;
    }
    await tx`update teachers set mode = 'self_managed', user_id = ${userId} where id = ${teacherId}`;
    await audit({ actorId: ownerId, action: "teacher.mode_self_managed", entityType: "teacher", entityId: teacherId, metadata: { userId, linkedExisting: Boolean(existing), validHours: TEMP_PASSWORD_HOURS }, ip }, tx);
    return { linkedExisting: Boolean(existing) };
  });

  const noticeSent = result.linkedExisting ? await tellUpgradedAccount(email) : false;
  return { email, password, linkedExisting: result.linkedExisting, noticeSent };
}

/** لا كلمة مرور في هذه الرسالة، ولا ينتظرها شيء: المالك يعرف من النتيجة إن لم تخرج */
async function tellUpgradedAccount(email: string): Promise<boolean> {
  if (!mailIsReal()) return false;
  try {
    const settings = await getSettings();
    return await sendMail({
      to: email,
      template: "teacher_upgrade_notice",
      subject: `أصبح حسابك حساب معلم، ${settings.site_name}`,
      text: `حوّلت إدارة المنصة هذا الحساب إلى حساب معلم، واستبدلت كلمة مروره بكلمة مؤقتة، وتم تسجيل خروجك من كل الأجهزة.\n\nستعطيك الإدارة الكلمة المؤقتة، وعند أول دخول تختار كلمة مرور جديدة.\n\nإذا لم تتوقع ذلك فتواصل معنا.\n\n${settings.site_name}`,
    });
  } catch (err) {
    console.error("[teachers] upgrade notice failed", redactSecrets(err instanceof Error ? err.message : String(err)));
    return false;
  }
}

/** إعادة تعيين كلمة مرور حساب المعلم: كلمة مؤقتة تُعرض مرة واحدة ويلزم تغييرها عند أول دخول */
export async function resetTeacherPassword(teacherId: string, ownerId: string, ip?: string): Promise<string> {
  const t = await getTeacherAdmin(teacherId);
  if (!t?.user_id) throw new AdminError("لا يوجد حساب دخول لهذا المعلم");
  await enforceOwnerLimits("owner-teacher-reset", ownerId, t.user_id);
  const password = generateTemporaryPassword();
  const hash = await hashPassword(password);
  await sql.begin(async (tx) => {
    const [u] = await tx<{ email: string }[]>`
      update users set password_hash = ${hash}, must_change_password = true, temp_password_expires_at = now() + make_interval(hours => ${TEMP_PASSWORD_HOURS})
      where id = ${t.user_id} and role = 'teacher' and anonymized_at is null
      returning email
    `;
    if (!u) throw new AdminError("لا يوجد حساب دخول لهذا المعلم");
    await closeOldAccess(tx, t.user_id!, u.email);
    await audit({ actorId: ownerId, action: "teacher.password_reset", entityType: "teacher", entityId: teacherId, metadata: { userId: t.user_id, validHours: TEMP_PASSWORD_HOURS }, ip }, tx);
  });
  return password;
}

/** التحويل إلى «يديره المالك»: إلغاء الدخول دون المساس بالمحتوى أو المبيعات */
export async function switchToManaged(teacherId: string, ownerId: string, ip?: string) {
  const t = await getTeacherAdmin(teacherId);
  if (!t) throw new AdminError("المعلم غير موجود");
  if (t.mode === "managed" && !t.user_id) return;
  await sql.begin(async (tx) => {
    if (t.user_id) {
      await tx`update users set role = 'student' where id = ${t.user_id} and role = 'teacher'`;
      await tx`delete from sessions where user_id = ${t.user_id}`;
    }
    await tx`update teachers set mode = 'managed', user_id = null where id = ${teacherId}`;
    await audit({ actorId: ownerId, action: "teacher.mode_managed", entityType: "teacher", entityId: teacherId, metadata: { previousUserId: t.user_id }, ip }, tx);
  });
}

/** تعطيل/تفعيل حساب دخول المعلم (المحتوى يبقى كما هو) */
export async function setTeacherAccountActive(teacherId: string, active: boolean, ownerId: string, reason: string, ip?: string) {
  const t = await getTeacherAdmin(teacherId);
  if (!t?.user_id) throw new AdminError("لا يوجد حساب دخول لهذا المعلم");
  await sql`update users set is_active = ${active} where id = ${t.user_id} and role = 'teacher'`;
  if (!active) await sql`delete from sessions where user_id = ${t.user_id}`;
  await audit({ actorId: ownerId, action: active ? "teacher.account_enable" : "teacher.account_disable", entityType: "teacher", entityId: teacherId, reason, ip });
}

export async function setTeacherCanUpload(teacherId: string, canUpload: boolean, ownerId: string, ip?: string) {
  await sql`update teachers set can_upload = ${canUpload} where id = ${teacherId}`;
  await audit({ actorId: ownerId, action: canUpload ? "teacher.upload_enable" : "teacher.upload_disable", entityType: "teacher", entityId: teacherId, ip });
}

/** للمالك: صورة المعلم تتغير مباشرة. تعديلات المعلم نفسه تمر من teacher-profile-review */
export async function setTeacherPhoto(teacherId: string, key: string | null, actorId: string) {
  const [t] = await sql<{ photo_key: string | null }[]>`select photo_key from teachers where id = ${teacherId}`;
  if (!t) throw new AdminError("المعلم غير موجود");
  await sql`update teachers set photo_key = ${key} where id = ${teacherId}`;
  if (t.photo_key && t.photo_key !== key) await storage().remove("public", t.photo_key).catch(() => {});
  await audit({ actorId, action: key ? "teacher.photo_upload" : "teacher.photo_remove", entityType: "teacher", entityId: teacherId });
}

/** إحصاءات المعلم (للوحة المعلم نفسه — بدون بيانات الطلاب) */
export async function teacherDashboard(teacherId: string) {
  const [counts] = await sql<{ draft: number; in_review: number; published: number; hidden: number }[]>`
    select
      count(*) filter (where status = 'draft')::int as draft,
      count(*) filter (where status = 'in_review')::int as in_review,
      count(*) filter (where status = 'published')::int as published,
      count(*) filter (where status in ('hidden', 'archived'))::int as hidden
    from products where teacher_id = ${teacherId}
  `;
  const [summary, balance, latest, returned] = await Promise.all([
    teacherSalesSummary(teacherId),
    teacherBalance(teacherId),
    sql<{ order_number: string; paid_at: Date; title: string; unit_price_fils: number; status: string }[]>`
      select o.number as order_number, o.paid_at, l.title, l.gross_fils as unit_price_fils, o.status
      from ${saleLines()} l join orders o on o.id = l.order_id
      where l.teacher_id = ${teacherId} and o.status in ('paid', 'refunded') and not o.is_test
      order by o.paid_at desc limit 10
    `,
    sql<{ id: string; title: string; review_note: string | null }[]>`
      select id, title, review_note from products where teacher_id = ${teacherId} and status = 'draft' and review_note is not null
      order by updated_at desc limit 5
    `,
  ]);
  return { counts, summary, balance, latest, returned };
}

/** المواد مع صفوفها (لنموذج المعلم) */
export async function subjectOptions() {
  return sql<{ id: string; name: string; grade_name: string; grade_level: number }[]>`
    select s.id, s.name, g.name as grade_name, g.level as grade_level
    from subjects s join grades g on g.id = s.grade_id
    order by g.level, s.sort_order, s.name
  `;
}
