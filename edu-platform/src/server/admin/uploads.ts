import "server-only";
import { z } from "zod";
import { sql } from "../db";
import { storage, newStorageKey, sniffMime, UPLOAD_RULES, type UploadKind } from "../storage";
import { getPdfPageCount } from "../access/pdf";
import { audit } from "../platform/audit";
import { getSettings, saveSettings } from "../platform/settings";
import { AdminError, UUID_RE } from "./common";
import { nextLessonOrder, refreshPageCount, regenerateAutoPreview } from "./products";

/**
 * رفع الملفات على خطوتين (يعمل على Vercel لأن الملف لا يمر عبر الدوال):
 * 1) init: التحقق من النوع والحجم → مفتاح تخزين غير قابل للتخمين + رابط رفع مؤقت
 * 2) complete: التحقق الفعلي من الملف في التخزين (الحجم + التوقيع الثنائي) ثم ربطه بالمنتج
 */

export const UPLOAD_TARGETS = ["main", "preview", "cover", "lesson", "logo"] as const;
export type UploadTarget = (typeof UPLOAD_TARGETS)[number];

const TARGET_KIND: Record<UploadTarget, UploadKind> = {
  main: "pdf",
  preview: "pdf",
  cover: "image",
  lesson: "video",
  logo: "image",
};

function prefixFor(target: UploadTarget, productId: string | null): string {
  switch (target) {
    case "main":
      return `products/${productId}`;
    case "preview":
      return `previews/${productId}`;
    case "cover":
      return `covers/${productId}`;
    case "lesson":
      return `lessons/${productId}`;
    case "logo":
      return "brand";
  }
}

const KIND_LABEL: Record<UploadKind, string> = { pdf: "PDF", image: "صورة (JPG أو PNG أو WEBP)", video: "فيديو MP4" };

export const initSchema = z.object({
  target: z.enum(UPLOAD_TARGETS),
  productId: z.string().regex(UUID_RE).nullable().optional(),
  kind: z.enum(["pdf", "image", "video"]).optional(),
  fileName: z.string().min(1).max(255),
  size: z.number().int().positive(),
  mime: z.string().max(100),
});

export async function initUpload(input: z.infer<typeof initSchema>, adminId: string) {
  const kind = TARGET_KIND[input.target];
  if (input.kind && input.kind !== kind) throw new AdminError("نوع الملف لا يناسب هذا الحقل");
  const rules = UPLOAD_RULES[kind];
  const mime = input.mime === "image/jpg" ? "image/jpeg" : input.mime;
  if (!(rules.mime as readonly string[]).includes(mime)) throw new AdminError(`نوع الملف غير مسموح. المطلوب: ${KIND_LABEL[kind]}`);
  if (input.size > rules.maxBytes) throw new AdminError(`حجم الملف أكبر من المسموح (${Math.round(rules.maxBytes / 1024 / 1024)} ميجابايت)`);
  const productId = input.productId ?? null;
  if (input.target !== "logo") {
    if (!productId) throw new AdminError("المنتج غير محدد");
    const [p] = await sql<{ type: string }[]>`select type from products where id = ${productId}`;
    if (!p) throw new AdminError("المنتج غير موجود");
    if (input.target === "lesson" && p.type !== "video_course") throw new AdminError("الفيديو يُرفع لمنتجات دروس الفيديو فقط");
    if ((input.target === "main" || input.target === "preview") && (p.type === "bundle" || p.type === "video_course")) {
      throw new AdminError("هذا النوع من المنتجات لا يحتوي ملفات PDF");
    }
  }
  const key = newStorageKey(kind, mime, prefixFor(input.target, productId));
  const target = await storage().createUploadTarget(rules.bucket, key, mime, rules.maxBytes, adminId);
  return { key, kind, ...target };
}

export const completeSchema = z.object({
  target: z.enum(UPLOAD_TARGETS),
  key: z.string().min(5).max(220),
  productId: z.string().regex(UUID_RE).nullable().optional(),
  title: z.string().trim().max(160).optional(),
  originalName: z.string().max(255).optional(),
  unitTitle: z.string().trim().max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  isFreePreview: z.boolean().optional(),
});

function stripExt(name: string) {
  return name.replace(/\.[a-z0-9]{2,5}$/i, "").trim().slice(0, 160);
}

export async function completeUpload(input: z.infer<typeof completeSchema>, adminId: string) {
  const kind = TARGET_KIND[input.target];
  const rules = UPLOAD_RULES[kind];
  const productId = input.productId ?? null;
  const expectedPrefix = `${prefixFor(input.target, productId)}/`;
  // المفتاح يجب أن يكون صادرًا لنفس الهدف والمنتج (يمنع ربط ملفات منتج آخر)
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
    await audit({ actorId: adminId, action: `product.file_upload`, entityType: "product", entityId: productId, metadata: { fileId: row.id, kind: input.target, title, pages: pageCount, size: stat.size } });
    return { id: row.id, message: `تم رفع «${title}» (${pageCount} صفحة)` };
  }

  if (input.target === "cover") {
    const [p] = await sql<{ cover_key: string | null }[]>`select cover_key from products where id = ${productId}`;
    if (!p) return reject("المنتج غير موجود");
    await sql`update products set cover_key = ${input.key} where id = ${productId}`;
    if (p.cover_key && p.cover_key !== input.key) await storage().remove("public", p.cover_key).catch(() => {});
    await audit({ actorId: adminId, action: "product.cover_upload", entityType: "product", entityId: productId });
    return { id: productId!, message: "تم تحديث صورة الغلاف" };
  }

  if (input.target === "logo") {
    const current = await getSettings();
    await saveSettings({ logo_key: input.key }, adminId);
    if (current.logo_key && current.logo_key !== input.key) await storage().remove("public", current.logo_key).catch(() => {});
    await audit({ actorId: adminId, action: "settings.logo_upload", entityType: "settings", entityId: "logo_key" });
    return { id: input.key, message: "تم تحديث الشعار" };
  }

  // lesson
  const title = input.title || stripExt(originalName);
  if (!title || title.length < 2) return reject("عنوان الدرس مطلوب");
  const order = await nextLessonOrder(productId!);
  const [lesson] = await sql<{ id: string }[]>`
    insert into lessons (product_id, unit_title, title, description, provider, video_ref, mime_type, size_bytes, is_free_preview, sort_order)
    values (${productId}, ${input.unitTitle ?? ""}, ${title}, ${input.description ?? ""}, 'file', ${input.key}, ${mime}, ${stat.size},
            ${input.isFreePreview ?? false}, ${order})
    returning id
  `;
  await audit({ actorId: adminId, action: "lesson.create", entityType: "product", entityId: productId, metadata: { lessonId: lesson.id, title, provider: "file" } });
  return { id: lesson.id, message: `تمت إضافة الدرس «${title}»` };
}
