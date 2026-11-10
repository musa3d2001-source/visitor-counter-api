import "server-only";
import { cache } from "react";
import { publicCached, type PublicCacheOptions } from "../platform/public-cache";
import { readProductSaleState } from "../commerce/sale-state";
import { sql } from "../db";
import type { ProductType } from "@/lib/labels";
import * as q from "./queries";

/**
 * قراءات الكتالوج التي يراها أي زائر مجهول: من الذاكرة بين الطلبات، ومرة واحدة داخل الطلب.
 *
 * القواعد التي يختبرها tests/integration/public-data-boundary.test.ts:
 *  - لا شيء هنا يقرأ جلسة أو سلة أو صلاحية أو طلبًا أو كوبونًا أو تقدمًا. الأكثر مبيعًا مشتق من الطلبات فلا يُخزن.
 *  - كل دالة تعيد المنشور فقط، والمغلق بقرار المالك أو بغياب مزود البث لا يدخل القوائم.
 *  - فحوص الوصول والسلة والدفع والتسليم لا تستورد هذا الملف أبدًا، فما يُشترى يُقرأ من قاعدة البيانات.
 *
 * كل محمّل هنا يذهب إلى queries.ts مباشرة، طبقة واحدة، حتى لا يتراكم عمر فوق عمر.
 * الدوال ذات الاسم نفسه في queries.ts هي القراءة الحية: لمعاينة المالك والمعلم ولما يخص شخصًا بعينه.
 */

const skipNull = <T>(): PublicCacheOptions<T | null> => ({ skipStore: (value) => value === null });

/** مفتاح ثابت لخيارات بقيم أولية: cache يطابق القيم الأولية فقط، وترتيب الحقول لا يغير المعنى */
const stableKey = (opts: Record<string, string | number | boolean | undefined>) =>
  JSON.stringify(Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))));

const idsKey = (ids: string[]) => [...new Set(ids)].sort().join(",");

export const listStages = cache(() => publicCached("stages", q.listStages));

export const listGrades = cache(() => publicCached("grades", q.listGrades));

export const getStageBySlug = cache(async (slug: string) => (await listStages()).find((s) => s.slug === slug) ?? null);

export const getGradeBySlug = cache(async (slug: string) => (await listGrades()).find((g) => g.slug === slug) ?? null);

export const listAllSubjects = cache(() => publicCached("subjects", q.listAllSubjects));

export const listSubjects = cache(async (gradeId: string) => (await listAllSubjects()).filter((s) => s.gradeId === gradeId));

export const getSubject = cache(async (gradeId: string, subjectSlug: string) => (await listSubjects(gradeId)).find((s) => s.slug === subjectSlug) ?? null);

const gradeStatsRows = cache(() => publicCached("grade-stats", async () => [...(await q.gradeStats())]));

export const gradeStats = cache(async () => new Map(await gradeStatsRows()));

type ListProductsOptions = {
  gradeId?: string;
  subjectId?: string;
  type?: ProductType;
  excludeType?: ProductType;
  term?: number;
  featuredOnly?: boolean;
  limit?: number;
  order?: "display" | "latest";
};

const productsByKey = cache((key: string) => publicCached(`products:${key}`, () => q.listProducts(JSON.parse(key) as ListProductsOptions)));

export const listProducts = (opts: ListProductsOptions) => productsByKey(stableKey(opts));

export const latestVideoProducts = cache((limit: number) => publicCached(`latest-video:${limit}`, () => q.latestVideoProducts(limit)));

export const firstPreviewLesson = cache(() => publicCached("first-preview", q.firstPreviewLesson));

export const catalogOfferings = cache(() => publicCached("offerings", q.catalogOfferings));

type ListTeachersOptions = { gradeId?: string; subjectId?: string; limit?: number };

const teachersByKey = cache((key: string) => publicCached(`teachers:${key}`, () => q.listTeachers(JSON.parse(key) as ListTeachersOptions)));

export const listTeachers = (opts: ListTeachersOptions = {}) => teachersByKey(stableKey(opts));

export const teachersForSubject = (subjectId: string) => listTeachers({ subjectId });

const teachersForSubjectsByKey = cache((key: string) => publicCached(`subject-teachers:${key}`, () => q.teachersForSubjects(key ? key.split(",") : [])));

export async function teachersForSubjects(subjectIds: string[]) {
  return new Map(await teachersForSubjectsByKey(idsKey(subjectIds)));
}

export const teacherTotals = cache(() => publicCached("teacher-totals", q.teacherTotals));

export const getTeacherBySlug = cache((slug: string) => publicCached(`teacher:${slug}`, () => q.getTeacherBySlug(slug), skipNull()));

export const teacherContent = cache((teacherId: string) => publicCached(`teacher-content:${teacherId}`, () => q.teacherContent(teacherId)));

/** المنشور فقط: معاينة غير المنشور تقرأ queries.getProductBySlug مباشرة */
export const getProductBySlug = cache((slug: string) => publicCached(`product:${slug}`, () => q.getProductBySlug(slug), skipNull()));

const bundleItemsByKey = cache((key: string) => publicCached(`bundle-items:${key}`, () => q.getBundleItemsFor(key ? key.split(",") : [])));

export async function getBundleItemsFor(bundleIds: string[]) {
  return new Map(await bundleItemsByKey(idsKey(bundleIds)));
}

export async function getBundleItems(bundleId: string) {
  return (await getBundleItemsFor([bundleId])).get(bundleId) ?? [];
}

export const getBundlesContaining = cache((productId: string) => publicCached(`bundles-containing:${productId}`, () => q.getBundlesContaining(productId)));

export const getProductFilesInfo = cache((productId: string) => publicCached(`files:${productId}`, () => q.getProductFilesInfo(productId, { publishedOnly: true })));

export const getPlaylist = cache((productId: string) => publicCached(`playlist:${productId}`, () => q.getPlaylist(productId, { publishedOnly: true })));

/** لتقرير عرض زر الشراء فقط. إضافة السلة والدفع يفحصان قاعدة البيانات بأنفسهما */
export const getProductSaleState = cache((productId: string) => publicCached(`sale-state:${productId}`, () => readProductSaleState(sql, productId)));

export const sitemapEntries = cache(() => publicCached("sitemap", q.sitemapEntries));
