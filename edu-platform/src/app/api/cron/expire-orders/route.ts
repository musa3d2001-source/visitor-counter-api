import { closeExpiredOrders } from "@/server/payments/reconcile";
import { serveCron } from "@/server/platform/scheduled-jobs";
import { withBusyGuard } from "@/server/busy-response";

/** إغلاق الطلبات المنتهية. لا يعتمد على رد البوابة، فيعمل حتى لو تعطلت وظيفة التسوية. الجدول والشرح في README */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handleGET(req: Request) {
  return serveCron(req, "expire-orders", () => closeExpiredOrders({ rounds: 8 }));
}

/** انشغال قاعدة البيانات: 503 مع Retry-After بدل خطأ أو تعليق */
export const GET = withBusyGuard(handleGET);
