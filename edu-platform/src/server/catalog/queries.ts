import "server-only";
import { cache } from "react";
import { sql } from "../db";
import { storage } from "../storage";
import type { ProductType } from "@/lib/labels";

/**
 * استعلامات الكتالوج العامة — تعرض فقط ما هو منشور:
 * المنتج منشور + الصف منشور + المرحلة منشورة + (المادة منشورة إن وجدت)
 */

export type Stage = { id: string; slug: string; name: string; description: string; sortOrder: number };
export type Grade = {
  id: string;
  slug: string;
  name: string;
  level: number;
  currentTerm: number;
  stageId: string;
  stageSlug: string;
  stageName: string;
};
export type Subject = { id: string; slug: string; name: string; icon: string; gradeId: string; productCount: number };

export type ProductCard = {
  id: string;
  slug: string;
  type: ProductType;
  title: string;
  summary: string;
  priceFils: number;
  compareAtPriceFils: number | null;
  coverUrl: string | null;
  gradeName: string;
  gradeSlug: string;
  subjectName: string | null;
  subjectSlug: string | null;
  term: number | null;
  academicYear: string;
  isFeatured: boolean;
  pageCount: number | null;
  hasPreview: boolean;
};

export type ProductDetail = ProductCard & {
  description: string;
  contents: string;
  isDownloadable: boolean;
  status: string;
  gradeId: string;
  subjectId: string | null;
  stageName: string;
  stageSlug: string;
  publishedAt: Date | null;
  updatedAt: Date;
};

type ProductRow = {
  id: string;
  slug: string;
  type: ProductType;
  title: string;
  summary: string;
  price_fils: number;
  compare_at_price_fils: number | null;
  cover_key: string | null;
  grade_name: string;
  grade_slug: string;
  subject_name: string | null;
  subject_slug: string | null;
  term: number | null;
  academic_year: string;
  is_featured: boolean;
  page_count: number | null;
  has_preview: boolean;
};

export function coverUrl(key: string | null): string | null {
  return key ? storage().publicUrl(key) : null;
}

function toCard(r: ProductRow): ProductCard {
  return {
    id: r.id,
    slug: r.slug,
    type: r.type,
    title: r.title,
    summary: r.summary,
    priceFils: r.price_fils,
    compareAtPriceFils: r.compare_at_price_fils,
    coverUrl: coverUrl(r.cover_key),
    gradeName: r.grade_name,
    gradeSlug: r.grade_slug,
    subjectName: r.subject_name,
    subjectSlug: r.subject_slug,
    term: r.term,
    academicYear: r.academic_year,
    isFeatured: r.is_featured,
    pageCount: r.page_count,
    hasPreview: r.has_preview,
  };
}

/** أعمدة بطاقة المنتج — تُستخدم داخل استعلامات الكتالوج */
const cardColumns = () => sql`
  p.id, p.slug, p.type, p.title, p.summary, p.price_fils, p.compare_at_price_fils, p.cover_key,
  g.name as grade_name, g.slug as grade_slug, s.name as subject_name, s.slug as subject_slug,
  p.term, p.academic_year, p.is_featured, p.page_count,
  exists (select 1 from product_files pf where pf.product_id = p.id and pf.kind = 'preview') as has_preview
`;

const visibleJoin = () => sql`
  from products p
  join grades g on g.id = p.grade_id and g.is_published
  join stages st on st.id = g.stage_id and st.is_published
  left join subjects s on s.id = p.subject_id
  where p.status = 'published' and (p.subject_id is null or s.is_published)
`;

export const listStages = cache(async (): Promise<(Stage & { grades: Grade[] })[]> => {
  const stages = await sql<{ id: string; slug: string; name: string; description: string; sort_order: number }[]>`
    select id, slug, name, description, sort_order from stages where is_published order by sort_order, name
  `;
  const grades = await listGrades();
  return stages.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    sortOrder: s.sort_order,
    grades: grades.filter((g) => g.stageId === s.id),
  }));
});

/** الصفوف المنشورة التي تحتوي منتجًا منشورًا واحدًا على الأقل */
export const listGrades = cache(async (): Promise<Grade[]> => {
  const rows = await sql<
    { id: string; slug: string; name: string; level: number; current_term: number; stage_id: string; stage_slug: string; stage_name: string }[]
  >`
    select g.id, g.slug, g.name, g.level, g.current_term, g.stage_id, st.slug as stage_slug, st.name as stage_name
    from grades g join stages st on st.id = g.stage_id
    where g.is_published and st.is_published
      and exists (
        select 1 from products p left join subjects s on s.id = p.subject_id
        where p.grade_id = g.id and p.status = 'published' and (p.subject_id is null or s.is_published)
      )
    order by st.sort_order, g.sort_order, g.level
  `;
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    level: r.level,
    currentTerm: r.current_term,
    stageId: r.stage_id,
    stageSlug: r.stage_slug,
    stageName: r.stage_name,
  }));
});

export const getStageBySlug = cache(async (slug: string) => {
  const all = await listStages();
  return all.find((s) => s.slug === slug) ?? null;
});

export const getGradeBySlug = cache(async (slug: string): Promise<Grade | null> => {
  const grades = await listGrades();
  return grades.find((g) => g.slug === slug) ?? null;
});

/** مواد الصف المنشورة التي فيها منتجات منشورة فقط (لا نعرض أقسامًا فارغة) */
export const listSubjects = cache(async (gradeId: string): Promise<Subject[]> => {
  const rows = await sql<{ id: string; slug: string; name: string; icon: string; grade_id: string; product_count: number }[]>`
    select s.id, s.slug, s.name, s.icon, s.grade_id,
      (select count(*)::int from products p where p.subject_id = s.id and p.status = 'published') as product_count
    from subjects s
    where s.grade_id = ${gradeId} and s.is_published
    order by s.sort_order, s.name
  `;
  return rows
    .filter((r) => r.product_count > 0)
    .map((r) => ({ id: r.id, slug: r.slug, name: r.name, icon: r.icon, gradeId: r.grade_id, productCount: r.product_count }));
});

export const getSubject = cache(async (gradeId: string, subjectSlug: string) => {
  const subjects = await listSubjects(gradeId);
  return subjects.find((s) => s.slug === subjectSlug) ?? null;
});

export async function listProducts(opts: {
  gradeId?: string;
  subjectId?: string;
  type?: ProductType;
  excludeType?: ProductType;
  term?: number;
  featuredOnly?: boolean;
  limit?: number;
  order?: "display" | "latest";
}): Promise<ProductCard[]> {
  const rows = await sql<ProductRow[]>`
    select ${cardColumns()}
    ${visibleJoin()}
      ${opts.gradeId ? sql`and p.grade_id = ${opts.gradeId}` : sql``}
      ${opts.subjectId ? sql`and p.subject_id = ${opts.subjectId}` : sql``}
      ${opts.type ? sql`and p.type = ${opts.type}` : sql``}
      ${opts.excludeType ? sql`and p.type <> ${opts.excludeType}` : sql``}
      ${opts.term ? sql`and (p.term = ${opts.term} or p.term is null)` : sql``}
      ${opts.featuredOnly ? sql`and p.is_featured` : sql``}
    order by ${opts.order === "latest" ? sql`p.published_at desc nulls last, p.created_at desc` : sql`p.sort_order, p.published_at desc nulls last`}
    limit ${opts.limit ?? 200}
  `;
  return rows.map(toCard);
}

/** الأكثر طلبًا — من بيانات مبيعات حقيقية فقط (طلبات مدفوعة غير تجريبية) */
export async function bestSellers(opts: { gradeId?: string; limit?: number }): Promise<ProductCard[]> {
  const rows = await sql<(ProductRow & { sold: number })[]>`
    select ${cardColumns()}, sales.sold
    from (
      select oi.product_id, count(*)::int as sold
      from order_items oi join orders o on o.id = oi.order_id
      where o.status = 'paid' and not o.is_test
      group by oi.product_id
    ) sales
    join products p on p.id = sales.product_id
    join grades g on g.id = p.grade_id and g.is_published
    join stages st on st.id = g.stage_id and st.is_published
    left join subjects s on s.id = p.subject_id
    where p.status = 'published' and (p.subject_id is null or s.is_published)
      ${opts.gradeId ? sql`and p.grade_id = ${opts.gradeId}` : sql``}
    order by sales.sold desc, p.sort_order
    limit ${opts.limit ?? 8}
  `;
  return rows.map(toCard);
}

export const getProductBySlug = cache(async (slug: string, opts: { includeUnpublished?: boolean } = {}): Promise<ProductDetail | null> => {
  const rows = await sql<
    (ProductRow & {
      description: string;
      contents: string;
      is_downloadable: boolean;
      status: string;
      grade_id: string;
      subject_id: string | null;
      stage_name: string;
      stage_slug: string;
      published_at: Date | null;
      updated_at: Date;
      grade_pub: boolean;
      stage_pub: boolean;
      subject_pub: boolean | null;
    })[]
  >`
    select ${cardColumns()}, p.description, p.contents, p.is_downloadable, p.status, p.grade_id, p.subject_id,
      st.name as stage_name, st.slug as stage_slug, p.published_at, p.updated_at,
      g.is_published as grade_pub, st.is_published as stage_pub, s.is_published as subject_pub
    from products p
    join grades g on g.id = p.grade_id
    join stages st on st.id = g.stage_id
    left join subjects s on s.id = p.subject_id
    where p.slug = ${slug}
  `;
  const r = rows[0];
  if (!r) return null;
  const visible = r.status === "published" && r.grade_pub && r.stage_pub && (r.subject_id === null || r.subject_pub === true);
  if (!visible && !opts.includeUnpublished) return null;
  return {
    ...toCard(r),
    description: r.description,
    contents: r.contents,
    isDownloadable: r.is_downloadable,
    status: r.status,
    gradeId: r.grade_id,
    subjectId: r.subject_id,
    stageName: r.stage_name,
    stageSlug: r.stage_slug,
    publishedAt: r.published_at,
    updatedAt: r.updated_at,
  };
});

/** عناصر الباقة (المنشورة فقط للعرض العام) */
export async function getBundleItems(bundleId: string, opts: { includeUnpublished?: boolean } = {}): Promise<ProductCard[]> {
  const rows = await sql<ProductRow[]>`
    select ${cardColumns()}
    from bundle_items bi
    join products p on p.id = bi.product_id
    join grades g on g.id = p.grade_id
    left join subjects s on s.id = p.subject_id
    where bi.bundle_id = ${bundleId}
      ${opts.includeUnpublished ? sql`` : sql`and p.status = 'published'`}
    order by bi.sort_order, p.sort_order
  `;
  return rows.map(toCard);
}

/** الباقات المنشورة التي تتضمن هذا المنتج (لاقتراح التوفير) */
export async function getBundlesContaining(productId: string): Promise<ProductCard[]> {
  const rows = await sql<ProductRow[]>`
    select ${cardColumns()}
    ${visibleJoin()}
      and p.type = 'bundle'
      and exists (select 1 from bundle_items bi where bi.bundle_id = p.id and bi.product_id = ${productId})
    order by p.sort_order
    limit 4
  `;
  return rows.map(toCard);
}

export type PublicFileInfo = { id: string; title: string; pageCount: number | null; kind: "main" | "preview" };

export async function getProductFilesInfo(productId: string): Promise<PublicFileInfo[]> {
  const rows = await sql<{ id: string; title: string; page_count: number | null; kind: "main" | "preview" }[]>`
    select id, title, page_count, kind from product_files where product_id = ${productId} order by kind, sort_order, created_at
  `;
  return rows.map((r) => ({ id: r.id, title: r.title, pageCount: r.page_count, kind: r.kind }));
}

export type LessonInfo = {
  id: string;
  unitTitle: string;
  title: string;
  description: string;
  durationSeconds: number | null;
  isFreePreview: boolean;
  provider: "file" | "bunny";
};

export async function getLessons(productId: string): Promise<LessonInfo[]> {
  const rows = await sql<
    { id: string; unit_title: string; title: string; description: string; duration_seconds: number | null; is_free_preview: boolean; provider: "file" | "bunny" }[]
  >`
    select id, unit_title, title, description, duration_seconds, is_free_preview, provider
    from lessons where product_id = ${productId} and is_published
    order by sort_order, created_at
  `;
  return rows.map((r) => ({
    id: r.id,
    unitTitle: r.unit_title,
    title: r.title,
    description: r.description,
    durationSeconds: r.duration_seconds,
    isFreePreview: r.is_free_preview,
    provider: r.provider,
  }));
}

/** للبحث عن منتجات عبر المعرفات (السلة) — تُعيد المنشور فقط */
export async function getPublishedProductsByIds(ids: string[]): Promise<ProductCard[]> {
  if (ids.length === 0) return [];
  const rows = await sql<ProductRow[]>`
    select ${cardColumns()}
    ${visibleJoin()}
      and p.id = any(${ids}::uuid[])
  `;
  const byId = new Map(rows.map((r) => [r.id, toCard(r)]));
  return ids.map((id) => byId.get(id)).filter((x): x is ProductCard => Boolean(x));
}

export async function sitemapEntries() {
  const products = await sql<{ slug: string; updated_at: Date }[]>`
    select p.slug, p.updated_at ${visibleJoin()}
  `;
  const grades = await listGrades();
  const subjects = await sql<{ grade_slug: string; slug: string }[]>`
    select g.slug as grade_slug, s.slug from subjects s join grades g on g.id = s.grade_id
    where s.is_published and g.is_published
      and exists (select 1 from products p where p.subject_id = s.id and p.status = 'published')
  `;
  const stages = await listStages();
  return { products, grades, subjects, stages };
}

/** إحصاءات حقيقية لكل صف (عدد المواد والمنتجات المنشورة) */
export const gradeStats = cache(async (): Promise<Map<string, { subjects: number; products: number }>> => {
  const rows = await sql<{ grade_id: string; subjects: number; products: number }[]>`
    select p.grade_id,
      count(distinct p.subject_id) filter (where s.is_published)::int as subjects,
      count(*)::int as products
    from products p left join subjects s on s.id = p.subject_id
    where p.status = 'published' and (p.subject_id is null or s.is_published)
    group by p.grade_id
  `;
  return new Map(rows.map((r) => [r.grade_id, { subjects: r.subjects, products: r.products }]));
});
