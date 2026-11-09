import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PRODUCT_TYPES, VIDEO_PRODUCT_TYPES } from "@/lib/labels";
import { checkLessonAccess } from "@/server/access/lessons";
import { grantProduct } from "@/server/access/entitlements";
import { approveAndPublish, publishBlockers, setProductStatus, submitForReview } from "@/server/admin/products";
import type { Actor } from "@/server/auth/permissions";
import { bestSellers, getBundleItems, getBundlesContaining, getPublishedProductsByIds, latestVideoProducts, listProducts, sitemapEntries, teacherContent } from "@/server/catalog/queries";
import { computeCart, unsellableProductIds } from "@/server/commerce/cart";
import { OrderError, createOrder } from "@/server/commerce/orders";
import { resetEnvCache } from "@/server/env";
import { OrderClosedError, resetPaymentMethodsCache, verifyAndApplyPayment } from "@/server/payments/service";
import { closedVideoProductIds, rawVideoForbidden, videoHostingBlocked, videoSalesOpen } from "@/server/video/policy";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { invoiceIdOf, invoicesCreated, orderRow, startPayment } from "../helpers/payment-flow";
import { activeEntitlements, createContainer, createProduct, createTeacher, createUser, createVideoProduct } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

const ctx = vi.hoisted(() => ({ cart: [] as string[], user: null as unknown }));
vi.mock("@/server/commerce/cart", async (original) => ({
  ...(await original<typeof import("@/server/commerce/cart")>()),
  getCartIds: async () => ctx.cart,
  writeCartIds: async (ids: string[]) => {
    ctx.cart = ids;
  },
}));
vi.mock("@/server/auth/session", async (original) => ({ ...(await original<typeof import("@/server/auth/session")>()), getCurrentUser: async () => ctx.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

const { addToCartAction } = await import("@/app/(site)/cart/actions");
const { default: ProductPage } = await import("@/app/(site)/products/[slug]/page");
const { default: WatchPage } = await import("@/app/(reader)/watch/[productId]/page");

let sim: Simulator;
let owner: Actor;

beforeAll(async () => {
  await resetDb();
  sim = await startSimulator({ port: SIM_PORT, apiKey: SIM_API_KEY, webhookSecret: WEBHOOK_SECRET });
  const u = await createUser({ role: "admin" });
  owner = { kind: "owner", userId: u.id, name: u.fullName, email: u.email, teacherId: null, canUpload: true };
});
afterAll(async () => {
  await sim?.close();
  await closeDb();
});
beforeEach(() => sql`delete from rate_limits`);
afterEach(async () => {
  sim.clearFaults();
  ctx.cart = [];
  ctx.user = null;
  delete process.env.ALLOW_FILE_VIDEO;
  delete process.env.VIDEO_PROVIDER;
  for (const k of ["BUNNY_STREAM_LIBRARY_ID", "BUNNY_STREAM_API_KEY", "BUNNY_STREAM_TOKEN_KEY", "BUNNY_STREAM_READONLY_API_KEY"]) delete process.env[k];
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
  resetPaymentMethodsCache();
  await sql`delete from settings where key = 'videos_enabled'`;
});

function production(extra: Record<string, string> = {}) {
  (process.env as Record<string, string>).NODE_ENV = "production";
  Object.assign(process.env, extra);
  resetEnvCache();
}
const BUNNY_ENV = { VIDEO_PROVIDER: "bunny", BUNNY_STREAM_LIBRARY_ID: "1", BUNNY_STREAM_API_KEY: "a", BUNNY_STREAM_TOKEN_KEY: "t", BUNNY_STREAM_READONLY_API_KEY: "r" };

const videosOff = () => sql`insert into settings (key, value) values ('videos_enabled', 'false'::jsonb) on conflict (key) do update set value = excluded.value`;
const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};
const CONSENT = { guardianDeclared: true, termsAccepted: true, meta: { ip: null, userAgent: null } };
const grant = (userId: string, productId: string) => grantProduct(sql, { userId, productId, source: "manual", grantedBy: null, reason: "test" });
const productHtml = async (slug: string) => renderToStaticMarkup(await ProductPage({ params: Promise.resolve({ slug }) }));
const watchHtml = async (id: string, lesson?: string) => renderToStaticMarkup(await WatchPage({ params: Promise.resolve({ productId: id }), searchParams: Promise.resolve(lesson ? { lesson } : {}) }));
const BUY_BUTTONS = ['data-testid="buy-now"', 'data-testid="add-to-cart"'];
const expectNoBuy = (html: string) => {
  for (const b of BUY_BUTTONS) expect(html).not.toContain(b);
};

/** مأخوذة من القائمة المعتمدة: أي نوع فيديو جديد يمر تلقائيًا بكل اختبار هنا */
type VideoType = NonNullable<NonNullable<Parameters<typeof createVideoProduct>[0]>["type"]>;
const VIDEO_TYPES = VIDEO_PRODUCT_TYPES as VideoType[];

// ---------------------------------------------------------------------------- D12
describe("D12:a raw video file is not published on production without explicit permission", () => {
  describe.each(VIDEO_TYPES)("%s", (type) => {
    it("is blocked with VIDEO_PROVIDER=file on production", async () => {
      const p = await createVideoProduct({ type, status: "draft" });
      production();
      expect(videoHostingBlocked()).toBe(true);
      const issues = await publishBlockers(p.id);
      expect(issues.join(" ")).toContain("ALLOW_FILE_VIDEO=true");
      await expect(setProductStatus(p.id, "published", owner)).rejects.toThrow("ملف خام");
      expect((await sql`select status from products where id = ${p.id}`)[0].status).toBe("draft");
    });

    it("is allowed once ALLOW_FILE_VIDEO=true", async () => {
      const p = await createVideoProduct({ type, status: "draft" });
      production({ ALLOW_FILE_VIDEO: "true" });
      expect((await publishBlockers(p.id)).join(" ")).not.toContain("ملف خام");
    });
  });

  it("does not apply outside production", async () => {
    const p = await createVideoProduct({ status: "draft" });
    expect(rawVideoForbidden()).toBe(false);
    expect((await publishBlockers(p.id)).join(" ")).not.toContain("ملف خام");
  });

  it("the owner's approval is blocked as well", async () => {
    const p = await createVideoProduct({ status: "draft" });
    production();
    await expect(approveAndPublish(p.id, { priceFils: 4000, compareAtPriceFils: null, accessMode: "unlimited", accessUntil: null, accessDays: null }, owner)).rejects.toThrow("ملف خام");
  });

  it("a teacher can still send for review: only the owner can change hosting", async () => {
    const teacher = await createTeacher({ withUser: true });
    const p = await createVideoProduct({ status: "draft", teacherId: teacher.id });
    production();
    const actor: Actor = { kind: "teacher", userId: teacher.user!.id, name: teacher.displayName, email: teacher.user!.email, teacherId: teacher.id, teacherName: teacher.displayName, canUpload: true };
    await expect(submitForReview(p.id, actor)).resolves.toBeUndefined();
  });

  it("notes are never affected", async () => {
    const p = await createProduct({ status: "draft" });
    production();
    expect((await publishBlockers(p.id)).join(" ")).not.toContain("ملف خام");
  });

  it("a bundle holding a video is a video product", async () => {
    const v = await createVideoProduct({ status: "published" });
    const b = await createContainer({ type: "bundle", items: [v.id], status: "draft" });
    production();
    expect((await publishBlockers(b.id)).join(" ")).toContain("ALLOW_FILE_VIDEO=true");
  });

  it("with Bunny as provider: Bunny lessons publish, a leftover raw file does not", async () => {
    const bunny = await createVideoProduct({ status: "draft", provider: "bunny" });
    const raw = await createVideoProduct({ status: "draft", provider: "file" });
    production(BUNNY_ENV);
    expect(videoHostingBlocked()).toBe(false);
    expect((await publishBlockers(bunny.id)).join(" ")).not.toContain("ملف خام");
    expect((await publishBlockers(raw.id)).join(" ")).toContain("ملف خام");
  });

  it("turning videos off does not stop preparing content", async () => {
    const p = await createVideoProduct({ status: "draft" });
    await videosOff();
    expect((await publishBlockers(p.id)).join(" ")).not.toContain("ملف خام");
  });
});

describe("the DB type list matches the code", () => {
  it("the products type check allows exactly PRODUCT_TYPES", async () => {
    const [{ def }] = await sql<{ def: string }[]>`select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'products_type_check'`;
    const inDb = [...def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(inDb).toEqual([...PRODUCT_TYPES].sort());
  });
});

// ---------------------------------------------------------------------------- videos_enabled
type Closer = { name: string; close: () => Promise<unknown> };
const CLOSERS: Closer[] = [
  { name: "the owner turned videos off", close: videosOff },
  {
    name: "production with raw files and no permission",
    close: async () => production(),
  },
];

describe.each(CLOSERS)("video closed: $name", ({ close }) => {
  describe.each(VIDEO_TYPES)("%s", (type) => {
    const make = () => createVideoProduct({ type, freePreviewIndex: 0 });

    it("cannot be sold: cart, add to cart and order all refuse on the server", async () => {
      const p = await make();
      const user = await createUser();
      await close();
      expect((await unsellableProductIds([p.id])).has(p.id)).toBe(true);

      const cart = await computeCart([p.id], user.id);
      expect(cart.payableLines).toHaveLength(0);
      expect(cart.subtotalFils).toBe(0);
      expect(cart.notices.join(" ")).toContain("غير متاح للبيع");

      const added = await addToCartAction({}, form({ productId: p.id }));
      expect(added).toMatchObject({ error: "هذا المنتج غير متاح للبيع حاليًا" });
      expect(ctx.cart).toEqual([]);

      await expect(createOrder({ user, productIds: [p.id], isTest: true, consent: CONSENT })).rejects.toBeInstanceOf(OrderError);
    });

    it("the product page offers no purchase and no preview, and says so", async () => {
      const p = await make();
      await close();
      const html = await productHtml(p.slug);
      expect(html).toContain('data-testid="video-closed-notice"');
      expect(html).toContain("شراء دروس الفيديو غير متاح حاليًا");
      expect(html).not.toContain("قريب");
      expectNoBuy(html);
      expect(html).not.toContain('data-testid="watch-preview"');
      expect(html).not.toContain("شاهد المعاينة المجانية");
      expect(html).not.toContain("معاينة مجانية");
      expect(html, "no payment promises for what cannot be bought").not.toContain("فور تأكيد الدفع");
      const times = (needle: string) => html.split(needle).length - 1;
      expect(times('data-testid="lesson-item"')).toBeGreaterThan(0);
      expect(times('data-testid="lesson-locked"'), "every lesson shows locked, the free one too").toBe(times('data-testid="lesson-item"'));
    });

    it("the free preview is closed on the server, with no player and no buy button on the page", async () => {
      const p = await make();
      await close();
      expect(await checkLessonAccess(p.lessonIds[0], null)).toEqual({ ok: false, reason: "unauthenticated" });
      const html = await watchHtml(p.id);
      expect(html).toContain('data-testid="videos-closed-stage"');
      expect(html).toContain("سجّل الدخول");
      expect(html).not.toContain('data-testid="watch-player"');
      expect(html).not.toContain("اشترِ للوصول");
    });

    it("a student who bought it keeps watching, and is offered nothing to buy", async () => {
      const p = await make();
      const user = await createUser();
      await grant(user.id, p.id);
      await close();
      expect(await checkLessonAccess(p.lessonIds[0], user)).toMatchObject({ ok: true, via: "owned" });
      ctx.user = user;
      const product = await productHtml(p.slug);
      expect(product).toContain("في مكتبتك");
      expect(product).toContain('data-testid="continue-watching"');
      expect(product).not.toContain('data-testid="video-closed-notice"');
      expectNoBuy(product);
      const watch = await watchHtml(p.id);
      expect(watch).toContain('data-testid="watch-player"');
      expect(watch).not.toContain('data-testid="videos-closed-stage"');
      expect(watch).not.toContain("اشترِ");
    });
  });

  it("the free preview a buyer already owns plays as owned, not as free", async () => {
    const p = await createVideoProduct({ freePreviewIndex: 0 });
    const user = await createUser();
    await grant(user.id, p.id);
    await close();
    expect(await checkLessonAccess(p.lessonIds[0], user)).toMatchObject({ ok: true, via: "owned" });
  });

  it("staff can still review", async () => {
    const p = await createVideoProduct({ freePreviewIndex: 0 });
    const admin = await createUser({ role: "admin" });
    await close();
    expect(await checkLessonAccess(p.lessonIds[0], admin)).toMatchObject({ ok: true, via: "staff" });
    ctx.user = admin;
    expect(await watchHtml(p.id)).toContain('data-testid="watch-player"');
  });

  it("a buyer of one part of a course is not offered the rest", async () => {
    const part = await createVideoProduct({});
    const other = await createVideoProduct({});
    const course = await createContainer({ type: "video_course", items: [part.id, other.id] });
    const user = await createUser();
    await grant(user.id, part.id);
    await close();
    ctx.user = user;
    const locked = await watchHtml(course.id, other.lessonIds[0]);
    expect(locked).toContain('data-testid="lesson-locked-panel"');
    expect(locked).toContain("ليس ضمن ما اشتريته");
    expect(locked).not.toContain('data-testid="buy-from-locked"');
    expect(locked).not.toContain("اشترِ");
    expect(await watchHtml(course.id, part.lessonIds[0])).toContain('data-testid="watch-player"');
  });

  it("a bundle holding a video cannot be sold, and its page says so", async () => {
    const v = await createVideoProduct({});
    const n = await createProduct({});
    const b = await createContainer({ type: "bundle", items: [v.id, n.id] });
    await close();
    expect((await unsellableProductIds([b.id])).has(b.id)).toBe(true);
    const html = await productHtml(b.slug);
    expect(html).toContain('data-testid="video-closed-notice"');
    expectNoBuy(html);
  });

  it("a bundle whose only video is still a draft has no video to close", async () => {
    const v = await createVideoProduct({ status: "draft" });
    const n = await createProduct({});
    const b = await createContainer({ type: "bundle", items: [v.id, n.id] });
    await close();
    expect((await unsellableProductIds([b.id])).has(b.id)).toBe(false);
  });

  it("notes keep selling normally", async () => {
    const n = await createProduct({});
    const user = await createUser();
    await close();
    expect((await unsellableProductIds([n.id])).size).toBe(0);
    expect((await computeCart([n.id], user.id)).payableLines).toHaveLength(1);
    expect(await addToCartAction({}, form({ productId: n.id }))).toMatchObject({ ok: true });
    const html = await productHtml(n.slug);
    expect(html).toContain('data-testid="add-to-cart"');
    expect(html).not.toContain('data-testid="video-closed-notice"');
  });

  it("the public lists hide closed video and keep notes", async () => {
    const teacher = await createTeacher({ shareBps: 7000 });
    const v = await createVideoProduct({ freePreviewIndex: 0, teacherId: teacher.id, type: "exam_review" });
    const n = await createProduct({});
    const buyer = await createUser();
    for (const id of [v.id, n.id]) {
      const paid = await createOrder({ user: buyer, productIds: [id], isTest: false, consent: CONSENT });
      await sql`update orders set status = 'paid', paid_at = now() where id = ${paid.id}`;
    }
    const withVideo = await createContainer({ type: "bundle", items: [v.id, n.id] });
    const notesOnly = await createContainer({ type: "bundle", items: [n.id] });
    await close();
    const listed = (await listProducts({})).map((p) => p.id);
    expect(listed).not.toContain(v.id);
    expect(listed).not.toContain(withVideo.id);
    expect(listed).toContain(n.id);
    expect((await listProducts({ type: "exam_review" })).map((p) => p.id)).not.toContain(v.id);
    expect((await latestVideoProducts(50)).map((p) => p.id)).not.toContain(v.id);
    expect((await teacherContent(teacher.id)).flatMap((g) => g.sections.flatMap((s) => s.items.map((i) => i.id)))).not.toContain(v.id);

    const sold = (await bestSellers({ limit: 500 })).map((p) => p.id);
    expect(sold).not.toContain(v.id);
    expect(sold).toContain(n.id);

    const bundles = (await getBundlesContaining(n.id)).map((p) => p.id);
    expect(bundles).not.toContain(withVideo.id);
    expect(bundles).toContain(notesOnly.id);

    const slugs = (await sitemapEntries()).products.map((p) => p.slug);
    expect(slugs).not.toContain(v.slug);
    expect(slugs).toContain(n.slug);
  });

  it("a bundle's contents offer no preview that would not open", async () => {
    const v = await createVideoProduct({ freePreviewIndex: 0 });
    const b = await createContainer({ type: "bundle", items: [v.id] });
    expect((await getBundleItems(b.id)).map((c) => c.previewLessonId)).toEqual([v.lessonIds[0]]);
    await close();
    expect((await getBundleItems(b.id)).map((c) => c.previewLessonId)).toEqual([null]);
  });

  it("the cart still finds the product, so the student is told instead of it vanishing", async () => {
    const p = await createVideoProduct({});
    await close();
    expect((await getPublishedProductsByIds([p.id])).map((x) => x.id)).toEqual([p.id]);
  });
});

describe("an order raised before videos closed", () => {
  async function pendingOrder() {
    const user = await createUser({ phone: "+96599887766" });
    const p = await createVideoProduct({ priceFils: 4000 });
    const order = await createOrder({ user, productIds: [p.id], isTest: true, consent: CONSENT });
    return { user, p, order };
  }

  it("gets no new invoice, and is closed with nothing charged", async () => {
    const { order } = await pendingOrder();
    await videosOff();
    sim.state.requests.length = 0;
    const err = await startPayment(order, null).catch((e) => e);
    expect(err).toBeInstanceOf(OrderClosedError);
    expect((err as OrderClosedError).reason).toBe("product_ended");
    expect(invoicesCreated(sim)).toBe(0);
    expect((await orderRow(order.id)).status).toBe("cancelled");
  });

  it("does not reopen an old invoice link either", async () => {
    const { order } = await pendingOrder();
    await startPayment(order, null);
    await videosOff();
    await expect(startPayment(order, null)).rejects.toBeInstanceOf(OrderClosedError);
  });

  it("a real payment on an invoice already issued is honoured, and the student can watch", async () => {
    const { user, p, order } = await pendingOrder();
    const { url } = await startPayment(order, null);
    await videosOff();
    const invoice = invoiceIdOf(url);
    await sim.pay(invoice, "success");
    await expect(verifyAndApplyPayment({ invoiceId: String(invoice) })).resolves.toMatchObject({ state: "paid" });
    expect(await activeEntitlements(user.id)).toContain(p.id);
    expect(await checkLessonAccess(p.lessonIds[0], user)).toMatchObject({ ok: true, via: "owned" });
  });

  it("a payment arriving after the order was closed reaches the owner rather than vanishing", async () => {
    const { order } = await pendingOrder();
    const { url } = await startPayment(order, null);
    await videosOff();
    await startPayment(order, null).catch(() => {});
    const invoice = invoiceIdOf(url);
    await sim.pay(invoice, "success");
    await expect(verifyAndApplyPayment({ invoiceId: String(invoice) })).resolves.toMatchObject({ state: "flagged", kind: "late_review" });
  });
});

describe("policy helpers", () => {
  it("open by default outside production", () => {
    expect(videoSalesOpen({ videos_enabled: true })).toBe(true);
    expect(videoSalesOpen({ videos_enabled: false })).toBe(false);
  });

  it("the notes-only launch is what an unconfigured production gets", () => {
    production();
    expect(videoSalesOpen({ videos_enabled: true })).toBe(false);
  });

  it("nothing to query when nothing is closed", async () => {
    const p = await createVideoProduct({});
    expect((await closedVideoProductIds(sql, [p.id], { videos_enabled: true })).size).toBe(0);
  });

  it("an empty list is fine", async () => {
    await videosOff();
    expect((await closedVideoProductIds(sql, [], { videos_enabled: false })).size).toBe(0);
  });

  it("nested containers are searched at any depth", async () => {
    const v = await createVideoProduct({});
    const inner = await createContainer({ type: "bundle", items: [v.id] });
    const outer = await createContainer({ type: "bundle", items: [inner.id] });
    expect((await closedVideoProductIds(sql, [outer.id], { videos_enabled: false })).has(outer.id)).toBe(true);
  });
});
