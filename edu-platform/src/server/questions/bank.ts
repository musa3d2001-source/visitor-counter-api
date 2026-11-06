import "server-only";
import { createHash } from "node:crypto";
import { sql, type Db } from "../db";
import { audit } from "../platform/audit";
import { AdminError } from "../admin/common";
import { PermissionError, TEACHER_EDITABLE_STATUSES, type Actor } from "../auth/permissions";
import { teacherSubjectIds } from "../admin/teachers";
import { fieldErrors } from "@/lib/validation";
import { ar } from "@/lib/design";
import { lessonContext, type LessonContext } from "./curriculum";
import {
  EDITABLE_SOURCE_KINDS,
  contentFingerprintSource,
  formatReference,
  isBannedChoice,
  questionInputSchema,
  type QuestionInput,
  type QuestionLang,
  type QuestionStatus,
  type QuestionType,
  type SourceKind,
} from "./rules";

/**
 * بنك الأسئلة: سير الاعتماد ونطاق المعلم والنسخ، على نمط src/server/admin/products.ts (دون تعديله).
 *  - المعلم يرى ويعدّل أسئلته فقط، وفي مواده (teacher_subjects) فقط، وفي المسودة فقط؛ سؤال غيره «غير موجود».
 *  - المالك يراجع ويعتمد ويعيد بملاحظة، وكل إجراء بـ audit().
 *  - المنشور لا يُعدَّل: «نسخة معدّلة» مسودة جديدة (revision_of) تحل محله عند اعتمادها، والقديم يُؤرشف.
 *  - ما له محاولات لا يُحذف بل يُؤرشف.
 */

const NOT_FOUND = "السؤال غير موجود";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function contentHash(q: { type: QuestionType; lang: QuestionLang; stem: string; choices: { text: string }[] }): string {
  return createHash("sha256").update(contentFingerprintSource(q)).digest("hex");
}

/* ───────────── النطاق ───────────── */

export type ScopedQuestion = { id: string; teacher_id: string | null; status: QuestionStatus; root_id: string; revision_of: string | null; lesson_id: string; subject_id: string };

export async function assertQuestionAccess(actor: Actor, id: string, need: "view" | "edit", db: Db = sql): Promise<ScopedQuestion> {
  if (!UUID.test(id)) throw new PermissionError(NOT_FOUND);
  const [q] = await db<ScopedQuestion[]>`
    select q.id, q.teacher_id, q.status, q.root_id, q.revision_of, q.lesson_id, t.subject_id
    from questions q
    join curriculum_lessons l on l.id = q.lesson_id
    join curriculum_units u on u.id = l.unit_id
    join textbooks t on t.id = u.textbook_id
    where q.id = ${id}
  `;
  if (!q) throw new PermissionError(NOT_FOUND);
  if (actor.kind === "owner") return q;
  // المعلم لا يرى وجود أسئلة غيره (الرسالة نفسها)
  if (q.teacher_id !== actor.teacherId) throw new PermissionError(NOT_FOUND);
  if (need === "view") return q;
  if (!(TEACHER_EDITABLE_STATUSES as readonly string[]).includes(q.status)) {
    throw new PermissionError(
      q.status === "in_review" ? "السؤال قيد المراجعة ولا يمكن تعديله الآن" : q.status === "published" ? "السؤال منشور: أنشئ نسخة معدّلة منه" : "السؤال مؤرشف ولا يمكن تعديله",
    );
  }
  if (!actor.canUpload) throw new PermissionError("صلاحية إضافة المحتوى موقوفة لحسابك حاليًا");
  const subjects = await teacherSubjectIds(actor.teacherId);
  if (!subjects.includes(q.subject_id)) throw new PermissionError("هذه المادة لم تعد من موادك");
  return q;
}

async function assertLessonAllowed(actor: Actor, lessonId: string, db: Db): Promise<LessonContext> {
  const ctx = await lessonContext(lessonId, db);
  if (!ctx) throw new AdminError("راجع الحقول المظللة", { lessonId: "اختر الدرس" });
  if (!ctx.textbook_current) throw new AdminError("راجع الحقول المظللة", { lessonId: "هذا الكتاب ليس الطبعة الحالية" });
  if (actor.kind === "teacher") {
    // على اتصال المعاملة نفسه: استدعاء sql العام داخل sql.begin يحجز اتصالًا ثانيًا وقد يستنفد المجمّع
    const [assigned] = await db`select 1 from teacher_subjects where teacher_id = ${actor.teacherId} and subject_id = ${ctx.subject_id}`;
    if (!assigned) throw new AdminError("راجع الحقول المظللة", { lessonId: "هذا الدرس ليس من موادك" });
  }
  return ctx;
}

function parseQuestion(input: unknown, opts: { allowDemo?: boolean } = {}): QuestionInput {
  const r = questionInputSchema.safeParse(input);
  if (!r.success) throw new AdminError("راجع الحقول المظللة", fieldErrors(r.error));
  if (!opts.allowDemo && !(EDITABLE_SOURCE_KINDS as readonly SourceKind[]).includes(r.data.sourceKind)) {
    throw new AdminError("راجع الحقول المظللة", { sourceKind: "اختر مصدر السؤال" });
  }
  return r.data;
}

function assertPageInLesson(page: number, ctx: LessonContext) {
  if (page < ctx.page_start || page > ctx.page_end) {
    throw new AdminError("راجع الحقول المظللة", { page: `الصفحة خارج نطاق الدرس (من ${ar(ctx.page_start)} إلى ${ar(ctx.page_end)})` });
  }
}

/**
 * أخطاء المشغّلات في القاعدة (خط الدفاع الثاني) لا يترجمها غلاف الإجراءات العام، فنترجمها هنا.
 * لا تظهر عادة إلا في سباق، لأن الخادم يفحص أولًا.
 */
const DB_MESSAGES: [RegExp, string][] = [
  [/question (choices|content) is locked/, "السؤال مقفل للتعديل بعد إرساله. حدّث الصفحة."],
  [/question status transition not allowed/, "لا يمكن نقل السؤال إلى هذه الحالة. حدّث الصفحة."],
  [/question page outside lesson range/, "الصفحة خارج نطاق الدرس"],
  [/question needs 2 to 4 choices/, "السؤال يحتاج من خيارين إلى أربعة خيارات"],
  [/question needs exactly one correct choice/, "حدّد إجابة صحيحة واحدة فقط"],
  [/question has a banned choice/, "لا يُسمح بخيار «كل ما سبق» أو ما يشبهه"],
  [/question rights not confirmed/, "أكّد أن الصياغة معدّلة وليست نقلًا حرفيًا من الكتاب"],
  [/questions_one_open_idx/, "توجد نسخة مفتوحة من هذا السؤال بالفعل. حدّث الصفحة."],
  [/questions_one_published_idx/, "توجد نسخة منشورة أخرى من هذا السؤال. حدّث الصفحة."],
];
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? `${err.message} ${(err as { constraint_name?: string }).constraint_name ?? ""}` : "";
    const hit = DB_MESSAGES.find(([re]) => re.test(msg));
    if (hit) throw new AdminError(hit[1]);
    throw err;
  }
}

/* ───────────── الإنشاء والتعديل ───────────── */

async function insertChoices(db: Db, questionId: string, choices: QuestionInput["choices"]) {
  let position = 1;
  for (const c of choices) {
    await db`insert into question_choices (question_id, position, text, is_correct) values (${questionId}, ${position++}, ${c.text}, ${c.isCorrect})`;
  }
}

/** ينشئ مسودة. allowDemo لسكربت البيانات التجريبية فقط (لا تصل إليه الواجهة). */
export async function createQuestion(input: unknown, actor: Actor, ip?: string, opts: { allowDemo?: boolean } = {}): Promise<string> {
  if (actor.kind === "teacher" && !actor.canUpload) throw new PermissionError("صلاحية إضافة المحتوى موقوفة لحسابك حاليًا");
  const v = parseQuestion(input, opts);
  return guarded(() => sql.begin(async (tx) => {
    const ctx = await assertLessonAllowed(actor, v.lessonId, tx);
    assertPageInLesson(v.page, ctx);
    const [row] = await tx<{ id: string }[]>`
      insert into questions (lesson_id, page, exercise_ref, source_kind, type, lang, stem, explanation, hint, difficulty,
                             teacher_id, created_by, content_hash, rights_confirmed_at, rights_confirmed_by)
      values (${v.lessonId}, ${v.page}, ${v.exerciseRef}, ${v.sourceKind}, ${v.type}, ${v.lang}, ${v.stem}, ${v.explanation}, ${v.hint}, ${v.difficulty},
              ${actor.kind === "teacher" ? actor.teacherId : null}, ${actor.userId}, ${contentHash(v)},
              case when ${v.rightsConfirmed} then now() end, case when ${v.rightsConfirmed} then ${actor.userId}::uuid end)
      returning id
    `;
    await insertChoices(tx, row.id, v.choices);
    await audit({ actorId: actor.userId, action: "question.create", entityType: "question", entityId: row.id, metadata: { lessonId: v.lessonId, sourceKind: v.sourceKind }, ip }, tx);
    return row.id;
  }));
}

export async function updateQuestion(id: string, input: unknown, actor: Actor, ip?: string): Promise<void> {
  const q = await assertQuestionAccess(actor, id, "edit");
  if (q.status !== "draft") throw new AdminError("يمكن تعديل المسودات فقط");
  const v = parseQuestion(input);
  await guarded(() => sql.begin(async (tx) => {
    const ctx = await assertLessonAllowed(actor, v.lessonId, tx);
    assertPageInLesson(v.page, ctx);
    const rows = await tx`
      update questions set lesson_id = ${v.lessonId}, page = ${v.page}, exercise_ref = ${v.exerciseRef}, source_kind = ${v.sourceKind},
        type = ${v.type}, lang = ${v.lang}, stem = ${v.stem}, explanation = ${v.explanation}, hint = ${v.hint}, difficulty = ${v.difficulty},
        content_hash = ${contentHash(v)},
        rights_confirmed_at = case when ${v.rightsConfirmed} then coalesce(rights_confirmed_at, now()) end,
        rights_confirmed_by = case when ${v.rightsConfirmed} then coalesce(rights_confirmed_by, ${actor.userId}::uuid) end
      where id = ${id} and status = 'draft'
      returning id
    `;
    if (!rows.length) throw new AdminError("تغيّرت حالة السؤال، حدّث الصفحة");
    await tx`delete from question_choices where question_id = ${id}`;
    await insertChoices(tx, id, v.choices);
    await audit({ actorId: actor.userId, action: "question.update", entityType: "question", entityId: id, ip }, tx);
  }));
}

/* ───────────── الجاهزية للمراجعة والنشر ───────────── */

/** أسباب منع الإرسال أو الاعتماد بالعربية (القاعدة تفرضها أيضًا) */
export async function readinessIssues(id: string, db: Db = sql): Promise<string[]> {
  const [q] = await db<{ type: QuestionType; source_kind: SourceKind; rights_confirmed_at: Date | null; page: number; page_start: number; page_end: number }[]>`
    select q.type, q.source_kind, q.rights_confirmed_at, q.page, l.page_start, l.page_end
    from questions q join curriculum_lessons l on l.id = q.lesson_id where q.id = ${id}
  `;
  if (!q) return [NOT_FOUND];
  const choices = await db<{ text: string; is_correct: boolean }[]>`select text, is_correct from question_choices where question_id = ${id}`;
  const issues: string[] = [];
  if (q.type === "mcq" && (choices.length < 2 || choices.length > 4)) issues.push("السؤال يحتاج من خيارين إلى أربعة خيارات");
  if (q.type === "true_false" && choices.length !== 2) issues.push("سؤال «صح أو خطأ» يحتاج خيارين");
  if (choices.filter((c) => c.is_correct).length !== 1) issues.push("حدّد إجابة صحيحة واحدة فقط");
  if (choices.some((c) => isBannedChoice(c.text))) issues.push("لا يُسمح بخيار «كل ما سبق» أو ما يشبهه");
  if (q.source_kind !== "demo" && !q.rights_confirmed_at) issues.push("أكّد أن الصياغة معدّلة وليست نقلًا حرفيًا من الكتاب");
  if (q.page < q.page_start || q.page > q.page_end) issues.push("الصفحة خارج نطاق الدرس");
  return issues;
}

/* ───────────── سير الاعتماد ───────────── */

export async function submitQuestion(id: string, actor: Actor, ip?: string): Promise<void> {
  const q = await assertQuestionAccess(actor, id, actor.kind === "teacher" ? "edit" : "view");
  if (q.status !== "draft") throw new AdminError("يمكن إرسال المسودات فقط للمراجعة");
  const issues = await readinessIssues(id);
  if (issues.length) throw new AdminError(issues.join("، "));
  const rows = await guarded(() => sql`update questions set status = 'in_review', submitted_at = now() where id = ${id} and status = 'draft' returning id`);
  if (!rows.length) throw new AdminError("تغيّرت حالة السؤال، حدّث الصفحة");
  await audit({ actorId: actor.userId, action: "question.submit_review", entityType: "question", entityId: id, ip });
}

export async function withdrawQuestion(id: string, actor: Actor, ip?: string): Promise<void> {
  const q = await assertQuestionAccess(actor, id, "view");
  if (q.status !== "in_review") throw new AdminError("السؤال ليس بانتظار المراجعة");
  const rows = await sql`update questions set status = 'draft', submitted_at = null where id = ${id} and status = 'in_review' returning id`;
  if (!rows.length) throw new AdminError("تغيّرت حالة السؤال، حدّث الصفحة");
  await audit({ actorId: actor.userId, action: "question.review_withdraw", entityType: "question", entityId: id, ip });
}

/** المالك فقط: يعتمد المسودة أو المرسَل للمراجعة. إن كان نسخة معدّلة تُؤرشف النسخة المنشورة السابقة في المعاملة نفسها. */
export async function approveQuestion(id: string, actor: Actor, ip?: string): Promise<void> {
  if (actor.kind !== "owner") throw new PermissionError("اعتماد الأسئلة متاح لإدارة المنصة فقط");
  if (!UUID.test(id)) throw new AdminError(NOT_FOUND);
  await guarded(() => sql.begin(async (tx) => {
    const [q] = await tx<{ status: QuestionStatus; root_id: string }[]>`select status, root_id from questions where id = ${id} for update`;
    if (!q) throw new AdminError(NOT_FOUND);
    if (q.status !== "in_review" && q.status !== "draft") throw new AdminError("السؤال ليس بانتظار المراجعة");
    const issues = await readinessIssues(id, tx);
    if (issues.length) throw new AdminError(issues.join("، "));
    const replaced = await tx<{ id: string }[]>`
      update questions set status = 'archived' where root_id = ${q.root_id} and status = 'published' and id <> ${id} returning id
    `;
    await tx`
      update questions set status = 'published', published_at = coalesce(published_at, now()), reviewed_at = now(),
        reviewed_by = ${actor.userId}, review_note = null
      where id = ${id}
    `;
    await audit({ actorId: actor.userId, action: "question.review_approve", entityType: "question", entityId: id, metadata: replaced.length ? { replaced: replaced[0].id } : {}, ip }, tx);
  }));
}

export async function returnQuestion(id: string, note: string, actor: Actor, ip?: string): Promise<void> {
  if (actor.kind !== "owner") throw new PermissionError("مراجعة الأسئلة متاحة لإدارة المنصة فقط");
  const clean = note.trim();
  if (clean.length < 3) throw new AdminError("اكتب ملاحظة توضح المطلوب تعديله");
  if (!UUID.test(id)) throw new AdminError(NOT_FOUND);
  const rows = await sql`
    update questions set status = 'draft', review_note = ${clean.slice(0, 2000)}, reviewed_at = now(), reviewed_by = ${actor.userId}
    where id = ${id} and status = 'in_review' returning id
  `;
  if (!rows.length) throw new AdminError("السؤال ليس بانتظار المراجعة");
  await audit({ actorId: actor.userId, action: "question.review_return", entityType: "question", entityId: id, reason: clean, ip });
}

/** نسخة معدّلة من سؤال منشور (مسودة جديدة). إن وُجدت نسخة مفتوحة تُعاد هي بدل إنشاء أخرى. */
export async function reviseQuestion(id: string, actor: Actor, ip?: string): Promise<string> {
  const q = await assertQuestionAccess(actor, id, "view");
  if (q.status !== "published") throw new AdminError("النسخة المعدّلة تُنشأ من سؤال منشور فقط");
  if (actor.kind === "teacher") {
    if (!actor.canUpload) throw new PermissionError("صلاحية إضافة المحتوى موقوفة لحسابك حاليًا");
    if (!(await teacherSubjectIds(actor.teacherId)).includes(q.subject_id)) throw new PermissionError("هذه المادة لم تعد من موادك");
  }
  // قفل النسخة المنشورة يرتّب طلبات «نسخة معدّلة» المتزامنة: الثاني يجد مسودة الأول ويعيدها
  return guarded(() => sql.begin(async (tx) => {
    const locked = await tx`select id from questions where id = ${id} and status = 'published' for update`;
    if (!locked.length) throw new AdminError("النسخة المعدّلة تُنشأ من سؤال منشور فقط");
    const [open] = await tx<{ id: string }[]>`select id from questions where root_id = ${q.root_id} and status in ('draft', 'in_review')`;
    if (open) return open.id;
    const [row] = await tx<{ id: string }[]>`
      insert into questions (revision_of, lesson_id, page, exercise_ref, source_kind, type, lang, stem, explanation, hint, difficulty,
                             teacher_id, created_by, content_hash)
      select id, lesson_id, page, exercise_ref, source_kind, type, lang, stem, explanation, hint, difficulty, teacher_id, ${actor.userId}, content_hash
      from questions where id = ${id}
      returning id
    `;
    await tx`
      insert into question_choices (question_id, position, text, is_correct)
      select ${row.id}, position, text, is_correct from question_choices where question_id = ${id}
    `;
    await audit({ actorId: actor.userId, action: "question.revise", entityType: "question", entityId: row.id, metadata: { revisionOf: id }, ip }, tx);
    return row.id;
  }));
}

/**
 * مسودة بلا محاولات تُحذف نهائيًا (للمعلم صاحبها أو المالك). غير ذلك يُؤرشف، والأرشفة للمالك فقط.
 * المسودة لا تكون لها محاولات أصلًا (التقديم للطلاب من المنشور فقط)، لكن الفحص يبقى صريحًا.
 */
export async function deleteOrArchiveQuestion(id: string, actor: Actor, ip?: string): Promise<"deleted" | "archived"> {
  const q = await assertQuestionAccess(actor, id, actor.kind === "teacher" ? "edit" : "view");
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from question_attempts where question_id = ${id}`;
  if (q.status === "draft" && n === 0) {
    const gone = await sql`delete from questions where id = ${id} and status = 'draft' returning id`;
    if (!gone.length) throw new AdminError("تغيّرت حالة السؤال، حدّث الصفحة");
    await audit({ actorId: actor.userId, action: "question.delete", entityType: "question", entityId: id, ip });
    return "deleted";
  }
  if (actor.kind !== "owner") throw new PermissionError("أرشفة الأسئلة متاحة لإدارة المنصة فقط");
  if (q.status === "archived") return "archived";
  const archived = await sql`update questions set status = 'archived' where id = ${id} and status = ${q.status} returning id`;
  if (!archived.length) throw new AdminError("تغيّرت حالة السؤال، حدّث الصفحة");
  await audit({ actorId: actor.userId, action: "question.archive", entityType: "question", entityId: id, metadata: { from: q.status }, ip });
  return "archived";
}

/** إيقاف مؤقت للتقديم (المالك). البلاغات تستخدم paused_reason = 'reports' في مرحلة لاحقة. */
export async function setQuestionPaused(id: string, paused: boolean, actor: Actor, ip?: string): Promise<void> {
  if (actor.kind !== "owner") throw new PermissionError("إيقاف الأسئلة متاح لإدارة المنصة فقط");
  if (!UUID.test(id)) throw new AdminError(NOT_FOUND);
  const rows = await sql`update questions set paused = ${paused}, paused_reason = ${paused ? "owner" : null} where id = ${id} returning id`;
  if (!rows.length) throw new AdminError(NOT_FOUND);
  await audit({ actorId: actor.userId, action: paused ? "question.pause" : "question.unpause", entityType: "question", entityId: id, ip });
}

/* ───────────── القراءة ───────────── */

export type QuestionListRow = {
  id: string;
  stem: string;
  status: QuestionStatus;
  type: QuestionType;
  difficulty: 1 | 2 | 3;
  source_kind: SourceKind;
  paused: boolean;
  version: number;
  review_note: string | null;
  teacher_name: string | null;
  subject_name: string;
  grade_name: string;
  term: 1 | 2;
  unit_number: number;
  lesson_number: number;
  lesson_title: string;
  page: number;
  updated_at: Date;
};

export type QuestionFilters = { status?: QuestionStatus; textbookId?: string; lessonId?: string; q?: string };

function scopeSql(actor: Actor) {
  return actor.kind === "teacher" ? sql`and q.teacher_id = ${actor.teacherId}` : sql``;
}

function filterSql(actor: Actor, f: QuestionFilters) {
  const text = f.q?.trim();
  return sql`
    where true ${scopeSql(actor)}
      ${f.status ? sql`and q.status = ${f.status}` : sql`and q.status <> 'archived'`}
      ${f.textbookId && UUID.test(f.textbookId) ? sql`and u.textbook_id = ${f.textbookId}` : sql``}
      ${f.lessonId && UUID.test(f.lessonId) ? sql`and l.id = ${f.lessonId}` : sql``}
      ${text ? sql`and q.stem ilike ${"%" + text.replace(/[%_\\]/g, "\\$&") + "%"}` : sql``}
  `;
}

/** عدد النتائج بالمرشحات نفسها (للترقيم) */
export async function countQuestions(actor: Actor, f: QuestionFilters = {}): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n
    from questions q
    join curriculum_lessons l on l.id = q.lesson_id
    join curriculum_units u on u.id = l.unit_id
    ${filterSql(actor, f)}
  `;
  return n;
}

/** صفحة من النتائج مرتبة بالأحدث تعديلًا (الترقيم في القاعدة، فلا سقف خفي لعدد الأسئلة) */
export async function listQuestions(actor: Actor, f: QuestionFilters = {}, page: { limit?: number; offset?: number } = {}): Promise<QuestionListRow[]> {
  const limit = Math.min(Math.max(page.limit ?? 50, 1), 500);
  const offset = Math.max(page.offset ?? 0, 0);
  return sql<QuestionListRow[]>`
    select q.id, q.stem, q.status, q.type, q.difficulty, q.source_kind, q.paused, q.version, q.review_note,
           te.display_name as teacher_name, s.name as subject_name, g.name as grade_name, t.term,
           u.number as unit_number, l.number as lesson_number, l.title as lesson_title, q.page, q.updated_at
    from questions q
    join curriculum_lessons l on l.id = q.lesson_id
    join curriculum_units u on u.id = l.unit_id
    join textbooks t on t.id = u.textbook_id
    join subjects s on s.id = t.subject_id
    join grades g on g.id = s.grade_id
    left join teachers te on te.id = q.teacher_id
    ${filterSql(actor, f)}
    order by q.updated_at desc, q.id
    limit ${limit} offset ${offset}
  `;
}

/** أعداد كل حالة بالمرشحات نفسها (لتبويبات الحالة) */
export async function questionStatusCounts(actor: Actor, f: Omit<QuestionFilters, "status"> = {}): Promise<Record<QuestionStatus, number>> {
  const text = f.q?.trim();
  const rows = await sql<{ status: QuestionStatus; n: number }[]>`
    select q.status, count(*)::int as n
    from questions q
    join curriculum_lessons l on l.id = q.lesson_id
    join curriculum_units u on u.id = l.unit_id
    where true ${scopeSql(actor)}
      ${f.textbookId && UUID.test(f.textbookId) ? sql`and u.textbook_id = ${f.textbookId}` : sql``}
      ${f.lessonId && UUID.test(f.lessonId) ? sql`and l.id = ${f.lessonId}` : sql``}
      ${text ? sql`and q.stem ilike ${"%" + text.replace(/[%_\\]/g, "\\$&") + "%"}` : sql``}
    group by q.status
  `;
  const out: Record<QuestionStatus, number> = { draft: 0, in_review: 0, published: 0, archived: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

export type QuestionDetail = {
  id: string;
  root_id: string;
  revision_of: string | null;
  version: number;
  status: QuestionStatus;
  lesson_id: string;
  page: number;
  exercise_ref: string | null;
  source_kind: SourceKind;
  type: QuestionType;
  lang: QuestionLang;
  stem: string;
  explanation: string;
  hint: string | null;
  difficulty: 1 | 2 | 3;
  teacher_id: string | null;
  teacher_name: string | null;
  review_note: string | null;
  submitted_at: Date | null;
  reviewed_at: Date | null;
  published_at: Date | null;
  rights_confirmed_at: Date | null;
  paused: boolean;
  attempts: number;
  open_revision_id: string | null;
  published_id: string | null;
  choices: { id: string; position: number; text: string; is_correct: boolean }[];
  context: LessonContext;
  reference: string;
};

/** التفاصيل لصاحب الحق فقط؛ خارج النطاق = null (لا كشف للوجود) */
export async function getQuestion(id: string, actor: Actor): Promise<QuestionDetail | null> {
  if (!UUID.test(id)) return null;
  const [q] = await sql<Omit<QuestionDetail, "choices" | "context" | "reference">[]>`
    select q.id, q.root_id, q.revision_of, q.version, q.status, q.lesson_id, q.page, q.exercise_ref, q.source_kind, q.type, q.lang,
           q.stem, q.explanation, q.hint, q.difficulty, q.teacher_id, te.display_name as teacher_name, q.review_note,
           q.submitted_at, q.reviewed_at, q.published_at, q.rights_confirmed_at, q.paused,
           (select count(*)::int from question_attempts a where a.question_id = q.id) as attempts,
           (select o.id from questions o where o.root_id = q.root_id and o.status in ('draft', 'in_review') and o.id <> q.id limit 1) as open_revision_id,
           (select p.id from questions p where p.root_id = q.root_id and p.status = 'published' and p.id <> q.id limit 1) as published_id
    from questions q left join teachers te on te.id = q.teacher_id
    where q.id = ${id} ${scopeSql(actor)}
  `;
  if (!q) return null;
  const [choices, context] = await Promise.all([
    sql<QuestionDetail["choices"]>`select id, position, text, is_correct from question_choices where question_id = ${id} order by position`,
    lessonContext(q.lesson_id),
  ]);
  if (!context) return null;
  return {
    ...q,
    choices,
    context,
    reference: formatReference({ subjectName: context.subject_name, gradeName: context.grade_name, term: context.term, unitNumber: context.unit_number, lessonNumber: context.lesson_number, page: q.page, exerciseRef: q.exercise_ref }),
  };
}

/* ───────────── مراجعة المالك ───────────── */

export async function pendingQuestionCount(): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from questions where status = 'in_review'`;
  return n;
}

export type QuestionReviewItem = { id: string; stem: string; type: QuestionType; difficulty: 1 | 2 | 3; source_kind: SourceKind; version: number; teacher_name: string | null; subject_name: string; grade_name: string; unit_number: number; lesson_number: number; page: number; submitted_at: Date | null };

/** قائمة المراجعة (بلا فحص صلاحية: يستدعيها مَن نفّذ requireOwnerPage) */
export async function questionReviewQueue(): Promise<QuestionReviewItem[]> {
  return sql<QuestionReviewItem[]>`
    select q.id, q.stem, q.type, q.difficulty, q.source_kind, q.version, te.display_name as teacher_name, s.name as subject_name, g.name as grade_name,
           u.number as unit_number, l.number as lesson_number, q.page, q.submitted_at
    from questions q
    join curriculum_lessons l on l.id = q.lesson_id
    join curriculum_units u on u.id = l.unit_id
    join textbooks t on t.id = u.textbook_id
    join subjects s on s.id = t.subject_id
    join grades g on g.id = s.grade_id
    left join teachers te on te.id = q.teacher_id
    where q.status = 'in_review'
    order by q.submitted_at nulls last
  `;
}
