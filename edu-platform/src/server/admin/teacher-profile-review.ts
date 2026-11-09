import "server-only";
import { sql, type Db } from "../db";
import { storage } from "../storage";
import { audit } from "../platform/audit";
import type { Actor } from "../auth/permissions";
import { AdminError } from "./common";

/**
 * مراجعة ملف المعلم العام: ما يكتبه المعلم أو يرفعه يبقى هنا حتى يوافق المالك، والصفحة العامة لا تقرأ هذا الجدول.
 * تعديلات المالك نفسه تكتب في teachers مباشرة. كل دالة كتابة تقفل صف المعلم أولًا فلا يتشابك إرسال مع اعتماد.
 */
type TeacherActor = Extract<Actor, { kind: "teacher" }>;
type PhotoAction = "none" | "replace" | "remove";

export type ProfileChange = {
  id: string;
  teacher_id: string;
  headline: string | null;
  bio: string | null;
  photo_action: PhotoAction;
  photo_key: string | null;
  status: "pending" | "approved" | "rejected";
  submitted_at: Date;
  reviewed_at: Date | null;
  review_note: string | null;
};

type Live = { headline: string; bio: string; photo_key: string | null };
type Next = { headline: string | null; bio: string | null; photo_action: PhotoAction; photo_key: string | null };

async function lockTeacher(tx: Db, teacherId: string): Promise<Live> {
  const [t] = await tx<Live[]>`select headline, bio, photo_key from teachers where id = ${teacherId} for update`;
  if (!t) throw new AdminError("المعلم غير موجود");
  return t;
}

const pendingOf = async (tx: Db, teacherId: string) => (await tx<ProfileChange[]>`select * from teacher_profile_changes where teacher_id = ${teacherId} and status = 'pending'`)[0] ?? null;

/**
 * يستبدل التعديل المعلق، ولا يكتب شيئًا إن لم يبق فرق عن المعتمد. true تعني أن هناك ما ينتظر الموافقة.
 * كل إرسال صف جديد بمعرّف جديد: موافقة فُتحت على نص سابق تُرفض، فلا ينشر المالك ما لم يره.
 */
async function storeProposal(tx: Db, actor: TeacherActor, pending: ProfileChange | null, next: Next, what: string): Promise<boolean> {
  if (pending) await tx`delete from teacher_profile_changes where id = ${pending.id}`;
  if (next.headline === null && next.bio === null && next.photo_action === "none") return false;
  await tx`
    insert into teacher_profile_changes (teacher_id, headline, bio, photo_action, photo_key, submitted_by)
    values (${actor.teacherId}, ${next.headline}, ${next.bio}, ${next.photo_action}, ${next.photo_key}, ${actor.userId})
  `;
  await audit({ actorId: actor.userId, action: "teacher.profile_propose", entityType: "teacher", entityId: actor.teacherId, metadata: { what } }, tx);
  return true;
}

/** العنوان والنبذة: ما يساوي المعتمد لا يُعد تعديلًا */
export async function proposeTeacherText(actor: TeacherActor, input: { headline: string; bio: string }): Promise<boolean> {
  return sql.begin(async (tx) => {
    const live = await lockTeacher(tx, actor.teacherId);
    const pending = await pendingOf(tx, actor.teacherId);
    return storeProposal(
      tx,
      actor,
      pending,
      {
        headline: input.headline === live.headline ? null : input.headline,
        bio: input.bio === live.bio ? null : input.bio,
        photo_action: pending?.photo_action ?? "none",
        photo_key: pending?.photo_key ?? null,
      },
      "text",
    );
  });
}

/** الصورة: مفتاح جديد للاستبدال، و null للإزالة. صورة معلقة استُبدلت لا يبقى ملفها في التخزين */
export async function proposeTeacherPhoto(actor: TeacherActor, key: string | null): Promise<PhotoAction> {
  let orphan: string | null = null;
  const result = await sql.begin(async (tx) => {
    const live = await lockTeacher(tx, actor.teacherId);
    const pending = await pendingOf(tx, actor.teacherId);
    if (pending?.photo_key && pending.photo_key !== key) orphan = pending.photo_key;
    const photo_action: PhotoAction = key ? "replace" : live.photo_key ? "remove" : "none";
    await storeProposal(tx, actor, pending, { headline: pending?.headline ?? null, bio: pending?.bio ?? null, photo_action, photo_key: key }, "photo");
    return photo_action;
  });
  if (orphan) await storage().remove("public", orphan).catch(() => {});
  return result;
}

const teacherIdOf = async (id: string) => (await sql<{ teacher_id: string }[]>`select teacher_id from teacher_profile_changes where id = ${id}`)[0]?.teacher_id ?? null;
const ALREADY_HANDLED = "تغيّر هذا التعديل أو عولج مسبقًا. حدّث الصفحة وراجعه من جديد";

/** الموافقة: يطبَّق التعديل مرة واحدة، والملف القديم يُحذف بعد نجاح المعاملة */
export async function approveProfileChange(id: string, ownerId: string, ip?: string): Promise<string> {
  const teacherId = await teacherIdOf(id);
  if (!teacherId) throw new AdminError(ALREADY_HANDLED);
  const stale = await sql.begin(async (tx) => {
    const live = await lockTeacher(tx, teacherId);
    const [c] = await tx<ProfileChange[]>`update teacher_profile_changes set status = 'approved', reviewed_by = ${ownerId}, reviewed_at = now() where id = ${id} and status = 'pending' returning *`;
    if (!c) throw new AdminError(ALREADY_HANDLED);
    const photoKey = c.photo_action === "replace" ? c.photo_key : c.photo_action === "remove" ? null : live.photo_key;
    await tx`update teachers set headline = ${c.headline ?? live.headline}, bio = ${c.bio ?? live.bio}, photo_key = ${photoKey} where id = ${teacherId}`;
    await audit(
      {
        actorId: ownerId,
        action: "teacher.profile_approve",
        entityType: "teacher",
        entityId: teacherId,
        metadata: { changeId: id, headline: c.headline !== null, bio: c.bio !== null, photo: c.photo_action },
        ip,
      },
      tx,
    );
    return live.photo_key && live.photo_key !== photoKey ? live.photo_key : null;
  });
  if (stale) await storage().remove("public", stale).catch(() => {});
  return teacherId;
}

export async function rejectProfileChange(id: string, note: string, ownerId: string, ip?: string): Promise<string> {
  const reason = note.trim().slice(0, 500);
  if (!reason) throw new AdminError("اكتب سبب الرفض ليعرف المعلم ما يعدّله");
  const teacherId = await teacherIdOf(id);
  if (!teacherId) throw new AdminError(ALREADY_HANDLED);
  const unused = await sql.begin(async (tx) => {
    await lockTeacher(tx, teacherId);
    const [c] = await tx<ProfileChange[]>`update teacher_profile_changes set status = 'rejected', review_note = ${reason}, reviewed_by = ${ownerId}, reviewed_at = now() where id = ${id} and status = 'pending' returning *`;
    if (!c) throw new AdminError(ALREADY_HANDLED);
    await audit({ actorId: ownerId, action: "teacher.profile_reject", entityType: "teacher", entityId: teacherId, reason, metadata: { changeId: id }, ip }, tx);
    return c.photo_key;
  });
  if (unused) await storage().remove("public", unused).catch(() => {});
  return teacherId;
}

/** حالة ملف المعلم له: التعديل المعلق إن وجد، وإلا سبب آخر رفض إن كان الأحدث */
export async function teacherProfileState(teacherId: string, db: Db = sql): Promise<{ pending: ProfileChange | null; rejected: ProfileChange | null }> {
  const [last] = await db<ProfileChange[]>`select * from teacher_profile_changes where teacher_id = ${teacherId} order by submitted_at desc, reviewed_at desc nulls first limit 1`;
  return { pending: last?.status === "pending" ? last : null, rejected: last?.status === "rejected" ? last : null };
}

export type PendingProfileChange = ProfileChange & { display_name: string; slug: string; current_headline: string; current_bio: string; current_photo_key: string | null; submitted_by_name: string | null };

export async function listPendingProfileChanges(db: Db = sql) {
  return db<PendingProfileChange[]>`
    select c.*, t.display_name, t.slug, t.headline as current_headline, t.bio as current_bio, t.photo_key as current_photo_key, u.full_name as submitted_by_name
    from teacher_profile_changes c join teachers t on t.id = c.teacher_id left join users u on u.id = c.submitted_by
    where c.status = 'pending'
    order by c.submitted_at
  `;
}

export async function pendingProfileChangesCount(db: Db = sql): Promise<number> {
  const [{ n }] = await db<{ n: number }[]>`select count(*)::int as n from teacher_profile_changes where status = 'pending'`;
  return n;
}
