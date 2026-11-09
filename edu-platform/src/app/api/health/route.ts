import { after, NextResponse } from "next/server";
import { isSiteUp } from "@/server/platform/health";
import { runOpsWatchdog } from "@/server/platform/scheduled-jobs";

/**
 * فحص عام لأي خدمة مراقبة خارجية: يقول يعمل أو لا يعمل، ولا شيء غيره.
 * لا إصدارات ولا مفاتيح ولا أعداد. 200 مع up و503 مع down.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const up = await isSiteUp();
  // حدود الرسائل وحدود التكرار داخل الفحص نفسه، فكثرة الطلبات هنا لا تصنع رسائل
  if (up) {
    try {
      after(() => runOpsWatchdog());
    } catch {
      await runOpsWatchdog();
    }
  }
  return NextResponse.json({ status: up ? "up" : "down" }, { status: up ? 200 : 503, headers: { "cache-control": "no-store" } });
}
