import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as pdf from "@/server/access/pdf";
import { configureStampGateForTests, StampBusyError, stampGateState, withStampSlot } from "@/server/access/stamp-gate";
import { configureStampMemoryForTests, reserveStampMemory } from "@/server/access/stamp-memory";
import * as products from "@/server/admin/products";
import type { Actor } from "@/server/auth/permissions";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { pendingSaturation, resetSaturationForTests } from "@/server/platform/saturation";
import { storage } from "@/server/storage";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createProduct, createUser, makePdf } from "../helpers/factories";
import { provenOwner } from "../helpers/step-up";
import { completeTicketed } from "../helpers/upload-ticket";

/**
 * البند R008: توليد المعاينة يحمل الملف الرئيسي كله في الذاكرة ويعيد بناء صفحاته، فيمر بما يمر به الختم:
 * مكان الختم المحدود، وسقف الذاكرة، ومهلة. ممتلئ الآن: «مشغول» قبل أي قراءة، ولا يُعلَّم الملف معيبًا.
 */
const session = vi.hoisted(() => ({ user: null as null | { id: string; email: string; role: string }, sessionId: "" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/auth/session", async (original) => ({
  ...(await original<typeof import("@/server/auth/session")>()),
  getCurrentUser: async () => session.user,
  getCurrentSession: async () => (session.user ? { user: session.user, sessionId: session.sessionId, mustChangePassword: false, needsTwoFactorEnrolment: false } : null),
}));
vi.mock("@/server/http", async (original) => ({ ...(await original<typeof import("@/server/http")>()), clientIp: async () => "192.0.2.76", userAgent: async () => "t" }));

const { regeneratePreviewAction } = await import("@/app/admin/products/actions");

let admin: Awaited<ReturnType<typeof createUser>>;
let owner: Actor;

beforeAll(async () => {
  await resetDb();
  admin = await createUser({ role: "admin" });
  session.sessionId = (await provenOwner(admin)).sessionId;
  owner = { kind: "owner", userId: admin.id, name: admin.fullName, email: admin.email, teacherId: null, canUpload: true };
});
afterAll(closeDb);
afterEach(() => {
  session.user = null;
  configureStampGateForTests(null);
  configureStampMemoryForTests(null);
  vi.restoreAllMocks();
});

/** يشغل المكان الوحيد حتى يُفتح */
function occupySlot() {
  configureStampGateForTests({ slots: 1, queue: 0 });
  let free!: () => void;
  const until = new Promise<void>((r) => (free = r));
  const running = withStampSlot(() => until);
  return async () => {
    free();
    await running;
  };
}

const previewsOf = (productId: string) => sql<{ id: string; storage_key: string; is_auto_preview: boolean }[]>`select id, storage_key, is_auto_preview from product_files where product_id = ${productId} and kind = 'preview'`;
const statusOf = async (fileId: string) => (await sql<{ check_status: string }[]>`select check_status from product_files where id = ${fileId}`)[0].check_status;

async function withTwoMainFiles() {
  const p = await createProduct();
  const bytes = await makePdf(12, "Second part");
  const key = `products/${p.id}/${randomUUID()}.pdf`;
  await storage().put("private", key, bytes, "application/pdf");
  await sql`
    insert into product_files (product_id, kind, title, storage_key, original_name, mime_type, size_bytes, page_count, sort_order, check_status, checked_at)
    values (${p.id}, 'main', 'الجزء الثاني', ${key}, 'part2.pdf', 'application/pdf', ${bytes.length}, 12, 1, 'ok', now())
  `;
  return p;
}

describe("R008: a preview is built under the same limits as a stamp", () => {
  it("every slot and queue place taken: busy at once, the file is not read and the preview stays", async () => {
    const p = await createProduct();
    const before = await previewsOf(p.id);
    const free = occupySlot();
    const read = vi.spyOn(storage(), "read");
    try {
      await expect(products.regenerateAutoPreview(p.id)).rejects.toBeInstanceOf(StampBusyError);
      expect(read).not.toHaveBeenCalled();
    } finally {
      await free();
    }
    expect(await previewsOf(p.id)).toEqual(before);
  });

  it("the instance's transfer memory full: busy before the file is read", async () => {
    const p = await createProduct();
    configureStampMemoryForTests({ budgetBytes: 1024 });
    const other = reserveStampMemory(1000);
    const read = vi.spyOn(storage(), "read");
    try {
      await expect(products.regenerateAutoPreview(p.id)).rejects.toBeInstanceOf(StampBusyError);
      expect(read).not.toHaveBeenCalled();
    } finally {
      other.release();
    }
  });

  it("the file is read outside the slot and the preview built inside it", async () => {
    const p = await createProduct();
    const seen: Record<string, number[]> = { read: [], build: [] };
    const realRead = storage().read;
    const realBuild = pdf.extractPreview;
    vi.spyOn(storage(), "read").mockImplementation(async (...args) => {
      seen.read.push(stampGateState().active);
      return realRead(...args);
    });
    vi.spyOn(pdf, "extractPreview").mockImplementation(async (...args) => {
      seen.build.push(stampGateState().active);
      return realBuild(...args);
    });
    expect(await products.regenerateAutoPreview(p.id)).toBe("generated");
    expect(seen).toEqual({ read: [0], build: [1] });
    expect(stampGateState()).toMatchObject({ active: 0, waiting: 0 });
  });

  it("a build that runs out of time on a good file is busy, noted, and the file is not blamed", async () => {
    const p = await createProduct();
    vi.spyOn(pdf, "extractPreview").mockRejectedValue(new pdf.StampDeadlineError());
    resetSaturationForTests({ holdWrites: true });
    await expect(products.regenerateAutoPreview(p.id)).rejects.toBeInstanceOf(StampBusyError);
    expect(pendingSaturation().stamp_deadline).toBe(1);
    expect(await statusOf(p.mainFileId!)).toBe("ok");
  });

  it("deleting the main file a preview came from while busy removes that preview instead of leaving it", async () => {
    const p = await withTwoMainFiles();
    expect((await previewsOf(p.id)).filter((f) => f.is_auto_preview)).toHaveLength(1);
    const free = occupySlot();
    try {
      await expect(products.deleteProductFile(p.id, p.mainFileId!, owner)).resolves.toBeUndefined();
    } finally {
      await free();
    }
    expect(await previewsOf(p.id)).toEqual([]);
    expect(await sql`select 1 from product_files where id = ${p.mainFileId}`).toHaveLength(0);
  });

  it("an upload while busy still succeeds, and says the preview will come later", async () => {
    const p = await createProduct({ status: "draft", withFile: false, withPreview: false });
    const key = `products/${p.id}/2026/11/${randomUUID()}.pdf`;
    await storage().put("private", key, await makePdf(12, "Body"), "application/pdf");
    vi.spyOn(products, "regenerateAutoPreview").mockRejectedValue(new StampBusyError(10));
    const res = await completeTicketed({ target: "main", key, productId: p.id }, owner);
    expect(res).toMatchObject({ id: expect.any(String), message: expect.stringContaining("الخادم مشغول بملفات الطلاب الآن") });
  });

  it("the regenerate button is limited per account", async () => {
    const p = await createProduct();
    session.user = admin;
    const fd = new FormData();
    fd.set("productId", p.id);
    expect(await regeneratePreviewAction(null, fd)).toMatchObject({ ok: true });
    for (let i = 0; i < 10; i++) await hitRateLimit(`preview-regen:${admin.id}`, 10, 600);
    expect(await regeneratePreviewAction(null, fd)).toMatchObject({ error: expect.stringContaining("مرات كثيرة") });
  });
});
