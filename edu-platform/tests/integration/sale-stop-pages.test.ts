import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { grantProduct } from "@/server/access/entitlements";
import { TeacherForm } from "@/components/admin/teacher-form";
import { resetEnvCache } from "@/server/env";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createBundle, createProduct, createTeacher, createUser, createVideoProduct, type TestTeacher } from "../helpers/factories";
import { TEST_ENV } from "../test-env";

/** ما تعرضه الصفحات فعلًا: لا سعر ولا زر شراء لما لن يقبله الدفع، وصاحب المحتوى يعرف أن بيعه متوقف */
type SessionUser = { id: string; email: string; role: string; fullName: string; isActive: boolean };
const ctx = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("@/server/commerce/cart", async (original) => ({ ...(await original<typeof import("@/server/commerce/cart")>()), getCartIds: async () => [] }));
vi.mock("@/server/auth/session", async (original) => ({
  ...(await original<typeof import("@/server/auth/session")>()),
  getCurrentUser: async () => ctx.user,
  getCurrentSession: async () => (ctx.user ? { user: ctx.user, mustChangePassword: false, needsTwoFactorEnrolment: false } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/admin/products",
  useSearchParams: () => new URLSearchParams(),
}));

const { default: ProductPage } = await import("@/app/(site)/products/[slug]/page");
const { default: AdminProductPage } = await import("@/app/admin/products/[id]/page");

const productHtml = async (slug: string) => renderToStaticMarkup(await ProductPage({ params: Promise.resolve({ slug }) }));
const adminHtml = async (id: string) => renderToStaticMarkup(await AdminProductPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }));

const BUY = ['data-testid="buy-now"', 'data-testid="add-to-cart"'];
const NOTICE = 'data-testid="product-unavailable-notice"';
const ALERT = 'data-testid="sale-stopped-alert"';

let ownerUser: SessionUser;

beforeAll(async () => {
  await resetDb();
  const u = await createUser({ role: "admin" });
  ownerUser = { id: u.id, email: u.email, role: "admin", fullName: u.fullName, isActive: true };
});
afterAll(async () => {
  await closeDb();
});
afterEach(() => {
  ctx.user = null;
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  (process.env as Record<string, string>).NODE_ENV = "test";
  delete process.env.VIDEO_PROVIDER;
  resetEnvCache();
});

const asTeacher = (t: TestTeacher) => {
  ctx.user = { id: t.user!.id, email: t.user!.email, role: "teacher", fullName: t.displayName, isActive: true };
};
const asOwner = () => {
  ctx.user = ownerUser;
};
const flag = (fileId: string | null) => sql`update product_files set check_status = 'corrupt' where id = ${fileId}`;
const noShareTeacher = async (productId: string) => {
  const t = await createTeacher({ shareBps: null });
  await sql`update products set teacher_id = ${t.id} where id = ${productId}`;
};

/** ما يراه الزائر. بيانات schema.org تبقي السعر مع OutOfStock، وهذا هو الشكل الصحيح لمنتج غير متوفر */
const visible = (html: string) => html.split("<script").map((part, i) => (i === 0 ? part : part.slice(part.indexOf("</script>") + 9))).join("");

function expectNotOnSale(html: string, priceText: string, opts: { structuredData: boolean } = { structuredData: true }) {
  for (const b of BUY) expect(html).not.toContain(b);
  expect(html).toContain(NOTICE);
  expect(html).not.toContain('"https://schema.org/InStock"');
  if (opts.structuredData) expect(html).toContain("https://schema.org/OutOfStock");
  expect(visible(html)).not.toContain(priceText);
}

describe("صفحة منتج لا يقبله الدفع", () => {
  it("a product with a flagged file shows no price, no buy button and no in-stock data", async () => {
    const p = await createProduct({ priceFils: 2750 });
    await flag(p.mainFileId);
    expectNotOnSale(await productHtml(p.slug), "2.750");
  });

  it("a product whose teacher has no agreed share likewise", async () => {
    const p = await createProduct({ priceFils: 2750 });
    await noShareTeacher(p.id);
    expectNotOnSale(await productHtml(p.slug), "2.750");
  });

  it("a video product likewise", async () => {
    const p = await createVideoProduct({ status: "published", priceFils: 2750 });
    await noShareTeacher(p.id);
    expectNotOnSale(await productHtml(p.slug), "2.750", { structuredData: false });
  });

  it("a bundle with a flagged item inside likewise", async () => {
    const inside = await createProduct({ priceFils: 1000 });
    await flag(inside.mainFileId);
    const b = await createBundle({ items: [inside.id], priceFils: 2750 });
    expectNotOnSale(await productHtml(b.slug), "2.750");
  });

  it("a healthy product is untouched", async () => {
    const p = await createProduct({ priceFils: 2750 });
    const html = await productHtml(p.slug);
    expect(BUY.some((b) => html.includes(b))).toBe(true);
    expect(html).not.toContain(NOTICE);
    expect(html).toContain('"https://schema.org/InStock"');
    expect(html).toContain("2.750");
  });

  it("someone who already owns it is sent to read it, not told it cannot be bought", async () => {
    const p = await createProduct({ priceFils: 2750 });
    await noShareTeacher(p.id);
    const u = await createUser();
    await grantProduct(sql, { userId: u.id, productId: p.id, source: "manual", grantedBy: null, reason: "test" });
    ctx.user = { id: u.id, email: u.email, role: "student", fullName: u.fullName, isActive: true };
    const html = await productHtml(p.slug);
    expect(html).not.toContain(NOTICE);
    for (const b of BUY) expect(html).not.toContain(b);
  });
});

describe("لوحة المنتج", () => {
  const ownedBy = async (t: TestTeacher, opts: Parameters<typeof createProduct>[0] = {}) => {
    const p = await createProduct(opts);
    await sql`update products set teacher_id = ${t.id} where id = ${p.id}`;
    return p;
  };
  const teacher = () => createTeacher({ mode: "self_managed", shareBps: 4000 });

  it("tells the teacher sales stopped, in words that do not expose the owner's tools", async () => {
    const t = await teacher();
    const p = await ownedBy(t, { priceFils: 2000 });
    await flag(p.mainFileId);
    asTeacher(t);
    const html = await adminHtml(p.id);
    expect(html).toContain(ALERT);
    expect(html).not.toContain('href="/admin/content-health"');
  });

  it("tells the owner too, with the way to the reason", async () => {
    const p = await createProduct({ priceFils: 2000 });
    await flag(p.mainFileId);
    asOwner();
    const html = await adminHtml(p.id);
    expect(html).toContain(ALERT);
    expect(html).toContain('href="/admin/content-health"');
  });

  it("says nothing on a product that sells normally, or that is not published", async () => {
    asOwner();
    expect(await adminHtml((await createProduct({ priceFils: 2000 })).id)).not.toContain(ALERT);
    const d = await createProduct({ priceFils: 2000, status: "draft" });
    await flag(d.mainFileId);
    expect(await adminHtml(d.id)).not.toContain(ALERT);
  });

  it("offers the file re-check to the owner only", async () => {
    const t = await teacher();
    const p = await ownedBy(t, { priceFils: 2000, status: "draft" });
    await sql`update product_files set check_status = 'missing' where id = ${p.mainFileId}`;
    asOwner();
    expect(await adminHtml(p.id)).toContain("إعادة فحص الملف");
    asTeacher(t);
    expect(await adminHtml(p.id)).not.toContain("إعادة فحص الملف");
  });

  it("carries the time the content was sent for review inside the approval form", async () => {
    const p = await createProduct({ priceFils: 2000, status: "draft" });
    const submitted = new Date("2026-11-01T10:20:30.456Z");
    await sql`update products set status = 'in_review', submitted_at = ${submitted} where id = ${p.id}`;
    asOwner();
    expect(await adminHtml(p.id)).toContain(`name="submittedAt" value="${submitted.toISOString()}"`);
  });

  it("asks for confirmation when adding to a bundle on sale", async () => {
    const b = await createBundle({ items: [(await createProduct({ priceFils: 1000 })).id], priceFils: 3000 });
    asOwner();
    expect(await adminHtml(b.id)).toContain('name="confirmShare"');
  });

  describe("قبل تفعيل استضافة الفيديو", () => {
    const closed = () => {
      (process.env as Record<string, string>).NODE_ENV = "production";
      resetEnvCache();
    };

    it("a teacher sees why, and no uploader that would only fail", async () => {
      const t = await teacher();
      const p = await createVideoProduct({ status: "draft", teacherId: t.id, lessons: 0 });
      closed();
      asTeacher(t);
      const html = await adminHtml(p.id);
      expect(html).toContain('data-testid="lesson-upload-closed"');
      expect(html).not.toContain("رفع أول درس فيديو");
    });

    it("once hosting is open the same teacher gets the uploader", async () => {
      const t = await teacher();
      const p = await createVideoProduct({ status: "draft", teacherId: t.id, lessons: 0 });
      asTeacher(t);
      const html = await adminHtml(p.id);
      expect(html).not.toContain('data-testid="lesson-upload-closed"');
      expect(html).toContain("رفع أول درس فيديو");
    });
  });
});

describe("نموذج المعلم", () => {
  it("offers the confirmation for a 0% or 100% share", () => {
    const defaults = { slug: "", displayName: "", headline: "", bio: "", isPublished: true, canUpload: true, revenueShare: "", sortOrder: "0", subjectIds: [] };
    const html = renderToStaticMarkup(createElement(TeacherForm, { action: async () => ({}) as never, defaults: defaults as never, subjects: [], submitLabel: "حفظ" }));
    expect(html).toContain('name="confirmExtremeShare"');
  });
});
