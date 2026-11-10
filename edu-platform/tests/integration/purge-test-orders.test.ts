import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createOrder, markOrderPaid, type OrderRow } from "@/server/commerce/orders";
import { hasProductAccess } from "@/server/access/entitlements";
import { getDb } from "@/server/db";
import { PurgeRefusedError, parsePurgeArgs, purgeRefusalReason, purgeTestOrders } from "../../scripts/purge-test-orders";
import { closeDb, resetDb, sql } from "../helpers/db";
import { activeEntitlements, createBundle, createCoupon, createProduct, createTeacher, createUser, createVideoProduct } from "../helpers/factories";
import { TEST_DATABASE_URL } from "../test-env";

const run = promisify(execFile);
const apply = { apply: true };
const dry = { apply: false };

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closeDb();
});

const pay = (order: OrderRow) => sql.begin((tx) => markOrderPaid(tx, { orderId: order.id, paidAmountFils: order.total_fils }));

async function openPayment(orderId: string, status: "initiated" | "pending" | "paid" | "failed", totalFils: number) {
  await sql`insert into payments (order_id, provider, environment, status, amount_fils) values (${orderId}, 'myfatoorah', 'sandbox', ${status}, ${totalFils})`;
}

/** لقطة كاملة لكل ما يمكن أن يلمسه التنظيف */
async function snapshot() {
  const orders = await sql`select id, status, is_test, paid_at from orders order by id`;
  const payments = await sql`select id, status from payments order by id`;
  const entitlements = await sql`select id, user_id, product_id, order_id, source, via_bundle_id, revoked_at from entitlements order by id`;
  const redemptions = await sql`select coupon_id, order_id from coupon_redemptions order by order_id`;
  const logs = await sql`select count(*)::int as n from audit_logs where action = 'payments.purge_test_orders'`;
  return JSON.stringify({ orders, payments, entitlements, redemptions, logs });
}

/** طلب تجريبي مدفوع بكوبون + طلب تجريبي مفتوح + طلب حقيقي مدفوع */
async function scenario() {
  const student = await createUser();
  const testProduct = await createProduct({ priceFils: 2000 });
  const realProduct = await createProduct({ priceFils: 2500 });
  const coupon = await createCoupon({ kind: "percent", value: 10 });
  const testPaid = await createOrder({ user: student, productIds: [testProduct.id], couponCode: coupon.code, isTest: true });
  await pay(testPaid);
  const realPaid = await createOrder({ user: student, productIds: [realProduct.id], isTest: false });
  await pay(realPaid);

  const other = await createUser();
  const openProduct = await createProduct({ priceFils: 1000 });
  const testOpen = await createOrder({ user: other, productIds: [openProduct.id], isTest: true });
  await openPayment(testOpen.id, "pending", testOpen.total_fils);
  const testFailed = await createOrder({ user: other, productIds: [openProduct.id], isTest: true });
  await sql`update orders set status = 'failed' where id = ${testFailed.id}`;
  await openPayment(testFailed.id, "failed", testFailed.total_fils);
  const realOpen = await createOrder({ user: other, productIds: [openProduct.id], isTest: false });
  await openPayment(realOpen.id, "pending", realOpen.total_fils);
  return { student, other, testProduct, realProduct, openProduct, coupon, testPaid, realPaid, testOpen, testFailed, realOpen };
}

const status = async (id: string) => (await sql<{ status: string }[]>`select status from orders where id = ${id}`)[0].status;
const payStatus = async (orderId: string) => (await sql<{ status: string }[]>`select status from payments where order_id = ${orderId}`).map((p) => p.status);

describe("purgeTestOrders", () => {
  it("dry-run is the default, reports the plan and changes nothing", async () => {
    await scenario();
    const before = await snapshot();
    const out = await purgeTestOrders(getDb(), dry);
    expect(out).toEqual({ database: expect.stringMatching(/test/), applied: false, testOrders: 3, revokedEntitlements: 1, keptEntitlements: 0, closedOrders: 2, closedPaidOrders: 1, reversedEarnings: 0, expiredPayments: 1, deletedRedemptions: 1 });
    expect(await snapshot()).toBe(before);
    expect(parsePurgeArgs([])).toEqual({ apply: false, confirmDatabase: null });
  });

  it("--apply revokes test access, closes open test orders, removes their redemptions and leaves real orders alone", async () => {
    const s = await scenario();
    const out = await purgeTestOrders(getDb(), apply);
    expect(out).toMatchObject({ applied: true, testOrders: 3, revokedEntitlements: 1, keptEntitlements: 0, closedOrders: 2, closedPaidOrders: 1, reversedEarnings: 0, expiredPayments: 1, deletedRedemptions: 1 });

    expect(await activeEntitlements(s.student.id)).toEqual([s.realProduct.id]);
    expect(await hasProductAccess(s.student.id, s.testProduct.id)).toBe(false);
    const [revoked] = await sql<{ revoke_reason: string; revoked_at: Date }[]>`select revoke_reason, revoked_at from entitlements where order_id = ${s.testPaid.id}`;
    expect(revoked.revoke_reason).toBe("purge of test orders");

    expect(await status(s.testOpen.id)).toBe("cancelled");
    expect(await status(s.testFailed.id)).toBe("cancelled");
    expect(await payStatus(s.testOpen.id)).toEqual(["expired"]);
    expect(await payStatus(s.testFailed.id)).toEqual(["failed"]);
    // تغيّر عمدًا (K019): الطلب التجريبي المدفوع يُغلق كاملًا، فلا يبقى طلب تجريبي مفتوح الأثر قبل الدفع الحقيقي
    expect(await status(s.testPaid.id)).toBe("cancelled");

    expect(await status(s.realPaid.id)).toBe("paid");
    expect(await status(s.realOpen.id)).toBe("pending");
    expect(await payStatus(s.realOpen.id)).toEqual(["pending"]);

    expect(await sql`select 1 from coupon_redemptions where order_id = ${s.testPaid.id}`).toHaveLength(0);
    const logs = await sql<{ actor_id: string | null; metadata: { applied: boolean; revokedEntitlements: number } }[]>`select actor_id, metadata from audit_logs where action = 'payments.purge_test_orders'`;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actor_id: null, metadata: { applied: true, revokedEntitlements: 1 } });
  });

  it("frees the coupon limit that test orders had used", async () => {
    const student = await createUser();
    const product = await createProduct({ priceFils: 2000 });
    const coupon = await createCoupon({ kind: "percent", value: 10, maxRedemptions: 1 });
    const testOrder = await createOrder({ user: student, productIds: [product.id], couponCode: coupon.code, isTest: true });
    await pay(testOrder);
    const buyer = await createUser();
    await expect(createOrder({ user: buyer, productIds: [product.id], couponCode: coupon.code, isTest: false })).rejects.toThrow();
    await purgeTestOrders(getDb(), apply);
    await expect(createOrder({ user: buyer, productIds: [product.id], couponCode: coupon.code, isTest: false })).resolves.toBeTruthy();
  });

  it("a product the student also bought for real keeps its access and moves to the real order", async () => {
    const student = await createUser();
    const product = await createProduct({ priceFils: 2000 });
    const testOrder = await createOrder({ user: student, productIds: [product.id], isTest: true });
    await pay(testOrder);
    const realOrder = await createOrder({ user: student, productIds: [(await createProduct({ priceFils: 1 })).id], isTest: false });
    await sql`insert into order_items (order_id, product_id, title, product_type, unit_price_fils) values (${realOrder.id}, ${product.id}, 'x', 'final_notes', 2000)`;
    await sql`update orders set status = 'paid', paid_at = now(), total_fils = 2001, subtotal_fils = 2001 where id = ${realOrder.id}`;

    const out = await purgeTestOrders(getDb(), apply);
    expect(out).toMatchObject({ revokedEntitlements: 0, keptEntitlements: 1 });
    expect(await activeEntitlements(student.id)).toEqual([product.id]);
    const [e] = await sql<{ order_id: string; source: string; via_bundle_id: string | null }[]>`select order_id, source, via_bundle_id from entitlements where product_id = ${product.id}`;
    expect(e).toEqual({ order_id: realOrder.id, source: "purchase", via_bundle_id: null });
  });

  it("a product covered by a real paid bundle is also kept, through the bundle", async () => {
    const student = await createUser();
    const item = await createProduct({ priceFils: 2000 });
    const bundle = await createBundle({ items: [item.id], priceFils: 2500 });
    const testOrder = await createOrder({ user: student, productIds: [item.id], isTest: true });
    await pay(testOrder);
    const realOrder = await createOrder({ user: student, productIds: [(await createProduct({ priceFils: 1 })).id], isTest: false });
    await sql`insert into order_items (order_id, product_id, title, product_type, unit_price_fils) values (${realOrder.id}, ${bundle.id}, 'b', 'bundle', 2500)`;
    await sql`update orders set status = 'paid', paid_at = now() where id = ${realOrder.id}`;

    expect(await purgeTestOrders(getDb(), apply)).toMatchObject({ revokedEntitlements: 0, keptEntitlements: 1 });
    const [e] = await sql<{ order_id: string; source: string; via_bundle_id: string }[]>`select order_id, source, via_bundle_id from entitlements where product_id = ${item.id}`;
    expect(e).toEqual({ order_id: realOrder.id, source: "bundle", via_bundle_id: bundle.id });
  });

  it("a real order that was refunded does not protect access from a test order", async () => {
    const student = await createUser();
    const product = await createProduct({ priceFils: 2000 });
    const testOrder = await createOrder({ user: student, productIds: [product.id], isTest: true });
    await pay(testOrder);
    const realOrder = await createOrder({ user: student, productIds: [(await createProduct({ priceFils: 1 })).id], isTest: false });
    await sql`insert into order_items (order_id, product_id, title, product_type, unit_price_fils) values (${realOrder.id}, ${product.id}, 'x', 'final_notes', 2000)`;
    await sql`update orders set status = 'refunded' where id = ${realOrder.id}`;
    expect(await purgeTestOrders(getDb(), apply)).toMatchObject({ revokedEntitlements: 1, keptEntitlements: 0 });
  });

  it("never touches access granted manually or by real orders", async () => {
    const student = await createUser();
    const product = await createProduct({ priceFils: 2000 });
    const real = await createOrder({ user: student, productIds: [product.id], isTest: false });
    await pay(real);
    const manual = await createProduct({ priceFils: 2000 });
    await sql`insert into entitlements (user_id, product_id, source) values (${student.id}, ${manual.id}, 'manual')`;
    const before = await snapshot();
    expect(await purgeTestOrders(getDb(), apply)).toMatchObject({ testOrders: 0, revokedEntitlements: 0, closedOrders: 0, expiredPayments: 0, deletedRedemptions: 0 });
    expect(await snapshot()).toBe(before);
  });

  it("is safe to run twice", async () => {
    await scenario();
    await purgeTestOrders(getDb(), apply);
    const before = await snapshot();
    expect(await purgeTestOrders(getDb(), apply)).toMatchObject({ revokedEntitlements: 0, keptEntitlements: 0, closedOrders: 0, expiredPayments: 0, deletedRedemptions: 0 });
    expect(await snapshot()).toBe(before);
  });
});

describe("closing test orders completely", () => {
  it("records when and why an open test order was closed", async () => {
    const s = await scenario();
    await purgeTestOrders(sql, apply);
    const [open] = await sql<{ status: string; closed_at: Date | null; closed_reason: string | null }[]>`select status, closed_at, closed_reason from orders where id = ${s.testOpen.id}`;
    expect(open.status).toBe("cancelled");
    expect(open.closed_at).not.toBeNull();
    expect(open.closed_reason).toBe("expired");
  });

  it("closes a paid test order, keeps when it was paid, and reverses its earnings", async () => {
    const student = await createUser();
    const teacher = await createTeacher({ mode: "self_managed", shareBps: 5000 });
    const product = await createVideoProduct({ teacherId: teacher.id, priceFils: 2000 });
    const order = await createOrder({ user: student, productIds: [product.id], isTest: true });
    await pay(order);
    expect(await purgeTestOrders(sql, apply)).toMatchObject({ closedPaidOrders: 1, reversedEarnings: 1 });
    const [row] = await sql<{ status: string; closed_at: Date | null; closed_reason: string | null; paid_at: Date | null }[]>`select status, closed_at, closed_reason, paid_at from orders where id = ${order.id}`;
    expect(row).toMatchObject({ status: "cancelled", closed_reason: null });
    expect(row.closed_at).not.toBeNull();
    expect(row.paid_at).not.toBeNull();
    expect(await sql`select status from teacher_earnings where order_id = ${order.id}`).toEqual([{ status: "reversed" }]);
    expect(await activeEntitlements(student.id)).toEqual([]);
  });

  it("releases the claim on a payment it expires", async () => {
    const s = await scenario();
    await sql`update payments set reconcile_claimed_at = now() where order_id = ${s.testOpen.id}`;
    await purgeTestOrders(sql, apply);
    expect(await sql`select status, reconcile_claimed_at from payments where order_id = ${s.testOpen.id}`).toEqual([{ status: "expired", reconcile_claimed_at: null }]);
  });

  it("leaves a real open order alone", async () => {
    const s = await scenario();
    await purgeTestOrders(sql, apply);
    const [row] = await sql<{ status: string; closed_at: Date | null }[]>`select status, closed_at from orders where id = ${s.realOpen.id}`;
    expect(row).toEqual({ status: "pending", closed_at: null });
  });

  it("refuses, and changes nothing, when a test order carries a live payment", async () => {
    const s = await scenario();
    await sql`update payments set environment = 'live' where order_id = ${s.testOpen.id}`;
    const before = await snapshot();
    await expect(purgeTestOrders(sql, apply)).rejects.toBeInstanceOf(PurgeRefusedError);
    await expect(purgeTestOrders(sql, dry)).rejects.toBeInstanceOf(PurgeRefusedError);
    expect(await snapshot()).toBe(before);
  });

  it("is not stopped by a live payment on a real order", async () => {
    const s = await scenario();
    await sql`update payments set environment = 'live' where order_id = ${s.realOpen.id}`;
    await expect(purgeTestOrders(sql, apply)).resolves.toMatchObject({ applied: true });
  });
});

describe("refusing unless the intent is clear", () => {
  it("database names", () => {
    for (const name of ["edu_r_test", "edu_test", "edu_r_e2e", "farqad_sandbox", "staging", "app-dev", "local_db"]) expect(purgeRefusalReason(name)).toBeNull();
    for (const name of ["postgres", "farqad", "farqad_prod", "latest", "contest_db", "devices", "e2eish"]) expect(purgeRefusalReason(name)).toMatch(/does not look like a test database/);
  });

  it("the explicit flag must name the exact database, and overrides the name check only then", () => {
    expect(purgeRefusalReason("postgres", "postgres")).toBeNull();
    expect(purgeRefusalReason("postgres", "Postgres")).toMatch(/does not match/);
    expect(purgeRefusalReason("edu_r_test", "something_else")).toMatch(/does not match/);
  });

  it("--apply with a wrong confirmation changes nothing; a dry-run never needs one", async () => {
    await scenario();
    const before = await snapshot();
    await expect(purgeTestOrders(getDb(), { apply: true, confirmDatabase: "postgres" })).rejects.toBeInstanceOf(PurgeRefusedError);
    expect(await snapshot()).toBe(before);
    await expect(purgeTestOrders(getDb(), { apply: false, confirmDatabase: "postgres" })).resolves.toMatchObject({ applied: false });
  });

  it("an unknown or incomplete argument is refused rather than ignored", () => {
    expect(parsePurgeArgs(["--apply", "--confirm-database", "postgres"])).toEqual({ apply: true, confirmDatabase: "postgres" });
    expect(parsePurgeArgs(["--confirm-database=postgres"])).toEqual({ apply: false, confirmDatabase: "postgres" });
    for (const args of [["--aply"], ["--confirm-database"], ["--confirm-database", "--apply"], ["--confirm-database="]]) expect(() => parsePurgeArgs(args)).toThrow(PurgeRefusedError);
  });
});

describe("the command line", () => {
  const cli = async (args: string[]) => {
    // مجلد مؤقت حتى لا يقرأ السكربت أي ملف بيئة، وقاعدة الاختبار صراحةً
    const cwd = mkdtempSync(join(tmpdir(), "purge-cli-"));
    try {
      const tsx = resolve("node_modules/tsx/dist/cli.mjs");
      const script = resolve("scripts/purge-test-orders.ts");
      return await run(process.execPath, [tsx, script, ...args], { cwd, env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, DATABASE_PGBOUNCER: "false" }, timeout: 60_000 });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  };

  it("does nothing without --apply, acts with it, and exits non-zero when refused", async () => {
    const s = await scenario();
    const before = await snapshot();

    const dryRun = await cli([]);
    expect(dryRun.stdout).toContain("Dry run, nothing was changed");
    expect(await snapshot()).toBe(before);

    await expect(cli(["--apply", "--confirm-database", "not_this_one"])).rejects.toMatchObject({ code: 2 });
    expect(await snapshot()).toBe(before);

    const applied = await cli(["--apply"]);
    expect(applied.stdout).toContain('"applied": true');
    expect(applied.stdout).not.toContain("edu_local_pw");
    expect(await status(s.testOpen.id)).toBe("cancelled");
    expect(await hasProductAccess(s.student.id, s.testProduct.id)).toBe(false);
  });
});
