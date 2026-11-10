import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createContainer, createProduct, createVideoProduct } from "../helpers/factories";

/** الكوكي نفسها يغطيها e2e. هنا ما يقرره المسار: من يُقبل، وماذا يدخل السلة */
const ctx = vi.hoisted(() => ({ cart: [] as string[], redirected: null as string | null }));
vi.mock("@/server/commerce/cart", async (original) => ({
  ...(await original<typeof import("@/server/commerce/cart")>()),
  getCartIds: async () => ctx.cart,
  writeCartIds: async (ids: string[]) => {
    ctx.cart = ids;
  },
}));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  redirect: (to: string) => {
    ctx.redirected = to;
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { POST } = await import("@/app/api/cart/route");
const { addToCartAction } = await import("@/app/(site)/cart/actions");

const ORIGIN = "http://localhost:3000";
const send = (body: string, headers: Record<string, string> = { origin: ORIGIN }) => POST(new NextRequest(`${ORIGIN}/api/cart`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body }));
const add = (productId: string) => send(JSON.stringify({ productId }));
const ID = "11111111-1111-4111-8111-111111111111";

beforeAll(resetDb);
afterAll(closeDb);
beforeEach(() => {
  ctx.cart = [];
  ctx.redirected = null;
});

describe("POST /api/cart", () => {
  it("adds a product and answers only with what changed", async () => {
    const p = await createProduct();
    const res = await add(p.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, message: "أضيفت إلى السلة", count: 1, signature: p.id });
    expect(ctx.cart).toEqual([p.id]);
  });

  it("does not add a product twice", async () => {
    const p = await createProduct();
    await add(p.id);
    const out = await (await add(p.id)).json();
    expect(out).toMatchObject({ ok: true, message: "المنتج موجود في سلتك", count: 1 });
    expect(ctx.cart).toEqual([p.id]);
  });

  it("gives the same signature for the same products in any order", async () => {
    const [a, b] = [await createProduct(), await createProduct()];
    await add(a.id);
    const first = await (await add(b.id)).json();
    ctx.cart = [];
    await add(b.id);
    const second = await (await add(a.id)).json();
    expect(first.count).toBe(2);
    expect(second.signature).toBe(first.signature);
  });

  it.each([
    ["another site", { origin: "https://evil.example" }],
    ["no origin at all", {}],
  ])("refuses %s and leaves the cart alone", async (_n, headers) => {
    const p = await createProduct();
    const res = await send(JSON.stringify({ productId: p.id }), headers as Record<string, string>);
    expect(res.status).toBe(403);
    expect(ctx.cart).toEqual([]);
  });

  it("refuses an oversized body before parsing it", async () => {
    const res = await send(JSON.stringify({ productId: "x".repeat(5000) }));
    expect(res.status).toBe(413);
  });

  it.each([
    ["broken json", "{not json"],
    ["a missing id", "{}"],
    ["an id of the wrong type", '{"productId":7}'],
  ])("refuses %s", async (_n, body) => {
    const res = await send(body);
    expect(res.status).toBe(400);
    expect(ctx.cart).toEqual([]);
  });

  it("does not accept something that is not a product id", async () => {
    const out = await (await add("not-a-uuid")).json();
    expect(out).toMatchObject({ ok: false, message: "منتج غير صحيح" });
    expect(ctx.cart).toEqual([]);
  });

  it("reads the database: a product that does not exist or was hidden does not enter the cart", async () => {
    expect(await (await add(ID)).json()).toMatchObject({ ok: false, message: "هذا المنتج غير متاح حاليًا" });
    const p = await createProduct();
    await sql`update products set status = 'hidden' where id = ${p.id}`;
    expect(await (await add(p.id)).json()).toMatchObject({ ok: false, message: "هذا المنتج غير متاح حاليًا" });
    expect(ctx.cart).toEqual([]);
  });

  it("does not sell a product whose sale has ended", async () => {
    const p = await createVideoProduct({ accessMode: "until_date", accessUntil: new Date(Date.now() - 86_400_000) });
    expect(await (await add(p.id)).json()).toMatchObject({ ok: false, message: "انتهى بيع هذا المنتج" });
    expect(ctx.cart).toEqual([]);
  });

  it("swallows contained items when a bundle is added, and refuses them afterwards", async () => {
    const note = await createProduct();
    const bundle = await createContainer({ items: [note.id] });
    await add(note.id);
    const out = await (await add(bundle.id)).json();
    expect(out).toMatchObject({ ok: true, message: "أضيفت إلى السلة وأزلنا المحتويات المضمّنة فيها", count: 1, signature: bundle.id });
    expect(ctx.cart).toEqual([bundle.id]);
    expect(await (await add(note.id)).json()).toMatchObject({ ok: false, message: "هذا المحتوى مضمّن في باقة موجودة في سلتك" });
    expect(ctx.cart).toEqual([bundle.id]);
  });

  it("counts what the cookie will hold, not what was asked for", async () => {
    ctx.cart = Array.from({ length: 30 }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`);
    const p = await createProduct();
    const out = await (await add(p.id)).json();
    expect(out.count).toBe(30);
  });
});

describe("the form path without JavaScript", () => {
  const form = (v: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, x] of Object.entries(v)) fd.set(k, x);
    return fd;
  };

  it("adds and answers with a message", async () => {
    const p = await createProduct();
    await expect(addToCartAction(null, form({ productId: p.id }))).resolves.toEqual({ ok: true, message: "أضيفت إلى السلة" });
    expect(ctx.cart).toEqual([p.id]);
  });

  it("goes to checkout for buy now", async () => {
    const p = await createProduct();
    await expect(addToCartAction(null, form({ productId: p.id, buyNow: "1" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(ctx.redirected).toBe("/checkout");
    expect(ctx.cart).toEqual([p.id]);
  });

  it("stays on the page when the product cannot be bought", async () => {
    await expect(addToCartAction(null, form({ productId: ID, buyNow: "1" }))).resolves.toEqual({ error: "هذا المنتج غير متاح حاليًا" });
    expect(ctx.redirected).toBeNull();
  });
});
