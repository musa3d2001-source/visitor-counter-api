import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument, PDFName } from "pdf-lib";
import * as pdf from "@/server/access/pdf";
import * as fileCheck from "@/server/access/file-check";
import { grantProduct } from "@/server/access/entitlements";
import { contentHealthCounts, contentHealthReport, needsOwnerAttention, recheckFile, regenerateBadPreviews, scanUncheckedFiles } from "@/server/admin/content-health";
import { addBundleItem, approveAndPublish, getAdminProduct, publishBlockers, regenerateAutoPreview, submitForReview, withdrawFromReview } from "@/server/admin/products";
import { getTeacherAdmin, updateTeacher, type TeacherInput } from "@/server/admin/teachers";
import { completeTicketed, issueTicket } from "../helpers/upload-ticket";
import type { Actor } from "@/server/auth/permissions";
import { getProductFilesInfo } from "@/server/catalog/queries";
import { saveSettings } from "@/server/platform/settings";
import { storage } from "@/server/storage";
import { closeDb, resetDb, sql } from "../helpers/db";
import { acceptAgreement, ATTESTED, createBundle, createProduct, createTeacher, createUser, makePdf, type TestTeacher } from "../helpers/factories";
import { TEST_ENV, TEST_STORAGE_DIR } from "../test-env";

const session = vi.hoisted(() => ({ user: null as null | { id: string; email: string; role: string; fullName: string; isActive: boolean } }));
vi.mock("@/server/auth/session", async (original) => ({
  ...(await original<typeof import("@/server/auth/session")>()),
  getCurrentUser: async () => session.user,
  getCurrentSession: async () => (session.user ? { user: session.user, mustChangePassword: false, needsTwoFactorEnrolment: false } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/http", async (original) => ({ ...(await original<typeof import("@/server/http")>()), clientIp: async () => "192.0.2.80", userAgent: async () => "t" }));

const { GET } = await import("@/app/api/files/[fileId]/route");
const { POST: confirmUpload } = await import("@/app/api/admin/uploads/complete/route");
const { recheckFileAction } = await import("@/app/admin/content-health/actions");

const fixture = (name: string) => new Uint8Array(readFileSync(resolve(__dirname, "../fixtures/pdf", name)));
const privatePath = (key: string) => resolve(TEST_STORAGE_DIR, "private", key);

let owner: Actor;
let ownerUser: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
  await resetDb();
  ownerUser = await createUser({ role: "admin" });
  owner = { kind: "owner", userId: ownerUser.id, name: ownerUser.fullName, email: ownerUser.email, teacherId: null, canUpload: true };
});
afterAll(async () => {
  await closeDb();
});
afterEach(async () => {
  session.user = null;
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  vi.restoreAllMocks();
  await saveSettings({ watermark_enabled: true }, ownerUser.id);
});

const teacherActor = (t: TestTeacher): Actor => ({ kind: "teacher", userId: t.user!.id, name: t.displayName, email: t.user!.email, teacherId: t.id, teacherName: t.displayName, canUpload: true });
const draft = () => createProduct({ status: "draft", withFile: false, withPreview: false });

async function put(productId: string, target: "main" | "preview", bytes: Uint8Array) {
  const key = `${target === "main" ? "products" : "previews"}/${productId}/2026/11/${randomUUID()}.pdf`;
  await storage().put("private", key, bytes, "application/pdf");
  return key;
}
async function upload(productId: string, target: "main" | "preview", bytes: Uint8Array) {
  const key = await put(productId, target, bytes);
  return { key, ...(await completeTicketed({ target, key, productId, originalName: "ملف.pdf" }, owner)) };
}
async function legacyMain(productId: string, bytes: Uint8Array, pages: number) {
  const key = `products/${productId}/${randomUUID()}.pdf`;
  await storage().put("private", key, bytes, "application/pdf");
  const [row] = await sql<{ id: string }[]>`
    insert into product_files (product_id, kind, title, storage_key, original_name, mime_type, size_bytes, page_count)
    values (${productId}, 'main', 'ملف قديم', ${key}, 'old.pdf', 'application/pdf', ${bytes.length}, ${pages}) returning id
  `;
  return { id: row.id, key };
}

const filesOf = (productId: string) =>
  sql<{ id: string; kind: string; storage_key: string; check_status: string; pages_isolated: boolean; is_auto_preview: boolean; page_count: number | null }[]>`
    select id, kind, storage_key, check_status, pages_isolated, is_auto_preview, page_count from product_files where product_id = ${productId} order by kind, created_at
  `;
const previewOf = async (productId: string) => (await filesOf(productId)).find((f) => f.kind === "preview");
const statusOf = async (fileId: string) => (await sql<{ check_status: string }[]>`select check_status from product_files where id = ${fileId}`)[0].check_status;
const statusOfProduct = async (id: string) => (await sql<{ status: string }[]>`select status from products where id = ${id}`)[0].status;
const auditOf = (action: string, entityId: string) => sql<{ metadata: Record<string, unknown> }[]>`select metadata from audit_logs where action = ${action} and entity_id = ${entityId} order by created_at`;
const buyer = async (productId: string) => {
  const u = await createUser();
  await grantProduct(sql, { userId: u.id, productId, source: "manual", grantedBy: null, reason: "test" });
  session.user = { id: u.id, email: u.email, role: "student", fullName: u.fullName, isActive: true };
  return u;
};
const openFile = (fileId: string, headers: Record<string, string> = {}) => GET(new NextRequest(`http://localhost/api/files/${fileId}?download=1`, { headers }), { params: Promise.resolve({ fileId }) });

/** ملف صفحته الأولى رابط يقفز إلى آخر صفحة: copyPages يتبع الرابط ويحمل الصفحة معه */
async function linkedPdf(pages: number) {
  const doc = await PDFDocument.create();
  const all = Array.from({ length: pages }, () => doc.addPage([300, 400]));
  const link = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 50, 50], Dest: [all[pages - 1].ref, PDFName.of("Fit")] }));
  all[0].node.set(PDFName.of("Annots"), doc.context.obj([link]));
  return doc.save();
}

const confirmRequest = (body: unknown) =>
  confirmUpload(new Request("http://localhost:3000/api/admin/uploads/complete", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify(body) }));

// ---------------------------------------------------------------------------- F1
describe("المعاينة العامة معزولة عن بقية الملف", () => {
  it("a custom preview is stored rebuilt, and the uploaded original does not stay in storage", async () => {
    const p = await draft();
    await upload(p.id, "main", await makePdf(20));
    const { key } = await upload(p.id, "preview", await linkedPdf(2));
    const row = (await previewOf(p.id))!;
    expect(row.storage_key).toMatch(/\.isolated\.pdf$/);
    expect(row.pages_isolated).toBe(true);
    expect(row.is_auto_preview).toBe(false);
    expect(existsSync(privatePath(key))).toBe(false);
    const stored = await PDFDocument.load(readFileSync(privatePath(row.storage_key)));
    expect(stored.getPageCount()).toBe(2);
    expect(stored.getPage(0).node.get(PDFName.of("Annots"))).toBeUndefined();
    expect((await getProductFilesInfo(p.id)).some((f) => f.kind === "preview")).toBe(true);
  });

  it("a repeated confirmation of a custom preview answers with the same row", async () => {
    const p = await draft();
    await upload(p.id, "main", await makePdf(20));
    const first = await upload(p.id, "preview", await linkedPdf(2));
    const again = await completeTicketed({ target: "preview", key: first.key, productId: p.id, originalName: "ملف.pdf" }, owner);
    expect(again.id).toBe(first.id);
    expect((await filesOf(p.id)).filter((f) => f.kind === "preview")).toHaveLength(1);
  });

  it("a stored automatic preview built before isolation stays hidden until the bulk repair rebuilds it", async () => {
    const p = await draft();
    await upload(p.id, "main", await makePdf(20));
    await sql`update product_files set pages_isolated = false where product_id = ${p.id} and kind = 'preview'`;
    expect((await getProductFilesInfo(p.id)).some((f) => f.kind === "preview")).toBe(false);
    expect((await contentHealthReport()).previews.find((x) => x.product_id === p.id)?.issue).toBe("not_isolated");

    const r = await regenerateBadPreviews(owner.userId);
    expect(r.generated).toBeGreaterThan(0);
    expect((await previewOf(p.id))!.pages_isolated).toBe(true);
    expect((await getProductFilesInfo(p.id)).some((f) => f.kind === "preview")).toBe(true);
  });

  it("an old custom preview is rebuilt in place: it stays the owner's own preview", async () => {
    const p = await draft();
    await upload(p.id, "main", await makePdf(20));
    await upload(p.id, "preview", await linkedPdf(2));
    const before = (await previewOf(p.id))!;
    await sql`update product_files set pages_isolated = false where id = ${before.id}`;

    await regenerateBadPreviews(owner.userId);
    const after = (await previewOf(p.id))!;
    expect(after).toMatchObject({ id: before.id, is_auto_preview: false, pages_isolated: true, page_count: 2 });
    expect(after.storage_key).not.toBe(before.storage_key);
    expect(existsSync(privatePath(before.storage_key))).toBe(false);
  });

  it("failing the isolation proof hides the preview and does not call the main file broken", async () => {
    const p = await draft();
    const { id } = await upload(p.id, "main", await makePdf(20));
    vi.spyOn(pdf, "extractPreview").mockRejectedValue(new pdf.PreviewNotIsolatedError("test"));
    await expect(regenerateAutoPreview(p.id)).resolves.toBe("not_isolated");
    expect(await statusOf(id)).toBe("ok");
  });

  it("a custom preview that fails the isolation proof is refused and removed", async () => {
    const p = await draft();
    await upload(p.id, "main", await makePdf(20));
    const key = await put(p.id, "preview", await linkedPdf(2));
    vi.spyOn(pdf, "rebuildCustomPreview").mockRejectedValue(new pdf.PreviewNotIsolatedError("test"));
    await expect(completeTicketed({ target: "preview", key, productId: p.id, originalName: "x.pdf" }, owner)).rejects.toThrow(/للعرض العام/);
    expect(existsSync(privatePath(key))).toBe(false);
  });
});

// ---------------------------------------------------------------------------- F5, F10
describe("الاعتماد ينشر ما فُتح للمراجعة فقط", () => {
  const INPUT = { priceFils: 4000, compareAtPriceFils: null, accessMode: "unlimited" as const, accessUntil: null, accessDays: null };

  async function submitted() {
    const t = await createTeacher({ mode: "self_managed", shareBps: 4000 });
    await acceptAgreement(t.user!.id);
    const p = await createProduct({ status: "draft", priceFils: 1 });
    await sql`update products set teacher_id = ${t.id} where id = ${p.id}`;
    await submitForReview(p.id, teacherActor(t), undefined, ATTESTED);
    const opened = (await getAdminProduct(p.id))!.submitted_at!.toISOString();
    return { t, p, opened };
  }

  it("a draft is not approved at all", async () => {
    const { t, p, opened } = await submitted();
    await withdrawFromReview(p.id, teacherActor(t));
    await expect(approveAndPublish(p.id, { ...INPUT, submittedAt: opened }, owner)).rejects.toThrow(/ليس بانتظار المراجعة/);
    expect(await statusOfProduct(p.id)).toBe("draft");
  });

  it("withdrawn, edited and sent again: the approval opened before that is refused, and a fresh one passes", async () => {
    const { t, p, opened } = await submitted();
    await withdrawFromReview(p.id, teacherActor(t));
    await sql`update products set title = 'عنوان بعد التعديل' where id = ${p.id}`;
    await submitForReview(p.id, teacherActor(t), undefined, ATTESTED);

    await expect(approveAndPublish(p.id, { ...INPUT, submittedAt: opened }, owner)).rejects.toThrow(/حدّث الصفحة/);
    expect(await statusOfProduct(p.id)).toBe("in_review");

    const fresh = (await getAdminProduct(p.id))!.submitted_at!.toISOString();
    expect(fresh).not.toBe(opened);
    await approveAndPublish(p.id, { ...INPUT, submittedAt: fresh }, owner);
    expect(await statusOfProduct(p.id)).toBe("published");
  });

  it("a withdrawal between the checks and the write publishes nothing", async () => {
    const { t, p, opened } = await submitted();
    vi.spyOn(fileCheck, "ensureProductFilesChecked").mockImplementationOnce(async () => {
      await withdrawFromReview(p.id, teacherActor(t));
    });
    await expect(approveAndPublish(p.id, { ...INPUT, submittedAt: opened }, owner)).rejects.toThrow(/حدّث الصفحة/);
    expect(await statusOfProduct(p.id)).toBe("draft");
    expect(await auditOf("product.review_approve", p.id)).toHaveLength(0);
  });

  it("a request that leaves out the review time is refused", async () => {
    const { p } = await submitted();
    await expect(approveAndPublish(p.id, { ...INPUT, submittedAt: null }, owner)).rejects.toThrow(/حدّث الصفحة/);
    expect(await statusOfProduct(p.id)).toBe("in_review");
  });
});

// ---------------------------------------------------------------------------- F8
describe("نسبة ٠٪ أو ١٠٠٪ على مبيعات قائمة", () => {
  const inputFor = async (id: string, revenueShareBps: number | null, confirmExtremeShare = false): Promise<TeacherInput> => {
    const t = (await getTeacherAdmin(id))!;
    return { slug: t.slug, displayName: t.display_name, headline: "", bio: "", isPublished: true, canUpload: true, revenueShareBps, confirmExtremeShare, sortOrder: 0, subjectIds: [] };
  };
  const shareOf = async (id: string) => (await sql<{ revenue_share_bps: number | null }[]>`select revenue_share_bps from teachers where id = ${id}`)[0].revenue_share_bps;
  const teacherWith = async (share: number | null, status: "published" | "draft" | "hidden" = "published") => {
    const t = await createTeacher({ shareBps: share });
    const p = await createProduct({ status, priceFils: 2000 });
    await sql`update products set teacher_id = ${t.id} where id = ${p.id}`;
    return { t, p };
  };

  it.each([0, 10000])("share %i on a live paid product needs the tick, and the tick is audited", async (share) => {
    const { t } = await teacherWith(4000);
    await expect(updateTeacher(t.id, await inputFor(t.id, share), owner.userId)).rejects.toThrow(/خانة التأكيد/);
    expect(await shareOf(t.id)).toBe(4000);
    await updateTeacher(t.id, await inputFor(t.id, share, true), owner.userId);
    expect(await shareOf(t.id)).toBe(share);
    expect((await auditOf("teacher.share_change", t.id))[0].metadata).toMatchObject({ revenueShareBps: { from: 4000, to: share }, confirmedExtremeShare: true });
  });

  it("content sold only inside a published bundle counts as on sale, at any depth", async () => {
    const { t, p } = await teacherWith(4000, "hidden");
    const inner = await createBundle({ items: [p.id], status: "hidden", priceFils: 3000 });
    await createBundle({ items: [inner.id], status: "published", priceFils: 5000 });
    await expect(updateTeacher(t.id, await inputFor(t.id, 0), owner.userId)).rejects.toThrow(/خانة التأكيد/);
  });

  it("a teacher with nothing paid on sale needs no tick, and neither does an ordinary share", async () => {
    const { t } = await teacherWith(4000, "draft");
    await updateTeacher(t.id, await inputFor(t.id, 0), owner.userId);
    expect(await shareOf(t.id)).toBe(0);
    const live = await teacherWith(4000);
    await updateTeacher(live.t.id, await inputFor(live.t.id, 5000), owner.userId);
    expect(await shareOf(live.t.id)).toBe(5000);
  });

  it("saving other fields of a teacher already at 0% does not ask again", async () => {
    const { t } = await teacherWith(0);
    await expect(updateTeacher(t.id, await inputFor(t.id, 0), owner.userId)).resolves.toBeUndefined();
  });

  const paidBundle = async (status: "published" | "draft" = "published") => createBundle({ items: [(await createProduct({ priceFils: 1000 })).id], status, priceFils: 5000 });

  it.each([0, 10000])("adding an item with share %i to a live bundle needs the tick, and it is audited", async (share) => {
    const b = await paidBundle();
    const { p } = await teacherWith(share);
    await expect(addBundleItem(b.id, p.id, owner)).rejects.toThrow(/أكد النسبة قبل الإضافة/);
    expect(await sql`select 1 from bundle_items where bundle_id = ${b.id} and product_id = ${p.id}`).toHaveLength(0);
    await addBundleItem(b.id, p.id, owner, { confirmShare: true });
    expect(await sql`select 1 from bundle_items where bundle_id = ${b.id} and product_id = ${p.id}`).toHaveLength(1);
    expect((await auditOf("bundle.add_item", b.id))[0].metadata).toMatchObject({ productId: p.id, confirmedShares: [expect.objectContaining({ share_bps: share })] });
  });

  it("an item whose teacher has no share is refused outright, because it would stop the bundle's sale", async () => {
    const b = await paidBundle();
    const { p } = await teacherWith(null);
    await expect(addBundleItem(b.id, p.id, owner, { confirmShare: true })).rejects.toThrow(/لم تُحدَّد نسبة/);
    expect(await sql`select 1 from bundle_items where bundle_id = ${b.id} and product_id = ${p.id}`).toHaveLength(0);
  });

  it("a bundle still being built asks nothing yet", async () => {
    const b = await paidBundle("draft");
    const { p } = await teacherWith(0);
    await expect(addBundleItem(b.id, p.id, owner)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------- F11
describe("عطل التخزين لا يصف ملفًا سليمًا بأنه معيب", () => {
  it("a stat that fails during the scan is counted as an error and flags nothing", async () => {
    const p = await draft();
    const f = await legacyMain(p.id, fixture("plain.pdf"), 6);
    vi.spyOn(storage(), "stat").mockRejectedValue(new Error("storage stat failed: 503"));
    const r = await scanUncheckedFiles(owner.userId);
    expect(r.errors).toBeGreaterThan(0);
    expect(await statusOf(f.id)).toBe("unchecked");
  });

  it("re-checking a healthy file wrongly marked clears it, with an audit entry", async () => {
    const p = await draft();
    const { id } = await upload(p.id, "main", await makePdf(6));
    await sql`update product_files set check_status = 'missing' where id = ${id}`;
    await expect(recheckFile(id, owner.userId)).resolves.toEqual({ outcome: "cleared" });
    expect(await statusOf(id)).toBe("ok");
    expect((await auditOf("content.file_recheck", p.id)).at(-1)!.metadata).toMatchObject({ fileId: id, from: "missing", to: "ok" });
  });

  it("re-checking a file that really is bad keeps it flagged", async () => {
    const p = await draft();
    const f = await legacyMain(p.id, fixture("owner_aes_128.pdf"), 3);
    await sql`update product_files set check_status = 'missing' where id = ${f.id}`;
    await expect(recheckFile(f.id, owner.userId)).resolves.toEqual({ outcome: "still_flagged", problem: "encrypted" });
    expect(await statusOf(f.id)).toBe("encrypted");
  });

  it("a storage failure during the re-check changes nothing and is reported as a failure", async () => {
    const p = await draft();
    const { id } = await upload(p.id, "main", await makePdf(6));
    await sql`update product_files set check_status = 'corrupt' where id = ${id}`;
    vi.spyOn(storage(), "stat").mockRejectedValue(new Error("down"));
    await expect(recheckFile(id, owner.userId)).resolves.toEqual({ outcome: "storage_error" });
    expect(await statusOf(id)).toBe("corrupt");
    expect((await auditOf("content.file_recheck", p.id)).at(-1)!.metadata).toMatchObject({ fileId: id, storageError: true });
  });

  it("the action is the owner's only, and says plainly when storage could not answer", async () => {
    const p = await draft();
    const { id } = await upload(p.id, "main", await makePdf(6));
    await sql`update product_files set check_status = 'corrupt' where id = ${id}`;
    const form = new FormData();
    form.set("fileId", id);
    const t = await createTeacher({ mode: "self_managed", shareBps: 4000 });
    session.user = { id: t.user!.id, email: t.user!.email, role: "teacher", fullName: t.displayName, isActive: true };
    expect((await recheckFileAction(null, form))?.ok).toBeFalsy();
    expect(await statusOf(id)).toBe("corrupt");

    session.user = { id: owner.userId, email: ownerUser.email, role: "admin", fullName: "المالك", isActive: true };
    vi.spyOn(storage(), "stat").mockRejectedValueOnce(new Error("down"));
    expect((await recheckFileAction(null, form))?.error).toContain("بقيت علامة العيب");
    expect(await recheckFileAction(null, form)).toMatchObject({ ok: true, message: expect.stringContaining("سليم") });
  });

  it("a stamping failure on a file that already passed its check is not recorded against the file", async () => {
    const p = await createProduct({ priceFils: 2000 });
    await sql`update products set is_downloadable = true where id = ${p.id}`;
    await buyer(p.id);
    vi.spyOn(pdf, "watermarkPdf").mockRejectedValue(new pdf.PdfUnusableError("too_complex"));
    const res = await openFile(p.mainFileId!);
    expect(res.status).toBe(500);
    expect(await statusOf(p.mainFileId!)).toBe("ok");
  });
});

// ---------------------------------------------------------------------------- F12, F13
describe("تأكيد الرفع على شبكة ضعيفة", () => {
  it("two confirmations at once register one file, and both succeed", async () => {
    const p = await draft();
    const key = await put(p.id, "main", await makePdf(20));
    const body = { target: "main" as const, key, productId: p.id, originalName: "ملف.pdf" };
    const [a, b] = await Promise.all([completeTicketed(body, owner), completeTicketed(body, owner)]);
    expect(a.id).toBe(b.id);
    expect((await filesOf(p.id)).filter((f) => f.kind === "main")).toHaveLength(1);
    expect(existsSync(privatePath(key))).toBe(true);
  });

  it("a confirmation repeated after its answer was lost returns the same file, with no second audit entry", async () => {
    const p = await draft();
    const first = await upload(p.id, "main", await makePdf(20));
    const again = await completeTicketed({ target: "main", key: first.key, productId: p.id, originalName: "ملف.pdf" }, owner);
    expect(again.id).toBe(first.id);
    expect(await auditOf("product.file_upload", p.id)).toHaveLength(1);
  });

  it("a repeated confirmation succeeds even while storage is down, because the answer is already recorded", async () => {
    const p = await draft();
    const first = await upload(p.id, "main", await makePdf(20));
    vi.spyOn(storage(), "stat").mockRejectedValue(new Error("down"));
    await expect(completeTicketed({ target: "main", key: first.key, productId: p.id, originalName: "ملف.pdf" }, owner)).resolves.toMatchObject({ id: first.id });
  });

  describe("رد الخادم يحدد ما يفعله المتصفح", () => {
    const signIn = () => {
      session.user = { id: owner.userId, email: ownerUser.email, role: "admin", fullName: "المالك", isActive: true };
    };

    it("a storage failure answers 503 in Arabic and leaves the file for the retry", async () => {
      const p = await draft();
      const key = await put(p.id, "main", await makePdf(6));
      await issueTicket(key, "main", owner.userId);
      signIn();
      const stat = vi.spyOn(storage(), "stat").mockRejectedValueOnce(new Error("storage stat failed: gateway"));
      const res = await confirmRequest({ target: "main", key, productId: p.id, originalName: "ملف.pdf" });
      expect(res.status).toBe(503);
      expect((await res.json()).error).toMatch(/حاول مرة أخرى/);
      expect(existsSync(privatePath(key))).toBe(true);
      expect(await filesOf(p.id)).toHaveLength(0);

      stat.mockRestore();
      const retry = await confirmRequest({ target: "main", key, productId: p.id, originalName: "ملف.pdf" });
      expect(retry.status).toBe(200);
      expect((await filesOf(p.id)).filter((f) => f.kind === "main")).toHaveLength(1);
    });

    it("a read failure after the stat is also 503", async () => {
      const p = await draft();
      const key = await put(p.id, "main", await makePdf(6));
      await issueTicket(key, "main", owner.userId);
      signIn();
      vi.spyOn(storage(), "read").mockRejectedValueOnce(new Error("download failed"));
      expect((await confirmRequest({ target: "main", key, productId: p.id, originalName: "ملف.pdf" })).status).toBe(503);
      expect(existsSync(privatePath(key))).toBe(true);
    });

    it("storage saying the file is not there answers 409, so the browser uploads it again", async () => {
      const p = await draft();
      signIn();
      const key = `products/${p.id}/2026/11/${randomUUID()}.pdf`;
      await issueTicket(key, "main", owner.userId);
      const res = await confirmRequest({ target: "main", key, productId: p.id, originalName: "ملف.pdf" });
      expect(res.status).toBe(409);
    });

    it("a file that is really bad stays a plain refusal", async () => {
      const p = await draft();
      const key = await put(p.id, "main", fixture("owner_aes_128.pdf"));
      signIn();
      const res = await confirmRequest({ target: "main", key, productId: p.id, originalName: "ملف.pdf" });
      expect(res.status).toBe(400);
      expect(existsSync(privatePath(key))).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------- F18, F19
describe("ما يراه الطالب حين يتعذر فتح الملف", () => {
  async function protectedFile() {
    const p = await createProduct({ priceFils: 2000, withFile: false, withPreview: false });
    await sql`update products set is_downloadable = true where id = ${p.id}`;
    const f = await legacyMain(p.id, fixture("owner_aes_128.pdf"), 3);
    await buyer(p.id);
    return f;
  }

  it("with the watermark off, an old protected file is caught, flagged and answered honestly", async () => {
    await saveSettings({ watermark_enabled: false }, ownerUser.id);
    const f = await protectedFile();
    const res = await openFile(f.id);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("يحتاج إلى إصلاح");
    expect(await statusOf(f.id)).toBe("encrypted");
  });

  it("with the watermark off, a healthy old file still opens", async () => {
    await saveSettings({ watermark_enabled: false }, ownerUser.id);
    const p = await createProduct({ priceFils: 2000, withFile: false, withPreview: false });
    await sql`update products set is_downloadable = true where id = ${p.id}`;
    const f = await legacyMain(p.id, fixture("plain.pdf"), 6);
    await buyer(p.id);
    expect((await openFile(f.id)).status).toBe(200);
  });

  it("a phone opening the download link directly gets an Arabic page, not raw JSON", async () => {
    const f = await protectedFile();
    const res = await openFile(f.id, { "sec-fetch-dest": "document", accept: "text/html" });
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("يحتاج إلى إصلاح");
    expect(html).toContain('href="/library"');
    expect(html).not.toContain('{"error"');
  });

  it("the reader's own request still gets JSON", async () => {
    const f = await protectedFile();
    const res = await openFile(f.id, { "sec-fetch-dest": "empty", accept: "*/*", "x-reader": "1" });
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("a signed-out visitor following a link gets the same kind of page", async () => {
    const p = await createProduct({ priceFils: 2000 });
    const res = await openFile(p.mainFileId!, { "sec-fetch-dest": "document" });
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});

// ---------------------------------------------------------------------------- F20
describe("نتيجة إصلاح المعاينات تقول ما حدث", () => {
  it("counts a file too short for a preview apart from a product with nothing to build from", async () => {
    const short = await draft();
    await upload(short.id, "main", await makePdf(2));
    const key = await put(short.id, "preview", await makePdf(1));
    await sql`insert into product_files (product_id, kind, title, storage_key, original_name, mime_type, size_bytes, page_count, check_status, pages_isolated) values (${short.id}, 'preview', 'قديمة', ${key}, 'p.pdf', 'application/pdf', 10, 1, 'ok', false)`;

    const empty = await draft();
    const emptyKey = await put(empty.id, "preview", await makePdf(1));
    await sql`insert into product_files (product_id, kind, title, storage_key, original_name, mime_type, size_bytes, page_count, check_status, pages_isolated, is_auto_preview) values (${empty.id}, 'preview', 'يتيمة', ${emptyKey}, 'p.pdf', 'application/pdf', 10, 1, 'ok', false, true)`;

    const r = await regenerateBadPreviews(owner.userId);
    expect(r.tooShort).toBe(1);
    expect(r.none).toBe(1);
    expect(await previewOf(short.id)).toBeUndefined();
    expect(await previewOf(empty.id)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------- F14
describe("صفحة سلامة المحتوى تذكر الباقات المتوقفة", () => {
  it("a published paid bundle stopped by a teacher without a share is listed, at any depth", async () => {
    const t = await createTeacher({ shareBps: null });
    const p = await createProduct({ priceFils: 1000, status: "hidden" });
    await sql`update products set teacher_id = ${t.id} where id = ${p.id}`;
    const inner = await createBundle({ items: [p.id], status: "hidden", priceFils: 2000 });
    const outer = await createBundle({ items: [inner.id], status: "published", priceFils: 3000 });
    expect((await contentHealthReport()).stoppedBundles.map((b) => b.id)).toContain(outer.id);
    const counts = await contentHealthCounts();
    expect(counts.stoppedBundles).toBeGreaterThan(0);
    expect(needsOwnerAttention(counts)).toBe(true);
  });

  it("a bundle holding a flagged file is listed, and one that is healthy or not on sale is not", async () => {
    const bad = await createProduct({ priceFils: 1000 });
    await sql`update product_files set check_status = 'corrupt' where id = ${bad.mainFileId}`;
    const stopped = await createBundle({ items: [bad.id], status: "published", priceFils: 3000 });
    const draftBundle = await createBundle({ items: [bad.id], status: "draft", priceFils: 3000 });
    const fine = await createBundle({ items: [(await createProduct({ priceFils: 1000 })).id], status: "published", priceFils: 3000 });
    const listed = (await contentHealthReport()).stoppedBundles.map((b) => b.id);
    expect(listed).toContain(stopped.id);
    expect(listed).not.toContain(draftBundle.id);
    expect(listed).not.toContain(fine.id);
  });
});

// ---------------------------------------------------------------------------- F16 (server side, no provider needed)
describe("درس لم يكتمل رفعه", () => {
  it("has its own blocker telling what to do", async () => {
    const p = await createProduct({ status: "draft", type: "video_course", withFile: false, withPreview: false });
    await sql`insert into lessons (product_id, unit_title, title, provider, video_ref, mime_type, size_bytes, processing_status, is_published) values (${p.id}, '', 'درس', 'bunny', ${randomUUID()}, 'video/mp4', 10, 'uploading', true)`;
    const issues = await publishBlockers(p.id);
    expect(issues.join(" ")).toContain("لم يكتمل رفعه");
    expect(issues.join(" ")).toContain("احذفه");
  });
});

