"use server";

import { revalidatePath } from "@/server/platform/revalidate";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { fieldErrors } from "@/lib/validation";
import { PermissionError } from "@/server/auth/permissions";
import { AdminError, staffAction, str } from "@/server/admin/common";
import { proposeTeacherPhoto, proposeTeacherText } from "@/server/admin/teacher-profile-review";

const schema = z.object({
  headline: z.string().trim().max(140, "العنوان التعريفي طويل جدًا"),
  bio: z.string().trim().max(3000, "النبذة طويلة جدًا"),
});

/** المعلم يقترح العنوان التعريفي والنبذة فقط — لا الاسم ولا الرابط ولا النسبة ولا الصلاحيات. لا يصل شيء للصفحة العامة قبل موافقة المالك */
export async function updateOwnProfileAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor }) => {
    if (actor.kind !== "teacher") throw new PermissionError("هذه الصفحة لحسابات المعلمين");
    const parsed = schema.safeParse({ headline: str(fd, "headline"), bio: str(fd, "bio") });
    if (!parsed.success) throw new AdminError("راجع الحقول", fieldErrors(parsed.error));
    const waiting = await proposeTeacherText(actor, parsed.data);
    revalidatePath("/admin/profile");
    revalidatePath("/admin/review");
    return { ok: true, message: waiting ? "أُرسل تعديلك للمراجعة، وتبقى صفحتك العامة كما هي حتى الموافقة" : "لا يوجد تعديل جديد للإرسال" };
  });
}

export async function removeOwnPhotoAction(_prev: ActionState): Promise<ActionState> {
  return staffAction(async ({ actor }) => {
    if (actor.kind !== "teacher") throw new PermissionError("هذه الصفحة لحسابات المعلمين");
    const result = await proposeTeacherPhoto(actor, null);
    revalidatePath("/admin/profile");
    revalidatePath("/admin/review");
    return { ok: true, message: result === "remove" ? "طلب إزالة الصورة بانتظار موافقة الإدارة" : "أُلغيت الصورة التي كانت بانتظار الموافقة" };
  });
}
