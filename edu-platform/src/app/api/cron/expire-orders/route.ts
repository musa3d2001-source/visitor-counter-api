import { closeExpiredOrders } from "@/server/payments/reconcile";
import { serveCron } from "@/server/platform/scheduled-jobs";

/** إغلاق الطلبات المنتهية. لا يعتمد على رد البوابة، فيعمل حتى لو تعطلت وظيفة التسوية. الجدول والشرح في README */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  return serveCron(req, "expire-orders", () => closeExpiredOrders({ rounds: 8 }));
}
