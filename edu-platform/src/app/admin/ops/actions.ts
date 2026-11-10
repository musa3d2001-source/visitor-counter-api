"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { AdminError, adminAction } from "@/server/admin/common";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { audit } from "@/server/platform/audit";
import { sendTestOpsAlert, type TestAlertResult } from "@/server/platform/ops-alerts";

/** حد رسائل التجربة لكل مالك في الساعة: تكفي للتجربة بعد تعديل SMTP، ولا تستنزف حصة البريد */
const TEST_ALERTS_PER_HOUR = 5;

const OUTCOME: Record<TestAlertResult, ActionState> = {
  sent: { ok: true, message: "قبل خادم البريد رسالة التجربة. افتح بريدك وتأكد أنها وصلت، وابحث في الرسائل غير المرغوبة إن لم تجدها." },
  logged: { ok: true, partial: true, message: "سُجلت الرسالة ولم تخرج إلى أحد، لأن البريد في وضع السجل الداخلي. فعّل SMTP ثم جرّب مرة أخرى." },
  failed: { error: "لم تخرج رسالة التجربة: رفضها خادم البريد أو لم يرد. السبب في صفحة «البريد الصادر»، فراجع إعدادات SMTP في Vercel." },
  no_address: { error: "OPS_ALERT_EMAIL غير مضبوط، فلا يوجد بريد نرسل إليه. أضفه في Vercel ثم أعد النشر." },
};

/** رسالة تجربة إلى بريد التنبيهات. للمالك فقط، ولا تأخذ أي مدخل: العنوان من بيئة الخادم */
export async function sendTestAlertAction(_prev: ActionState, _fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const limit = await hitRateLimit(`ops_test_alert:${adminId}`, TEST_ALERTS_PER_HOUR, 60 * 60);
    if (!limit.allowed) throw new AdminError("أرسلت رسائل تجربة كثيرة. حاول بعد ساعة.");
    const result = await sendTestOpsAlert();
    await audit({ actorId: adminId, action: "ops.test_alert", entityType: "ops_alert", entityId: "test", metadata: { result }, ip });
    revalidatePath("/admin/ops");
    revalidatePath("/admin/launch");
    return OUTCOME[result];
  });
}
