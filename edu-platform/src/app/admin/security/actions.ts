"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { STEP_UP_FIELD, TWO_FACTOR_SETUP_PATH } from "@/lib/two-factor";
import { AdminError, adminAction } from "@/server/admin/common";
import { adminTwoFactorRequired } from "@/server/env";
import { getCurrentSession } from "@/server/auth/session";
import { disableTwoFactor, regenerateRecoveryCodes } from "@/server/auth/two-factor";

/** رموز استرداد جديدة بعد رمز صحيح. تعاد في حالة النموذج فقط، وإعادة رسم الصفحة قبل قراءتها تضيعها */
export async function regenerateRecoveryCodesAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const res = await regenerateRecoveryCodes({ userId: adminId, code: fd.get(STEP_UP_FIELD), ip });
    if (!res.ok) throw new AdminError(res.error);
    return { ok: true, message: "صدرت رموز جديدة وبطلت القديمة كلها", secrets: { recoveryCodes: res.recoveryCodes.join("\n") } };
  });
}

/** إيقاف التحقق بخطوتين. إن كان إلزاميًا يعود صاحب الحساب إلى التسجيل فورًا، وهذا طريق تغيير الجوال */
export async function disableTwoFactorAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const session = await getCurrentSession();
    if (!session) throw new AdminError("انتهت الجلسة، سجّل الدخول مرة أخرى");
    const res = await disableTwoFactor({ userId: adminId, sessionId: session.sessionId, code: fd.get(STEP_UP_FIELD), ip });
    if (!res.ok) throw new AdminError(res.error);
    if (adminTwoFactorRequired()) redirect(TWO_FACTOR_SETUP_PATH);
    revalidatePath("/admin/security");
    return { ok: true, message: "أُوقف التحقق بخطوتين وأُنهيت الجلسات الأخرى" };
  });
}
