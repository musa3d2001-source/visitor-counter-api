import "server-only";
import { z } from "zod";
import { sql } from "../db";
import { storage, newStorageKey, sniffMime, UPLOAD_RULES, type UploadKind } from "../storage";
import { getPdfPageCount } from "../access/pdf";
import { audit } from "../platform/audit";
import { getSettings, saveSettings } from "../platform/settings";
import { assertProductAccess, PermissionError, type Actor } from "../auth/permissions";
import { createVideo, tusUploadCredentials } from "../video/bunny";
import { activeVideoProvider, probeStoredMp4Duration, syncLessonStatus } from "../video/service";
import { AdminError, UUID_RE } from "./common";
import { nextLessonOrder, refreshPageCount, regenerateAutoPreview } from "./products";
import { setTeacherPhoto } from "./teachers";
import { isVideoType, PDF_PRODUCT_TYPES, type ProductType } from "@/lib/labels";

/**
 * رفع الملفات على خطوتين (يعمل على Vercel لأن الملف لا يمر عبر الدوال):
 * 1) init: التحقق من النوع والحجم والصلاحية → مفتاح تخزين غير قابل للتخمين + رابط رفع مؤقت
 *    (الفيديو مع Bunny: إنشاء فيديو في المكتبة + توقيع TUS — المفتاح السري لا يغادر الخادم)
 * 2) complete: التحقق الفعلي من الملف في التخزين (الحجم + التوقيع الثنائي) ثم ربطه بالمنتج
 * المعلم يرفع لمسوداته فقط وبشرط تفعيل صلاحية الرفع.
 */

export const UPLOAD_TARGETS = ["main", "preview", "cover", "lesson", "logo", "teacher_photo", "lesson_thumb"] as const;
export type UploadTarget = (typeof UPLOAD_TARGETS)[number];

const TARGET_KIND: Record<UploadTarget, UploadKind> = {
  main: "pdf",
  preview: "pdf",
  cover: "image",
  lesson: "video",
  logo: "image",
  teacher_photo: "image",
  lesson_thumb: "image",
};

function prefixFor(target: UploadTarget, ref: string | null): string {
  switch (target) {
    case "main":
      return `products/${ref}`;
    case "preview":
      return `previews/${ref}`;
    case "cover":
      return `covers/${ref}`;
    case "lesson":
      return `lessons/${ref}`;
    case "lesson_thumb":
      return `lesson-thumbs/${ref}`;
    case "teacher_photo":
      return `teachers/${ref}`;
    case "logo":
      return "brand";
  }
}

const KIND_LABEL: Record<UploadKind, string> = { pdf: "PDF", image: "صورة (JPG أو PNG أو WEBP)", video: "فيديو MP4" };

/** حد حجم الفيديو المرفوع مباشرة إلى Bunny */
const BUNNY_MAX_BYTES = 8 * 1024 * 1024 * 1024;
const BUNNY_MIME = ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"];

export const initSchema = z.object({
  target: z.enum(UPLOAD_TARGETS),
  productId: z.string().regex(UUID_RE).nullable().optional(),
  teacherId: z.string().regex(UUID_RE).nullable().optional(),
  lessonId: z.string().regex(UUID_RE).nullable().optional(),
  kind: z.enum(["pdf", "image", "video"]).optional(),
  fileName: z.string().min(1).max(255),
  size: z.number().int().positive(),
  mime: z.string().max(100),
  title: z.string().trim().max(160).optional(),
  unitTitle: z.string().trim().max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  isFreePreview: z.boolean().optional(),
});

function stripExt(name: string) {
  return name.replace(/\.[a-z0-9]{2,5}$/i, "").trim().slice(0, 160);
}

/** التحقق من صلاحية الهدف وإرجاع المرجع المستخدم في مسار التخزين */
async function authorizeTarget(
  actor: Actor,
  target: UploadTarget,
  ids: { productId?: string | null; teacherId?: string | null; lessonId?: string | null },
): Promise<{ ref: string | null; productType?: ProductType }> {
  if (target === "logo") {
    if (actor.kind !== "owner") throw new PermissionError("هذا الإجراء متاح للمالك فقط");
    return { ref: null };
  }
  if (target === "teacher_photo") {
    const teacherId = actor.kind === "teacher" ? actor.teacherId : ids.teacherId;
    if (!teacherId) throw new AdminError("المعلم غير محدد");
    if (actor.kind === "teacher" && ids.teacherId && ids.teacherId !== actor.teacherId) throw new PermissionError("يمكنك تعديل صورتك فقط");
    const [t] = await sql`select 1 from teachers where id = ${teacherId}`;
    if (!t) throw new AdminError("المعلم غير موجود");
    return { ref: teacherId };
  }
  const productId = ids.productId ?? null;
  if (!productId) throw new AdminError("المنتج غير محدد");
  const p = await assertProductAccess(actor, productId, actor.kind === "owner" ? "view" : "upload");
  const type = p.type as ProductType;
  if (target === "lesson" && !isVideoType(type)) throw new AdminError("الفيديو يُرفع لمنتجات الفيديو فقط (درس، وحدة، مراجعة، دورة)");
  if ((target === "main" || target === "preview") && type === "bundle") throw new AdminError("الباقة لا تحتوي ملفات مباشرة — أضف منتجات إليها");
  if (target === "preview" && !PDF_PRODUCT_TYPES.includes(type)) throw new AdminError("المعاينة المخصصة لمذكرات PDF فقط");
  if (target === "lesson_thumb") {
    if (!ids.lessonId) throw new AdminError("الدرس غير محدد");
    const [l] = await sql`select 1 from lessons where id = ${ids.lessonId} and product_id = ${productId}`;
    if (!l) throw new AdminError("الدرس غير موجود");
  }
  return { ref: productId, productType: type };
}

export async function initUpload(input: z.infer<typeof initSchema>, actor: Actor) {
  const kind = TARGET_KIND[input.target];
  if (input.kind && input.kind !== kind) throw new AdminError("نوع الملف لا يناسب هذا الحقل");
  const { ref } = await authorizeTarget(actor, input.target, input);
  const mime = input.mime === "image/jpg" ? "image/jpeg" : input.mime;

  // فيديو عبر Bunny Stream: رفع TUS مباشر من المتصفح
  if (input.target === "lesson" && activeVideoProvider() === "bunny") {
    if (!BUNNY_MIME.includes(mime)) throw new AdminError("نوع الفيديو غير مدعوم. المطلوب: MP4 أو MOV أو WEBM");
    if (input.size > BUNNY_MAX_BYTES) throw new AdminError("حجم الفيديو أكبر من 8 جيجابايت");
    const title = input.title || stripExt(input.fileName);
    if (!title || title.length < 2) throw new AdminError("عنوان الدرس مطلوب");
    const video = await createVideo(title);
    const order = await nextLessonOrder(ref!);
    // سجل الدرس يُنشأ فورًا بحالة «قيد الرفع» — إن لم يكتمل الرفع يظهر للفريق ويمكن حذفه
    await sql`
      insert into lessons (product_id, unit_title, title, description, provider, video_ref, mime_type, size_bytes, is_free_preview,
        sort_order, processing_status, uploaded_by)
      values (${ref}, ${input.unitTitle ?? ""}, ${title}, ${input.description ?? ""}, 'bunny', ${video.guid}, ${mime}, ${input.size},
        ${input.isFreePreview ?? false}, ${order}, 'uploading', ${actor.userId})
    `;
    const creds = tusUploadCredentials(video.guid);
    await audit({ actorId: actor.userId, action: "lesson.upload_start", entityType: "product", entityId: ref, metadata: { provider: "bunny", videoId: video.guid, title } });
    return { method: "TUS" as const, key: video.guid, kind, videoId: video.guid, endpoint: creds.endpoint, headers: creds.headers, metadata: { filetype: mime, title } };
  }

  const rules = UPLOAD_RULES[kind];
  if (!(rules.mime as readonly string[]).includes(mime)) throw new AdminError(`نوع الملف غير مسموح. المطلوب: ${KIND_LABEL[kind]}`);
  if (input.size > rules.maxBytes) throw new AdminError(`حجم الملف أكبر من المسموح (${Math.round(rules.maxBytes / 1024 / 1024)} ميجابايت)`);
  const key = newStorageKey(kind, mime, prefixFor(input.target, ref));
  const target = await storage().createUploadTarget(rules.bucket, key, mime, rules.maxBytes, actor.userId);
  return { key, kind, ...target };
}

export const completeSchema = z.object({
  target: z.enum(UPLOAD_TARGETS),
  key: z.string().min(5).max(220),
  productId: z.string().regex(UUID_RE).nullable().optional(),
  teacherId: z.string().regex(UUID_RE).nullable().optional(),
  lessonId: z.string().regex(UUID_RE).nullable().optional(),
  title: z.string().trim().max(160).optional(),
  originalName: z.string().max(255).optional(),
  unitTitle: z.string().trim().max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  isFreePreview: z.boolean().optional(),
});

export async function completeUpload(input: z.infer<typeof completeSchema>, actor: Actor) {
  const { ref } = await authorizeTarget(actor, input.target, input);
  const productId = input.productId ?? null;

  // فيديو Bunny: الملف عند Bunny — نحدّث الحالة ونستعلم عن المعالجة
  if (input.target === "lesson" && /^[0-9a-f-]{36}$/i.test(input.key) && !input.key.includes("/")) {
    const rows = await sql<{ id: string; title: string }[]>`
      update lessons set processing_status = 'processing', processing_error = null
      where provider = 'bunny' and video_ref = ${input.key} and product_id = ${productId} and processing_status = 'uploading'
      returning id, title
    `;
    const lesson = rows[0];
    if (!lesson) throw new AdminError("الدرس غير موجود أو اكتمل رفعه مسبقًا");
    try {
      await syncLessonStatus(lesson.id);
    } catch (err) {
      console.error("[upload-complete] bunny sync", err);
    }
    await audit({ actorId: actor.userId, action: "lesson.create", entityType: "product", entityId: productId, metadata: { lessonId: lesson.id, title: lesson.title, provider: "bunny", videoId: input.key } });
    return { id: lesson.id, message: `تم رفع «${lesson.title}» — جارٍ معالجة الفيديو، ولن يظهر للطلاب قبل اكتمالها` };
  }

  const kind = TARGET_KIND[input.target];
  const rules = UPLOAD_RULES[kind];
  const expectedPrefix = `${prefixFor(input.target, ref)}/`;
  // المفتاح يجب أن يكون صادرًا لنفس الهدف والمرجع (يمنع ربط ملفات منتج أو معلم آخر)
  if (!input.key.startsWith(expectedPrefix) || !/^[a-z0-9/_.-]+$/i.test(input.key) || input.key.includes("..")) {
    throw new AdminError("مرجع الملف غير صالح");
  }
  const bucket = rules.bucket;
  const reject = async (msg: string): Promise<never> => {
    await storage().remove(bucket, input.key).catch(() => {});
    throw new AdminError(msg);
  };

  const stat = await storage().stat(bucket, input.key);
  if (!stat) throw new AdminError("لم يكتمل رفع الملف. حاول مرة أخرى.");
  if (stat.size <= 0) await reject("الملف فارغ");
  if (stat.size > rules.maxBytes) await reject("حجم الملف أكبر من المسموح");
  const head = await storage().readHead(bucket, input.key, 16);
  const mime = sniffMime(head);
  if (!mime || !(rules.mime as readonly string[]).includes(mime)) await reject(`محتوى الملف لا يطابق النوع المطلوب (${KIND_LABEL[kind]})`);

  const originalName = (input.originalName ?? "").slice(0, 255);

  if (input.target === "main" || input.target === "preview") {
    const [exists] = await sql`select 1 from product_files where storage_key = ${input.key}`;
    if (exists) throw new AdminError("تم تسجيل هذا الملف مسبقًا");
    let pageCount: number;
    try {
      const bytes = await storage().read(bucket, input.key);
      pageCount = await getPdfPageCount(bytes);
    } catch {
      return reject("تعذر قراءة ملف PDF — قد يكون تالفًا أو محميًا بكلمة مرور");
    }
    const title = input.title || stripExt(originalName) || (input.target === "main" ? "ملف المذكرة" : "معاينة مجانية");
    if (input.target === "preview") {
      // معاينة مخصصة تحل محل المعاينة التلقائية والسابقة
      const old = await sql<{ id: string; storage_key: string }[]>`select id, storage_key from product_files where product_id = ${productId} and kind = 'preview'`;
      for (const o of old) {
        await sql`delete from product_files where id = ${o.id}`;
        await storage().remove("private", o.storage_key).catch(() => {});
      }
    }
    const [{ next }] = await sql<{ next: number }[]>`
      select coalesce(max(sort_order), -1)::int + 1 as next from product_files where product_id = ${productId} and kind = ${input.target}
    `;
    const [row] = await sql<{ id: string }[]>`
      insert into product_files (product_id, kind, title, storage_key, original_name, mime_type, size_bytes, page_count, is_auto_preview, sort_order)
      values (${productId}, ${input.target}, ${title}, ${input.key}, ${originalName}, 'application/pdf', ${stat.size}, ${pageCount}, false, ${next})
      returning id
    `;
    if (input.target === "main") {
      await refreshPageCount(productId!);
      await regenerateAutoPreview(productId!);
    }
    await audit({ actorId: actor.userId, action: `product.file_upload`, entityType: "product", entityId: productId, metadata: { fileId: row.id, kind: input.target, title, pages: pageCount, size: stat.size } });
    return { id: row.id, message: `تم رفع «${title}» (${pageCount} صفحة)` };
  }

  if (input.target === "cover") {
    const [p] = await sql<{ cover_key: string | null }[]>`select cover_key from products where id = ${productId}`;
    if (!p) return reject("المنتج غير موجود");
    await sql`update products set cover_key = ${input.key} where id = ${productId}`;
    if (p.cover_key && p.cover_key !== input.key) await storage().remove("public", p.cover_key).catch(() => {});
    await audit({ actorId: actor.userId, action: "product.cover_upload", entityType: "product", entityId: productId });
    return { id: productId!, message: "تم تحديث صورة الغلاف" };
  }

  if (input.target === "logo") {
    const current = await getSettings();
    await saveSettings({ logo_key: input.key }, actor.userId);
    if (current.logo_key && current.logo_key !== input.key) await storage().remove("public", current.logo_key).catch(() => {});
    await audit({ actorId: actor.userId, action: "settings.logo_upload", entityType: "settings", entityId: "logo_key" });
    return { id: input.key, message: "تم تحديث الشعار" };
  }

  if (input.target === "teacher_photo") {
    await setTeacherPhoto(ref!, input.key, actor.userId);
    return { id: ref!, message: "تم تحديث صورة المعلم" };
  }

  if (input.target === "lesson_thumb") {
    const [l] = await sql<{ thumbnail_key: string | null }[]>`select thumbnail_key from lessons where id = ${input.lessonId!} and product_id = ${productId}`;
    if (!l) return reject("الدرس غير موجود");
    await sql`update lessons set thumbnail_key = ${input.key} where id = ${input.lessonId!}`;
    if (l.thumbnail_key && l.thumbnail_key !== input.key) await storage().remove("public", l.thumbnail_key).catch(() => {});
    await audit({ actorId: actor.userId, action: "lesson.thumbnail_upload", entityType: "product", entityId: productId, metadata: { lessonId: input.lessonId } });
    return { id: input.lessonId!, message: "تم تحديث الصورة المصغرة" };
  }

  // lesson (file provider): يصبح جاهزًا بعد التحقق من الملف وقراءة مدته
  const title = input.title || stripExt(originalName);
  if (!title || title.length < 2) return reject("عنوان الدرس مطلوب");
  const [dup] = await sql`select 1 from lessons where provider = 'file' and video_ref = ${input.key}`;
  if (dup) throw new AdminError("تم تسجيل هذا الملف مسبقًا");
  const duration = await probeStoredMp4Duration(input.key, stat.size);
  const order = await nextLessonOrder(productId!);
  const [lesson] = await sql<{ id: string }[]>`
    insert into lessons (product_id, unit_title, title, description, provider, video_ref, mime_type, size_bytes, duration_seconds,
      is_free_preview, sort_order, processing_status, uploaded_by)
    values (${productId}, ${input.unitTitle ?? ""}, ${title}, ${input.description ?? ""}, 'file', ${input.key}, ${mime}, ${stat.size},
            ${duration}, ${input.isFreePreview ?? false}, ${order}, 'ready', ${actor.userId})
    returning id
  `;
  await audit({ actorId: actor.userId, action: "lesson.create", entityType: "product", entityId: productId, metadata: { lessonId: lesson.id, title, provider: "file", duration } });
  return { id: lesson.id, message: `تمت إضافة الدرس «${title}»` };
}
