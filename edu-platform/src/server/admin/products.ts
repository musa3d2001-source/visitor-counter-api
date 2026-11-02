import "server-only";
import { randomUUID } from "node:crypto";
import { sql, type Db } from "../db";
import { storage } from "../storage";
import { extractPreview } from "../access/pdf";
import { audit } from "../platform/audit";
import { AdminError } from "./common";
import { PDF_PRODUCT_TYPES, type ProductStatus, type ProductType } from "@/lib/labels";
import { randomSuffix } from "@/lib/utils";

export type AdminProductRow = {
  id: string;
  slug: string;
  type: ProductType;
  title: string;
  status: ProductStatus;
  price_fils: number;
  compare_at_price_fils: number | null;
  sort_order: number;
  term: number | null;
  academic_year: string;
  cover_key: string | null;
  grade_id: string;
  grade_name: string;
  subject_id: string | null;
  subject_name: string | null;
  main_files: number;
  has_preview: boolean;
  sold: number;
  updated_at: Date;
};

export type ProductFilters = {
  q?: string;
  gradeId?: string;
  subjectId?: string;
  type?: string;
  status?: string;
};

export async function listAdminProducts(f: ProductFilters, limit = 300): Promise<AdminProductRow[]> {
  const q = f.q?.trim();
  return sql<AdminProductRow[]>`
    select p.id, p.slug, p.type, p.title, p.status, p.price_fils, p.compare_at_price_fils, p.sort_order, p.term,
      p.academic_year, p.cover_key, p.grade_id, g.name as grade_name, p.subject_id, s.name as subject_name, p.updated_at,
      (select count(*)::int from product_files pf where pf.product_id = p.id and pf.kind = 'main') as main_files,
      exists (select 1 from product_files pf where pf.product_id = p.id and pf.kind = 'preview') as has_preview,
      (select count(*)::int from order_items oi join orders o on o.id = oi.order_id
        where oi.product_id = p.id and o.status = 'paid' and not o.is_test) as sold
    from products p
    join grades g on g.id = p.grade_id
    left join subjects s on s.id = p.subject_id
    where true
      ${q ? sql`and (p.title ilike ${"%" + q + "%"} or p.slug ilike ${"%" + q + "%"})` : sql``}
      ${f.gradeId ? sql`and p.grade_id = ${f.gradeId}` : sql``}
      ${f.subjectId ? sql`and p.subject_id = ${f.subjectId}` : sql``}
      ${f.type ? sql`and p.type = ${f.type}` : sql``}
      ${f.status ? sql`and p.status = ${f.status}` : sql`and p.status <> 'archived'`}
    order by g.level, s.sort_order nulls first, p.sort_order, p.created_at desc
    limit ${limit}
  `;
}

export type AdminProduct = {
  id: string;
  slug: string;
  type: ProductType;
  title: string;
  summary: string;
  description: string;
  contents: string;
  grade_id: string;
  grade_name: string;
  grade_level: number;
  subject_id: string | null;
  subject_name: string | null;
  academic_year: string;
  term: number | null;
  price_fils: number;
  compare_at_price_fils: number | null;
  cover_key: string | null;
  status: ProductStatus;
  is_downloadable: boolean;
  is_featured: boolean;
  preview_pages: number;
  sort_order: number;
  page_count: number | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export async function getAdminProduct(id: string): Promise<AdminProduct | null> {
  const [p] = await sql<AdminProduct[]>`
    select p.*, g.name as grade_name, g.level as grade_level, s.name as subject_name
    from products p join grades g on g.id = p.grade_id left join subjects s on s.id = p.subject_id
    where p.id = ${id}
  `;
  return p ?? null;
}

export type AdminFile = {
  id: string;
  kind: "main" | "preview";
  title: string;
  storage_key: string;
  original_name: string;
  size_bytes: number;
  page_count: number | null;
  is_auto_preview: boolean;
  sort_order: number;
  created_at: Date;
};

export async function getProductFiles(productId: string, db: Db = sql): Promise<AdminFile[]> {
  const rows = await db<(Omit<AdminFile, "size_bytes"> & { size_bytes: string | number })[]>`
    select id, kind, title, storage_key, original_name, size_bytes, page_count, is_auto_preview, sort_order, created_at
    from product_files where product_id = ${productId}
    order by kind, sort_order, created_at
  `;
  return rows.map((r) => ({ ...r, size_bytes: Number(r.size_bytes) }));
}

/** إنشاء رابط (slug) لاتيني تلقائي من الصف والمادة والنوع + لاحقة عشوائية */
export async function generateProductSlug(gradeId: string, subjectId: string | null, type: ProductType, db: Db = sql): Promise<string> {
  const [g] = await db<{ level: number }[]>`select level from grades where id = ${gradeId}`;
  let subj = "all";
  if (subjectId) {
    const [s] = await db<{ slug: string }[]>`select slug from subjects where id = ${subjectId}`;
    if (s) subj = s.slug;
  }
  return `g${g?.level ?? 0}-${subj}-${type.replace(/_/g, "-")}-${randomSuffix(5)}`.slice(0, 120);
}

export type ProductInput = {
  type: ProductType;
  title: string;
  summary: string;
  description: string;
  contents: string;
  gradeId: string;
  subjectId: string | null;
  academicYear: string;
  term: number | null;
  priceFils: number;
  compareAtPriceFils: number | null;
  isDownloadable: boolean;
  isFeatured: boolean;
  previewPages: number;
  sortOrder: number;
  slug?: string;
};

async function assertSubjectBelongsToGrade(subjectId: string | null, gradeId: string) {
  if (!subjectId) return;
  const [s] = await sql<{ grade_id: string }[]>`select grade_id from subjects where id = ${subjectId}`;
  if (!s || s.grade_id !== gradeId) throw new AdminError("المادة المختارة لا تتبع هذا الصف", { subjectId: "اختر مادة من نفس الصف" });
}

function assertPrices(input: ProductInput) {
  if (input.compareAtPriceFils !== null && input.compareAtPriceFils <= input.priceFils) {
    throw new AdminError("السعر السابق يجب أن يكون أكبر من السعر الحالي", { compareAtPrice: "اتركه فارغًا إن لم يكن هناك عرض حقيقي" });
  }
  if (input.type !== "bundle" && input.type !== "video_course" && !input.subjectId) {
    throw new AdminError("اختر المادة", { subjectId: "المادة مطلوبة لهذا النوع" });
  }
}

export async function createProduct(input: ProductInput, adminId: string): Promise<string> {
  assertPrices(input);
  await assertSubjectBelongsToGrade(input.subjectId, input.gradeId);
  const slug = input.slug || (await generateProductSlug(input.gradeId, input.subjectId, input.type));
  const [row] = await sql<{ id: string }[]>`
    insert into products (slug, type, title, summary, description, contents, grade_id, subject_id, academic_year, term,
      price_fils, compare_at_price_fils, status, is_downloadable, is_featured, preview_pages, sort_order, created_by)
    values (${slug}, ${input.type}, ${input.title}, ${input.summary}, ${input.description}, ${input.contents},
      ${input.gradeId}, ${input.subjectId}, ${input.academicYear}, ${input.term}, ${input.priceFils}, ${input.compareAtPriceFils},
      'draft', ${input.isDownloadable}, ${input.isFeatured}, ${input.previewPages}, ${input.sortOrder}, ${adminId})
    returning id
  `;
  await audit({ actorId: adminId, action: "product.create", entityType: "product", entityId: row.id, metadata: { title: input.title, priceFils: input.priceFils, type: input.type } });
  return row.id;
}

export async function updateProduct(id: string, input: ProductInput, adminId: string) {
  const current = await getAdminProduct(id);
  if (!current) throw new AdminError("المنتج غير موجود");
  if (current.type !== input.type) {
    // تغيير النوع من/إلى باقة يربك محتويات الباقة — نمنعه بعد الإنشاء
    if (current.type === "bundle" || input.type === "bundle") throw new AdminError("لا يمكن تحويل الباقة إلى نوع آخر أو العكس بعد الإنشاء");
  }
  assertPrices(input);
  await assertSubjectBelongsToGrade(input.subjectId, input.gradeId);
  const slug = input.slug || current.slug;
  await sql`
    update products set
      slug = ${slug}, type = ${input.type}, title = ${input.title}, summary = ${input.summary}, description = ${input.description},
      contents = ${input.contents}, grade_id = ${input.gradeId}, subject_id = ${input.subjectId}, academic_year = ${input.academicYear},
      term = ${input.term}, price_fils = ${input.priceFils}, compare_at_price_fils = ${input.compareAtPriceFils},
      is_downloadable = ${input.isDownloadable}, is_featured = ${input.isFeatured}, preview_pages = ${input.previewPages},
      sort_order = ${input.sortOrder}
    where id = ${id}
  `;
  const changes: Record<string, unknown> = {};
  if (current.price_fils !== input.priceFils) changes.price = { from: current.price_fils, to: input.priceFils };
  if (current.compare_at_price_fils !== input.compareAtPriceFils) changes.compareAt = { from: current.compare_at_price_fils, to: input.compareAtPriceFils };
  if (current.title !== input.title) changes.title = { from: current.title, to: input.title };
  if (current.is_downloadable !== input.isDownloadable) changes.downloadable = input.isDownloadable;
  if (current.grade_id !== input.gradeId || current.subject_id !== input.subjectId) changes.placement = { gradeId: input.gradeId, subjectId: input.subjectId };
  await audit({
    actorId: adminId,
    action: changes.price ? "product.price_change" : "product.update",
    entityType: "product",
    entityId: id,
    metadata: changes,
  });
  if (current.preview_pages !== input.previewPages) await regenerateAutoPreview(id);
}

/** شروط النشر: ملف رئيسي لمنتجات PDF، عناصر للباقة، درس منشور لدورات الفيديو */
export async function publishBlockers(productId: string): Promise<string[]> {
  const p = await getAdminProduct(productId);
  if (!p) return ["المنتج غير موجود"];
  const issues: string[] = [];
  if (PDF_PRODUCT_TYPES.includes(p.type)) {
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from product_files where product_id = ${productId} and kind = 'main'`;
    if (n === 0) issues.push("ارفع ملف PDF واحدًا على الأقل قبل النشر");
  }
  if (p.type === "bundle") {
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from bundle_items where bundle_id = ${productId}`;
    if (n === 0) issues.push("أضف منتجًا واحدًا على الأقل إلى الباقة قبل النشر");
  }
  if (p.type === "video_course") {
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from lessons where product_id = ${productId} and is_published`;
    if (n === 0) issues.push("أضف درس فيديو منشورًا واحدًا على الأقل قبل النشر");
  }
  if (!p.title.trim()) issues.push("العنوان مطلوب");
  return issues;
}

export async function setProductStatus(id: string, status: ProductStatus, adminId: string, ip?: string) {
  const current = await getAdminProduct(id);
  if (!current) throw new AdminError("المنتج غير موجود");
  if (status === "published") {
    const issues = await publishBlockers(id);
    if (issues.length) throw new AdminError(issues.join("، "));
  }
  await sql`
    update products set status = ${status},
      published_at = case when ${status} = 'published' then coalesce(published_at, now()) else published_at end
    where id = ${id}
  `;
  await audit({ actorId: adminId, action: "product.status", entityType: "product", entityId: id, metadata: { from: current.status, to: status }, ip });
}

/** حذف نهائي فقط إن لم يرتبط المنتج بطلبات أو صلاحيات؛ وإلا أرشفة */
export async function deleteOrArchiveProduct(id: string, adminId: string, ip?: string): Promise<"deleted" | "archived"> {
  const current = await getAdminProduct(id);
  if (!current) throw new AdminError("المنتج غير موجود");
  const [{ orders, ents, inBundles }] = await sql<{ orders: number; ents: number; inBundles: number }[]>`
    select
      (select count(*)::int from order_items where product_id = ${id}) as orders,
      (select count(*)::int from entitlements where product_id = ${id}) as ents,
      (select count(*)::int from bundle_items where product_id = ${id}) as "inBundles"
  `;
  if (orders > 0 || ents > 0) {
    await sql`update products set status = 'archived' where id = ${id}`;
    await audit({ actorId: adminId, action: "product.archive", entityType: "product", entityId: id, reason: "مرتبط بطلبات أو صلاحيات — أرشفة بدل الحذف", ip });
    return "archived";
  }
  if (inBundles > 0) throw new AdminError("المنتج ضمن باقة. أزله من الباقات أولًا أو استخدم الإخفاء.");
  const files = await getProductFiles(id);
  const lessons = await sql<{ provider: string; video_ref: string }[]>`select provider, video_ref from lessons where product_id = ${id}`;
  await sql`delete from products where id = ${id}`;
  for (const f of files) await storage().remove("private", f.storage_key).catch(() => {});
  for (const l of lessons) if (l.provider === "file") await storage().remove("private", l.video_ref).catch(() => {});
  if (current.cover_key) await storage().remove("public", current.cover_key).catch(() => {});
  await audit({ actorId: adminId, action: "product.delete", entityType: "product", entityId: id, metadata: { title: current.title, slug: current.slug }, ip });
  return "deleted";
}

/** تحديث مجموع صفحات الملفات الرئيسية */
export async function refreshPageCount(productId: string) {
  await sql`
    update products set page_count = (
      select nullif(sum(coalesce(page_count, 0)), 0)::int from product_files where product_id = ${productId} and kind = 'main'
    ) where id = ${productId}
  `;
}

/**
 * توليد المعاينة المجانية تلقائيًا من أول ملف رئيسي (عدد الصفحات = preview_pages)
 * لا يلمس المعاينة المرفوعة يدويًا.
 */
export async function regenerateAutoPreview(productId: string): Promise<"custom" | "generated" | "none"> {
  const files = await getProductFiles(productId);
  if (files.some((f) => f.kind === "preview" && !f.is_auto_preview)) return "custom";
  const autos = files.filter((f) => f.kind === "preview" && f.is_auto_preview);
  for (const a of autos) {
    await sql`delete from product_files where id = ${a.id}`;
    await storage().remove("private", a.storage_key).catch(() => {});
  }
  const [p] = await sql<{ preview_pages: number }[]>`select preview_pages from products where id = ${productId}`;
  const firstMain = files.find((f) => f.kind === "main");
  if (!p || p.preview_pages <= 0 || !firstMain) return "none";
  const bytes = await storage().read("private", firstMain.storage_key);
  const preview = await extractPreview(bytes, p.preview_pages);
  const key = `previews/${productId}/${randomUUID()}.pdf`;
  await storage().put("private", key, preview.bytes, "application/pdf");
  await sql`
    insert into product_files (product_id, kind, title, storage_key, original_name, mime_type, size_bytes, page_count, is_auto_preview)
    values (${productId}, 'preview', 'معاينة مجانية', ${key}, 'preview.pdf', 'application/pdf', ${preview.bytes.length}, ${preview.pageCount}, true)
  `;
  return "generated";
}

export async function deleteProductFile(productId: string, fileId: string, adminId: string) {
  const [f] = await sql<{ id: string; kind: string; storage_key: string; title: string; is_auto_preview: boolean }[]>`
    select id, kind, storage_key, title, is_auto_preview from product_files where id = ${fileId} and product_id = ${productId}
  `;
  if (!f) throw new AdminError("الملف غير موجود");
  if (f.kind === "main") {
    const [p] = await sql<{ status: string; type: ProductType }[]>`select status, type from products where id = ${productId}`;
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from product_files where product_id = ${productId} and kind = 'main'`;
    if (p?.status === "published" && n <= 1 && PDF_PRODUCT_TYPES.includes(p.type)) {
      throw new AdminError("لا يمكن حذف آخر ملف لمنتج منشور. أخفِ المنتج أولًا أو ارفع ملفًا بديلًا.");
    }
  }
  await sql`delete from product_files where id = ${fileId}`;
  await storage().remove("private", f.storage_key).catch(() => {});
  await audit({ actorId: adminId, action: "product.file_delete", entityType: "product", entityId: productId, metadata: { fileId, title: f.title, kind: f.kind } });
  if (f.kind === "main" || (f.kind === "preview" && !f.is_auto_preview)) await regenerateAutoPreview(productId);
  if (f.kind === "main") await refreshPageCount(productId);
}

export async function moveProductFile(productId: string, fileId: string, dir: "up" | "down") {
  const files = (await getProductFiles(productId)).filter((f) => f.kind === "main");
  const idx = files.findIndex((f) => f.id === fileId);
  const swapWith = dir === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapWith < 0 || swapWith >= files.length) return;
  const reordered = [...files];
  [reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]];
  await sql.begin(async (tx) => {
    for (let i = 0; i < reordered.length; i++) await tx`update product_files set sort_order = ${i} where id = ${reordered[i].id}`;
  });
  if (idx === 0 || swapWith === 0) await regenerateAutoPreview(productId);
}

export async function renameProductFile(productId: string, fileId: string, title: string) {
  await sql`update product_files set title = ${title} where id = ${fileId} and product_id = ${productId}`;
}

// ---------------------------------------------------------------------------
// الباقات
// ---------------------------------------------------------------------------

export type BundleItemRow = { product_id: string; title: string; type: ProductType; price_fils: number; status: string; subject_name: string | null; sort_order: number };

export async function getBundleItemsAdmin(bundleId: string): Promise<BundleItemRow[]> {
  return sql<BundleItemRow[]>`
    select bi.product_id, p.title, p.type, p.price_fils, p.status, s.name as subject_name, bi.sort_order
    from bundle_items bi join products p on p.id = bi.product_id left join subjects s on s.id = p.subject_id
    where bi.bundle_id = ${bundleId}
    order by bi.sort_order, p.title
  `;
}

export async function bundleCandidates(bundleId: string, gradeId: string) {
  return sql<{ id: string; title: string; type: ProductType; price_fils: number; status: string; subject_name: string | null }[]>`
    select p.id, p.title, p.type, p.price_fils, p.status, s.name as subject_name
    from products p left join subjects s on s.id = p.subject_id
    where p.grade_id = ${gradeId} and p.type <> 'bundle' and p.status <> 'archived' and p.id <> ${bundleId}
      and not exists (select 1 from bundle_items bi where bi.bundle_id = ${bundleId} and bi.product_id = p.id)
    order by s.sort_order nulls first, p.sort_order, p.title
  `;
}

export async function addBundleItem(bundleId: string, productId: string, adminId: string) {
  const [b] = await sql<{ type: string; grade_id: string }[]>`select type, grade_id from products where id = ${bundleId}`;
  if (!b || b.type !== "bundle") throw new AdminError("هذا المنتج ليس باقة");
  const [p] = await sql<{ type: string; grade_id: string }[]>`select type, grade_id from products where id = ${productId}`;
  if (!p) throw new AdminError("المنتج غير موجود");
  if (p.type === "bundle") throw new AdminError("لا يمكن وضع باقة داخل باقة");
  const [{ next }] = await sql<{ next: number }[]>`select coalesce(max(sort_order), -1)::int + 1 as next from bundle_items where bundle_id = ${bundleId}`;
  await sql`insert into bundle_items (bundle_id, product_id, sort_order) values (${bundleId}, ${productId}, ${next}) on conflict do nothing`;
  await audit({ actorId: adminId, action: "bundle.add_item", entityType: "product", entityId: bundleId, metadata: { productId } });
}

export async function removeBundleItem(bundleId: string, productId: string, adminId: string) {
  const [b] = await sql<{ status: string }[]>`select status from products where id = ${bundleId}`;
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from bundle_items where bundle_id = ${bundleId}`;
  if (b?.status === "published" && n <= 1) throw new AdminError("لا يمكن إفراغ باقة منشورة. أخفِ الباقة أولًا.");
  await sql`delete from bundle_items where bundle_id = ${bundleId} and product_id = ${productId}`;
  await audit({ actorId: adminId, action: "bundle.remove_item", entityType: "product", entityId: bundleId, metadata: { productId } });
}

export async function listBundlesAdmin() {
  return sql<
    {
      id: string;
      title: string;
      status: ProductStatus;
      price_fils: number;
      grade_name: string;
      item_count: number;
      items_total: number;
      sold: number;
    }[]
  >`
    select p.id, p.title, p.status, p.price_fils, g.name as grade_name,
      (select count(*)::int from bundle_items bi where bi.bundle_id = p.id) as item_count,
      (select coalesce(sum(ip.price_fils), 0)::int from bundle_items bi join products ip on ip.id = bi.product_id where bi.bundle_id = p.id) as items_total,
      (select count(*)::int from order_items oi join orders o on o.id = oi.order_id where oi.product_id = p.id and o.status = 'paid' and not o.is_test) as sold
    from products p join grades g on g.id = p.grade_id
    where p.type = 'bundle' and p.status <> 'archived'
    order by g.level, p.sort_order, p.created_at desc
  `;
}

// ---------------------------------------------------------------------------
// دروس الفيديو
// ---------------------------------------------------------------------------

export type AdminLesson = {
  id: string;
  unit_title: string;
  title: string;
  description: string;
  provider: "file" | "bunny";
  video_ref: string;
  size_bytes: string | number | null;
  duration_seconds: number | null;
  is_free_preview: boolean;
  is_published: boolean;
  sort_order: number;
};

export async function getLessonsAdmin(productId: string): Promise<AdminLesson[]> {
  return sql<AdminLesson[]>`
    select id, unit_title, title, description, provider, video_ref, size_bytes, duration_seconds, is_free_preview, is_published, sort_order
    from lessons where product_id = ${productId} order by sort_order, created_at
  `;
}

export async function nextLessonOrder(productId: string): Promise<number> {
  const [{ next }] = await sql<{ next: number }[]>`select coalesce(max(sort_order), -1)::int + 1 as next from lessons where product_id = ${productId}`;
  return next;
}

export async function deleteLesson(productId: string, lessonId: string, adminId: string) {
  const [l] = await sql<{ provider: string; video_ref: string; title: string }[]>`
    select provider, video_ref, title from lessons where id = ${lessonId} and product_id = ${productId}
  `;
  if (!l) throw new AdminError("الدرس غير موجود");
  await sql`delete from lessons where id = ${lessonId}`;
  if (l.provider === "file") await storage().remove("private", l.video_ref).catch(() => {});
  await audit({ actorId: adminId, action: "lesson.delete", entityType: "product", entityId: productId, metadata: { lessonId, title: l.title } });
}

export async function moveLesson(productId: string, lessonId: string, dir: "up" | "down") {
  const lessons = await getLessonsAdmin(productId);
  const idx = lessons.findIndex((l) => l.id === lessonId);
  const swapWith = dir === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapWith < 0 || swapWith >= lessons.length) return;
  const reordered = [...lessons];
  [reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]];
  await sql.begin(async (tx) => {
    for (let i = 0; i < reordered.length; i++) await tx`update lessons set sort_order = ${i} where id = ${reordered[i].id}`;
  });
}

/** قوائم الصفوف والمواد لنماذج الإدارة (تشمل غير المنشورة) */
export async function catalogOptions() {
  const grades = await sql<{ id: string; name: string; level: number; stage_name: string; is_published: boolean }[]>`
    select g.id, g.name, g.level, st.name as stage_name, g.is_published
    from grades g join stages st on st.id = g.stage_id
    order by st.sort_order, g.sort_order, g.level
  `;
  const subjects = await sql<{ id: string; name: string; grade_id: string; is_published: boolean }[]>`
    select id, name, grade_id, is_published from subjects order by sort_order, name
  `;
  return { grades, subjects };
}
