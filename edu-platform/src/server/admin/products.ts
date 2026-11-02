import "server-only";
import { randomUUID } from "node:crypto";
import { sql, type Db } from "../db";
import { storage } from "../storage";
import { extractPreview } from "../access/pdf";
import { audit } from "../platform/audit";
import { assertProductAccess, PermissionError, type Actor } from "../auth/permissions";
import { deleteVideo } from "../video/bunny";
import { AdminError } from "./common";
import { CONTAINER_PRODUCT_TYPES, PDF_PRODUCT_TYPES, VIDEO_PRODUCT_TYPES, isContainerType, type ProductStatus, type ProductType } from "@/lib/labels";
import { randomSuffix } from "@/lib/utils";

/**
 * إدارة المنتجات للمالك والمعلم (لوحة واحدة):
 *  - المالك: كل المنتجات وكل الحقول
 *  - المعلم: منتجاته فقط، يعدّل المسودات فقط، لا يغيّر السعر المعتمد أو الحالة إلى «منشور»
 * كل دالة تستقبل الفاعل (Actor) وتفرض القيود على الخادم.
 */

export type AdminProductRow = {
  id: string;
  slug: string;
  type: ProductType;
  title: string;
  status: ProductStatus;
  price_fils: number;
  compare_at_price_fils: number | null;
  proposed_price_fils: number | null;
  sort_order: number;
  term: number | null;
  academic_year: string;
  cover_key: string | null;
  grade_id: string;
  grade_name: string;
  subject_id: string | null;
  subject_name: string | null;
  teacher_id: string | null;
  teacher_name: string | null;
  main_files: number;
  lessons: number;
  items: number;
  has_preview: boolean;
  sold: number;
  review_note: string | null;
  submitted_at: Date | null;
  updated_at: Date;
};

export type ProductFilters = {
  q?: string;
  gradeId?: string;
  subjectId?: string;
  type?: string;
  status?: string;
  teacherId?: string;
};

export async function listAdminProducts(actor: Actor, f: ProductFilters, limit = 300): Promise<AdminProductRow[]> {
  const q = f.q?.trim();
  const scopeTeacher = actor.kind === "teacher" ? actor.teacherId : null;
  const teacherFilter = scopeTeacher ?? (f.teacherId === "none" ? null : f.teacherId);
  return sql<AdminProductRow[]>`
    select p.id, p.slug, p.type, p.title, p.status, p.price_fils, p.compare_at_price_fils, p.proposed_price_fils, p.sort_order, p.term,
      p.academic_year, p.cover_key, p.grade_id, g.name as grade_name, p.subject_id, s.name as subject_name, p.updated_at,
      p.teacher_id, t.display_name as teacher_name, p.review_note, p.submitted_at,
      (select count(*)::int from product_files pf where pf.product_id = p.id and pf.kind = 'main') as main_files,
      (select count(*)::int from lessons l where l.product_id = p.id) as lessons,
      (select count(*)::int from bundle_items bi where bi.bundle_id = p.id) as items,
      exists (select 1 from product_files pf where pf.product_id = p.id and pf.kind = 'preview') as has_preview,
      (select count(*)::int from order_items oi join orders o on o.id = oi.order_id
        where oi.product_id = p.id and o.status = 'paid' and not o.is_test) as sold
    from products p
    join grades g on g.id = p.grade_id
    left join subjects s on s.id = p.subject_id
    left join teachers t on t.id = p.teacher_id
    where true
      ${scopeTeacher ? sql`and p.teacher_id = ${scopeTeacher}` : sql``}
      ${!scopeTeacher && f.teacherId === "none" ? sql`and p.teacher_id is null` : sql``}
      ${!scopeTeacher && teacherFilter ? sql`and p.teacher_id = ${teacherFilter}` : sql``}
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
  proposed_price_fils: number | null;
  cover_key: string | null;
  status: ProductStatus;
  is_downloadable: boolean;
  is_featured: boolean;
  preview_pages: number;
  sort_order: number;
  page_count: number | null;
  teacher_id: string | null;
  teacher_name: string | null;
  review_note: string | null;
  submitted_at: Date | null;
  reviewed_at: Date | null;
  reviewed_by_name: string | null;
  access_mode: "unlimited" | "until_date" | "days";
  access_until: Date | null;
  access_days: number | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

/** جلب منتج مع التحقق من نطاق الفاعل (المعلم لا يرى منتجات غيره) */
export async function getAdminProduct(id: string, actor?: Actor): Promise<AdminProduct | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [p] = await sql<AdminProduct[]>`
    select p.*, g.name as grade_name, g.level as grade_level, s.name as subject_name, t.display_name as teacher_name,
      ru.full_name as reviewed_by_name
    from products p join grades g on g.id = p.grade_id left join subjects s on s.id = p.subject_id
    left join teachers t on t.id = p.teacher_id
    left join users ru on ru.id = p.reviewed_by
    where p.id = ${id}
  `;
  if (!p) return null;
  if (actor && actor.kind === "teacher" && p.teacher_id !== actor.teacherId) return null;
  return p;
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

/** الحقول التي يملك المعلم تعديلها */
export type ProductContentInput = {
  type: ProductType;
  title: string;
  summary: string;
  description: string;
  contents: string;
  gradeId: string;
  subjectId: string | null;
  academicYear: string;
  term: number | null;
  previewPages: number;
  proposedPriceFils: number | null;
};

/** حقول يحددها المالك فقط */
export type ProductOwnerInput = {
  priceFils: number;
  compareAtPriceFils: number | null;
  isDownloadable: boolean;
  isFeatured: boolean;
  sortOrder: number;
  slug?: string;
  teacherId: string | null;
  accessMode: "unlimited" | "until_date" | "days";
  accessUntil: Date | null;
  accessDays: number | null;
};

export type ProductInput = ProductContentInput & Partial<ProductOwnerInput>;

async function assertSubjectBelongsToGrade(subjectId: string | null, gradeId: string) {
  if (!subjectId) return;
  const [s] = await sql<{ grade_id: string }[]>`select grade_id from subjects where id = ${subjectId}`;
  if (!s || s.grade_id !== gradeId) throw new AdminError("المادة المختارة لا تتبع هذا الصف", { subjectId: "اختر مادة من نفس الصف" });
}

function assertContent(input: ProductContentInput) {
  if (PDF_PRODUCT_TYPES.includes(input.type) && !input.subjectId) {
    throw new AdminError("اختر المادة", { subjectId: "المادة مطلوبة لهذا النوع" });
  }
  if (["video_lesson", "unit", "quiz_review", "exam_review"].includes(input.type) && !input.subjectId) {
    throw new AdminError("اختر المادة", { subjectId: "المادة مطلوبة لهذا النوع" });
  }
}

function assertOwnerFields(o: ProductOwnerInput) {
  if (o.compareAtPriceFils !== null && o.compareAtPriceFils <= o.priceFils) {
    throw new AdminError("السعر السابق يجب أن يكون أكبر من السعر الحالي", { compareAtPrice: "اتركه فارغًا إن لم يكن هناك عرض حقيقي" });
  }
  if (o.accessMode === "until_date") {
    if (!o.accessUntil) throw new AdminError("حدد تاريخ نهاية الإتاحة", { accessUntil: "التاريخ مطلوب" });
  }
  if (o.accessMode === "days" && (!o.accessDays || o.accessDays < 1)) throw new AdminError("حدد عدد أيام الإتاحة", { accessDays: "عدد الأيام مطلوب" });
}

async function assertTeacherExists(teacherId: string | null) {
  if (!teacherId) return;
  const [t] = await sql`select 1 from teachers where id = ${teacherId}`;
  if (!t) throw new AdminError("المعلم غير موجود", { teacherId: "اختر معلمًا" });
}

export async function createProduct(input: ProductInput, actor: Actor): Promise<string> {
  assertContent(input);
  await assertSubjectBelongsToGrade(input.subjectId, input.gradeId);
  const isOwner = actor.kind === "owner";
  if (!isOwner && !actor.canUpload) throw new PermissionError("صلاحية إضافة المحتوى موقوفة لحسابك حاليًا");
  const owner: ProductOwnerInput = isOwner
    ? {
        priceFils: input.priceFils ?? 0,
        compareAtPriceFils: input.compareAtPriceFils ?? null,
        isDownloadable: input.isDownloadable ?? false,
        isFeatured: input.isFeatured ?? false,
        sortOrder: input.sortOrder ?? 0,
        slug: input.slug,
        teacherId: input.teacherId ?? null,
        accessMode: input.accessMode ?? "unlimited",
        accessUntil: input.accessUntil ?? null,
        accessDays: input.accessDays ?? null,
      }
    : {
        priceFils: 0,
        compareAtPriceFils: null,
        isDownloadable: false,
        isFeatured: false,
        sortOrder: 0,
        slug: undefined,
        teacherId: actor.teacherId,
        accessMode: "unlimited",
        accessUntil: null,
        accessDays: null,
      };
  assertOwnerFields(owner);
  await assertTeacherExists(owner.teacherId);
  const slug = owner.slug || (await generateProductSlug(input.gradeId, input.subjectId, input.type));
  const [row] = await sql<{ id: string }[]>`
    insert into products (slug, type, title, summary, description, contents, grade_id, subject_id, academic_year, term,
      price_fils, compare_at_price_fils, proposed_price_fils, status, is_downloadable, is_featured, preview_pages, sort_order, created_by,
      teacher_id, access_mode, access_until, access_days)
    values (${slug}, ${input.type}, ${input.title}, ${input.summary}, ${input.description}, ${input.contents},
      ${input.gradeId}, ${input.subjectId}, ${input.academicYear}, ${input.term}, ${owner.priceFils}, ${owner.compareAtPriceFils},
      ${input.proposedPriceFils}, 'draft', ${owner.isDownloadable}, ${owner.isFeatured}, ${input.previewPages}, ${owner.sortOrder}, ${actor.userId},
      ${owner.teacherId}, ${owner.accessMode}, ${owner.accessMode === "until_date" ? owner.accessUntil : null}, ${owner.accessMode === "days" ? owner.accessDays : null})
    returning id
  `;
  await audit({
    actorId: actor.userId,
    action: "product.create",
    entityType: "product",
    entityId: row.id,
    metadata: { title: input.title, priceFils: owner.priceFils, proposedPriceFils: input.proposedPriceFils, type: input.type, teacherId: owner.teacherId, by: actor.kind },
  });
  return row.id;
}

export async function updateProduct(id: string, input: ProductInput, actor: Actor) {
  await assertProductAccess(actor, id, "edit");
  const current = await getAdminProduct(id);
  if (!current) throw new AdminError("المنتج غير موجود");
  if (current.type !== input.type) {
    if (isContainerType(current.type) !== isContainerType(input.type)) {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from bundle_items where bundle_id = ${id}`;
      if (n > 0 && !isContainerType(input.type)) throw new AdminError("أزل المحتويات المضمّنة أولًا قبل تغيير النوع");
    }
    if (current.type === "bundle" || input.type === "bundle") throw new AdminError("لا يمكن تحويل الباقة إلى نوع آخر أو العكس بعد الإنشاء");
  }
  assertContent(input);
  await assertSubjectBelongsToGrade(input.subjectId, input.gradeId);

  if (actor.kind === "teacher") {
    // المعلم: المحتوى والسعر المقترح فقط — الحقول المعتمدة تبقى كما هي
    await sql`
      update products set
        type = ${input.type}, title = ${input.title}, summary = ${input.summary}, description = ${input.description},
        contents = ${input.contents}, grade_id = ${input.gradeId}, subject_id = ${input.subjectId}, academic_year = ${input.academicYear},
        term = ${input.term}, preview_pages = ${input.previewPages}, proposed_price_fils = ${input.proposedPriceFils}
      where id = ${id} and teacher_id = ${actor.teacherId} and status = 'draft'
    `;
    await audit({ actorId: actor.userId, action: "product.update", entityType: "product", entityId: id, metadata: { by: "teacher", proposedPriceFils: input.proposedPriceFils } });
    if (current.preview_pages !== input.previewPages) await regenerateAutoPreview(id);
    return;
  }

  const o: ProductOwnerInput = {
    priceFils: input.priceFils ?? current.price_fils,
    compareAtPriceFils: input.compareAtPriceFils === undefined ? current.compare_at_price_fils : input.compareAtPriceFils,
    isDownloadable: input.isDownloadable ?? current.is_downloadable,
    isFeatured: input.isFeatured ?? current.is_featured,
    sortOrder: input.sortOrder ?? current.sort_order,
    slug: input.slug || current.slug,
    teacherId: input.teacherId === undefined ? current.teacher_id : input.teacherId,
    accessMode: input.accessMode ?? current.access_mode,
    accessUntil: input.accessUntil === undefined ? current.access_until : input.accessUntil,
    accessDays: input.accessDays === undefined ? current.access_days : input.accessDays,
  };
  assertOwnerFields(o);
  await assertTeacherExists(o.teacherId);
  await sql`
    update products set
      slug = ${o.slug!}, type = ${input.type}, title = ${input.title}, summary = ${input.summary}, description = ${input.description},
      contents = ${input.contents}, grade_id = ${input.gradeId}, subject_id = ${input.subjectId}, academic_year = ${input.academicYear},
      term = ${input.term}, price_fils = ${o.priceFils}, compare_at_price_fils = ${o.compareAtPriceFils},
      proposed_price_fils = ${input.proposedPriceFils ?? current.proposed_price_fils},
      is_downloadable = ${o.isDownloadable}, is_featured = ${o.isFeatured}, preview_pages = ${input.previewPages},
      sort_order = ${o.sortOrder}, teacher_id = ${o.teacherId},
      access_mode = ${o.accessMode}, access_until = ${o.accessMode === "until_date" ? o.accessUntil : null},
      access_days = ${o.accessMode === "days" ? o.accessDays : null}
    where id = ${id}
  `;
  const changes: Record<string, unknown> = {};
  if (current.price_fils !== o.priceFils) changes.price = { from: current.price_fils, to: o.priceFils };
  if (current.compare_at_price_fils !== o.compareAtPriceFils) changes.compareAt = { from: current.compare_at_price_fils, to: o.compareAtPriceFils };
  if (current.title !== input.title) changes.title = { from: current.title, to: input.title };
  if (current.is_downloadable !== o.isDownloadable) changes.downloadable = o.isDownloadable;
  if (current.teacher_id !== o.teacherId) changes.teacher = { from: current.teacher_id, to: o.teacherId };
  if (current.access_mode !== o.accessMode || current.access_days !== (o.accessMode === "days" ? o.accessDays : null)) {
    changes.access = { mode: o.accessMode, until: o.accessUntil, days: o.accessDays };
  }
  if (current.grade_id !== input.gradeId || current.subject_id !== input.subjectId) changes.placement = { gradeId: input.gradeId, subjectId: input.subjectId };
  await audit({
    actorId: actor.userId,
    action: changes.price ? "product.price_change" : "product.update",
    entityType: "product",
    entityId: id,
    metadata: changes,
  });
  if (current.preview_pages !== input.previewPages) await regenerateAutoPreview(id);
}

/**
 * شروط النشر:
 *  - مذكرات PDF: ملف رئيسي واحد على الأقل
 *  - منتجات الفيديو: درس منشور أو منتج مضمّن، وكل الدروس المنشورة مكتملة المعالجة
 *  - الحاويات: عنصر واحد على الأقل (للباقة)
 */
export async function publishBlockers(productId: string, opts: { ignorePrice?: boolean } = {}): Promise<string[]> {
  const p = await getAdminProduct(productId);
  if (!p) return ["المنتج غير موجود"];
  const issues: string[] = [];
  if (!p.title.trim()) issues.push("العنوان مطلوب");
  if (PDF_PRODUCT_TYPES.includes(p.type)) {
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from product_files where product_id = ${productId} and kind = 'main'`;
    if (n === 0) issues.push("ارفع ملف PDF واحدًا على الأقل قبل النشر");
  }
  const [{ items }] = await sql<{ items: number }[]>`select count(*)::int as items from bundle_items where bundle_id = ${productId}`;
  if (p.type === "bundle" && items === 0) issues.push("أضف منتجًا واحدًا على الأقل إلى الباقة قبل النشر");
  if (VIDEO_PRODUCT_TYPES.includes(p.type)) {
    const [l] = await sql<{ published: number; not_ready: number; failed: number }[]>`
      select count(*) filter (where is_published)::int as published,
        count(*) filter (where is_published and processing_status <> 'ready')::int as not_ready,
        count(*) filter (where is_published and processing_status = 'failed')::int as failed
      from lessons where product_id = ${productId}
    `;
    if (l.published === 0 && items === 0) issues.push("أضف درس فيديو منشورًا واحدًا على الأقل (أو محتوى مضمّنًا) قبل النشر");
    if (l.failed > 0) issues.push("يوجد درس فشلت معالجته، احذفه أو ارفعه من جديد");
    else if (l.not_ready > 0) issues.push("لا يمكن النشر قبل اكتمال معالجة الفيديو");
  }
  void opts;
  return issues;
}

/** تغيير الحالة — للمالك فقط (المعلم يرسل للمراجعة عبر submitForReview) */
export async function setProductStatus(id: string, status: ProductStatus, actor: Actor, ip?: string) {
  if (actor.kind !== "owner") throw new PermissionError("تغيير حالة النشر متاح لإدارة المنصة فقط");
  const current = await getAdminProduct(id);
  if (!current) throw new AdminError("المنتج غير موجود");
  if (status === "published") {
    const issues = await publishBlockers(id);
    if (issues.length) throw new AdminError(issues.join("، "));
  }
  await sql`
    update products set status = ${status},
      published_at = case when ${status} = 'published' then coalesce(published_at, now()) else published_at end,
      reviewed_at = case when ${status} = 'published' and status = 'in_review' then now() else reviewed_at end,
      reviewed_by = case when ${status} = 'published' and status = 'in_review' then ${actor.userId}::uuid else reviewed_by end
    where id = ${id}
  `;
  await audit({ actorId: actor.userId, action: "product.status", entityType: "product", entityId: id, metadata: { from: current.status, to: status }, ip });
}

/** المعلم يرسل مسودته للمراجعة (بعد اكتمال المحتوى) */
export async function submitForReview(id: string, actor: Actor, ip?: string) {
  const p = await assertProductAccess(actor, id, actor.kind === "teacher" ? "edit" : "view");
  if (p.status !== "draft") throw new AdminError("يمكن إرسال المسودات فقط للمراجعة");
  const issues = await publishBlockers(id, { ignorePrice: true });
  if (issues.length) throw new AdminError(issues.join("، "));
  await sql`update products set status = 'in_review', submitted_at = now() where id = ${id} and status = 'draft'`;
  await audit({ actorId: actor.userId, action: "product.submit_review", entityType: "product", entityId: id, ip });
}

/** المالك يعتمد المحتوى: يحدد السعر وفترة الإتاحة ثم ينشر */
export async function approveAndPublish(
  id: string,
  input: { priceFils: number; compareAtPriceFils: number | null; accessMode: "unlimited" | "until_date" | "days"; accessUntil: Date | null; accessDays: number | null },
  actor: Actor,
  ip?: string,
) {
  if (actor.kind !== "owner") throw new PermissionError("اعتماد المحتوى متاح لإدارة المنصة فقط");
  const current = await getAdminProduct(id);
  if (!current) throw new AdminError("المنتج غير موجود");
  if (current.status !== "in_review" && current.status !== "draft") throw new AdminError("المنتج ليس بانتظار المراجعة");
  assertOwnerFields({ ...input, isDownloadable: false, isFeatured: false, sortOrder: 0, teacherId: null });
  const issues = await publishBlockers(id);
  if (issues.length) throw new AdminError(issues.join("، "));
  await sql.begin(async (tx) => {
    await tx`
      update products set price_fils = ${input.priceFils}, compare_at_price_fils = ${input.compareAtPriceFils},
        access_mode = ${input.accessMode}, access_until = ${input.accessMode === "until_date" ? input.accessUntil : null},
        access_days = ${input.accessMode === "days" ? input.accessDays : null},
        status = 'published', published_at = coalesce(published_at, now()), reviewed_at = now(), reviewed_by = ${actor.userId},
        review_note = null
      where id = ${id}
    `;
    await audit(
      {
        actorId: actor.userId,
        action: "product.review_approve",
        entityType: "product",
        entityId: id,
        metadata: {
          priceFils: input.priceFils,
          previousPriceFils: current.price_fils,
          proposedPriceFils: current.proposed_price_fils,
          access: { mode: input.accessMode, until: input.accessUntil, days: input.accessDays },
          teacherId: current.teacher_id,
        },
        ip,
      },
      tx,
    );
  });
}

/** المالك يعيد المحتوى للمعلم مع ملاحظة إلزامية */
export async function returnForChanges(id: string, note: string, actor: Actor, ip?: string) {
  if (actor.kind !== "owner") throw new PermissionError("المراجعة متاحة لإدارة المنصة فقط");
  const clean = note.trim();
  if (clean.length < 3) throw new AdminError("اكتب ملاحظة توضح المطلوب تعديله");
  const current = await getAdminProduct(id);
  if (!current) throw new AdminError("المنتج غير موجود");
  if (current.status !== "in_review") throw new AdminError("المنتج ليس بانتظار المراجعة");
  await sql`
    update products set status = 'draft', review_note = ${clean.slice(0, 2000)}, reviewed_at = now(), reviewed_by = ${actor.userId}
    where id = ${id}
  `;
  await audit({ actorId: actor.userId, action: "product.review_return", entityType: "product", entityId: id, reason: clean, ip });
}

/** المعلم يسحب طلب المراجعة ليعدّل (قبل اعتماده) */
export async function withdrawFromReview(id: string, actor: Actor) {
  const p = await assertProductAccess(actor, id, "view");
  if (p.status !== "in_review") throw new AdminError("المنتج ليس بانتظار المراجعة");
  await sql`update products set status = 'draft', submitted_at = null where id = ${id} and status = 'in_review'`;
  await audit({ actorId: actor.userId, action: "product.review_withdraw", entityType: "product", entityId: id });
}

/** قائمة المراجعة للمالك */
export async function reviewQueue() {
  return sql<
    {
      id: string;
      title: string;
      type: ProductType;
      teacher_name: string | null;
      grade_name: string;
      subject_name: string | null;
      proposed_price_fils: number | null;
      price_fils: number;
      lessons: number;
      not_ready: number;
      files: number;
      items: number;
      submitted_at: Date | null;
    }[]
  >`
    select p.id, p.title, p.type, t.display_name as teacher_name, g.name as grade_name, s.name as subject_name,
      p.proposed_price_fils, p.price_fils, p.submitted_at,
      (select count(*)::int from lessons l where l.product_id = p.id) as lessons,
      (select count(*)::int from lessons l where l.product_id = p.id and l.processing_status <> 'ready') as not_ready,
      (select count(*)::int from product_files f where f.product_id = p.id and f.kind = 'main') as files,
      (select count(*)::int from bundle_items bi where bi.bundle_id = p.id) as items
    from products p join grades g on g.id = p.grade_id left join subjects s on s.id = p.subject_id
    left join teachers t on t.id = p.teacher_id
    where p.status = 'in_review'
    order by p.submitted_at nulls last
  `;
}

export async function pendingReviewCount(): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from products where status = 'in_review'`;
  return n;
}

/** حذف نهائي فقط إن لم يرتبط المنتج بطلبات أو صلاحيات؛ وإلا أرشفة */
export async function deleteOrArchiveProduct(id: string, actor: Actor, ip?: string): Promise<"deleted" | "archived"> {
  const scoped = await assertProductAccess(actor, id, actor.kind === "teacher" ? "edit" : "view");
  const current = await getAdminProduct(scoped.id);
  if (!current) throw new AdminError("المنتج غير موجود");
  const [{ orders, ents, inBundles }] = await sql<{ orders: number; ents: number; inBundles: number }[]>`
    select
      (select count(*)::int from order_items where product_id = ${id}) as orders,
      (select count(*)::int from entitlements where product_id = ${id}) as ents,
      (select count(*)::int from bundle_items where product_id = ${id}) as "inBundles"
  `;
  if (orders > 0 || ents > 0) {
    if (actor.kind !== "owner") throw new PermissionError("لا يمكن حذف محتوى مرتبط بمشتريات، تواصل مع إدارة المنصة");
    await sql`update products set status = 'archived' where id = ${id}`;
    await audit({ actorId: actor.userId, action: "product.archive", entityType: "product", entityId: id, reason: "مرتبط بطلبات أو صلاحيات، أرشفة بدل الحذف", ip });
    return "archived";
  }
  if (inBundles > 0) throw new AdminError("المنتج ضمن باقة أو دورة. أزله منها أولًا أو استخدم الإخفاء.");
  const files = await getProductFiles(id);
  const lessons = await sql<{ provider: string; video_ref: string; thumbnail_key: string | null }[]>`select provider, video_ref, thumbnail_key from lessons where product_id = ${id}`;
  await sql`delete from products where id = ${id}`;
  for (const f of files) await storage().remove("private", f.storage_key).catch(() => {});
  for (const l of lessons) {
    if (l.provider === "file") await storage().remove("private", l.video_ref).catch(() => {});
    if (l.provider === "bunny") await deleteVideo(l.video_ref).catch(() => {});
    if (l.thumbnail_key) await storage().remove("public", l.thumbnail_key).catch(() => {});
  }
  if (current.cover_key) await storage().remove("public", current.cover_key).catch(() => {});
  await audit({ actorId: actor.userId, action: "product.delete", entityType: "product", entityId: id, metadata: { title: current.title, slug: current.slug }, ip });
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

export async function deleteProductFile(productId: string, fileId: string, actor: Actor) {
  await assertProductAccess(actor, productId, "edit");
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
  await audit({ actorId: actor.userId, action: "product.file_delete", entityType: "product", entityId: productId, metadata: { fileId, title: f.title, kind: f.kind } });
  if (f.kind === "main" || (f.kind === "preview" && !f.is_auto_preview)) await regenerateAutoPreview(productId);
  if (f.kind === "main") await refreshPageCount(productId);
}

export async function moveProductFile(productId: string, fileId: string, dir: "up" | "down", actor: Actor) {
  await assertProductAccess(actor, productId, "edit");
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

export async function renameProductFile(productId: string, fileId: string, title: string, actor: Actor) {
  await assertProductAccess(actor, productId, "edit");
  await sql`update product_files set title = ${title} where id = ${fileId} and product_id = ${productId}`;
}

// ---------------------------------------------------------------------------
// المحتويات المضمّنة (باقة / دورة / وحدة)
// ---------------------------------------------------------------------------

export type BundleItemRow = {
  product_id: string;
  title: string;
  type: ProductType;
  price_fils: number;
  status: string;
  subject_name: string | null;
  teacher_name: string | null;
  sort_order: number;
};

export async function getBundleItemsAdmin(bundleId: string): Promise<BundleItemRow[]> {
  return sql<BundleItemRow[]>`
    select bi.product_id, p.title, p.type, p.price_fils, p.status, s.name as subject_name, t.display_name as teacher_name, bi.sort_order
    from bundle_items bi join products p on p.id = bi.product_id left join subjects s on s.id = p.subject_id
    left join teachers t on t.id = p.teacher_id
    where bi.bundle_id = ${bundleId}
    order by bi.sort_order, p.title
  `;
}

/** المرشحون للإضافة: نفس الصف، أي نوع عدا الحاوية نفسها؛ المعلم يرى منتجاته فقط */
export async function bundleCandidates(bundleId: string, gradeId: string, actor: Actor) {
  const scope = actor.kind === "teacher" ? actor.teacherId : null;
  return sql<{ id: string; title: string; type: ProductType; price_fils: number; status: string; subject_name: string | null; teacher_name: string | null }[]>`
    select p.id, p.title, p.type, p.price_fils, p.status, s.name as subject_name, t.display_name as teacher_name
    from products p left join subjects s on s.id = p.subject_id left join teachers t on t.id = p.teacher_id
    where p.grade_id = ${gradeId} and p.status <> 'archived' and p.id <> ${bundleId}
      ${scope ? sql`and p.teacher_id = ${scope}` : sql``}
      and not exists (select 1 from bundle_items bi where bi.bundle_id = ${bundleId} and bi.product_id = p.id)
    order by s.sort_order nulls first, p.type, p.sort_order, p.title
  `;
}

export async function addBundleItem(bundleId: string, productId: string, actor: Actor) {
  const container = await assertProductAccess(actor, bundleId, "edit");
  if (!CONTAINER_PRODUCT_TYPES.includes(container.type as ProductType)) throw new AdminError("هذا النوع لا يمكن أن يضم منتجات أخرى");
  const [p] = await sql<{ type: string; grade_id: string; teacher_id: string | null }[]>`select type, grade_id, teacher_id from products where id = ${productId}`;
  if (!p) throw new AdminError("المنتج غير موجود");
  if (actor.kind === "teacher" && p.teacher_id !== actor.teacherId) throw new PermissionError("يمكنك إضافة محتواك فقط");
  const [{ next }] = await sql<{ next: number }[]>`select coalesce(max(sort_order), -1)::int + 1 as next from bundle_items where bundle_id = ${bundleId}`;
  await sql`insert into bundle_items (bundle_id, product_id, sort_order) values (${bundleId}, ${productId}, ${next}) on conflict do nothing`;
  await audit({ actorId: actor.userId, action: "bundle.add_item", entityType: "product", entityId: bundleId, metadata: { productId } });
}

export async function removeBundleItem(bundleId: string, productId: string, actor: Actor) {
  await assertProductAccess(actor, bundleId, "edit");
  const [b] = await sql<{ status: string; type: string }[]>`select status, type from products where id = ${bundleId}`;
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from bundle_items where bundle_id = ${bundleId}`;
  if (b?.status === "published" && b.type === "bundle" && n <= 1) throw new AdminError("لا يمكن إفراغ باقة منشورة. أخفِ الباقة أولًا.");
  await sql`delete from bundle_items where bundle_id = ${bundleId} and product_id = ${productId}`;
  await audit({ actorId: actor.userId, action: "bundle.remove_item", entityType: "product", entityId: bundleId, metadata: { productId } });
}

export async function listBundlesAdmin() {
  return sql<
    {
      id: string;
      title: string;
      type: ProductType;
      status: ProductStatus;
      price_fils: number;
      grade_name: string;
      teacher_name: string | null;
      item_count: number;
      items_total: number;
      sold: number;
    }[]
  >`
    select p.id, p.title, p.type, p.status, p.price_fils, g.name as grade_name, t.display_name as teacher_name,
      (select count(*)::int from bundle_items bi where bi.bundle_id = p.id) as item_count,
      (select coalesce(sum(ip.price_fils), 0)::int from bundle_items bi join products ip on ip.id = bi.product_id where bi.bundle_id = p.id) as items_total,
      (select count(*)::int from order_items oi join orders o on o.id = oi.order_id where oi.product_id = p.id and o.status = 'paid' and not o.is_test) as sold
    from products p join grades g on g.id = p.grade_id left join teachers t on t.id = p.teacher_id
    where (p.type = 'bundle' or exists (select 1 from bundle_items bi where bi.bundle_id = p.id)) and p.status <> 'archived'
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
  processing_status: "uploading" | "processing" | "ready" | "failed";
  processing_error: string | null;
  thumbnail_key: string | null;
  status_checked_at: Date | null;
  sort_order: number;
};

export async function getLessonsAdmin(productId: string): Promise<AdminLesson[]> {
  return sql<AdminLesson[]>`
    select id, unit_title, title, description, provider, video_ref, size_bytes, duration_seconds, is_free_preview, is_published,
      processing_status, processing_error, thumbnail_key, status_checked_at, sort_order
    from lessons where product_id = ${productId} order by sort_order, created_at
  `;
}

export async function nextLessonOrder(productId: string): Promise<number> {
  const [{ next }] = await sql<{ next: number }[]>`select coalesce(max(sort_order), -1)::int + 1 as next from lessons where product_id = ${productId}`;
  return next;
}

export async function updateLesson(
  productId: string,
  lessonId: string,
  input: { title: string; unitTitle: string; description: string; isFreePreview: boolean; isPublished: boolean },
  actor: Actor,
) {
  await assertProductAccess(actor, productId, "edit");
  const rows = await sql`
    update lessons set title = ${input.title}, unit_title = ${input.unitTitle}, description = ${input.description},
      is_free_preview = ${input.isFreePreview}, is_published = ${input.isPublished}
    where id = ${lessonId} and product_id = ${productId}
    returning id
  `;
  if (!rows.length) throw new AdminError("الدرس غير موجود");
  await audit({ actorId: actor.userId, action: "lesson.update", entityType: "product", entityId: productId, metadata: { lessonId } });
}

export async function deleteLesson(productId: string, lessonId: string, actor: Actor) {
  await assertProductAccess(actor, productId, "edit");
  const [l] = await sql<{ provider: string; video_ref: string; title: string; thumbnail_key: string | null }[]>`
    select provider, video_ref, title, thumbnail_key from lessons where id = ${lessonId} and product_id = ${productId}
  `;
  if (!l) throw new AdminError("الدرس غير موجود");
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from entitlements where product_id = ${productId}`;
  const [p] = await sql<{ status: string }[]>`select status from products where id = ${productId}`;
  if (p?.status === "published" && n > 0 && actor.kind !== "owner") throw new PermissionError("لا يمكن حذف درس من محتوى مُباع");
  await sql`delete from lessons where id = ${lessonId}`;
  if (l.provider === "file") await storage().remove("private", l.video_ref).catch(() => {});
  if (l.provider === "bunny") await deleteVideo(l.video_ref).catch(() => {});
  if (l.thumbnail_key) await storage().remove("public", l.thumbnail_key).catch(() => {});
  await audit({ actorId: actor.userId, action: "lesson.delete", entityType: "product", entityId: productId, metadata: { lessonId, title: l.title } });
}

export async function moveLesson(productId: string, lessonId: string, dir: "up" | "down", actor: Actor) {
  await assertProductAccess(actor, productId, "edit");
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

/** قائمة المعلمين لاختيار صاحب المحتوى (للمالك) */
export async function teacherOptions() {
  return sql<{ id: string; display_name: string; mode: string }[]>`
    select id, display_name, mode from teachers order by sort_order, display_name
  `;
}
