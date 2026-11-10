"use server";

import { revalidatePath } from "@/server/platform/revalidate";
import type { ActionState } from "@/lib/action-state";
import { AdminError, adminAction, isUuid, str } from "@/server/admin/common";
import { recheckFile, regenerateBadPreviews, scanUncheckedFiles } from "@/server/admin/content-health";
import { FILE_PROBLEM_LABELS } from "@/server/access/file-check";
import { ar } from "@/lib/design";

function refresh() {
  revalidatePath("/admin/content-health");
  revalidatePath("/admin");
  revalidatePath("/", "layout");
}

export async function scanFilesAction(_prev: ActionState, _fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const r = await scanUncheckedFiles(adminId, ip);
    refresh();
    const parts = [`فُحص ${ar(r.checked)} ملف`];
    if (r.flagged) parts.push(`منها ${ar(r.flagged)} معيب`);
    if (r.errors) parts.push(`وتعذرت قراءة ${ar(r.errors)} الآن`);
    if (r.remaining) parts.push(`وبقي ${ar(r.remaining)}، اضغط مرة أخرى للمتابعة`);
    return { ok: true, partial: r.remaining > 0 || r.errors > 0, message: parts.join("، ") };
  });
}

/** عطل عابر في التخزين قد يعلّم ملفًا سليمًا: إعادة فحصه تعطي حكمًا حقيقيًا */
export async function recheckFileAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const fileId = str(fd, "fileId");
    if (!isUuid(fileId)) throw new AdminError("طلب غير صالح");
    const r = await recheckFile(fileId, adminId, ip);
    if (r.outcome === "storage_error") throw new AdminError("تعذر الوصول إلى التخزين الآن، فبقيت علامة العيب كما هي. حاول بعد قليل.");
    const productId = str(fd, "productId");
    if (isUuid(productId)) revalidatePath(`/admin/products/${productId}`);
    refresh();
    return r.outcome === "cleared" ? { ok: true, message: "فُحص الملف وهو سليم، وأُزيلت علامة العيب" } : { ok: true, partial: true, message: `فُحص الملف وما زال معيبًا: ${FILE_PROBLEM_LABELS[r.problem]}` };
  });
}

export async function regeneratePreviewsAction(_prev: ActionState, _fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const r = await regenerateBadPreviews(adminId, ip);
    refresh();
    const parts = [`أُعيد توليد ${ar(r.generated)} معاينة`];
    if (r.tooShort) parts.push(`وحُذفت ${ar(r.tooShort)} لأن ملفاتها أقصر من أن تكون لها معاينة`);
    if (r.none) parts.push(`وحُذفت ${ar(r.none)} لأن منتجاتها بلا ملف رئيسي أو ضُبطت على عدم عرض معاينة`);
    if (r.failed) parts.push(`وتعذر إصلاح ${ar(r.failed)}، افتح منتجاتها للتأكد من ملفها الرئيسي`);
    if (r.remaining) parts.push(`والمتبقي ${ar(r.remaining)}`);
    return { ok: true, partial: r.remaining > 0 || r.failed > 0, message: parts.join("، ") };
  });
}
