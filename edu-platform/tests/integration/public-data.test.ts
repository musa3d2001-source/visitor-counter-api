import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { grantProduct } from "@/server/access/entitlements";
import { resetEnvCache } from "@/server/env";
import { getDb } from "@/server/db";
import { computeCart } from "@/server/commerce/cart";
import * as live from "@/server/catalog/queries";
import * as publicData from "@/server/catalog/public-data";
import { getPublicSettings } from "@/server/platform/public-settings";
import { publicCacheStats, resetPublicCacheForTests } from "@/server/platform/public-cache";
import { getSettings } from "@/server/platform/settings";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createBundle, createContainer, createProduct, createTeacher, createUser, createVideoProduct, gradeAndSubject } from "../helpers/factories";
import { TEST_ENV } from "../test-env";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const LIFETIME_S = 55;
const advance = (seconds: number) => vi.advanceTimersByTime(seconds * 1000);

function useCache(seconds = LIFETIME_S) {
  process.env.PUBLIC_CACHE_SECONDS = String(seconds);
  resetEnvCache();
  resetPublicCacheForTests();
}

beforeAll(resetDb);
afterAll(closeDb);
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["performance"] });
  await sql`delete from lesson_progress`;
  await sql`delete from entitlements`;
  await sql`delete from bundle_items`;
  await sql`delete from lessons`;
  await sql`delete from product_files`;
  await sql`delete from products`;
  await sql`delete from teacher_subjects`;
  await sql`delete from teachers`;
  await sql`delete from settings`;
  useCache();
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.ALLOW_FILE_VIDEO;
  Object.assign(process.env, TEST_ENV);
  resetEnvCache();
  resetPublicCacheForTests();
});

/** أوامر SQL التي نفذها fn فعلًا على الاتصال، بنصها */
async function statementsOf<T>(fn: () => Promise<T>): Promise<{ out: T; statements: string[] }> {
  const db = getDb();
  const statements: string[] = [];
  (db.options as { debug?: unknown }).debug = (_connection: number, query: string) => {
    statements.push(query);
  };
  try {
    return { out: await fn(), statements };
  } finally {
    (db.options as { debug?: unknown }).debug = undefined;
  }
}

const videosOff = () => sql`insert into settings (key, value) values ('videos_enabled', 'false'::jsonb) on conflict (key) do update set value = excluded.value`;
const titles = (cards: { title: string }[]) => cards.map((c) => c.title);

describe("what public-data may read", () => {
  const FORBIDDEN = /\b(sessions|users|user_totp|user_recovery_codes|entitlements|orders|order_items|payments|payment_extras|payment_alerts|refunds|coupons|coupon_redemptions|lesson_progress|reading_progress|consent_records|email_log|audit_log|access_log|error_events|rate_limits)\b/i;

  async function everyExportInvoked() {
    const video = await createVideoProduct({ lessons: 2, freePreviewIndex: 0 });
    const notes = await createProduct();
    const bundle = await createBundle({ items: [notes.id] });
    const teacher = await createTeacher();
    const { gradeId, subjectId } = await gradeAndSubject(6, "math");
    const [{ slug: gradeSlug }] = await sql<{ slug: string }[]>`select slug from grades where id = ${gradeId}`;
    const [{ slug: subjectSlug }] = await sql<{ slug: string }[]>`select slug from subjects where id = ${subjectId}`;
    const [{ stage }] = await sql<{ stage: string }[]>`select st.slug as stage from stages st join grades g on g.stage_id = st.id where g.id = ${gradeId}`;
    return {
      listStages: () => publicData.listStages(),
      listGrades: () => publicData.listGrades(),
      getStageBySlug: () => publicData.getStageBySlug(stage),
      getGradeBySlug: () => publicData.getGradeBySlug(gradeSlug),
      listAllSubjects: () => publicData.listAllSubjects(),
      listSubjects: () => publicData.listSubjects(gradeId),
      getSubject: () => publicData.getSubject(gradeId, subjectSlug),
      gradeStats: () => publicData.gradeStats(),
      listProducts: () => publicData.listProducts({ gradeId }),
      latestVideoProducts: () => publicData.latestVideoProducts(8),
      firstPreviewLesson: () => publicData.firstPreviewLesson(),
      catalogOfferings: () => publicData.catalogOfferings(),
      listTeachers: () => publicData.listTeachers({ subjectId }),
      teachersForSubject: () => publicData.teachersForSubject(subjectId),
      teachersForSubjects: () => publicData.teachersForSubjects([subjectId]),
      teacherTotals: () => publicData.teacherTotals(),
      getTeacherBySlug: () => publicData.getTeacherBySlug(teacher.slug),
      teacherContent: () => publicData.teacherContent(teacher.id),
      getProductBySlug: () => publicData.getProductBySlug(notes.slug),
      getBundleItemsFor: () => publicData.getBundleItemsFor([bundle.id]),
      getBundleItems: () => publicData.getBundleItems(bundle.id),
      getBundlesContaining: () => publicData.getBundlesContaining(notes.id),
      getProductFilesInfo: () => publicData.getProductFilesInfo(notes.id),
      getPlaylist: () => publicData.getPlaylist(video.id),
      getProductSaleState: () => publicData.getProductSaleState(notes.id),
      sitemapEntries: () => publicData.sitemapEntries(),
    } satisfies Record<keyof typeof publicData, () => unknown>;
  }

  it("no function touches a table that belongs to a person, an order or a coupon, and every export is covered", async () => {
    const calls = await everyExportInvoked();
    expect(Object.keys(calls).sort()).toEqual(Object.keys(publicData).sort());
    for (const [name, call] of Object.entries(calls)) {
      resetPublicCacheForTests();
      const { statements } = await statementsOf(call as () => Promise<unknown>);
      expect(statements.length, name).toBeGreaterThan(0);
      for (const text of statements) expect(text.replace(/\s+/g, " "), name).not.toMatch(FORBIDDEN);
    }
  });

  it("the cached product carries no field that depends on who is looking", async () => {
    const notes = await createProduct();
    const detail = await publicData.getProductBySlug(notes.slug);
    expect(Object.keys(detail!).filter((k) => /owned|entitle|coupon|user|session|discount/i.test(k))).toEqual([]);
  });

  it("public settings never carry fees or the watermark switch, and an unset row reads as the default", async () => {
    const settings = await getPublicSettings();
    expect(settings).toMatchObject({ site_name: expect.any(String), videos_enabled: true });
    expect(Object.keys(settings).filter((k) => /fee_|watermark/.test(k))).toEqual([]);
  });
});

describe("a product the owner changes, with no invalidation reaching this instance", () => {
  it("stays on the old state only inside the lifetime, then disappears from every list and link", async () => {
    const p = await createProduct({ title: "ستُسحب" });
    const { gradeId } = await gradeAndSubject(6, "math");
    expect(titles(await publicData.listProducts({ gradeId }))).toContain("ستُسحب");
    expect(await publicData.getProductBySlug(p.slug)).not.toBeNull();

    await sql`update products set status = 'draft' where id = ${p.id}`;
    advance(LIFETIME_S - 1);
    expect(titles(await publicData.listProducts({ gradeId }))).toContain("ستُسحب");

    advance(1);
    expect(titles(await publicData.listProducts({ gradeId }))).not.toContain("ستُسحب");
    expect(await publicData.getProductBySlug(p.slug)).toBeNull();
  });

  it("a new price shows within the lifetime", async () => {
    const p = await createProduct({ priceFils: 3000 });
    expect((await publicData.getProductBySlug(p.slug))!.priceFils).toBe(3000);
    await sql`update products set price_fils = 4500 where id = ${p.id}`;
    advance(LIFETIME_S);
    expect((await publicData.getProductBySlug(p.slug))!.priceFils).toBe(4500);
  });

  it("cannot be bought at the old state: the cart reads the database while the cache still shows the old one", async () => {
    const buyer = await createUser();
    const repriced = await createProduct({ priceFils: 3000 });
    const pulled = await createProduct({ priceFils: 2000 });
    await publicData.getProductBySlug(repriced.slug);
    await publicData.getProductBySlug(pulled.slug);
    // السلة حُسبت قبل التغيير: لو حفظت شيئًا بين الطلبات لظهر في الحساب الثاني
    expect((await computeCart([repriced.id, pulled.id], buyer.id)).subtotalFils).toBe(5000);

    await sql`update products set price_fils = 4500 where id = ${repriced.id}`;
    await sql`update products set status = 'draft' where id = ${pulled.id}`;

    // الذاكرة ما زالت على القديم
    expect((await publicData.getProductBySlug(repriced.slug))!.priceFils).toBe(3000);
    expect(await publicData.getProductBySlug(pulled.slug)).not.toBeNull();

    const cart = await computeCart([repriced.id, pulled.id], buyer.id);
    expect(cart.payableLines.map((l) => [l.id, l.priceFils])).toEqual([[repriced.id, 4500]]);
    expect(cart.subtotalFils).toBe(4500);
  });

  it("does not let the owner's settings form or the sale rules read the cached settings", async () => {
    expect((await getPublicSettings()).videos_enabled).toBe(true);
    await videosOff();
    expect((await getPublicSettings()).videos_enabled).toBe(true);
    expect((await getSettings()).videos_enabled).toBe(false);
  });
});

describe("a cached list never holds what the public must not see", () => {
  it("drafts, in-review, hidden and archived products", async () => {
    await createProduct({ status: "published", title: "ظاهر" });
    for (const status of ["draft", "hidden", "archived"] as const) await createProduct({ status, title: status });
    await sql`update products set status = 'in_review' where title = 'draft'`;
    const { gradeId } = await gradeAndSubject(6, "math");
    expect(titles(await publicData.listProducts({ gradeId }))).toEqual(["ظاهر"]);
  });

  it("a draft item inside a published bundle, in the batched read", async () => {
    const open = await createProduct({ title: "منشور" });
    const draft = await createProduct({ status: "draft", title: "مسودة" });
    const bundle = await createBundle({ items: [open.id, draft.id] });
    expect(titles((await publicData.getBundleItemsFor([bundle.id])).get(bundle.id)!)).toEqual(["منشور"]);
  });

  it("the playlist and file list of an unpublished product, even if asked for by mistake", async () => {
    const video = await createVideoProduct({ status: "draft", lessons: 2 });
    const notes = await createProduct({ status: "draft" });
    expect(await publicData.getPlaylist(video.id)).toEqual([]);
    expect(await publicData.getProductFilesInfo(notes.id)).toEqual([]);
    expect((await live.getPlaylist(video.id)).length).toBeGreaterThan(0);
    expect((await live.getProductFilesInfo(notes.id)).length).toBeGreaterThan(0);
  });

  for (const closer of [
    { name: "the owner closed all video", close: videosOff as () => unknown },
    {
      name: "raw files on a production deployment",
      close: () => {
        (process.env as Record<string, string>).NODE_ENV = "production";
        resetEnvCache();
      },
    },
  ]) {
    it(`video closed because ${closer.name}: gone from every list once the lifetime has passed`, async () => {
      const teacher = await createTeacher();
      const video = await createVideoProduct({ title: "درس مغلق", teacherId: teacher.id, freePreviewIndex: 0, level: 6, subjectSlug: "math" });
      await createProduct({ title: "مذكرة" });
      const { gradeId } = await gradeAndSubject(6, "math");
      expect(titles(await publicData.listProducts({ gradeId }))).toContain("درس مغلق");
      expect(await publicData.firstPreviewLesson()).toMatchObject({ productId: video.id });
      await publicData.latestVideoProducts(8);

      await closer.close();
      advance(LIFETIME_S);

      expect(titles(await publicData.listProducts({ gradeId }))).toEqual(["مذكرة"]);
      expect(await publicData.latestVideoProducts(8)).toEqual([]);
      expect(await publicData.firstPreviewLesson()).toBeNull();
      expect(await publicData.getProductSaleState(video.id)).toMatchObject({ videoClosed: true });
    });
  }
});

describe("invalidation by admin changes", () => {
  it("the admin revalidatePath empties the cache in this instance at once", async () => {
    const { revalidatePath } = await import("@/server/platform/revalidate");
    const p = await createProduct({ priceFils: 3000 });
    await publicData.getProductBySlug(p.slug);
    await sql`update products set price_fils = 9000 where id = ${p.id}`;
    revalidatePath("/admin/products");
    expect((await publicData.getProductBySlug(p.slug))!.priceFils).toBe(9000);
  });
});

describe("one read for all requests, and a broken cache is not an outage", () => {
  it("a second visitor costs no statement at all", async () => {
    await createProduct();
    const { gradeId } = await gradeAndSubject(6, "math");
    await publicData.listProducts({ gradeId, limit: 8 });
    const { statements } = await statementsOf(() => publicData.listProducts({ limit: 8, gradeId }));
    expect(statements).toEqual([]);
  });

  it("not-found for a random link is not remembered, so publishing shows at once", async () => {
    const p = await createProduct({ status: "draft" });
    expect(await publicData.getProductBySlug(p.slug)).toBeNull();
    await sql`update products set status = 'published', published_at = now() where id = ${p.id}`;
    expect(await publicData.getProductBySlug(p.slug)).not.toBeNull();
  });

  it("a failure of the cache itself falls back to the database", async () => {
    const p = await createProduct({ priceFils: 1234 });
    const original = Map.prototype.get;
    const spy = vi.spyOn(Map.prototype, "get").mockImplementation(function (this: Map<unknown, unknown>, key: unknown) {
      if (typeof key === "string" && key.startsWith("product:")) throw new Error("corrupt cache");
      return original.call(this, key);
    });
    try {
      expect((await publicData.getProductBySlug(p.slug))!.priceFils).toBe(1234);
    } finally {
      spy.mockRestore();
    }
    expect(publicCacheStats().internalFailures).toBeGreaterThan(0);
  });
});

describe("batched reads give what the per-item reads gave", () => {
  async function catalogue() {
    const a = await createTeacher({});
    const b = await createTeacher({});
    const math = await gradeAndSubject(6, "math");
    const science = await gradeAndSubject(6, "science");
    await sql`insert into teacher_subjects (teacher_id, subject_id) values (${a.id}, ${math.subjectId}), (${b.id}, ${science.subjectId})`;
    const p1 = await createProduct({ title: "رياضيات", level: 6, subjectSlug: "math" });
    const p2 = await createProduct({ title: "علوم", level: 6, subjectSlug: "science" });
    await sql`update products set teacher_id = ${b.id} where id = ${p1.id}`;
    const video = await createVideoProduct({ lessons: 2, freePreviewIndex: 0, level: 6, subjectSlug: "science", teacherId: a.id });
    const b1 = await createBundle({ items: [p1.id, p2.id] });
    const b2 = await createBundle({ items: [p2.id] });
    return { a, b, math, science, b1, b2, video, gradeId: math.gradeId };
  }

  it("getBundleItemsFor equals getBundleItems for each bundle, including one with no items", async () => {
    const { b1, b2 } = await catalogue();
    const empty = await createBundle({ items: [] });
    const batch = new Map(await live.getBundleItemsFor([b1.id, b2.id, empty.id]));
    for (const id of [b1.id, b2.id, empty.id]) expect(batch.get(id)).toEqual(await live.getBundleItems(id));
    expect(batch.get(empty.id)).toEqual([]);
  });

  it("listAllSubjects, filtered to a grade, equals listSubjects for that grade", async () => {
    const { gradeId } = await catalogue();
    const all = await live.listAllSubjects();
    expect(all.filter((s) => s.gradeId === gradeId)).toEqual(await live.listSubjects(gradeId));
    expect(all.length).toBeGreaterThan(0);
  });

  it("teachersForSubjects equals listTeachers for each subject, and one statement serves them all", async () => {
    const { math, science } = await catalogue();
    const { out, statements } = await statementsOf(() => live.teachersForSubjects([math.subjectId, science.subjectId]));
    const batch = new Map(out);
    expect(batch.get(math.subjectId)!.length).toBeGreaterThan(0);
    for (const id of [math.subjectId, science.subjectId]) expect(batch.get(id)).toEqual(await live.listTeachers({ subjectId: id }));
    expect(statements.filter((s) => /from teachers|join teachers/i.test(s))).toHaveLength(1);
  });

  it("a teacher card lists subjects from the profile and from published content, in one statement", async () => {
    const { a, math, science } = await catalogue();
    await getSettings();
    const { out, statements } = await statementsOf(() => live.listTeachers());
    const card = out.find((t) => t.id === a.id)!;
    expect(card.subjects.map((s) => s.id).sort()).toEqual([math.subjectId, science.subjectId].sort());
    expect(card.subjects[0]).toEqual(expect.objectContaining({ gradeName: expect.any(String), gradeSlug: expect.any(String), gradeLevel: 6 }));
    expect(statements.filter((s) => /teacher_subjects/.test(s))).toHaveLength(1);
  });

  it("a teacher's closed content leaves the subject list when video is closed", async () => {
    const t = await createTeacher({});
    const { subjectId } = await gradeAndSubject(6, "science");
    await createVideoProduct({ lessons: 1, level: 6, subjectSlug: "science", teacherId: t.id });
    expect((await live.getTeacherBySlug(t.slug))!.subjects.map((s) => s.id)).toEqual([subjectId]);
    await videosOff();
    resetPublicCacheForTests();
    expect((await live.getTeacherBySlug(t.slug))!.subjects).toEqual([]);
  });

  it("teacherTotals equals what summing the full list gave", async () => {
    await catalogue();
    const all = await live.listTeachers();
    expect(await live.teacherTotals()).toEqual({ teachers: all.length, lessons: all.reduce((n, t) => n + t.videoCount, 0) });
  });

  it("one call per slug: the metadata and the page share one product read", async () => {
    const p = await createProduct();
    const { statements } = await statementsOf(async () => {
      await publicData.getProductBySlug(p.slug);
      await publicData.getProductBySlug(p.slug);
    });
    expect(statements.filter((s) => /from products p/.test(s))).toHaveLength(1);
  });
});

describe("statistics are not computed for pages that do not show them", () => {
  it("with nothing closed the grade and sitemap reads skip the catalogue-wide video lateral", async () => {
    await createProduct();
    const { statements: grades } = await statementsOf(() => live.gradeStats());
    expect(grades.join(" ")).not.toMatch(/with recursive c\(id, depth\)/);
    const { statements: sitemap } = await statementsOf(() => live.sitemapEntries());
    expect(sitemap.filter((s) => /from products p/.test(s)).join(" ")).not.toMatch(/with recursive c\(id, depth\)/);
  });

  it("the header's preview link never reads the catalogue statistics", async () => {
    await createVideoProduct({ lessons: 1, freePreviewIndex: 0 });
    const { out, statements } = await statementsOf(() => live.firstPreviewLesson());
    expect(out).not.toBeNull();
    expect(statements.join(" ")).not.toMatch(/with recursive c\(id, depth\)/);
  });

  it("the preview link follows the same visibility as the lists: nothing unpublished, not ready or not free", async () => {
    await createVideoProduct({ lessons: 1, freePreviewIndex: 0, status: "draft" });
    await createVideoProduct({ lessons: 1, freePreviewIndex: null });
    await createVideoProduct({ lessons: 1, freePreviewIndex: 0, ready: false });
    expect(await live.firstPreviewLesson()).toBeNull();
    const open = await createVideoProduct({ lessons: 2, freePreviewIndex: 1 });
    expect(await live.firstPreviewLesson()).toEqual({ productId: open.id, lessonId: open.lessonIds[1] });
  });
});

describe("the sitemap is bounded", () => {
  it("reads no more than the limit, newest changes first", async () => {
    expect(live.SITEMAP_LIMITS.products).toBeLessThanOrEqual(5000);
    const { statements } = await statementsOf(() => live.sitemapEntries());
    const text = statements.join(" ");
    expect(text).toMatch(/order by p\.updated_at desc\s+limit/);
    // الصفوف والمراحل جداول صغيرة بطبيعتها، وعمودها الفقري قائمة الصفوف العامة
    expect(statements.filter((s) => /from (products p|subjects s|teachers)\b/.test(s) && !/from grades g join stages/.test(s) && !/limit/i.test(s))).toEqual([]);
  });

  it("is one list for all crawlers", async () => {
    await createProduct();
    await publicData.sitemapEntries();
    const { statements } = await statementsOf(() => publicData.sitemapEntries());
    expect(statements).toEqual([]);
  });
});

describe("containers keep working through the batched path", () => {
  it("a container's playlist is the same through the cached and the live read", async () => {
    const child = await createVideoProduct({ lessons: 2 });
    const parent = await createContainer({ items: [child.id] });
    expect(await publicData.getPlaylist(parent.id)).toEqual(await live.getPlaylist(parent.id));
  });
});

describe("library queries do not grow with the library", () => {
  it("expiry per item is the same rule as accessExpiry, and the statement count does not depend on the number of products", async () => {
    const { getLibrary, accessExpiry } = await import("@/server/access/entitlements");
    const user = await createUser();
    const few = await createProduct();
    await grantProduct(sql, { userId: user.id, productId: few.id, source: "manual", grantedBy: null, reason: "t" });
    const small = await statementsOf(() => getLibrary(user.id));

    const later = new Date(Date.now() + 90 * 86400_000);
    const sooner = new Date(Date.now() + 10 * 86400_000);
    const shared = await createProduct();
    const bundle = await createBundle({ items: [shared.id] });
    const open = await createProduct();
    await grantProduct(sql, { userId: user.id, productId: shared.id, source: "manual", grantedBy: null, reason: "t", expiresAt: sooner });
    await sql`insert into entitlements (user_id, product_id, source, expires_at) values (${user.id}, ${bundle.id}, 'manual', ${later})`;
    await grantProduct(sql, { userId: user.id, productId: open.id, source: "manual", grantedBy: null, reason: "t", expiresAt: null });
    for (let i = 0; i < 6; i++) {
      const p = await createProduct();
      await grantProduct(sql, { userId: user.id, productId: p.id, source: "manual", grantedBy: null, reason: "t" });
    }
    const big = await statementsOf(() => getLibrary(user.id));

    expect(big.statements.length).toBe(small.statements.length);
    expect(big.statements.length).toBe(2);
    expect(big.out.items.length).toBeGreaterThan(small.out.items.length);
    for (const item of big.out.items) {
      const rule = await accessExpiry(user.id, item.productId);
      expect(item.expiresAt, item.title).toEqual(rule.expiresAt);
    }
    expect(big.out.items.find((i) => i.productId === shared.id)!.expiresAt).toEqual(later);
  });

  it("a revoked or expired product is not in the library, and bundles stay out of the item list", async () => {
    const { getLibrary, revokeProduct } = await import("@/server/access/entitlements");
    const user = await createUser();
    const gone = await createProduct();
    const expired = await createProduct();
    const kept = await createProduct();
    const inBundle = await createProduct();
    const bundle = await createBundle({ items: [inBundle.id] });
    await grantProduct(sql, { userId: user.id, productId: gone.id, source: "manual", grantedBy: null, reason: "t" });
    await grantProduct(sql, { userId: user.id, productId: kept.id, source: "manual", grantedBy: null, reason: "t" });
    await grantProduct(sql, { userId: user.id, productId: bundle.id, source: "manual", grantedBy: null, reason: "t" });
    await sql`insert into entitlements (user_id, product_id, source, expires_at) values (${user.id}, ${expired.id}, 'manual', now() - interval '1 day')`;
    await revokeProduct(sql, { userId: user.id, productId: gone.id, revokedBy: null, reason: "t" });
    const lib = await getLibrary(user.id);
    expect(lib.items.map((i) => i.productId).sort()).toEqual([kept.id, inBundle.id].sort());
    expect(lib.bundles.map((b) => b.id)).toEqual([bundle.id]);
  });

  it("resume lessons are the student's own, and only from products still in the library", async () => {
    const { getResumeLessons } = await import("@/server/access/entitlements");
    const me = await createUser();
    const other = await createUser();
    const video = await createVideoProduct({ lessons: 2 });
    const notOwned = await createVideoProduct({ lessons: 1 });
    await grantProduct(sql, { userId: me.id, productId: video.id, source: "manual", grantedBy: null, reason: "t" });
    await sql`insert into lesson_progress (user_id, lesson_id, position_seconds, completed) values (${me.id}, ${video.lessonIds[0]}, 30, false), (${me.id}, ${notOwned.lessonIds[0]}, 30, false), (${other.id}, ${video.lessonIds[1]}, 30, false)`;
    expect((await getResumeLessons(me.id)).map((r) => r.lesson_id)).toEqual([video.lessonIds[0]]);
    await sql`update products set status = 'draft' where id = ${video.id}`;
    expect(await getResumeLessons(me.id)).toEqual([]);
  });
});

describe("the lesson page's access read", () => {
  it("is one statement and matches the separate checks it replaced", async () => {
    const { readWatchContext } = await import("@/server/access/lessons");
    const { accessibleProductIds, isTeacherOfProduct } = await import("@/server/access/entitlements");
    const user = await createUser();
    const video = await createVideoProduct({ lessons: 1 });
    const inside = await createProduct();
    const bundle = await createBundle({ items: [inside.id] });
    await grantProduct(sql, { userId: user.id, productId: bundle.id, source: "manual", grantedBy: null, reason: "t" });
    const { out, statements } = await statementsOf(() => readWatchContext(video.id, { id: user.id, role: user.role }));
    expect(statements).toHaveLength(1);
    expect(out!.product).toMatchObject({ id: video.id, status: "published" });
    expect(out!.owned).toEqual(await accessibleProductIds(user.id));
    expect(out!.staff).toBe(await isTeacherOfProduct(user.id, video.id));
  });

  it("gives a visitor nothing, a teacher only their own product, and an owner the staff flag", async () => {
    const { readWatchContext } = await import("@/server/access/lessons");
    const teacher = await createTeacher({ mode: "self_managed" });
    const teacherUser = teacher.user!;
    const mine = await createVideoProduct({ lessons: 1, teacherId: teacher.id });
    const other = await createVideoProduct({ lessons: 1 });
    const admin = await createUser({ role: "admin" });

    const visitor = await readWatchContext(mine.id, null);
    expect(visitor).toMatchObject({ staff: false });
    expect([...visitor!.owned]).toEqual([]);
    expect(await readWatchContext("00000000-0000-4000-8000-000000000000", null)).toBeNull();
    expect((await readWatchContext(other.id, { id: admin.id, role: "admin" }))!.staff).toBe(true);
    expect((await readWatchContext(other.id, { id: teacherUser.id, role: "teacher" }))!.staff).toBe(false);
  });

  it("a revoked purchase stops at the next request: ownership in the access read is not cached", async () => {
    const { readWatchContext, checkLessonAccess } = await import("@/server/access/lessons");
    const { revokeProduct } = await import("@/server/access/entitlements");
    const user = await createUser();
    const video = await createVideoProduct({ lessons: 1 });
    await grantProduct(sql, { userId: user.id, productId: video.id, source: "manual", grantedBy: null, reason: "t" });
    const viewer = { id: user.id, role: user.role };
    await publicData.getPlaylist(video.id);
    const before = await readWatchContext(video.id, viewer);
    expect(await checkLessonAccess(video.lessonIds[0], viewer, { ownedProductIds: before!.owned })).toMatchObject({ ok: true, via: "owned" });

    await revokeProduct(sql, { userId: user.id, productId: video.id, revokedBy: null, reason: "t" });

    const after = await readWatchContext(video.id, viewer);
    expect(after!.owned.has(video.id)).toBe(false);
    expect(await checkLessonAccess(video.lessonIds[0], viewer, { ownedProductIds: after!.owned })).toMatchObject({ ok: false, reason: "forbidden" });
    expect(await checkLessonAccess(video.lessonIds[0], viewer)).toMatchObject({ ok: false, reason: "forbidden" });
  });

  it("the owned set saves the second ownership read and nothing else", async () => {
    const { checkLessonAccess } = await import("@/server/access/lessons");
    const user = await createUser();
    const video = await createVideoProduct({ lessons: 1 });
    await grantProduct(sql, { userId: user.id, productId: video.id, source: "manual", grantedBy: null, reason: "t" });
    const viewer = { id: user.id, role: user.role };
    const withSet = await statementsOf(() => checkLessonAccess(video.lessonIds[0], viewer, { ownedProductIds: new Set([video.id]) }));
    const withoutSet = await statementsOf(() => checkLessonAccess(video.lessonIds[0], viewer));
    expect(withSet.out).toMatchObject({ ok: true });
    expect(withoutSet.out).toMatchObject({ ok: true });
    expect(withSet.statements).toHaveLength(1);
    expect(withoutSet.statements).toHaveLength(2);
  });
});
