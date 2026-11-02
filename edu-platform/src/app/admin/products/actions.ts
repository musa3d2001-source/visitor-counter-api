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
import { AdminError, adminAction, bool, int, isUuid, str } from "@/server/admin/common";
import {
  addBundleItem,
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
  setProductStatus,
  updateProduct,
  type ProductInput,
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
  "previewPages",
  "sortOrder",
  "slug",
];

const productSchema = z.object({
  type: productTypeSchema,
  title: z.string().trim().min(3, "العنوان قصير جدًا").max(160, "العنوان طويل جدًا"),
  summary: z.string().trim().max(300, "الوصف المختصر طويل جدًا"),
  description: z.string().trim().max(5000, "الوصف طويل جدًا"),
  contents: z.string().trim().max(5000, "المحتويات طويلة جدًا"),
  gradeId: z.string().uuid("اختر الصف"),
  subjectId: z.string().uuid().nullable(),
  academicYear: academicYearSchema,
  term: z.union([z.literal(1), z.literal(2)]).nullable(),
  price: priceSchema,
  compareAtPrice: optionalPriceSchema,
  previewPages: z.number().int().min(0, "عدد صفحات المعاينة غير صحيح").max(30, "الحد الأقصى 30 صفحة"),
  sortOrder: z.number().int().min(-100000).max(100000),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^([a-z0-9][a-z0-9-]{0,120})?$/, "الرابط: أحرف إنجليزية صغيرة وأرقام وشرطات فقط")
    .optional(),
});

function parseProductForm(fd: FormData): ProductInput {
  const termRaw = str(fd, "term");
  const parsed = productSchema.safeParse({
    type: str(fd, "type"),
    title: str(fd, "title"),
    summary: str(fd, "summary"),
    description: str(fd, "description"),
    contents: str(fd, "contents"),
    gradeId: str(fd, "gradeId"),
    subjectId: str(fd, "subjectId") || null,
    academicYear: str(fd, "academicYear"),
    term: termRaw === "1" ? 1 : termRaw === "2" ? 2 : null,
    price: str(fd, "price"),
    compareAtPrice: str(fd, "compareAtPrice") || undefined,
    previewPages: int(fd, "previewPages", 3),
    sortOrder: int(fd, "sortOrder", 0),
    slug: str(fd, "slug") || undefined,
  });
  if (!parsed.success) {
    const errs = fieldErrors(parsed.error);
    throw new AdminError("راجع الحقول المظللة", errs);
  }
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
    priceFils: d.price,
    compareAtPriceFils: d.compareAtPrice,
    isDownloadable: bool(fd, "isDownloadable"),
    isFeatured: bool(fd, "isFeatured"),
    previewPages: d.previewPages,
    sortOrder: d.sortOrder,
    slug: d.slug || undefined,
  };
}

function withValues(fd: FormData, state: ActionState): ActionState {
  return state ? { ...state, values: formValues(fd, FORM_KEYS) } : state;
}

export async function createProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let newId: string | null = null;
  const res = await adminAction(async ({ adminId }) => {
    const input = parseProductForm(fd);
    newId = await createProduct(input, adminId);
  });
  if (newId) {
    revalidatePath("/admin/products");
    redirect(`/admin/products/${newId}?created=1`);
  }
  return withValues(fd, res);
}

export async function updateProductAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const res = await adminAction(async ({ adminId }) => {
    if (!isUuid(id)) throw new AdminError("المنتج غير موجود");
    const input = parseProductForm(fd);
    await updateProduct(id, input, adminId);
    revalidatePath(`/admin/products/${id}`);
    revalidatePath("/admin/products");
    return { ok: true, message: "تم حفظ التعديلات" };
  });
  return res?.ok ? res : withValues(fd, res);
}

export async function setStatusAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const id = str(fd, "id");
    const status = productStatusSchema.safeParse(str(fd, "status"));
    if (!isUuid(id) || !status.success) throw new AdminError("طلب غير صالح");
    await setProductStatus(id, status.data, adminId, ip);
    revalidatePath(`/admin/products/${id}`);
    revalidatePath("/admin/products");
    revalidatePath("/admin/bundles");
    revalidatePath("/", "layout");
    const msg = { published: "تم نشر المنتج وأصبح ظاهرًا للطلاب", hidden: "تم إخفاء المنتج عن الطلاب", draft: "أُعيد المنتج إلى المسودات", in_review: "أُرسل المنتج للمراجعة", archived: "تمت أرشفة المنتج" }[status.data];
    return { ok: true, message: msg };
  });
}

export async function deleteProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let deleted = false;
  const res = await adminAction(async ({ adminId, ip }) => {
    const id = str(fd, "id");
    if (!isUuid(id)) throw new AdminError("طلب غير صالح");
    const result = await deleteOrArchiveProduct(id, adminId, ip);
    revalidatePath("/admin/products");
    revalidatePath("/", "layout");
    if (result === "deleted") deleted = true;
    return { ok: true, message: result === "deleted" ? "تم حذف المنتج نهائيًا" : "المنتج مرتبط بطلبات سابقة، لذلك تمت أرشفته بدل الحذف" };
  });
  if (deleted && str(fd, "redirect") === "1") redirect("/admin/products?deleted=1");
  return res;
}

export async function updateSortAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async () => {
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
  return adminAction(async ({ adminId }) => {
    const productId = str(fd, "productId");
    const fileId = str(fd, "fileId");
    if (!isUuid(productId) || !isUuid(fileId)) throw new AdminError("طلب غير صالح");
    await deleteProductFile(productId, fileId, adminId);
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true, message: "تم حذف الملف" };
  });
}

export async function moveFileAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async () => {
    const productId = str(fd, "productId");
    const fileId = str(fd, "fileId");
    const dir = str(fd, "dir") === "up" ? "up" : "down";
    if (!isUuid(productId) || !isUuid(fileId)) throw new AdminError("طلب غير صالح");
    await moveProductFile(productId, fileId, dir);
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true };
  });
}

export async function renameFileAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async () => {
    const productId = str(fd, "productId");
    const fileId = str(fd, "fileId");
    const title = str(fd, "title");
    if (!isUuid(productId) || !isUuid(fileId)) throw new AdminError("طلب غير صالح");
    if (title.length < 1 || title.length > 160) throw new AdminError("اسم الملف غير صالح");
    await renameProductFile(productId, fileId, title);
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true, message: "تم تغيير الاسم" };
  });
}

export async function regeneratePreviewAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId }) => {
    const productId = str(fd, "productId");
    if (!isUuid(productId)) throw new AdminError("طلب غير صالح");
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
    await audit({ actorId: adminId, action: "product.preview_regenerate", entityType: "product", entityId: productId, metadata: { result: r } });
    revalidatePath(`/admin/products/${productId}`);
    return {
      ok: true,
      message: r === "generated" ? "تم توليد المعاينة المجانية" : r === "custom" ? "توجد معاينة مخصصة مرفوعة يدويًا" : "لا توجد معاينة (عدد الصفحات صفر أو لا يوجد ملف)",
    };
  });
}

export async function removeCoverAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId }) => {
    const productId = str(fd, "productId");
    if (!isUuid(productId)) throw new AdminError("طلب غير صالح");
    const [p] = await sql<{ cover_key: string | null }[]>`select cover_key from products where id = ${productId}`;
    if (p?.cover_key) {
      await sql`update products set cover_key = null where id = ${productId}`;
      await storage().remove("public", p.cover_key).catch(() => {});
      await audit({ actorId: adminId, action: "product.cover_remove", entityType: "product", entityId: productId });
    }
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true, message: "تمت إزالة الغلاف" };
  });
}

// ---------------------------------------------------------------- الباقات

export async function addBundleItemAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId }) => {
    const bundleId = str(fd, "bundleId");
    const ids = fd.getAll("productId").filter((x): x is string => typeof x === "string" && isUuid(x));
    if (!isUuid(bundleId) || ids.length === 0) throw new AdminError("اختر منتجًا واحدًا على الأقل");
    for (const id of ids) await addBundleItem(bundleId, id, adminId);
    revalidatePath(`/admin/products/${bundleId}`);
    revalidatePath("/admin/bundles");
    return { ok: true, message: `تمت إضافة ${ids.length} منتج إلى الباقة` };
  });
}

export async function removeBundleItemAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId }) => {
    const bundleId = str(fd, "bundleId");
    const productId = str(fd, "productId");
    if (!isUuid(bundleId) || !isUuid(productId)) throw new AdminError("طلب غير صالح");
    await removeBundleItem(bundleId, productId, adminId);
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

export async function addBunnyLessonAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId }) => {
    const productId = str(fd, "productId");
    if (!isUuid(productId)) throw new AdminError("طلب غير صالح");
    const parsed = lessonSchema.safeParse({ title: str(fd, "title"), unitTitle: str(fd, "unitTitle"), description: str(fd, "description") });
    if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "راجع بيانات الدرس", fieldErrors(parsed.error));
    const videoId = str(fd, "videoRef");
    if (!/^[0-9a-f-]{36}$/i.test(videoId)) throw new AdminError("معرّف فيديو Bunny غير صحيح — انسخ Video ID (بصيغة GUID) من لوحة Bunny Stream", { videoRef: "معرّف غير صحيح" });
    const [p] = await sql<{ type: string }[]>`select type from products where id = ${productId}`;
    if (p?.type !== "video_course") throw new AdminError("الدروس متاحة لمنتجات الفيديو فقط");
    const order = await nextLessonOrder(productId);
    const minutes = Number(str(fd, "durationMinutes") || "0");
    const [l] = await sql<{ id: string }[]>`
      insert into lessons (product_id, unit_title, title, description, provider, video_ref, duration_seconds, is_free_preview, sort_order)
      values (${productId}, ${parsed.data.unitTitle}, ${parsed.data.title}, ${parsed.data.description}, 'bunny', ${videoId},
              ${Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : null}, ${bool(fd, "isFreePreview")}, ${order})
      returning id
    `;
    await audit({ actorId: adminId, action: "lesson.create", entityType: "product", entityId: productId, metadata: { lessonId: l.id, provider: "bunny" } });
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true, message: "تمت إضافة الدرس" };
  });
}

export async function updateLessonAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId }) => {
    const productId = str(fd, "productId");
    const lessonId = str(fd, "lessonId");
    if (!isUuid(productId) || !isUuid(lessonId)) throw new AdminError("طلب غير صالح");
    const parsed = lessonSchema.safeParse({ title: str(fd, "title"), unitTitle: str(fd, "unitTitle"), description: str(fd, "description") });
    if (!parsed.success) throw new AdminError(parsed.error.issues[0]?.message ?? "راجع بيانات الدرس", fieldErrors(parsed.error));
    await sql`
      update lessons set title = ${parsed.data.title}, unit_title = ${parsed.data.unitTitle}, description = ${parsed.data.description},
        is_free_preview = ${bool(fd, "isFreePreview")}, is_published = ${bool(fd, "isPublished")}
      where id = ${lessonId} and product_id = ${productId}
    `;
    await audit({ actorId: adminId, action: "lesson.update", entityType: "product", entityId: productId, metadata: { lessonId } });
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true, message: "تم حفظ الدرس" };
  });
}

export async function deleteLessonAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId }) => {
    const productId = str(fd, "productId");
    const lessonId = str(fd, "lessonId");
    if (!isUuid(productId) || !isUuid(lessonId)) throw new AdminError("طلب غير صالح");
    await deleteLesson(productId, lessonId, adminId);
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true, message: "تم حذف الدرس" };
  });
}

export async function moveLessonAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async () => {
    const productId = str(fd, "productId");
    const lessonId = str(fd, "lessonId");
    if (!isUuid(productId) || !isUuid(lessonId)) throw new AdminError("طلب غير صالح");
    await moveLesson(productId, lessonId, str(fd, "dir") === "up" ? "up" : "down");
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true };
  });
}
