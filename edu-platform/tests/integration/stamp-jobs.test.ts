import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as pdf from "@/server/access/pdf";
import * as gate from "@/server/access/stamp-gate";
import { clearPreviewMemoryForTests, sweepDoomedCopies } from "@/server/access/delivery";
import { drainStampJobs, STAMP_JOB_MAX_ATTEMPTS } from "@/server/access/stamp-jobs";
import { DRAIN_BUDGET_MS, enqueueBuyerCopies, scheduleStampDrain, stampPrepProgress } from "@/server/access/stamp-queue";
import { revokeProduct } from "@/server/access/entitlements";
import type { Actor } from "@/server/auth/permissions";
import { deleteProductFile } from "@/server/admin/products";
import { createOrder, type OrderRow } from "@/server/commerce/orders";
import { resetEnvCache } from "@/server/env";
import { openOrderHolds, placeOrderHold } from "@/server/payments/holds";
import { recordMoneyReturned } from "@/server/payments/refunds";
import { storage } from "@/server/storage";
import { READER_DELIVERY_HEADER } from "@/lib/reader-error";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createBundle, createProduct, createUser, makePdf, type TestProduct } from "../helpers/factories";
import { provenOwner } from "../helpers/step-up";
import { applyAcceptedRefund, confirmPaid } from "../helpers/payment-flow";
import { completeTicketed } from "../helpers/upload-ticket";
import { TEST_STORAGE_DIR } from "../test-env";

/**
 * النسخ المجهزة قبل الفتح (القرار F23): الطابور يُملأ عند المنح وعند ملف جديد وبزر المالك، ويُفرَّغ بعد الرد
 * وبالمهمة اليومية وبزر المالك وبفتح الطالب نفسه. لا يُختم ملف مدفوع إلا لمن يملكه الآن، ولا يُختم مرتين.
 */
const session = vi.hoisted(() => ({ user: null as null | { id: string; email: string; role: string }, sessionId: "" }));
/** ما جُدول بعد الرد (after في Next.js): يُشغَّل في الاختبار حين يريد، كما يشغله Next بعد إرسال الرد */
const afterQueue = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (fn: () => unknown) => void afterQueue.push(fn) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/auth/session", async (original) => ({
  ...(await original<typeof import("@/server/auth/session")>()),
  getCurrentUser: async () => session.user,
  getCurrentSession: async () => (session.user ? { user: session.user, sessionId: session.sessionId, mustChangePassword: false, needsTwoFactorEnrolment: false } : null),
}));
vi.mock("@/server/http", async (original) => ({ ...(await original<typeof import("@/server/http")>()), clientIp: async () => "192.0.2.75", userAgent: async () => "t" }));

const { GET } = await import("@/app/api/files/[fileId]/route");
const { prepareCopiesAction } = await import("@/app/admin/products/actions");
const { GET: prepareCopiesCron } = await import("@/app/api/cron/prepare-copies/route");

let admin: Awaited<ReturnType<typeof createUser>>;
let owner: Actor;
let ownerSession = "";

beforeAll(async () => {
  await resetDb();
  admin = await createUser({ role: "admin" });
  ownerSession = (await provenOwner(admin)).sessionId;
  owner = { kind: "owner", userId: admin.id, name: admin.fullName, email: admin.email, teacherId: null, canUpload: true };
});
afterAll(closeDb);
beforeEach(() => clearPreviewMemoryForTests());
afterEach(async () => {
  vi.restoreAllMocks();
  await flushAfter();
  session.user = null;
  gate.configureStampGateForTests(null);
  await sql`delete from settings where key = 'watermark_enabled'`;
});

async function flushAfter() {
  while (afterQueue.length) await afterQueue.shift()!();
}

async function buyer(product: TestProduct, existing?: Awaited<ReturnType<typeof createUser>>): Promise<{ user: Awaited<ReturnType<typeof createUser>>; order: OrderRow }> {
  const user = existing ?? (await createUser());
  const order = await createOrder({ user, productIds: [product.id], isTest: true, consent: { guardianDeclared: true, termsAccepted: true, meta: { ip: null, userAgent: null } } });
  await confirmPaid(order);
  return { user, order };
}

/** تعليق على الطلب كما يضعه نزاع من البوابة (payments/holds.ts): يسحب الوصول ولا يمس النسخ ولا المهام */
const hold = (order: OrderRow) =>
  sql.begin((tx) => placeOrderHold(tx, { orderId: order.id, paymentId: null, kind: "dispute", sourceKey: `test-${randomUUID()}`, status: "PENDING", amountFils: null }));
const stored = (key: string) => existsSync(resolve(TEST_STORAGE_DIR, "private", key));

/** ملف رئيسي ثانٍ في المنتج نفسه، بمحتوى مختلف */
async function addMainFile(productId: string, label = "Second part"): Promise<string> {
  const bytes = await makePdf(3, label);
  const key = `products/${productId}/${randomUUID()}.pdf`;
  await storage().put("private", key, bytes, "application/pdf");
  const [f] = await sql<{ id: string }[]>`
    insert into product_files (product_id, kind, title, storage_key, original_name, mime_type, size_bytes, page_count, sort_order, check_status, checked_at)
    values (${productId}, 'main', 'الجزء الثاني', ${key}, 'part2.pdf', 'application/pdf', ${bytes.length}, 3, 1, 'ok', now())
    returning id
  `;
  return f.id;
}

const jobsOf = (fileIds: string[]) =>
  sql<{ user_id: string; file_id: string; reason: string; attempts: number; last_error: string | null; holder: string | null; due: boolean }[]>`
    select user_id, file_id, reason, attempts, last_error, holder, not_before <= now() as due from stamp_jobs where file_id = any(${fileIds}::uuid[]) order by created_at
  `;
const readyCopies = (fileId: string) => sql<{ user_id: string; object_key: string }[]>`select user_id, object_key from stamped_copies where file_id = ${fileId} and state = 'ready'`;
const drain = (fileIds: string[], budgetMs = 60_000) => drainStampJobs({ fileIds, budgetMs });
const stampSpy = () => vi.spyOn(pdf, "watermarkPdf");

function openAs(fileId: string, as: { id: string; email: string; role: string }) {
  session.user = as;
  return GET(new NextRequest(`http://localhost/api/files/${fileId}`, { headers: { "x-reader": "1", [READER_DELIVERY_HEADER]: "url", "x-forwarded-for": "198.51.100.12" } }), { params: Promise.resolve({ fileId }) });
}

const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};
const asOwner = () => {
  session.user = admin;
  session.sessionId = ownerSession;
};

describe("F23: what fills the queue", () => {
  it("a paid grant queues every main file of the product for the buyer, and schedules one drain after the response", async () => {
    const p = await createProduct();
    const second = await addMainFile(p.id);
    afterQueue.length = 0;
    const { user } = await buyer(p);
    const jobs = await jobsOf([p.mainFileId!, second]);
    expect(jobs.map((j) => [j.user_id, j.reason, j.attempts])).toEqual([
      [user.id, "grant", 0],
      [user.id, "grant", 0],
    ]);
    expect(afterQueue).toHaveLength(1);
    // بعد الرد: المفرّغ يجهز النسختين
    const stamp = stampSpy();
    await flushAfter();
    expect(stamp).toHaveBeenCalledTimes(2);
    expect(await jobsOf([p.mainFileId!, second])).toEqual([]);
    expect(await readyCopies(p.mainFileId!)).toEqual([expect.objectContaining({ user_id: user.id })]);
    expect(await readyCopies(second)).toEqual([expect.objectContaining({ user_id: user.id })]);
  });

  it("a bundle purchase queues the main files of everything inside it", async () => {
    const [a, b] = [await createProduct(), await createProduct()];
    const bundle = await createBundle({ items: [a.id, b.id] });
    const { user } = await buyer(bundle);
    expect((await jobsOf([a.mainFileId!, b.mainFileId!])).map((j) => j.user_id)).toEqual([user.id, user.id]);
  });

  it("a replayed payment notice neither duplicates nor resets a job", async () => {
    const p = await createProduct();
    const { user, order } = await buyer(p);
    await sql`update stamp_jobs set attempts = 3 where user_id = ${user.id}`;
    await confirmPaid(order).catch(() => {});
    expect((await jobsOf([p.mainFileId!])).map((j) => j.attempts)).toEqual([3]);
  });

  it("a new main file queues every current buyer, direct or through a bundle, and nobody else", async () => {
    const p = await createProduct();
    const bundle = await createBundle({ items: [p.id] });
    const direct = await buyer(p);
    const viaBundle = await buyer(bundle);
    const refunded = await buyer(p);
    await applyAcceptedRefund(refunded.order.id, admin.id, "استرداد");
    const inactive = await buyer(p);
    await sql`update users set is_active = false where id = ${inactive.user.id}`;
    const stranger = await createUser();
    await sql`delete from stamp_jobs where file_id = ${p.mainFileId}`;

    const key = `products/${p.id}/2026/11/${randomUUID()}.pdf`;
    await storage().put("private", key, await makePdf(4, "New chapter"), "application/pdf");
    afterQueue.length = 0;
    const { id: newFile } = await completeTicketed({ target: "main", key, productId: p.id }, owner);
    const queued = (await jobsOf([newFile])).map((j) => [j.user_id, j.reason]);
    expect(queued).toHaveLength(2);
    expect(queued).toEqual(expect.arrayContaining([
      [direct.user.id, "new_file"],
      [viaBundle.user.id, "new_file"],
    ]));
    expect(queued.map(([u]) => u)).not.toContain(stranger.id);
    expect(afterQueue.length).toBeGreaterThanOrEqual(1);
  });

  it("a buyer whose copy of the current file is ready is not queued again", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    await drain([p.mainFileId!]);
    expect(await readyCopies(p.mainFileId!)).toHaveLength(1);
    expect(await enqueueBuyerCopies([p.mainFileId!], "owner")).toBe(0);
    expect(await jobsOf([p.mainFileId!])).toEqual([]);
    expect(user.id).toBeTruthy();
  });

  it("buying a bundle that holds a note the buyer already owns queues that note again: its copy now carries the bundle's order (V4)", async () => {
    const p = await createProduct();
    const { user, order: first } = await buyer(p);
    await drain([p.mainFileId!]);
    expect(await stampPrepProgress(p.id)).toMatchObject({ buyers: 1, wanted: 1, ready: 1, queued: 0 });

    const bundle = await createBundle({ items: [p.id] });
    const { order: second } = await buyer(bundle, user);
    expect(second.number).not.toBe(first.number);
    // صلاحية المذكرة لم تتغير (من الطلب الأول)، لكن الفتح يختمها الآن برقم طلب الباقة: النسخة الجاهزة ليست التي يسلّمها
    expect(await jobsOf([p.mainFileId!])).toMatchObject([{ user_id: user.id, reason: "grant" }]);
    expect(await stampPrepProgress(p.id)).toMatchObject({ buyers: 1, wanted: 1, ready: 0, queued: 1 });

    expect(await drain([p.mainFileId!])).toMatchObject({ prepared: 1 });
    expect(await stampPrepProgress(p.id)).toMatchObject({ ready: 1, queued: 0 });
    // وما جُهز هو بالضبط ما يأخذه الفتح: لا ختم عند الفتح
    const stamp = stampSpy();
    expect((await openAs(p.mainFileId!, user)).status).toBe(200);
    expect(stamp).not.toHaveBeenCalled();
  });

  it("a grant that queues again a job a drainer holds frees it, so that drainer's finish does not remove it (V4)", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    const inFlight = randomUUID();
    await sql`update stamp_jobs set holder = ${inFlight}, lease_until = now() + interval '5 minutes' where user_id = ${user.id}`;
    await buyer(await createBundle({ items: [p.id] }), user);
    expect(await jobsOf([p.mainFileId!])).toMatchObject([{ reason: "grant", holder: null, due: true, attempts: 0 }]);
    // المفرّغ الذي كان يختم بالهوية القديمة ينهي مهمته (done يطابق حاملها): لا يجدها، فتبقى للهوية الجديدة
    expect((await sql`delete from stamp_jobs where user_id = ${user.id} and holder = ${inFlight}`).count).toBe(0);
    expect(await jobsOf([p.mainFileId!])).toHaveLength(1);
  });
});

describe("F23: draining", () => {
  it("prepares every queued copy and reads the original once for the whole batch", async () => {
    const p = await createProduct();
    const buyers = [await buyer(p), await buyer(p), await buyer(p)];
    const stamp = stampSpy();
    const read = vi.spyOn(storage(), "read");
    const report = await drain([p.mainFileId!]);
    expect(report).toMatchObject({ prepared: 3, failed: 0, dropped: 0, remaining: false, skipped: null });
    expect(stamp).toHaveBeenCalledTimes(3);
    expect(read).toHaveBeenCalledTimes(1);
    expect((await readyCopies(p.mainFileId!)).map((c) => c.user_id).sort()).toEqual(buyers.map((b) => b.user.id).sort());
    expect(await jobsOf([p.mainFileId!])).toEqual([]);
  });

  it("an open of a prepared copy does no stamping and reads nothing", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    await drain([p.mainFileId!]);
    const stamp = stampSpy();
    const read = vi.spyOn(storage(), "read");
    const stream = vi.spyOn(storage(), "readStream");
    const res = await openAs(p.mainFileId!, user);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ url: expect.stringMatching(/^\/api\/files\/stamped\?t=/) });
    expect(stamp).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
  });

  it("two drainers at once never stamp the same job twice, and a third on the instance stands aside", async () => {
    const p = await createProduct();
    for (let i = 0; i < 4; i++) await buyer(p);
    const stamp = stampSpy();
    const [r1, r2, r3] = await Promise.all([drain([p.mainFileId!]), drain([p.mainFileId!]), drain([p.mainFileId!])]);
    expect(r3.skipped).toBe("busy");
    expect(r1.prepared + r2.prepared).toBe(4);
    expect(stamp).toHaveBeenCalledTimes(4);
    const ready = await readyCopies(p.mainFileId!);
    expect(new Set(ready.map((c) => c.user_id)).size).toBe(4);
    expect(ready).toHaveLength(4);
  });

  it("a job held by a live drainer elsewhere is left alone; one whose drainer died is taken over", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    await sql`update stamp_jobs set holder = ${randomUUID()}, lease_until = now() + interval '5 minutes' where user_id = ${user.id}`;
    const stamp = stampSpy();
    expect(await drain([p.mainFileId!])).toMatchObject({ prepared: 0 });
    expect(stamp).not.toHaveBeenCalled();
    await sql`update stamp_jobs set lease_until = now() - interval '1 second' where user_id = ${user.id}`;
    expect(await drain([p.mainFileId!])).toMatchObject({ prepared: 1 });
    expect(stamp).toHaveBeenCalledTimes(1);
  });

  it("a job for someone who does not own the product is dropped without stamping", async () => {
    const p = await createProduct();
    const stranger = await createUser();
    const refunded = await buyer(p);
    await applyAcceptedRefund(refunded.order.id, admin.id, "استرداد");
    await sql`insert into stamp_jobs (user_id, file_id, reason) values (${stranger.id}, ${p.mainFileId}, 'owner'), (${refunded.user.id}, ${p.mainFileId}, 'owner')`;
    const stamp = stampSpy();
    expect(await drain([p.mainFileId!])).toMatchObject({ prepared: 0, dropped: 2 });
    expect(stamp).not.toHaveBeenCalled();
    expect(await readyCopies(p.mainFileId!)).toEqual([]);
    expect(await jobsOf([p.mainFileId!])).toEqual([]);
  });

  it("an open that finds its own job queued stamps once and clears it, so no drainer stamps it again", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    expect(await jobsOf([p.mainFileId!])).toHaveLength(1);
    const stamp = stampSpy();
    expect((await openAs(p.mainFileId!, user)).status).toBe(200);
    expect(await jobsOf([p.mainFileId!])).toEqual([]);
    await drain([p.mainFileId!]);
    expect(stamp).toHaveBeenCalledTimes(1);
  });

  it("steps aside while a student waits for a stamping slot, and gives its jobs back untouched", async () => {
    const p = await createProduct();
    await buyer(p);
    await buyer(p);
    vi.spyOn(gate, "stampGateContended").mockReturnValue(true);
    const stamp = stampSpy();
    expect(await drain([p.mainFileId!])).toMatchObject({ prepared: 0, remaining: true });
    expect(stamp).not.toHaveBeenCalled();
    expect((await jobsOf([p.mainFileId!])).map((j) => [j.attempts, j.holder, j.due])).toEqual([
      [0, null, true],
      [0, null, true],
    ]);
  });

  it("stops when its time is up and leaves the rest for the next drain", async () => {
    const p = await createProduct();
    await buyer(p);
    const stamp = stampSpy();
    expect(await drain([p.mainFileId!], 1_000)).toMatchObject({ prepared: 0, remaining: true });
    expect(stamp).not.toHaveBeenCalled();
    expect(await jobsOf([p.mainFileId!])).toHaveLength(1);
  });

  it("a failing job waits longer each time, then stops and shows as failed until the owner presses again", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    vi.spyOn(pdf, "watermarkPdf").mockRejectedValue(new Error("boom"));
    expect(await drain([p.mainFileId!])).toMatchObject({ prepared: 0, failed: 0 });
    let [job] = await jobsOf([p.mainFileId!]);
    expect(job).toMatchObject({ attempts: 1, last_error: "error", holder: null, due: false });

    await sql`update stamp_jobs set attempts = ${STAMP_JOB_MAX_ATTEMPTS - 1}, not_before = now() where user_id = ${user.id}`;
    expect(await drain([p.mainFileId!])).toMatchObject({ failed: 1 });
    [job] = await jobsOf([p.mainFileId!]);
    expect(job).toMatchObject({ attempts: STAMP_JOB_MAX_ATTEMPTS, due: false });
    expect(await stampPrepProgress(p.id)).toMatchObject({ buyers: 1, wanted: 1, ready: 0, queued: 0, failed: 1 });
    // ولا يأخذها مفرّغ بعد ذلك وحده
    await sql`update stamp_jobs set not_before = not_before - interval '1 day' where user_id = ${user.id}`;
    expect(await drain([p.mainFileId!])).toMatchObject({ prepared: 0, failed: 0 });

    vi.restoreAllMocks();
    expect(await enqueueBuyerCopies([p.mainFileId!], "owner")).toBe(1);
    expect(await stampPrepProgress(p.id)).toMatchObject({ queued: 1, failed: 0 });
    expect(await drain([p.mainFileId!])).toMatchObject({ prepared: 1 });
    expect(await stampPrepProgress(p.id)).toMatchObject({ buyers: 1, wanted: 1, ready: 1, queued: 0, failed: 0 });
  });

  it("with the stamp off it stamps nothing and empties the queue", async () => {
    const p = await createProduct();
    await buyer(p);
    await sql`insert into settings (key, value) values ('watermark_enabled', 'false'::jsonb)`;
    const stamp = stampSpy();
    expect(await drain([p.mainFileId!])).toMatchObject({ skipped: "watermark_off" });
    expect(stamp).not.toHaveBeenCalled();
    expect(await jobsOf([p.mainFileId!])).toEqual([]);
  });

  it("a refund that lands after the drainer checked ownership and before it took the copy keeps nothing (V3)", async () => {
    const p = await createProduct();
    const { order } = await buyer(p);
    // يُقرأ الأصل بعد فحص الملكية وقبل صف العقد: الاسترداد هنا لم يجد نسخة يعلّمها للحذف
    const realRead = storage().read;
    vi.spyOn(storage(), "read").mockImplementation(async (...args) => {
      await applyAcceptedRefund(order.id, admin.id, "استرداد");
      return realRead(...args);
    });
    const put = vi.spyOn(storage(), "put");
    expect(await drain([p.mainFileId!])).toMatchObject({ prepared: 0, dropped: 1 });
    expect(await readyCopies(p.mainFileId!)).toEqual([]);
    expect(put).toHaveBeenCalledTimes(1);
    expect(stored(put.mock.calls[0][1])).toBe(false);
  });

  it("a hold placed while the drainer stamps keeps nothing and drops the job, since the buyer no longer owns the note (V3)", async () => {
    const p = await createProduct();
    const { order } = await buyer(p);
    const real = pdf.watermarkPdf;
    vi.spyOn(pdf, "watermarkPdf").mockImplementation(async (...args) => {
      expect(await hold(order)).toBe(true);
      return real(...args);
    });
    const put = vi.spyOn(storage(), "put");
    expect(await drain([p.mainFileId!])).toMatchObject({ prepared: 0, dropped: 1, failed: 0 });
    expect(await readyCopies(p.mainFileId!)).toEqual([]);
    expect(await jobsOf([p.mainFileId!])).toEqual([]);
    expect(stored(put.mock.calls[0][1])).toBe(false);
  });

  it("a copy whose address changed during the stamp is not kept, and its job waits to be stamped with the new address", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    const real = pdf.watermarkPdf;
    vi.spyOn(pdf, "watermarkPdf").mockImplementationOnce(async (...args) => {
      await sql`update users set email = ${`moved-${randomUUID().slice(0, 8)}@example.com`} where id = ${user.id}`;
      return real(...args);
    });
    expect(await drain([p.mainFileId!])).toMatchObject({ prepared: 0, dropped: 0 });
    expect(await readyCopies(p.mainFileId!)).toEqual([]);
    expect(await jobsOf([p.mainFileId!])).toMatchObject([{ last_error: "not_kept", holder: null, due: false }]);
    await sql`update stamp_jobs set not_before = now() where user_id = ${user.id}`;
    expect(await drain([p.mainFileId!])).toMatchObject({ prepared: 1 });
  });

  it("a file deleted during a batch stamps nothing more from the original already read (V3)", async () => {
    const p = await createProduct();
    await addMainFile(p.id);
    await buyer(p);
    await buyer(p);
    const real = pdf.watermarkPdf;
    const stamp = vi.spyOn(pdf, "watermarkPdf").mockImplementationOnce(async (...args) => {
      await deleteProductFile(p.id, p.mainFileId!, owner);
      return real(...args);
    });
    const put = vi.spyOn(storage(), "put");
    await drain([p.mainFileId!]);
    expect(stamp).toHaveBeenCalledTimes(1);
    expect(await sql`select 1 from stamped_copies where file_id = ${p.mainFileId} and state <> 'doomed'`).toEqual([]);
    for (const call of put.mock.calls) expect(stored(call[1])).toBe(false);
  });

  it("one drain is scheduled per scope while one is pending on this instance", async () => {
    afterQueue.length = 0;
    const scope = { fileIds: [randomUUID()] };
    scheduleStampDrain(scope, DRAIN_BUDGET_MS.afterUpload);
    scheduleStampDrain(scope, DRAIN_BUDGET_MS.afterUpload);
    scheduleStampDrain({ fileIds: [randomUUID()] }, DRAIN_BUDGET_MS.afterUpload);
    expect(afterQueue).toHaveLength(2);
    await flushAfter();
    scheduleStampDrain(scope, DRAIN_BUDGET_MS.afterUpload);
    expect(afterQueue).toHaveLength(1);
  });
});

describe("F23: a replaced file and a refund", () => {
  it("a replaced file is prepared for every buyer, and the old copies are never served again", async () => {
    const p = await createProduct();
    const [a, b] = [await buyer(p), await buyer(p)];
    await drain([p.mainFileId!]);
    const old = await readyCopies(p.mainFileId!);
    expect(old).toHaveLength(2);

    const key = `products/${p.id}/2026/11/${randomUUID()}.pdf`;
    await storage().put("private", key, await makePdf(4, "Corrected edition"), "application/pdf");
    const { id: newFile } = await completeTicketed({ target: "main", key, productId: p.id }, owner);
    await deleteProductFile(p.id, p.mainFileId!, owner);
    expect(await readyCopies(p.mainFileId!)).toEqual([]);
    for (const c of old) expect(existsSync(resolve(TEST_STORAGE_DIR, "private", c.object_key))).toBe(false);
    expect((await openAs(p.mainFileId!, a.user)).status).toBe(404);

    expect((await jobsOf([newFile])).map((j) => j.user_id).sort()).toEqual([a.user.id, b.user.id].sort());
    expect(await drain([newFile])).toMatchObject({ prepared: 2 });
    const stamp = stampSpy();
    for (const who of [a, b]) expect((await openAs(newFile, who.user)).status).toBe(200);
    expect(stamp).not.toHaveBeenCalled();
  });

  it("a refund removes the queued jobs and the kept copies", async () => {
    const p = await createProduct();
    const second = await addMainFile(p.id);
    const { user, order } = await buyer(p);
    await drain([p.mainFileId!]);
    expect(await readyCopies(p.mainFileId!)).toHaveLength(1);
    expect(await jobsOf([second])).toHaveLength(1);
    const [kept] = await readyCopies(p.mainFileId!);

    await applyAcceptedRefund(order.id, admin.id, "استرداد");
    expect(await jobsOf([p.mainFileId!, second])).toEqual([]);
    expect(await readyCopies(p.mainFileId!)).toEqual([]);
    await sweepDoomedCopies(100);
    expect(existsSync(resolve(TEST_STORAGE_DIR, "private", kept.object_key))).toBe(false);
    expect(await sql`select 1 from stamped_copies where user_id = ${user.id}`).toHaveLength(0);
  });

  const settlements: [string, (order: OrderRow) => Promise<void>][] = [
    ["the owner records that the money came back", async (order) => {
      const [h] = await openOrderHolds({ orderId: order.id });
      expect(await recordMoneyReturned({ holdId: h.id, adminId: admin.id, reason: "خسرنا النزاع" })).toBe("recorded");
    }],
    ["a full refund goes through", async (order) => {
      await applyAcceptedRefund(order.id, admin.id, "استرداد");
    }],
  ];
  it.each(settlements)("after a hold, when %s, the kept copies and the queued jobs go as with any refund (V1)", async (_how, settle) => {
    const p = await createProduct();
    const second = await addMainFile(p.id);
    const { user, order } = await buyer(p);
    await drain([p.mainFileId!]);
    const [kept] = await readyCopies(p.mainFileId!);
    expect(await hold(order)).toBe(true);
    // التعليق يسحب الوصول ويترك النسخة والمهمة: قد يُرفع فيعود كل شيء كما كان
    expect(await readyCopies(p.mainFileId!)).toHaveLength(1);
    expect(await jobsOf([second])).toHaveLength(1);

    await settle(order);
    expect(await jobsOf([p.mainFileId!, second])).toEqual([]);
    expect(await readyCopies(p.mainFileId!)).toEqual([]);
    await sweepDoomedCopies(100);
    expect(stored(kept.object_key)).toBe(false);
    expect(await sql`select 1 from stamped_copies where user_id = ${user.id}`).toHaveLength(0);
  });

  it("a refund of another order leaves alone the copies of a held one, whose hold may still be lifted (V1)", async () => {
    const [p, q] = [await createProduct(), await createProduct()];
    const { user, order: held } = await buyer(p);
    const { order: other } = await buyer(q, user);
    await drain([p.mainFileId!, q.mainFileId!]);
    expect(await hold(held)).toBe(true);
    await applyAcceptedRefund(other.id, admin.id, "استرداد");
    expect(await readyCopies(q.mainFileId!)).toEqual([]);
    expect(await readyCopies(p.mainFileId!)).toEqual([expect.objectContaining({ user_id: user.id })]);
  });

  it("an owner's revoke does the same", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    await drain([p.mainFileId!]);
    await sql`insert into stamp_jobs (user_id, file_id, reason) values (${user.id}, ${p.mainFileId}, 'owner')`;
    await sql.begin((tx) => revokeProduct(tx, { userId: user.id, productId: p.id, revokedBy: admin.id, reason: "سحب" }));
    expect(await jobsOf([p.mainFileId!])).toEqual([]);
    expect(await readyCopies(p.mainFileId!)).toEqual([]);
  });
});

describe("F23: the owner's button", () => {
  it("is for the owner only", async () => {
    const p = await createProduct();
    await buyer(p);
    await sql`delete from stamp_jobs where file_id = ${p.mainFileId}`;
    const teacher = await createUser({ role: "teacher" });
    session.user = teacher;
    expect(await prepareCopiesAction(null, form({ productId: p.id }))).toMatchObject({ error: expect.any(String) });
    session.user = null;
    expect(await prepareCopiesAction(null, form({ productId: p.id }))).toMatchObject({ error: expect.any(String) });
    expect(await jobsOf([p.mainFileId!])).toEqual([]);
  });

  it("queues the buyers without a ready copy, records who pressed it, prepares after the response, and pressing again adds nothing", async () => {
    const p = await createProduct();
    const buyers = [await buyer(p), await buyer(p)];
    await sql`delete from stamp_jobs where file_id = ${p.mainFileId}`;
    asOwner();
    afterQueue.length = 0;
    const first = await prepareCopiesAction(null, form({ productId: p.id }));
    expect(first).toMatchObject({ ok: true, message: expect.stringContaining("٢") });
    const again = await prepareCopiesAction(null, form({ productId: p.id }));
    expect(again).toMatchObject({ ok: true });
    expect(await jobsOf([p.mainFileId!])).toHaveLength(2);
    expect(await stampPrepProgress(p.id)).toMatchObject({ buyers: 2, wanted: 2, ready: 0, queued: 2, failed: 0 });
    const audits = await sql<{ actor_id: string; metadata: { files: number; queued: number }; ip: string | null }[]>`
      select actor_id, metadata, ip from audit_logs where action = 'product.prepare_copies' and entity_id = ${p.id} order by created_at
    `;
    expect(audits.map((a) => [a.actor_id, a.metadata])).toEqual([
      [admin.id, { files: 1, queued: 2 }],
      [admin.id, { files: 1, queued: 2 }],
    ]);
    expect(audits[0].ip).toBeTruthy();
    expect(afterQueue).toHaveLength(1);
    await flushAfter();
    expect((await readyCopies(p.mainFileId!)).map((c) => c.user_id).sort()).toEqual(buyers.map((b) => b.user.id).sort());
    expect(await prepareCopiesAction(null, form({ productId: p.id }))).toMatchObject({ ok: true, message: "كل نسخ المشترين الحاليين جاهزة" });
    expect(await stampPrepProgress(p.id)).toMatchObject({ buyers: 2, wanted: 2, ready: 2, queued: 0 });
  });

  it("counts as ready only the copy an open would serve now: an older stamp format or address is queued again (V4)", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    await drain([p.mainFileId!]);
    expect(await stampPrepProgress(p.id)).toMatchObject({ wanted: 1, ready: 1 });

    // نسخة بشكل ختم أقدم: الملف ونسخته والحساب كما هي، والمفتاح غيره
    await sql`update stamped_copies set cache_key = md5(cache_key) || md5(md5(cache_key)) where user_id = ${user.id} and state = 'ready'`;
    expect(await stampPrepProgress(p.id)).toMatchObject({ wanted: 1, ready: 0 });
    expect(await enqueueBuyerCopies([p.mainFileId!], "owner")).toBe(1);
    expect(await drain([p.mainFileId!])).toMatchObject({ prepared: 1 });
    expect(await stampPrepProgress(p.id)).toMatchObject({ ready: 1, queued: 0 });
    expect(await enqueueBuyerCopies([p.mainFileId!], "owner")).toBe(0);

    // بريد تغيّر بعد التجهيز: الفتح يختم بالبريد الجديد
    await sql`update users set email = ${`moved-${randomUUID().slice(0, 8)}@example.com`} where id = ${user.id}`;
    expect(await stampPrepProgress(p.id)).toMatchObject({ ready: 0 });
    expect(await enqueueBuyerCopies([p.mainFileId!], "owner")).toBe(1);
  });

  it("is refused while the stamp is off, and for a product with no PDF", async () => {
    const p = await createProduct();
    const empty = await createProduct({ withFile: false, withPreview: false, status: "draft" });
    asOwner();
    expect(await prepareCopiesAction(null, form({ productId: empty.id }))).toMatchObject({ error: expect.stringContaining("لا توجد ملفات") });
    await sql`insert into settings (key, value) values ('watermark_enabled', 'false'::jsonb)`;
    expect(await prepareCopiesAction(null, form({ productId: p.id }))).toMatchObject({ error: expect.stringContaining("العلامة المائية معطلة") });
    expect(await prepareCopiesAction(null, form({ productId: "not-a-uuid" }))).toMatchObject({ error: expect.any(String) });
  });
});

describe("F23: the daily job", () => {
  it("drains what is due, with the cron secret only", async () => {
    const p = await createProduct();
    await buyer(p);
    process.env.CRON_SECRET = "cron-secret-0123456789abcdef";
    resetEnvCache();
    try {
      expect((await prepareCopiesCron(new Request("http://localhost/api/cron/prepare-copies"))).status).toBe(401);
      expect(await jobsOf([p.mainFileId!])).toHaveLength(1);
      const res = await prepareCopiesCron(new Request("http://localhost/api/cron/prepare-copies", { headers: { authorization: "Bearer cron-secret-0123456789abcdef" } }));
      expect(res.status).toBe(200);
      expect(await jobsOf([p.mainFileId!])).toEqual([]);
      expect(await readyCopies(p.mainFileId!)).toHaveLength(1);
    } finally {
      delete process.env.CRON_SECRET;
      resetEnvCache();
    }
  });
});
