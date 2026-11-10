import { runPaymentReconciliation } from "@/server/payments/reconcile";
import { serveCron } from "@/server/platform/scheduled-jobs";
import { withBusyGuard } from "@/server/busy-response";

/**
 * وظيفة التسوية: مرة يوميًا في vercel.json لأن Hobby لا يقبل أكثر، ويفشل نشر المشروع كله بأي جدول أكثر تكرارًا.
 * قبل الدفع الحقيقي، وبعد الترقية إلى Pro، يتغير جدولها إلى كل ١٥ دقيقة بسطر واحد موثق في README.
 *
 * نمط الفشل: Webhook والعودة من صفحة الدفع هما المسار الأول، والوظيفة شبكة أمان آمنة للتكرار، ولا يُغلق طلب ما لم تُفحص كل فواتيره.
 * الرد 502 يعني أن البوابة لم تجب عن أي فاتورة، ويُسجل فشلًا في نبض الوظيفة.
 * CRON_SECRET يُضبط في بيئة Production قبل النشر، وأي تغيير له يحتاج إعادة نشر. بدونه يرد المسار 401 دائمًا.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handleGET(req: Request) {
  return serveCron(req, "reconcile-payments", runPaymentReconciliation, (report) => (report.errors > 0 && report.checked === 0 ? "لم تجب بوابة الدفع عن أي فاتورة" : null));
}

/** انشغال قاعدة البيانات: 503 مع Retry-After بدل خطأ أو تعليق */
export const GET = withBusyGuard(handleGET);
