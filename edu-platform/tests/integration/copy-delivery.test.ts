import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as pdf from "@/server/access/pdf";
import { clearPreviewMemoryForTests, doomFileCopies, FILE_OPEN_LIMITS, sweepDoomedCopies } from "@/server/access/delivery";
import { configureStampGateForTests, StampBusyError, stampGateState } from "@/server/access/stamp-gate";
import { configureStampMemoryForTests, reserveStampMemory, stampMemoryState } from "@/server/access/stamp-memory";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { createOrder, type OrderRow } from "@/server/commerce/orders";
import { placeOrderHold } from "@/server/payments/holds";
import { storage } from "@/server/storage";
import { createLocalCopyToken } from "@/server/storage/local";
import { READER_DELIVERY_HEADER } from "@/lib/reader-error";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createBundle, createProduct, createTeacher, createUser, type TestProduct } from "../helpers/factories";
import { applyAcceptedRefund, confirmPaid } from "../helpers/payment-flow";
import { TEST_STORAGE_DIR } from "../test-env";

/**
 * تسليم النسخة المختومة برابط تخزين قصير العمر (القرار F22) وما يحيط به في التسليم:
 * الذاكرة (R007 و R016)، و«مشغول» لا يأكل حد الفتح (R010 و R017)، وسباقا الحفظ (R011).
 */
const session = vi.hoisted(() => ({ user: null as null | { id: string; email: string; role: string } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/auth/session", async (original) => ({
  ...(await original<typeof import("@/server/auth/session")>()),
  getCurrentUser: async () => session.user,
}));
vi.mock("@/server/http", async (original) => ({ ...(await original<typeof import("@/server/http")>()), clientIp: async () => "192.0.2.74", userAgent: async () => "t" }));

const { GET } = await import("@/app/api/files/[fileId]/route");
const { GET: COPY } = await import("@/app/api/files/stamped/route");

type TextItem = { str: string };
type Loaded = { getPage(n: number): Promise<{ getTextContent(): Promise<{ items: TextItem[] }> }> };
let pdfjs: { getDocument(o: object): { promise: Promise<Loaded> } };
let admin: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
  await resetDb();
  // @ts-expect-error العامل بلا تعريفات أنواع
  (globalThis as Record<string, unknown>).pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as typeof pdfjs;
  admin = await createUser({ role: "admin" });
});
afterAll(closeDb);
beforeEach(() => clearPreviewMemoryForTests());
afterEach(async () => {
  session.user = null;
  configureStampGateForTests(null);
  configureStampMemoryForTests(null);
  vi.restoreAllMocks();
  await sql`delete from settings where key = 'watermark_enabled'`;
});

const stampedText = async (bytes: Uint8Array) => {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  return (await page.getTextContent()).items.map((i) => i.str).join(" ");
};
const bytesOf = async (res: Response) => new Uint8Array(await res.arrayBuffer());
const privatePath = (key: string) => resolve(TEST_STORAGE_DIR, "private", key);

type Who = { id: string; email: string; role: string } | null;
const LINK = { [READER_DELIVERY_HEADER]: "url" };

function open(fileId: string, as: Who, headers: Record<string, string> = {}, query = "") {
  session.user = as;
  return GET(new NextRequest(`http://localhost/api/files/${fileId}${query}`, { headers: { "x-reader": "1", "x-forwarded-for": "198.51.100.9", ...headers } }), { params: Promise.resolve({ fileId }) });
}
/** يتبع الرابط كما يتبعه المتصفح: بلا جلسة ولا كوكي */
function follow(link: string) {
  session.user = null;
  return COPY(new Request(new URL(link, "http://localhost").toString()));
}

async function buyer(product: TestProduct): Promise<{ user: Awaited<ReturnType<typeof createUser>>; order: OrderRow }> {
  const user = await createUser();
  const order = await createOrder({ user, productIds: [product.id], isTest: true, consent: { guardianDeclared: true, termsAccepted: true, meta: { ip: null, userAgent: null } } });
  await confirmPaid(order);
  return { user, order };
}

const copiesOf = (fileId: string) => sql<{ id: string; object_key: string; state: string; holder: string | null }[]>`select id, object_key, state, holder from stamped_copies where file_id = ${fileId} order by created_at`;
const logsOf = (userId: string, fileId: string) => sql<{ action: string }[]>`select action from access_logs where user_id = ${userId} and file_id = ${fileId}`;

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

describe("F22: the reader gets a one-minute link to the buyer's own copy", () => {
  it("answers JSON with the link after access is checked and logged, and the bytes never pass the function", async () => {
    const p = await createProduct();
    const { user, order } = await buyer(p);
    const stream = vi.spyOn(storage(), "readStream");
    const sign = vi.spyOn(storage(), "stampedCopyUrl");
    const res = await open(p.mainFileId!, user, LINK);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const answer = (await res.json()) as { url: string; size: number; expiresIn: number };
    expect(answer.expiresIn).toBe(60);
    expect(answer.size).toBeGreaterThan(0);
    expect(answer.url).toMatch(/^\/api\/files\/stamped\?t=/);
    expect(stream).not.toHaveBeenCalled();
    const [copy] = await copiesOf(p.mainFileId!);
    expect(sign).toHaveBeenCalledWith(copy.object_key, 60, null);
    expect(await logsOf(user.id, p.mainFileId!)).toEqual([{ action: "view" }]);

    const got = await follow(answer.url);
    expect(got.status).toBe(200);
    expect(got.headers.get("cache-control")).toContain("no-store");
    const text = await stampedText(await bytesOf(got));
    expect(text).toContain(user.email);
    expect(text).toContain(order.number);
  });

  it("a second open is a fresh link to the same copy: no stamping and no read of the original", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    const first = (await (await open(p.mainFileId!, user, LINK)).json()) as { url: string };
    const stamp = vi.spyOn(pdf, "watermarkPdf");
    const read = vi.spyOn(storage(), "read");
    const second = (await (await open(p.mainFileId!, user, LINK)).json()) as { url: string };
    expect(second.url).not.toBe(first.url);
    expect(stamp).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("a download is a 303 to the link, and the copy arrives as an attachment with the note's name", async () => {
    const p = await createProduct({ title: "مذكرة الرياضيات" });
    await sql`update products set is_downloadable = true where id = ${p.id}`;
    const { user } = await buyer(p);
    const res = await open(p.mainFileId!, user, {}, "?download=1");
    expect(res.status).toBe(303);
    const location = res.headers.get("location")!;
    expect(location).toMatch(/^\/api\/files\/stamped\?t=/);
    const got = await follow(location);
    expect(got.status).toBe(200);
    expect(got.headers.get("content-disposition")).toMatch(/^attachment; filename="file\.pdf"; filename\*=UTF-8''/);
    expect(await stampedText(await bytesOf(got))).toContain(user.email);
    expect(await logsOf(user.id, p.mainFileId!)).toEqual([{ action: "download" }]);
  });

  it("a refunded buyer is refused before any link is signed, though the copy was kept", async () => {
    const p = await createProduct();
    const { user, order } = await buyer(p);
    expect((await open(p.mainFileId!, user, LINK)).status).toBe(200);
    await applyAcceptedRefund(order.id, admin.id, "استرداد");
    const sign = vi.spyOn(storage(), "stampedCopyUrl");
    const res = await open(p.mainFileId!, user, LINK);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: expect.any(String), code: "denied" });
    expect(sign).not.toHaveBeenCalled();
  });

  it("the owner, and every reader while the stamp is off, still get the bytes through the function, never a link", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    const sign = vi.spyOn(storage(), "stampedCopyUrl");
    const asOwner = await open(p.mainFileId!, admin, LINK);
    expect(asOwner.status).toBe(200);
    expect(asOwner.headers.get("content-type")).toBe("application/pdf");
    await sql`insert into settings (key, value) values ('watermark_enabled', 'false'::jsonb)`;
    const unstamped = await open(p.mainFileId!, user, LINK);
    expect(unstamped.status).toBe(200);
    expect(unstamped.headers.get("content-type")).toBe("application/pdf");
    const preview = await open(p.previewFileId!, null, LINK);
    expect(preview.headers.get("content-type")).toBe("application/pdf");
    expect(sign).not.toHaveBeenCalled();
  });

  it("only a stamped copy key is ever handed to the signer, whatever the open", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    const sign = vi.spyOn(storage(), "stampedCopyUrl");
    await open(p.mainFileId!, user, LINK);
    await open(p.mainFileId!, user, LINK);
    await open(p.previewFileId!, user, LINK);
    expect(sign).toHaveBeenCalledTimes(2);
    for (const [key] of sign.mock.calls) expect(key).toMatch(/^stamped\/[0-9a-f-]{36}\.pdf$/);
  });

  it("an old reader without the header, and a retry with via=stream, get the stamped bytes", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    const sign = vi.spyOn(storage(), "stampedCopyUrl");
    for (const res of [await open(p.mainFileId!, user), await open(p.mainFileId!, user, LINK, "?via=stream")]) {
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(await stampedText(await bytesOf(res))).toContain(user.email);
    }
    expect(sign).not.toHaveBeenCalled();
  });

  it("when storage cannot sign a link, the copy is streamed instead and the reader does not notice", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    vi.spyOn(storage(), "stampedCopyUrl").mockResolvedValue(null);
    const res = await open(p.mainFileId!, user, LINK);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(await stampedText(await bytesOf(res))).toContain(user.email);
  });

  it("a forged, altered or expired local link opens nothing", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    const { url } = (await (await open(p.mainFileId!, user, LINK)).json()) as { url: string };
    const token = new URL(url, "http://localhost").searchParams.get("t")!;
    const [copy] = await copiesOf(p.mainFileId!);
    const [mainKey] = await sql<{ storage_key: string }[]>`select storage_key from product_files where id = ${p.mainFileId}`;
    const attempts = [
      `${token.slice(0, -2)}xx`,
      createLocalCopyToken({ k: copy.object_key, e: Date.now() - 1, d: null }),
      createLocalCopyToken({ k: mainKey.storage_key, e: Date.now() + 60_000, d: null }),
      "",
    ];
    for (const t of attempts) {
      const res = await follow(`/api/files/stamped?t=${encodeURIComponent(t)}`);
      expect(res.status, t).toBe(403);
      expect(new TextDecoder().decode(await bytesOf(res))).not.toContain("%PDF");
    }
  });
});

describe("R010 and R017: a busy answer does not cost the student an open", () => {
  const seed = async (key: string, n: number, limit: number) => {
    for (let i = 0; i < n; i++) await hitRateLimit(key, limit, FILE_OPEN_LIMITS.windowSeconds);
  };

  it("repeated busy answers leave the account's opens as they were", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    await seed(`files:${user.id}`, FILE_OPEN_LIMITS.perAccount - 1, FILE_OPEN_LIMITS.perAccount);
    const stamp = vi.spyOn(pdf, "watermarkPdf").mockRejectedValue(new StampBusyError(10));
    for (let i = 0; i < 5; i++) {
      const res = await open(p.mainFileId!, user);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body).toEqual({ error: expect.any(String), code: "busy", retry: true });
    }
    stamp.mockRestore();
    expect((await open(p.mainFileId!, user)).status).toBe(200);
  });

  it("the give-back has its own ceiling, so busy answers are not a door without a limit", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    await seed(`files-retry:${user.id}`, FILE_OPEN_LIMITS.retriesPerAccount, FILE_OPEN_LIMITS.retriesPerAccount);
    await seed(`files:${user.id}`, FILE_OPEN_LIMITS.perAccount - 1, FILE_OPEN_LIMITS.perAccount);
    vi.spyOn(pdf, "watermarkPdf").mockRejectedValue(new StampBusyError(10));
    expect((await open(p.mainFileId!, user)).status).toBe(503);
    const after = await open(p.mainFileId!, user);
    expect(after.status).toBe(429);
    expect(await after.json()).toMatchObject({ code: "too_many_opens", retry: false });
  });

  it("each busy answer waits between the hint and twice the hint, so a crowd does not come back at once", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    vi.spyOn(pdf, "watermarkPdf").mockRejectedValue(new StampBusyError(10));
    const seen = new Set<number>();
    for (let i = 0; i < 12; i++) {
      const s = Number((await open(p.mainFileId!, user)).headers.get("retry-after"));
      expect(s).toBeGreaterThanOrEqual(10);
      expect(s).toBeLessThanOrEqual(20);
      seen.add(s);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("a refusal that is not temporary keeps the plain { error, code } shape and no Retry-After", async () => {
    const p = await createProduct();
    const res = await open(p.mainFileId!, await createUser());
    expect(res.status).toBe(403);
    expect(res.headers.get("retry-after")).toBeNull();
    expect(await res.json()).toEqual({ error: expect.any(String), code: "denied" });
    expect(await (await open(randomUUID(), await createUser())).json()).toEqual({ error: expect.any(String), code: "not_found" });
  });
});

describe("R007 and R016: one instance's memory", () => {
  it("a kept copy is handed over as a key: nothing is held in memory once the answer is sent", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    expect((await open(p.mainFileId!, user, LINK)).status).toBe(200);
    expect(stampMemoryState().used).toBe(0);
  });

  it("when the instance's transfer memory is full the open is busy before the original is read", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    configureStampMemoryForTests({ budgetBytes: 1024 });
    const other = reserveStampMemory(1000);
    const read = vi.spyOn(storage(), "read");
    try {
      const res = await open(p.mainFileId!, user, LINK);
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ code: "busy", retry: true });
      expect(read).not.toHaveBeenCalled();
    } finally {
      other.release();
    }
  });

  it("the stamping slot covers the stamping only: reading the original and storing the copy happen outside it", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    const seen: Record<string, number[]> = { read: [], stamp: [], put: [] };
    const realRead = storage().read;
    const realPut = storage().put;
    const realStamp = pdf.watermarkPdf;
    vi.spyOn(storage(), "read").mockImplementation(async (...args) => {
      seen.read.push(stampGateState().active);
      return realRead(...args);
    });
    vi.spyOn(storage(), "put").mockImplementation(async (...args) => {
      seen.put.push(stampGateState().active);
      return realPut(...args);
    });
    vi.spyOn(pdf, "watermarkPdf").mockImplementation(async (...args) => {
      seen.stamp.push(stampGateState().active);
      return realStamp(...args);
    });
    expect((await open(p.mainFileId!, user, LINK)).status).toBe(200);
    expect(seen).toEqual({ read: [0], stamp: [1], put: [0] });
  });

  it("a copy that could not be kept is streamed from memory and released when the stream ends", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    vi.spyOn(storage(), "put").mockRejectedValue(new Error("storage down"));
    const res = await open(p.mainFileId!, user, LINK);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    await new Promise((r) => setImmediate(r));
    expect(stampMemoryState().used).toBeGreaterThan(0);
    expect(await stampedText(await bytesOf(res))).toContain(user.email);
    await new Promise((r) => setImmediate(r));
    expect(stampMemoryState().used).toBe(0);
    expect((await copiesOf(p.mainFileId!)).every((c) => c.state === "doomed")).toBe(true);
  });
});

describe("R011: a copy finished after its file or address changed is not left behind", () => {
  it("the sweep leaves a row with a live stamping lease, and the object stored after the file was dropped is removed", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    const { spy, release } = holdStamps();
    const pending = open(p.mainFileId!, user, LINK);
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    // حذف الملف أثناء الختم: النسخ تُعلَّم للحذف، وجولة الحذف تجري الآن
    await doomFileCopies([p.mainFileId!]);
    await sweepDoomedCopies(100);
    const during = await copiesOf(p.mainFileId!);
    expect(during).toHaveLength(1);
    expect(during[0]).toMatchObject({ state: "doomed", holder: expect.any(String) });
    release();
    const res = await pending;
    // ما خُتم يصل لمن طلبه هذه المرة (صلاحيته فُحصت قبل الختم)، لكنه لا يُحفظ
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    await bytesOf(res);
    const [after] = await copiesOf(p.mainFileId!);
    expect(after).toMatchObject({ state: "doomed", holder: null });
    expect(existsSync(privatePath(after.object_key))).toBe(false);
    await sweepDoomedCopies(100);
    expect(await copiesOf(p.mainFileId!)).toHaveLength(0);
  });

  it("a copy stamped with an address that changed meanwhile is not marked ready, and its object is removed", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    const { spy, release } = holdStamps();
    const pending = open(p.mainFileId!, user, LINK);
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    // تغيير البريد التزم بين قراءة الهوية وأخذ العقد: لم يجد نسخة يعلّمها، فالفحص عند الحفظ هو ما يمسكها
    await sql`update users set email = ${`moved-${randomUUID().slice(0, 8)}@example.com`} where id = ${user.id}`;
    release();
    const res = await pending;
    expect(res.status).toBe(200);
    await bytesOf(res);
    const copies = await copiesOf(p.mainFileId!);
    expect(copies.filter((c) => c.state === "ready")).toHaveLength(0);
    for (const c of copies) expect(existsSync(privatePath(c.object_key))).toBe(false);
  });
});

describe("V2: a copy is kept only for someone who can still open its file", () => {
  /** يفتح ويوقف الختم، ثم يغيّر ما يُعطى أثناءه، ثم يكمل */
  async function changeWhileStamping(fileId: string, as: Who, change: () => Promise<unknown>) {
    const { spy, release } = holdStamps();
    const pending = open(fileId, as, LINK);
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    await change();
    release();
    return pending;
  }

  it.each([
    // التعليق يسحب الوصول ولا يعرف النسخ؛ والانتهاء لا يمر بشيء. كلاهما مثل استرداد التزم قبل أن يوجد صف العقد
    ["a hold is placed on the order", (order: OrderRow) =>
      sql.begin((tx) => placeOrderHold(tx, { orderId: order.id, paymentId: null, kind: "dispute", sourceKey: `test-${randomUUID()}`, status: "PENDING", amountFils: null }))],
    ["the access runs out", (order: OrderRow) => sql`update entitlements set expires_at = now() - interval '1 second' where order_id = ${order.id}`],
  ] as const)("when %s during the stamp, this open gets its copy, nothing is kept, and the next open is refused", async (_what, change) => {
    const p = await createProduct();
    const { user, order } = await buyer(p);
    const res = await changeWhileStamping(p.mainFileId!, user, () => change(order));
    // الصلاحية فُحصت قبل الختم: ما خُتم يصل لهذا الطلب وحده، ثم لا يبقى
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(await stampedText(await bytesOf(res))).toContain(user.email);
    const copies = await copiesOf(p.mainFileId!);
    expect(copies.filter((c) => c.state === "ready")).toHaveLength(0);
    for (const c of copies) expect(existsSync(privatePath(c.object_key))).toBe(false);
    expect((await open(p.mainFileId!, user, LINK)).status).toBe(403);
  });

  it("a file whose stored version changed during the stamp keeps no copy of the old version", async () => {
    const p = await createProduct();
    const { user } = await buyer(p);
    const res = await changeWhileStamping(p.mainFileId!, user, () => sql`update product_files set storage_key = ${`products/${p.id}/${randomUUID()}.pdf`} where id = ${p.mainFileId}`);
    expect(res.status).toBe(200);
    await bytesOf(res);
    const copies = await copiesOf(p.mainFileId!);
    expect(copies.filter((c) => c.state === "ready")).toHaveLength(0);
    for (const c of copies) expect(existsSync(privatePath(c.object_key))).toBe(false);
  });

  it("the self-managed teacher of the note, and a buyer of a bundle that gained the note later, keep their copies", async () => {
    const p = await createProduct();
    const teacher = await createTeacher({ mode: "self_managed" });
    await sql`update products set teacher_id = ${teacher.id} where id = ${p.id}`;
    expect((await open(p.mainFileId!, teacher.user!, LINK)).status).toBe(200);

    const bundle = await createBundle({ items: [(await createProduct()).id] });
    const { user } = await buyer(bundle);
    await sql`insert into bundle_items (bundle_id, product_id, sort_order) values (${bundle.id}, ${p.id}, 1)`;
    expect((await open(p.mainFileId!, user, LINK)).status).toBe(200);

    expect((await copiesOf(p.mainFileId!)).map((c) => c.state)).toEqual(["ready", "ready"]);
    const stamp = vi.spyOn(pdf, "watermarkPdf");
    for (const who of [teacher.user!, user]) expect((await open(p.mainFileId!, who, LINK)).status).toBe(200);
    expect(stamp).not.toHaveBeenCalled();
  });
});
