import "server-only";
import { after } from "next/server";
import { sql } from "../db";
import { hitRateLimit } from "../auth/rate-limit";
import { isDatabaseBusy } from "../db-busy";
import { reportError } from "../platform/report-error";
import { isUuid } from "@/lib/uuid";
import { type ClaimedInvoice, queueOrder, releaseClaims, unverifiedDue } from "./invoice-queue";
import { UnknownInvoiceError, paymentsConfig, verifyAndApplyPayment } from "./service";

/**
 * فحص زيارة المشتري (F4): من دفع ثم ضاع إشعار البوابة وأغلق صفحة البنك يحصل على ما دفع ثمنه حين يفتح مكتبته أو طلبه أو صفحة الشراء،
 * دون انتظار الجولة اليومية ودون أن يفعل المالك شيئًا.
 *  - طلب واحد في كل زيارة، ومسار التطبيق هو نفسه مسار Webhook، فالمنح واحد أيًا كان من سبق.
 *  - المطالبة نفسها التي تستعملها وظيفة التسوية: فاتورة يفحصها أحدهما لا يسأل عنها الآخر.
 *  - لا يرمي أبدًا. البوابة أو قاعدة البيانات إن تعثرتا تبقى الصفحة كما هي، وزيارة أخرى أو الجولة تكمل.
 *  - مستخدم بلا طلب مفتوح يكلفه هذا استعلامًا واحدًا، ومع إيقاف الدفع لا شيء.
 */
export const HEAL_LIMITS = {
  /** فاتورة أحدث من هذا ما زال صاحبها على صفحة الدفع على الأرجح */
  minInvoiceAgeSeconds: 60,
  recheckMinutes: 2,
  invoicesPerVisit: 3,
  perUser: 6,
  perUserWindowSeconds: 600,
  /** الصفحة لا تنتظر أكثر من هذا مهما حدث */
  deadlineMs: 4_000,
  callTimeoutMs: 3_000,
} as const;

export type HealOutcome = "off" | "none" | "limited" | "checked" | "paid" | "gateway_failed" | "deadline" | "error";

async function dueOrderOf(userId: string, orderId: string | null, environment: string): Promise<string | null> {
  const [row] = await sql<{ order_id: string }[]>`
    select q.order_id from payments q join orders o on o.id = q.order_id
    where o.user_id = ${userId} and o.status in ('pending', 'failed')
      and q.created_at < now() - make_interval(secs => ${HEAL_LIMITS.minInvoiceAgeSeconds})
      ${orderId ? sql`and o.id = ${orderId}` : sql``}
      and ${unverifiedDue(sql, environment, HEAL_LIMITS.recheckMinutes)}
    order by ${queueOrder(sql)}
    limit 1
  `;
  return row?.order_id ?? null;
}

/**
 * فواتير هذا الطلب المستحقة، الأحدث أولًا: الدفعة على آخر رابط فتحه المشتري في الغالب. ما لا تعرفه البوابة بعد كل ما تعرفه (F28).
 * MATERIALIZED حتى لا تتجاوز الدفعة حدها
 */
async function claimOrderInvoices(orderId: string, environment: string): Promise<ClaimedInvoice[]> {
  const claimed = await sql<ClaimedInvoice[]>`
    with batch as materialized (
      select q.id from payments q join orders o on o.id = q.order_id
      where q.order_id = ${orderId} and o.status in ('pending', 'failed')
        and q.created_at < now() - make_interval(secs => ${HEAL_LIMITS.minInvoiceAgeSeconds})
        and ${unverifiedDue(sql, environment, HEAL_LIMITS.recheckMinutes)}
      order by (q.gateway_unknown_last_at is not null) asc, q.created_at desc
      limit ${HEAL_LIMITS.invoicesPerVisit}
      for update of q skip locked
    )
    update payments p set reconcile_claimed_at = now()
    from batch where p.id = batch.id
    returning p.id, p.gateway_invoice_id, p.last_checked_at, p.created_at, p.gateway_unknown_last_at
  `;
  return [...claimed].sort((a, b) => Number(a.gateway_unknown_last_at !== null) - Number(b.gateway_unknown_last_at !== null) || b.created_at.getTime() - a.created_at.getTime());
}

async function heal(userId: string, orderId: string | null, environment: string, startedAt: number): Promise<HealOutcome> {
  const target = await dueOrderOf(userId, orderId, environment);
  if (!target) return "none";
  // الحد بعد التأكد من وجود ما يُفحص: زيارات من لا طلب مفتوحًا له لا تكتب شيئًا
  const { allowed } = await hitRateLimit(`payment-heal:${userId}`, HEAL_LIMITS.perUser, HEAL_LIMITS.perUserWindowSeconds);
  if (!allowed) return "limited";
  const claimed = await claimOrderInvoices(target, environment);
  if (claimed.length === 0) return "none";

  let index = 0;
  let outcome: HealOutcome = "checked";
  try {
    for (; index < claimed.length; index++) {
      if (Date.now() - startedAt > HEAL_LIMITS.deadlineMs - HEAL_LIMITS.callTimeoutMs) return outcome;
      try {
        const result = await verifyAndApplyPayment({ invoiceId: claimed[index].gateway_invoice_id }, { timeoutMs: HEAL_LIMITS.callTimeoutMs });
        if (result.state === "paid") {
          index++;
          return "paid";
        }
      } catch (err) {
        // تبقى بعقدها خمس دقائق: مهلة انتظار لبوابة متعثرة، فلا ينتظر المشتري ثلاث ثوان مع كل تحديث للصفحة
        index++;
        if (isDatabaseBusy(err)) throw err;
        // البوابة أجابت ولا تعرفها: جواب لا عطل، وحُفظ على صفها (F28). نكمل إلى التالية، والتقرير أول مرة فقط
        if (err instanceof UnknownInvoiceError) {
          if (err.firstTime) await reportError("payment:heal-unknown-invoice", err);
          continue;
        }
        await reportError("payment:heal", err);
        return "gateway_failed";
      }
    }
    return outcome;
  } finally {
    await releaseClaims(claimed.slice(index).map((row) => row.id)).catch(() => undefined);
  }
}

/**
 * يُنتظر قبل قراءة المكتبة أو السلة أو الطلب، حتى ترى الصفحة نفسها ما مُنح الآن.
 * عند انقضاء المهلة تكمل الصفحة، ويستمر العمل بعد الرد ليكتمل ما بدأ.
 */
export async function healBuyerOrders(input: { userId: string; orderId?: string }): Promise<HealOutcome> {
  try {
    const cfg = paymentsConfig();
    if (!cfg.enabled) return "off";
    if (input.orderId !== undefined && !isUuid(input.orderId)) return "none";
    const work = heal(input.userId, input.orderId ?? null, cfg.environment, Date.now()).catch(async (err): Promise<HealOutcome> => {
      if (!isDatabaseBusy(err)) await reportError("payment:heal", err).catch(() => undefined);
      return "error";
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<"deadline">((resolve) => {
      timer = setTimeout(() => resolve("deadline"), HEAL_LIMITS.deadlineMs);
      timer.unref?.();
    });
    const outcome = await Promise.race([work, deadline]).finally(() => clearTimeout(timer));
    if (outcome === "deadline") {
      try {
        after(() => work);
      } catch {
        // خارج سياق طلب: الوعد يكمل وحده
      }
    }
    return outcome;
  } catch (err) {
    if (!isDatabaseBusy(err)) await reportError("payment:heal", err).catch(() => undefined);
    return "error";
  }
}
