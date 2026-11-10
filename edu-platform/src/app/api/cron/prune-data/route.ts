import { runDataPruning } from "@/server/platform/maintenance";
import { serveCron } from "@/server/platform/scheduled-jobs";
import { withBusyGuard } from "@/server/busy-response";

/** تنظيف يومي: حدود المحاولات، الجلسات المنتهية، سجلات الوصول القديمة وسجل الأخطاء القديم. الجدول والشرح في README */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handleGET(req: Request) {
  return serveCron(req, "prune-data", runDataPruning);
}

/** انشغال قاعدة البيانات: 503 مع Retry-After بدل خطأ أو تعليق */
export const GET = withBusyGuard(handleGET);
