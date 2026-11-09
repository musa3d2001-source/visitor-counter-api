import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { computeCart } from "@/server/commerce/cart";
import { OrderError, createOrder, type OrderRow } from "@/server/commerce/orders";
import { getPublishedProductsByIds } from "@/server/catalog/queries";
import { approveAndPublish, createProduct as adminCreateProduct, getAdminProduct, listAdminProducts, publishBlockers, setProductStatus, submitForReview, updateProduct, type ProductInput } from "@/server/admin/products";
import { OrderClosedError, resetPaymentMethodsCache, verifyAndApplyPayment } from "@/server/payments/service";
import { NoteCard } from "@/components/site/note-card";
import { ProductRow } from "@/components/site/product-row";
import { SaleEndedNotice } from "@/app/(site)/products/[slug]/_components/purchase";
import type { Actor } from "@/server/auth/permissions";
import { resetEnvCache } from "@/server/env";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { invoiceIdOf, invoicesCreated, orderRow, startPayment } from "../helpers/payment-flow";
import { activeEntitlements, createContainer, createProduct, createTeacher, createUser, createVideoProduct, gradeAndSubject } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

const ctx = vi.hoisted(() => ({ cart: [] as string[] }));
vi.mock("@/server/commerce/cart", async (original) => ({
  ...(await original<typeof import("@/server/commerce/cart")>()),
  getCartIds: async () => ctx.cart,
  writeCartIds: async (ids: string[]) => {
    ctx.cart = ids;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { addToCartAction } = await import("@/app/(site)/cart/actions");

let sim: Simulator;
let owner: Actor;

const DAY = 86_400_000;
const past = () => new Date(Date.now() - DAY);
const future = () => new Date(Date.now() + 30 * DAY);
const PAST_DATE = "تاريخ نهاية الإتاحة مضى، فلن يمكن بيع المنتج";

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
afterEach(() => {
  sim.clearFaults();
  ctx.cart = [];
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
  resetPaymentMethodsCache();
});

const ended = (opts: { priceFils?: number; status?: "draft" | "published" | "hidden" } = {}) => createVideoProduct({ accessMode: "until_date", accessUntil: past(), ...opts });
const endAccess = (productId: string) => sql`update products set access_mode = 'until_date', access_until = now() - interval '1 minute' where id = ${productId}`;
const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};

async function adminInput(overrides: Partial<ProductInput> = {}): Promise<ProductInput> {
  const { gradeId, subjectId } = await gradeAndSubject(6, "math");
  return {
    type: "final_notes",
    title: "مذكرة الوحدة الأولى",
    summary: "ملخص",
    description: "وصف",
    contents: "",
    gradeId,
    subjectId,
    academicYear: "2026-2027",
    term: 1,
    previewPages: 1,
    proposedPriceFils: null,
    priceFils: 3000,
    compareAtPriceFils: null,
    isDownloadable: true,
    isFeatured: false,
    sortOrder: 0,
    teacherId: null,
    accessMode: "until_date",
    accessUntil: future(),
    accessDays: null,
    ...overrides,
  };
}

describe("the cart", () => {
  it("does not bill an ended product and says why", async () => {
    const gone = await ended({ priceFils: 4000 });
    const live = await createProduct({ priceFils: 3000 });
    const cart = await computeCart([gone.id, live.id], null);
    expect(cart.payableLines.map((l) => l.id)).toEqual([live.id]);
    expect(cart.subtotalFils).toBe(3000);
    expect(cart.notices.some((n) => n.includes("انتهى بيع"))).toBe(true);
    expect(cart.lines.find((l) => l.id === gone.id)?.saleEnded).toBe(true);
  });

  it("a product ending today at this moment counts as ended, one still ahead does not", async () => {
    const justEnded = await createVideoProduct({ accessMode: "until_date", accessUntil: new Date(Date.now() - 1000) });
    const stillOn = await createVideoProduct({ accessMode: "until_date", accessUntil: new Date(Date.now() + 60_000) });
    const unlimited = await createVideoProduct();
    const days = await createVideoProduct({ accessMode: "days", accessDays: 30 });
    const cart = await computeCart([justEnded.id, stillOn.id, unlimited.id, days.id], null);
    expect(cart.payableLines.map((l) => l.id).sort()).toEqual([stillOn.id, unlimited.id, days.id].sort());
  });

  it("an ended bundle does not cover the products inside it", async () => {
    const inside = await createProduct({ priceFils: 2000 });
    const bundle = await createContainer({ items: [inside.id], accessMode: "until_date", accessUntil: past() });
    const cart = await computeCart([bundle.id, inside.id], null);
    expect(cart.payableLines.map((l) => l.id)).toEqual([inside.id]);
    expect(cart.subtotalFils).toBe(2000);
  });

  it("refuses to add an ended product", async () => {
    const gone = await ended();
    await expect(addToCartAction({}, form({ productId: gone.id }))).resolves.toEqual({ error: "انتهى بيع هذا المنتج" });
    expect(ctx.cart).toEqual([]);
  });

  it("still adds a product on sale", async () => {
    const live = await createVideoProduct({ accessMode: "until_date", accessUntil: future() });
    await expect(addToCartAction({}, form({ productId: live.id }))).resolves.toMatchObject({ ok: true });
    expect(ctx.cart).toEqual([live.id]);
  });
});

describe("billing", () => {
  it("creates no order when only ended products are left", async () => {
    const gone = await ended();
    const user = await createUser();
    const out = createOrder({ user, productIds: [gone.id], isTest: true });
    await expect(out).rejects.toBeInstanceOf(OrderError);
    await expect(out).rejects.toMatchObject({ userMessage: "انتهى بيع ما تبقى في سلتك، فلم ننشئ طلبًا." });
    expect(await sql`select 1 from orders where user_id = ${user.id}`).toHaveLength(0);
  });

  it("leaves an ended product out of a mixed order", async () => {
    const gone = await ended({ priceFils: 4000 });
    const live = await createProduct({ priceFils: 3000 });
    const user = await createUser();
    const order = await createOrder({ user, productIds: [gone.id, live.id], isTest: true });
    expect(order.total_fils).toBe(3000);
    expect((await sql<{ product_id: string }[]>`select product_id from order_items where order_id = ${order.id}`).map((i) => i.product_id)).toEqual([live.id]);
  });

  async function orderThatEnds() {
    const product = await createVideoProduct({ accessMode: "until_date", accessUntil: future() });
    const user = await createUser();
    const order = await createOrder({ user, productIds: [product.id], isTest: true });
    return { product, user, order };
  }

  it("closes an open order at payment, with no invoice", async () => {
    const { product, order } = await orderThatEnds();
    await endAccess(product.id);
    sim.state.requests.length = 0;
    const err = await startPayment(order, null).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OrderClosedError);
    expect(err).toMatchObject({ reason: "product_ended" });
    expect(await orderRow(order.id)).toMatchObject({ status: "cancelled", closed_reason: "product_ended" });
    expect(invoicesCreated(sim)).toBe(0);
  });

  it("does not hand back a payment link created before the sale ended", async () => {
    const { product, order } = await orderThatEnds();
    await startPayment(order, null);
    await endAccess(product.id);
    await expect(startPayment(order, null)).rejects.toMatchObject({ reason: "product_ended" });
  });

  it.each(["pending", "failed"] as const)("a payment that arrives after the end on a %s order is flagged for the owner, not granted", async (status) => {
    const { product, user, order } = await orderThatEnds();
    const { url } = await startPayment(order, null);
    const invoice = invoiceIdOf(url);
    await sim.pay(invoice, "success");
    await endAccess(product.id);
    if (status === "failed") await sql`update orders set status = 'failed' where id = ${order.id}`;
    await expect(verifyAndApplyPayment({ invoiceId: String(invoice) })).resolves.toMatchObject({ state: "flagged", kind: "late_review" });
    expect(await orderRow(order.id)).toMatchObject({ status: "cancelled", closed_reason: "product_ended" });
    expect(await activeEntitlements(user.id)).toEqual([]);
    const [extra] = await sql<{ kind: string; state: string; details: { blockers: string[] } }[]>`select kind, state, details from payment_extras where order_id = ${order.id}`;
    expect(extra).toMatchObject({ kind: "late_review", state: "open" });
    expect(extra.details.blockers).toEqual([`access_ended:${product.id}`]);
  });

  it("an open order is not touched while the sale is still on", async () => {
    const { order } = await orderThatEnds();
    await expect(startPayment(order as OrderRow, null)).resolves.toMatchObject({ reused: false });
    expect((await orderRow(order.id)).status).toBe("pending");
  });
});

describe("the catalogue", () => {
  it("marks an ended product in place of its price", async () => {
    const [card] = await getPublishedProductsByIds([(await ended()).id]);
    expect(card.saleEnded).toBe(true);
    const cardHtml = renderToStaticMarkup(createElement(NoteCard, { product: card }));
    expect(cardHtml).toContain('data-testid="sale-ended"');
    const rowHtml = renderToStaticMarkup(createElement(ProductRow, { product: card }));
    expect(rowHtml).toContain('data-testid="sale-ended"');
  });

  it("does not mark a product on sale", async () => {
    const [card] = await getPublishedProductsByIds([(await createVideoProduct({ accessMode: "until_date", accessUntil: future() })).id]);
    expect(card.saleEnded).toBe(false);
    expect(renderToStaticMarkup(createElement(NoteCard, { product: card }))).not.toContain('data-testid="sale-ended"');
  });

  it("an owner of the product sees that they own it, not that the sale ended", async () => {
    const [card] = await getPublishedProductsByIds([(await ended()).id]);
    expect(renderToStaticMarkup(createElement(NoteCard, { product: card, owned: true }))).not.toContain('data-testid="sale-ended"');
  });

  it("the product page replaces the buy buttons with a notice", () => {
    const html = renderToStaticMarkup(createElement(SaleEndedNotice));
    expect(html).toContain('data-testid="sale-ended-notice"');
    expect(html).toContain("لم يعد متاحًا للشراء");
  });
});

describe("the owner's screens", () => {
  it("lists an ended product as ended", async () => {
    const gone = await ended();
    const live = await createVideoProduct({ accessMode: "until_date", accessUntil: future() });
    const rows = await listAdminProducts(owner, {});
    expect(rows.find((r) => r.id === gone.id)?.sale_ended).toBe(true);
    expect(rows.find((r) => r.id === live.id)?.sale_ended).toBe(false);
  });

  it("refuses a past date when creating a product", async () => {
    await expect(adminCreateProduct(await adminInput({ accessUntil: past() }), owner)).rejects.toMatchObject({ message: PAST_DATE });
  });

  it("accepts a coming date when creating a product", async () => {
    await expect(adminCreateProduct(await adminInput(), owner)).resolves.toEqual(expect.any(String));
  });

  it("refuses a past date when saving", async () => {
    const id = await adminCreateProduct(await adminInput(), owner);
    await expect(updateProduct(id, await adminInput({ accessUntil: past() }), owner)).rejects.toMatchObject({ message: PAST_DATE });
    expect((await getAdminProduct(id))!.access_until!.getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses a published product whose date has passed from being saved unchanged", async () => {
    const gone = await createProduct();
    const until = past();
    await sql`update products set access_mode = 'until_date', access_until = ${until} where id = ${gone.id}`;
    await expect(updateProduct(gone.id, await adminInput({ accessUntil: until }), owner)).rejects.toMatchObject({ message: PAST_DATE });
  });

  it("lets an off-sale product keep its old date while other fields change", async () => {
    const id = await adminCreateProduct(await adminInput(), owner);
    const until = past();
    await sql`update products set access_until = ${until} where id = ${id}`;
    await expect(updateProduct(id, await adminInput({ accessUntil: until, title: "عنوان جديد" }), owner)).resolves.toBeUndefined();
    expect((await getAdminProduct(id))!.title).toBe("عنوان جديد");
  });

  it("does not let an off-sale product move to a different past date", async () => {
    const id = await adminCreateProduct(await adminInput(), owner);
    await sql`update products set access_until = now() - interval '2 days' where id = ${id}`;
    await expect(updateProduct(id, await adminInput({ accessUntil: new Date(Date.now() - 10 * DAY) }), owner)).rejects.toMatchObject({ message: PAST_DATE });
  });

  it("refuses to publish a product whose date has passed", async () => {
    const product = await createProduct({ status: "hidden" });
    await sql`update products set access_mode = 'until_date', access_until = now() - interval '1 day' where id = ${product.id}`;
    await expect(publishBlockers(product.id)).resolves.toContain("تاريخ نهاية الإتاحة مضى، فاختر تاريخًا قادمًا قبل النشر");
    await expect(setProductStatus(product.id, "published", owner)).rejects.toThrow("تاريخ نهاية الإتاحة مضى");
    expect((await getAdminProduct(product.id))!.status).toBe("hidden");
  });

  it("refuses a past date when approving a teacher's product", async () => {
    const teacher = await createTeacher({ mode: "self_managed" });
    const product = await createVideoProduct({ teacherId: teacher.id, status: "in_review" });
    const input = { priceFils: 4000, compareAtPriceFils: null, accessMode: "until_date" as const, accessDays: null };
    await expect(approveAndPublish(product.id, { ...input, accessUntil: past() }, owner)).rejects.toMatchObject({ message: PAST_DATE });
    expect((await getAdminProduct(product.id))!.status).toBe("in_review");
    await expect(approveAndPublish(product.id, { ...input, accessUntil: future() }, owner)).resolves.toBeUndefined();
    expect((await getAdminProduct(product.id))!.status).toBe("published");
  });

  it("approving with a new date replaces an old one that had passed", async () => {
    const teacher = await createTeacher({ mode: "self_managed" });
    const product = await createVideoProduct({ teacherId: teacher.id, status: "in_review", accessMode: "until_date", accessUntil: past() });
    await expect(approveAndPublish(product.id, { priceFils: 4000, compareAtPriceFils: null, accessMode: "unlimited", accessUntil: null, accessDays: null }, owner)).resolves.toBeUndefined();
  });

  it("a teacher sending a draft to review is not stopped by a date only the owner can change", async () => {
    const teacher = await createTeacher({ mode: "self_managed" });
    const product = await createVideoProduct({ teacherId: teacher.id, status: "draft", accessMode: "until_date", accessUntil: past() });
    const actor: Actor = { kind: "teacher", userId: teacher.user!.id, name: teacher.displayName, email: teacher.user!.email, teacherId: teacher.id, teacherName: teacher.displayName, canUpload: true };
    await expect(submitForReview(product.id, actor)).resolves.toBeUndefined();
  });
});
