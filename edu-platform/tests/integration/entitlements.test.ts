import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  accessibleProductIds,
  adminGrant,
  adminRevoke,
  checkFileAccess,
  getLibrary,
  grantProduct,
  hasProductAccess,
  revokeProduct,
} from "@/server/access/entitlements";
import { checkLessonAccess } from "@/server/access/lessons";
import { createOrder, markOrderPaid } from "@/server/commerce/orders";
import { applyAcceptedRefund } from "../helpers/payment-flow";
import { closeDb, resetDb, sql } from "../helpers/db";
import { activeEntitlements, createBundle, createProduct, createUser } from "../helpers/factories";

beforeAll(resetDb);
afterAll(closeDb);

async function buy(userId: string, productIds: string[]) {
  const [u] = await sql<{ id: string; email: string; full_name: string; phone: string | null; role: "student"; grade_id: string | null; is_active: boolean }[]>`
    select * from users where id = ${userId}
  `;
  const user = { id: u.id, email: u.email, fullName: u.full_name, phone: u.phone, role: u.role, gradeId: u.grade_id, isActive: u.is_active };
  const order = await createOrder({ user, productIds, isTest: false });
  await sql.begin((tx) => markOrderPaid(tx, { orderId: order.id, paidAmountFils: order.total_fils }));
  return order;
}

describe("bundles", () => {
  it("buying a bundle grants the bundle + snapshot of its items (no duplicates)", async () => {
    const u = await createUser();
    const p1 = await createProduct();
    const p2 = await createProduct({ subjectSlug: "science" });
    const bundle = await createBundle({ items: [p1.id, p2.id] });
    await buy(u.id, [bundle.id]);
    expect(await activeEntitlements(u.id)).toEqual([bundle.id, p1.id, p2.id].sort());
    const rows = await sql<{ product_id: string; source: string; via_bundle_id: string | null }[]>`
      select product_id, source, via_bundle_id from entitlements where user_id = ${u.id} and product_id <> ${bundle.id}
    `;
    for (const r of rows) expect(r).toMatchObject({ source: "bundle", via_bundle_id: bundle.id });
    // منح الباقة مرة ثانية لا يكرر شيئًا
    const again = await grantProduct(sql, { userId: u.id, productId: bundle.id, source: "manual" });
    expect(again.granted).toEqual([]);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from entitlements where user_id = ${u.id}`;
    expect(n).toBe(3);
  });

  it("items added to a bundle later become accessible automatically; removed items stay accessible", async () => {
    const u = await createUser();
    const p1 = await createProduct();
    const later = await createProduct({ subjectSlug: "arabic" });
    const bundle = await createBundle({ items: [p1.id] });
    await buy(u.id, [bundle.id]);
    expect(await hasProductAccess(u.id, later.id)).toBe(false);
    await sql`insert into bundle_items (bundle_id, product_id) values (${bundle.id}, ${later.id})`;
    expect(await hasProductAccess(u.id, later.id)).toBe(true);
    expect((await accessibleProductIds(u.id)).has(later.id)).toBe(true);
    await sql`delete from bundle_items where bundle_id = ${bundle.id} and product_id = ${p1.id}`;
    expect(await hasProductAccess(u.id, p1.id)).toBe(true); // نسخة الصلاحية المحفوظة عند الشراء
  });

  it("revoking a bundle revokes its bundle-derived items but keeps direct purchases", async () => {
    const u = await createUser();
    const direct = await createProduct();
    const viaBundle = await createProduct({ subjectSlug: "science" });
    const bundle = await createBundle({ items: [direct.id, viaBundle.id] });
    await grantProduct(sql, { userId: u.id, productId: direct.id, source: "purchase" });
    await grantProduct(sql, { userId: u.id, productId: bundle.id, source: "purchase" });
    const n = await revokeProduct(sql, { userId: u.id, productId: bundle.id, revokedBy: null, reason: "اختبار" });
    expect(n).toBe(2);
    expect(await hasProductAccess(u.id, bundle.id)).toBe(false);
    expect(await hasProductAccess(u.id, viaBundle.id)).toBe(false);
    expect(await hasProductAccess(u.id, direct.id)).toBe(true);
  });

  it("containers may nest (bundle ← course) but cycles and PDF containers are rejected by the database", async () => {
    const p = await createProduct();
    const inner = await createBundle({ items: [p.id] });
    const outer = await createBundle({ items: [] });
    // التداخل مسموح الآن (باقة شاملة تضم باقة/دورة)
    await sql`insert into bundle_items (bundle_id, product_id) values (${outer.id}, ${inner.id})`;
    // الحلقات ممنوعة
    await expect(sql`insert into bundle_items (bundle_id, product_id) values (${inner.id}, ${outer.id})`).rejects.toThrow(/cycle/);
    // منتج PDF لا يكون حاوية
    const other = await createProduct();
    await expect(sql`insert into bundle_items (bundle_id, product_id) values (${other.id}, ${p.id})`).rejects.toThrow(/container must be/);
    // المشتري للباقة الخارجية يصل للمحتوى المتداخل
    const u = await createUser();
    await sql.begin((tx) => grantProduct(tx, { userId: u.id, productId: outer.id, source: "purchase" }));
    expect(await hasProductAccess(u.id, p.id)).toBe(true);
  });
});

describe("admin grant / revoke with audit trail", () => {
  it("grants, revokes and re-grants with reasons logged", async () => {
    const admin = await createUser({ role: "admin" });
    const u = await createUser();
    const p = await createProduct();
    await adminGrant({ userId: u.id, productId: p.id, adminId: admin.id, reason: "تعويض عن مشكلة دفع" });
    expect(await hasProductAccess(u.id, p.id)).toBe(true);
    expect(await adminRevoke({ userId: u.id, productId: p.id, adminId: admin.id, reason: "منح بالخطأ" })).toBe(1);
    expect(await hasProductAccess(u.id, p.id)).toBe(false);
    const [e] = await sql<{ revoke_reason: string; revoked_by: string }[]>`select revoke_reason, revoked_by from entitlements where user_id = ${u.id}`;
    expect(e).toEqual({ revoke_reason: "منح بالخطأ", revoked_by: admin.id });
    await adminGrant({ userId: u.id, productId: p.id, adminId: admin.id, reason: "إعادة المنح" });
    expect(await hasProductAccess(u.id, p.id)).toBe(true);
    const logs = await sql<{ action: string; reason: string; actor_id: string }[]>`
      select action, reason, actor_id from audit_logs where entity_type = 'user' and entity_id = ${u.id} order by id
    `;
    expect(logs.map((l) => l.action)).toEqual(["entitlement.grant", "entitlement.revoke", "entitlement.grant"]);
    expect(logs.every((l) => l.actor_id === admin.id && l.reason)).toBe(true);
  });
});

describe("the local effect of an accepted refund", () => {
  it("revokes only the refunded order's entitlements and records refund + audit", async () => {
    const admin = await createUser({ role: "admin" });
    const u = await createUser();
    const a = await createProduct();
    const b = await createProduct({ subjectSlug: "science" });
    const o1 = await buy(u.id, [a.id]);
    await buy(u.id, [b.id]);
    const r = await applyAcceptedRefund(o1.id, admin.id, "طلب العميل");
    expect(r.revoked).toBe(1);
    expect(await hasProductAccess(u.id, a.id)).toBe(false);
    expect(await hasProductAccess(u.id, b.id)).toBe(true);
    const [o] = await sql<{ status: string }[]>`select status from orders where id = ${o1.id}`;
    expect(o.status).toBe("refunded");
    const [ref] = await sql<{ amount_fils: number; status: string }[]>`select amount_fils, status from refunds where order_id = ${o1.id}`;
    expect(ref).toEqual({ amount_fils: o1.total_fils, status: "requested" });
  });

  it("refunding a bundle order revokes bundle items too", async () => {
    const admin = await createUser({ role: "admin" });
    const u = await createUser();
    const p1 = await createProduct();
    const bundle = await createBundle({ items: [p1.id] });
    const o = await buy(u.id, [bundle.id]);
    await applyAcceptedRefund(o.id, admin.id, "استرداد");
    expect(await activeEntitlements(u.id)).toEqual([]);
  });
});

describe("checkFileAccess (server-side authorization, IDOR)", () => {
  it("owner can open, other students cannot, anonymous must log in, admin can", async () => {
    const owner = await createUser();
    const other = await createUser();
    const admin = await createUser({ role: "admin" });
    const p = await createProduct();
    await buy(owner.id, [p.id]);
    expect((await checkFileAccess(p.mainFileId!, owner)).ok).toBe(true);
    expect(await checkFileAccess(p.mainFileId!, other)).toEqual({ ok: false, reason: "forbidden" });
    expect(await checkFileAccess(p.mainFileId!, null)).toEqual({ ok: false, reason: "unauthenticated" });
    expect((await checkFileAccess(p.mainFileId!, admin)).ok).toBe(true);
    // انتحال الدور من العميل غير ممكن لأن الدور يُقرأ من الجلسة — هنا نتحقق أن الدالة تعتمد على role الممرَّر من الخادم فقط
  });

  it("an id that only looks like a uuid is not found, without reaching the database as an error", async () => {
    for (const id of ["-".repeat(36), "0".repeat(36), `${"a".repeat(8)}-${"b".repeat(27)}`]) {
      await expect(checkFileAccess(id, null)).resolves.toEqual({ ok: false, reason: "not_found" });
      await expect(checkLessonAccess(id, null)).resolves.toEqual({ ok: false, reason: "not_found" });
    }
  });

  it("access via bundle works; revoked access is denied", async () => {
    const u = await createUser();
    const p = await createProduct();
    const bundle = await createBundle({ items: [p.id] });
    await grantProduct(sql, { userId: u.id, productId: bundle.id, source: "manual" });
    expect((await checkFileAccess(p.mainFileId!, u)).ok).toBe(true);
    await revokeProduct(sql, { userId: u.id, productId: bundle.id, revokedBy: null, reason: "x" });
    expect(await checkFileAccess(p.mainFileId!, u)).toEqual({ ok: false, reason: "forbidden" });
  });

  it("owned content remains accessible after the product is hidden/archived", async () => {
    const u = await createUser();
    const p = await createProduct();
    await buy(u.id, [p.id]);
    await sql`update products set status = 'archived' where id = ${p.id}`;
    expect((await checkFileAccess(p.mainFileId!, u)).ok).toBe(true);
  });

  it("preview files are public only while the product is published", async () => {
    const admin = await createUser({ role: "admin" });
    const p = await createProduct();
    const r = await checkFileAccess(p.previewFileId!, null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.kind).toBe("preview");
    await sql`update products set status = 'draft' where id = ${p.id}`;
    expect(await checkFileAccess(p.previewFileId!, null)).toEqual({ ok: false, reason: "not_found" });
    expect((await checkFileAccess(p.previewFileId!, admin)).ok).toBe(true);
  });

  it("unknown or malformed file ids → not_found (no info leak)", async () => {
    const u = await createUser();
    expect(await checkFileAccess(randomUUID(), u)).toEqual({ ok: false, reason: "not_found" });
    expect(await checkFileAccess("../../etc/passwd", u)).toEqual({ ok: false, reason: "not_found" });
    expect(await checkFileAccess("1 or 1=1", null)).toEqual({ ok: false, reason: "not_found" });
  });

  it("does not expose storage keys of other products through the library", async () => {
    const u = await createUser();
    const mine = await createProduct();
    await createProduct();
    await buy(u.id, [mine.id]);
    const lib = await getLibrary(u.id);
    expect(lib.items.map((i) => i.productId)).toEqual([mine.id]);
    expect(lib.items[0].files.map((f) => f.id)).toEqual([mine.mainFileId]);
    expect(JSON.stringify(lib)).not.toMatch(/storage_key|products\//);
  });

  it("library groups bundles separately and excludes drafts", async () => {
    const u = await createUser();
    const p1 = await createProduct();
    const draft = await createProduct({ status: "draft" });
    const bundle = await createBundle({ items: [p1.id] });
    await grantProduct(sql, { userId: u.id, productId: bundle.id, source: "manual" });
    await grantProduct(sql, { userId: u.id, productId: draft.id, source: "manual" });
    const lib = await getLibrary(u.id);
    expect(lib.bundles.map((b) => b.id)).toEqual([bundle.id]);
    expect(lib.items.map((i) => i.productId)).toEqual([p1.id]);
  });
});
