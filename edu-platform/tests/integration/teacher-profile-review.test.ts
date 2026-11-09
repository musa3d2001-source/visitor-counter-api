import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { completeUpload } from "@/server/admin/uploads";
import { approveProfileChange, listPendingProfileChanges, pendingProfileChangesCount, proposeTeacherPhoto, proposeTeacherText, rejectProfileChange, teacherProfileState } from "@/server/admin/teacher-profile-review";
import { setTeacherPhoto } from "@/server/admin/teachers";
import { getTeacherBySlug } from "@/server/catalog/queries";
import type { Actor } from "@/server/auth/permissions";
import { storage } from "@/server/storage";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createTeacher, createUser, type TestTeacher } from "../helpers/factories";

const ctx = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/http", async (original) => ({ ...(await original<typeof import("@/server/http")>()), clientIp: async () => "192.0.2.74", userAgent: async () => "t" }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh() {} }),
  usePathname: () => "/admin/review",
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock("@/server/auth/session", async (original) => ({
  ...(await original<typeof import("@/server/auth/session")>()),
  getCurrentUser: async () => ctx.user,
  getCurrentSession: async () => (ctx.user ? { user: ctx.user, mustChangePassword: false, needsTwoFactorEnrolment: false } : null),
}));

const { removeOwnPhotoAction, updateOwnProfileAction } = await import("@/app/admin/profile/actions");
const { approveProfileChangeAction, rejectProfileChangeAction } = await import("@/app/admin/review/actions");
const { default: ReviewPage } = await import("@/app/admin/review/page");
const { default: ProfilePage } = await import("@/app/admin/profile/page");

let owner: Awaited<ReturnType<typeof createUser>>;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 1, 2, 3, 4]);
const actorOf = (t: TestTeacher): Extract<Actor, { kind: "teacher" }> => ({ kind: "teacher", userId: t.user!.id, name: t.displayName, email: t.user!.email, teacherId: t.id, teacherName: t.displayName, canUpload: true });
const sessionOf = (t: TestTeacher) => ({ id: t.user!.id, email: t.user!.email, fullName: t.displayName, phone: null, role: "teacher" as const, gradeId: null, isActive: true });
const ownerSession = () => ({ id: owner.id, email: owner.email, fullName: "المالك", phone: null, role: "admin" as const, gradeId: null, isActive: true });
const form = (values: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
};
const liveOf = async (id: string) => (await sql<{ headline: string; bio: string; photo_key: string | null; slug: string }[]>`select headline, bio, photo_key, slug from teachers where id = ${id}`)[0];
const newTeacher = async () => {
  const t = await createTeacher({ mode: "self_managed", shareBps: 4000 });
  await sql`update teachers set headline = 'عنوان معتمد', bio = 'نبذة معتمدة' where id = ${t.id}`;
  return t;
};
const putPhoto = async (t: TestTeacher) => {
  const key = `teachers/${t.id}/2026/11/${randomUUID()}.png`;
  await storage().put("public", key, PNG, "image/png");
  return key;
};
const exists = async (key: string) => Boolean(await storage().stat("public", key));
const pendingId = async (teacherId: string) => (await teacherProfileState(teacherId)).pending!.id;
const audits = (teacherId: string, action: string) => sql<{ actor_id: string; reason: string | null }[]>`select actor_id, reason from audit_logs where entity_id = ${teacherId} and action = ${action}`;

beforeAll(async () => {
  await resetDb();
  owner = await createUser({ role: "admin" });
});
afterAll(closeDb);
beforeEach(() => {
  ctx.user = null;
});

describe("الصفحة العامة تبقى على المعتمد", () => {
  it("the teacher's edit waits, and the public page keeps the approved text until the owner approves", async () => {
    const t = await newTeacher();
    ctx.user = sessionOf(t);
    const res = await updateOwnProfileAction(null, form({ headline: "عنوان جديد", bio: "نبذة جديدة" }));
    expect(res?.ok).toBe(true);
    expect(res?.message).toContain("للمراجعة");

    const { slug } = await liveOf(t.id);
    const publicBefore = await getTeacherBySlug(slug);
    expect(publicBefore).toMatchObject({ headline: "عنوان معتمد", bio: "نبذة معتمدة" });

    await approveProfileChange(await pendingId(t.id), owner.id);
    expect(await liveOf(t.id)).toMatchObject({ headline: "عنوان جديد", bio: "نبذة جديدة" });
    const logs = await audits(t.id, "teacher.profile_approve");
    expect(logs).toHaveLength(1);
    expect(logs[0].actor_id).toBe(owner.id);
  });

  it("a photo the teacher uploads does not replace the live one until approved, then the old file goes", async () => {
    const t = await newTeacher();
    const oldKey = await putPhoto(t);
    await sql`update teachers set photo_key = ${oldKey} where id = ${t.id}`;
    const newKey = await putPhoto(t);

    const res = await completeUpload({ target: "teacher_photo", key: newKey, teacherId: t.id, originalName: "a.png" }, actorOf(t));
    expect(res.message).toContain("بانتظار موافقة الإدارة");
    expect((await liveOf(t.id)).photo_key).toBe(oldKey);
    expect((await teacherProfileState(t.id)).pending).toMatchObject({ photo_action: "replace", photo_key: newKey });

    await approveProfileChange(await pendingId(t.id), owner.id);
    expect((await liveOf(t.id)).photo_key).toBe(newKey);
    expect(await exists(oldKey)).toBe(false);
    expect(await exists(newKey)).toBe(true);
  });

  it("removing a photo is a request as well", async () => {
    const t = await newTeacher();
    const key = await putPhoto(t);
    await sql`update teachers set photo_key = ${key} where id = ${t.id}`;
    ctx.user = sessionOf(t);
    expect((await removeOwnPhotoAction(null))?.ok).toBe(true);
    expect((await liveOf(t.id)).photo_key).toBe(key);
    expect(await exists(key)).toBe(true);
    await approveProfileChange(await pendingId(t.id), owner.id);
    expect((await liveOf(t.id)).photo_key).toBeNull();
    expect(await exists(key)).toBe(false);
  });

  it("the owner's own upload is direct, as before", async () => {
    const t = await newTeacher();
    const key = await putPhoto(t);
    const ownerActor: Actor = { kind: "owner", userId: owner.id, name: "م", email: owner.email, teacherId: null, canUpload: true };
    await completeUpload({ target: "teacher_photo", key, teacherId: t.id, originalName: "a.png" }, ownerActor);
    expect((await liveOf(t.id)).photo_key).toBe(key);
    expect((await teacherProfileState(t.id)).pending).toBeNull();
    await setTeacherPhoto(t.id, null, owner.id);
  });

  it("an approval changes only what the teacher changed", async () => {
    const t = await newTeacher();
    const key = await putPhoto(t);
    await sql`update teachers set photo_key = ${key} where id = ${t.id}`;
    await proposeTeacherText(actorOf(t), { headline: "عنوان معتمد", bio: "نبذة أخرى فقط" });
    await approveProfileChange(await pendingId(t.id), owner.id);
    expect(await liveOf(t.id)).toMatchObject({ headline: "عنوان معتمد", bio: "نبذة أخرى فقط", photo_key: key });
    expect(await exists(key)).toBe(true);

    const next = await putPhoto(t);
    await proposeTeacherPhoto(actorOf(t), next);
    await approveProfileChange(await pendingId(t.id), owner.id);
    expect(await liveOf(t.id)).toMatchObject({ headline: "عنوان معتمد", bio: "نبذة أخرى فقط", photo_key: next });
  });

  it("the owner's waiting count follows the pending edits", async () => {
    const t = await newTeacher();
    const before = await pendingProfileChangesCount();
    await proposeTeacherText(actorOf(t), { headline: "جديد", bio: "نبذة معتمدة" });
    expect(await pendingProfileChangesCount()).toBe(before + 1);
    await approveProfileChange(await pendingId(t.id), owner.id);
    expect(await pendingProfileChangesCount()).toBe(before);
  });

  it("withdrawing a photo that was never live tells the truth and keeps a pending text", async () => {
    const t = await newTeacher();
    const key = await putPhoto(t);
    await proposeTeacherPhoto(actorOf(t), key);
    await proposeTeacherText(actorOf(t), { headline: "نص معلق", bio: "نبذة معتمدة" });
    ctx.user = sessionOf(t);
    const res = await removeOwnPhotoAction(null);
    expect(res?.message).toContain("أُلغيت");
    expect(await exists(key)).toBe(false);
    expect((await teacherProfileState(t.id)).pending).toMatchObject({ headline: "نص معلق", photo_action: "none", photo_key: null });
  });
});

describe("الرفض", () => {
  it("keeps the approved version, needs a reason, shows it to the teacher and removes the unused photo", async () => {
    const t = await newTeacher();
    const key = await putPhoto(t);
    await proposeTeacherPhoto(actorOf(t), key);
    await proposeTeacherText(actorOf(t), { headline: "مرفوض", bio: "نبذة معتمدة" });
    const id = await pendingId(t.id);

    await expect(rejectProfileChange(id, "  ", owner.id)).rejects.toThrow(/سبب الرفض/);
    await rejectProfileChange(id, "الصورة غير واضحة", owner.id);
    expect(await liveOf(t.id)).toMatchObject({ headline: "عنوان معتمد", photo_key: null });
    expect(await exists(key)).toBe(false);
    expect((await teacherProfileState(t.id)).rejected).toMatchObject({ review_note: "الصورة غير واضحة" });
    expect(await audits(t.id, "teacher.profile_reject")).toEqual([{ actor_id: owner.id, reason: "الصورة غير واضحة" }]);

    ctx.user = sessionOf(t);
    expect(renderToStaticMarkup(await ProfilePage())).toContain("الصورة غير واضحة");
  });

  it("a new submission clears the old rejection note", async () => {
    const t = await newTeacher();
    await proposeTeacherText(actorOf(t), { headline: "أولى", bio: "نبذة معتمدة" });
    await rejectProfileChange(await pendingId(t.id), "لا", owner.id);
    await proposeTeacherText(actorOf(t), { headline: "ثانية", bio: "نبذة معتمدة" });
    const state = await teacherProfileState(t.id);
    expect(state.pending).toMatchObject({ headline: "ثانية" });
    expect(state.rejected).toBeNull();
  });
});

describe("الصورة المعتمدة لا تُحذف بطلب مصنوع", () => {
  const withLivePhoto = async () => {
    const t = await newTeacher();
    const key = await putPhoto(t);
    await setTeacherPhoto(t.id, key, owner.id);
    return { t, key };
  };

  it("a completion that names the live photo is no change at all", async () => {
    const { t, key } = await withLivePhoto();
    await completeUpload({ target: "teacher_photo", key, teacherId: t.id }, actorOf(t));
    expect((await teacherProfileState(t.id)).pending).toBeNull();
    expect((await liveOf(t.id)).photo_key).toBe(key);
    expect(await exists(key)).toBe(true);
  });

  it("naming the live photo drops a pending new photo but never deletes the live one", async () => {
    const { t, key } = await withLivePhoto();
    const next = await putPhoto(t);
    await proposeTeacherPhoto(actorOf(t), next);
    await expect(proposeTeacherPhoto(actorOf(t), key)).resolves.toBe("none");
    expect((await teacherProfileState(t.id)).pending).toBeNull();
    expect(await exists(next)).toBe(false);
    expect(await exists(key)).toBe(true);
  });

  it("rejecting a change that carries the live key leaves the file", async () => {
    const { t, key } = await withLivePhoto();
    await sql`insert into teacher_profile_changes (teacher_id, photo_action, photo_key, submitted_by) values (${t.id}, 'replace', ${key}, ${t.user!.id})`;
    await rejectProfileChange(await pendingId(t.id), "لا", owner.id);
    expect(await exists(key)).toBe(true);
    expect((await liveOf(t.id)).photo_key).toBe(key);
  });

  it("a refused completion cannot delete the live photo either", async () => {
    const { t, key } = await withLivePhoto();
    await expect(completeUpload({ target: "teacher_photo", key, teacherId: t.id, size: 1 }, actorOf(t))).rejects.toThrow(/لم يصل الملف كاملًا/);
    expect(await exists(key)).toBe(true);
  });

  it("a refused completion still removes a file nothing uses", async () => {
    const t = await newTeacher();
    const key = await putPhoto(t);
    await expect(completeUpload({ target: "teacher_photo", key, teacherId: t.id, size: 1 }, actorOf(t))).rejects.toThrow(/لم يصل الملف كاملًا/);
    expect(await exists(key)).toBe(false);
  });

  it("removing the live photo is still a request the owner reviews", async () => {
    const { t } = await withLivePhoto();
    await expect(proposeTeacherPhoto(actorOf(t), null)).resolves.toBe("remove");
    expect((await teacherProfileState(t.id)).pending).toMatchObject({ photo_action: "remove" });
  });
});

describe("مرة واحدة وتعديل معلق واحد", () => {
  it("approving twice applies once; approve after reject is refused", async () => {
    const t = await newTeacher();
    await proposeTeacherText(actorOf(t), { headline: "جديد", bio: "نبذة معتمدة" });
    const id = await pendingId(t.id);
    await approveProfileChange(id, owner.id);
    await sql`update teachers set headline = 'عدّله المالك' where id = ${t.id}`;
    await expect(approveProfileChange(id, owner.id)).rejects.toThrow(/مسبقًا/);
    expect((await liveOf(t.id)).headline).toBe("عدّله المالك");
    expect(await audits(t.id, "teacher.profile_approve")).toHaveLength(1);

    await proposeTeacherText(actorOf(t), { headline: "آخر", bio: "نبذة معتمدة" });
    const second = await pendingId(t.id);
    await rejectProfileChange(second, "لا", owner.id);
    await expect(approveProfileChange(second, owner.id)).rejects.toThrow(/مسبقًا/);
    expect((await liveOf(t.id)).headline).toBe("عدّله المالك");
  });

  it("two approvals at once take effect once", async () => {
    const t = await newTeacher();
    await proposeTeacherText(actorOf(t), { headline: "جديد", bio: "نبذة معتمدة" });
    const id = await pendingId(t.id);
    const results = await Promise.allSettled([approveProfileChange(id, owner.id), approveProfileChange(id, owner.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await audits(t.id, "teacher.profile_approve")).toHaveLength(1);
  });

  it("a second edit replaces the first in one pending row, and a replaced photo is deleted", async () => {
    const t = await newTeacher();
    const first = await putPhoto(t);
    const second = await putPhoto(t);
    await proposeTeacherPhoto(actorOf(t), first);
    await proposeTeacherText(actorOf(t), { headline: "نص ١", bio: "نبذة معتمدة" });
    await proposeTeacherPhoto(actorOf(t), second);
    await proposeTeacherText(actorOf(t), { headline: "نص ٢", bio: "نبذة ٢" });
    const rows = await sql`select 1 from teacher_profile_changes where teacher_id = ${t.id} and status = 'pending'`;
    expect(rows).toHaveLength(1);
    expect((await teacherProfileState(t.id)).pending).toMatchObject({ headline: "نص ٢", bio: "نبذة ٢", photo_action: "replace", photo_key: second });
    expect(await exists(first)).toBe(false);
    expect(await exists(second)).toBe(true);
  });

  it("an approval opened on an earlier edit is refused, so the owner never publishes text they did not see", async () => {
    const t = await newTeacher();
    await proposeTeacherText(actorOf(t), { headline: "ما رآه المالك", bio: "نبذة معتمدة" });
    const seen = await pendingId(t.id);
    await proposeTeacherText(actorOf(t), { headline: "نص بُدّل بعد فتح الصفحة", bio: "نبذة معتمدة" });

    await expect(approveProfileChange(seen, owner.id)).rejects.toThrow(/حدّث الصفحة/);
    await expect(rejectProfileChange(seen, "لا", owner.id)).rejects.toThrow(/حدّث الصفحة/);
    expect((await liveOf(t.id)).headline).toBe("عنوان معتمد");
    expect(await audits(t.id, "teacher.profile_approve")).toHaveLength(0);
    expect(await audits(t.id, "teacher.profile_reject")).toHaveLength(0);
    expect((await teacherProfileState(t.id)).pending).toMatchObject({ headline: "نص بُدّل بعد فتح الصفحة", status: "pending" });

    // بعد تحديث الصفحة يراجع المالك النص الجديد بمعرّفه
    await approveProfileChange(await pendingId(t.id), owner.id);
    expect((await liveOf(t.id)).headline).toBe("نص بُدّل بعد فتح الصفحة");
  });

  it("a photo swapped after the owner opened the page cannot be approved unseen", async () => {
    const t = await newTeacher();
    const first = await putPhoto(t);
    const second = await putPhoto(t);
    await proposeTeacherPhoto(actorOf(t), first);
    const seen = await pendingId(t.id);
    await proposeTeacherPhoto(actorOf(t), second);

    await expect(approveProfileChange(seen, owner.id)).rejects.toThrow(/حدّث الصفحة/);
    expect((await liveOf(t.id)).photo_key).toBeNull();
    expect((await teacherProfileState(t.id)).pending).toMatchObject({ photo_action: "replace", photo_key: second });
    expect(await exists(second)).toBe(true);
  });

  it("the database refuses a second pending row", async () => {
    const t = await newTeacher();
    await sql`insert into teacher_profile_changes (teacher_id, headline) values (${t.id}, 'أ')`;
    await expect(sql`insert into teacher_profile_changes (teacher_id, headline) values (${t.id}, 'ب')`).rejects.toThrow();
  });

  it("saving the approved values is no change, and undoing an edit withdraws it", async () => {
    const t = await newTeacher();
    expect(await proposeTeacherText(actorOf(t), { headline: "عنوان معتمد", bio: "نبذة معتمدة" })).toBe(false);
    expect((await teacherProfileState(t.id)).pending).toBeNull();
    expect(await proposeTeacherText(actorOf(t), { headline: "مختلف", bio: "نبذة معتمدة" })).toBe(true);
    expect(await proposeTeacherText(actorOf(t), { headline: "عنوان معتمد", bio: "نبذة معتمدة" })).toBe(false);
    expect((await teacherProfileState(t.id)).pending).toBeNull();
  });

  it("clearing a field is a real change", async () => {
    const t = await newTeacher();
    await proposeTeacherText(actorOf(t), { headline: "", bio: "نبذة معتمدة" });
    await approveProfileChange(await pendingId(t.id), owner.id);
    expect((await liveOf(t.id)).headline).toBe("");
  });
});

describe("الصلاحيات", () => {
  it("a teacher cannot approve or reject, even their own, through a crafted request", async () => {
    const t = await newTeacher();
    await proposeTeacherText(actorOf(t), { headline: "جديد", bio: "نبذة معتمدة" });
    const id = await pendingId(t.id);
    ctx.user = sessionOf(t);
    expect((await approveProfileChangeAction(null, form({ id })))?.ok).toBeFalsy();
    expect((await rejectProfileChangeAction(null, form({ id, reason: "لا" })))?.ok).toBeFalsy();
    expect((await teacherProfileState(t.id)).pending?.status).toBe("pending");
    expect((await liveOf(t.id)).headline).toBe("عنوان معتمد");
  });

  it("the owner approves and rejects through the actions; bad ids are refused", async () => {
    const t = await newTeacher();
    await proposeTeacherText(actorOf(t), { headline: "جديد", bio: "نبذة معتمدة" });
    ctx.user = ownerSession();
    expect((await approveProfileChangeAction(null, form({ id: "x" })))?.error).toBeTruthy();
    expect((await rejectProfileChangeAction(null, form({ id: await pendingId(t.id) })))?.error).toContain("سبب");
    expect((await approveProfileChangeAction(null, form({ id: await pendingId(t.id) })))?.ok).toBe(true);
    expect((await liveOf(t.id)).headline).toBe("جديد");
  });

  it("a teacher can only upload their own photo", async () => {
    const a = await newTeacher();
    const b = await newTeacher();
    const key = await putPhoto(b);
    await expect(completeUpload({ target: "teacher_photo", key, teacherId: b.id, originalName: "a.png" }, actorOf(a))).rejects.toThrow();
    expect((await teacherProfileState(b.id)).pending).toBeNull();
  });
});

describe("ما يراه المالك والمعلم", () => {
  it("the owner sees old and new side by side, including the unchanged field marked as such", async () => {
    const t = await newTeacher();
    await proposeTeacherText(actorOf(t), { headline: "عنوان مقترح واضح", bio: "نبذة معتمدة" });
    ctx.user = ownerSession();
    const html = renderToStaticMarkup(await ReviewPage());
    expect(html).toContain('data-testid="profile-change"');
    expect(html).toContain("عنوان معتمد");
    expect(html).toContain("عنوان مقترح واضح");
    expect(html).toContain("بدون تغيير");
    expect(html).toContain("المعتمد الآن");
    expect(html).not.toContain("لا شيء بالانتظار");
    expect((await listPendingProfileChanges()).find((c) => c.teacher_id === t.id)).toMatchObject({ current_headline: "عنوان معتمد", headline: "عنوان مقترح واضح", bio: null });
    await rejectProfileChange(await pendingId(t.id), "تنظيف", owner.id);
  });

  it("the teacher's form shows the pending text with a clear banner", async () => {
    const t = await newTeacher();
    await proposeTeacherText(actorOf(t), { headline: "قيد المراجعة", bio: "نبذة معتمدة" });
    ctx.user = sessionOf(t);
    const html = renderToStaticMarkup(await ProfilePage());
    expect(html).toContain('data-testid="profile-pending"');
    expect(html).toContain('value="قيد المراجعة"');
  });
});
