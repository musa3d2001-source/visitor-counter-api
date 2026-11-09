import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { checkFileAccess, grantProduct } from "@/server/access/entitlements";
import { contentHealthCounts, contentHealthReport, regenerateBadPreviews, scanUncheckedFiles } from "@/server/admin/content-health";
import { approveAndPublish, deleteProductFile, moveProductFile, publishBlockers, regenerateAutoPreview, setProductStatus, submitForReview, updateProduct } from "@/server/admin/products";
import { updateTeacher, getTeacherAdmin } from "@/server/admin/teachers";
import { completeUpload, initUpload } from "@/server/admin/uploads";
import type { Actor } from "@/server/auth/permissions";
import { getProductFilesInfo, getPublishedProductsByIds } from "@/server/catalog/queries";
import { computeCart, unsellableProductIds } from "@/server/commerce/cart";
import { resetEnvCache } from "@/server/env";
import { storage, storageFileCap, SUPABASE_FREE_MAX_BYTES, UPLOAD_RULES, uploadLimitBytes, uploadLimitLabel } from "@/server/storage";
import { closeDb, resetDb, sql } from "../helpers/db";
import { acceptAgreement, ATTESTED, createBundle, createProduct, createTeacher, createUser, makePdf, type TestTeacher } from "../helpers/factories";
import { TEST_ENV, TEST_STORAGE_DIR } from "../test-env";

const session = vi.hoisted(() => ({ user: null as null | { id: string; email: string; role: string } }));
vi.mock("@/server/auth/session", async (original) => ({ ...(await original<typeof import("@/server/auth/session")>()), getCurrentUser: async () => session.user }));

const { GET } = await import("@/app/api/files/[fileId]/route");

const fixture = (name: string) => new Uint8Array(readFileSync(resolve(__dirname, "../fixtures/pdf", name)));
const privatePath = (key: string) => resolve(TEST_STORAGE_DIR, "private", key);

let owner: Actor;

beforeAll(async () => {
  await resetDb();
  const u = await createUser({ role: "admin" });
  owner = { kind: "owner", userId: u.id, name: u.fullName, email: u.email, teacherId: null, canUpload: true };
});
afterAll(async () => {
  await closeDb();
});
afterEach(() => {
  session.user = null;
  for (const k of ["STORAGE_MAX_FILE_MB", "STORAGE_PLAN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
  vi.restoreAllMocks();
});

const teacherActor = (t: TestTeacher): Actor => ({ kind: "teacher", userId: t.user!.id, name: t.displayName, email: t.user!.email, teacherId: t.id, teacherName: t.displayName, canUpload: true });

const draft = (opts: Parameters<typeof createProduct>[0] = {}) => createProduct({ status: "draft", withFile: false, withPreview: false, ...opts });

/** يضع البايتات في التخزين كما يفعل المتصفح ثم يؤكد الرفع */
async function upload(productId: string, target: "main" | "preview", bytes: Uint8Array, actor: Actor = owner, extra: { size?: number; key?: string } = {}) {
  const prefix = target === "main" ? "products" : "previews";
  const key = extra.key ?? `${prefix}/${productId}/2026/11/${randomUUID()}.pdf`;
  if (!extra.key) await storage().put("private", key, bytes, "application/pdf");
  const res = await completeUpload({ target, key, productId, originalName: "ملف.pdf", size: extra.size }, actor);
  return { key, ...res };
}

/** ملف قديم كما هو في قاعدة بيانات ما قبل الفحص */
async function legacyFile(productId: string, kind: "main" | "preview", bytes: Uint8Array, pages: number, opts: { auto?: boolean; sourceId?: string | null } = {}) {
  const key = `${kind === "main" ? "products" : "previews"}/${productId}/${randomUUID()}.pdf`;
  await storage().put("private", key, bytes, "application/pdf");
  const [row] = await sql<{ id: string }[]>`
    insert into product_files (product_id, kind, title, storage_key, original_name, mime_type, size_bytes, page_count, is_auto_preview, source_file_id)
    values (${productId}, ${kind}, 'ملف قديم', ${key}, 'old.pdf', 'application/pdf', ${bytes.length}, ${pages}, ${opts.auto ?? false}, ${opts.sourceId ?? null})
    returning id
  `;
  return { id: row.id, key };
}

const fileRow = async (id: string) => (await sql<{ check_status: string; source_file_id: string | null; page_count: number | null }[]>`select check_status, source_file_id, page_count from product_files where id = ${id}`)[0];
const filesOf = (productId: string) => sql<{ id: string; kind: string; page_count: number | null; is_auto_preview: boolean; source_file_id: string | null; storage_key: string }[]>`select id, kind, page_count, is_auto_preview, source_file_id, storage_key from product_files where product_id = ${productId} order by kind, sort_order, created_at`;
const rawProduct = async (id: string) => (await sql<{ status: string; price_fils: number; is_free: boolean }[]>`select status, price_fils, is_free from products where id = ${id}`)[0];
const auditOf = (action: string, entityId: string) => sql<{ metadata: Record<string, unknown> }[]>`select metadata from audit_logs where action = ${action} and entity_id = ${entityId}`;

const openFile = (fileId: string) => GET(new NextRequest(`http://localhost/api/files/${fileId}?download=1`), { params: Promise.resolve({ fileId }) });

// ---------------------------------------------------------------------------- C1
describe("C1 رفض الملفات التي ستفشل عند الطالب", () => {
  it.each([
    ["owner_rc4_128.pdf", /محمي بكلمة مرور/],
    ["owner_aes_128.pdf", /محمي بكلمة مرور/],
    ["owner_aes_256.pdf", /محمي بكلمة مرور/],
    ["owner_aes_256_objstm.pdf", /محمي بكلمة مرور/],
    ["user_rc4_128.pdf", /محمي بكلمة مرور/],
    ["user_aes_256.pdf", /محمي بكلمة مرور/],
    ["trunc_half.pdf", /تالف أو لم يكتمل/],
    ["trunc_tail.pdf", /تالف أو لم يكتمل/],
    ["flipped.pdf", /تالف أو لم يكتمل/],
    ["garbage_after_header.pdf", /تالف أو لم يكتمل/],
    ["pdf_prefix_html.pdf", /تالف أو لم يكتمل/],
    ["html_disguised.pdf", /لا يطابق النوع المطلوب/],
  ])("%s is refused at upload, removed from storage and not registered", async (name, message) => {
    const p = await draft();
    const key = `products/${p.id}/2026/11/${randomUUID()}.pdf`;
    await storage().put("private", key, fixture(name), "application/pdf");
    await expect(completeUpload({ target: "main", key, productId: p.id, originalName: name }, owner)).rejects.toThrow(message);
    expect(existsSync(privatePath(key))).toBe(false);
    expect(await filesOf(p.id)).toHaveLength(0);
  });

  it("a teacher sees the same clear reason", async () => {
    const t = await createTeacher({ mode: "self_managed", shareBps: 4000 });
    const p = await draft();
    await sql`update products set teacher_id = ${t.id} where id = ${p.id}`;
    await expect(upload(p.id, "main", fixture("owner_aes_128.pdf"), teacherActor(t))).rejects.toThrow(/أزل الحماية/);
  });

  it("a protected custom preview is refused too, and the existing preview survives", async () => {
    const p = await draft();
    await upload(p.id, "main", await makePdf(20));
    const before = (await filesOf(p.id)).filter((f) => f.kind === "preview");
    await expect(upload(p.id, "preview", fixture("owner_rc4_128.pdf"))).rejects.toThrow(/محمي/);
    expect((await filesOf(p.id)).filter((f) => f.kind === "preview")).toEqual(before);
  });

  it("a clean file is accepted and marked checked", async () => {
    const p = await draft();
    const r = await upload(p.id, "main", fixture("plain.pdf"));
    expect(r.message).toContain("6 صفحة");
    await expect(fileRow(r.id)).resolves.toMatchObject({ check_status: "ok", page_count: 6 });
  });

  it("an existing protected file is flagged at first buyer open, with an honest answer and no broken copy", async () => {
    const p = await createProduct({ withFile: false, withPreview: false });
    const f = await legacyFile(p.id, "main", fixture("owner_rc4_128.pdf"), 6);
    const buyer = await createUser();
    await grantProduct(sql, { userId: buyer.id, productId: p.id, source: "manual" });
    session.user = { id: buyer.id, email: buyer.email, role: "student" };
    await sql`update products set is_downloadable = true where id = ${p.id}`;
    const res = await openFile(f.id);
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining("إصلاح") });
    await expect(fileRow(f.id)).resolves.toMatchObject({ check_status: "encrypted" });
    const report = await contentHealthReport();
    expect(report.flagged.map((x) => x.id)).toContain(f.id);
  });

  it("a storage failure while delivering does not brand the file as broken", async () => {
    const p = await createProduct({ withPreview: false });
    const buyer = await createUser();
    await grantProduct(sql, { userId: buyer.id, productId: p.id, source: "manual" });
    session.user = { id: buyer.id, email: buyer.email, role: "student" };
    await sql`update products set is_downloadable = true where id = ${p.id}`;
    vi.spyOn(storage(), "read").mockRejectedValueOnce(new Error("storage down"));
    const res = await openFile(p.mainFileId!);
    expect(res.status).toBe(500);
    await expect(fileRow(p.mainFileId!)).resolves.toMatchObject({ check_status: "ok" });
  });

  it("the owner scan finds protected, damaged and missing files and leaves clean ones ok", async () => {
    const p = await createProduct({ status: "draft", withFile: false, withPreview: false });
    const enc = await legacyFile(p.id, "main", fixture("user_aes_256.pdf"), 6);
    const bad = await legacyFile(p.id, "main", fixture("flipped.pdf"), 3);
    const good = await legacyFile(p.id, "main", fixture("plain.pdf"), 6);
    const gone = await legacyFile(p.id, "main", fixture("plain.pdf"), 6);
    await storage().remove("private", gone.key);
    const res = await scanUncheckedFiles(owner.userId);
    expect(res).toMatchObject({ errors: 0, remaining: 0 });
    await expect(fileRow(enc.id)).resolves.toMatchObject({ check_status: "encrypted" });
    await expect(fileRow(bad.id)).resolves.toMatchObject({ check_status: "corrupt" });
    await expect(fileRow(good.id)).resolves.toMatchObject({ check_status: "ok" });
    await expect(fileRow(gone.id)).resolves.toMatchObject({ check_status: "missing" });
    expect(await auditOf("content.files_scan", "content_health")).not.toHaveLength(0);
  });

  it("a transient storage failure during the scan leaves the file unchecked", async () => {
    const p = await createProduct({ status: "draft", withFile: false, withPreview: false });
    const f = await legacyFile(p.id, "main", fixture("plain.pdf"), 6);
    vi.spyOn(storage(), "read").mockRejectedValueOnce(new Error("storage down"));
    const res = await scanUncheckedFiles(owner.userId);
    expect(res.errors).toBe(1);
    await expect(fileRow(f.id)).resolves.toMatchObject({ check_status: "unchecked" });
  });

  it("publishing checks an unchecked legacy file first and refuses a bad one", async () => {
    const p = await createProduct({ status: "draft", withFile: false, withPreview: false, priceFils: 3000 });
    const f = await legacyFile(p.id, "main", fixture("owner_aes_256.pdf"), 6);
    await expect(setProductStatus(p.id, "published", owner)).rejects.toThrow(/محمي/);
    await expect(fileRow(f.id)).resolves.toMatchObject({ check_status: "encrypted" });
    await expect(rawProduct(p.id)).resolves.toMatchObject({ status: "draft" });
  });

  it("a storage failure blocks the publish without condemning the file", async () => {
    const p = await createProduct({ status: "draft", withFile: false, withPreview: false, priceFils: 3000 });
    const f = await legacyFile(p.id, "main", fixture("plain.pdf"), 6);
    vi.spyOn(storage(), "read").mockRejectedValueOnce(new Error("storage down"));
    await expect(setProductStatus(p.id, "published", owner)).rejects.toThrow(/تعذر فحص/);
    await expect(fileRow(f.id)).resolves.toMatchObject({ check_status: "unchecked" });
    await expect(rawProduct(p.id)).resolves.toMatchObject({ status: "draft" });
  });

  it("a published product with a flagged file leaves the cart, also through a bundle", async () => {
    const p = await createProduct({ priceFils: 3000 });
    const bundle = await createBundle({ items: [p.id], priceFils: 4000 });
    const fine = await createProduct({ priceFils: 2000 });
    await sql`update product_files set check_status = 'encrypted' where id = ${p.mainFileId}`;
    const cart = await computeCart([p.id, bundle.id, fine.id], null);
    expect(cart.payableLines.map((l) => l.id)).toEqual([fine.id]);
    expect(cart.subtotalFils).toBe(2000);
    expect(cart.notices.join(" ")).toContain("غير متاح للبيع");
  });
});

// ---------------------------------------------------------------------------- C2
describe("C2 المعاينة لا تغطي الملف", () => {
  const fresh = async (pages: number, previewPages: number) => {
    const p = await createProduct({ status: "draft", withFile: false, withPreview: false });
    await sql`update products set preview_pages = ${previewPages} where id = ${p.id}`;
    const main = await upload(p.id, "main", await makePdf(pages));
    return { p, main };
  };
  const previewOf = async (id: string) => (await filesOf(id)).find((f) => f.kind === "preview");

  it.each([
    [1, 3, null],
    [4, 3, null],
    [5, 3, 1],
    [10, 3, 2],
    [15, 3, 3],
    [100, 30, 10],
  ])("%i page file with %i requested gives %s", async (total, requested, expected) => {
    const { p, main } = await fresh(total, requested);
    const prev = await previewOf(p.id);
    expect(prev?.page_count ?? null).toBe(expected);
    if (expected) expect(prev?.source_file_id).toBe(main.id);
  });

  it("uploading a short main file says the preview is absent", async () => {
    const p = await draft();
    const r = await upload(p.id, "main", await makePdf(3));
    expect(r.message).toContain("لا تتاح له معاينة");
  });

  it("a custom preview needs a main file to be measured against", async () => {
    const p = await draft();
    await expect(upload(p.id, "preview", await makePdf(1))).rejects.toThrow(/ارفع ملف المذكرة أولًا/);
  });

  it("a custom preview over the limit is refused and the existing preview stays", async () => {
    const { p } = await fresh(10, 2);
    const before = await previewOf(p.id);
    await expect(upload(p.id, "preview", await makePdf(3))).rejects.toThrow(/الحد لملف من ١٠ صفحة هو ٢/);
    expect(await previewOf(p.id)).toEqual(before);
    expect(existsSync(privatePath(before!.storage_key))).toBe(true);
  });

  it("a custom preview is refused outright when the main file is too short", async () => {
    const { p } = await fresh(4, 2);
    await expect(upload(p.id, "preview", await makePdf(1))).rejects.toThrow(/أقل من ٥ صفحات/);
  });

  it("a custom preview within the limit replaces the old one and is linked", async () => {
    const { p, main } = await fresh(20, 2);
    const old = await previewOf(p.id);
    const r = await upload(p.id, "preview", await makePdf(4));
    const prev = await previewOf(p.id);
    expect(prev).toMatchObject({ id: r.id, is_auto_preview: false, source_file_id: main.id, page_count: 4 });
    expect(existsSync(privatePath(old!.storage_key))).toBe(false);
  });

  it("a failed regeneration does not lose the current preview", async () => {
    const { p } = await fresh(20, 2);
    const before = await previewOf(p.id);
    vi.spyOn(storage(), "read").mockRejectedValueOnce(new Error("storage down"));
    await expect(regenerateAutoPreview(p.id)).rejects.toThrow("storage down");
    expect(await previewOf(p.id)).toEqual(before);
  });

  const publish = (id: string) => sql`update products set status = 'published', published_at = now() where id = ${id}`;

  it("serving: a preview within the rule reaches the public everywhere", async () => {
    const { p } = await fresh(20, 2);
    await publish(p.id);
    const prev = await previewOf(p.id);
    await expect(checkFileAccess(prev!.id, null)).resolves.toMatchObject({ ok: true });
    expect((await getProductFilesInfo(p.id)).map((f) => f.kind)).toContain("preview");
    expect((await getPublishedProductsByIds([p.id]))[0].hasPreview).toBe(true);
  });

  const expectHidden = async (productId: string, previewId: string) => {
    await expect(checkFileAccess(previewId, null)).resolves.toEqual({ ok: false, reason: "not_found" });
    const student = await createUser();
    await expect(checkFileAccess(previewId, { id: student.id, role: "student" })).resolves.toEqual({ ok: false, reason: "not_found" });
    expect((await getProductFilesInfo(productId)).map((f) => f.kind)).not.toContain("preview");
    expect((await getPublishedProductsByIds([productId]))[0].hasPreview).toBe(false);
    // المالك يفتحها ليراجعها
    await expect(checkFileAccess(previewId, { id: owner.userId, role: "admin" })).resolves.toMatchObject({ ok: true });
  };

  it("serving: an existing preview covering the whole file is hidden, warned about, and fixed in bulk", async () => {
    const p = await createProduct({ withFile: false, withPreview: false });
    const main = await legacyFile(p.id, "main", await makePdf(5), 5);
    const prev = await legacyFile(p.id, "preview", await makePdf(5), 5, { auto: true, sourceId: main.id });
    await expectHidden(p.id, prev.id);
    const report = await contentHealthReport();
    expect(report.previews.find((x) => x.id === prev.id)).toMatchObject({ issue: "too_long", page_count: 5, main_pages: 5 });
    const res = await regenerateBadPreviews(owner.userId);
    expect(res.failed).toBe(0);
    const after = await previewOf(p.id);
    expect(after).toMatchObject({ page_count: 1, source_file_id: main.id, is_auto_preview: true });
    await expect(checkFileAccess(after!.id, null)).resolves.toMatchObject({ ok: true });
    expect(existsSync(privatePath(prev.key))).toBe(false);
    expect((await auditOf("product.preview_regenerate", p.id)).map((a) => a.metadata)).toEqual([{ bulk: true, result: "generated" }]);
  });

  it("serving: an over-long custom preview is replaced by the bulk fix", async () => {
    const p = await createProduct({ withFile: false, withPreview: false });
    const main = await legacyFile(p.id, "main", await makePdf(10), 10);
    await legacyFile(p.id, "preview", await makePdf(8), 8, { sourceId: main.id });
    await regenerateBadPreviews(owner.userId);
    expect(await previewOf(p.id)).toMatchObject({ is_auto_preview: true, page_count: 2 });
  });

  it("serving: a preview with no link to a file is hidden", async () => {
    const p = await createProduct({ withFile: false, withPreview: false });
    await legacyFile(p.id, "main", await makePdf(20), 20);
    const prev = await legacyFile(p.id, "preview", await makePdf(1), 1, { auto: true, sourceId: null });
    await expectHidden(p.id, prev.id);
    expect((await contentHealthReport()).previews.find((x) => x.id === prev.id)?.issue).toBe("stale");
  });

  it("serving: a preview of a flagged file is hidden", async () => {
    const { p, main } = await fresh(20, 2);
    await publish(p.id);
    await sql`update product_files set check_status = 'corrupt' where id = ${main.id}`;
    await expectHidden(p.id, (await previewOf(p.id))!.id);
  });

  it("replacement: a custom preview goes stale when the file it was measured on is deleted", async () => {
    const { p, main } = await fresh(20, 2);
    await upload(p.id, "main", await makePdf(5));
    const custom = await upload(p.id, "preview", await makePdf(4));
    await publish(p.id);
    await expect(checkFileAccess(custom.id, null)).resolves.toMatchObject({ ok: true });
    await deleteProductFile(p.id, main.id, owner);
    await expectHidden(p.id, custom.id);
    expect((await contentHealthReport()).previews.find((x) => x.id === custom.id)?.issue).toBe("stale");
  });

  it("replacement: reordering the main files makes a custom preview stale", async () => {
    const { p } = await fresh(20, 2);
    const second = await upload(p.id, "main", await makePdf(5));
    const custom = await upload(p.id, "preview", await makePdf(4));
    await publish(p.id);
    await moveProductFile(p.id, second.id, "up", owner);
    await expectHidden(p.id, custom.id);
  });

  it("replacement: an automatic preview follows the new first file and respects its length", async () => {
    const { p, main } = await fresh(50, 10);
    const second = await upload(p.id, "main", await makePdf(5));
    expect(await previewOf(p.id)).toMatchObject({ page_count: 10, source_file_id: main.id });
    await deleteProductFile(p.id, main.id, owner);
    expect(await previewOf(p.id)).toMatchObject({ page_count: 1, source_file_id: second.id });
  });

  it("replacement: when the only remaining file is too short the automatic preview disappears", async () => {
    const { p, main } = await fresh(50, 10);
    await upload(p.id, "main", await makePdf(3));
    await deleteProductFile(p.id, main.id, owner);
    expect(await previewOf(p.id)).toBeUndefined();
  });

  it("migration rule: a preview older than the first file is left unlinked", async () => {
    const p = await createProduct({ withFile: false, withPreview: false });
    const main = await legacyFile(p.id, "main", await makePdf(20), 20);
    const old = await legacyFile(p.id, "preview", await makePdf(1), 1, { auto: true });
    const recent = await legacyFile(p.id, "preview", await makePdf(1), 1, { auto: true });
    await sql`update product_files set created_at = now() - interval '2 days' where id = ${old.id}`;
    await sql`update product_files set created_at = now() - interval '1 day' where id = ${main.id}`;
    await sql.file(resolve(__dirname, "../../db/migrations/0012_content_teachers.sql"));
    await expect(fileRow(old.id)).resolves.toMatchObject({ source_file_id: null });
    await expect(fileRow(recent.id)).resolves.toMatchObject({ source_file_id: main.id });
  });
});

// ---------------------------------------------------------------------------- C3
describe("C3 لا نشر بسعر صفر أو بتوزيع خاطئ", () => {
  const approveInput = { submittedAt: null, compareAtPriceFils: null, accessMode: "unlimited" as const, accessUntil: null, accessDays: null };
  const withTeacher = async (shareBps: number | null, opts: Parameters<typeof createProduct>[0] = {}) => {
    const t = await createTeacher({ shareBps });
    const p = await createProduct({ status: "draft", ...opts });
    await sql`update products set teacher_id = ${t.id} where id = ${p.id}`;
    return { t, p };
  };

  it("price zero without an explicit free decision cannot be published", async () => {
    const p = await createProduct({ status: "draft", priceFils: 1 });
    await sql`update products set price_fils = 0 where id = ${p.id}`;
    await expect(setProductStatus(p.id, "published", owner)).rejects.toThrow(/سعرًا أكبر من صفر/);
    await expect(rawProduct(p.id)).resolves.toMatchObject({ status: "draft" });
  });

  it("the database itself refuses free with a price", async () => {
    const p = await createProduct({ status: "draft", priceFils: 1000 });
    await expect(sql`update products set is_free = true where id = ${p.id}`).rejects.toThrow(/products_free_means_zero/);
  });

  it("explicitly free can be published, and a priced product still can", async () => {
    const free = await createProduct({ status: "draft", priceFils: 0 });
    await expect(setProductStatus(free.id, "published", owner)).resolves.toBeUndefined();
    const paid = await createProduct({ status: "draft", priceFils: 2500 });
    await expect(setProductStatus(paid.id, "published", owner)).resolves.toBeUndefined();
    const [a] = await auditOf("product.status", paid.id);
    expect(a.metadata).toMatchObject({ to: "published", priceFils: 2500, isFree: false });
  });

  it("a teacher can send a draft for review before price and share are decided", async () => {
    const t = await createTeacher({ mode: "self_managed", shareBps: null });
    const p = await createProduct({ status: "draft", priceFils: 1 });
    await sql`update products set teacher_id = ${t.id}, price_fils = 0 where id = ${p.id}`;
    await acceptAgreement(t.user!.id);
    await expect(submitForReview(p.id, teacherActor(t), undefined, ATTESTED)).resolves.toBeUndefined();
    await expect(rawProduct(p.id)).resolves.toMatchObject({ status: "in_review" });
  });

  it("approval without a price is refused, even if the teacher proposed one", async () => {
    const { p } = await withTeacher(4000);
    await sql`update products set status = 'in_review', price_fils = 0, proposed_price_fils = 3000 where id = ${p.id}`;
    await expect(approveAndPublish(p.id, { ...approveInput, priceFils: 0 }, owner)).rejects.toThrow(/سعرًا أكبر من صفر/);
    await expect(rawProduct(p.id)).resolves.toMatchObject({ status: "in_review", is_free: false });
  });

  it("approval as explicitly free works and is audited", async () => {
    const { p } = await withTeacher(4000);
    await sql`update products set status = 'in_review', price_fils = 0 where id = ${p.id}`;
    await approveAndPublish(p.id, { ...approveInput, priceFils: 0, isFree: true }, owner);
    await expect(rawProduct(p.id)).resolves.toMatchObject({ status: "published", is_free: true, price_fils: 0 });
    expect((await auditOf("product.review_approve", p.id))[0].metadata).toMatchObject({ isFree: true, priceFils: 0 });
  });

  it("approval as free with a price is refused", async () => {
    const { p } = await withTeacher(4000);
    await sql`update products set status = 'in_review' where id = ${p.id}`;
    await expect(approveAndPublish(p.id, { ...approveInput, priceFils: 1000, isFree: true }, owner)).rejects.toThrow(/المجاني سعره صفر/);
  });

  it("a teacher with no agreed share blocks a paid publish, on both paths", async () => {
    const { p, t } = await withTeacher(null);
    await expect(publishBlockers(p.id)).resolves.toEqual([expect.stringContaining(t.displayName)]);
    await expect(setProductStatus(p.id, "published", owner)).rejects.toThrow(/لم تُحدَّد نسبة/);
    await sql`update products set status = 'in_review' where id = ${p.id}`;
    await expect(approveAndPublish(p.id, { ...approveInput, priceFils: 3000 }, owner)).rejects.toThrow(/لم تُحدَّد نسبة/);
    await expect(rawProduct(p.id)).resolves.toMatchObject({ status: "in_review" });
  });

  it("a teacher with no share can still have a free item approved", async () => {
    const { p } = await withTeacher(null);
    await sql`update products set status = 'in_review', price_fils = 0 where id = ${p.id}`;
    await approveAndPublish(p.id, { ...approveInput, priceFils: 0, isFree: true }, owner);
    await expect(rawProduct(p.id)).resolves.toMatchObject({ status: "published" });
  });

  it("a bundle cannot be published around a contained teacher with no share", async () => {
    const { p } = await withTeacher(null, { status: "published" });
    const b = await createBundle({ items: [p.id], status: "draft", priceFils: 5000 });
    await expect(setProductStatus(b.id, "published", owner)).rejects.toThrow(/لم تُحدَّد نسبة/);
  });

  it.each([0, 10000])("share %i needs an explicit confirmation, on both paths", async (share) => {
    const { p } = await withTeacher(share);
    await expect(setProductStatus(p.id, "published", owner)).rejects.toThrow(/أكد النسبة/);
    await expect(rawProduct(p.id)).resolves.toMatchObject({ status: "draft" });
    await setProductStatus(p.id, "published", owner, undefined, { confirmShare: true });
    await expect(rawProduct(p.id)).resolves.toMatchObject({ status: "published" });

    const second = await withTeacher(share);
    await sql`update products set status = 'in_review' where id = ${second.p.id}`;
    await expect(approveAndPublish(second.p.id, { ...approveInput, priceFils: 3000 }, owner)).rejects.toThrow(/أكد النسبة/);
    await approveAndPublish(second.p.id, { ...approveInput, priceFils: 3000, confirmShare: true }, owner);
    expect((await auditOf("product.review_approve", second.p.id))[0].metadata).toMatchObject({ confirmedShares: [expect.objectContaining({ share_bps: share })] });
  });

  it("an ordinary share needs no confirmation", async () => {
    const { p } = await withTeacher(4000);
    await expect(setProductStatus(p.id, "published", owner)).resolves.toBeUndefined();
  });

  const content = (id: string) => sql<{ type: "final_notes"; title: string; summary: string; description: string; contents: string; grade_id: string; subject_id: string | null; academic_year: string; term: number | null; preview_pages: number; proposed_price_fils: number | null }[]>`select type, title, summary, description, contents, grade_id, subject_id, academic_year, term, preview_pages, proposed_price_fils from products where id = ${id}`;
  const input = async (id: string) => {
    const [c] = await content(id);
    return { type: c.type, title: c.title, summary: c.summary, description: c.description, contents: c.contents, gradeId: c.grade_id, subjectId: c.subject_id, academicYear: c.academic_year, term: c.term, previewPages: c.preview_pages, proposedPriceFils: c.proposed_price_fils };
  };

  it("a published product cannot be edited down to zero without being marked free", async () => {
    const p = await createProduct({ priceFils: 3000 });
    await expect(updateProduct(p.id, { ...(await input(p.id)), priceFils: 0 }, owner)).rejects.toThrow(/منتج منشور لا يكون سعره صفرًا/);
    await updateProduct(p.id, { ...(await input(p.id)), priceFils: 0, isFree: true, compareAtPriceFils: null }, owner);
    await expect(rawProduct(p.id)).resolves.toMatchObject({ is_free: true, price_fils: 0 });
  });

  it("a published paid product cannot move to a teacher with no share or an unconfirmed extreme share", async () => {
    const p = await createProduct({ priceFils: 3000 });
    const none = await createTeacher({ shareBps: null });
    const zero = await createTeacher({ shareBps: 0 });
    await expect(updateProduct(p.id, { ...(await input(p.id)), teacherId: none.id }, owner)).rejects.toThrow(/لم تُحدَّد نسبة/);
    await expect(updateProduct(p.id, { ...(await input(p.id)), teacherId: zero.id }, owner)).rejects.toThrow(/لتأكيد النسبة/);
  });

  it("the agreed share cannot be erased while paid products are live", async () => {
    const { t, p } = await withTeacher(4000);
    await setProductStatus(p.id, "published", owner);
    const cur = (await getTeacherAdmin(t.id))!;
    const teacherInput = { slug: cur.slug, displayName: cur.display_name, headline: cur.headline, bio: cur.bio, isPublished: cur.is_published, canUpload: cur.can_upload, revenueShareBps: null, sortOrder: cur.sort_order, subjectIds: [] };
    await expect(updateTeacher(t.id, teacherInput, owner.userId)).rejects.toThrow(/منتجات منشورة مدفوعة/);
    expect((await getTeacherAdmin(t.id))!.revenue_share_bps).toBe(4000);
    await sql`update products set status = 'hidden' where id = ${p.id}`;
    await expect(updateTeacher(t.id, teacherInput, owner.userId)).resolves.toBeUndefined();
  });

  it("products published before these rules cannot be sold wrongly and are shown to the owner", async () => {
    const zero = await createProduct({ priceFils: 1 });
    await sql`update products set price_fils = 0 where id = ${zero.id}`;
    const { p: noShare, t } = await withTeacher(null, { status: "published", priceFils: 2000 });
    const free = await createProduct({ priceFils: 0 });
    const ok = await createProduct({ priceFils: 1500 });
    const blocked = await unsellableProductIds([zero.id, noShare.id, free.id, ok.id]);
    expect(blocked).toEqual(new Set([zero.id, noShare.id]));
    const cart = await computeCart([zero.id, noShare.id, free.id, ok.id], null);
    expect(cart.payableLines.map((l) => l.id).sort()).toEqual([free.id, ok.id].sort());
    const report = await contentHealthReport();
    expect(report.unpriced.map((x) => x.id)).toContain(zero.id);
    expect(report.noShare.find((x) => x.id === noShare.id)?.teacher_name).toBe(t.displayName);
    expect((await contentHealthCounts()).noShare).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------- C6
describe("C6 حد الحجم حسب خطة التخزين وتأكيد الرفع", () => {
  const initPdf = (productId: string, size: number, actor: Actor = owner) => initUpload({ target: "main", productId, fileName: "a.pdf", size, mime: "application/pdf" }, actor);
  const setPlan = (env: Record<string, string>) => {
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    resetEnvCache();
  };
  const supabase = { STORAGE_DRIVER: "supabase", SUPABASE_URL: "https://example.supabase.test", SUPABASE_SERVICE_ROLE_KEY: "test-key" };

  it("the safe default on Supabase is the Free plan limit", () => {
    setPlan(supabase);
    expect(storageFileCap()).toEqual({ capBytes: SUPABASE_FREE_MAX_BYTES, source: "free_plan" });
    expect(uploadLimitBytes("pdf")).toBe(50 * 1024 * 1024);
    expect(uploadLimitBytes("video")).toBe(50 * 1024 * 1024);
    expect(uploadLimitBytes("image")).toBe(UPLOAD_RULES.image.maxBytes);
    expect(uploadLimitLabel("pdf")).toBe("50 ميجابايت");
  });

  it("a paid plan returns to the platform limits", () => {
    setPlan({ ...supabase, STORAGE_PLAN: "paid" });
    expect(storageFileCap().capBytes).toBeNull();
    expect(uploadLimitBytes("pdf")).toBe(UPLOAD_RULES.pdf.maxBytes);
    expect(uploadLimitLabel("video")).toBe("2 جيجابايت");
  });

  it("an explicit limit wins over the plan and an empty value is ignored", () => {
    setPlan({ ...supabase, STORAGE_PLAN: "paid", STORAGE_MAX_FILE_MB: "20" });
    expect(uploadLimitBytes("pdf")).toBe(20 * 1024 * 1024);
    setPlan({ ...supabase, STORAGE_PLAN: "paid", STORAGE_MAX_FILE_MB: "" });
    expect(uploadLimitBytes("pdf")).toBe(UPLOAD_RULES.pdf.maxBytes);
  });

  it("local storage is not limited by a cloud plan", () => {
    expect(storageFileCap()).toEqual({ capBytes: null, source: "none" });
  });

  it("over the limit is refused before any upload, with the fix for the owner and a plain message for the teacher", async () => {
    setPlan({ STORAGE_MAX_FILE_MB: "2" });
    const t = await createTeacher({ mode: "self_managed", shareBps: 4000 });
    const p = await draft();
    await sql`update products set teacher_id = ${t.id} where id = ${p.id}`;
    await expect(initPdf(p.id, 3 * 1024 * 1024)).rejects.toThrow(/الإعدادات، قسم التخزين/);
    const asTeacher = initPdf(p.id, 3 * 1024 * 1024, teacherActor(t));
    await expect(asTeacher).rejects.toThrow(/تواصل مع إدارة المنصة/);
    await expect(asTeacher).rejects.not.toThrow(/خطة التخزين|STORAGE/);
    await expect(initPdf(p.id, 1024 * 1024)).resolves.toMatchObject({ method: "PUT" });
  });

  it("a client that lied about the size is caught at completion and the object removed", async () => {
    setPlan({ STORAGE_MAX_FILE_MB: "1" });
    const p = await draft();
    const big = new Uint8Array(1024 * 1024 + 10);
    big.set(fixture("plain.pdf"));
    const key = `products/${p.id}/2026/11/${randomUUID()}.pdf`;
    await storage().put("private", key, big, "application/pdf");
    await expect(completeUpload({ target: "main", key, productId: p.id }, owner)).rejects.toThrow(/حجم الملف أكبر/);
    expect(existsSync(privatePath(key))).toBe(false);
  });

  it("a truncated arrival is refused at completion", async () => {
    const p = await draft();
    const bytes = fixture("plain.pdf");
    await expect(upload(p.id, "main", bytes, owner, { size: bytes.length + 5 })).rejects.toThrow(/لم يصل الملف كاملًا/);
    expect(await filesOf(p.id)).toHaveLength(0);
  });

  it("completing twice after a lost response registers one file and answers the same", async () => {
    const p = await draft();
    const bytes = await makePdf(20);
    const first = await upload(p.id, "main", bytes);
    const second = await upload(p.id, "main", bytes, owner, { key: first.key });
    expect(second).toMatchObject({ id: first.id, message: first.message.split(".")[0] });
    expect((await filesOf(p.id)).filter((f) => f.kind === "main")).toHaveLength(1);
    expect((await filesOf(p.id)).filter((f) => f.kind === "preview")).toHaveLength(1);
  });

  it("a key from another product cannot be replayed through idempotency", async () => {
    const a = await draft();
    const b = await draft();
    const first = await upload(a.id, "main", await makePdf(20));
    await expect(completeUpload({ target: "main", key: first.key, productId: b.id }, owner)).rejects.toThrow(/مرجع الملف غير صالح/);
  });

  it("a storage outage at completion does not delete the upload, so it can be confirmed again", async () => {
    const p = await draft();
    const bytes = await makePdf(20);
    const key = `products/${p.id}/2026/11/${randomUUID()}.pdf`;
    await storage().put("private", key, bytes, "application/pdf");
    vi.spyOn(storage(), "read").mockRejectedValueOnce(new Error("storage down"));
    await expect(completeUpload({ target: "main", key, productId: p.id }, owner)).rejects.toThrow(/حاول مرة أخرى/);
    expect(existsSync(privatePath(key))).toBe(true);
    await expect(completeUpload({ target: "main", key, productId: p.id }, owner)).resolves.toMatchObject({ id: expect.any(String) });
  });

  it("a product whose upload never finished stays a draft that cannot be published", async () => {
    const p = await draft();
    const key = `products/${p.id}/2026/11/${randomUUID()}.pdf`;
    await storage().put("private", key, fixture("plain.pdf"), "application/pdf");
    await expect(publishBlockers(p.id)).resolves.not.toEqual([]);
    await expect(setProductStatus(p.id, "published", owner)).rejects.toThrow();
    await expect(rawProduct(p.id)).resolves.toMatchObject({ status: "draft" });
  });

  it("a preview failure after the main file is stored does not fail the upload and is reported", async () => {
    const p = await draft();
    const bytes = await makePdf(20);
    const realRead = storage().read.bind(storage());
    let reads = 0;
    vi.spyOn(storage(), "read").mockImplementation(async (b, k) => {
      if (++reads === 2) throw new Error("storage down");
      return realRead(b, k);
    });
    const r = await upload(p.id, "main", bytes);
    expect(r.message).toContain("تعذر توليد المعاينة");
    expect((await filesOf(p.id)).filter((f) => f.kind === "main")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------- C7
describe("C7 مهلة تسليم الملف", () => {
  it("fits the Hobby ceiling and leaves room for the stamp and the stream", async () => {
    const { maxDuration } = await import("@/app/api/files/[fileId]/route");
    expect(maxDuration).toBe(300);
    const { DELIVERY_STAMP_BUDGET_MS, TRIAL_STAMP_BUDGET_MS } = await import("@/server/access/pdf");
    expect(DELIVERY_STAMP_BUDGET_MS).toBeLessThan(maxDuration * 1000);
    expect(TRIAL_STAMP_BUDGET_MS).toBeLessThan(DELIVERY_STAMP_BUDGET_MS);
  });

  it("an upload that cannot be stamped in time gets the reason, and nothing is registered", async () => {
    const p = await draft();
    const pdf = await import("@/server/access/pdf");
    vi.spyOn(pdf, "inspectPdf").mockResolvedValue({ ok: false, problem: "too_complex" });
    await expect(upload(p.id, "main", fixture("plain.pdf"))).rejects.toThrow(/قسّمه/);
    expect(await filesOf(p.id)).toHaveLength(0);
  });
});
