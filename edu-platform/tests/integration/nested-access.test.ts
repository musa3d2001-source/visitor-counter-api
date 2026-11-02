import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accessibleProductIds, accessExpiry, grantProduct, hasProductAccess, revokeProduct } from "@/server/access/entitlements";
import { checkLessonAccess } from "@/server/access/lessons";
import { computeCart } from "@/server/commerce/cart";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createContainer, createProduct, createUser, createVideoProduct } from "../helpers/factories";

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await closeDb();
});

const buy = (userId: string, productId: string) => sql.begin((tx) => grantProduct(tx, { userId, productId, source: "purchase" }));

async function tree() {
  const l1 = await createVideoProduct({ type: "video_lesson", lessons: 1, priceFils: 1000 });
  const l2 = await createVideoProduct({ type: "video_lesson", lessons: 1, priceFils: 1000 });
  const unit = await createContainer({ type: "unit", items: [l1.id, l2.id], priceFils: 1500 });
  const quiz = await createVideoProduct({ type: "quiz_review", lessons: 2, priceFils: 1200 });
  const course = await createContainer({ type: "video_course", items: [unit.id, quiz.id], priceFils: 5000 });
  const pdf = await createProduct({ level: 7, subjectSlug: "science", priceFils: 2000 });
  const bundle = await createContainer({ type: "bundle", items: [course.id, pdf.id], priceFils: 6000 });
  return { l1, l2, unit, quiz, course, pdf, bundle };
}

describe("الاحتواء المتداخل: باقة ← دورة ← وحدة ← دروس منفردة", () => {
  it("buyer of the bundle can access every level, including lessons inside", async () => {
    const t = await tree();
    const u = await createUser();
    await buy(u.id, t.bundle.id);
    for (const p of [t.bundle, t.course, t.unit, t.l1, t.l2, t.quiz, t.pdf]) expect(await hasProductAccess(u.id, p.id)).toBe(true);
    const ids = await accessibleProductIds(u.id);
    expect(ids.size).toBe(7);
    const lesson = await checkLessonAccess(t.l1.lessonIds[0], u);
    expect(lesson).toMatchObject({ ok: true, via: "owned" });
    const quizLesson = await checkLessonAccess(t.quiz.lessonIds[1], u);
    expect(quizLesson.ok).toBe(true);
  });

  it("buyer of a unit gets only that unit and its lessons", async () => {
    const t = await tree();
    const u = await createUser();
    await buy(u.id, t.unit.id);
    expect(await hasProductAccess(u.id, t.l1.id)).toBe(true);
    expect(await hasProductAccess(u.id, t.l2.id)).toBe(true);
    for (const p of [t.course, t.bundle, t.quiz, t.pdf]) expect(await hasProductAccess(u.id, p.id)).toBe(false);
    expect((await checkLessonAccess(t.quiz.lessonIds[0], u)).ok).toBe(false);
  });

  it("content added to a container later becomes accessible to existing buyers", async () => {
    const t = await tree();
    const bundleBuyer = await createUser();
    const unitBuyer = await createUser();
    await buy(bundleBuyer.id, t.bundle.id);
    await buy(unitBuyer.id, t.unit.id);
    const l3 = await createVideoProduct({ type: "video_lesson", lessons: 1 });
    expect(await hasProductAccess(unitBuyer.id, l3.id)).toBe(false);
    await sql`insert into bundle_items (bundle_id, product_id, sort_order) values (${t.unit.id}, ${l3.id}, 9)`;
    expect(await hasProductAccess(unitBuyer.id, l3.id)).toBe(true);
    expect(await hasProductAccess(bundleBuyer.id, l3.id)).toBe(true);
  });

  it("items removed from a container stay with buyers (snapshot), revoking the container removes them", async () => {
    const t = await tree();
    const u = await createUser();
    await buy(u.id, t.bundle.id);
    await sql`delete from bundle_items where bundle_id = ${t.unit.id} and product_id = ${t.l2.id}`;
    expect(await hasProductAccess(u.id, t.l2.id)).toBe(true);
    const n = await revokeProduct(sql, { userId: u.id, productId: t.bundle.id, revokedBy: null, reason: "اختبار" });
    expect(n).toBeGreaterThanOrEqual(7);
    expect(await hasProductAccess(u.id, t.l1.id)).toBe(false);
    expect(await hasProductAccess(u.id, t.l2.id)).toBe(false);
  });

  it("a direct purchase is kept when a covering bundle is revoked", async () => {
    const t = await tree();
    const u = await createUser();
    await buy(u.id, t.l1.id);
    await buy(u.id, t.bundle.id);
    await revokeProduct(sql, { userId: u.id, productId: t.bundle.id, revokedBy: null, reason: "اختبار" });
    expect(await hasProductAccess(u.id, t.l1.id)).toBe(true);
    expect(await hasProductAccess(u.id, t.l2.id)).toBe(false);
  });

  it("the database rejects cycles and any chain longer than 4 levels (container ancestors + item subtree)", async () => {
    const t = await tree();
    await expect(sql`insert into bundle_items (bundle_id, product_id) values (${t.unit.id}, ${t.bundle.id})`).rejects.toThrow(/cycle/);
    // شجرة الباقة: bundle(1) ← course(2) ← unit(3) ← l1(4) — مكتملة العمق؛ تغليفها بباقة أخرى يصنع 5 مستويات
    const outer = await createContainer({ type: "bundle", items: [] });
    await expect(sql`insert into bundle_items (bundle_id, product_id) values (${outer.id}, ${t.bundle.id})`).rejects.toThrow(/too deep/);
    // الحالة المكتشفة: إرفاق شجرة (unit ← درس) تحت وحدة تقع أصلًا في المستوى 3 ⇒ 3 + 2 = 5 مرفوض
    const deepUnit = await createContainer({ type: "unit", items: [t.l2.id] });
    await expect(sql`insert into bundle_items (bundle_id, product_id) values (${t.unit.id}, ${deepUnit.id})`).rejects.toThrow(/too deep/);
    // بينما إرفاق وحدة جديدة تحت الدورة (2 + 1 = 3) مسموح
    const extra = await createContainer({ type: "unit", items: [] });
    await sql`insert into bundle_items (bundle_id, product_id) values (${t.course.id}, ${extra.id})`;
  });
});

describe("السلة: لا دفع مزدوج لمحتوى مضمّن بأي عمق", () => {
  it("items covered by a container in the cart are not charged", async () => {
    const t = await tree();
    const cart = await computeCart([t.l1.id, t.bundle.id, t.pdf.id], null);
    expect(cart.payableLines.map((l) => l.id)).toEqual([t.bundle.id]);
    expect(cart.subtotalFils).toBe(6000);
    const l1 = cart.lines.find((l) => l.id === t.l1.id)!;
    expect(l1.coveredByBundleId).toBe(t.bundle.id);
    expect(cart.notices.join(" ")).toContain("لن يُحتسب مرتين");
  });

  it("a unit and one of its lessons → only the unit is payable", async () => {
    const t = await tree();
    const cart = await computeCart([t.unit.id, t.l2.id], null);
    expect(cart.payableLines.map((l) => l.id)).toEqual([t.unit.id]);
  });

  it("items the student already owns through a container are excluded", async () => {
    const t = await tree();
    const u = await createUser();
    await buy(u.id, t.course.id);
    const cart = await computeCart([t.l1.id, t.pdf.id], u.id);
    expect(cart.payableLines.map((l) => l.id)).toEqual([t.pdf.id]);
    expect(cart.lines.find((l) => l.id === t.l1.id)?.owned).toBe(true);
  });
});

describe("فترات الإتاحة", () => {
  it("access_mode 'days' sets expires_at at purchase time", async () => {
    const p = await createVideoProduct({ accessMode: "days", accessDays: 30 });
    const u = await createUser();
    const res = await buy(u.id, p.id);
    const expected = Date.now() + 30 * 86400_000;
    expect(Math.abs(res.expiresAt!.getTime() - expected)).toBeLessThan(60_000);
    const [e] = await sql<{ expires_at: Date }[]>`select expires_at from entitlements where user_id = ${u.id} and product_id = ${p.id}`;
    expect(Math.abs(new Date(e.expires_at).getTime() - expected)).toBeLessThan(60_000);
  });

  it("access_mode 'until_date' uses the configured date (e.g. end of term)", async () => {
    const until = new Date(Date.now() + 90 * 86400_000);
    const p = await createVideoProduct({ accessMode: "until_date", accessUntil: until });
    const u = await createUser();
    await buy(u.id, p.id);
    expect((await accessExpiry(u.id, p.id)).expiresAt?.getTime()).toBe(until.getTime());
  });

  it("expired access is denied and excluded; re-purchase reactivates it", async () => {
    const p = await createVideoProduct({ accessMode: "days", accessDays: 10 });
    const u = await createUser();
    await buy(u.id, p.id);
    await sql`update entitlements set expires_at = now() - interval '1 minute' where user_id = ${u.id}`;
    expect(await hasProductAccess(u.id, p.id)).toBe(false);
    expect((await accessibleProductIds(u.id)).has(p.id)).toBe(false);
    expect((await checkLessonAccess(p.lessonIds[0], u)).ok).toBe(false);
    // يمكن شراؤه مجددًا (لا يُعتبر مملوكًا في السلة)
    const cart = await computeCart([p.id], u.id);
    expect(cart.payableLines).toHaveLength(1);
    await buy(u.id, p.id);
    expect(await hasProductAccess(u.id, p.id)).toBe(true);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from entitlements where user_id = ${u.id}`;
    expect(n).toBe(1);
  });

  it("changing a product's access settings later does not change existing buyers", async () => {
    const p = await createVideoProduct({ accessMode: "unlimited" });
    const u = await createUser();
    await buy(u.id, p.id);
    await sql`update products set access_mode = 'days', access_days = 1 where id = ${p.id}`;
    const [e] = await sql<{ expires_at: Date | null }[]>`select expires_at from entitlements where user_id = ${u.id}`;
    expect(e.expires_at).toBeNull();
    expect(await hasProductAccess(u.id, p.id)).toBe(true);
  });

  it("legacy entitlements (expires_at null) keep unlimited access", async () => {
    const p = await createProduct({ level: 7, subjectSlug: "science" });
    const u = await createUser();
    await sql`insert into entitlements (user_id, product_id, source) values (${u.id}, ${p.id}, 'purchase')`;
    expect(await hasProductAccess(u.id, p.id)).toBe(true);
    expect(await accessExpiry(u.id, p.id)).toEqual({ has: true, expiresAt: null });
  });

  it("a container's expiry applies to its contents; a longer grant upgrades, a shorter one never downgrades", async () => {
    const lesson = await createVideoProduct({ type: "video_lesson", lessons: 1 });
    const unit = await createContainer({ type: "unit", items: [lesson.id], accessMode: "days", accessDays: 5 });
    const u = await createUser();
    await buy(u.id, unit.id);
    const exp1 = (await accessExpiry(u.id, lesson.id)).expiresAt!;
    expect(exp1.getTime()).toBeGreaterThan(Date.now());
    // منح يدوي غير محدد ← ترقية
    await sql.begin((tx) => grantProduct(tx, { userId: u.id, productId: lesson.id, source: "manual", expiresAt: null }));
    expect((await accessExpiry(u.id, lesson.id)).expiresAt).toBeNull();
    // منح أقصر لا يخفض
    await sql.begin((tx) => grantProduct(tx, { userId: u.id, productId: lesson.id, source: "manual", expiresAt: new Date(Date.now() + 86400_000) }));
    const [e] = await sql<{ expires_at: Date | null }[]>`select expires_at from entitlements where user_id = ${u.id} and product_id = ${lesson.id}`;
    expect(e.expires_at).toBeNull();
  });

  it("when the container expires, contents granted through it expire too", async () => {
    const lesson = await createVideoProduct({ type: "video_lesson", lessons: 1 });
    const bundle = await createContainer({ type: "bundle", items: [lesson.id], accessMode: "until_date", accessUntil: new Date(Date.now() + 86400_000) });
    const u = await createUser();
    await buy(u.id, bundle.id);
    expect(await hasProductAccess(u.id, lesson.id)).toBe(true);
    await sql`update entitlements set expires_at = now() - interval '1 second' where user_id = ${u.id}`;
    expect(await hasProductAccess(u.id, lesson.id)).toBe(false);
    expect((await accessibleProductIds(u.id)).size).toBe(0);
  });
});
