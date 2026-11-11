import "server-only";
import { ar } from "@/lib/design";
import { z } from "zod";
import { sql, type Db } from "../db";
import { storage, newStorageKey, sniffMime, storageFileCap, toMb, uploadLimitBytes, UPLOAD_RULES, type UploadKind } from "../storage";
import { inspectPdf, PreviewNotIsolatedError, rebuildCustomPreview, StampDeadlineError } from "../access/pdf";
import { UPLOAD_REJECTION } from "../access/file-check";
import { StampBusyError, withStampSlot } from "../access/stamp-gate";
import { DRAIN_BUDGET_MS, enqueueBuyerCopies, scheduleStampDrain } from "../access/stamp-queue";
import { hitRateLimit } from "../auth/rate-limit";
import { STAMP_LIMIT_REASON } from "@/lib/pdf-limits";
import { audit } from "../platform/audit";
import { reportError } from "../platform/report-error";
import { getSettings, saveSettings } from "../platform/settings";
import { assertProductAccess, PermissionError, type Actor } from "../auth/permissions";
import { createVideo, deleteVideo, tusUploadCredentials } from "../video/bunny";
import { videoHostingBlocked } from "../video/policy";
import { activeVideoProvider, probeStoredMp4Duration, syncLessonStatus } from "../video/service";
import { AdminError, UUID_RE } from "./common";
import { firstMainFile, nextLessonOrder, refreshPageCount, regenerateAutoPreview, type PreviewResult } from "./products";
import { setTeacherPhoto } from "./teachers";
import { proposeTeacherPhoto } from "./teacher-profile-review";
import { isVideoType, PDF_PRODUCT_TYPES, type ProductType } from "@/lib/labels";
import { maxPreviewPages, PREVIEW_POLICY } from "@/lib/preview-policy";
import { isUuid } from "@/lib/uuid";

/**
 * رفع الملفات على خطوتين (يعمل على Vercel لأن الملف لا يمر عبر الدوال):
 * 1) init: التحقق من النوع والحجم والصلاحية → مفتاح تخزين غير قابل للتخمين + رابط رفع مؤقت
 *    (الفيديو مع Bunny: إنشاء فيديو في المكتبة + توقيع TUS — المفتاح السري لا يغادر الخادم)
 * 2) complete: التحقق الفعلي من الملف في التخزين (الحجم + التوقيع الثنائي) ثم ربطه بالمنتج
 * المعلم يرفع لمسوداته فقط وبشرط تفعيل صلاحية الرفع.
 */

/**
 * حد روابط الرفع لكل حساب في الساعة: المالك الذي يرفع كتالوجه دفعة واحدة لا يصل إليه،
 * وحساب معلم مسروق لا يملأ التخزين بروابط لا تنتهي.
 */
export const UPLOAD_TICKET_LIMIT = { perHour: 120, windowSeconds: 60 * 60 } as const;
/** رابط الرفع يُستعمل خلال هذه المدة، وكائن لم يُؤكد بعدها يحذفه التنظيف اليومي */
export const UPLOAD_TICKET_HOURS = 24;

/** طلبات تجهيز رفع كثيرة من الحساب نفسه */
export class UploadRateLimitError extends AdminError {
  constructor(readonly retryAfterSeconds: number) {
    super("طلبت روابط رفع كثيرة في وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.");
  }
}

/** عطل في التخزين وليس عيبًا في الملف: الملف باقٍ ويكفي إعادة التأكيد */
export class UploadStorageError extends AdminError {}
/** قال التخزين صراحة إن الملف غير موجود: إعادة التأكيد لا تفيد، ويلزم رفعه من جديد */
export class UploadMissingError extends AdminError {}

async function fromStorage<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    // قد نكون داخل معاملة، فالتسجيل في مسار الرفع نفسه بعد انتهائها
    const failure = new UploadStorageError("تعذر قراءة الملف من التخزين الآن. حاول مرة أخرى.");
    failure.cause = err;
    throw failure;
  }
}

/** النسخة المعزولة من معاينة مرفوعة. مفتاحها مشتق من الأصل، فتأكيد مكرر يصل إلى السجل نفسه */
const isolatedPreviewKey = (key: string) => key.replace(/\.pdf$/i, ".isolated.pdf");

/** المفتاح مربوط الآن بملف أو غلاف أو صورة أو درس، فلا يحذفه رفض رفع */
async function storageKeyInUse(key: string): Promise<boolean> {
  const [{ used }] = await sql<{ used: boolean }[]>`
    select exists (select 1 from product_files where storage_key = ${key})
      or exists (select 1 from products where cover_key = ${key})
      or exists (select 1 from teachers where photo_key = ${key})
      or exists (select 1 from teacher_profile_changes where photo_key = ${key} and status = 'pending')
      or exists (select 1 from lessons where thumbnail_key = ${key} or (provider = 'file' and video_ref = ${key}))
      as used
  `;
  return used;
}

/** على منصة المذكرات فقط لا يصل فيديو المعلم إلى النشر أبدًا، فلا يضيع وقته في رفعه */
const VIDEO_UPLOAD_CLOSED = "استضافة الفيديو غير مفعّلة على المنصة بعد، فلا يمكن رفع الدروس الآن. يمكنك رفع مذكرات PDF.";

function assertLessonUploadOpen(target: UploadTarget, actor: Actor) {
  if (target === "lesson" && actor.kind === "teacher" && videoHostingBlocked()) throw new AdminError(VIDEO_UPLOAD_CLOSED);
}

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

/** رسالة تجاوز الحجم: التفاصيل والحل للمالك فقط، والمعلم يعرف الحد وما يفعله */
function tooLargeMessage(kind: UploadKind, actor: Actor): string {
  const limit = uploadLimitBytes(kind);
  const mb = toMb(limit);
  const capped = limit < UPLOAD_RULES[kind].maxBytes;
  // حد PDF من ذاكرة الختم لا من خطة التخزين: يقال سببه وما يفعله الرافع
  if (kind === "pdf" && !capped) return `حجم الملف أكبر من المسموح (${mb} ميجابايت). ${STAMP_LIMIT_REASON}`;
  if (capped && actor.kind === "owner") {
    const why = storageFileCap().source === "free_plan" ? "حد الملف الواحد في خطة التخزين المجانية" : "حد الملف الواحد المضبوط للتخزين";
    return `حجم الملف أكبر من ${mb} ميجابايت، وهو ${why}. طريقة رفع الحد موضحة في الإعدادات، قسم التخزين.`;
  }
  return capped ? `حجم الملف أكبر من الحد المتاح حاليًا (${mb} ميجابايت). قسّم الملف أو تواصل مع إدارة المنصة.` : `حجم الملف أكبر من المسموح (${mb} ميجابايت)`;
}

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
  /** محاولة سابقة لم تكتمل لهذا الدرس، حتى لا يُنشأ درس آخر عند إعادة الرفع */
  resumeVideoId: z.string().regex(UUID_RE).optional(),
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
  if ((target === "main" || target === "preview") && type === "bundle") throw new AdminError("الباقة لا تحتوي ملفات مباشرة، أضف منتجات إليها");
  if (target === "preview" && !PDF_PRODUCT_TYPES.includes(type)) throw new AdminError("المعاينة المخصصة لمذكرات PDF فقط");
  if (target === "lesson_thumb") {
    if (!ids.lessonId) throw new AdminError("الدرس غير محدد");
    const [l] = await sql`select 1 from lessons where id = ${ids.lessonId} and product_id = ${productId}`;
    if (!l) throw new AdminError("الدرس غير موجود");
  }
  return { ref: productId, productType: type };
}

/**
 * تذكرة الرفع: المفتاح والحجم المعلن ومن طلبه. التأكيد لا يقبل مفتاحًا بلا تذكرة من الشخص نفسه،
 * ويقارن حجم ما وصل بالحجم المعلن. Supabase لا يحد حجم رابط الرفع الموقّع نفسه، فهذا هو الحد.
 */
export async function recordUploadTicket(ticket: { key: string; bucket: "private" | "public"; target: UploadTarget; actorId: string; declaredSize: number }) {
  await sql`
    insert into upload_tickets (storage_key, bucket, target, actor_id, declared_size)
    values (${ticket.key}, ${ticket.bucket}, ${ticket.target}, ${ticket.actorId}, ${ticket.declaredSize})
  `;
}

export async function initUpload(input: z.infer<typeof initSchema>, actor: Actor) {
  const kind = TARGET_KIND[input.target];
  if (input.kind && input.kind !== kind) throw new AdminError("نوع الملف لا يناسب هذا الحقل");
  const slot = await hitRateLimit(`upload-init:${actor.userId}`, UPLOAD_TICKET_LIMIT.perHour, UPLOAD_TICKET_LIMIT.windowSeconds);
  if (!slot.allowed) throw new UploadRateLimitError(slot.retryAfterSeconds);
  const { ref } = await authorizeTarget(actor, input.target, input);
  assertLessonUploadOpen(input.target, actor);
  const mime = input.mime === "image/jpg" ? "image/jpeg" : input.mime;

  // فيديو عبر Bunny Stream: رفع TUS مباشر من المتصفح
  if (input.target === "lesson" && activeVideoProvider() === "bunny") {
    if (!BUNNY_MIME.includes(mime)) throw new AdminError("نوع الفيديو غير مدعوم. المطلوب: MP4 أو MOV أو WEBM");
    if (input.size > BUNNY_MAX_BYTES) throw new AdminError("حجم الفيديو أكبر من 8 جيجابايت");
    const title = input.title || stripExt(input.fileName);
    if (!title || title.length < 2) throw new AdminError("عنوان الدرس مطلوب");
    const tusStart = (videoId: string) => {
      const creds = tusUploadCredentials(videoId);
      return { method: "TUS" as const, key: videoId, kind, videoId, endpoint: creds.endpoint, headers: creds.headers, metadata: { filetype: mime, title } };
    };
    if (input.resumeVideoId) {
      const [unfinished] = await sql<{ id: string; size_bytes: string | number | null }[]>`
        select id, size_bytes from lessons where provider = 'bunny' and video_ref = ${input.resumeVideoId} and product_id = ${ref} and processing_status = 'uploading'
      `;
      if (unfinished && Number(unfinished.size_bytes) === input.size) {
        await sql`
          update lessons set title = ${title}, unit_title = ${input.unitTitle ?? ""}, description = ${input.description ?? ""}, is_free_preview = ${input.isFreePreview ?? false}, mime_type = ${mime}
          where id = ${unfinished.id}
        `;
        return tusStart(input.resumeVideoId);
      }
      // ملف آخر غير الذي انقطع: لا يبقى الدرس غير المكتمل معلقًا بجانب الجديد
      if (unfinished) {
        await sql`delete from lessons where id = ${unfinished.id}`;
        await deleteVideo(input.resumeVideoId).catch((err) => reportError("upload:video-cleanup", err));
      }
    }
    const video = await createVideo(title);
    const order = await nextLessonOrder(ref!);
    // سجل الدرس يُنشأ فورًا بحالة «قيد الرفع» — إن لم يكتمل الرفع يظهر للفريق ويمكن حذفه
    await sql`
      insert into lessons (product_id, unit_title, title, description, provider, video_ref, mime_type, size_bytes, is_free_preview,
        sort_order, processing_status, uploaded_by)
      values (${ref}, ${input.unitTitle ?? ""}, ${title}, ${input.description ?? ""}, 'bunny', ${video.guid}, ${mime}, ${input.size},
        ${input.isFreePreview ?? false}, ${order}, 'uploading', ${actor.userId})
    `;
    await audit({ actorId: actor.userId, action: "lesson.upload_start", entityType: "product", entityId: ref, metadata: { provider: "bunny", videoId: video.guid, title } });
    return tusStart(video.guid);
  }

  const rules = UPLOAD_RULES[kind];
  if (!(rules.mime as readonly string[]).includes(mime)) throw new AdminError(`نوع الملف غير مسموح. المطلوب: ${KIND_LABEL[kind]}`);
  const limit = uploadLimitBytes(kind);
  // الرفض هنا قبل بدء الرفع، لا بعد أن يقضي المعلم دقائق يرفع ملفًا سترفضه خطة التخزين
  if (input.size > limit) throw new AdminError(tooLargeMessage(kind, actor));
  const key = newStorageKey(kind, mime, prefixFor(input.target, ref));
  await recordUploadTicket({ key, bucket: rules.bucket, target: input.target, actorId: actor.userId, declaredSize: input.size });
  const target = await storage().createUploadTarget(rules.bucket, key, mime, Math.min(limit, input.size), actor.userId);
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
  /** حجم الملف عند المتصفح: للتأكد من وصوله كاملًا */
  size: z.number().int().positive().optional(),
});

const PREVIEW_RESULT_NOTE: Partial<Record<PreviewResult, string>> = {
  too_short: `. الملف أقل من ${ar(PREVIEW_POLICY.pagesPerFreePage)} صفحات فلا تتاح له معاينة`,
  unreadable: ". تعذر توليد المعاينة، ولّدها من قسم المعاينة",
  not_isolated: ". تعذر تجهيز معاينة آمنة من هذا الملف، فلن تظهر له معاينة",
};
const PREVIEW_BUSY_NOTE = ". الخادم مشغول بملفات الطلاب الآن فلم تُولَّد المعاينة، ولّدها من قسم المعاينة بعد قليل";

/** التأكيد قد يصل مرتين إذا ضاع رد الخادم على الشبكة: النتيجة نفسها في المرتين */
export async function completeUpload(input: z.infer<typeof completeSchema>, actor: Actor) {
  const { ref } = await authorizeTarget(actor, input.target, input);
  assertLessonUploadOpen(input.target, actor);
  const productId = input.productId ?? null;

  // فيديو Bunny: الملف عند Bunny — نحدّث الحالة ونستعلم عن المعالجة
  if (input.target === "lesson" && isUuid(input.key) && !input.key.includes("/")) {
    const rows = await sql<{ id: string; title: string }[]>`
      update lessons set processing_status = 'processing', processing_error = null
      where provider = 'bunny' and video_ref = ${input.key} and product_id = ${productId} and processing_status = 'uploading'
      returning id, title
    `;
    const lesson = rows[0];
    if (!lesson) {
      const [already] = await sql<{ id: string; title: string }[]>`
        select id, title from lessons where provider = 'bunny' and video_ref = ${input.key} and product_id = ${productId}
      `;
      if (!already) throw new AdminError("الدرس غير موجود");
      return { id: already.id, message: `تم رفع «${already.title}»، جارٍ معالجة الفيديو، ولن يظهر للطلاب قبل اكتمالها` };
    }
    try {
      await syncLessonStatus(lesson.id);
    } catch (err) {
      await reportError("upload:bunny-sync", err);
    }
    await audit({ actorId: actor.userId, action: "lesson.create", entityType: "product", entityId: productId, metadata: { lessonId: lesson.id, title: lesson.title, provider: "bunny", videoId: input.key } });
    return { id: lesson.id, message: `تم رفع «${lesson.title}»، جارٍ معالجة الفيديو، ولن يظهر للطلاب قبل اكتمالها` };
  }

  const kind = TARGET_KIND[input.target];
  const rules = UPLOAD_RULES[kind];
  const expectedPrefix = `${prefixFor(input.target, ref)}/`;
  // المفتاح يجب أن يكون صادرًا لنفس الهدف والمرجع (يمنع ربط ملفات منتج أو معلم آخر)
  if (!input.key.startsWith(expectedPrefix) || !/^[a-z0-9/_.-]+$/i.test(input.key) || input.key.includes("..")) {
    throw new AdminError("مرجع الملف غير صالح");
  }
  const bucket = rules.bucket;
  const isPdfTarget = input.target === "main" || input.target === "preview";
  const storedKey = input.target === "preview" ? isolatedPreviewKey(input.key) : input.key;
  const findRegistered = (db: Db = sql) =>
    db<{ id: string; title: string; page_count: number | null }[]>`
      select id, title, page_count from product_files where storage_key in (${input.key}, ${storedKey}) and product_id = ${productId} and kind = ${input.target}
    `;
  const registeredReply = (row: { id: string; title: string; page_count: number | null }) => ({ id: row.id, message: `تم رفع «${row.title}» (${row.page_count ?? 0} صفحة)` });

  // تأكيد مكرر (ضاع رد الخادم على الشبكة): جوابه من السجل قبل أي سؤال للتخزين
  if (isPdfTarget) {
    const [already] = await findRegistered();
    if (already) return registeredReply(already);
  }

  const reject = async (msg: string): Promise<never> => {
    // تأكيد متزامن سجّل الملف أثناء فحصنا، أو تأكيد مصنوع بمفتاح ملف قائم: لا يُحذف ملف مستخدم
    if (!(await storageKeyInUse(input.key))) await storage().remove(bucket, input.key).catch(() => {});
    throw new AdminError(msg);
  };

  // المفتاح يجب أن يكون صادرًا من initUpload لهذا الشخص، وخلال مدته
  const [ticket] = await sql<{ actor_id: string; declared_size: string; fresh: boolean }[]>`
    select actor_id, declared_size::text, created_at > now() - make_interval(hours => ${UPLOAD_TICKET_HOURS}) as fresh
    from upload_tickets where storage_key = ${input.key} and target = ${input.target}
  `;
  // رابط رفع شخص آخر: يُرفض ولا يُحذف ملفه الذي ما زال يرفعه
  if (ticket && ticket.actor_id !== actor.userId) throw new AdminError("مرجع الملف غير صالح");
  if (!ticket) return reject("انتهت صلاحية رابط الرفع أو لم يصدر لك. ارفع الملف من جديد.");
  if (!ticket.fresh) return reject("انتهت صلاحية رابط الرفع. ارفع الملف من جديد.");

  const stat = await fromStorage(() => storage().stat(bucket, input.key));
  if (!stat) throw new UploadMissingError("لم يكتمل رفع الملف. حاول مرة أخرى.");
  if (stat.size <= 0) await reject("الملف فارغ");
  // الحد قبل أي قراءة: ملف أكبر من المسموح لا يُحمَّل في الذاكرة أصلًا
  if (stat.size > uploadLimitBytes(kind)) await reject(tooLargeMessage(kind, actor));
  // الحجم المعلن عند طلب الرابط هو العقد: ما وصل أكبر أو أصغر منه لا يُقبل
  if (stat.size !== Number(ticket.declared_size)) await reject("لم يصل الملف كاملًا أو وصل بحجم غير الذي أُعلن. ارفعه مرة أخرى.");
  if (input.size !== undefined && stat.size !== input.size) await reject("لم يصل الملف كاملًا. ارفعه مرة أخرى.");
  const head = await fromStorage(() => storage().readHead(bucket, input.key, 16));
  const mime = sniffMime(head);
  if (!mime || !(rules.mime as readonly string[]).includes(mime)) await reject(`محتوى الملف لا يطابق النوع المطلوب (${KIND_LABEL[kind]})`);

  const originalName = (input.originalName ?? "").slice(0, 255);

  if (isPdfTarget) {
    // القراءة والفحص والختم التجريبي وبناء المعاينة تحمل الملف كله في الذاكرة: مكان من أماكن الختم المحدودة على النسخة
    const processed = await withStampSlot(async () => {
      // تعطل التخزين ليس عيبًا في الملف: لا نحذفه، ويمكن إعادة التأكيد
      const bytes = await fromStorage(() => storage().read(bucket, input.key));
      const inspection = await inspectPdf(bytes);
      if (!inspection.ok) return { inspection, isolated: null, isolationFailed: false };
      if (input.target !== "preview") return { inspection, isolated: null, isolationFailed: false };
      try {
        return { inspection, isolated: (await rebuildCustomPreview(bytes)).bytes, isolationFailed: false };
      } catch (err) {
        // بضع صفحات لا تحتاج مهلة البناء كلها: تجاوزها يعني ملفًا لا يُعرض بأمان، كفشل العزل
        if (!(err instanceof PreviewNotIsolatedError) && !(err instanceof StampDeadlineError)) throw err;
        await reportError("upload:preview-not-isolated", err);
        return { inspection, isolated: null, isolationFailed: true };
      }
    });
    const inspection = processed.inspection;
    if (!inspection.ok) return reject(UPLOAD_REJECTION[inspection.problem]);
    const pageCount = inspection.pageCount;

    // معاينة مخصصة: تُربط بأول ملف رئيسي وتُقاس عليه، والفحص يسبق حذف المعاينة السابقة
    let sourceFileId: string | null = null;
    if (input.target === "preview") {
      const first = await firstMainFile(productId!);
      if (!first) return reject("ارفع ملف المذكرة أولًا، فالمعاينة تُقاس على عدد صفحاته.");
      const total = first.page_count;
      const allowed = maxPreviewPages(total);
      if (allowed === 0) return reject(`الملف الرئيسي أقل من ${ar(PREVIEW_POLICY.pagesPerFreePage)} صفحات، فلا تتاح له معاينة حتى لا تكشف الملف كله.`);
      if (pageCount > allowed) return reject(`المعاينة ${ar(pageCount)} صفحة، والحد لملف من ${ar(total ?? 0)} صفحة هو ${ar(allowed)}. قلّل صفحات المعاينة ثم ارفعها.`);
      sourceFileId = first.id;
    }

    // المعاينة ملف عام: تُحفظ نسختها المبنية من جديد، لا ما رُفع كما هو
    const isolated: Uint8Array | null = processed.isolated;
    if (processed.isolationFailed) return reject("تعذر تجهيز هذه المعاينة للعرض العام. صدّرها بصيغة PDF من جديد ثم ارفعها، أو استخدم التوليد التلقائي.");

    const title = input.title || stripExt(originalName) || (input.target === "main" ? "ملف المذكرة" : "معاينة مجانية");
    const saved = await sql.begin(async (tx) => {
      // قفل المنتج يمنع معاينتين معًا عند رفعين متزامنين
      await tx`select 1 from products where id = ${productId} for update`;
      // تأكيدان معًا على هاتف بطيء: الثاني ينتظر القفل ثم يجد ما سجله الأول
      const [registered] = await findRegistered(tx);
      if (registered) return { registered };
      if (isolated) {
        // بقايا محاولة سابقة لم تُسجَّل. التخزين لا يكتب فوق مفتاح موجود
        const clean = isolated;
        await storage().remove(bucket, storedKey).catch(() => {});
        await fromStorage(() => storage().put(bucket, storedKey, clean, "application/pdf"));
      }
      let replaced: { storage_key: string }[] = [];
      if (input.target === "preview") {
        // معاينة مخصصة تحل محل المعاينة التلقائية والسابقة
        replaced = await tx<{ storage_key: string }[]>`delete from product_files where product_id = ${productId} and kind = 'preview' returning storage_key`;
      }
      const [{ next }] = await tx<{ next: number }[]>`
        select coalesce(max(sort_order), -1)::int + 1 as next from product_files where product_id = ${productId} and kind = ${input.target}
      `;
      const [row] = await tx<{ id: string }[]>`
        insert into product_files (product_id, kind, title, storage_key, original_name, mime_type, size_bytes, page_count, is_auto_preview, sort_order, check_status, checked_at, source_file_id, pages_isolated)
        values (${productId}, ${input.target}, ${title}, ${storedKey}, ${originalName}, 'application/pdf', ${isolated ? isolated.length : stat.size}, ${pageCount}, false, ${next}, 'ok', now(), ${sourceFileId}, ${isolated !== null})
        returning id
      `;
      if (input.target === "main") await refreshPageCount(productId!, tx);
      return { id: row.id, replacedKeys: replaced.map((r) => r.storage_key) };
    });
    if (saved.registered) return registeredReply(saved.registered);
    const { id: fileId, replacedKeys } = saved;
    await markTicketCompleted(input.key);
    for (const k of replacedKeys) await storage().remove("private", k).catch(() => {});
    if (isolated) await storage().remove(bucket, input.key).catch(() => {});

    let previewNote = "";
    if (input.target === "main") {
      // الملف الرئيسي نجح رفعه وتسجيله. تعثر المعاينة لا يُفشل الرفع، ويقال للرافع
      const result = await regenerateAutoPreview(productId!).catch(async (err): Promise<PreviewResult | "busy"> => {
        // أماكن الختم مشغولة بملفات الطلاب الآن: ليس عيبًا في الملف ولا خطأ يُسجل
        if (err instanceof StampBusyError) return "busy";
        await reportError("upload:preview-generation", err);
        return "unreadable";
      });
      previewNote = result === "busy" ? PREVIEW_BUSY_NOTE : (PREVIEW_RESULT_NOTE[result] ?? "");
      // نسخ كل من يملك المنتج الآن تُجهز بعد الرد (القرار F23): ملف جديد أو بديل لا يُختم لكل مشترٍ عند أول فتح
      const queued = await enqueueBuyerCopies([fileId], "new_file").catch(async (err) => {
        await reportError("upload:stamp-jobs", err);
        return 0;
      });
      if (queued > 0) scheduleStampDrain({ fileIds: [fileId] }, DRAIN_BUDGET_MS.afterUpload);
    }
    await audit({ actorId: actor.userId, action: `product.file_upload`, entityType: "product", entityId: productId, metadata: { fileId, kind: input.target, title, pages: pageCount, size: stat.size } });
    return { id: fileId, message: `تم رفع «${title}» (${pageCount} صفحة)${previewNote}` };
  }

  if (input.target === "cover") {
    const [p] = await sql<{ cover_key: string | null }[]>`select cover_key from products where id = ${productId}`;
    if (!p) return reject("المنتج غير موجود");
    await sql`update products set cover_key = ${input.key} where id = ${productId}`;
    await markTicketCompleted(input.key);
    if (p.cover_key && p.cover_key !== input.key) await storage().remove("public", p.cover_key).catch(() => {});
    await audit({ actorId: actor.userId, action: "product.cover_upload", entityType: "product", entityId: productId });
    return { id: productId!, message: "تم تحديث صورة الغلاف" };
  }

  if (input.target === "logo") {
    const current = await getSettings();
    await saveSettings({ logo_key: input.key }, actor.userId);
    await markTicketCompleted(input.key);
    if (current.logo_key && current.logo_key !== input.key) await storage().remove("public", current.logo_key).catch(() => {});
    await audit({ actorId: actor.userId, action: "settings.logo_upload", entityType: "settings", entityId: "logo_key" });
    return { id: input.key, message: "تم تحديث الشعار" };
  }

  if (input.target === "teacher_photo") {
    if (actor.kind === "teacher") {
      await proposeTeacherPhoto(actor, input.key);
      await markTicketCompleted(input.key);
      return { id: ref!, message: "رُفعت الصورة وهي بانتظار موافقة الإدارة، وتبقى صورتك الحالية ظاهرة حتى ذلك الحين" };
    }
    await setTeacherPhoto(ref!, input.key, actor.userId);
    await markTicketCompleted(input.key);
    return { id: ref!, message: "تم تحديث صورة المعلم" };
  }

  if (input.target === "lesson_thumb") {
    const [l] = await sql<{ thumbnail_key: string | null }[]>`select thumbnail_key from lessons where id = ${input.lessonId!} and product_id = ${productId}`;
    if (!l) return reject("الدرس غير موجود");
    await sql`update lessons set thumbnail_key = ${input.key} where id = ${input.lessonId!}`;
    await markTicketCompleted(input.key);
    if (l.thumbnail_key && l.thumbnail_key !== input.key) await storage().remove("public", l.thumbnail_key).catch(() => {});
    await audit({ actorId: actor.userId, action: "lesson.thumbnail_upload", entityType: "product", entityId: productId, metadata: { lessonId: input.lessonId } });
    return { id: input.lessonId!, message: "تم تحديث الصورة المصغرة" };
  }

  // lesson (file provider): يصبح جاهزًا بعد التحقق من الملف وقراءة مدته
  const title = input.title || stripExt(originalName);
  if (!title || title.length < 2) return reject("عنوان الدرس مطلوب");
  const findLesson = (db: Db = sql) => db<{ id: string; title: string }[]>`select id, title from lessons where provider = 'file' and video_ref = ${input.key} and product_id = ${productId}`;
  const [dup] = await findLesson();
  if (dup) return { id: dup.id, message: `تمت إضافة الدرس «${dup.title}»` };
  const duration = await probeStoredMp4Duration(input.key, stat.size);
  const created = await sql.begin(async (tx) => {
    await tx`select 1 from products where id = ${productId} for update`;
    const [existing] = await findLesson(tx);
    if (existing) return { existing };
    const order = await nextLessonOrder(productId!, tx);
    const [row] = await tx<{ id: string }[]>`
      insert into lessons (product_id, unit_title, title, description, provider, video_ref, mime_type, size_bytes, duration_seconds,
        is_free_preview, sort_order, processing_status, uploaded_by)
      values (${productId}, ${input.unitTitle ?? ""}, ${title}, ${input.description ?? ""}, 'file', ${input.key}, ${mime}, ${stat.size},
              ${duration}, ${input.isFreePreview ?? false}, ${order}, 'ready', ${actor.userId})
      returning id
    `;
    return { lesson: row };
  });
  await markTicketCompleted(input.key);
  if (created.existing) return { id: created.existing.id, message: `تمت إضافة الدرس «${created.existing.title}»` };
  const { lesson } = created;
  await audit({ actorId: actor.userId, action: "lesson.create", entityType: "product", entityId: productId, metadata: { lessonId: lesson.id, title, provider: "file", duration } });
  return { id: lesson.id, message: `تمت إضافة الدرس «${title}»` };
}

/** التذكرة استُعملت: التنظيف اليومي لا يلمس كائنها */
async function markTicketCompleted(key: string) {
  await sql`update upload_tickets set completed_at = coalesce(completed_at, now()) where storage_key = ${key}`;
}

export type UploadSweep = { removed: number; forgotten: number };

/**
 * التنظيف اليومي (K053 و K035): كائن صدر له رابط رفع ولم يُؤكد خلال UPLOAD_TICKET_HOURS يُحذف من التخزين،
 * إلا إن كان مستعملًا فعلًا (تأكيد تعثر بعد التسجيل). والتذاكر المؤكدة تُنسى بعد شهر. دفعات محدودة بوقت.
 */
export async function sweepUploadTickets(opts: { batch: number; deadline: number }): Promise<UploadSweep & { finished: boolean }> {
  let removed = 0;
  let finished = true;
  for (;;) {
    if (Date.now() > opts.deadline) {
      finished = false;
      break;
    }
    const stale = await sql<{ storage_key: string; bucket: "private" | "public" }[]>`
      select storage_key, bucket from upload_tickets
      where completed_at is null and created_at < now() - make_interval(hours => ${UPLOAD_TICKET_HOURS})
      order by created_at limit ${opts.batch}
    `;
    if (stale.length === 0) break;
    for (const t of stale) {
      if (Date.now() > opts.deadline) {
        finished = false;
        break;
      }
      if (!(await storageKeyInUse(t.storage_key))) {
        await storage().removeMany(t.bucket, [t.storage_key]);
        removed++;
      }
      await sql`delete from upload_tickets where storage_key = ${t.storage_key} and completed_at is null`;
    }
    if (!finished || stale.length < opts.batch) break;
  }
  const forgotten = (await sql`
    with batch as materialized (
      select storage_key from upload_tickets where completed_at is not null and completed_at < now() - interval '30 days'
      limit ${opts.batch} for update skip locked
    )
    delete from upload_tickets t using batch where t.storage_key = batch.storage_key
  `).count;
  return { removed, forgotten, finished };
}
