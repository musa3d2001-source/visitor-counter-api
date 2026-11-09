"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { adminAction } from "@/server/admin/common";
import { regenerateBadPreviews, scanUncheckedFiles } from "@/server/admin/content-health";
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

export async function regeneratePreviewsAction(_prev: ActionState, _fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const r = await regenerateBadPreviews(adminId, ip);
    refresh();
    const parts = [`أُعيد توليد ${ar(r.generated)} معاينة`];
    if (r.removed) parts.push(`وحُذفت ${ar(r.removed)} لأن ملفاتها أقصر من أن تكون لها معاينة`);
    if (r.failed) parts.push(`وتعذر إصلاح ${ar(r.failed)}`);
    if (r.remaining) parts.push(`والمتبقي ${ar(r.remaining)}`);
    return { ok: true, partial: r.remaining > 0 || r.failed > 0, message: parts.join("، ") };
  });
}
