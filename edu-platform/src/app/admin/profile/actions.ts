"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { fieldErrors } from "@/lib/validation";
import { PermissionError } from "@/server/auth/permissions";
import { AdminError, staffAction, str } from "@/server/admin/common";
import { setTeacherPhoto, updateOwnTeacherProfile } from "@/server/admin/teachers";

const schema = z.object({
  headline: z.string().trim().max(140, "العنوان التعريفي طويل جدًا"),
  bio: z.string().trim().max(3000, "النبذة طويلة جدًا"),
});

/** المعلم يعدّل العنوان التعريفي والنبذة فقط — لا الاسم ولا الرابط ولا النسبة ولا الصلاحيات */
export async function updateOwnProfileAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor }) => {
    if (actor.kind !== "teacher") throw new PermissionError("هذه الصفحة لحسابات المعلمين");
    const parsed = schema.safeParse({ headline: str(fd, "headline"), bio: str(fd, "bio") });
    if (!parsed.success) throw new AdminError("راجع الحقول", fieldErrors(parsed.error));
    await updateOwnTeacherProfile(actor.teacherId, actor.userId, parsed.data);
    revalidatePath("/admin/profile");
    return { ok: true, message: "تم حفظ ملفك التعريفي" };
  });
}

export async function removeOwnPhotoAction(_prev: ActionState): Promise<ActionState> {
  return staffAction(async ({ actor }) => {
    if (actor.kind !== "teacher") throw new PermissionError("هذه الصفحة لحسابات المعلمين");
    await setTeacherPhoto(actor.teacherId, null, actor.userId);
    revalidatePath("/admin/profile");
    return { ok: true, message: "تمت إزالة الصورة" };
  });
}
