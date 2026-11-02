import "server-only";
import { randomBytes } from "node:crypto";
import { sql } from "../db";
import { storage } from "../storage";
import { audit } from "../platform/audit";
import { hashPassword } from "../auth/password";
import { teacherBalance, teacherSalesSummary } from "../commerce/earnings";
import { AdminError } from "./common";
import { randomSuffix } from "@/lib/utils";

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
      (select count(*)::int from order_items oi join orders o on o.id = oi.order_id where oi.teacher_id = t.id and o.status = 'paid' and not o.is_test) as paid_items,
      (select coalesce(sum(oi.unit_price_fils), 0)::bigint from order_items oi join orders o on o.id = oi.order_id where oi.teacher_id = t.id and o.status = 'paid' and not o.is_test) as paid_gross,
      (select coalesce(sum(te.teacher_fils), 0)::bigint from teacher_earnings te where te.teacher_id = t.id and te.status = 'active' and not te.is_test) as earned,
      (select coalesce(sum(tp.amount_fils), 0)::bigint from teacher_payouts tp where tp.teacher_id = t.id) as paid_out
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

/**
 * تفعيل حساب دخول للمعلم (managed → self_managed):
 *  - بريد جديد: إنشاء حساب بدور teacher وكلمة مرور قوية تُعرض مرة واحدة
 *  - بريد موجود (طالب): ترقيته لدور teacher وإلغاء جلساته؛ حساب المالك لا يُستخدم
 */
export async function enableTeacherAccount(
  teacherId: string,
  input: { email: string; fullName: string },
  ownerId: string,
  ip?: string,
): Promise<{ email: string; password: string | null; linkedExisting: boolean }> {
  const t = await getTeacherAdmin(teacherId);
  if (!t) throw new AdminError("المعلم غير موجود");
  if (t.mode === "self_managed" && t.user_id) throw new AdminError("الحساب مفعّل مسبقًا");
  const email = input.email.trim().toLowerCase();
  return sql.begin(async (tx) => {
    const [existing] = await tx<{ id: string; role: string }[]>`select id, role from users where email = ${email} for update`;
    let userId: string;
    let password: string | null = null;
    let linkedExisting = false;
    if (existing) {
      if (existing.role === "admin") throw new AdminError("لا يمكن ربط حساب المالك بملف معلم", { email: "استخدم بريدًا آخر" });
      const [other] = await tx`select 1 from teachers where user_id = ${existing.id} and id <> ${teacherId}`;
      if (other) throw new AdminError("هذا البريد مرتبط بمعلم آخر", { email: "استخدم بريدًا آخر" });
      await tx`update users set role = 'teacher', is_active = true where id = ${existing.id}`;
      await tx`delete from sessions where user_id = ${existing.id}`;
      userId = existing.id;
      linkedExisting = true;
    } else {
      password = randomBytes(12).toString("base64url");
      const hash = await hashPassword(password);
      const [u] = await tx<{ id: string }[]>`
        insert into users (email, password_hash, full_name, role, email_verified_at)
        values (${email}, ${hash}, ${input.fullName.trim() || t.display_name}, 'teacher', now())
        returning id
      `;
      userId = u.id;
    }
    await tx`update teachers set mode = 'self_managed', user_id = ${userId} where id = ${teacherId}`;
    await audit(
      { actorId: ownerId, action: "teacher.mode_self_managed", entityType: "teacher", entityId: teacherId, metadata: { userId, email, linkedExisting }, ip },
      tx,
    );
    return { email, password, linkedExisting };
  });
}

/** إعادة تعيين كلمة مرور حساب المعلم (تُعرض مرة واحدة) */
export async function resetTeacherPassword(teacherId: string, ownerId: string, ip?: string): Promise<string> {
  const t = await getTeacherAdmin(teacherId);
  if (!t?.user_id) throw new AdminError("لا يوجد حساب دخول لهذا المعلم");
  const password = randomBytes(12).toString("base64url");
  await sql`update users set password_hash = ${await hashPassword(password)} where id = ${t.user_id} and role = 'teacher'`;
  await sql`delete from sessions where user_id = ${t.user_id}`;
  await audit({ actorId: ownerId, action: "teacher.password_reset", entityType: "teacher", entityId: teacherId, ip });
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

/** المعلم يحدّث ملفه العام (النبذة والعنوان والصورة فقط) */
export async function updateOwnTeacherProfile(teacherId: string, userId: string, input: { headline: string; bio: string }) {
  await sql`update teachers set headline = ${input.headline}, bio = ${input.bio} where id = ${teacherId} and user_id = ${userId}`;
  await audit({ actorId: userId, action: "teacher.profile_update", entityType: "teacher", entityId: teacherId });
}

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
      select o.number as order_number, o.paid_at, oi.title, oi.unit_price_fils, o.status
      from order_items oi join orders o on o.id = oi.order_id
      where oi.teacher_id = ${teacherId} and o.status in ('paid', 'refunded') and not o.is_test
      order by o.paid_at desc limit 10
    `,
    sql<{ id: string; title: string; review_note: string | null }[]>`
      select id, title, review_note from products where teacher_id = ${teacherId} and status = 'draft' and review_note is not null
      order by updated_at desc limit 5
    `,
  ]);
  return { counts, summary, balance, latest, returned };
}
