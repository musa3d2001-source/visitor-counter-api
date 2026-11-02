import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getBundleItems,
  getProductBySlug,
  getPublishedProductsByIds,
  listGrades,
  listProducts,
  listStages,
  listSubjects,
  bestSellers,
} from "@/server/catalog/queries";
import { DEFAULT_SETTINGS, getSettings, saveSettings } from "@/server/platform/settings";
import { createOrder, markOrderPaid } from "@/server/commerce/orders";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createBundle, createProduct, createUser, gradeAndSubject } from "../helpers/factories";

beforeAll(resetDb);
afterAll(closeDb);

describe("catalog visibility (students never see empty or unpublished sections)", () => {
  it("seed: intermediate stage published (grades 6–9 with 6 subjects); other stages hidden", async () => {
    const stages = await sql<{ slug: string; is_published: boolean }[]>`select slug, is_published from stages order by sort_order`;
    expect(stages).toEqual([
      { slug: "primary", is_published: false },
      { slug: "intermediate", is_published: true },
      { slug: "secondary", is_published: false },
    ]);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from subjects s join grades g on g.id = s.grade_id where g.level between 6 and 9`;
    expect(n).toBe(24);
  });

  it("grades without published products are hidden", async () => {
    expect(await listGrades()).toEqual([]);
    expect((await listStages())[0]?.grades ?? []).toEqual([]);
    await createProduct({ level: 7, subjectSlug: "math" });
    const grades = await listGrades();
    expect(grades.map((g) => g.level)).toEqual([7]);
  });

  it("subjects without published products are hidden; draft products don't count", async () => {
    const { gradeId } = await gradeAndSubject(8, "math");
    await createProduct({ level: 8, subjectSlug: "science", status: "draft" });
    await createProduct({ level: 8, subjectSlug: "english" });
    const subjects = await listSubjects(gradeId);
    expect(subjects.map((s) => s.slug)).toEqual(["english"]);
  });

  it("unpublished subject / grade / stage hides products everywhere", async () => {
    const p = await createProduct({ level: 9, subjectSlug: "arabic" });
    expect(await getProductBySlug(p.slug)).not.toBeNull();
    const { gradeId, subjectId } = await gradeAndSubject(9, "arabic");
    await sql`update subjects set is_published = false where id = ${subjectId}`;
    expect(await getProductBySlug(p.slug)).toBeNull();
    expect(await getProductBySlug(p.slug, { includeUnpublished: true })).not.toBeNull();
    expect(await getPublishedProductsByIds([p.id])).toEqual([]);
    await sql`update subjects set is_published = true where id = ${subjectId}`;
    await sql`update grades set is_published = false where id = ${gradeId}`;
    expect(await getProductBySlug(p.slug)).toBeNull();
    expect((await listProducts({ gradeId })).length).toBe(0);
    await sql`update grades set is_published = true where id = ${gradeId}`;
    await sql`update stages set is_published = false where slug = 'intermediate'`;
    expect(await getProductBySlug(p.slug)).toBeNull();
    await sql`update stages set is_published = true where slug = 'intermediate'`;
    expect(await getProductBySlug(p.slug)).not.toBeNull();
  });

  it("hidden / archived / draft products are not public", async () => {
    for (const status of ["hidden", "archived", "draft"] as const) {
      const p = await createProduct({ status });
      expect(await getProductBySlug(p.slug), status).toBeNull();
    }
  });

  it("bundle items listing shows only published items publicly", async () => {
    const a = await createProduct();
    const b = await createProduct({ status: "hidden" });
    const bundle = await createBundle({ items: [a.id, b.id] });
    expect((await getBundleItems(bundle.id)).map((x) => x.id)).toEqual([a.id]);
    expect((await getBundleItems(bundle.id, { includeUnpublished: true })).map((x) => x.id)).toEqual([a.id, b.id]);
  });

  it("best sellers come only from real paid, non-test orders", async () => {
    await sql`truncate order_items, orders cascade`;
    expect(await bestSellers({})).toEqual([]);
    const user = await createUser();
    const p = await createProduct();
    const testOrder = await createOrder({ user, productIds: [p.id], isTest: true });
    await sql.begin((tx) => markOrderPaid(tx, { orderId: testOrder.id, paidAmountFils: testOrder.total_fils }));
    expect(await bestSellers({})).toEqual([]);
    const other = await createUser();
    const real = await createOrder({ user: other, productIds: [p.id], isTest: false });
    expect(await bestSellers({})).toEqual([]); // pending
    await sql.begin((tx) => markOrderPaid(tx, { orderId: real.id, paidAmountFils: real.total_fils }));
    expect((await bestSellers({})).map((x) => x.id)).toEqual([p.id]);
  });
});

describe("platform settings", () => {
  it("returns defaults and validates saved values", async () => {
    const admin = await createUser({ role: "admin" });
    expect((await getSettings()).site_name).toBe(DEFAULT_SETTINGS.site_name);
    await saveSettings({ site_name: "منصة النجاح", primary_color: "#123456" }, admin.id);
    const s = await getSettings();
    expect(s).toMatchObject({ site_name: "منصة النجاح", primary_color: "#123456" });
    await expect(saveSettings({ primary_color: "red; background:url(x)" }, admin.id)).rejects.toThrow();
    await expect(saveSettings({ whatsapp_number: "<script>" }, admin.id)).rejects.toThrow();
  });
});
