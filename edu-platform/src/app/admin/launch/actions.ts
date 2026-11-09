"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { isManualKey } from "@/lib/launch";
import { AdminError, adminAction, str } from "@/server/admin/common";
import { setLaunchCheck } from "@/server/platform/launch";

/** تأشير خطوة إطلاق يدوية أو إعادة فتحها. للمالك فقط، والمفتاح من قائمة ثابتة في الكود */
export async function setLaunchCheckAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const key = str(fd, "key");
    const done = str(fd, "done");
    if (!isManualKey(key) || (done !== "1" && done !== "0")) throw new AdminError("طلب غير صالح");
    const result = await setLaunchCheck({ key, done: done === "1", actorId: adminId, ip });
    revalidatePath("/admin/launch");
    if (result === "unchanged") return { ok: true, message: done === "1" ? "الخطوة مؤشَّر عليها مسبقًا" : "الخطوة مفتوحة مسبقًا" };
    return { ok: true, message: done === "1" ? "سُجّل إنجاز الخطوة باسمك" : "أُعيد فتح الخطوة" };
  });
}
