import "server-only";
import { servablePreviewSql } from "../access/preview-rule";
import { cache } from "react";
import { sql } from "../db";
import { storage } from "../storage";
import { getSettings } from "../platform/settings";
import { bunnyThumbnailUrl } from "../video/bunny";
import { videoCloseFlags, type VideoCloseFlags } from "../video/policy";
import { isVideoType, TEACHER_PAGE_ORDER, VIDEO_PRODUCT_TYPES, type ProductType } from "@/lib/labels";

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
  teacherName: string | null;
  teacherSlug: string | null;
  teacherPhotoUrl: string | null;
  /** منتج فيديو (نوعه فيديو أو يحتوي دروسًا مرئية) */
  isVideo: boolean;
  /** عدد الدروس المنشورة والجاهزة (يشمل محتويات الحاوية) */
  lessonCount: number;
  totalDurationSeconds: number;
  /** أول درس مجاني جاهز للمعاينة */
  previewLessonId: string | null;
  /** صورة البطاقة: الغلاف، أو صورة أول درس، أو صورة Bunny التلقائية */
  thumbnailUrl: string | null;
  /** انتهى تاريخ إتاحته: لا يدخل السلة ولا يُفوتر */
  saleEnded?: boolean;
};

export type TeacherBrief = { id: string; slug: string; name: string; headline: string; photoUrl: string | null };

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
  teacher: TeacherBrief | null;
  accessMode: "unlimited" | "until_date" | "days";
  accessUntil: Date | null;
  accessDays: number | null;
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
  teacher_name: string | null;
  teacher_slug: string | null;
  teacher_photo_key: string | null;
  lesson_count: number;
  total_duration: number;
  preview_lesson_id: string | null;
  lesson_thumb_key: string | null;
  bunny_ref: string | null;
  sale_ended: boolean;
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
    teacherName: r.teacher_name,
    teacherSlug: r.teacher_slug,
    teacherPhotoUrl: coverUrl(r.teacher_photo_key),
    isVideo: isVideoType(r.type) || r.lesson_count > 0,
    lessonCount: r.lesson_count,
    totalDurationSeconds: r.total_duration,
    previewLessonId: r.preview_lesson_id,
    thumbnailUrl: coverUrl(r.cover_key) ?? coverUrl(r.lesson_thumb_key) ?? (r.bunny_ref ? bunnyThumbnailUrl(r.bunny_ref, "thumbnail.jpg") : null),
    saleEnded: r.sale_ended,
  };
}

/** أعمدة بطاقة المنتج — تُستخدم داخل استعلامات الكتالوج */
const cardColumns = () => sql`
  p.id, p.slug, p.type, p.title, p.summary, p.price_fils, p.compare_at_price_fils, p.cover_key,
  g.name as grade_name, g.slug as grade_slug, s.name as subject_name, s.slug as subject_slug,
  p.term, p.academic_year, p.is_featured, p.page_count,
  exists (select 1 from product_files pf where pf.product_id = p.id and ${servablePreviewSql("pf")}) as has_preview,
  (select t.display_name from teachers t where t.id = p.teacher_id) as teacher_name,
  (select t.slug from teachers t where t.id = p.teacher_id and t.is_published) as teacher_slug,
  (select t.photo_key from teachers t where t.id = p.teacher_id) as teacher_photo_key,
  vs.lesson_count, vs.total_duration, vs.preview_lesson_id, vs.lesson_thumb_key, vs.bunny_ref,
  (p.access_mode = 'until_date' and p.access_until is not null and p.access_until <= now()) as sale_ended
`;

/**
 * إحصاءات الفيديو لكل منتج عبر محتوياته (بأي عمق) — الدروس المنشورة والجاهزة فقط.
 * يُستخدم كـ LEFT JOIN LATERAL بعد جدول المنتجات (p).
 */
const videoStats = () => sql`
  left join lateral (
    with recursive c(id, depth) as (
      select p.id, 0
      union
      select bi.product_id, c.depth + 1 from bundle_items bi join c on bi.bundle_id = c.id where c.depth < 4
    ),
    vl as (
      select l.id, l.duration_seconds, l.thumbnail_key, l.provider, l.video_ref, l.is_free_preview, l.sort_order, l.created_at, c.depth, l.product_id
      from lessons l join c on l.product_id = c.id join products cp on cp.id = c.id
      where l.is_published and l.processing_status = 'ready' and (c.depth = 0 or cp.status in ('published', 'hidden'))
    )
    select
      (select count(*)::int from vl) as lesson_count,
      (select coalesce(sum(duration_seconds), 0)::int from vl) as total_duration,
      (select vl.id from vl join products lp on lp.id = vl.product_id where vl.is_free_preview and lp.status = 'published' order by vl.depth, vl.sort_order, vl.created_at limit 1) as preview_lesson_id,
      (select thumbnail_key from vl where thumbnail_key is not null order by depth, sort_order, created_at limit 1) as lesson_thumb_key,
      (select video_ref from vl where provider = 'bunny' order by depth, sort_order, created_at limit 1) as bunny_ref,
      exists (select 1 from vl where provider = 'file') as has_file_lesson,
      exists (select 1 from c join products cp on cp.id = c.id where (c.depth = 0 or cp.status in ('published', 'hidden')) and cp.type = any(${VIDEO_PRODUCT_TYPES}::text[])) as has_video_item
  ) vs on true
`;

/** لا تُعرض في القوائم العامة منتجات فيديو أُغلق بيعها، فلا يرى الطالب سعرًا أو معاينة لما لا يستطيع شراءه. صفحة المنتج نفسها تبقى لمن اشتراه */
const hideClosedVideo = ({ allClosed, rawClosed }: VideoCloseFlags) => sql`
  and not (${allClosed}::boolean and (vs.has_video_item or vs.lesson_count > 0))
  and not (${rawClosed}::boolean and vs.has_file_lesson)
`;

const currentCloseFlags = async () => videoCloseFlags(await getSettings());

/** معاينات المنتجات المغلقة لا تعمل، فلا يبقى لها رابط أو شارة في القوائم التي لا تُخفيها */
async function stripClosedPreviews(cards: ProductCard[]): Promise<ProductCard[]> {
  const { allClosed } = await currentCloseFlags();
  return allClosed ? cards.map((c) => ({ ...c, previewLessonId: null })) : cards;
}

const visibleJoin = () => sql`
  from products p
  ${videoStats()}
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
  const closed = await currentCloseFlags();
  const rows = await sql<
    { id: string; slug: string; name: string; level: number; current_term: number; stage_id: string; stage_slug: string; stage_name: string }[]
  >`
    select g.id, g.slug, g.name, g.level, g.current_term, g.stage_id, st.slug as stage_slug, st.name as stage_name
    from grades g join stages st on st.id = g.stage_id
    where g.is_published and st.is_published
      and exists (
        select 1 from products p ${videoStats()} left join subjects s on s.id = p.subject_id
        where p.grade_id = g.id and p.status = 'published' and (p.subject_id is null or s.is_published)
          ${hideClosedVideo(closed)}
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
  const closed = await currentCloseFlags();
  const rows = await sql<{ id: string; slug: string; name: string; icon: string; grade_id: string; product_count: number }[]>`
    select s.id, s.slug, s.name, s.icon, s.grade_id,
      (select count(*)::int from products p ${videoStats()} where p.subject_id = s.id and p.status = 'published' ${hideClosedVideo(closed)}) as product_count
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
  const closed = await currentCloseFlags();
  const rows = await sql<ProductRow[]>`
    select ${cardColumns()}
    ${visibleJoin()}
      ${opts.gradeId ? sql`and p.grade_id = ${opts.gradeId}` : sql``}
      ${opts.subjectId ? sql`and p.subject_id = ${opts.subjectId}` : sql``}
      ${opts.type ? sql`and p.type = ${opts.type}` : sql``}
      ${opts.excludeType ? sql`and p.type <> ${opts.excludeType}` : sql``}
      ${opts.term ? sql`and (p.term = ${opts.term} or p.term is null)` : sql``}
      ${opts.featuredOnly ? sql`and p.is_featured` : sql``}
      ${hideClosedVideo(closed)}
    order by ${opts.order === "latest" ? sql`p.published_at desc nulls last, p.created_at desc` : sql`p.sort_order, p.published_at desc nulls last`}
    limit ${opts.limit ?? 200}
  `;
  return rows.map(toCard);
}

/** الأكثر طلبًا — من بيانات مبيعات حقيقية فقط (طلبات مدفوعة غير تجريبية) */
export async function bestSellers(opts: { gradeId?: string; limit?: number }): Promise<ProductCard[]> {
  const closed = await currentCloseFlags();
  const rows = await sql<(ProductRow & { sold: number })[]>`
    select ${cardColumns()}, sales.sold
    from (
      select oi.product_id, count(*)::int as sold
      from order_items oi join orders o on o.id = oi.order_id
      where o.status = 'paid' and not o.is_test
      group by oi.product_id
    ) sales
    join products p on p.id = sales.product_id
    ${videoStats()}
    join grades g on g.id = p.grade_id and g.is_published
    join stages st on st.id = g.stage_id and st.is_published
    left join subjects s on s.id = p.subject_id
    where p.status = 'published' and (p.subject_id is null or s.is_published)
      ${opts.gradeId ? sql`and p.grade_id = ${opts.gradeId}` : sql``}
      ${hideClosedVideo(closed)}
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
      teacher_id: string | null;
      t_headline: string | null;
      t_published: boolean | null;
      access_mode: "unlimited" | "until_date" | "days";
      access_until: Date | null;
      access_days: number | null;
    })[]
  >`
    select ${cardColumns()}, p.description, p.contents, p.is_downloadable, p.status, p.grade_id, p.subject_id,
      st.name as stage_name, st.slug as stage_slug, p.published_at, p.updated_at,
      g.is_published as grade_pub, st.is_published as stage_pub, s.is_published as subject_pub,
      p.teacher_id, tt.headline as t_headline, tt.is_published as t_published,
      p.access_mode, p.access_until, p.access_days
    from products p
    ${videoStats()}
    left join teachers tt on tt.id = p.teacher_id
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
    teacher:
      r.teacher_id && r.teacher_name
        ? { id: r.teacher_id, slug: r.t_published ? (r.teacher_slug ?? "") : "", name: r.teacher_name, headline: r.t_headline ?? "", photoUrl: coverUrl(r.teacher_photo_key) }
        : null,
    accessMode: r.access_mode,
    accessUntil: r.access_until,
    accessDays: r.access_days,
  };
});

/** عناصر الباقة (المنشورة فقط للعرض العام) */
export async function getBundleItems(bundleId: string, opts: { includeUnpublished?: boolean } = {}): Promise<ProductCard[]> {
  const rows = await sql<ProductRow[]>`
    select ${cardColumns()}
    from bundle_items bi
    join products p on p.id = bi.product_id
    ${videoStats()}
    join grades g on g.id = p.grade_id
    left join subjects s on s.id = p.subject_id
    where bi.bundle_id = ${bundleId}
      ${opts.includeUnpublished ? sql`` : sql`and p.status = 'published'`}
    order by bi.sort_order, p.sort_order
  `;
  return stripClosedPreviews(rows.map(toCard));
}

/** الباقات المنشورة التي تتضمن هذا المنتج (لاقتراح التوفير) */
export async function getBundlesContaining(productId: string): Promise<ProductCard[]> {
  const closed = await currentCloseFlags();
  const rows = await sql<ProductRow[]>`
    select ${cardColumns()}
    ${visibleJoin()}
      and p.type = 'bundle'
      and exists (select 1 from bundle_items bi where bi.bundle_id = p.id and bi.product_id = ${productId})
      ${hideClosedVideo(closed)}
    order by p.sort_order
    limit 4
  `;
  return rows.map(toCard);
}

export type PublicFileInfo = { id: string; title: string; pageCount: number | null; kind: "main" | "preview" };

export async function getProductFilesInfo(productId: string): Promise<PublicFileInfo[]> {
  const rows = await sql<{ id: string; title: string; page_count: number | null; kind: "main" | "preview" }[]>`
    select pf.id, pf.title, pf.page_count, pf.kind from product_files pf
    where pf.product_id = ${productId} and (pf.kind = 'main' or ${servablePreviewSql("pf")})
    order by pf.kind, pf.sort_order, pf.created_at
  `;
  return rows.map((r) => ({ id: r.id, title: r.title, pageCount: r.page_count, kind: r.kind }));
}

export type LessonInfo = {
  id: string;
  productId: string;
  unitTitle: string;
  title: string;
  description: string;
  durationSeconds: number | null;
  isFreePreview: boolean;
  provider: "file" | "bunny";
  thumbnailUrl: string | null;
};

type LessonRowDb = {
  id: string;
  product_id: string;
  unit_title: string;
  title: string;
  description: string;
  duration_seconds: number | null;
  is_free_preview: boolean;
  provider: "file" | "bunny";
  thumbnail_key: string | null;
  video_ref: string;
};

function toLesson(r: LessonRowDb): LessonInfo {
  return {
    id: r.id,
    productId: r.product_id,
    unitTitle: r.unit_title,
    title: r.title,
    description: r.description,
    durationSeconds: r.duration_seconds,
    isFreePreview: r.is_free_preview,
    provider: r.provider,
    thumbnailUrl: coverUrl(r.thumbnail_key) ?? (r.provider === "bunny" ? bunnyThumbnailUrl(r.video_ref, "thumbnail.jpg") : null),
  };
}

/** دروس المنتج نفسه — المنشورة والجاهزة فقط (لا تُكشف الدروس قيد المعالجة أو غير المنشورة) */
export async function getLessons(productId: string): Promise<LessonInfo[]> {
  const rows = await sql<LessonRowDb[]>`
    select id, product_id, unit_title, title, description, duration_seconds, is_free_preview, provider, thumbnail_key, video_ref
    from lessons where product_id = ${productId} and is_published and processing_status = 'ready'
    order by sort_order, created_at
  `;
  return rows.map(toLesson);
}

export type PlaylistGroup = { key: string; title: string; productId: string; lessons: LessonInfo[] };

/**
 * قائمة تشغيل كاملة لمنتج: دروسه أولًا (مجمعة حسب الوحدة)، ثم دروس محتوياته بترتيب الحاوية (عمقًا أولًا).
 * الدروس المنشورة والجاهزة فقط؛ المحتويات المسودة أو قيد المراجعة لا تظهر.
 */
export async function getPlaylist(productId: string, opts: { includeUnready?: boolean } = {}): Promise<PlaylistGroup[]> {
  const tree = await sql<{ id: string; title: string; parent: string | null; sort_order: number; path: string }[]>`
    with recursive c(id, parent, sort_order, path, depth) as (
      select ${productId}::uuid, null::uuid, 0, '0000'::text, 0
      union
      select bi.product_id, c.id, bi.sort_order, c.path || '.' || lpad(bi.sort_order::text, 4, '0') || substr(bi.product_id::text, 1, 8), c.depth + 1
      from bundle_items bi join c on bi.bundle_id = c.id where c.depth < 4
    )
    select c.id, p.title, c.parent, c.sort_order, c.path
    from c join products p on p.id = c.id
    where c.depth = 0 or p.status in ('published', 'hidden')
    order by c.path
  `;
  if (!tree.length) return [];
  const ids = [...new Set(tree.map((t) => t.id))];
  const lessons = await sql<LessonRowDb[]>`
    select id, product_id, unit_title, title, description, duration_seconds, is_free_preview, provider, thumbnail_key, video_ref
    from lessons
    where product_id = any(${ids}::uuid[]) and is_published
      ${opts.includeUnready ? sql`` : sql`and processing_status = 'ready'`}
    order by sort_order, created_at
  `;
  const groups: PlaylistGroup[] = [];
  const seen = new Set<string>();
  for (const node of tree) {
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    const own = lessons.filter((l) => l.product_id === node.id).map(toLesson);
    if (!own.length) continue;
    // داخل المنتج: تجميع حسب عنوان الوحدة
    const byUnit = new Map<string, LessonInfo[]>();
    for (const l of own) {
      const k = l.unitTitle || "";
      byUnit.set(k, [...(byUnit.get(k) ?? []), l]);
    }
    for (const [unit, ls] of byUnit) {
      const isRoot = node.id === productId;
      const title = unit ? (isRoot ? unit : `${node.title}: ${unit}`) : isRoot ? "الدروس" : node.title;
      groups.push({ key: `${node.id}:${unit}`, title, productId: node.id, lessons: ls });
    }
  }
  return groups;
}

/** المحتويات المباشرة لحاوية (باقة/دورة/وحدة) — المنشورة فقط للعرض العام */
export async function includedProducts(productId: string): Promise<ProductCard[]> {
  return getBundleItems(productId);
}

/** أحدث منتجات الفيديو المنشورة (للصفحة الرئيسية) */
export async function latestVideoProducts(limit = 8): Promise<ProductCard[]> {
  const closed = await currentCloseFlags();
  const rows = await sql<ProductRow[]>`
    select ${cardColumns()}
    ${visibleJoin()}
      and p.type <> 'bundle'
      and vs.lesson_count > 0
      ${hideClosedVideo(closed)}
    order by p.is_featured desc, p.published_at desc nulls last, p.created_at desc
    limit ${limit}
  `;
  return rows.map(toCard);
}

/** ما يراه الزائر الآن فعلًا، بقاعدة القوائم نفسها. منه يتقرر أي ادعاء عن المحتوى يصح قوله */
export const catalogOfferings = cache(async (): Promise<{ video: boolean; notes: boolean; content: boolean; teachers: number }> => {
  const closed = await currentCloseFlags();
  const [r] = await sql<{ video: boolean; notes: boolean; products: number; teachers: number }[]>`
    select
      coalesce(bool_or(p.type <> 'bundle' and vs.lesson_count > 0), false) as video,
      coalesce(bool_or(p.type <> 'bundle' and not (p.type = any(${VIDEO_PRODUCT_TYPES}::text[]))), false) as notes,
      count(*)::int as products,
      (select count(*)::int from teachers t where t.is_published) as teachers
    ${visibleJoin()}
      ${hideClosedVideo(closed)}
  `;
  return { video: r.video, notes: r.notes, content: r.products > 0, teachers: r.teachers };
});

// ---------------------------------------------------------------------------
// المعلمون
// ---------------------------------------------------------------------------

export type TeacherCard = {
  id: string;
  slug: string;
  name: string;
  headline: string;
  bio: string;
  photoUrl: string | null;
  subjects: { id: string; name: string; slug: string; gradeName: string; gradeSlug: string; gradeLevel: number }[];
  productCount: number;
  videoCount: number;
  totalDurationSeconds: number;
};

type TeacherRowDb = {
  id: string;
  slug: string;
  display_name: string;
  headline: string;
  bio: string;
  photo_key: string | null;
  product_count: number;
  video_count: number;
  total_duration: number;
};

async function hydrateTeachers(rows: TeacherRowDb[], closed: VideoCloseFlags): Promise<TeacherCard[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  // مواد المعلم: المحددة في ملفه + المواد التي له فيها محتوى منشور
  const subs = await sql<{ teacher_id: string; id: string; name: string; slug: string; grade_name: string; grade_slug: string; grade_level: number; sort_order: number }[]>`
    select distinct x.teacher_id, s.id, s.name, s.slug, g.name as grade_name, g.slug as grade_slug, g.level as grade_level, s.sort_order
    from (
      select ts.teacher_id, ts.subject_id from teacher_subjects ts where ts.teacher_id = any(${ids}::uuid[])
      union
      select p.teacher_id, p.subject_id from products p ${videoStats()} where p.teacher_id = any(${ids}::uuid[]) and p.status = 'published' and p.subject_id is not null ${hideClosedVideo(closed)}
    ) x
    join subjects s on s.id = x.subject_id and s.is_published
    join grades g on g.id = s.grade_id and g.is_published
    join stages st on st.id = g.stage_id and st.is_published
    order by g.level, s.sort_order
  `;
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.display_name,
    headline: r.headline,
    bio: r.bio,
    photoUrl: coverUrl(r.photo_key),
    subjects: subs
      .filter((s) => s.teacher_id === r.id)
      .map((s) => ({ id: s.id, name: s.name, slug: s.slug, gradeName: s.grade_name, gradeSlug: s.grade_slug, gradeLevel: s.grade_level })),
    productCount: r.product_count,
    videoCount: r.video_count,
    totalDurationSeconds: r.total_duration,
  }));
}

/** بطاقة المعلم لا تعلن فيديو أُغلق: تُحسب دروس المنتجات التي تعرضها القوائم فقط، بالقاعدة نفسها حتى للمحتويات المتداخلة */
const openLessons = (closed: VideoCloseFlags) => sql`
  from products p
  ${videoStats()}
  join lessons l on l.product_id = p.id and l.is_published and l.processing_status = 'ready'
  where p.teacher_id = t.id and p.status in ('published', 'hidden')
    ${hideClosedVideo(closed)}
`;

const teacherColumns = (closed: VideoCloseFlags) => sql`
  t.id, t.slug, t.display_name, t.headline, t.bio, t.photo_key,
  (select count(*)::int from products p ${videoStats()} where p.teacher_id = t.id and p.status = 'published' ${hideClosedVideo(closed)}) as product_count,
  (select count(*)::int ${openLessons(closed)}) as video_count,
  (select coalesce(sum(l.duration_seconds), 0)::int ${openLessons(closed)}) as total_duration
`;

/** المعلمون المنشورون (مع تصفية اختيارية بالصف أو المادة) */
export async function listTeachers(opts: { gradeId?: string; subjectId?: string; limit?: number } = {}): Promise<TeacherCard[]> {
  const closed = await currentCloseFlags();
  const rows = await sql<TeacherRowDb[]>`
    select ${teacherColumns(closed)}
    from teachers t
    where t.is_published
      ${
        opts.subjectId
          ? sql`and (exists (select 1 from teacher_subjects ts where ts.teacher_id = t.id and ts.subject_id = ${opts.subjectId})
                 or exists (select 1 from products p ${videoStats()} where p.teacher_id = t.id and p.status = 'published' and p.subject_id = ${opts.subjectId} ${hideClosedVideo(closed)}))`
          : sql``
      }
      ${
        opts.gradeId
          ? sql`and (exists (select 1 from teacher_subjects ts join subjects s on s.id = ts.subject_id where ts.teacher_id = t.id and s.grade_id = ${opts.gradeId})
                 or exists (select 1 from products p ${videoStats()} where p.teacher_id = t.id and p.status = 'published' and p.grade_id = ${opts.gradeId} ${hideClosedVideo(closed)}))`
          : sql``
      }
    order by t.sort_order, t.display_name
    limit ${opts.limit ?? 200}
  `;
  return hydrateTeachers(rows, closed);
}

export const getTeacherBySlug = cache(async (slug: string, opts: { includeUnpublished?: boolean } = {}): Promise<(TeacherCard & { isPublished: boolean }) | null> => {
  const closed = await currentCloseFlags();
  const rows = await sql<(TeacherRowDb & { is_published: boolean })[]>`
    select ${teacherColumns(closed)}, t.is_published from teachers t where t.slug = ${slug}
  `;
  const r = rows[0];
  if (!r || (!r.is_published && !opts.includeUnpublished)) return null;
  const [card] = await hydrateTeachers([r], closed);
  return { ...card, isPublished: r.is_published };
});

export async function teachersForSubject(subjectId: string): Promise<TeacherCard[]> {
  return listTeachers({ subjectId });
}

export type TeacherContentGroup = {
  key: string;
  gradeName: string;
  gradeSlug: string;
  gradeLevel: number;
  subjectName: string | null;
  subjectSlug: string | null;
  sections: { type: ProductType; items: ProductCard[] }[];
};

/** محتوى المعلم المنشور: الصف ← المادة ← الأنواع بترتيب «ما قبل الاختبار أولًا» */
export async function teacherContent(teacherId: string): Promise<TeacherContentGroup[]> {
  const closed = await currentCloseFlags();
  const rows = await sql<(ProductRow & { grade_level: number; subject_sort: number | null })[]>`
    select ${cardColumns()}, g.level as grade_level, s.sort_order as subject_sort
    ${visibleJoin()}
      and p.teacher_id = ${teacherId}
      ${hideClosedVideo(closed)}
    order by g.level, s.sort_order nulls last, p.sort_order, p.published_at desc nulls last
  `;
  const groups = new Map<string, TeacherContentGroup>();
  for (const r of rows) {
    const key = `${r.grade_slug}:${r.subject_slug ?? "all"}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, gradeName: r.grade_name, gradeSlug: r.grade_slug, gradeLevel: r.grade_level, subjectName: r.subject_name, subjectSlug: r.subject_slug, sections: [] };
      groups.set(key, g);
    }
    const card = toCard(r);
    let sec = g.sections.find((x) => x.type === card.type);
    if (!sec) {
      sec = { type: card.type, items: [] };
      g.sections.push(sec);
    }
    sec.items.push(card);
  }
  for (const g of groups.values()) g.sections.sort((a, b) => TEACHER_PAGE_ORDER.indexOf(a.type) - TEACHER_PAGE_ORDER.indexOf(b.type));
  return [...groups.values()];
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
  const closed = await currentCloseFlags();
  const products = await sql<{ slug: string; updated_at: Date }[]>`
    select p.slug, p.updated_at ${visibleJoin()}
      ${hideClosedVideo(closed)}
  `;
  const grades = await listGrades();
  const subjects = await sql<{ grade_slug: string; slug: string }[]>`
    select g.slug as grade_slug, s.slug from subjects s join grades g on g.id = s.grade_id
    where s.is_published and g.is_published
      and exists (select 1 from products p ${videoStats()} where p.subject_id = s.id and p.status = 'published' ${hideClosedVideo(closed)})
  `;
  const stages = await listStages();
  const teachers = await sql<{ slug: string; updated_at: Date }[]>`select slug, updated_at from teachers where is_published`;
  return { products, grades, subjects, stages, teachers };
}

/** إحصاءات حقيقية لكل صف (عدد المواد والمنتجات المنشورة) */
export const gradeStats = cache(async (): Promise<Map<string, { subjects: number; products: number }>> => {
  const closed = await currentCloseFlags();
  const rows = await sql<{ grade_id: string; subjects: number; products: number }[]>`
    select p.grade_id,
      count(distinct p.subject_id) filter (where s.is_published)::int as subjects,
      count(*)::int as products
    from products p ${videoStats()} left join subjects s on s.id = p.subject_id
    where p.status = 'published' and (p.subject_id is null or s.is_published)
      ${hideClosedVideo(closed)}
    group by p.grade_id
  `;
  return new Map(rows.map((r) => [r.grade_id, { subjects: r.subjects, products: r.products }]));
});
