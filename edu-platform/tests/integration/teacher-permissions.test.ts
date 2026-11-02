import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertProductAccess, PermissionError, type Actor } from "@/server/auth/permissions";
import { checkFileAccess, grantProduct, isTeacherOfProduct } from "@/server/access/entitlements";
import { checkLessonAccess, playbackFor } from "@/server/access/lessons";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createContainer, createProduct, createTeacher, createUser, createVideoProduct, type TestTeacher } from "../helpers/factories";

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await closeDb();
});

function teacherActor(t: TestTeacher, canUpload = true): Actor {
  return { kind: "teacher", userId: t.user!.id, name: t.displayName, email: t.user!.email, teacherId: t.id, teacherName: t.displayName, canUpload };
}

async function ownerActor(): Promise<Actor> {
  const u = await createUser({ role: "admin" });
  return { kind: "owner", userId: u.id, name: u.fullName, email: u.email, teacherId: null, canUpload: true };
}

async function setStatus(id: string, status: string) {
  await sql`update products set status = ${status} where id = ${id}`;
}

describe("assertProductAccess — المعلم يرى ويعدّل محتواه فقط", () => {
  it("teacher can view, edit and upload to own draft", async () => {
    const a = await createTeacher({ mode: "self_managed" });
    const p = await createVideoProduct({ teacherId: a.id, status: "draft" });
    for (const need of ["view", "edit", "upload"] as const) {
      await expect(assertProductAccess(teacherActor(a), p.id, need)).resolves.toMatchObject({ id: p.id, teacher_id: a.id });
    }
  });

  it("content in review or published is read-only for the teacher", async () => {
    const a = await createTeacher({ mode: "self_managed" });
    const p = await createVideoProduct({ teacherId: a.id, status: "draft" });
    await setStatus(p.id, "in_review");
    await expect(assertProductAccess(teacherActor(a), p.id, "view")).resolves.toBeTruthy();
    await expect(assertProductAccess(teacherActor(a), p.id, "edit")).rejects.toThrow(/قيد المراجعة/);
    await setStatus(p.id, "published");
    await expect(assertProductAccess(teacherActor(a), p.id, "edit")).rejects.toThrow(/لا يمكن تعديل محتوى منشور/);
    await expect(assertProductAccess(teacherActor(a), p.id, "upload")).rejects.toBeInstanceOf(PermissionError);
  });

  it("another teacher cannot view or touch it — same 'not found' message (no existence leak)", async () => {
    const a = await createTeacher({ mode: "self_managed" });
    const b = await createTeacher({ mode: "self_managed" });
    const p = await createVideoProduct({ teacherId: a.id, status: "draft" });
    for (const need of ["view", "edit", "upload"] as const) {
      await expect(assertProductAccess(teacherActor(b), p.id, need)).rejects.toThrow("المنتج غير موجود");
    }
    // ولا منتجات المنصة (بلا معلم)
    const platform = await createProduct({ status: "draft" });
    await expect(assertProductAccess(teacherActor(b), platform.id, "view")).rejects.toThrow("المنتج غير موجود");
  });

  it("upload is blocked when the owner disabled upload rights; editing stays allowed", async () => {
    const a = await createTeacher({ mode: "self_managed", canUpload: false });
    const p = await createVideoProduct({ teacherId: a.id, status: "draft" });
    await expect(assertProductAccess(teacherActor(a, false), p.id, "edit")).resolves.toBeTruthy();
    await expect(assertProductAccess(teacherActor(a, false), p.id, "upload")).rejects.toThrow(/صلاحية الرفع موقوفة/);
  });

  it("the owner can do everything on any product; invalid ids are rejected", async () => {
    const owner = await ownerActor();
    const a = await createTeacher({ mode: "self_managed" });
    const p = await createVideoProduct({ teacherId: a.id, status: "published" });
    for (const need of ["view", "edit", "upload"] as const) await expect(assertProductAccess(owner, p.id, need)).resolves.toBeTruthy();
    await expect(assertProductAccess(owner, "not-a-uuid", "view")).rejects.toThrow("المنتج غير موجود");
    await expect(assertProductAccess(owner, "00000000-0000-0000-0000-000000000000", "view")).rejects.toThrow("المنتج غير موجود");
  });
});

describe("هوية المعلم المرتبطة بالحساب", () => {
  it("isTeacherOfProduct is true only for the self-managed teacher's own products", async () => {
    const a = await createTeacher({ mode: "self_managed" });
    const b = await createTeacher({ mode: "self_managed" });
    const p = await createVideoProduct({ teacherId: a.id });
    expect(await isTeacherOfProduct(a.user!.id, p.id)).toBe(true);
    expect(await isTeacherOfProduct(b.user!.id, p.id)).toBe(false);
  });

  it("a managed teacher (even with a linked user row) has no teacher privileges", async () => {
    const m = await createTeacher({ mode: "managed", withUser: true });
    const p = await createVideoProduct({ teacherId: m.id });
    expect(await isTeacherOfProduct(m.user!.id, p.id)).toBe(false);
  });

  it("switching managed ↔ self-managed keeps content, sales and student access intact", async () => {
    const t = await createTeacher({ mode: "managed" });
    const p = await createVideoProduct({ teacherId: t.id, lessons: 2 });
    const student = await createUser();
    await sql.begin((tx) => grantProduct(tx, { userId: student.id, productId: p.id, source: "purchase" }));
    const login = await createUser({ role: "teacher" });
    await sql`update teachers set mode = 'self_managed', user_id = ${login.id} where id = ${t.id}`;
    expect(await isTeacherOfProduct(login.id, p.id)).toBe(true);
    await sql`update teachers set mode = 'managed', user_id = null where id = ${t.id}`;
    expect(await isTeacherOfProduct(login.id, p.id)).toBe(false);
    const [row] = await sql<{ teacher_id: string }[]>`select teacher_id from products where id = ${p.id}`;
    expect(row.teacher_id).toBe(t.id);
    expect((await checkLessonAccess(p.lessonIds[1], student)).ok).toBe(true);
  });

  it("self_managed without a login account is rejected by the database", async () => {
    await expect(sql`insert into teachers (slug, display_name, mode) values ('no-user-x', 'بلا حساب', 'self_managed')`).rejects.toThrow();
  });
});

describe("checkLessonAccess — حماية الدروس على الخادم", () => {
  it("processing lessons are hidden from students (not_ready) but visible to staff", async () => {
    const t = await createTeacher({ mode: "self_managed" });
    const p = await createVideoProduct({ teacherId: t.id, ready: false, freePreviewIndex: 0 });
    const student = await createUser();
    await sql.begin((tx) => grantProduct(tx, { userId: student.id, productId: p.id, source: "purchase" }));
    expect(await checkLessonAccess(p.lessonIds[0], student)).toEqual({ ok: false, reason: "not_ready" });
    expect(await checkLessonAccess(p.lessonIds[0], null)).toEqual({ ok: false, reason: "not_ready" });
    expect(await checkLessonAccess(p.lessonIds[0], t.user!)).toMatchObject({ ok: true, via: "staff" });
    const owner = await createUser({ role: "admin" });
    expect(await checkLessonAccess(p.lessonIds[0], owner)).toMatchObject({ ok: true, via: "staff" });
  });

  it("free preview lessons: visitors may watch only when ready and the product is published", async () => {
    const p = await createVideoProduct({ freePreviewIndex: 0 });
    expect(await checkLessonAccess(p.lessonIds[0], null)).toMatchObject({ ok: true, via: "free" });
    expect(await checkLessonAccess(p.lessonIds[1], null)).toEqual({ ok: false, reason: "unauthenticated" });
    await setStatus(p.id, "hidden");
    expect(await checkLessonAccess(p.lessonIds[0], null)).toEqual({ ok: false, reason: "unauthenticated" });
  });

  it("buyers (directly or through a container) watch; other students are forbidden", async () => {
    const p = await createVideoProduct({ lessons: 3 });
    const course = await createContainer({ type: "video_course", items: [p.id] });
    const direct = await createUser();
    const viaCourse = await createUser();
    const other = await createUser();
    await sql.begin((tx) => grantProduct(tx, { userId: direct.id, productId: p.id, source: "purchase" }));
    await sql.begin((tx) => grantProduct(tx, { userId: viaCourse.id, productId: course.id, source: "purchase" }));
    for (const id of p.lessonIds) {
      expect(await checkLessonAccess(id, direct)).toMatchObject({ ok: true, via: "owned" });
      expect(await checkLessonAccess(id, viaCourse)).toMatchObject({ ok: true, via: "owned" });
      expect(await checkLessonAccess(id, other)).toEqual({ ok: false, reason: "forbidden" });
    }
    // معلم آخر لا يصل لدروس غيره
    const stranger = await createTeacher({ mode: "self_managed" });
    expect(await checkLessonAccess(p.lessonIds[0], stranger.user!)).toEqual({ ok: false, reason: "forbidden" });
  });

  it("unpublished lessons and malformed ids are not found", async () => {
    const p = await createVideoProduct({ lessons: 1 });
    await sql`update lessons set is_published = false where id = ${p.lessonIds[0]}`;
    const buyer = await createUser();
    await sql.begin((tx) => grantProduct(tx, { userId: buyer.id, productId: p.id, source: "purchase" }));
    expect(await checkLessonAccess(p.lessonIds[0], buyer)).toEqual({ ok: false, reason: "not_found" });
    expect(await checkLessonAccess("../../etc/passwd", buyer)).toEqual({ ok: false, reason: "not_found" });
  });

  it("file lessons stream through the protected route (no public storage URL)", async () => {
    const p = await createVideoProduct({ lessons: 1 });
    const [l] = await sql<{ id: string; provider: "file"; video_ref: string }[]>`select id, provider, video_ref from lessons where id = ${p.lessonIds[0]}`;
    expect(playbackFor(l)).toEqual({ kind: "file", src: `/api/lessons/${l.id}/stream` });
  });
});

describe("checkFileAccess — المعلم ومذكرات PDF", () => {
  it("a teacher can open own product files (main + preview) but not another teacher's", async () => {
    const a = await createTeacher({ mode: "self_managed" });
    const b = await createTeacher({ mode: "self_managed" });
    const p = await createProduct({ status: "draft" });
    await sql`update products set teacher_id = ${a.id} where id = ${p.id}`;
    expect((await checkFileAccess(p.mainFileId!, a.user!)).ok).toBe(true);
    expect((await checkFileAccess(p.previewFileId!, a.user!)).ok).toBe(true);
    expect(await checkFileAccess(p.mainFileId!, b.user!)).toEqual({ ok: false, reason: "forbidden" });
    expect(await checkFileAccess(p.previewFileId!, b.user!)).toEqual({ ok: false, reason: "not_found" });
  });
});
