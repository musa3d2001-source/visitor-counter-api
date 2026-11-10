"use server";

import { revalidatePath } from "@/server/platform/revalidate";
import type { ActionState } from "@/lib/action-state";
import { AdminError, bool, staffAction } from "@/server/admin/common";
import { acceptTeacherAgreement } from "@/server/admin/teacher-agreement";
import { requestConsentMeta } from "@/server/platform/consent";

export async function acceptAgreementAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return staffAction(async ({ actor, ip }) => {
    if (!bool(fd, "accept")) throw new AdminError("أشّر خانة الموافقة أولًا");
    await acceptTeacherAgreement(actor, await requestConsentMeta(), ip);
    revalidatePath("/admin/agreement");
    revalidatePath("/admin");
    return { ok: true, message: "تم تسجيل قبولك للاتفاقية" };
  });
}
