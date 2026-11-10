"use server";

import { revalidatePath } from "@/server/platform/revalidate";
import type { ActionState } from "@/lib/action-state";
import { AdminError, adminAction } from "@/server/admin/common";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { audit } from "@/server/platform/audit";
import { sendTestOpsAlert, type TestAlertResult } from "@/server/platform/ops-alerts";
import { reconcileNow } from "@/server/payments/unhealed";
import { count, type CountWord } from "@/lib/design";

/** حد رسائل التجربة لكل مالك في الساعة: تكفي للتجربة بعد تعديل SMTP، ولا تستنزف حصة البريد */
const TEST_ALERTS_PER_HOUR = 5;

const OUTCOME: Record<TestAlertResult, ActionState> = {
  sent: { ok: true, message: "قبل خادم البريد رسالة التجربة. افتح بريدك وتأكد أنها وصلت، وابحث في الرسائل غير المرغوبة إن لم تجدها." },
  logged: { ok: true, partial: true, message: "سُجلت الرسالة ولم تخرج إلى أحد، لأن البريد في وضع السجل الداخلي. فعّل SMTP ثم جرّب مرة أخرى." },
  failed: { error: "لم تخرج رسالة التجربة: رفضها خادم البريد أو لم يرد. السبب في صفحة «البريد الصادر»، فراجع إعدادات SMTP في Vercel." },
  no_address: { error: "OPS_ALERT_EMAIL غير مضبوط، فلا يوجد بريد نرسل إليه. أضفه في Vercel ثم أعد النشر." },
};

/** عشر ضغطات في عشر دقائق تزيد على حاجة أي مالك، والجولة الواحدة قد تستهلك حصة نداءات البوابة */
const RECONCILE_RUNS_PER_WINDOW = 10;
const INVOICE: CountWord = { one: "فاتورة", two: "فاتورتان", plural: "فواتير", acc: "فاتورة", oneSuffix: "واحدة" };

/** زر «افحص الآن». للمالك فقط ومسجل في التدقيق، وضغطه مرتين لا يمنح شيئًا مرتين */
export async function reconcileNowAction(_prev: ActionState, _fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    const limit = await hitRateLimit(`ops_reconcile:${adminId}`, RECONCILE_RUNS_PER_WINDOW, 10 * 60);
    if (!limit.allowed) throw new AdminError("ضغطت الزر كثيرًا. انتظر عشر دقائق ثم حاول مرة أخرى.");
    const out = await reconcileNow({ adminId, ip });
    revalidatePath("/admin/ops");
    revalidatePath("/admin/orders");
    if (out.state === "overlapped") return { ok: true, partial: true, message: "جولة فحص تعمل الآن، فلم نبدأ جولة ثانية. حدّث الصفحة بعد دقيقة." };
    if (out.state === "failed") return { error: "تعذر الوصول إلى بوابة الدفع، فلم يكتمل الفحص ولم يتغير شيء بسببه. حاول بعد دقائق." };
    const { checked, paid, stoppedEarly } = out.report;
    if (checked === 0 && !stoppedEarly) return { ok: true, message: "لا توجد فاتورة تحتاج إلى فحص الآن." };
    const summary = `فحصنا ${count(checked, INVOICE)}، وتأكد الدفع في ${paid === 0 ? "لا شيء منها" : count(paid, INVOICE)}.`;
    return stoppedEarly ? { ok: true, partial: true, message: `${summary} انتهى الوقت قبل إكمال الباقي، فاضغط مرة أخرى.` } : { ok: true, message: summary };
  });
}

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
