"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { count } from "@/lib/design";
import { AdminError, bool, isUuid, staffAction, str } from "@/server/admin/common";
import { PermissionError, type Actor } from "@/server/auth/permissions";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { CSV_MAX_BYTES, decodeCsvBytes } from "@/server/questions/csv";
import {
  applyTocImport,
  createTextbook,
  deleteLesson,
  deleteUnit,
  previewTocImport,
  saveLesson,
  saveUnit,
  updateTextbook,
  type TocPreview,
} from "@/server/questions/curriculum";
import type { TocActionState, TocSummaryLabels } from "./_components/toc-types";
import { LESSON, ROW, UNIT } from "./_components/words";

/**
 * إجراءات إدارة المنهج: للمالك وحده (فحص صريح هنا، والدوال في الخادم تفحص مرة أخرى).
 */

function ensureOwner(actor: Actor) {
  if (actor.kind !== "owner") throw new PermissionError("إدارة المنهج متاحة لإدارة المنصة فقط");
}

function revalidateCurriculum(textbookId?: string) {
  revalidatePath("/admin/curriculum");
  if (textbookId) revalidatePath(`/admin/curriculum/${textbookId}`);
}

function isUniqueViolation(err: unknown) {
  return (err as { code?: string } | null)?.code === "23505";
}

/** الأرقام العربية (٠-٩) والفارسية (۰-۹) إلى لاتينية، لأن لوحة المفاتيح العربية تكتبها هكذا */
function digits(fd: FormData, key: string): string {
  return str(fd, key)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

// ---------------------------------------------------------------- الكتب
export async function createTextbookAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let createdId: string | null = null;
  const res = await staffAction(async ({ actor, ip }) => {
    ensureOwner(actor);
    let id: string;
    try {
      id = await createTextbook(
        {
          subjectId: str(fd, "subjectId"),
          term: str(fd, "term"),
          title: str(fd, "title"),
          edition: str(fd, "edition"),
          isCurrent: bool(fd, "isCurrent"),
          rightsConfirmed: bool(fd, "rightsConfirmed"),
        },
        actor,
        ip,
      );
    } catch (err) {
      // رسالة المعرّف العامة («طلب غير صالح») لا تناسب قائمة لم يُختر منها شيء
      if (err instanceof AdminError && err.fieldErrors?.subjectId) throw new AdminError(err.userMessage, { ...err.fieldErrors, subjectId: "اختر المادة" });
      throw err;
    }
    revalidateCurriculum(id);
    createdId = id;
    return { ok: true, message: "تمت إضافة الكتاب" };
  });
  if (createdId) redirect(`/admin/curriculum/${createdId}?created=1`);
  return res;
}

export async function updateTextbookAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor, ip }) => {
    ensureOwner(actor);
    const id = str(fd, "id");
    if (!isUuid(id)) throw new AdminError("طلب غير صالح");
    await updateTextbook(
      id,
      { title: str(fd, "title"), edition: str(fd, "edition"), isCurrent: bool(fd, "isCurrent"), rightsConfirmed: bool(fd, "rightsConfirmed") },
      actor,
      ip,
    );
    revalidateCurriculum(id);
    return { ok: true, message: "تم حفظ بيانات الكتاب" };
  });
}

// ---------------------------------------------------------------- الوحدات
export async function saveUnitAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor, ip }) => {
    ensureOwner(actor);
    const textbookId = str(fd, "textbookId");
    const id = str(fd, "id");
    if (!isUuid(textbookId) || (id && !isUuid(id))) throw new AdminError("طلب غير صالح");
    try {
      await saveUnit({ textbookId, number: digits(fd, "number"), title: str(fd, "title"), id: id || undefined }, actor, ip);
    } catch (err) {
      if (isUniqueViolation(err)) throw new AdminError("رقم الوحدة مستخدم في هذا الكتاب", { number: "اختر رقمًا آخر للوحدة" });
      throw err;
    }
    revalidateCurriculum(textbookId);
    return { ok: true, message: id ? "تم حفظ الوحدة" : "تمت إضافة الوحدة" };
  });
}

export async function deleteUnitAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor, ip }) => {
    ensureOwner(actor);
    const id = str(fd, "id");
    const textbookId = str(fd, "textbookId");
    if (!isUuid(id) || !isUuid(textbookId)) throw new AdminError("طلب غير صالح");
    await deleteUnit(id, actor, ip);
    revalidateCurriculum(textbookId);
    return { ok: true, message: "تم حذف الوحدة" };
  });
}

// ---------------------------------------------------------------- الدروس
export async function saveLessonAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor, ip }) => {
    ensureOwner(actor);
    const textbookId = str(fd, "textbookId");
    const unitId = str(fd, "unitId");
    const id = str(fd, "id");
    if (!isUuid(textbookId) || !isUuid(unitId) || (id && !isUuid(id))) throw new AdminError("طلب غير صالح");
    try {
      await saveLesson(
        { unitId, number: digits(fd, "number"), title: str(fd, "title"), pageStart: digits(fd, "pageStart"), pageEnd: digits(fd, "pageEnd"), id: id || undefined },
        actor,
        ip,
      );
    } catch (err) {
      if (isUniqueViolation(err)) throw new AdminError("رقم الدرس مستخدم في هذه الوحدة", { number: "اختر رقمًا آخر للدرس" });
      throw err;
    }
    revalidateCurriculum(textbookId);
    return { ok: true, message: id ? "تم حفظ الدرس" : "تمت إضافة الدرس" };
  });
}

export async function deleteLessonAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor, ip }) => {
    ensureOwner(actor);
    const id = str(fd, "id");
    const textbookId = str(fd, "textbookId");
    if (!isUuid(id) || !isUuid(textbookId)) throw new AdminError("طلب غير صالح");
    await deleteLesson(id, actor, ip);
    revalidateCurriculum(textbookId);
    return { ok: true, message: "تم حذف الدرس" };
  });
}

// ---------------------------------------------------------------- استيراد فهرس الكتاب
const TOO_BIG = "حجم الملف أكبر من الحد المسموح (١ م.ب). قسّمه إلى ملفين.";

/** نص CSV من الملف المرفوع (UTF-8 فقط) أو من الحقل الملصق */
async function readCsvInput(fd: FormData): Promise<string> {
  const file = fd.get("file");
  if (file instanceof Blob && file.size > 0) {
    if (file.size > CSV_MAX_BYTES) throw new AdminError(TOO_BIG);
    const decoded = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
    if ("error" in decoded) throw new AdminError(decoded.error);
    return decoded.text;
  }
  const raw = fd.get("csv");
  const text = typeof raw === "string" ? raw : "";
  if (!text.trim()) throw new AdminError("الصق محتوى الفهرس أو اختر ملف CSV", { csv: "الحقل فارغ" });
  if (new TextEncoder().encode(text).byteLength > CSV_MAX_BYTES) throw new AdminError(TOO_BIG);
  return text;
}

/** عبارات ملخص التشغيل التجريبي بالعدّ العربي الصحيح */
function summaryLabels(p: TocPreview): TocSummaryLabels {
  const s = p.summary;
  const same = p.rows.filter((r) => !r.errors.length && r.action === "same").length;
  return {
    units: count(s.units, { ...UNIT, none: "بلا وحدات صالحة" }),
    create: count(s.lessonsCreate, { ...LESSON, none: "لا شيء" }),
    update: count(s.lessonsUpdate, { ...LESSON, none: "لا شيء" }),
    same: count(same, { ...LESSON, none: "لا شيء" }),
    errors: s.errors ? count(s.errors, ROW) : null,
  };
}

/** تشغيل تجريبي: لا يكتب شيئًا، ويعيد نتيجة كل صف لعرضها */
export async function previewTocAction(_prev: TocActionState, fd: FormData): Promise<TocActionState> {
  let preview: TocPreview | undefined;
  const res = await staffAction(async ({ actor }) => {
    ensureOwner(actor);
    const textbookId = str(fd, "textbookId");
    if (!isUuid(textbookId)) throw new AdminError("طلب غير صالح");
    preview = await previewTocImport(textbookId, await readCsvInput(fd));
    if (preview.fileError) return { error: preview.fileError };
    return { ok: true, message: preview.summary.errors ? "انتهى التشغيل التجريبي، وفي الملف أخطاء" : "انتهى التشغيل التجريبي بلا أخطاء" };
  });
  return res ? { ...res, preview, labels: preview ? summaryLabels(preview) : undefined, mode: "preview" } : res;
}

/** التطبيق: يرفض الملف كله عند أي خطأ، وإلا ينشئ ويحدّث في معاملة واحدة */
export async function applyTocAction(_prev: TocActionState, fd: FormData): Promise<TocActionState> {
  let preview: TocPreview | undefined;
  const res = await staffAction(async ({ actor, ip }) => {
    ensureOwner(actor);
    const textbookId = str(fd, "textbookId");
    if (!isUuid(textbookId)) throw new AdminError("طلب غير صالح");
    const text = await readCsvInput(fd);
    const limit = await hitRateLimit(`toc-import:${actor.userId}`, 10, 3600);
    if (!limit.allowed) return { error: "محاولات كثيرة. حاول بعد ساعة." };
    try {
      const s = await applyTocImport(textbookId, text, actor, ip);
      revalidateCurriculum(textbookId);
      const parts = [s.lessonsCreate ? `أُضيف ${count(s.lessonsCreate, LESSON)}` : "", s.lessonsUpdate ? `حُدّث ${count(s.lessonsUpdate, LESSON)}` : ""].filter(Boolean);
      return {
        ok: true,
        message: parts.length ? `تم الاستيراد: ${parts.join("، ")}` : "لا تغييرات: الفهرس مطابق لما في الكتاب",
      };
    } catch (err) {
      // أخطاء الصفوف: نعرض نتيجة التشغيل التجريبي مع رسالة الرفض حتى يعرف المالك ما يصحح
      if (err instanceof AdminError) {
        const p = await previewTocImport(textbookId, text);
        if (p.rows.length) preview = p;
      }
      throw err;
    }
  });
  return res ? { ...res, preview, labels: preview ? summaryLabels(preview) : undefined, mode: "apply" } : res;
}
