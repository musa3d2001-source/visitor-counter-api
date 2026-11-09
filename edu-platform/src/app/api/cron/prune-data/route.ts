import { runDataPruning } from "@/server/platform/maintenance";
import { serveCron } from "@/server/platform/scheduled-jobs";

/** تنظيف يومي: حدود المحاولات، الجلسات المنتهية، سجلات الوصول القديمة وسجل الأخطاء القديم. الجدول والشرح في README */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  return serveCron(req, "prune-data", runDataPruning);
}
