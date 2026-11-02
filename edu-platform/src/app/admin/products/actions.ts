"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { formValues } from "@/lib/action-state";
import { academicYearSchema, fieldErrors, optionalPriceSchema, priceSchema, productStatusSchema, productTypeSchema } from "@/lib/validation";
import { sql } from "@/server/db";
import { audit } from "@/server/platform/audit";
import { storage } from "@/server/storage";
import { assertProductAccess, PermissionError, type Actor } from "@/server/auth/permissions";
import { syncLessonStatus } from "@/server/video/service";
import { AdminError, bool, int, isUuid, staffAction, str } from "@/server/admin/common";
import {
  addBundleItem,
  approveAndPublish,
  createProduct,
  deleteLesson,
  deleteOrArchiveProduct,
  deleteProductFile,
  moveLesson,
  moveProductFile,
  nextLessonOrder,
  regenerateAutoPreview,
  removeBundleItem,
  renameProductFile,
  returnForChanges,
  setProductStatus,
  submitForReview,
  updateLesson,
  updateProduct,
  withdrawFromReview,
  type ProductContentInput,
  type ProductInput,
  type ProductOwnerInput,
} from "@/server/admin/products";

const FORM_KEYS = [
  "type",
  "title",
  "summary",
  "description",
  "contents",
  "gradeId",
  "subjectId",
  "academicYear",
  "term",
  "price",
  "compareAtPrice",
  "proposedPrice",
  "previewPages",
  "sortOrder",
  "slug",
  "teacherId",
  "accessMode",
  "accessUntil",
  "accessDays",
];

const contentSchema = z.object({
  type: productTypeSchema,
  title: z.string().trim().min(3, "العنوان قصير جدًا").max(160, "العنوان طويل جدًا"),
  summary: z.string().trim().max(300, "الوصف المختصر طويل جدًا"),
  description: z.string().trim().max(5000, "الوصف طويل جدًا"),
  contents: z.string().trim().max(5000, "المحتويات طويلة جدًا"),
  gradeId: z.string().uuid("اختر الصف"),
  subjectId: z.string().uuid().nullable(),
  academicYear: academicYearSchema,
  term: z.union([z.literal(1), z.literal(2)]).nullable(),
  previewPages: z.number().int().min(0, "عدد صفحات المعاينة غير صحيح").max(30, "الحد الأقصى 30 صفحة"),
  proposedPrice: optionalPriceSchema,
});

const accessSchema = z.object({
  accessMode: z.enum(["unlimited", "until_date", "days"], { error: "اختر فترة الإتاحة" }),
  accessUntil: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        ctx.addIssue({ code: "custom", message: "تاريخ غير صحيح" });
        return z.NEVER;
      }
      // نهاية اليوم بتوقيت الكويت
      const d = new Date(`${v}T23:59:59+03:00`);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: "custom", message: "تاريخ غير صحيح" });
        return z.NEVER;
      }
      return d;
    }),
  accessDays: z.number().int().min(1, "عدد الأيام يجب أن يكون 1 على الأقل").max(3650).nullable(),
});

const ownerSchema = z
  .object({
    price: priceSchema,
    compareAtPrice: optionalPriceSchema,
    sortOrder: z.number().int().min(-100000).max(100000),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^([a-z0-9][a-z0-9-]{0,120})?$/, "الرابط: أحرف إنجليزية صغيرة وأرقام وشرطات فقط")
      .optional(),
    teacherId: z.string().uuid().nullable(),
  })
  .and(accessSchema);

function parseContent(fd: FormData): ProductContentInput {
  const termRaw = str(fd, "term");
  const parsed = contentSchema.safeParse({
    type: str(fd, "type"),
    title: str(fd, "title"),
    summary: str(fd, "summary"),
    description: str(fd, "description"),
    contents: str(fd, "contents"),
    gradeId: str(fd, "gradeId"),
    subjectId: str(fd, "subjectId") || null,
    academicYear: str(fd, "academicYear"),
    term: termRaw === "1" ? 1 : termRaw === "2" ? 2 : null,
    previewPages: int(fd, "previewPages", 3),
    proposedPrice: str(fd, "proposedPrice") || undefined,
  });
  if (!parsed.success) throw new AdminError("راجع الحقول المظللة", fieldErrors(parsed.error));
  const d = parsed.data;
  return {
    type: d.type,
    title: d.title,
    summary: d.summary,
    description: d.description,
    contents: d.contents,
    gradeId: d.gradeId,
    subjectId: d.subjectId,
    academicYear: d.academicYear,
    term: d.term,
    previewPages: d.previewPages,
    proposedPriceFils: d.proposedPrice,
  };
}

function parseOwner(fd: FormData): ProductOwnerInput {
  const daysRaw = str(fd, "accessDays");
  const parsed = ownerSchema.safeParse({
    price: str(fd, "price"),
    compareAtPrice: str(fd, "compareAtPrice") || undefined,
    sortOrder: int(fd, "sortOrder", 0),
    slug: str(fd, "slug") || undefined,
    teacherId: str(fd, "teacherId") || null,
    accessMode: str(fd, "accessMode") || "unlimited",
    accessUntil: str(fd, "accessUntil") || undefined,
    accessDays: daysRaw ? Number(daysRaw) : null,
  });
  if (!parsed.success) throw new AdminError("راجع الحقول المظللة", fieldErrors(parsed.error));
  const d = parsed.data;
  return {
    priceFils: d.price,
    compareAtPriceFils: d.compareAtPrice,
    isDownloadable: bool(fd, "isDownloadable"),
    isFeatured: bool(fd, "isFeatured"),
    sortOrder: d.sortOrder,
    slug: d.slug || undefined,
    teacherId: d.teacherId,
    accessMode: d.accessMode,
    accessUntil: d.accessUntil,
    accessDays: d.accessDays,
  };
}

function parseProductForm(fd: FormData, actor: Actor): ProductInput {
  const content = parseContent(fd);
  if (actor.kind !== "owner") return content;
  return { ...content, ...parseOwner(fd) };
}

function withValues(fd: FormData, state: ActionState): ActionState {
  return state ? { ...state, values: formValues(fd, FORM_KEYS) } : state;
}

function revalidateProduct(id: string) {
  revalidatePath(`/admin/products/${id}`);
  revalidatePath("/admin/products");
  revalidatePath("/admin/review");
}

export async function createProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let newId: string | null = null;
  const res = await staffAction(async ({ actor }) => {
    const input = parseProductForm(fd, actor);
    newId = await createProduct(input, actor);
  });
  if (newId) {
    revalidatePath("/admin/products");
    redirect(`/admin/products/${newId}?created=1`);
  }
  return withValues(fd, res);
}

export async function updateProductAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const res = await staffAction(async ({ actor }) => {
    if (!isUuid(id)) throw new AdminError("المنتج غير موجود");
    const input = parseProductForm(fd, actor);
    await updateProduct(id, input, actor);
    revalidateProduct(id);
    return { ok: true, message: "تم حفظ التعديلات" };
  });
  return res?.ok ? res : withValues(fd, res);
}

export async function setStatusAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor, ip }) => {
    const id = str(fd, "id");
    const status = productStatusSchema.safeParse(str(fd, "status"));
    if (!isUuid(id) || !status.success) throw new AdminError("طلب غير صالح");
    await setProductStatus(id, status.data, actor, ip);
    revalidateProduct(id);
    revalidatePath("/admin/bundles");
    revalidatePath("/", "layout");
    const msg = {
      published: "تم نشر المنتج وأصبح ظاهرًا للطلاب",
      hidden: "تم إخفاء المنتج عن الطلاب",
      draft: "أُعيد المنتج إلى المسودات",
      in_review: "أُرسل المنتج للمراجعة",
      archived: "تمت أرشفة المنتج",
    }[status.data];
    return { ok: true, message: msg };
  });
}

// ---------------------------------------------------------------- المراجعة قبل النشر

export async function submitForReviewAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor, ip }) => {
    const id = str(fd, "id");
    if (!isUuid(id)) throw new AdminError("طلب غير صالح");
    await submitForReview(id, actor, ip);
    revalidateProduct(id);
    return { ok: true, message: "أُرسل المحتوى للمراجعة. سيُنشر بعد اعتماده من إدارة المنصة." };
  });
}

export async function withdrawReviewAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor }) => {
    const id = str(fd, "id");
    if (!isUuid(id)) throw new AdminError("طلب غير صالح");
    await withdrawFromReview(id, actor);
    revalidateProduct(id);
    return { ok: true, message: "أُعيد المحتوى إلى المسودات للتعديل" };
  });
}

export async function approveAndPublishAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let approvedId: string | null = null;
  const res = await staffAction(async ({ actor, ip }) => {
    if (actor.kind !== "owner") throw new PermissionError("اعتماد المحتوى متاح لإدارة المنصة فقط");
    const id = str(fd, "id");
    if (!isUuid(id)) throw new AdminError("طلب غير صالح");
    const price = priceSchema.safeParse(str(fd, "price"));
    if (!price.success) throw new AdminError("حدد سعرًا صحيحًا — مثال: 2.500", { price: price.error.issues[0].message });
    const compare = optionalPriceSchema.safeParse(str(fd, "compareAtPrice") || undefined);
    if (!compare.success) throw new AdminError("السعر السابق غير صحيح", { compareAtPrice: "غير صحيح" });
    const daysRaw = str(fd, "accessDays");
    const access = accessSchema.safeParse({
      accessMode: str(fd, "accessMode") || "unlimited",
      accessUntil: str(fd, "accessUntil") || undefined,
      accessDays: daysRaw ? Number(daysRaw) : null,
    });
    if (!access.success) throw new AdminError("راجع فترة الإتاحة", fieldErrors(access.error));
    await approveAndPublish(
      id,
      { priceFils: price.data, compareAtPriceFils: compare.data, accessMode: access.data.accessMode, accessUntil: access.data.accessUntil, accessDays: access.data.accessDays },
      actor,
      ip,
    );
    revalidateProduct(id);
    revalidatePath("/", "layout");
    approvedId = id;
    return { ok: true, message: "تم اعتماد المحتوى ونشره للطلاب" };
  });
  // لوحة المراجعة تختفي بعد النشر — نعرض التأكيد عبر رابط الصفحة
  if (approvedId) redirect(`/admin/products/${approvedId}?approved=1`);
  return res;
}

export async function returnForChangesAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let returnedId: string | null = null;
  const res = await staffAction(async ({ actor, ip }) => {
    const id = str(fd, "id");
    if (!isUuid(id)) throw new AdminError("طلب غير صالح");
    await returnForChanges(id, str(fd, "reason"), actor, ip);
    revalidateProduct(id);
    returnedId = id;
    return { ok: true, message: "أُعيد المحتوى للمعلم مع الملاحظات" };
  });
  if (returnedId) redirect(`/admin/products/${returnedId}?returned=1`);
  return res;
}

export async function deleteProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let deleted = false;
  const res = await staffAction(async ({ actor, ip }) => {
    const id = str(fd, "id");
    if (!isUuid(id)) throw new AdminError("طلب غير صالح");
    const result = await deleteOrArchiveProduct(id, actor, ip);
    revalidatePath("/admin/products");
    revalidatePath("/", "layout");
    if (result === "deleted") deleted = true;
    return { ok: true, message: result === "deleted" ? "تم حذف المنتج نهائيًا" : "المنتج مرتبط بطلبات سابقة، لذلك تمت أرشفته بدل الحذف" };
  });
  if (deleted && str(fd, "redirect") === "1") redirect("/admin/products?deleted=1");
  return res;
}

export async function updateSortAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor }) => {
    if (actor.kind !== "owner") throw new PermissionError("ترتيب العرض تحدده إدارة المنصة");
    const id = str(fd, "id");
    const sort = int(fd, "sortOrder", NaN);
    if (!isUuid(id) || !Number.isFinite(sort)) throw new AdminError("رقم الترتيب غير صحيح");
    await sql`update products set sort_order = ${sort} where id = ${id}`;
    revalidatePath("/admin/products");
    return { ok: true, message: "تم" };
  });
}

// ---------------------------------------------------------------- الملفات

export async function deleteFileAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor }) => {
    const productId = str(fd, "productId");
    const fileId = str(fd, "fileId");
    if (!isUuid(productId) || !isUuid(fileId)) throw new AdminError("طلب غير صالح");
    await deleteProductFile(productId, fileId, actor);
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true, message: "تم حذف الملف" };
  });
}

export async function moveFileAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor }) => {
    const productId = str(fd, "productId");
    const fileId = str(fd, "fileId");
    const dir = str(fd, "dir") === "up" ? "up" : "down";
    if (!isUuid(productId) || !isUuid(fileId)) throw new AdminError("طلب غير صالح");
    await moveProductFile(productId, fileId, dir, actor);
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true };
  });
}

export async function renameFileAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor }) => {
    const productId = str(fd, "productId");
    const fileId = str(fd, "fileId");
    const title = str(fd, "title");
    if (!isUuid(productId) || !isUuid(fileId)) throw new AdminError("طلب غير صالح");
    if (title.length < 1 || title.length > 160) throw new AdminError("اسم الملف غير صالح");
    await renameProductFile(productId, fileId, title, actor);
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true, message: "تم تغيير الاسم" };
  });
}

export async function regeneratePreviewAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor }) => {
    const productId = str(fd, "productId");
    if (!isUuid(productId)) throw new AdminError("طلب غير صالح");
    await assertProductAccess(actor, productId, "edit");
    if (str(fd, "dropCustom") === "1") {
      const custom = await sql<{ id: string; storage_key: string }[]>`
        select id, storage_key from product_files where product_id = ${productId} and kind = 'preview' and not is_auto_preview
      `;
      for (const c of custom) {
        await sql`delete from product_files where id = ${c.id}`;
        await storage().remove("private", c.storage_key).catch(() => {});
      }
    }
    const r = await regenerateAutoPreview(productId);
    await audit({ actorId: actor.userId, action: "product.preview_regenerate", entityType: "product", entityId: productId, metadata: { result: r } });
    revalidatePath(`/admin/products/${productId}`);
    return {
      ok: true,
      message: r === "generated" ? "تم توليد المعاينة المجانية" : r === "custom" ? "توجد معاينة مخصصة مرفوعة يدويًا" : "لا توجد معاينة (عدد الصفحات صفر أو لا يوجد ملف)",
    };
  });
}

export async function removeCoverAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor }) => {
    const productId = str(fd, "productId");
    if (!isUuid(productId)) throw new AdminError("طلب غير صالح");
    await assertProductAccess(actor, productId, "edit");
    const [p] = await sql<{ cover_key: string | null }[]>`select cover_key from products where id = ${productId}`;
    if (p?.cover_key) {
      await sql`update products set cover_key = null where id = ${productId}`;
      await storage().remove("public", p.cover_key).catch(() => {});
      await audit({ actorId: actor.userId, action: "product.cover_remove", entityType: "product", entityId: productId });
    }
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true, message: "تمت إزالة الغلاف" };
  });
}

// ---------------------------------------------------------------- المحتويات المضمّنة

export async function addBundleItemAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor }) => {
    const bundleId = str(fd, "bundleId");
    const ids = fd.getAll("productId").filter((x): x is string => typeof x === "string" && isUuid(x));
    if (!isUuid(bundleId) || ids.length === 0) throw new AdminError("اختر منتجًا واحدًا على الأقل");
    for (const id of ids) await addBundleItem(bundleId, id, actor);
    revalidatePath(`/admin/products/${bundleId}`);
    revalidatePath("/admin/bundles");
    return { ok: true, message: `تمت إضافة ${ids.length} عنصر` };
  });
}

export async function removeBundleItemAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor }) => {
    const bundleId = str(fd, "bundleId");
    const productId = str(fd, "productId");
    if (!isUuid(bundleId) || !isUuid(productId)) throw new AdminError("طلب غير صالح");
    await removeBundleItem(bundleId, productId, actor);
    revalidatePath(`/admin/products/${bundleId}`);
    revalidatePath("/admin/bundles");
    return { ok: true, message: "تمت الإزالة" };
  });
}

// ---------------------------------------------------------------- الدروس

const lessonSchema = z.object({
  title: z.string().trim().min(2, "عنوان الدرس مطلوب").max(160),
  unitTitle: z.string().trim().max(120),
  description: z.string().trim().max(2000),
});

/** ربط فيديو موجود في Bunny Stream (للمالك) — حالته تُجلب من API قبل السماح بنشره */
export async function addBunnyLessonAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor }) => {
    if (actor.kind !== "owner") throw new PermissionError("ربط فيديو موجود متاح للمالك فقط");
    const productId = str(fd, "productId");
    if (!isUuid(productId)) throw new AdminError("طلب غير صالح");
    const parsed = lessonSchema.safeParse({ title: str(fd, "title"), unitTitle: str(fd, "unitTitle"), description: str(fd, "description") });
    if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "راجع بيانات الدرس", fieldErrors(parsed.error));
    const videoId = str(fd, "videoRef").toLowerCase();
    if (!/^[0-9a-f-]{36}$/i.test(videoId)) throw new AdminError("معرّف فيديو Bunny غير صحيح — انسخ Video ID (بصيغة GUID) من لوحة Bunny Stream", { videoRef: "معرّف غير صحيح" });
    const p = await assertProductAccess(actor, productId, "view");
    if (!["video_lesson", "unit", "quiz_review", "exam_review", "video_course"].includes(p.type)) throw new AdminError("الدروس متاحة لمنتجات الفيديو فقط");
    const order = await nextLessonOrder(productId);
    const minutes = Number(str(fd, "durationMinutes") || "0");
    const [l] = await sql<{ id: string }[]>`
      insert into lessons (product_id, unit_title, title, description, provider, video_ref, duration_seconds, is_free_preview, sort_order,
        processing_status, uploaded_by)
      values (${productId}, ${parsed.data.unitTitle}, ${parsed.data.title}, ${parsed.data.description}, 'bunny', ${videoId},
              ${Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : null}, ${bool(fd, "isFreePreview")}, ${order},
              'processing', ${actor.userId})
      returning id
    `;
    let status = "processing";
    try {
      status = (await syncLessonStatus(l.id))?.status ?? status;
    } catch {
      /* تبقى «قيد المعالجة» ويمكن التحديث لاحقًا */
    }
    await audit({ actorId: actor.userId, action: "lesson.create", entityType: "product", entityId: productId, metadata: { lessonId: l.id, provider: "bunny", videoId, linked: true } });
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true, message: status === "ready" ? "تمت إضافة الدرس" : "تمت إضافة الدرس — بانتظار اكتمال المعالجة لدى Bunny" };
  });
}

export async function updateLessonAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor }) => {
    const productId = str(fd, "productId");
    const lessonId = str(fd, "lessonId");
    if (!isUuid(productId) || !isUuid(lessonId)) throw new AdminError("طلب غير صالح");
    const parsed = lessonSchema.safeParse({ title: str(fd, "title"), unitTitle: str(fd, "unitTitle"), description: str(fd, "description") });
    if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "راجع بيانات الدرس", fieldErrors(parsed.error));
    await updateLesson(productId, lessonId, { ...parsed.data, isFreePreview: bool(fd, "isFreePreview"), isPublished: bool(fd, "isPublished") }, actor);
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true, message: "تم حفظ الدرس" };
  });
}

export async function deleteLessonAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor }) => {
    const productId = str(fd, "productId");
    const lessonId = str(fd, "lessonId");
    if (!isUuid(productId) || !isUuid(lessonId)) throw new AdminError("طلب غير صالح");
    await deleteLesson(productId, lessonId, actor);
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true, message: "تم حذف الدرس" };
  });
}

export async function moveLessonAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor }) => {
    const productId = str(fd, "productId");
    const lessonId = str(fd, "lessonId");
    if (!isUuid(productId) || !isUuid(lessonId)) throw new AdminError("طلب غير صالح");
    await moveLesson(productId, lessonId, str(fd, "dir") === "up" ? "up" : "down", actor);
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true };
  });
}

export async function syncLessonsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor }) => {
    const productId = str(fd, "productId");
    if (!isUuid(productId)) throw new AdminError("طلب غير صالح");
    await assertProductAccess(actor, productId, "view");
    const pending = await sql<{ id: string }[]>`
      select id from lessons where product_id = ${productId} and provider = 'bunny' and processing_status in ('uploading', 'processing')
    `;
    let ready = 0;
    for (const l of pending) {
      try {
        if ((await syncLessonStatus(l.id))?.status === "ready") ready++;
      } catch {
        /* يُعرض الخطأ في عمود الحالة */
      }
    }
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true, message: pending.length ? `تم تحديث ${pending.length} درس (${ready} جاهز)` : "كل الدروس محدّثة" };
  });
}

export async function removeLessonThumbAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor }) => {
    const productId = str(fd, "productId");
    const lessonId = str(fd, "lessonId");
    if (!isUuid(productId) || !isUuid(lessonId)) throw new AdminError("طلب غير صالح");
    await assertProductAccess(actor, productId, "edit");
    const [l] = await sql<{ thumbnail_key: string | null }[]>`select thumbnail_key from lessons where id = ${lessonId} and product_id = ${productId}`;
    if (l?.thumbnail_key) {
      await sql`update lessons set thumbnail_key = null where id = ${lessonId}`;
      await storage().remove("public", l.thumbnail_key).catch(() => {});
    }
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true, message: "تمت إزالة الصورة المصغرة" };
  });
}
