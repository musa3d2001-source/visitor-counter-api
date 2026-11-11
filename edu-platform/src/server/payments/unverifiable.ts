import "server-only";
import { sql } from "../db";
import { closeOrder } from "../commerce/orders";
import { audit } from "../platform/audit";
import { linkDeadAt } from "./invoice-queue";
import { attemptBlocksClosing, checkOrderInvoices, paymentDeadline } from "./service";

export type CloseUnverifiableRefusal = "not_open" | "nothing_unknown" | "unreachable" | "paid" | "invalid" | "in_progress" | "link_payable";
export type CloseUnverifiableOutcome = { state: "closed" } | { state: "refused"; reason: CloseUnverifiableRefusal };

/**
 * الملاذ الأخير للمالك (F28): طلب مفتوح عليه فاتورة لا يعرفها حساب البوابة الحالي (بعد تغيير الحساب أو المفتاح)،
 * فلا يُغلق وحده حتى ينتهي أمرها، ولا يُحذف حساب صاحبه. المالك تحقق في لوحة الحساب السابق أنها لم تُدفع، فيغلقه الآن.
 *
 * لا يتجاوز شيئًا تعرفه البوابة: نسأل عن كل فاتورة أولًا، وما دُفع يُطبق كالمعتاد بدل الإغلاق. ويُرفض إن تعذر الوصول إليها،
 * أو على الطلب فاتورة لا تطابقه، أو عملية لم تُحسم عند البنك، أو رابط ما زال يقبل الدفع لدى الحساب الذي أصدره.
 * السبب unverifiable ليس من أسباب الإكمال المتأخر (lateCompletionBlockers)، فدفعة تظهر بعده تُسجل للمالك ولا تمنح الوصول وحدها.
 * لا تنبيه جديد: هذا الأمر نفسه قرار المالك بعد التحقق، ومسجل في التدقيق بنصه.
 */
export async function closeUnverifiableOrder(input: { orderId: string; adminId: string; reason: string; ip?: string }): Promise<CloseUnverifiableOutcome> {
  const refused = (reason: CloseUnverifiableRefusal): CloseUnverifiableOutcome => ({ state: "refused", reason });
  const [order] = await sql<{ status: string }[]>`select status from orders where id = ${input.orderId}`;
  if (!order || (order.status !== "pending" && order.status !== "failed")) return refused("not_open");

  const walk = await checkOrderInvoices(input.orderId, { deadline: paymentDeadline() });
  if (walk.anyPaid || walk.anyFlagged) return refused("paid");
  if (walk.unknown === 0) return refused("nothing_unknown");
  // ما لم يُجب عنه لسبب غير «لا أعرفها» تعذر حقيقي: الانتظار يحله، والإغلاق الآن قد يخفي دفعة
  if (walk.unreachable > walk.unknown - walk.unknownTerminal) return refused("unreachable");
  if (walk.invalid) return refused("invalid");
  if (await attemptBlocksClosing(input.orderId, walk.inProgressInvoiceIds)) return refused("in_progress");
  const [payable] = await sql`
    select 1 from payments q
    where q.order_id = ${input.orderId} and q.provider = 'myfatoorah' and q.gateway_invoice_id is not null
      and q.status not in ('paid', 'refunded') and now() <= ${linkDeadAt(sql)}
    limit 1
  `;
  if (payable) return refused("link_payable");

  const closed = await sql.begin(async (db) => {
    if (!(await closeOrder(db, { orderId: input.orderId, reason: "unverifiable", actorId: input.adminId, ip: input.ip }))) return false;
    await audit(
      {
        actorId: input.adminId,
        action: "order.close_unverifiable",
        entityType: "order",
        entityId: input.orderId,
        reason: input.reason,
        metadata: { unknownInvoices: walk.unknown, checkedInvoices: walk.checked },
        ip: input.ip ?? null,
      },
      db,
    );
    return true;
  });
  return closed ? { state: "closed" } : refused("not_open");
}
