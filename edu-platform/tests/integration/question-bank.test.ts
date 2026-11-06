/**
 * بنك أسئلة الكتاب على PostgreSQL حقيقي (src/server/questions و 0007_question_bank.sql):
 * نطاق المعلم، وسير الاعتماد، والنسخ المعدّلة، والحذف والأرشفة، وحواجز القاعدة، والتدقيق،
 * و RLS، والصفوف المخفية، واستيراد فهرس الكتاب، والتقديم والتصحيح.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdminError } from "@/server/admin/common";
import { PermissionError, type Actor } from "@/server/auth/permissions";
import type { SessionUser } from "@/server/auth/session";
import { getSettings, saveSettings } from "@/server/platform/settings";
import {
  approveQuestion,
  assertQuestionAccess,
  createQuestion,
  deleteOrArchiveQuestion,
  getQuestion,
  listQuestions,
  questionReviewQueue,
  questionStatusCounts,
  readinessIssues,
  returnQuestion,
  reviseQuestion,
  setQuestionPaused,
  submitQuestion,
  updateQuestion,
  withdrawQuestion,
} from "@/server/questions/bank";
import {
  applyTocImport,
  createTextbook,
  curriculumOptions,
  deleteLesson,
  deleteUnit,
  getTextbook,
  listTextbooks,
  previewTocImport,
  saveLesson,
  saveUnit,
  subjectOptions,
  updateTextbook,
} from "@/server/questions/curriculum";
import { decodeCsvBytes } from "@/server/questions/csv";
import { clientChoiceId, gradeAnswer, markShown, previewClientQuestion, QuestionNotServableError, serveQuestion, servableQuestions } from "@/server/questions/serve";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createTeacherWithSubjects, createTextbookWithLessons, createUser, gradeAndSubject, type TestTeacher, type TestTextbook } from "../helpers/factories";

/* ───────────── الفاعلون والبيانات المشتركة ───────────── */

function teacherActor(t: TestTeacher, canUpload = true): Actor {
  return { kind: "teacher", userId: t.user!.id, name: t.displayName, email: t.user!.email, teacherId: t.id, teacherName: t.displayName, canUpload };
}

async function ownerActor(): Promise<Actor> {
  const u = await createUser({ role: "admin" });
  return { kind: "owner", userId: u.id, name: u.fullName, email: u.email, teacherId: null, canUpload: true };
}

const EXPLANATION = "تقاس القوة بوحدة النيوتن في النظام الدولي للوحدات.";
const TOC_HEADER = "unit_number,unit_title,lesson_number,lesson_title,page_start,page_end";
let seq = 0;

/** سؤال اختيار من متعدد صالح في الدرس المعطى (الصفحة 15 افتراضيًا) */
function mcqInput(lessonId: string, over: Record<string, unknown> = {}) {
  seq++;
  return {
    lessonId,
    page: 15,
    sourceKind: "textbook_based",
    type: "mcq",
    lang: "ar",
    stem: `ما وحدة قياس القوة؟ (${seq})`,
    explanation: EXPLANATION,
    difficulty: 2,
    choices: [
      { text: "نيوتن", isCorrect: true },
      { text: "جول", isCorrect: false },
      { text: "واط", isCorrect: false },
    ],
    rightsConfirmed: true,
    ...over,
  };
}

async function statusOf(id: string): Promise<string | undefined> {
  const [r] = await sql<{ status: string }[]>`select status from questions where id = ${id}`;
  return r?.status;
}

async function auditActions(entityId: string): Promise<string[]> {
  const rows = await sql<{ action: string }[]>`select action from audit_logs where entity_id = ${entityId} order by id`;
  return rows.map((r) => r.action);
}

/** يلتقط الخطأ المرفوض ليُفحص نوعه وحقوله معًا */
async function rejectionOf(p: Promise<unknown>): Promise<AdminError & PermissionError> {
  try {
    await p;
  } catch (e) {
    return e as AdminError & PermissionError;
  }
  throw new Error("expected the promise to reject");
}

/** سؤال منشور: إنشاء ← إرسال ← اعتماد */
async function publishedQuestion(actor: Actor, lessonId: string, over: Record<string, unknown> = {}): Promise<string> {
  const id = await createQuestion(mcqInput(lessonId, over), actor);
  if (actor.kind === "teacher") await submitQuestion(id, actor);
  await approveQuestion(id, owner);
  return id;
}

let owner: Actor;
let student: SessionUser;
/** كتاب العلوم للصف السابع، الفصل الأول: الوحدة ١ (الدرس ١: 10-20، الدرس ٢: 21-30)، الوحدة ٢ (الدرس ٣: 40-50) */
let sci: TestTextbook;
let L1: string;
let L2: string;
let L3: string;
let sciSubjectId: string;
let mathSubjectId: string;

beforeAll(async () => {
  await resetDb();
  owner = await ownerActor();
  student = await createUser();
  sci = await createTextbookWithLessons({
    level: 7,
    subjectSlug: "science",
    term: 1,
    title: "كتاب العلوم",
    lessons: [
      { unit: 1, number: 1, pageStart: 10, pageEnd: 20 },
      { unit: 1, number: 2, pageStart: 21, pageEnd: 30 },
      { unit: 2, number: 3, pageStart: 40, pageEnd: 50 },
    ],
  });
  [L1, L2, L3] = sci.lessonIds;
  sciSubjectId = sci.subjectId;
  mathSubjectId = (await gradeAndSubject(7, "math")).subjectId;
});

afterAll(async () => {
  await closeDb();
});

/* ───────────── نطاق المعلم ───────────── */

describe("نطاق المعلم — يرى ويعدّل أسئلته فقط وفي مواده فقط", () => {
  it("a teacher sees only own questions; another teacher gets «السؤال غير موجود» everywhere", async () => {
    const a = await createTeacherWithSubjects({ subjectIds: [sciSubjectId] });
    const b = await createTeacherWithSubjects({ subjectIds: [sciSubjectId] });
    const id = await createQuestion(mcqInput(L1), teacherActor(a));

    const [row] = await sql<{ teacher_id: string; created_by: string; status: string; version: number; root_id: string; revision_of: string | null }[]>`
      select teacher_id, created_by, status, version, root_id, revision_of from questions where id = ${id}
    `;
    expect(row).toEqual({ teacher_id: a.id, created_by: a.user.id, status: "draft", version: 1, root_id: id, revision_of: null });

    expect(await getQuestion(id, teacherActor(a))).toMatchObject({ id, status: "draft", teacher_id: a.id });
    expect((await listQuestions(teacherActor(a))).map((q) => q.id)).toEqual([id]);
    expect(await questionStatusCounts(teacherActor(a))).toEqual({ draft: 1, in_review: 0, published: 0, archived: 0 });

    // المعلم الآخر لا يرى ولا يلمس، والرسالة نفسها حتى لا يُكشف الوجود
    expect(await getQuestion(id, teacherActor(b))).toBeNull();
    expect(await listQuestions(teacherActor(b))).toEqual([]);
    expect(await questionStatusCounts(teacherActor(b))).toEqual({ draft: 0, in_review: 0, published: 0, archived: 0 });
    const tb = teacherActor(b);
    await expect(assertQuestionAccess(tb, id, "view")).rejects.toThrow("السؤال غير موجود");
    await expect(assertQuestionAccess(tb, id, "edit")).rejects.toThrow("السؤال غير موجود");
    await expect(updateQuestion(id, mcqInput(L1), tb)).rejects.toThrow("السؤال غير موجود");
    await expect(submitQuestion(id, tb)).rejects.toThrow("السؤال غير موجود");
    await expect(withdrawQuestion(id, tb)).rejects.toThrow("السؤال غير موجود");
    await expect(deleteOrArchiveQuestion(id, tb)).rejects.toThrow("السؤال غير موجود");
    await expect(reviseQuestion(id, tb)).rejects.toThrow("السؤال غير موجود");
    await expect(assertQuestionAccess(tb, id, "view")).rejects.toBeInstanceOf(PermissionError);

    // المعرّف المشوّه وغير الموجود: الرسالة نفسها
    await expect(assertQuestionAccess(tb, "not-a-uuid", "view")).rejects.toThrow("السؤال غير موجود");
    await expect(assertQuestionAccess(tb, "00000000-0000-4000-8000-000000000000", "view")).rejects.toThrow("السؤال غير موجود");
    expect(await getQuestion("not-a-uuid", owner)).toBeNull();

    // أسئلة المنصة (بلا معلم) لا يراها المعلم، والمالك يرى الكل
    const platform = await createQuestion(mcqInput(L1), owner);
    await expect(assertQuestionAccess(teacherActor(a), platform, "view")).rejects.toThrow("السؤال غير موجود");
    expect(await getQuestion(platform, owner)).toMatchObject({ id: platform, teacher_id: null });
    expect((await listQuestions(owner)).map((q) => q.id)).toEqual(expect.arrayContaining([id, platform]));
    await expect(assertQuestionAccess(owner, id, "edit")).resolves.toMatchObject({ id, teacher_id: a.id, subject_id: sciSubjectId });
  });

  it("the teacher edits own draft: content and choices are replaced, the hash changes", async () => {
    const a = await createTeacherWithSubjects({ subjectIds: [sciSubjectId] });
    const id = await createQuestion(mcqInput(L1), teacherActor(a));
    const [before] = await sql<{ content_hash: string }[]>`select content_hash from questions where id = ${id}`;
    expect(before.content_hash).toMatch(/^[0-9a-f]{64}$/);

    await updateQuestion(
      id,
      mcqInput(L2, {
        page: 25,
        stem: "ما الوحدة المستخدمة لقياس الشغل؟",
        hint: "فكّر في اسم عالم إنجليزي",
        choices: [
          { text: "واط", isCorrect: false },
          { text: "جول", isCorrect: true },
          { text: "نيوتن", isCorrect: false },
          { text: "باسكال", isCorrect: false },
        ],
      }),
      teacherActor(a),
    );
    const q = await getQuestion(id, teacherActor(a));
    expect(q).toMatchObject({ lesson_id: L2, page: 25, stem: "ما الوحدة المستخدمة لقياس الشغل؟", hint: "فكّر في اسم عالم إنجليزي", status: "draft" });
    expect(q!.choices.map((c) => [c.position, c.text, c.is_correct])).toEqual([
      [1, "واط", false],
      [2, "جول", true],
      [3, "نيوتن", false],
      [4, "باسكال", false],
    ]);
    const [after] = await sql<{ content_hash: string }[]>`select content_hash from questions where id = ${id}`;
    expect(after.content_hash).not.toBe(before.content_hash);
    expect(await auditActions(id)).toEqual(["question.create", "question.update"]);
  });

  it("a teacher cannot create in a subject outside teacher_subjects (field error on lessonId)", async () => {
    const mathTeacher = await createTeacherWithSubjects({ subjectIds: [mathSubjectId] });
    const err = await rejectionOf(createQuestion(mcqInput(L1), teacherActor(mathTeacher)));
    expect(err).toBeInstanceOf(AdminError);
    expect(err).toMatchObject({ userMessage: "راجع الحقول المظللة", fieldErrors: { lessonId: "هذا الدرس ليس من موادك" } });

    // معلم بلا أي مادة
    const none = await createTeacherWithSubjects({ subjectIds: [] });
    await expect(createQuestion(mcqInput(L1), teacherActor(none))).rejects.toMatchObject({ fieldErrors: { lessonId: "هذا الدرس ليس من موادك" } });
    expect(await curriculumOptions(teacherActor(none))).toEqual([]);

    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from questions where teacher_id in (${mathTeacher.id}, ${none.id})`;
    expect(n).toBe(0);
    // شجرة المنهج للمعلم: مواده فقط
    const sciTeacher = await createTeacherWithSubjects({ subjectIds: [sciSubjectId] });
    expect((await curriculumOptions(teacherActor(sciTeacher))).map((o) => o.textbookId)).toEqual([sci.id]);
    expect(await curriculumOptions(teacherActor(mathTeacher))).toEqual([]);
  });

  it("the teacher can edit only drafts: in_review, published and archived give Arabic messages", async () => {
    const a = await createTeacherWithSubjects({ subjectIds: [sciSubjectId] });
    const ta = teacherActor(a);
    const id = await createQuestion(mcqInput(L1), ta);
    await submitQuestion(id, ta);
    await expect(updateQuestion(id, mcqInput(L1), ta)).rejects.toThrow("السؤال قيد المراجعة ولا يمكن تعديله الآن");
    await expect(submitQuestion(id, ta)).rejects.toThrow("السؤال قيد المراجعة ولا يمكن تعديله الآن");
    // المالك نفسه لا يعدّل غير المسودة
    await expect(updateQuestion(id, mcqInput(L1), owner)).rejects.toThrow("يمكن تعديل المسودات فقط");
    await expect(assertQuestionAccess(ta, id, "view")).resolves.toMatchObject({ status: "in_review" });

    await approveQuestion(id, owner);
    await expect(updateQuestion(id, mcqInput(L1), ta)).rejects.toThrow("السؤال منشور: أنشئ نسخة معدّلة منه");
    await expect(submitQuestion(id, owner)).rejects.toThrow("يمكن إرسال المسودات فقط للمراجعة");

    expect(await deleteOrArchiveQuestion(id, owner)).toBe("archived");
    await expect(updateQuestion(id, mcqInput(L1), ta)).rejects.toThrow("السؤال مؤرشف ولا يمكن تعديله");
  });

  it("canUpload=false blocks creating, editing and revising", async () => {
    const a = await createTeacherWithSubjects({ subjectIds: [sciSubjectId] });
    const draft = await createQuestion(mcqInput(L1), teacherActor(a));
    const pub = await publishedQuestion(teacherActor(a), L1);
    await sql`update teachers set can_upload = false where id = ${a.id}`;
    const off = teacherActor(a, false);

    const err = await rejectionOf(createQuestion(mcqInput(L1), off));
    expect(err).toBeInstanceOf(PermissionError);
    expect(err.message).toBe("صلاحية إضافة المحتوى موقوفة لحسابك حاليًا");
    await expect(updateQuestion(draft, mcqInput(L1), off)).rejects.toThrow("صلاحية إضافة المحتوى موقوفة لحسابك حاليًا");
    await expect(reviseQuestion(pub, off)).rejects.toThrow("صلاحية إضافة المحتوى موقوفة لحسابك حاليًا");
    // العرض يبقى مسموحًا
    await expect(assertQuestionAccess(off, draft, "view")).resolves.toMatchObject({ id: draft });
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from questions where teacher_id = ${a.id}`;
    expect(n).toBe(2);
  });

  it("removing a subject from the teacher stops editing that subject's drafts", async () => {
    const a = await createTeacherWithSubjects({ subjectIds: [sciSubjectId] });
    const id = await createQuestion(mcqInput(L1), teacherActor(a));
    await sql`delete from teacher_subjects where teacher_id = ${a.id}`;
    await expect(updateQuestion(id, mcqInput(L1), teacherActor(a))).rejects.toThrow("هذه المادة لم تعد من موادك");
    await expect(assertQuestionAccess(teacherActor(a), id, "view")).resolves.toMatchObject({ id });
  });

  it("page outside the lesson, a non-current edition, an unknown lesson and the demo source are field errors", async () => {
    await expect(createQuestion(mcqInput(L1, { page: 25 }), owner)).rejects.toMatchObject({
      userMessage: "راجع الحقول المظللة",
      fieldErrors: { page: "الصفحة خارج نطاق الدرس (من ١٠ إلى ٢٠)" },
    });
    const old = await createTextbookWithLessons({ level: 7, subjectSlug: "science", term: 2, current: false });
    await expect(createQuestion(mcqInput(old.lessonIds[0]), owner)).rejects.toMatchObject({ fieldErrors: { lessonId: "هذا الكتاب ليس الطبعة الحالية" } });
    await expect(createQuestion(mcqInput("00000000-0000-4000-8000-000000000000"), owner)).rejects.toMatchObject({ fieldErrors: { lessonId: "اختر الدرس" } });
    await expect(createQuestion(mcqInput(L1, { sourceKind: "demo" }), owner)).rejects.toMatchObject({ fieldErrors: { sourceKind: "اختر مصدر السؤال" } });
    // مخطط المدخلات نفسه يصل كأخطاء حقول
    await expect(createQuestion(mcqInput(L1, { choices: [{ text: "نيوتن", isCorrect: true }, { text: "كل ما سبق", isCorrect: false }] }), owner)).rejects.toMatchObject({
      fieldErrors: { "choices.1.text": "لا يُسمح بخيار «كل ما سبق» أو ما يشبهه" },
    });

    // «تجريبي» لسكربت البيانات فقط، ولا يحتاج تأكيد الحقوق
    const demo = await createQuestion(mcqInput(L1, { sourceKind: "demo", rightsConfirmed: false }), owner, undefined, { allowDemo: true });
    expect(await readinessIssues(demo)).toEqual([]);
    await approveQuestion(demo, owner);
    expect(await statusOf(demo)).toBe("published");
  });
});

/* ───────────── سير الاعتماد ───────────── */

describe("سير الاعتماد — إرسال ← اعتماد أو إعادة بملاحظة أو سحب", () => {
  it("create → submit needs rights confirmed → owner approves → published with reviewed_by", async () => {
    const a = await createTeacherWithSubjects({ subjectIds: [sciSubjectId] });
    const ta = teacherActor(a);
    const id = await createQuestion(mcqInput(L1, { rightsConfirmed: false }), ta);
    expect(await readinessIssues(id)).toEqual(["أكّد أن الصياغة معدّلة وليست نقلًا حرفيًا من الكتاب"]);
    const err = await rejectionOf(submitQuestion(id, ta));
    expect(err).toBeInstanceOf(AdminError);
    expect(err.userMessage).toBe("أكّد أن الصياغة معدّلة وليست نقلًا حرفيًا من الكتاب");
    expect(await statusOf(id)).toBe("draft");

    await updateQuestion(id, mcqInput(L1, { rightsConfirmed: true }), ta);
    await submitQuestion(id, ta);
    const [inReview] = await sql<{ status: string; submitted_at: Date | null; rights_confirmed_by: string | null }[]>`
      select status, submitted_at, rights_confirmed_by from questions where id = ${id}
    `;
    expect(inReview.status).toBe("in_review");
    expect(inReview.submitted_at).toBeInstanceOf(Date);
    expect(inReview.rights_confirmed_by).toBe(a.user.id);
    expect((await questionReviewQueue()).map((q) => q.id)).toContain(id);

    await expect(approveQuestion(id, ta)).rejects.toThrow("اعتماد الأسئلة متاح لإدارة المنصة فقط");
    await approveQuestion(id, owner);
    const [pub] = await sql<{ status: string; reviewed_by: string | null; reviewed_at: Date | null; published_at: Date | null; review_note: string | null }[]>`
      select status, reviewed_by, reviewed_at, published_at, review_note from questions where id = ${id}
    `;
    expect(pub).toMatchObject({ status: "published", reviewed_by: owner.userId, review_note: null });
    expect(pub.reviewed_at).toBeInstanceOf(Date);
    expect(pub.published_at).toBeInstanceOf(Date);
    expect((await questionReviewQueue()).map((q) => q.id)).not.toContain(id);
    expect(await auditActions(id)).toEqual(["question.create", "question.update", "question.submit_review", "question.review_approve"]);
  });

  it("owner returns with a note → draft with review_note; the teacher fixes and resubmits", async () => {
    const a = await createTeacherWithSubjects({ subjectIds: [sciSubjectId] });
    const ta = teacherActor(a);
    const id = await createQuestion(mcqInput(L1), ta);
    await expect(returnQuestion(id, "صحح الخيار الثاني", owner)).rejects.toThrow("السؤال ليس بانتظار المراجعة");
    await submitQuestion(id, ta);
    await expect(returnQuestion(id, "  ", owner)).rejects.toThrow("اكتب ملاحظة توضح المطلوب تعديله");
    await expect(returnQuestion(id, "صحح الخيار الثاني", ta)).rejects.toThrow("مراجعة الأسئلة متاحة لإدارة المنصة فقط");

    await returnQuestion(id, "  صحح الخيار الثاني ليكون أوضح  ", owner);
    const [row] = await sql<{ status: string; review_note: string | null; reviewed_by: string | null }[]>`select status, review_note, reviewed_by from questions where id = ${id}`;
    expect(row).toEqual({ status: "draft", review_note: "صحح الخيار الثاني ليكون أوضح", reviewed_by: owner.userId });
    expect(await getQuestion(id, ta)).toMatchObject({ review_note: "صحح الخيار الثاني ليكون أوضح" });
    const [log] = await sql<{ reason: string | null; actor_id: string | null }[]>`select reason, actor_id from audit_logs where entity_id = ${id} and action = 'question.review_return'`;
    expect(log).toEqual({ reason: "صحح الخيار الثاني ليكون أوضح", actor_id: owner.userId });

    // التعديل بعد الإعادة ثم الإرسال والاعتماد يمسح الملاحظة
    await updateQuestion(id, mcqInput(L1, { stem: "ما وحدة قياس القوة في النظام الدولي للوحدات؟" }), ta);
    await submitQuestion(id, ta);
    await approveQuestion(id, owner);
    const [done] = await sql<{ status: string; review_note: string | null }[]>`select status, review_note from questions where id = ${id}`;
    expect(done).toEqual({ status: "published", review_note: null });
  });

  it("the teacher withdraws from review back to draft", async () => {
    const a = await createTeacherWithSubjects({ subjectIds: [sciSubjectId] });
    const ta = teacherActor(a);
    const id = await createQuestion(mcqInput(L1), ta);
    await expect(withdrawQuestion(id, ta)).rejects.toThrow("السؤال ليس بانتظار المراجعة");
    await submitQuestion(id, ta);
    await withdrawQuestion(id, ta);
    const [row] = await sql<{ status: string; submitted_at: Date | null }[]>`select status, submitted_at from questions where id = ${id}`;
    expect(row).toEqual({ status: "draft", submitted_at: null });
    await updateQuestion(id, mcqInput(L1, { stem: "سؤال بعد السحب عن القوة" }), ta);
    expect(await auditActions(id)).toEqual(["question.create", "question.submit_review", "question.review_withdraw", "question.update"]);
  });

  it("the owner can approve a platform draft directly; readiness issues block approval", async () => {
    const id = await createQuestion(mcqInput(L1, { rightsConfirmed: false }), owner);
    await expect(approveQuestion(id, owner)).rejects.toThrow("أكّد أن الصياغة معدّلة وليست نقلًا حرفيًا من الكتاب");
    expect(await statusOf(id)).toBe("draft");
    await updateQuestion(id, mcqInput(L1), owner);
    await approveQuestion(id, owner);
    expect(await statusOf(id)).toBe("published");
    await expect(approveQuestion(id, owner)).rejects.toThrow("السؤال ليس بانتظار المراجعة");
    await expect(approveQuestion("not-a-uuid", owner)).rejects.toThrow("السؤال غير موجود");
    await expect(approveQuestion("00000000-0000-4000-8000-000000000000", owner)).rejects.toThrow("السؤال غير موجود");
  });
});

/* ───────────── النسخ المعدّلة ───────────── */

describe("النسخ المعدّلة — المنشور لا يُعدَّل بل تحل محله نسخة", () => {
  it("revise → v2 draft with the same root; revising again returns it; approving archives v1; attempts keep v1", async () => {
    const a = await createTeacherWithSubjects({ subjectIds: [sciSubjectId] });
    const ta = teacherActor(a);
    const v1 = await publishedQuestion(ta, L1);
    const served = await serveQuestion({ userId: student.id, questionId: v1, contextType: "game" });

    const v2 = await reviseQuestion(v1, ta);
    expect(v2).not.toBe(v1);
    const [row] = await sql<{ revision_of: string; root_id: string; version: number; status: string; teacher_id: string; created_by: string; rights_confirmed_at: Date | null }[]>`
      select revision_of, root_id, version, status, teacher_id, created_by, rights_confirmed_at from questions where id = ${v2}
    `;
    expect(row).toMatchObject({ revision_of: v1, root_id: v1, version: 2, status: "draft", teacher_id: a.id, created_by: a.user.id });
    const choicesOf = (id: string) => sql<{ position: number; text: string; is_correct: boolean }[]>`
      select position, text, is_correct from question_choices where question_id = ${id} order by position
    `;
    expect(await choicesOf(v2)).toEqual(await choicesOf(v1));

    // نسخة مفتوحة واحدة: الطلب الثاني (من المعلم أو المالك) يعيدها نفسها
    expect(await reviseQuestion(v1, ta)).toBe(v2);
    expect(await reviseQuestion(v1, owner)).toBe(v2);
    expect(await auditActions(v2)).toEqual(["question.revise"]);
    expect(await getQuestion(v1, ta)).toMatchObject({ open_revision_id: v2, published_id: null });
    expect(await getQuestion(v2, ta)).toMatchObject({ published_id: v1, open_revision_id: null, version: 2 });
    // ما زال الأصل منشورًا ويُقدَّم حتى اعتماد النسخة
    expect((await servableQuestions([L1])).map((q) => q.id)).toContain(v1);

    await updateQuestion(v2, mcqInput(L1, { stem: "ما وحدة قياس القوة؟ (نسخة مصححة)" }), ta);
    await submitQuestion(v2, ta);
    await approveQuestion(v2, owner);
    expect(await statusOf(v1)).toBe("archived");
    expect(await statusOf(v2)).toBe("published");
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from questions where root_id = ${v1} and status = 'published'`;
    expect(n).toBe(1);
    const [approveLog] = await sql<{ metadata: { replaced?: string } }[]>`select metadata from audit_logs where entity_id = ${v2} and action = 'question.review_approve'`;
    expect(approveLog.metadata.replaced).toBe(v1);

    // المحاولة القديمة ما زالت على النسخة الأولى، والقاعدة تمنع حذفها
    const [attempt] = await sql<{ question_id: string }[]>`select question_id from question_attempts where id = ${served.attemptId}`;
    expect(attempt.question_id).toBe(v1);
    await expect(sql`delete from questions where id = ${v1}`).rejects.toThrow();
    const served2 = (await servableQuestions([L1])).map((q) => q.id);
    expect(served2).toContain(v2);
    expect(served2).not.toContain(v1);
    await expect(serveQuestion({ userId: student.id, questionId: v1, contextType: "game" })).rejects.toBeInstanceOf(QuestionNotServableError);

    // نسخة ثالثة من الثانية: الجذر نفسه والإصدار ٣، ولا نسخة من المؤرشف
    const v3 = await reviseQuestion(v2, ta);
    expect(await sql`select root_id, revision_of, version from questions where id = ${v3}`).toEqual([{ root_id: v1, revision_of: v2, version: 3 }]);
    await expect(reviseQuestion(v1, ta)).rejects.toThrow("النسخة المعدّلة تُنشأ من سؤال منشور فقط");
  });

  it("a draft cannot be revised", async () => {
    const id = await createQuestion(mcqInput(L1), owner);
    await expect(reviseQuestion(id, owner)).rejects.toThrow("النسخة المعدّلة تُنشأ من سؤال منشور فقط");
  });

  it("the database keeps one published and one open version per root", async () => {
    const p = await publishedQuestion(owner, L1);
    const r = await reviseQuestion(p, owner);
    // نشر النسخة يدويًا والأصل منشور: يكسر الفهرس الفريد
    await expect(sql`update questions set status = 'published', rights_confirmed_at = now() where id = ${r}`).rejects.toThrow(/questions_one_published_idx/);
    // نسخة مفتوحة ثانية للجذر نفسه
    await expect(sql`
      insert into questions (revision_of, lesson_id, page, source_kind, type, lang, stem, explanation, difficulty, content_hash)
      select id, lesson_id, page, source_kind, type, lang, stem, explanation, difficulty, content_hash from questions where id = ${p}
    `).rejects.toThrow(/questions_one_open_idx/);
    expect(await statusOf(r)).toBe("draft");
  });
});

/* ───────────── الحذف والأرشفة ───────────── */

describe("الحذف والأرشفة", () => {
  it("a draft without attempts is deleted with its choices", async () => {
    const a = await createTeacherWithSubjects({ subjectIds: [sciSubjectId] });
    const id = await createQuestion(mcqInput(L1), teacherActor(a));
    expect(await deleteOrArchiveQuestion(id, teacherActor(a))).toBe("deleted");
    expect(await statusOf(id)).toBeUndefined();
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from question_choices where question_id = ${id}`;
    expect(n).toBe(0);
    expect(await auditActions(id)).toEqual(["question.create", "question.delete"]);

    const ownerDraft = await createQuestion(mcqInput(L1), owner);
    expect(await deleteOrArchiveQuestion(ownerDraft, owner)).toBe("deleted");
  });

  it("a published question is archived by the owner only", async () => {
    const a = await createTeacherWithSubjects({ subjectIds: [sciSubjectId] });
    const id = await publishedQuestion(teacherActor(a), L1);
    await expect(deleteOrArchiveQuestion(id, teacherActor(a))).rejects.toBeInstanceOf(PermissionError);
    expect(await statusOf(id)).toBe("published");

    expect(await deleteOrArchiveQuestion(id, owner)).toBe("archived");
    expect(await statusOf(id)).toBe("archived");
    const [log] = await sql<{ metadata: { from?: string } }[]>`select metadata from audit_logs where entity_id = ${id} and action = 'question.archive'`;
    expect(log.metadata.from).toBe("published");
    // مرة ثانية: لا شيء يتغير
    expect(await deleteOrArchiveQuestion(id, owner)).toBe("archived");
    expect((await auditActions(id)).filter((x) => x === "question.archive")).toHaveLength(1);
    // المؤرشف لا يظهر في القائمة الافتراضية
    expect((await listQuestions(owner)).map((q) => q.id)).not.toContain(id);
    expect((await listQuestions(owner, { status: "archived" })).map((q) => q.id)).toContain(id);
  });

  it("a question with attempts is never deleted: the owner archives it, the teacher is refused", async () => {
    const a = await createTeacherWithSubjects({ subjectIds: [sciSubjectId] });
    const id = await createQuestion(mcqInput(L1), teacherActor(a));
    const choices = await sql<{ id: string }[]>`select id from question_choices where question_id = ${id} order by position`;
    await sql`
      insert into question_attempts (user_id, question_id, context_type, choice_order)
      values (${student.id}, ${id}, 'preview', ${choices.map((c) => c.id)}::uuid[])
    `;
    await expect(deleteOrArchiveQuestion(id, teacherActor(a))).rejects.toThrow("أرشفة الأسئلة متاحة لإدارة المنصة فقط");
    expect(await statusOf(id)).toBe("draft");
    expect(await deleteOrArchiveQuestion(id, owner)).toBe("archived");
    expect(await statusOf(id)).toBe("archived");
  });
});

/* ───────────── حواجز القاعدة ───────────── */

describe("حواجز القاعدة (SQL مباشر)", () => {
  let draft: string;
  let inReview: string;
  let published: string;

  beforeAll(async () => {
    draft = await createQuestion(mcqInput(L2, { page: 22 }), owner);
    inReview = await createQuestion(mcqInput(L2, { page: 23 }), owner);
    await submitQuestion(inReview, owner);
    published = await publishedQuestion(owner, L2, { page: 24 });
  });

  it("choices are locked once the question is not a draft", async () => {
    await expect(sql`update question_choices set text = 'تعديل' where question_id = ${inReview}`).rejects.toThrow("question choices are locked");
    await expect(sql`insert into question_choices (question_id, position, text) values (${inReview}, 4, 'خيار جديد')`).rejects.toThrow("question choices are locked");
    await expect(sql`delete from question_choices where question_id = ${published}`).rejects.toThrow("question choices are locked");
    await expect(sql`update question_choices set is_correct = false where question_id = ${published}`).rejects.toThrow("question choices are locked");
    // المسودة تُعدَّل
    await sql`update question_choices set text = 'نيوتن (N)' where question_id = ${draft} and position = 1`;
  });

  it("content is locked after draft; non-content fields still change", async () => {
    await expect(sql`update questions set stem = 'نص جديد للسؤال' where id = ${inReview}`).rejects.toThrow("question content is locked");
    await expect(sql`update questions set explanation = ${"شرح جديد مختلف تمامًا عن السابق"} where id = ${published}`).rejects.toThrow("question content is locked");
    await expect(sql`update questions set page = 25 where id = ${published}`).rejects.toThrow("question content is locked");
    await expect(sql`update questions set content_hash = ${"0".repeat(64)} where id = ${published}`).rejects.toThrow("question content is locked");
    await sql`update questions set paused = true, paused_reason = 'owner' where id = ${published}`;
    await sql`update questions set paused = false, paused_reason = null where id = ${published}`;
  });

  it("invalid status transitions are rejected", async () => {
    await expect(sql`update questions set status = 'draft' where id = ${published}`).rejects.toThrow("question status transition not allowed");
    await expect(sql`update questions set status = 'in_review' where id = ${published}`).rejects.toThrow("question status transition not allowed");
    const archived = await publishedQuestion(owner, L2, { page: 26 });
    await deleteOrArchiveQuestion(archived, owner);
    await expect(sql`update questions set status = 'published' where id = ${archived}`).rejects.toThrow("question status transition not allowed");
    await expect(sql`update questions set status = 'draft' where id = ${archived}`).rejects.toThrow("question status transition not allowed");
  });

  it("the page must stay inside the lesson range", async () => {
    await expect(sql`
      insert into questions (lesson_id, page, source_kind, type, lang, stem, explanation, difficulty, content_hash)
      values (${L2}, 99, 'teacher_original', 'mcq', 'ar', 'سؤال خارج النطاق', ${EXPLANATION}, 1, ${"a".repeat(64)})
    `).rejects.toThrow("question page outside lesson range");
    await expect(sql`update questions set page = 5 where id = ${draft}`).rejects.toThrow("question page outside lesson range");
    await expect(sql`update questions set lesson_id = ${L3} where id = ${draft}`).rejects.toThrow("question page outside lesson range");
  });

  it("a second correct choice is rejected by the unique index", async () => {
    await expect(sql`insert into question_choices (question_id, position, text, is_correct) values (${draft}, 4, 'خيار رابع', true)`).rejects.toThrow(
      /question_choices_one_correct_idx/,
    );
  });

  it("a banned choice inserted with raw SQL blocks submission (app message and trigger)", async () => {
    const id = await createQuestion(mcqInput(L2, { page: 27, choices: [{ text: "نيوتن", isCorrect: true }, { text: "جول", isCorrect: false }] }), owner);
    await sql`insert into question_choices (question_id, position, text, is_correct) values (${id}, 3, 'كل ما سبق', false)`;
    await expect(submitQuestion(id, owner)).rejects.toThrow("لا يُسمح بخيار «كل ما سبق» أو ما يشبهه");
    await expect(sql`update questions set status = 'in_review' where id = ${id}`).rejects.toThrow("question has a banned choice");
    await expect(sql`update questions set status = 'published' where id = ${id}`).rejects.toThrow("question has a banned choice");
    expect(await statusOf(id)).toBe("draft");
  });

  it("the trigger also checks choice count, the correct answer and rights before review", async () => {
    const few = await createQuestion(mcqInput(L2, { page: 28 }), owner);
    await sql`delete from question_choices where question_id = ${few} and position > 1`;
    await expect(sql`update questions set status = 'in_review' where id = ${few}`).rejects.toThrow("question needs 2 to 4 choices");

    const noCorrect = await createQuestion(mcqInput(L2, { page: 28 }), owner);
    await sql`update question_choices set is_correct = false where question_id = ${noCorrect}`;
    await expect(sql`update questions set status = 'in_review' where id = ${noCorrect}`).rejects.toThrow("question needs exactly one correct choice");
    await expect(submitQuestion(noCorrect, owner)).rejects.toThrow("حدّد إجابة صحيحة واحدة فقط");

    const noRights = await createQuestion(mcqInput(L2, { page: 28, rightsConfirmed: false }), owner);
    await expect(sql`update questions set status = 'in_review' where id = ${noRights}`).rejects.toThrow("question rights not confirmed");
  });
});

/* ───────────── التدقيق و RLS ───────────── */

describe("سجل التدقيق و RLS", () => {
  it("each action writes an audit row with the actor", async () => {
    const { subjectId } = await gradeAndSubject(9, "math");
    const textbookId = await createTextbook({ subjectId, term: 2, title: "كتاب الرياضيات", edition: "2026", isCurrent: true, rightsConfirmed: true }, owner);
    await applyTocImport(textbookId, `${TOC_HEADER}\n1,الجبر,1,المعادلات,10,30\n`, owner);
    const tb = await getTextbook(textbookId);
    const lessonId = tb!.unitsList[0].lessons[0].id;

    const t = await createTeacherWithSubjects({ subjectIds: [subjectId] });
    const ta = teacherActor(t);
    const returned = await createQuestion(mcqInput(lessonId), ta);
    await submitQuestion(returned, ta);
    await returnQuestion(returned, "أعد صياغة السؤال", owner);
    const pub = await publishedQuestion(ta, lessonId);
    const rev = await reviseQuestion(pub, ta);

    expect(await auditActions(textbookId)).toEqual(["curriculum.textbook_create", "curriculum.toc_import"]);
    expect(await auditActions(returned)).toEqual(["question.create", "question.submit_review", "question.review_return"]);
    expect(await auditActions(pub)).toEqual(["question.create", "question.submit_review", "question.review_approve"]);
    expect(await auditActions(rev)).toEqual(["question.revise"]);

    const actors = await sql<{ action: string; actor_id: string; entity_type: string }[]>`
      select action, actor_id, entity_type from audit_logs where entity_id in (${textbookId}, ${returned}, ${pub}, ${rev}) order by id
    `;
    const byAction = Object.fromEntries(actors.map((r) => [r.action, r]));
    expect(byAction["curriculum.textbook_create"]).toMatchObject({ actor_id: owner.userId, entity_type: "textbook" });
    expect(byAction["curriculum.toc_import"]).toMatchObject({ actor_id: owner.userId, entity_type: "textbook" });
    expect(byAction["question.create"]).toMatchObject({ actor_id: t.user.id, entity_type: "question" });
    expect(byAction["question.submit_review"]).toMatchObject({ actor_id: t.user.id });
    expect(byAction["question.review_return"]).toMatchObject({ actor_id: owner.userId });
    expect(byAction["question.review_approve"]).toMatchObject({ actor_id: owner.userId });
    expect(byAction["question.revise"]).toMatchObject({ actor_id: t.user.id });
  });

  it("row level security is enabled on all 7 new tables", async () => {
    const tables = ["textbooks", "curriculum_units", "curriculum_lessons", "questions", "question_choices", "question_reports", "question_attempts"];
    const rows = await sql<{ relname: string; relrowsecurity: boolean }[]>`
      select relname::text as relname, relrowsecurity from pg_class
      where relnamespace = 'public'::regnamespace and relkind = 'r' and relname::text = any(${tables}::text[])
      order by relname
    `;
    expect(rows).toEqual([...tables].sort().map((relname) => ({ relname, relrowsecurity: true })));
  });
});

/* ───────────── الصفوف والمراحل المخفية ───────────── */

describe("المراحل والصفوف المخفية — المنهج يُبنى قبل الإظهار", () => {
  it("a subject under an unpublished grade gets a textbook, lessons and questions by the owner and its teacher", async () => {
    const [grade] = await sql<{ id: string; is_published: boolean; stage_published: boolean }[]>`
      select g.id, g.is_published, st.is_published as stage_published from grades g join stages st on st.id = g.stage_id where g.level = 11
    `;
    expect(grade).toMatchObject({ is_published: false, stage_published: false });
    const [subject] = await sql<{ id: string }[]>`
      insert into subjects (grade_id, slug, name, icon, is_published) values (${grade.id}, 'physics', 'الفيزياء', 'atom', false) returning id
    `;
    expect((await subjectOptions()).find((o) => o.id === subject.id)).toEqual({ id: subject.id, label: "الفيزياء · الصف الحادي عشر", hidden: true });

    // المالك: كتاب ووحدة ودرس يدويًا، ثم بقية الدروس من الفهرس
    const textbookId = await createTextbook({ subjectId: subject.id, term: 2, title: "كتاب الفيزياء", edition: "2026-2027", isCurrent: true, rightsConfirmed: true }, owner);
    expect((await listTextbooks()).find((t) => t.id === textbookId)).toMatchObject({
      grade_level: 11,
      grade_published: false,
      stage_published: false,
      subject_published: false,
      term: 2,
      is_current: true,
    });
    const unitId = await saveUnit({ textbookId, number: 1, title: "الحركة" }, owner);
    const manualLesson = await saveLesson({ unitId, number: 1, title: "السرعة", pageStart: 10, pageEnd: 20 }, owner);
    expect(await applyTocImport(textbookId, `${TOC_HEADER}\n1,الحركة,1,السرعة,10,20\n1,الحركة,2,التسارع,21,40\n`, owner)).toEqual({
      units: 1,
      lessonsCreate: 1,
      lessonsUpdate: 0,
      errors: 0,
    });
    const tb = await getTextbook(textbookId);
    expect(tb!.unitsList).toHaveLength(1);
    expect(tb!.unitsList[0].lessons.map((l) => [l.number, l.title, l.page_start, l.page_end])).toEqual([
      [1, "السرعة", 10, 20],
      [2, "التسارع", 21, 40],
    ]);
    expect(tb!.unitsList[0].lessons[0].id).toBe(manualLesson);
    const lessonId = tb!.unitsList[0].lessons[1].id;

    const ownerQ = await publishedQuestion(owner, lessonId, { page: 34 });

    // معلم مُسند إلى المادة المخفية
    const pt = await createTeacherWithSubjects({ subjectIds: [subject.id] });
    const options = await curriculumOptions(teacherActor(pt));
    expect(options.map((o) => o.textbookId)).toEqual([textbookId]);
    expect(options[0].label).toBe("الفيزياء · الصف الحادي عشر · الفصل الثاني");
    const teacherQ = await publishedQuestion(teacherActor(pt), lessonId, { page: 22 });
    expect((await servableQuestions([lessonId])).map((q) => q.id).sort()).toEqual([ownerQ, teacherQ].sort());

    // التقديم والتصحيح يعملان، والمرجع يأتي من بيانات الصف المخفي
    const cq = await serveQuestion({ userId: student.id, questionId: ownerQ, contextType: "questions_only" });
    const [correct] = await sql<{ id: string }[]>`select id from question_choices where question_id = ${ownerQ} and is_correct`;
    const graded = await gradeAnswer(cq.attemptId, student.id, clientChoiceId(cq.attemptId, correct.id));
    expect(graded).toMatchObject({ correct: true, reference: "كتاب الفيزياء، الصف الحادي عشر، الفصل الدراسي الثاني، الوحدة ١، الدرس ٢، ص ٣٤" });

    // معلم العلوم لا يدخل أسئلة في المادة المخفية
    const sciTeacher = await createTeacherWithSubjects({ subjectIds: [sciSubjectId] });
    await expect(createQuestion(mcqInput(lessonId, { page: 22 }), teacherActor(sciTeacher))).rejects.toMatchObject({ fieldErrors: { lessonId: "هذا الدرس ليس من موادك" } });
  });
});

/* ───────────── المنهج ───────────── */

describe("المنهج — استيراد الفهرس وحدود الدروس", () => {
  let tb: TestTextbook;
  let lesson1: string;
  let unit1: string;
  let questionId: string;

  const lessonCount = async () => {
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from curriculum_lessons l join curriculum_units u on u.id = l.unit_id where u.textbook_id = ${tb.id}
    `;
    return n;
  };

  beforeAll(async () => {
    const { subjectId } = await gradeAndSubject(8, "math");
    tb = await createTextbookWithLessons({
      subjectId,
      term: 1,
      lessons: [{ unit: 1, number: 1, pageStart: 10, pageEnd: 20, title: "الأعداد", unitTitle: "الأعداد والعمليات" }],
    });
    lesson1 = tb.lessonIds[0];
    unit1 = tb.unitIds[1];
    questionId = await createQuestion(mcqInput(lesson1, { page: 15 }), owner);
  });

  it("previewTocImport flags bad rows without writing anything", async () => {
    const csv = [
      TOC_HEADER,
      "1,الأعداد والعمليات,1,الأعداد,10,20",
      "1,الأعداد والعمليات,2,الكسور,21,30",
      "x,الأعداد والعمليات,3,درس,31,32",
      "1,الأعداد والعمليات,4,القسمة,40,35",
      "1,الأعداد والعمليات,2,الكسور مرة أخرى,31,33",
      "1,عنوان آخر,5,الضرب,50,52",
      "2,الهندسة,1,الزوايا,60,70",
      "1,الأعداد والعمليات,6,درس بلا نهاية,61,",
    ].join("\n");
    const p = await previewTocImport(tb.id, csv);
    expect(p.fileError).toBeUndefined();
    expect(p.rows.map((r) => [r.line, r.action, r.errors])).toEqual([
      [2, "same", []],
      [3, "create", []],
      [4, "create", ["اكتب رقمًا"]],
      [5, "create", ["صفحة النهاية قبل صفحة البداية"]],
      [6, "create", ["الدرس مكرر في الملف"]],
      [7, "create", ["عنوان الوحدة ١ يختلف عن صف سابق في الملف"]],
      [8, "create", []],
      [9, "create", ["رقم الصفحة غير صحيح"]],
    ]);
    expect(p.summary).toEqual({ units: 2, lessonsCreate: 2, lessonsUpdate: 0, errors: 5 });
    expect(await lessonCount()).toBe(1);

    // التطبيق يرفض الملف كله ولا يكتب حتى الصفوف السليمة
    await expect(applyTocImport(tb.id, csv, owner)).rejects.toThrow("في الملف أخطاء في ٥ صفوف. صحّحها ثم أعد المحاولة.");
    expect(await lessonCount()).toBe(1);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from curriculum_units where textbook_id = ${tb.id}`;
    expect(n).toBe(1);
    expect(await auditActions(tb.id)).toEqual([]);
  });

  it("narrowing an existing lesson below a question's page is an error in the preview", async () => {
    const p = await previewTocImport(tb.id, `${TOC_HEADER}\n1,الأعداد والعمليات,1,الأعداد,16,20\n`);
    expect(p.rows).toMatchObject([{ action: "update", errors: ["سؤال واحد من الدرس ستصبح خارج نطاق الصفحات"] }]);
    await expect(applyTocImport(tb.id, `${TOC_HEADER}\n1,الأعداد والعمليات,1,الأعداد,16,20\n`, owner)).rejects.toThrow("في الملف أخطاء في صف واحد");
    const [l] = await sql<{ page_start: number }[]>`select page_start from curriculum_lessons where id = ${lesson1}`;
    expect(l.page_start).toBe(10);
  });

  it("file-level errors: missing columns, broken quotes, unknown textbook, non-owner", async () => {
    expect(await previewTocImport(tb.id, "unit_number,unit_title,lesson_number,lesson_title\n1,و,1,د\n")).toMatchObject({
      rows: [],
      fileError: "أعمدة ناقصة: page_start، page_end",
    });
    expect(await previewTocImport(tb.id, `${TOC_HEADER}\n"1,الوحدة,1,الدرس,1,2\n`)).toMatchObject({ fileError: "السطر ٢: علامة اقتباس لم تُغلق" });
    expect(await previewTocImport("00000000-0000-4000-8000-000000000000", `${TOC_HEADER}\n1,الوحدة,1,الدرس,1,2\n`)).toMatchObject({ fileError: "الكتاب غير موجود" });
    await expect(applyTocImport(tb.id, "a,b\n1,2", owner)).rejects.toThrow(/^أعمدة ناقصة: unit_number/);

    const t = await createTeacherWithSubjects({ subjectIds: [tb.subjectId] });
    await expect(applyTocImport(tb.id, `${TOC_HEADER}\n2,الهندسة,1,الزوايا,31,40\n`, teacherActor(t))).rejects.toThrow("إدارة المنهج متاحة لإدارة المنصة فقط");
    await expect(saveLesson({ unitId: unit1, number: 9, title: "درس المعلم", pageStart: 90, pageEnd: 95 }, teacherActor(t))).rejects.toBeInstanceOf(PermissionError);
    expect(await lessonCount()).toBe(1);
  });

  it("applyTocImport creates and updates units and lessons in one transaction", async () => {
    const csv = `﻿${TOC_HEADER}\r\n1,الأعداد والعمليات,1,الأعداد الصحيحة,10,22\r\n1,الأعداد والعمليات,2,الكسور,23,30\r\n2,الهندسة,1,الزوايا,31,40\r\n`;
    expect(await applyTocImport(tb.id, csv, owner)).toEqual({ units: 2, lessonsCreate: 2, lessonsUpdate: 1, errors: 0 });
    const t = await getTextbook(tb.id);
    expect(t!.unitsList.map((u) => [u.number, u.title, u.lessons.map((l) => [l.number, l.title, l.page_start, l.page_end, l.questions])])).toEqual([
      [
        1,
        "الأعداد والعمليات",
        [
          [1, "الأعداد الصحيحة", 10, 22, 1],
          [2, "الكسور", 23, 30, 0],
        ],
      ],
      [2, "الهندسة", [[1, "الزوايا", 31, 40, 0]]],
    ]);
    expect(t!.unitsList[0].lessons[0].id).toBe(lesson1);
    expect(t).toMatchObject({ units: 2, lessons: 3, questions: 1 });
    const [log] = await sql<{ metadata: unknown }[]>`select metadata from audit_logs where entity_id = ${tb.id} and action = 'curriculum.toc_import'`;
    expect(log.metadata).toEqual({ units: 2, lessonsCreate: 2, lessonsUpdate: 1, errors: 0 });

    // إعادة الملف نفسه: كل الصفوف «same» ولا تغيير
    const again = await previewTocImport(tb.id, csv);
    expect(again.rows.map((r) => r.action)).toEqual(["same", "same", "same"]);
    expect(again.summary).toEqual({ units: 2, lessonsCreate: 0, lessonsUpdate: 0, errors: 0 });
  });

  it("saveLesson cannot narrow pages below an existing question; widening works", async () => {
    await expect(saveLesson({ id: lesson1, unitId: unit1, number: 1, title: "الأعداد الصحيحة", pageStart: 16, pageEnd: 22 }, owner)).rejects.toThrow(
      "لا يمكن تضييق نطاق الصفحات: سؤال واحد من الدرس خارج النطاق الجديد",
    );
    await expect(saveLesson({ id: lesson1, unitId: unit1, number: 1, title: "الأعداد الصحيحة", pageStart: 10, pageEnd: 14 }, owner)).rejects.toThrow(
      "لا يمكن تضييق نطاق الصفحات",
    );
    await expect(saveLesson({ unitId: unit1, number: 7, title: "درس مقلوب", pageStart: 30, pageEnd: 20 }, owner)).rejects.toMatchObject({
      userMessage: "راجع الحقول المظللة",
      fieldErrors: { pageEnd: "صفحة النهاية قبل صفحة البداية" },
    });
    expect(await saveLesson({ id: lesson1, unitId: unit1, number: 1, title: "الأعداد الصحيحة", pageStart: 8, pageEnd: 22 }, owner)).toBe(lesson1);
    const [l] = await sql<{ page_start: number; page_end: number }[]>`select page_start, page_end from curriculum_lessons where id = ${lesson1}`;
    expect(l).toEqual({ page_start: 8, page_end: 22 });
    expect(await auditActions(tb.id)).toContain("curriculum.lesson_update");
  });

  it("a lesson or unit with questions cannot be deleted; an empty lesson can", async () => {
    await expect(deleteLesson(lesson1, owner)).rejects.toThrow("لا يمكن حذف درس فيه أسئلة");
    await expect(deleteUnit(unit1, owner)).rejects.toThrow("لا يمكن حذف وحدة فيها أسئلة");
    // حتى لو كان السؤال مؤرشفًا
    await sql`update questions set status = 'archived' where id = ${questionId}`;
    await expect(deleteLesson(lesson1, owner)).rejects.toThrow("لا يمكن حذف درس فيه أسئلة");

    const empty = await saveLesson({ unitId: unit1, number: 8, title: "درس فارغ", pageStart: 90, pageEnd: 95 }, owner);
    await deleteLesson(empty, owner);
    expect(await sql`select id from curriculum_lessons where id = ${empty}`).toEqual([]);
    expect(await auditActions(tb.id)).toEqual(expect.arrayContaining(["curriculum.lesson_create", "curriculum.lesson_delete"]));
    await expect(deleteLesson(empty, owner)).rejects.toThrow("الدرس غير موجود");
  });

  it("createTextbook keeps one current edition per subject and term", async () => {
    const { subjectId } = await gradeAndSubject(8, "math");
    const first = await createTextbook({ subjectId, term: 2, title: "رياضيات الثامن", edition: "2025", isCurrent: true, rightsConfirmed: false }, owner);
    const second = await createTextbook({ subjectId, term: 2, title: "رياضيات الثامن", edition: "2026", isCurrent: true, rightsConfirmed: true }, owner);
    const rows = await sql<{ id: string; is_current: boolean; rights_confirmed_at: Date | null }[]>`
      select id, is_current, rights_confirmed_at from textbooks where subject_id = ${subjectId} and term = 2 order by created_at
    `;
    expect(rows.map((r) => [r.id, r.is_current])).toEqual([
      [first, false],
      [second, true],
    ]);
    expect(rows[0].rights_confirmed_at).toBeNull();
    expect(rows[1].rights_confirmed_at).toBeInstanceOf(Date);
    await expect(createTextbook({ subjectId, term: 2, title: "ك", edition: "2026", isCurrent: true, rightsConfirmed: true }, owner)).rejects.toMatchObject({
      fieldErrors: { title: "العنوان قصير" },
    });
    await expect(createTextbook({ subjectId, term: 3, title: "كتاب", edition: "2026", isCurrent: true, rightsConfirmed: true }, owner)).rejects.toMatchObject({
      fieldErrors: { term: "اختر الفصل الدراسي" },
    });
  });
});

/* ───────────── التقديم والتصحيح ───────────── */

describe("التقديم والتصحيح — serveQuestion و gradeAnswer", () => {
  let qPub: string;
  let qEx: string;
  let qTf: string;
  let qDraft: string;
  let qReview: string;
  let qPaused: string;
  let qArchived: string;
  let admin: SessionUser;

  const correctChoice = async (questionId: string) => {
    const [c] = await sql<{ id: string }[]>`select id from question_choices where question_id = ${questionId} and is_correct`;
    return c.id;
  };
  const attemptRow = async (attemptId: string) => {
    const [a] = await sql<
      {
        user_id: string;
        question_id: string;
        context_type: string;
        choice_order: string[];
        is_challenge: boolean;
        chosen_choice_id: string | null;
        is_correct: boolean | null;
        first_attempt: boolean | null;
        served_at: Date;
        shown_at: Date | null;
        answered_at: Date | null;
        response_ms: number | null;
      }[]
    >`select * from question_attempts where id = ${attemptId}`;
    return a;
  };
  const servableIds = async () => (await servableQuestions([L3])).map((q) => q.id).sort();

  beforeAll(async () => {
    admin = await createUser({ role: "admin" });
    const four = [
      { text: "نيوتن", isCorrect: true },
      { text: "جول", isCorrect: false },
      { text: "واط", isCorrect: false },
      { text: "باسكال", isCorrect: false },
    ];
    qPub = await publishedQuestion(owner, L3, { page: 45, choices: four, hint: "اسم عالم إنجليزي" });
    qEx = await publishedQuestion(owner, L3, { page: 41, sourceKind: "textbook_exercise", exerciseRef: "4" });
    qTf = await publishedQuestion(owner, L3, { page: 42, type: "true_false", trueFalseAnswer: "false", stem: "تقاس القوة بوحدة الجول." });
    qDraft = await createQuestion(mcqInput(L3, { page: 43 }), owner);
    qReview = await createQuestion(mcqInput(L3, { page: 43 }), owner);
    await submitQuestion(qReview, owner);
    qPaused = await publishedQuestion(owner, L3, { page: 44 });
    await setQuestionPaused(qPaused, true, owner);
    qArchived = await publishedQuestion(owner, L3, { page: 46 });
    await deleteOrArchiveQuestion(qArchived, owner);
  });

  it("servableQuestions excludes drafts, in-review, paused and archived questions", async () => {
    expect(await servableIds()).toEqual([qPub, qEx, qTf].sort());
    expect(await servableQuestions([])).toEqual([]);
    const [one] = (await servableQuestions([L3])).filter((q) => q.id === qPub);
    expect(one).toEqual({ id: qPub, root_id: qPub, lesson_id: L3, difficulty: 2, type: "mcq" });

    for (const id of [qDraft, qReview, qPaused, qArchived, "00000000-0000-4000-8000-000000000000"]) {
      await expect(serveQuestion({ userId: student.id, questionId: id, contextType: "game" })).rejects.toBeInstanceOf(QuestionNotServableError);
    }
    // رفع الإيقاف يعيده، والإيقاف للمالك فقط
    await setQuestionPaused(qPaused, false, owner);
    expect(await servableIds()).toContain(qPaused);
    await setQuestionPaused(qPaused, true, owner);
    expect(await servableIds()).not.toContain(qPaused);
    expect(await auditActions(qPaused)).toEqual(expect.arrayContaining(["question.pause", "question.unpause"]));
    const t = await createTeacherWithSubjects({ subjectIds: [sciSubjectId] });
    await expect(setQuestionPaused(qPub, true, teacherActor(t))).rejects.toThrow("إيقاف الأسئلة متاح لإدارة المنصة فقط");
  });

  it("hide_textbook_exercises hides textbook exercises immediately and serveQuestion refuses them", async () => {
    try {
      await saveSettings({ hide_textbook_exercises: true }, admin.id);
      expect((await getSettings()).hide_textbook_exercises).toBe(true);
      expect(await servableIds()).toEqual([qPub, qTf].sort());
      await expect(serveQuestion({ userId: student.id, questionId: qEx, contextType: "game" })).rejects.toBeInstanceOf(QuestionNotServableError);
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from question_attempts where question_id = ${qEx}`;
      expect(n).toBe(0);
      // باقي الأسئلة تُقدَّم كالمعتاد
      await expect(serveQuestion({ userId: student.id, questionId: qPub, contextType: "game" })).resolves.toHaveProperty("attemptId");
    } finally {
      await saveSettings({ hide_textbook_exercises: false }, admin.id);
    }
    expect((await getSettings()).hide_textbook_exercises).toBe(false);
    expect(await servableIds()).toEqual([qPub, qEx, qTf].sort());
    await expect(serveQuestion({ userId: student.id, questionId: qEx, contextType: "game" })).resolves.toHaveProperty("attemptId");
  });

  it("serveQuestion records an attempt and returns exactly the allowed keys, with no key, explanation or page", async () => {
    const cq = await serveQuestion({ userId: student.id, questionId: qPub, contextType: "game" });
    expect(Object.keys(cq).sort()).toEqual(["attemptId", "choices", "hint", "lang", "stem", "type"]);
    expect(cq.choices).toHaveLength(4);
    for (const c of cq.choices) {
      expect(Object.keys(c).sort()).toEqual(["id", "text"]);
      expect(c.id).toMatch(/^[A-Za-z0-9_-]{16}$/);
    }
    expect(cq).toMatchObject({ type: "mcq", lang: "ar", hint: "اسم عالم إنجليزي" });

    const dbChoices = await sql<{ id: string; text: string }[]>`select id, text from question_choices where question_id = ${qPub}`;
    const correctId = await correctChoice(qPub);
    const json = JSON.stringify(cq);
    expect(json).not.toContain(correctId);
    for (const c of dbChoices) expect(json).not.toContain(c.id);
    expect(json).not.toContain(qPub);
    for (const banned of ["is_correct", "isCorrect", "explanation", EXPLANATION, "reference", "exercise"]) {
      expect(json).not.toContain(banned);
    }
    // كل المفاتيح في أي عمق: لا مفتاح للصحة أو الشرح أو الصفحة
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (keys.add(k), walk(x));
    };
    walk(JSON.parse(json));
    expect([...keys].sort()).toEqual(["attemptId", "choices", "hint", "id", "lang", "stem", "text", "type"]);
    expect(cq.choices.map((c) => c.text).sort()).toEqual(dbChoices.map((c) => c.text).sort());

    const a = await attemptRow(cq.attemptId);
    expect(a).toMatchObject({ user_id: student.id, question_id: qPub, context_type: "game", is_challenge: false, chosen_choice_id: null, is_correct: null, first_attempt: null, shown_at: null, answered_at: null, response_ms: null });
    expect(a.served_at).toBeInstanceOf(Date);
    // ترتيب العرض مخزّن في المحاولة ويطابق ما أُرسل
    expect(a.choice_order.map((id) => clientChoiceId(cq.attemptId, id))).toEqual(cq.choices.map((c) => c.id));
  });

  it("choice ids differ between two attempts of the same question", async () => {
    const a = await serveQuestion({ userId: student.id, questionId: qPub, contextType: "game" });
    const b = await serveQuestion({ userId: student.id, questionId: qPub, contextType: "game" });
    expect(a.attemptId).not.toBe(b.attemptId);
    const idsA = new Set(a.choices.map((c) => c.id));
    for (const c of b.choices) expect(idsA.has(c.id)).toBe(false);
  });

  it("a seed gives a deterministic order; true/false keeps its fixed order", async () => {
    const one = await serveQuestion({ userId: student.id, questionId: qPub, contextType: "review", seed: 42 });
    const two = await serveQuestion({ userId: student.id, questionId: qPub, contextType: "review", seed: 42 });
    expect(two.choices.map((c) => c.text)).toEqual(one.choices.map((c) => c.text));
    for (const seed of [1, 2, 3, 99]) {
      const tf = await serveQuestion({ userId: student.id, questionId: qTf, contextType: "game", seed });
      expect(tf.choices.map((c) => c.text)).toEqual(["صح", "خطأ"]);
    }
  });

  it("choices are really shuffled: different seeds give different orders and the key moves off its authored position", async () => {
    const authored = (await sql<{ text: string; is_correct: boolean }[]>`select text, is_correct from question_choices where question_id = ${qPub} order by position`).map((c) => c.text);
    const correctText = (await sql<{ text: string }[]>`select text from question_choices where question_id = ${qPub} and is_correct`)[0].text;
    const orders = new Set<string>();
    let keyMoved = false;
    for (let seed = 1; seed <= 20; seed++) {
      const q = await serveQuestion({ userId: student.id, questionId: qPub, contextType: "review", seed });
      const texts = q.choices.map((c) => c.text);
      expect([...texts].sort()).toEqual([...authored].sort());
      orders.add(texts.join("|"));
      if (texts.indexOf(correctText) !== authored.indexOf(correctText)) keyMoved = true;
    }
    expect(orders.size).toBeGreaterThan(1);
    expect(keyMoved).toBe(true);
  });

  it("a question with attempts cannot be deleted: the attempts foreign key blocks it", async () => {
    await serveQuestion({ userId: student.id, questionId: qPub, contextType: "game" });
    await expect(sql`delete from questions where id = ${qPub}`).rejects.toThrow(/question_attempts_question_id_fkey/);
  });

  it("gradeAnswer: correct with the formatted reference, then a second answer returns null", async () => {
    const s = await createUser();
    const cq = await serveQuestion({ userId: s.id, questionId: qPub, contextType: "game" });
    const correctId = await correctChoice(qPub);
    const cid = clientChoiceId(cq.attemptId, correctId);
    expect(cq.choices.map((c) => c.id)).toContain(cid);

    expect(await gradeAnswer(cq.attemptId, s.id, cid)).toEqual({
      correct: true,
      correctChoiceId: cid,
      chosenChoiceId: cid,
      explanation: EXPLANATION,
      reference: "كتاب العلوم، الصف السابع، الفصل الدراسي الأول، الوحدة ٢، الدرس ٣، ص ٤٥",
      isChallenge: false,
      firstAttempt: true,
    });
    const wrong = cq.choices.find((c) => c.id !== cid)!.id;
    expect(await gradeAnswer(cq.attemptId, s.id, cid)).toBeNull();
    expect(await gradeAnswer(cq.attemptId, s.id, wrong)).toBeNull();

    const row = await attemptRow(cq.attemptId);
    expect(row).toMatchObject({ chosen_choice_id: correctId, is_correct: true, first_attempt: true, response_ms: null });
    expect(row.answered_at).toBeInstanceOf(Date);
  });

  it("incorrect answer on a new attempt: first_attempt false; another user cannot grade it", async () => {
    const s = await createUser();
    const first = await serveQuestion({ userId: s.id, questionId: qPub, contextType: "game" });
    const correctId = await correctChoice(qPub);
    expect((await gradeAnswer(first.attemptId, s.id, clientChoiceId(first.attemptId, correctId)))!.firstAttempt).toBe(true);

    const cq = await serveQuestion({ userId: s.id, questionId: qPub, contextType: "game" });
    const cid = clientChoiceId(cq.attemptId, correctId);
    const wrong = cq.choices.find((c) => c.id !== cid)!.id;
    expect(await gradeAnswer(cq.attemptId, student.id, wrong)).toBeNull();
    const r = await gradeAnswer(cq.attemptId, s.id, wrong);
    expect(r).toMatchObject({ correct: false, correctChoiceId: cid, chosenChoiceId: wrong, firstAttempt: false, explanation: EXPLANATION });
    expect(await attemptRow(cq.attemptId)).toMatchObject({ is_correct: false, first_attempt: false });
  });

  it("an unknown client choice returns null and leaves the attempt open", async () => {
    const s = await createUser();
    const cq = await serveQuestion({ userId: s.id, questionId: qPub, contextType: "game" });
    const other = await serveQuestion({ userId: s.id, questionId: qPub, contextType: "game" });
    expect(await gradeAnswer(cq.attemptId, s.id, "AAAAAAAAAAAAAAAA")).toBeNull();
    // معرّف خيار من محاولة أخرى لا يصلح هنا
    expect(await gradeAnswer(cq.attemptId, s.id, other.choices[0].id)).toBeNull();
    // ولا معرّف الخيار الحقيقي في القاعدة
    expect(await gradeAnswer(cq.attemptId, s.id, await correctChoice(qPub))).toBeNull();
    expect(await attemptRow(cq.attemptId)).toMatchObject({ answered_at: null, is_correct: null, chosen_choice_id: null });
    await expect(gradeAnswer(cq.attemptId, s.id, cq.choices[0].id)).resolves.not.toBeNull();
  });

  it("response_ms is null without markShown and bounded after markShown", async () => {
    const s = await createUser();
    const cq = await serveQuestion({ userId: s.id, questionId: qPub, contextType: "game" });
    expect(await markShown(cq.attemptId, student.id)).toBe(false);
    expect(await markShown(cq.attemptId, s.id)).toBe(true);
    expect(await markShown(cq.attemptId, s.id)).toBe(false);
    await new Promise((r) => setTimeout(r, 80));
    await gradeAnswer(cq.attemptId, s.id, cq.choices[0].id);
    const row = await attemptRow(cq.attemptId);
    expect(row.shown_at).toBeInstanceOf(Date);
    expect(row.response_ms).not.toBeNull();
    expect(row.response_ms!).toBeGreaterThanOrEqual(60);
    expect(row.response_ms!).toBeLessThan(10_000);
    expect(Math.abs(row.response_ms! - (row.answered_at!.getTime() - row.shown_at!.getTime()))).toBeLessThanOrEqual(2);
    // لا ظهور بعد الإجابة
    expect(await markShown(cq.attemptId, s.id)).toBe(false);
  });

  it("the reference includes the exercise number, and the challenge flag comes from the stored attempt", async () => {
    const s = await createUser();
    const cq = await serveQuestion({ userId: s.id, questionId: qEx, contextType: "game", isChallenge: true });
    const r = await gradeAnswer(cq.attemptId, s.id, clientChoiceId(cq.attemptId, await correctChoice(qEx)));
    expect(r).toMatchObject({
      correct: true,
      isChallenge: true,
      reference: "كتاب العلوم، الصف السابع، الفصل الدراسي الأول، الوحدة ٢، الدرس ٣، ص ٤١، تمرين ٤",
    });
  });

  it("malformed ids are treated as unknown (null/false/not servable), not as database errors", async () => {
    // معرّف المحاولة يأتي من العميل: معرّف مشوّه يجب أن يُعامل كمحاولة غير موجودة لا أن يرمي خطأ 22P02 من القاعدة
    await expect(gradeAnswer("not-a-uuid", student.id, "AAAAAAAAAAAAAAAA")).resolves.toBeNull();
    await expect(markShown("not-a-uuid", student.id)).resolves.toBe(false);
    await expect(serveQuestion({ userId: student.id, questionId: "not-a-uuid", contextType: "game" })).rejects.toBeInstanceOf(QuestionNotServableError);
  });

  it("previewClientQuestion uses the same safe shape", () => {
    const p = previewClientQuestion({
      type: "mcq",
      lang: "ar",
      stem: "سؤال معاينة",
      hint: null,
      choices: [
        { id: "11111111-1111-4111-8111-111111111111", text: "أ" },
        { id: "22222222-2222-4222-8222-222222222222", text: "ب" },
      ],
    });
    expect(Object.keys(p).sort()).toEqual(["attemptId", "choices", "hint", "lang", "stem", "type"]);
    expect(p.choices.map((c) => c.text)).toEqual(["أ", "ب"]);
    expect(JSON.stringify(p)).not.toContain("11111111-1111-4111-8111-111111111111");
  });
});

describe("المعلم لا ينقل مسودته إلى مادة أخرى أو طبعة قديمة", () => {
  it("updateQuestion rejects a lesson outside the teacher's subjects and a lesson of a non-current edition", async () => {
    const t = await createTeacherWithSubjects({ subjectIds: [sciSubjectId] });
    const id = await createQuestion(mcqInput(L1), teacherActor(t));
    const math = await createTextbookWithLessons({ subjectId: mathSubjectId, term: 1, lessons: [{ unit: 1, number: 1, pageStart: 10, pageEnd: 20 }] });
    await expect(updateQuestion(id, mcqInput(math.lessonIds[0]), teacherActor(t))).rejects.toMatchObject({ fieldErrors: { lessonId: "هذا الدرس ليس من موادك" } });
    const old = await createTextbookWithLessons({ subjectId: sciSubjectId, term: 2, current: false, lessons: [{ unit: 1, number: 1, pageStart: 10, pageEnd: 20 }] });
    await expect(updateQuestion(id, mcqInput(old.lessonIds[0]), teacherActor(t))).rejects.toMatchObject({ fieldErrors: { lessonId: "هذا الكتاب ليس الطبعة الحالية" } });
    const [{ lesson_id }] = await sql<{ lesson_id: string }[]>`select lesson_id from questions where id = ${id}`;
    expect(lesson_id).toBe(L1);
  });
});

describe("تعديل الكتاب والوحدات — الطبعة الحالية والحقوق وسجل التدقيق", () => {
  it("updateTextbook switches the current edition, clears rights when unchecked, and audits", async () => {
    const subjectId = (await gradeAndSubject(8, "science")).subjectId;
    const first = await createTextbook({ subjectId, term: 1, title: "علوم ٨ طبعة أولى", edition: "2025", isCurrent: true, rightsConfirmed: true }, owner);
    const second = await createTextbook({ subjectId, term: 1, title: "علوم ٨ طبعة ثانية", edition: "2026", isCurrent: true, rightsConfirmed: true }, owner);
    expect(await sql`select id, is_current from textbooks where id in (${first}, ${second}) order by title`).toEqual([
      { id: first, is_current: false },
      { id: second, is_current: true },
    ]);
    await updateTextbook(first, { title: "علوم ٨ طبعة أولى", edition: "2025", isCurrent: true, rightsConfirmed: false }, owner);
    expect(await sql`select id, is_current, rights_confirmed_at is null as no_rights from textbooks where id in (${first}, ${second}) order by title`).toEqual([
      { id: first, is_current: true, no_rights: true },
      { id: second, is_current: false, no_rights: false },
    ]);
    expect(await auditActions(first)).toEqual(["curriculum.textbook_create", "curriculum.textbook_update"]);
  });

  it("saveUnit creates and updates, deleteUnit removes an empty unit, each with an audit row", async () => {
    const subjectId = (await gradeAndSubject(8, "math")).subjectId;
    const tb = await createTextbook({ subjectId, term: 2, title: "رياضيات ٨", edition: "2026", isCurrent: true, rightsConfirmed: true }, owner);
    const unit = await saveUnit({ textbookId: tb, number: 1, title: "الأعداد" }, owner);
    await saveUnit({ id: unit, textbookId: tb, number: 1, title: "الأعداد والعمليات" }, owner);
    expect(await sql`select title from curriculum_units where id = ${unit}`).toEqual([{ title: "الأعداد والعمليات" }]);
    await deleteUnit(unit, owner);
    expect(await sql`select id from curriculum_units where id = ${unit}`).toEqual([]);
    expect(await auditActions(tb)).toEqual(["curriculum.textbook_create", "curriculum.unit_create", "curriculum.unit_update", "curriculum.unit_delete"]);
  });
});

describe("استيراد الفهرس بأرقام عربية", () => {
  it("previewTocImport accepts Arabic-Indic digits typed on an Arabic keyboard", async () => {
    const subjectId = (await gradeAndSubject(9, "science")).subjectId;
    const tb = await createTextbook({ subjectId, term: 1, title: "علوم ٩", edition: "2026", isCurrent: true, rightsConfirmed: true }, owner);
    const p = await previewTocImport(tb, `${TOC_HEADER}\n١,الطاقة,١,أشكال الطاقة,١٠,١٨\n`);
    expect(p.summary).toMatchObject({ errors: 0, lessonsCreate: 1 });
    expect(p.rows[0]).toMatchObject({ unitNumber: 1, lessonNumber: 1, pageStart: 10, pageEnd: 18 });
  });
});

describe("الفصول — الوحدة ← الفصل ← الدرس كما في كتب العلوم الجديدة", () => {
  const CH_HEADER = "unit_number,unit_title,chapter_number,chapter_title,lesson_number,lesson_title,page_start,page_end";
  /** فهرس كتاب العلوم للصف السابع، الفصل الدراسي الأول (طبعة 2026/2027) المحفوظ في الوثائق للاستيراد */
  function scienceIndex(): string {
    const decoded = decodeCsvBytes(new Uint8Array(readFileSync(join(process.cwd(), "docs/game/toc/science-g7-term1.csv"))));
    if ("error" in decoded) throw new Error(decoded.error);
    return decoded.text;
  }
  /** كتاب فارغ للصف السادس (غير حالي افتراضيًا كي لا يزاحم كتب الاختبارات الأخرى؛ الحالي للفصل الثاني) */
  async function emptyBook(current = false): Promise<string> {
    const subjectId = (await gradeAndSubject(6, "science")).subjectId;
    return createTextbook({ subjectId, term: current ? 2 : 1, title: `علوم ٦ ${++seq}`, edition: "2026/2027", isCurrent: current, rightsConfirmed: true }, owner);
  }

  it("imports the real grade 7 science index: 4 units, 7 chapters, 18 lessons, lesson numbers restarting per chapter", async () => {
    const tb = await emptyBook();
    const p = await previewTocImport(tb, scienceIndex());
    expect(p.fileError).toBeUndefined();
    expect(p.summary).toEqual({ units: 4, lessonsCreate: 18, lessonsUpdate: 0, errors: 0 });
    expect(await applyTocImport(tb, scienceIndex(), owner)).toEqual({ units: 4, lessonsCreate: 18, lessonsUpdate: 0, errors: 0 });

    const book = (await getTextbook(tb))!;
    expect(book.unitsList.map((u) => [u.number, u.lessons.length])).toEqual([[1, 6], [2, 2], [3, 6], [4, 4]]);
    const physics = book.unitsList[2];
    expect(physics.lessons.map((l) => [l.chapter_number, l.number, l.page_start, l.page_end])).toEqual([
      [1, 1, 120, 126],
      [1, 2, 127, 136],
      [2, 1, 138, 144],
      [2, 2, 145, 150],
      [2, 3, 151, 155],
      [2, 4, 156, 165],
    ]);
    expect(new Set(physics.lessons.map((l) => l.chapter_title))).toEqual(new Set(["ضغط السوائل", "الطفو"]));

    // إعادة الاستيراد بلا تغيير: لا شيء يُكتب
    expect((await previewTocImport(tb, scienceIndex())).rows.every((r) => r.action === "same")).toBe(true);
  });

  it("the student reference names the chapter, and the lesson picker carries it", async () => {
    const tb = await emptyBook(true);
    await applyTocImport(tb, scienceIndex(), owner);
    const [archimedes] = await sql<{ id: string }[]>`
      select l.id from curriculum_lessons l join curriculum_units u on u.id = l.unit_id where u.textbook_id = ${tb} and l.title = 'قاعدة أرخميدس'
    `;
    const qid = await createQuestion(mcqInput(archimedes.id, { page: 146, exerciseRef: "2" }), owner);
    const detail = (await getQuestion(qid, owner))!;
    expect(detail.reference).toMatch(/^كتاب العلوم، .+، الفصل الدراسي الثاني، الوحدة ٣، الفصل ٢، الدرس ٢، ص ١٤٦، تمرين ٢$/);
    const option = (await curriculumOptions(owner)).find((o) => o.textbookId === tb)!;
    expect(option.units[2].lessons.find((l) => l.id === archimedes.id)).toMatchObject({ chapterNumber: 2, chapterTitle: "الطفو", number: 2 });
  });

  it("flags chapter mistakes in the index file row by row", async () => {
    const tb = await emptyBook();
    const csv = [
      CH_HEADER,
      "1,الحركة,1,السرعة,1,المسافة,10,14",
      "1,الحركة,1,السرعة والتسارع,2,الإزاحة,15,19", // عنوان الفصل نفسه مختلف
      "1,الحركة,2,القوى,1,الدفع,20,24", // رقم الدرس ١ مرة أخرى لكن في فصل آخر: صحيح
      "1,الحركة,2,القوى,1,الجذب,25,29", // مكرر داخل الفصل نفسه
      "1,الحركة,,,3,بلا فصل,30,34", // خلط فصول وبلا فصول في الوحدة
      "2,الطاقة,3,,1,الحرارة,40,44", // رقم فصل بلا عنوان
    ].join("\n");
    const p = await previewTocImport(tb, csv);
    expect(p.rows.map((r) => r.errors)).toEqual([
      [],
      ["عنوان الفصل ١ يختلف عن صف سابق في الملف"],
      [],
      ["الدرس مكرر في الملف"],
      ["دروس الوحدة ١ في الملف بعضها بفصول وبعضها بلا فصول"],
      ["اكتب عنوان الفصل"],
    ]);
    await expect(applyTocImport(tb, csv, owner)).rejects.toThrow("في الملف أخطاء في ٤ صفوف");
  });

  it("an index without chapter columns still works, and cannot add chaptered lessons to a chapterless unit", async () => {
    const tb = await emptyBook();
    expect(await applyTocImport(tb, `${TOC_HEADER}\n1,الأعداد,1,الجمع,10,15\n`, owner)).toMatchObject({ lessonsCreate: 1, errors: 0 });
    const p = await previewTocImport(tb, `${CH_HEADER}\n1,الأعداد,1,العمليات,2,الطرح,16,20\n`);
    expect(p.rows[0].errors).toEqual(["دروس الوحدة ١ المحفوظة بلا فصول"]);
  });

  it("saveLesson: chapter number and title together, one title per chapter, no mixing inside a unit", async () => {
    const tb = await emptyBook();
    const unitId = await saveUnit({ textbookId: tb, number: 1, title: "المادة" }, owner);
    const first = await saveLesson({ unitId, chapterNumber: "١", chapterTitle: "الحالات", number: 1, title: "الصلب", pageStart: 10, pageEnd: 12 }, owner);
    const second = await saveLesson({ unitId, chapterNumber: 1, chapterTitle: "الحالات", number: 2, title: "السائل", pageStart: 13, pageEnd: 15 }, owner);
    // الرقم ١ نفسه في فصل آخر مسموح
    await saveLesson({ unitId, chapterNumber: 2, chapterTitle: "التغيرات", number: 1, title: "الانصهار", pageStart: 16, pageEnd: 18 }, owner);

    expect(await rejectionOf(saveLesson({ unitId, chapterNumber: 3, chapterTitle: "", number: 1, title: "التبخر", pageStart: 19, pageEnd: 20 }, owner))).toMatchObject({
      fieldErrors: { chapterTitle: "اكتب عنوان الفصل" },
    });
    expect(await rejectionOf(saveLesson({ unitId, number: 9, title: "بلا فصل", pageStart: 21, pageEnd: 22 }, owner))).toMatchObject({
      message: "دروس هذه الوحدة مقسّمة إلى فصول",
      fieldErrors: { chapterNumber: "اكتب رقم الفصل كما في الكتاب" },
    });

    // تعديل عنوان الفصل من درس واحد يعدّله في بقية دروسه
    await saveLesson({ id: first, unitId, chapterNumber: 1, chapterTitle: "حالات المادة", number: 1, title: "الصلب", pageStart: 10, pageEnd: 12 }, owner);
    expect(await sql`select id, chapter_title from curriculum_lessons where id in (${first}, ${second}) order by number`).toEqual([
      { id: first, chapter_title: "حالات المادة" },
      { id: second, chapter_title: "حالات المادة" },
    ]);
  });

  it("the database rejects a chapter number without a title and a duplicate lesson inside one chapter", async () => {
    const tb = await emptyBook();
    const unitId = await saveUnit({ textbookId: tb, number: 1, title: "الكهرباء" }, owner);
    await expect(sql`insert into curriculum_lessons (unit_id, chapter_number, number, title, page_start, page_end) values (${unitId}, 1, 1, 'التيار', 1, 2)`).rejects.toThrow();
    await sql`insert into curriculum_lessons (unit_id, chapter_number, chapter_title, number, title, page_start, page_end) values (${unitId}, 1, 'الدوائر', 1, 'التيار', 1, 2)`;
    await expect(
      sql`insert into curriculum_lessons (unit_id, chapter_number, chapter_title, number, title, page_start, page_end) values (${unitId}, 1, 'الدوائر', 1, 'الجهد', 3, 4)`,
    ).rejects.toThrow(/curriculum_lessons_number_idx/);
    // الرقم نفسه في فصل آخر مقبول
    await sql`insert into curriculum_lessons (unit_id, chapter_number, chapter_title, number, title, page_start, page_end) values (${unitId}, 2, 'المغناطيس', 1, 'الأقطاب', 5, 6)`;
  });
});
