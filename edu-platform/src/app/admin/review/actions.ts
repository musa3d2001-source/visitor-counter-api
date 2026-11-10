"use server";

import { revalidatePath } from "@/server/platform/revalidate";
import type { ActionState } from "@/lib/action-state";
import { AdminError, adminAction, isUuid, str } from "@/server/admin/common";
import { approveProfileChange, rejectProfileChange } from "@/server/admin/teacher-profile-review";

export async function approveProfileChangeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const id = str(fd, "id");
    if (!isUuid(id)) throw new AdminError("طلب غير صالح");
    const teacherId = await approveProfileChange(id, adminId, ip);
    revalidatePath("/admin/review");
    revalidatePath(`/admin/teachers/${teacherId}`);
    revalidatePath("/", "layout");
    return { ok: true, message: "تم اعتماد التعديل وظهر للطلاب" };
  });
}

export async function rejectProfileChangeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const id = str(fd, "id");
    if (!isUuid(id)) throw new AdminError("طلب غير صالح");
    await rejectProfileChange(id, str(fd, "reason"), adminId, ip);
    revalidatePath("/admin/review");
    return { ok: true, message: "رُفض التعديل وأُرسلت ملاحظتك إلى صفحة المعلم" };
  });
}
