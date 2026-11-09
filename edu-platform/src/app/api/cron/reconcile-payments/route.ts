import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/server/platform/cron-auth";
import { runPaymentReconciliation } from "@/server/payments/reconcile";

/**
 * وظيفة التسوية الدورية، مُعلنة في vercel.json كل ١٥ دقيقة (*\/15 * * * *، توقيت UTC دائمًا).
 *
 * شروط Vercel: خطة Pro فأعلى تسمح بجدول حتى كل دقيقة، أما Hobby فتسمح بمرة يوميًا فقط ويفشل نشر المشروع كله بهذا الجدول.
 * خطة الحساب تُحسم قبل دمج هذا الجدول، والبديل اليومي وأثره في «وظيفة التسوية الدورية» في README.
 * Vercel يستدعي نشر الإنتاج فقط وبطريقة GET.
 *
 * نمط الفشل: Vercel لا يعيد المحاولة عند فشل الاستدعاء، والتسليم غير مضمون فقد يفوت أو يتكرر أو يتداخل.
 * هذا مقبول هنا: Webhook والعودة من صفحة الدفع هما المسار الأول، والوظيفة شبكة أمان متكررة وآمنة للتكرار،
 * فالجولة التالية تكمل ما فات، ولا يُغلق طلب ما لم تُفحص كل فواتيره.
 * الرد 502 يعني أن البوابة لم تجب عن أي فاتورة. ويظهر في سجلات Vercel Cron.
 *
 * CRON_SECRET يُضبط في بيئة Production قبل النشر، وأي تغيير له يحتاج إعادة نشر. بدونه يرد المسار 401 دائمًا.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isCronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const report = await runPaymentReconciliation();
    return NextResponse.json(report, { status: report.errors > 0 && report.checked === 0 ? 502 : 200 });
  } catch (err) {
    console.error("[cron/reconcile-payments] failed", err);
    return NextResponse.json({ error: "reconcile failed" }, { status: 500 });
  }
}
