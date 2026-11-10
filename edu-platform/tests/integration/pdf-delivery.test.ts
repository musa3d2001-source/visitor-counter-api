import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import * as pdf from "@/server/access/pdf";
import { clearPreviewMemoryForTests, FILE_OPEN_LIMITS, identityLines, stampCacheKey, STAMP_FORMAT_VERSION } from "@/server/access/delivery";
import { configureStampGateForTests, stampGateState } from "@/server/access/stamp-gate";
import { hitRateLimit } from "@/server/auth/rate-limit";
import type { Actor } from "@/server/auth/permissions";
import { correctStudentEmail } from "@/server/admin/student-accounts";
import { anonymizeStudent } from "@/server/admin/student-anonymize";
import { deleteProductFile } from "@/server/admin/products";
import { initUpload, UPLOAD_TICKET_LIMIT, UploadRateLimitError } from "@/server/admin/uploads";
import { createOrder, type OrderRow } from "@/server/commerce/orders";
import { runDataPruning } from "@/server/platform/maintenance";
import { storage } from "@/server/storage";
import { STAMP_MAX_BYTES, STAMP_MAX_PAGES } from "@/lib/pdf-limits";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createProduct, createUser, makePdf, type TestProduct } from "../helpers/factories";
import { provenOwner } from "../helpers/step-up";
import { applyAcceptedRefund, confirmPaid } from "../helpers/payment-flow";
import { completeTicketed, issueTicket } from "../helpers/upload-ticket";
import { TEST_STORAGE_DIR } from "../test-env";

const session = vi.hoisted(() => ({ user: null as null | { id: string; email: string; role: string }, sessionId: "" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/auth/session", async (original) => ({
  ...(await original<typeof import("@/server/auth/session")>()),
  getCurrentUser: async () => session.user,
  getCurrentSession: async () => (session.user ? { user: session.user, sessionId: session.sessionId, mustChangePassword: false, needsTwoFactorEnrolment: false } : null),
}));
vi.mock("@/server/http", async (original) => ({ ...(await original<typeof import("@/server/http")>()), clientIp: async () => "192.0.2.73", userAgent: async () => "t" }));

const { GET } = await import("@/app/api/files/[fileId]/route");
const { saveSettingsAction } = await import("@/app/admin/settings/actions");

type TextItem = { str: string };
type Loaded = { getPage(n: number): Promise<{ getTextContent(): Promise<{ items: TextItem[] }> }> };
let pdfjs: { getDocument(o: object): { promise: Promise<Loaded> } };

let admin: Awaited<ReturnType<typeof createUser>>;
let owner: Actor;

beforeAll(async () => {
  await resetDb();
  // @ts-expect-error العامل بلا تعريفات أنواع
  (globalThis as Record<string, unknown>).pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as typeof pdfjs;
  admin = await createUser({ role: "admin" });
  session.sessionId = (await provenOwner(admin)).sessionId;
  owner = { kind: "owner", userId: admin.id, name: admin.fullName, email: admin.email, teacherId: null, canUpload: true };
});
afterAll(async () => {
  await closeDb();
});
beforeEach(() => clearPreviewMemoryForTests());
afterEach(() => {
  session.user = null;
  configureStampGateForTests(null);
  vi.restoreAllMocks();
});

const stampedText = async (bytes: Uint8Array) => {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  return (await page.getTextContent()).items.map((i) => i.str).join(" ");
};

const privatePath = (key: string) => resolve(TEST_STORAGE_DIR, "private", key);
const bytesOf = async (res: Response) => new Uint8Array(await res.arrayBuffer());

const open = (fileId: string, as: { id: string; email: string; role: string } | null, headers: Record<string, string> = {}) => {
  session.user = as;
  return GET(new NextRequest(`http://localhost/api/files/${fileId}`, { headers: { "x-reader": "1", "x-forwarded-for": "198.51.100.7", ...headers } }), { params: Promise.resolve({ fileId }) });
};

async function buyer(product: TestProduct): Promise<{ user: Awaited<ReturnType<typeof createUser>>; order: OrderRow }> {
  const user = await createUser({ phone: "+96599887766" });
  const order = await createOrder({ user, productIds: [product.id], isTest: true, consent: { guardianDeclared: true, termsAccepted: true, meta: { ip: null, userAgent: null } } });
  await confirmPaid(order);
  return { user, order };
}

const copiesOf = (fileId: string) => sql<{ id: string; user_id: string; object_key: string; state: string; cache_key: string; size_bytes: string | null }[]>`select id, user_id, object_key, state, cache_key, size_bytes::text from stamped_copies where file_id = ${fileId}`;
const statusOf = async (fileId: string) => (await sql<{ check_status: string }[]>`select check_status from product_files where id = ${fileId}`)[0].check_status;
const stampSpy = () => vi.spyOn(pdf, "watermarkPdf");

/** الختم ينتظر حتى يُفتح: يثبت ما يحدث والختمات جارية */
function holdStamps() {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const real = pdf.watermarkPdf;
  const spy = vi.spyOn(pdf, "watermarkPdf").mockImplementation(async (bytes, lines, ms) => {
    await gate;
    return real(bytes, lines, ms);
  });
  return { spy, release };
}

describe("الصلاحية قبل النسخة المحفوظة", () => {
  it("a refunded buyer gets nothing, though their stamped copy is still in storage", async () => {
    const p = await createProduct();
    const { user, order } = await buyer(p);
    expect((await open(p.mainFileId!, user)).status).toBe(200);
    const [copy] = await copiesOf(p.mainFileId!);
    expect(copy.state).toBe("ready");
    expect(existsSync(privatePath(copy.object_key))).toBe(true);

    await applyAcceptedRefund(order.id, admin.id, "استرداد");
    const stream = vi.spyOn(storage(), "readStream");
    const read = vi.spyOn(storage(), "read");
    const res = await open(p.mainFileId!, user);
    expect(res.status).toBe(403);
    expect(new TextDecoder().decode(await bytesOf(res))).not.toContain("%PDF");
    expect(stream).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    // النسخة ما زالت موجودة: ما منع التسليم هو الفحص
    expect(existsSync(privatePath(copy.object_key))).toBe(true);
  });

  it("a stranger cannot reach a buyer's copy", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    await open(p.mainFileId!, user);
    expect((await open(p.mainFileId!, await createUser())).status).toBe(403);
    expect((await open(p.mainFileId!, null)).status).toBe(401);
  });
});

describe("نسخة لكل مشترٍ", () => {
  it("two buyers never get each other's copy: each stamp is read back from the bytes", async () => {
    const p = await createProduct();
    const a = await buyer(p);
    const b = await buyer(p);
    for (let round = 0; round < 2; round++) {
      const [ra, rb] = [await open(p.mainFileId!, a.user), await open(p.mainFileId!, b.user)];
      expect([ra.status, rb.status]).toEqual([200, 200]);
      const [ta, tb] = [await stampedText(await bytesOf(ra)), await stampedText(await bytesOf(rb))];
      expect(ta).toContain(a.user.email);
      expect(ta).toContain(a.order.number);
      expect(ta).not.toContain(b.user.email);
      expect(ta).not.toContain(b.order.number);
      expect(tb).toContain(b.user.email);
      expect(tb).toContain(b.order.number);
      expect(tb).not.toContain(a.user.email);
    }
    const copies = await copiesOf(p.mainFileId!);
    expect(copies).toHaveLength(2);
    expect(new Set(copies.map((c) => c.object_key)).size).toBe(2);
  });

  it("a repeat open streams the stored copy: no second stamp and no file in memory", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    const stamp = stampSpy();
    const first = await bytesOf(await open(p.mainFileId!, user));
    expect(stamp).toHaveBeenCalledTimes(1);
    const read = vi.spyOn(storage(), "read");
    const stream = vi.spyOn(storage(), "readStream");
    const again = await open(p.mainFileId!, user);
    expect(again.headers.get("cache-control")).toContain("no-store");
    expect(Buffer.from(await bytesOf(again)).equals(Buffer.from(first))).toBe(true);
    expect(stamp).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it("the stored copy lives in the private bucket under a key that says nothing about its owner", async () => {
    const p = await createProduct();
    const { user, order } = await buyer(p);
    await open(p.mainFileId!, user);
    const [copy] = await copiesOf(p.mainFileId!);
    expect(copy.object_key).toMatch(/^stamped\/[0-9a-f-]{36}\.pdf$/);
    expect(copy.object_key).not.toContain(user.id);
    expect(copy.object_key).not.toContain(order.number);
    expect(existsSync(privatePath(copy.object_key))).toBe(true);
    expect(existsSync(resolve(TEST_STORAGE_DIR, "public", copy.object_key))).toBe(false);
  });

  it("a copy lost from storage is stamped again, and the buyer does not notice", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    await open(p.mainFileId!, user);
    const [copy] = await copiesOf(p.mainFileId!);
    await storage().remove("private", copy.object_key);
    const res = await open(p.mainFileId!, user);
    expect(res.status).toBe(200);
    expect(await stampedText(await bytesOf(res))).toContain(user.email);
  });

  it("when the cache budget is spent the file is still stamped and delivered, only not kept", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    const filler = randomUUID();
    await sql`insert into stamped_copies (cache_key, user_id, file_id, file_version, object_key, size_bytes, state) values (${"f".repeat(64)}, ${user.id}, ${p.previewFileId}, 'x', ${`stamped/${filler}.pdf`}, ${200 * 1024 * 1024}, 'ready')`;
    const res = await open(p.mainFileId!, user);
    expect(res.status).toBe(200);
    expect(await stampedText(await bytesOf(res))).toContain(user.email);
    expect((await copiesOf(p.mainFileId!)).filter((c) => c.state === "ready")).toHaveLength(0);
    await sql`delete from stamped_copies where object_key = ${`stamped/${filler}.pdf`}`;
  });
});

describe("مفتاح النسخة", () => {
  const base = { fileId: "f", fileVersion: "v", userId: "u", orderNumber: "O-1", lines: { primary: "a", secondary: "b" } };

  it.each([
    ["the file", { fileId: "f2" }],
    ["the file version", { fileVersion: "v2" }],
    ["the account", { userId: "u2" }],
    ["the order", { orderNumber: "O-2" }],
    ["the stamp text", { lines: { primary: "a2", secondary: "b" } }],
    ["the stamp layout", { format: STAMP_FORMAT_VERSION + 1 }],
  ])("changes with %s", (_label, change) => {
    expect(stampCacheKey({ ...base, ...change })).not.toBe(stampCacheKey(base));
  });

  it("is stable for the same input, whatever day it is", () => {
    const user = { id: "11111111-2222-3333-4444-555555555555", email: "s@example.com" };
    const order = { number: "O-9", paidAt: "2026-11-01T10:00:00Z" };
    vi.useFakeTimers({ now: new Date("2026-11-02") });
    const first = identityLines(user, order).lines.secondary;
    vi.setSystemTime(new Date("2026-12-25"));
    expect(identityLines(user, order).lines.secondary).toBe(first);
    vi.useRealTimers();
  });

  it("replacing the file stamps a new copy of the new content", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    await open(p.mainFileId!, user);
    const newKey = `products/${p.id}/${randomUUID()}.pdf`;
    await storage().put("private", newKey, await makePdf(2, "Replacement body"), "application/pdf");
    await sql`update product_files set storage_key = ${newKey} where id = ${p.mainFileId}`;
    const stamp = stampSpy();
    const res = await open(p.mainFileId!, user);
    expect(stamp).toHaveBeenCalledTimes(1);
    const text = await stampedText(await bytesOf(res));
    expect(text).toContain("Replacement body");
    expect(text).toContain(user.email);
  });

  it("an email change retires the copies stamped with the old address", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    await open(p.mainFileId!, user);
    const newEmail = `new-${randomUUID().slice(0, 8)}@example.com`;
    await correctStudentEmail({ studentId: user.id, newEmail, adminId: admin.id, reason: "خطأ إملائي" });
    expect((await copiesOf(p.mainFileId!)).map((c) => c.state)).toEqual(["doomed"]);
    const res = await open(p.mainFileId!, { ...user, email: newEmail });
    const text = await stampedText(await bytesOf(res));
    expect(text).toContain(newEmail);
    expect(text).not.toContain(user.email);
  });
});

describe("الختم تحت الضغط", () => {
  it("20 parallel requests from one account cost one stamping, and none is left unanswered", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    const stamp = stampSpy();
    const all = await Promise.all(Array.from({ length: 20 }, () => open(p.mainFileId!, user)));
    expect(stamp).toHaveBeenCalledTimes(1);
    const ok = all.filter((r) => r.status === 200);
    expect(ok.length).toBeGreaterThan(0);
    for (const r of ok) expect(await stampedText(await bytesOf(r))).toContain(user.email);
    for (const r of all.filter((x) => x.status !== 200)) {
      expect(r.status).toBe(429);
      expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(await r.json()).toMatchObject({ retry: true });
    }
    expect((await copiesOf(p.mainFileId!)).filter((c) => c.state === "ready")).toHaveLength(1);
  });

  it("a few duplicates at once all share the one stamping and all get the file", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    const stamp = stampSpy();
    const all = await Promise.all(Array.from({ length: 8 }, () => open(p.mainFileId!, user)));
    expect(all.map((r) => r.status)).toEqual(Array(8).fill(200));
    expect(stamp).toHaveBeenCalledTimes(1);
  });

  it("a third buyer waits for a slot; when the queue is full the next is told to come back", async () => {
    configureStampGateForTests({ queue: 1, retryAfterSeconds: 9 });
    const p = await createProduct();
    const [a, b, c, d] = await Promise.all([buyer(p), buyer(p), buyer(p), buyer(p)]);
    const { spy, release } = holdStamps();
    // واحدًا بعد الآخر: محاكاة الجلسة متغير واحد يقرؤه الطلب بعد أول await
    const first = open(p.mainFileId!, a.user);
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    const second = open(p.mainFileId!, b.user);
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    const running = [first, second];
    const queued = open(p.mainFileId!, c.user);
    await vi.waitFor(() => expect(stampGateState().waiting).toBe(1));
    expect(spy).toHaveBeenCalledTimes(2);

    const overflow = await open(p.mainFileId!, d.user);
    expect(overflow.status).toBe(503);
    expect(overflow.headers.get("retry-after")).toBe("9");
    expect(await overflow.json()).toMatchObject({ retry: true });

    release();
    const done = await Promise.all([...running, queued]);
    expect(done.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await stampedText(await bytesOf(done[2]))).toContain(c.user.email);
    expect(stampGateState()).toMatchObject({ active: 0, waiting: 0 });
  });

  it("a stamping in progress on another server answers 429 with Retry-After, and starts no second one", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    await open(p.mainFileId!, user);
    await sql`update stamped_copies set state = 'stamping', holder = ${randomUUID()}, lease_until = now() + interval '60 seconds' where file_id = ${p.mainFileId}`;
    const stamp = stampSpy();
    const res = await open(p.mainFileId!, user);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(stamp).not.toHaveBeenCalled();
  });

  it("a lease left by a dead server expires, and the next open stamps", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    await open(p.mainFileId!, user);
    await sql`update stamped_copies set state = 'stamping', holder = ${randomUUID()}, lease_until = now() - interval '1 second' where file_id = ${p.mainFileId}`;
    const stamp = stampSpy();
    expect((await open(p.mainFileId!, user)).status).toBe(200);
    expect(stamp).toHaveBeenCalledTimes(1);
    expect((await copiesOf(p.mainFileId!)).map((c) => c.state).sort()).toEqual(["doomed", "ready"]);
  });

  it("a stamp that ran out of time on a good file is a busy answer, and the file is not blamed", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    vi.spyOn(pdf, "watermarkPdf").mockRejectedValue(new pdf.StampDeadlineError());
    const res = await open(p.mainFileId!, user);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).not.toBeNull();
    expect(await statusOf(p.mainFileId!)).toBe("ok");
    expect((await copiesOf(p.mainFileId!)).every((c) => c.state === "doomed")).toBe(true);
  });
});

describe("حد الختم عند الرفع والتسليم", () => {
  const draft = () => createProduct({ status: "draft", withFile: false, withPreview: false });

  async function blank(pages: number) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage([100, 100]);
    return doc.save();
  }

  it("a file over the size cap is refused at the start of the upload, with the reason in Arabic", async () => {
    const p = await draft();
    await expect(initUpload({ target: "main", productId: p.id, fileName: "a.pdf", size: STAMP_MAX_BYTES + 1, mime: "application/pdf" }, owner)).rejects.toThrow(/قسّم الملف/);
  });

  it("a file that grew past the cap after the ticket is refused at completion and removed", async () => {
    const p = await draft();
    const big = new Uint8Array(STAMP_MAX_BYTES + 10);
    big.set(await makePdf(2));
    const key = `products/${p.id}/2026/11/${randomUUID()}.pdf`;
    await storage().put("private", key, big, "application/pdf");
    await expect(completeTicketed({ target: "main", key, productId: p.id }, owner)).rejects.toThrow(/قسّم الملف/);
    expect(existsSync(privatePath(key))).toBe(false);
  });

  it("a file over the page cap is refused at completion and removed", async () => {
    const p = await draft();
    const key = `products/${p.id}/2026/11/${randomUUID()}.pdf`;
    await storage().put("private", key, await blank(STAMP_MAX_PAGES + 1), "application/pdf");
    await expect(completeTicketed({ target: "main", key, productId: p.id }, owner)).rejects.toThrow(/قسّم الملف/);
    expect(existsSync(privatePath(key))).toBe(false);
    expect(await sql`select 1 from product_files where product_id = ${p.id}`).toHaveLength(0);
  });

  it("an old file over the size cap is never read or served unstamped, and is flagged for the owner", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    await sql`update product_files set size_bytes = ${STAMP_MAX_BYTES + 1} where id = ${p.mainFileId}`;
    const read = vi.spyOn(storage(), "read");
    const stream = vi.spyOn(storage(), "readStream");
    const res = await open(p.mainFileId!, user);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBeNull();
    expect(new TextDecoder().decode(await bytesOf(res))).not.toContain("%PDF");
    expect(read).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
    expect(await statusOf(p.mainFileId!)).toBe("too_complex");
  });

  it("an old file whose page count is only found by opening it is refused too", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    const key = `products/${p.id}/${randomUUID()}.pdf`;
    await storage().put("private", key, await blank(STAMP_MAX_PAGES + 1), "application/pdf");
    await sql`update product_files set storage_key = ${key}, page_count = null, check_status = 'unchecked' where id = ${p.mainFileId}`;
    const res = await open(p.mainFileId!, user);
    expect(res.status).toBe(503);
    expect(new TextDecoder().decode(await bytesOf(res))).not.toContain("%PDF");
    expect(await statusOf(p.mainFileId!)).toBe("too_complex");
    expect((await copiesOf(p.mainFileId!)).filter((c) => c.state === "ready")).toHaveLength(0);
  });

  it("a stored object bigger than its record says is caught before it is stamped", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    vi.spyOn(storage(), "read").mockResolvedValue(new Uint8Array(STAMP_MAX_BYTES + 1));
    const stamp = stampSpy();
    const res = await open(p.mainFileId!, user);
    expect(res.status).toBe(503);
    expect(stamp).not.toHaveBeenCalled();
  });
});

describe("حدود الفتح", () => {
  const seed = async (key: string, n: number, limit: number, windowSeconds: number) => {
    for (let i = 0; i < n; i++) await hitRateLimit(key, limit, windowSeconds);
  };

  it("an account past its limit waits, and is not told to keep retrying", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    await seed(`files:${user.id}`, FILE_OPEN_LIMITS.perAccount, FILE_OPEN_LIMITS.perAccount, FILE_OPEN_LIMITS.windowSeconds);
    const res = await open(p.mainFileId!, user);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await res.json()).toMatchObject({ retry: false });
  });

  it("the limit leaves room for an honest reader on two devices", () => {
    // فتحان لكل ملف على جهازين، خمس مذكرات في عشر دقائق، وأقصى إعادة تلقائية لكل فتح نادرًا ما تتجمع
    expect(FILE_OPEN_LIMITS.perAccount).toBeGreaterThanOrEqual(2 * 2 * 5);
  });

  it("a classroom behind one address is not locked out by one student's limit", async () => {
    const p = await createProduct();
    const [a, b] = [await buyer(p), await buyer(p)];
    await seed(`files:${a.user.id}`, FILE_OPEN_LIMITS.perAccount, FILE_OPEN_LIMITS.perAccount, FILE_OPEN_LIMITS.windowSeconds);
    const same = { "x-forwarded-for": "203.0.113.50" };
    expect((await open(p.mainFileId!, a.user, same)).status).toBe(429);
    expect((await open(p.mainFileId!, b.user, same)).status).toBe(200);
  });

  it("anonymous previews are limited per address only", async () => {
    const p = await createProduct();
    const ip = "203.0.113.77";
    await seed(`files-ip:${ip}`, FILE_OPEN_LIMITS.perAnonymousIp, FILE_OPEN_LIMITS.perAnonymousIp, FILE_OPEN_LIMITS.windowSeconds);
    expect((await open(p.previewFileId!, null, { "x-forwarded-for": ip })).status).toBe(429);
    expect((await open(p.previewFileId!, null, { "x-forwarded-for": "203.0.113.78" })).status).toBe(200);
  });
});

describe("المعاينة المجانية", () => {
  it("is read once from storage and the browser may keep it privately", async () => {
    const p = await createProduct();
    const read = vi.spyOn(storage(), "read");
    const responses = await Promise.all([open(p.previewFileId!, null), open(p.previewFileId!, null)]);
    responses.push(await open(p.previewFileId!, null));
    for (const r of responses) {
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("private, max-age=3600");
      expect(r.headers.get("etag")).toMatch(/^"p-/);
    }
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("a browser holding it gets 304 with no body and no storage read", async () => {
    const p = await createProduct();
    const etag = (await open(p.previewFileId!, null)).headers.get("etag")!;
    const read = vi.spyOn(storage(), "read");
    const res = await open(p.previewFileId!, null, { "if-none-match": etag });
    expect(res.status).toBe(304);
    expect((await bytesOf(res)).length).toBe(0);
    expect(read).not.toHaveBeenCalled();
  });

  it("carries nothing personal: no stamped copy is made for it", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    const stamp = stampSpy();
    expect((await open(p.previewFileId!, user)).status).toBe(200);
    expect(stamp).not.toHaveBeenCalled();
    expect(await copiesOf(p.previewFileId!)).toHaveLength(0);
  });
});

describe("النسخ بيانات شخصية: تُحذف", () => {
  async function withCopy() {
    const p = await createProduct();
    const b = await buyer(p);
    await open(p.mainFileId!, b.user);
    const [copy] = await copiesOf(p.mainFileId!);
    return { p, ...b, copy };
  }

  it("deleting a student's data removes their copies from the table and from storage", async () => {
    const { p, user, copy } = await withCopy();
    await anonymizeStudent({ studentId: user.id, adminId: admin.id, confirmEmail: user.email, reason: "طلب ولي الأمر" });
    expect(await copiesOf(p.mainFileId!)).toHaveLength(0);
    expect(existsSync(privatePath(copy.object_key))).toBe(false);
  });

  it("deleting a file removes every buyer's copy of it", async () => {
    const { p, copy } = await withCopy();
    await deleteProductFile(p.id, p.mainFileId!, owner).catch(async () => {
      // المنتج المنشور لا يفقد آخر ملف: يُخفى أولًا
      await sql`update products set status = 'hidden' where id = ${p.id}`;
      await deleteProductFile(p.id, p.mainFileId!, owner);
    });
    expect(await copiesOf(p.mainFileId!)).toHaveLength(0);
    expect(existsSync(privatePath(copy.object_key))).toBe(false);
  });

  it.each([
    ["unopened past the idle period", (id: string) => sql`update stamped_copies set last_used_at = now() - interval '15 days' where id = ${id}`],
    ["of a replaced file", (id: string) => sql`update stamped_copies set file_version = 'an-older-key' where id = ${id}`],
  ])("the daily job removes a copy %s", async (_label, age) => {
    const { p, copy } = await withCopy();
    await age(copy.id);
    const report = await runDataPruning();
    expect(report.stampedCopies).toBeGreaterThanOrEqual(1);
    expect(await copiesOf(p.mainFileId!)).toHaveLength(0);
    expect(existsSync(privatePath(copy.object_key))).toBe(false);
  });

  it("the daily job leaves a copy in use alone", async () => {
    const { p, copy } = await withCopy();
    await runDataPruning();
    expect(await copiesOf(p.mainFileId!)).toHaveLength(1);
    expect(existsSync(privatePath(copy.object_key))).toBe(true);
  });

  it("a storage failure keeps the row, so the next run can finish the deletion", async () => {
    const { p, user, copy } = await withCopy();
    vi.spyOn(storage(), "removeMany").mockRejectedValueOnce(new Error("storage down"));
    await anonymizeStudent({ studentId: user.id, adminId: admin.id, confirmEmail: user.email, reason: "طلب ولي الأمر" });
    expect((await copiesOf(p.mainFileId!)).map((c) => c.state)).toEqual(["doomed"]);
    await runDataPruning();
    expect(await copiesOf(p.mainFileId!)).toHaveLength(0);
    expect(existsSync(privatePath(copy.object_key))).toBe(false);
  });
});

describe("تذاكر الرفع", () => {
  const draft = () => createProduct({ status: "draft", withFile: false, withPreview: false });
  const stored = async (p: { id: string }) => {
    const key = `products/${p.id}/2026/11/${randomUUID()}.pdf`;
    const bytes = await makePdf(20);
    await storage().put("private", key, bytes, "application/pdf");
    return { key, bytes };
  };
  const ticket = (key: string) => sql<{ completed_at: Date | null; declared_size: string }[]>`select completed_at, declared_size::text from upload_tickets where storage_key = ${key}`;

  it("issuing upload links is limited per account", async () => {
    const p = await draft();
    const staff = await createUser({ role: "admin" });
    const actor: Actor = { ...owner, userId: staff.id };
    for (let i = 0; i < UPLOAD_TICKET_LIMIT.perHour; i++) await hitRateLimit(`upload-init:${staff.id}`, UPLOAD_TICKET_LIMIT.perHour, UPLOAD_TICKET_LIMIT.windowSeconds);
    await expect(initUpload({ target: "main", productId: p.id, fileName: "a.pdf", size: 1000, mime: "application/pdf" }, actor)).rejects.toBeInstanceOf(UploadRateLimitError);
    await expect(initUpload({ target: "main", productId: p.id, fileName: "a.pdf", size: 1000, mime: "application/pdf" }, owner)).resolves.toMatchObject({ key: expect.any(String) });
  });

  it("a link records who asked and the size they declared", async () => {
    const p = await draft();
    const res = await initUpload({ target: "main", productId: p.id, fileName: "a.pdf", size: 4321, mime: "application/pdf" }, owner);
    expect(await ticket(res.key)).toMatchObject([{ completed_at: null, declared_size: "4321" }]);
  });

  it("an object of a size other than declared is refused and removed", async () => {
    const p = await draft();
    const { key, bytes } = await stored(p);
    await issueTicket(key, "main", owner.userId, bytes.length + 7);
    const { completeUpload } = await import("@/server/admin/uploads");
    await expect(completeUpload({ target: "main", key, productId: p.id }, owner)).rejects.toThrow(/بحجم غير الذي أُعلن/);
    expect(existsSync(privatePath(key))).toBe(false);
  });

  it("a key nobody was issued is refused and removed", async () => {
    const p = await draft();
    const { key } = await stored(p);
    const { completeUpload } = await import("@/server/admin/uploads");
    await expect(completeUpload({ target: "main", key, productId: p.id }, owner)).rejects.toThrow(/انتهت صلاحية رابط الرفع/);
    expect(existsSync(privatePath(key))).toBe(false);
  });

  it("someone else's upload cannot be confirmed, and is left alone", async () => {
    const p = await draft();
    const { key } = await stored(p);
    const other = await createUser({ role: "admin" });
    await issueTicket(key, "main", other.id);
    const { completeUpload } = await import("@/server/admin/uploads");
    await expect(completeUpload({ target: "main", key, productId: p.id }, owner)).rejects.toThrow(/مرجع الملف غير صالح/);
    expect(existsSync(privatePath(key))).toBe(true);
  });

  it("completion loads the whole file only inside a stamping slot", async () => {
    const p = await draft();
    const { key } = await stored(p);
    const read = vi.spyOn(storage(), "read");
    let activeDuringRead = 0;
    read.mockImplementationOnce(async (...args) => {
      activeDuringRead = stampGateState().active;
      read.mockRestore();
      return storage().read(...args);
    });
    await expect(completeTicketed({ target: "main", key, productId: p.id }, owner)).resolves.toMatchObject({ id: expect.any(String) });
    expect(activeDuringRead).toBe(1);
  });

  it("the daily job removes an object whose upload was never confirmed", async () => {
    const p = await draft();
    const { key } = await stored(p);
    await issueTicket(key, "main", owner.userId);
    await sql`update upload_tickets set created_at = now() - interval '25 hours' where storage_key = ${key}`;
    expect((await runDataPruning()).unconfirmedUploads).toBeGreaterThanOrEqual(1);
    expect(existsSync(privatePath(key))).toBe(false);
    expect(await ticket(key)).toHaveLength(0);
  });

  it("the daily job leaves a recent upload and a confirmed file alone", async () => {
    const p = await draft();
    const { key: recent } = await stored(p);
    await issueTicket(recent, "main", owner.userId);
    const { key: confirmed } = await stored(p);
    await completeTicketed({ target: "main", key: confirmed, productId: p.id }, owner);
    await sql`update upload_tickets set created_at = now() - interval '25 hours' where storage_key = ${confirmed}`;
    await runDataPruning();
    expect(existsSync(privatePath(recent))).toBe(true);
    expect(existsSync(privatePath(confirmed))).toBe(true);
  });
});

describe("إيقاف الختم", () => {
  const form = (entries: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(entries)) fd.set(k, v);
    return fd;
  };
  const base = { site_name: "منصة", tagline: "", hero_title: "عنوان", hero_subtitle: "وصف", primary_color: "#0a6b66", accent_color: "#f0b429", whatsapp_number: "", contact_email: "a@example.com", contact_phone: "", instagram_url: "", academic_year: "2026-2027", faq: "[]", footer_note: "", fee_percent: "0", fee_fixed: "0", seller_legal_name: "", seller_license_number: "", seller_address: "", mail_provider_name: "" };
  const auditsOf = (action: string) => sql<{ actor_id: string; metadata: Record<string, unknown> }[]>`select actor_id, metadata from audit_logs where action = ${action}`;

  it("turning the stamp off is its own audit entry, with the actor and the values", async () => {
    session.user = admin;
    const on = await saveSettingsAction(null, form({ ...base, watermark_enabled: "on" }));
    expect(on).toMatchObject({ ok: true });
    await sql`delete from audit_logs where action like 'settings.watermark_%'`;

    expect(await saveSettingsAction(null, form({ ...base }))).toMatchObject({ ok: true });
    expect(await auditsOf("settings.watermark_off")).toMatchObject([{ actor_id: admin.id, metadata: { from: true, to: false } }]);

    expect(await saveSettingsAction(null, form({ ...base, watermark_enabled: "on" }))).toMatchObject({ ok: true });
    expect(await auditsOf("settings.watermark_on")).toMatchObject([{ actor_id: admin.id, metadata: { from: false, to: true } }]);
  });

  it("saving without changing it adds no such entry", async () => {
    session.user = admin;
    await saveSettingsAction(null, form({ ...base, watermark_enabled: "on" }));
    await sql`delete from audit_logs where action like 'settings.watermark_%'`;
    await saveSettingsAction(null, form({ ...base, watermark_enabled: "on" }));
    expect(await auditsOf("settings.watermark_off")).toHaveLength(0);
    expect(await auditsOf("settings.watermark_on")).toHaveLength(0);
  });
});
