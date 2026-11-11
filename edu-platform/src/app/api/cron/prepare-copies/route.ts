import { drainStampJobs } from "@/server/access/stamp-jobs";
import { DRAIN_BUDGET_MS } from "@/server/access/stamp-queue";
import { serveCron } from "@/server/platform/scheduled-jobs";
import { withBusyGuard } from "@/server/busy-response";

/**
 * تجهيز النسخ المختومة التي بقيت في الطابور (القرار F23): ما لم يكمله التفريغ بعد الشراء أو بعد رفع ملف أو زر المالك.
 * ميزانية العمل DRAIN_BUDGET_MS.daily داخل maxDuration، والباقي في الجولة التالية. الجدول والشرح في README.
 * maxDuration 300: الحد الأعلى على Hobby مع Fluid compute (https://vercel.com/docs/functions/configuring-functions/duration).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handleGET(req: Request) {
  return serveCron(req, "prepare-copies", () => drainStampJobs({ budgetMs: DRAIN_BUDGET_MS.daily }));
}

/** انشغال قاعدة البيانات: 503 مع Retry-After بدل خطأ أو تعليق */
export const GET = withBusyGuard(handleGET);
