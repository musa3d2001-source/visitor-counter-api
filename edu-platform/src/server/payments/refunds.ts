import "server-only";
import { sql, type Db } from "../db";
import { filsToKwdString, kwdNumberToFils } from "@/lib/money";
import { audit } from "../platform/audit";
import { applyRefundToOrder, undoRefundOnOrder, type OrderRow } from "../commerce/orders";
import { sendRefundCancelledEmail, sendRefundCompletedEmail, sendRefundEmail } from "../commerce/order-mail";
import { isDefiniteGatewayRefusal, type MfRefundStatus, type MyFatoorahClient } from "./myfatoorah";
import { applyExtraRefundEvent } from "./extras";
import { raiseRefundAlert, type RefundAlertReason } from "./monitoring";
import { REFUND_STUCK_HOURS } from "./limits";
import { REFUND_SENDING_STALE_MINUTES } from "./limits";

/**
 * استرداد الطلب أمر واحد من المالك (D1). البوابة أولًا، ثم الأثر المحلي في معاملة واحدة:
 *  1) مطالبة ذرّية تحت قفل الطلب: صف sending، فلا يخرج طلبان معًا.
 *  2) MakeRefund بلا أي معاملة مفتوحة أثناء الاستدعاء.
 *  3) قبلت البوابة: requested، ومعها حالة الطلب وسحب الوصول وعكس الأرباح في معاملة واحدة.
 *     رفضت صراحة: failed والطلب كما هو والسبب يظهر للمالك.
 *     انقطع الرد أو 5xx: unknown، ولا إعادة إرسال قبل إعادة تحقق صريحة من البوابة.
 * رقم المحاولة لا يزيد إلا بعد رفض صريح أو إلغاء، وعندها فقط يتولد Idempotency-Key جديد.
 * المرجع الخارجي يحمل رقم المحاولة حتى لا تُقرأ محاولة ألغتها البوابة كأنها الحالية.
 * ترتيب الأقفال دائمًا: الطلب، ثم صف الاسترداد، ثم صف الدفع. البريد بعد الالتزام فقط.
 */

export type RefundStatus = "recorded" | "sending" | "unknown" | "not_sent" | "requested" | "completed" | "failed" | "dismissed";

export type RefundGateway = Pick<MyFatoorahClient, "makeRefund" | "getRefundStatus">;
type Environment = "sandbox" | "live";
type Actor = { actorId: string | null; ip?: string | null };

export type RefundOutcome = {
  /** held_back: توقفنا قبل الإرسال ولم يصل البوابة شيء في هذه المحاولة، فلا يُعرض على أنه رفض منها */
  state: Extract<RefundStatus, "requested" | "completed" | "failed" | "unknown" | "not_sent"> | "held_back";
  error?: string;
  /** لم تظهر العملية لدى البوابة بعد، لكن الوقت ما زال مبكرًا للجزم */
  wait?: true;
};

export class RefundError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = "RefundError";
  }
}

type RefundRow = {
  id: string;
  order_id: string;
  payment_id: string | null;
  amount_fils: number;
  reason: string;
  status: RefundStatus;
  attempt: number;
  gateway_refund_id: string | null;
  accepted_at: Date | null;
  claim_stale: boolean;
};

type Claim = {
  refundId: string;
  orderId: string;
  paymentKey: { key: string; keyType: "PaymentId" | "InvoiceId" };
  invoiceId: string;
  amountFils: number;
  reason: string;
  attempt: number;
  /** الحالة قبل المطالبة: إليها نعود إن تعذر التحقق قبل الإرسال */
  prior: RefundStatus | null;
  /** أُرسل هذا السجل من قبل، أو أُغلق سجل سابق بعد إرساله، فيجب سؤال البوابة قبل الإرسال */
  checkFirst: boolean;
  /** سجل سابق أُرسل ثم أغلقه المالك: مرجعه الخارجي يختلف عن هذا السجل، فلا يطابقه matchGatewayRefund */
  hadDismissed: boolean;
};

const externalIdOf = (refundId: string, attempt: number) => `refund:${refundId}:${attempt}`;
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const NEEDS_RECHECK = "نتيجة الطلب السابق غير مؤكدة. استخدم «إعادة التحقق» أولًا حتى لا يتكرر الاسترداد.";
const staleClaim = (db: Db) => db`coalesce(claimed_at < now() - make_interval(mins => ${REFUND_SENDING_STALE_MINUTES}), true) as claim_stale`;

/** تفسير حالة البوابة الموثقة: Refunded | Canceled | Pending. أي قيمة أخرى لا تغيّر شيئًا */
function gatewayFactKind(status: string): GatewayFact["kind"] | null {
  if (/^refunded$/i.test(status)) return "refunded";
  if (/^cancell?ed$/i.test(status)) return "cancelled";
  if (/^pending$/i.test(status)) return "accepted";
  return null;
}

/**
 * البحث عن استردادنا في نتيجة GetRefundStatus: برقم البوابة، ثم بمرجعنا الخارجي،
 * ثم باسترداد كامل بلا مرجع (نفذه المالك من لوحة البوابة) حتى لا نرسل استردادًا ثانيًا فوقه.
 */
export function matchGatewayRefund(list: MfRefundStatus[], row: { refundId: string; attempt: number; gatewayRefundId: string | null; amountFils: number }): MfRefundStatus | null {
  if (row.gatewayRefundId) {
    const byId = list.find((r) => String(r.RefundId) === row.gatewayRefundId);
    if (byId) return byId;
  }
  const external = externalIdOf(row.refundId, row.attempt);
  const mine = list.filter((r) => r.ExternalIdentifier === external);
  const live = mine.find((r) => !/^cancell?ed$/i.test(r.RefundStatus)) ?? mine[0];
  if (live) return live;
  return list.find((r) => !r.ExternalIdentifier && !/^cancell?ed$/i.test(r.RefundStatus) && kwdNumberToFils(Number(r.RefundAmount ?? r.Amount)) === row.amountFils) ?? null;
}

async function claimRefund(environment: Environment, input: { orderId: string; adminId: string; reason?: string; ip?: string }): Promise<Claim> {
  return sql.begin(async (db) => {
    const [order] = await db<OrderRow[]>`select * from orders where id = ${input.orderId} for update`;
    if (!order) throw new RefundError("الطلب غير موجود");
    const [row] = await db<RefundRow[]>`
      select *, ${staleClaim(db)} from refunds
      where order_id = ${order.id} and status <> 'dismissed'
      order by created_at desc limit 1 for update
    `;
    const [dismissed] = await db`select 1 from refunds where order_id = ${order.id} and status = 'dismissed' and attempt > 0 limit 1`;
    if (row?.status === "sending") throw new RefundError(row.claim_stale ? NEEDS_RECHECK : "يجري إرسال طلب الاسترداد الآن.");
    if (row?.status === "unknown") throw new RefundError(NEEDS_RECHECK);
    if (row?.status === "requested") throw new RefundError("أُرسل طلب استرداد لهذا الطلب وينتظر التنفيذ.");
    if (row?.status === "completed") throw new RefundError("هذا الطلب مسترد بالفعل.");

    // سجل قديم من قبل هذا النظام: الطلب قُلب محليًا ولم يصل الاسترداد للبوابة
    const legacy = Boolean(row) && order.status === "refunded" && row.accepted_at === null && (row.status === "recorded" || row.status === "failed");
    if (order.status !== "paid" && !legacy) throw new RefundError("لا يمكن استرداد طلب غير مدفوع.");

    const reason = input.reason?.trim() || row?.reason;
    if (!reason || reason.length < 3) throw new RefundError("اكتب سبب الاسترداد (٣ أحرف على الأقل).");

    type PaymentRow = { id: string; provider: string; environment: string; amount_fils: number; gateway_invoice_id: string | null; gateway_payment_id: string | null };
    const [payment] = row?.payment_id
      ? await db<PaymentRow[]>`select id, provider, environment, amount_fils, gateway_invoice_id, gateway_payment_id from payments where id = ${row.payment_id} for update`
      : await db<PaymentRow[]>`
          select p.id, p.provider, p.environment, p.amount_fils, p.gateway_invoice_id, p.gateway_payment_id from payments p
          where p.order_id = ${order.id} and p.status = 'paid'
            and not exists (select 1 from payment_extras e where e.payment_id = p.id and e.gateway_payment_id is null)
          order by p.created_at desc limit 1 for update
        `;
    if (!payment || payment.provider !== "myfatoorah" || !payment.gateway_invoice_id) throw new RefundError("لا يوجد دفع إلكتروني مرتبط بهذا الطلب، فلا يمكن استرداده عبر البوابة.");
    if (payment.environment !== environment) throw new RefundError("هذا الطلب من وضع دفع مختلف عن الوضع الحالي.");

    // D1: استرداد كامل قيمة الطلب فقط، والجزئي يتم من لوحة البوابة ويصلنا كتنبيه
    const amountFils = order.total_fils;
    if (amountFils <= 0 || payment.amount_fils !== amountFils || (row && row.amount_fils !== amountFils)) {
      throw new RefundError("مبلغ الدفعة لا يطابق قيمة الطلب، فلا يمكن استرداده من هنا. راجعه من لوحة MyFatoorah.");
    }

    // not_sent: تأكدنا أن الطلب لم يصل، فنعيد بالمفتاح نفسه. الرفض الصريح والإلغاء فقط يولدان مفتاحًا جديدًا
    const attempt = row?.status === "not_sent" ? row.attempt : (row?.attempt ?? 0) + 1;
    let refundId: string;
    if (row) {
      refundId = row.id;
      await db`
        update refunds set status = 'sending', attempt = ${attempt}, claimed_at = now(), error = null, reason = ${reason.slice(0, 500)},
          created_by = ${input.adminId}, gateway_refund_id = null, gateway_refund_reference = null
        where id = ${row.id}
      `;
    } else {
      const [created] = await db<{ id: string }[]>`
        insert into refunds (order_id, payment_id, amount_fils, reason, status, attempt, claimed_at, created_by)
        values (${order.id}, ${payment.id}, ${amountFils}, ${reason.slice(0, 500)}, 'sending', ${attempt}, now(), ${input.adminId})
        returning id
      `;
      refundId = created.id;
    }
    await audit({ actorId: input.adminId, action: "order.refund_started", entityType: "order", entityId: order.id, reason, metadata: { refundId, attempt, amountFils }, ip: input.ip ?? null }, db);
    return {
      refundId,
      orderId: order.id,
      paymentKey: payment.gateway_payment_id ? { key: payment.gateway_payment_id, keyType: "PaymentId" as const } : { key: payment.gateway_invoice_id, keyType: "InvoiceId" as const },
      invoiceId: payment.gateway_invoice_id,
      amountFils,
      reason,
      attempt,
      prior: row?.status ?? null,
      checkFirst: Boolean(row && row.attempt > 0) || Boolean(dismissed),
      hadDismissed: Boolean(dismissed),
    };
  });
}

type GatewayFact = { kind: "accepted" | "refunded" | "cancelled"; refundId: string; reference?: string | null };
type Transition = { state: RefundOutcome["state"]; mail: "refund" | "refund_completed" | "refund_cancelled" | null; orderId: string; error?: string };

const CANCELLED_TEXT = "ألغت البوابة طلب الاسترداد ولم يخرج المال.";

/**
 * تطبيق ما قالته البوابة على صف استرداد مقفول تحت قفل طلبه. نقطة التحول الوحيدة،
 * يمر بها قبول MakeRefund وإعادة التحقق وWebhook، فنتيجة السباق بينها واحدة وأثرها يُطبق مرة واحدة.
 */
async function applyFact(db: Db, order: OrderRow, row: RefundRow, fact: GatewayFact, actor: Actor): Promise<Transition> {
  const base = { orderId: order.id };
  const auditFact = (action: string, metadata: Record<string, unknown> = {}) =>
    audit({ actorId: actor.actorId, action, entityType: "order", entityId: order.id, metadata: { refundId: row.id, gatewayRefundId: fact.refundId, ...metadata }, ip: actor.ip ?? null }, db);
  const applyToOrder = async () => {
    if (order.status !== "paid") return false;
    await applyRefundToOrder(db, { order, paymentId: row.payment_id, refundId: row.id, amountFils: row.amount_fils, reason: row.reason, actorId: actor.actorId, ip: actor.ip, gatewayRefundId: fact.refundId });
    return true;
  };

  if (fact.kind === "accepted") {
    if (row.status === "completed" || row.status === "requested") {
      await db`update refunds set gateway_refund_id = coalesce(gateway_refund_id, ${fact.refundId}), gateway_refund_reference = coalesce(gateway_refund_reference, ${fact.reference ?? null}), claimed_at = null where id = ${row.id}`;
      return { ...base, state: row.status, mail: null };
    }
    if (row.status === "failed" && row.gateway_refund_id === fact.refundId) return { ...base, state: "failed", mail: null, error: CANCELLED_TEXT };
    const flips = order.status === "paid";
    await db`
      update refunds set status = 'requested', gateway_refund_id = ${fact.refundId}, gateway_refund_reference = ${fact.reference ?? null}, claimed_at = null, error = null,
        accepted_at = case when ${flips} then now() else accepted_at end
      where id = ${row.id}
    `;
    const applied = await applyToOrder();
    await auditFact("order.refund_accepted");
    return { ...base, state: "requested", mail: applied ? "refund" : null };
  }

  if (fact.kind === "refunded") {
    if (row.status === "completed") return { ...base, state: "completed", mail: null };
    const flips = order.status === "paid";
    await db`
      update refunds set status = 'completed', gateway_refund_id = ${fact.refundId}, gateway_refund_reference = coalesce(${fact.reference ?? null}, gateway_refund_reference), claimed_at = null, error = null,
        completed_at = now(), accepted_at = case when ${flips} then now() else accepted_at end
      where id = ${row.id}
    `;
    const applied = await applyToOrder();
    await auditFact("order.refund_completed");
    // يعرف الطالب بالتنفيذ من أُخبر بالقبول، ومن طُبق استرداده الآن مباشرة
    return { ...base, state: "completed", mail: applied || (row.status === "requested" && row.accepted_at) ? "refund_completed" : null };
  }

  // الإلغاء
  if (row.status === "completed") {
    await raiseRefundAlert(db, { orderId: order.id, paymentId: row.payment_id, details: { refundId: fact.refundId, status: "CANCELED", invoiceId: "", amountFils: row.amount_fils, reason: "cancelled_after_completion" } });
    return { ...base, state: "completed", mail: null };
  }
  if (row.status === "failed") return { ...base, state: "failed", mail: null, error: CANCELLED_TEXT };
  let undone = false;
  if (row.status === "requested" && row.accepted_at && order.status === "refunded") {
    await undoRefundOnOrder(db, { order, paymentId: row.payment_id, refundId: row.id, actorId: actor.actorId, gatewayRefundId: fact.refundId });
    undone = true;
  }
  await db`
    update refunds set status = 'failed', gateway_refund_id = ${fact.refundId}, claimed_at = null, accepted_at = null, error = ${CANCELLED_TEXT}
    where id = ${row.id}
  `;
  await auditFact("order.refund_cancelled", { undone });
  return { ...base, state: "failed", mail: undone ? "refund_cancelled" : null, error: CANCELLED_TEXT };
}

/** البريد بعد الالتزام فقط، ولا يغيّر نتيجة العملية أبدًا (الدوال نفسها لا ترمي) */
async function deliver(t: Transition): Promise<RefundOutcome> {
  if (t.mail === "refund") await sendRefundEmail(t.orderId);
  if (t.mail === "refund_completed") await sendRefundCompletedEmail(t.orderId);
  if (t.mail === "refund_cancelled") await sendRefundCancelledEmail(t.orderId);
  return t.error ? { state: t.state, error: t.error } : { state: t.state };
}

async function transitionById(refundId: string, fact: GatewayFact, actor: Actor): Promise<RefundOutcome> {
  const t = await sql.begin(async (db) => {
    const [ref] = await db<{ order_id: string }[]>`select order_id from refunds where id = ${refundId}`;
    const [order] = await db<OrderRow[]>`select * from orders where id = ${ref.order_id} for update`;
    const [row] = await db<RefundRow[]>`select *, ${staleClaim(db)} from refunds where id = ${refundId} for update`;
    return applyFact(db, order, row, fact, actor);
  });
  return deliver(t);
}

/** نتيجة لا أثر لها على الطلب: رفض صريح أو نتيجة مجهولة. unknown يحتفظ بوقت المطالبة ليُعرف متى يجوز الجزم بأن الطلب لم يصل */
async function finishWithoutEffect(claim: Claim, state: "failed" | "unknown", error: string, actor: Actor): Promise<RefundOutcome> {
  await sql.begin(async (db) => {
    await db`select id from orders where id = ${claim.orderId} for update`;
    await db`
      update refunds set status = ${state}, error = ${error.slice(0, 500)}, claimed_at = case when ${state} = 'failed' then null else claimed_at end
      where id = ${claim.refundId} and status = 'sending'
    `;
    await audit({ actorId: actor.actorId, action: `order.refund_${state}`, entityType: "order", entityId: claim.orderId, metadata: { refundId: claim.refundId, attempt: claim.attempt, error: error.slice(0, 200) }, ip: actor.ip ?? null }, db);
  });
  return { state, error };
}

const SAVE_FAILED = "وصل رد البوابة وتعذر حفظه. لم يتأكد الوضع النهائي، أعد التحقق بعد دقيقتين.";

/** طلب استرداد جديد أو إعادة إرسال بعد رفض أو بعد التأكد أن الطلب السابق لم يصل. يرمي RefundError إن لم تسمح الحالة */
export async function requestRefund(gateway: RefundGateway, environment: Environment, input: { orderId: string; adminId: string; reason?: string; ip?: string }): Promise<RefundOutcome> {
  const claim = await claimRefund(environment, input);
  const actor: Actor = { actorId: input.adminId, ip: input.ip };
  // بعد المطالبة لا يخرج أي استثناء: فشل الحفظ لا يعني رفض البوابة، والصف يبقى sending حتى تكشفه إعادة التحقق
  try {
    if (claim.checkFirst) {
      const holdBack = async (error: string): Promise<RefundOutcome> => {
        await sql`update refunds set status = ${claim.prior ?? "not_sent"}, claimed_at = null, error = ${error.slice(0, 500)} where id = ${claim.refundId} and status = 'sending'`;
        return { state: "held_back", error };
      };
      let list: MfRefundStatus[];
      try {
        list = await gateway.getRefundStatus(claim.invoiceId, "InvoiceId");
      } catch (err) {
        return await holdBack(`تعذر سؤال البوابة عن الطلب السابق فلم نرسل شيئًا: ${message(err)}`);
      }
      if (claim.hadDismissed) {
        const current = externalIdOf(claim.refundId, claim.attempt);
        const earlier = list.find((r) => r.ExternalIdentifier?.startsWith("refund:") && r.ExternalIdentifier !== current && !/^cancell?ed$/i.test(r.RefundStatus));
        if (earlier) return await holdBack(`لدى البوابة طلب استرداد سابق لهذا الطلب (${earlier.RefundId}) ولم يُلغ، فلم نرسل طلبًا جديدًا. راجعه في لوحة MyFatoorah.`);
      }
      const found = matchGatewayRefund(list, { refundId: claim.refundId, attempt: claim.attempt, gatewayRefundId: null, amountFils: claim.amountFils });
      const kind = found ? gatewayFactKind(found.RefundStatus) : null;
      if (found && kind && kind !== "cancelled") return await transitionById(claim.refundId, { kind, refundId: String(found.RefundId), reference: found.RefundReference }, actor);
      // حالة لا نعرفها تعني أن لدى البوابة عملية قائمة: إرسال آخر فوقها قد يكرر الاسترداد
      if (found && !kind) return await holdBack(`لدى البوابة طلب استرداد بحالة غير معروفة (${found.RefundStatus}) فلم نرسل شيئًا. راجعه في لوحة MyFatoorah.`);
    }

    let res: Awaited<ReturnType<RefundGateway["makeRefund"]>>;
    try {
      res = await gateway.makeRefund({
        ...claim.paymentKey,
        amountKwd: filsToKwdString(claim.amountFils),
        comment: claim.reason.slice(0, 200),
        externalIdentifier: externalIdOf(claim.refundId, claim.attempt),
        idempotencyKey: `refund-${claim.refundId}-${claim.attempt}`,
      });
    } catch (err) {
      return await finishWithoutEffect(claim, isDefiniteGatewayRefusal(err) ? "failed" : "unknown", message(err), actor);
    }
    if (!res?.RefundId) return await finishWithoutEffect(claim, "unknown", "لم تُعد البوابة رقم استرداد", actor);
    return await transitionById(claim.refundId, { kind: "accepted", refundId: String(res.RefundId), reference: res.RefundReference }, actor);
  } catch (err) {
    console.error("[refund] could not save the gateway result", message(err));
    return { state: "unknown", error: SAVE_FAILED };
  }
}

/**
 * إعادة التحقق الصريحة من البوابة قبل أي إعادة إرسال. تعذر السؤال لا يغيّر شيئًا.
 * عدم العثور على العملية يعني not_sent فقط إن مضت دقيقتان على المطالبة، وإلا قد يكون الطلب ما زال في الطريق.
 */
export async function recheckRefund(gateway: RefundGateway, environment: Environment, input: { refundId: string; adminId: string | null; ip?: string }): Promise<RefundOutcome> {
  const actor: Actor = { actorId: input.adminId, ip: input.ip };
  const [row] = await sql<(RefundRow & { gateway_invoice_id: string | null; environment: string | null })[]>`
    select r.*, ${staleClaim(sql)}, p.gateway_invoice_id, p.environment
    from refunds r left join payments p on p.id = r.payment_id where r.id = ${input.refundId}
  `;
  if (!row) throw new RefundError("سجل الاسترداد غير موجود.");
  if (row.status === "sending" && !row.claim_stale) throw new RefundError("يجري إرسال الطلب الآن. أعد التحقق بعد قليل.");
  if (row.status !== "unknown" && row.status !== "requested" && row.status !== "sending") throw new RefundError("هذا السجل لا يحتاج إلى إعادة تحقق.");
  if (!row.gateway_invoice_id) throw new RefundError("لا يوجد مرجع دفع لدى البوابة لهذا السجل.");
  if (row.environment !== environment) throw new RefundError("هذا السجل من وضع دفع مختلف عن الوضع الحالي.");

  let list: MfRefundStatus[];
  try {
    list = await gateway.getRefundStatus(row.gateway_invoice_id, "InvoiceId");
  } catch (err) {
    throw new RefundError(`تعذر سؤال البوابة الآن ولم يتغير شيء: ${message(err)}`);
  }
  const found = matchGatewayRefund(list, { refundId: row.id, attempt: row.attempt, gatewayRefundId: row.gateway_refund_id, amountFils: row.amount_fils });
  const kind = found ? gatewayFactKind(found.RefundStatus) : null;
  if (found && kind) return transitionById(row.id, { kind, refundId: String(found.RefundId), reference: found.RefundReference }, actor);
  if (found) return { state: row.status === "requested" ? "requested" : "unknown", error: `حالة غير معروفة من البوابة: ${found.RefundStatus}` };

  return sql.begin(async (db): Promise<RefundOutcome> => {
    await db`select id from orders where id = ${row.order_id} for update`;
    const [fresh] = await db<RefundRow[]>`select *, ${staleClaim(db)} from refunds where id = ${row.id} for update`;
    if (fresh.status === "requested" || fresh.status === "completed" || fresh.status === "failed" || fresh.status === "not_sent") return { state: fresh.status };
    if (!fresh.claim_stale) return { state: "unknown", wait: true };
    const error = "لم تجد البوابة هذا الطلب، فلم يصلها.";
    await db`update refunds set status = 'not_sent', claimed_at = null, error = ${error} where id = ${row.id} and status in ('unknown', 'sending')`;
    await audit({ actorId: actor.actorId, action: "order.refund_not_sent", entityType: "order", entityId: row.order_id, metadata: { refundId: row.id, attempt: row.attempt }, ip: actor.ip ?? null }, db);
    return { state: "not_sent", error };
  });
}

export type RefundEvent = { invoiceId: string; refundId: string; status: string; amountFils: number | null };

/**
 * حدث الاسترداد (Code 2) بعد التحقق من توقيعه:
 *  - دفعة زائدة: يخص سجلها وحده ولا يمس الطلب.
 *  - رقم نعرفه، أو طلب أرسلناه ولم يصلنا رده بعد: يُطبق على صفه.
 *  - رقم لا نعرفه (استرداد من لوحة البوابة): يُطبق فقط إن أكدته البوابة وكان كامل قيمة طلب مدفوع، وإلا تنبيه للمالك.
 * تعذر سؤال البوابة يرمي، فيرجع Webhook بـ 500 وتعيد البوابة الإرسال.
 */
export async function applyRefundEvent(gateway: RefundGateway, environment: Environment, ev: RefundEvent): Promise<void> {
  if (ev.status !== "REFUNDED" && ev.status !== "CANCELED") return;
  const details = (reason: RefundAlertReason) => ({ refundId: ev.refundId, status: ev.status, invoiceId: ev.invoiceId, amountFils: ev.amountFils, reason });
  const [payment] = await sql<{ id: string; order_id: string; environment: string }[]>`
    select p.id, p.order_id, p.environment from payments p where p.provider = 'myfatoorah' and p.gateway_invoice_id = ${ev.invoiceId}
  `;
  if (!payment) return raiseRefundAlert(sql, { orderId: null, paymentId: null, details: details("unknown_invoice") });
  if (payment.environment !== environment) return raiseRefundAlert(sql, { orderId: payment.order_id, paymentId: payment.id, details: details("other_environment") });

  const extras = await sql<{ id: string; state: string; gateway_payment_id: string | null; gateway_refund_id: string | null }[]>`
    select id, state, gateway_payment_id, gateway_refund_id from payment_extras where payment_id = ${payment.id}
  `;
  const perTransaction = extras.filter((e) => e.gateway_payment_id !== null);
  let transactionExtra = perTransaction.find((e) => e.gateway_refund_id === ev.refundId) ?? null;
  if (!transactionExtra && perTransaction.length) {
    // الحدث لا يذكر معرفنا الخارجي، والبوابة تعرفه: extra:<id> يحدد العملية دون تخمين، حتى قبل وصول رد MakeRefund
    const sent = (await gateway.getRefundStatus(ev.invoiceId, "InvoiceId")).find((r) => String(r.RefundId) === ev.refundId);
    transactionExtra = perTransaction.find((e) => `extra:${e.id}` === sent?.ExternalIdentifier) ?? null;
  }
  if (transactionExtra) {
    const extraId = transactionExtra.id;
    await sql.begin((db) => applyExtraRefundEvent(db, { ...ev, extraId }));
    return;
  }

  const wholeInvoice = extras.find((e) => e.gateway_payment_id === null);
  if (wholeInvoice) {
    await sql.begin(async (db) => {
      const applied = await applyExtraRefundEvent(db, ev);
      if (applied === 0 && ev.status === "REFUNDED" && wholeInvoice.state !== "refunded") {
        await raiseRefundAlert(db, { orderId: payment.order_id, paymentId: payment.id, details: details("extra_mismatch") });
      }
    });
    return;
  }

  // قد يصل الحدث قبل رد MakeRefund: صف أرسلناه ولم نعرف رقمه بعد هو هذا الاسترداد إن طابق المبلغ
  const find = (db: Db, lock: boolean) => db<RefundRow[]>`
    select *, ${staleClaim(db)} from refunds
    where payment_id = ${payment.id} and status <> 'dismissed'
      and (gateway_refund_id = ${ev.refundId} or (gateway_refund_id is null and amount_fils = ${ev.amountFils} and status in ('sending', 'unknown', 'not_sent', 'recorded')))
    order by (gateway_refund_id is not null) desc, created_at desc limit 1 ${lock ? db`for update` : db``}
  `;

  // الاستعلام قبل المعاملة: لا نبقي قفلًا مفتوحًا أثناء استدعاء البوابة
  const [peek] = await find(sql, false);
  let confirmed: MfRefundStatus | null = null;
  if (!peek && ev.status === "REFUNDED") {
    // نسأل بالفاتورة الأصلية ونطابق برقم الاسترداد: الوثائق تقول إن InvoiceId في الرد هو الفاتورة المستخدمة في الاستعلام،
    // وللاسترداد فاتورة خاصة به (Refund.InvoiceId في الحدث) تختلف عن ReferencedInvoice.Id
    const list = await gateway.getRefundStatus(ev.invoiceId, "InvoiceId");
    confirmed = list.find((r) => String(r.RefundId) === ev.refundId && /^refunded$/i.test(r.RefundStatus)) ?? null;
    // استرداد من لوحة البوابة على فاتورة بعمليتين ناجحتين: قد يخص أيًا منهما، وتطبيقه على الطلب قد يسحب وصولًا مدفوعًا
    if (perTransaction.some((e) => e.state !== "refunded" && e.state !== "dismissed")) {
      return raiseRefundAlert(sql, { orderId: payment.order_id, paymentId: payment.id, details: details("extra_ambiguous") });
    }
  }

  const t = await sql.begin(async (db): Promise<Transition | null> => {
    const [order] = await db<OrderRow[]>`select * from orders where id = ${payment.order_id} for update`;
    const [row] = await find(db, true);
    const actor: Actor = { actorId: null };
    if (row) return applyFact(db, order, row, { kind: ev.status === "REFUNDED" ? "refunded" : "cancelled", refundId: ev.refundId }, actor);

    const flag = async (reason: RefundAlertReason) => {
      await raiseRefundAlert(db, { orderId: order.id, paymentId: payment.id, details: details(reason) });
      return null;
    };
    if (ev.status === "CANCELED") return flag("cancelled_unknown");
    if (!confirmed) return flag("not_confirmed");
    const [paid] = await db<{ status: string; amount_fils: number }[]>`select status, amount_fils from payments where id = ${payment.id} for update`;
    if (order.status !== "paid" || paid.status !== "paid") return flag("order_not_paid");
    const confirmedFils = kwdNumberToFils(Number(confirmed.RefundAmount ?? confirmed.Amount));
    if (ev.amountFils !== order.total_fils || ev.amountFils !== paid.amount_fils || confirmedFils !== order.total_fils) return flag("amount_mismatch");

    const [other] = await db<{ id: string; status: RefundStatus }[]>`select id, status from refunds where order_id = ${order.id} and status <> 'dismissed' for update`;
    if (other && other.status !== "failed" && other.status !== "not_sent") return flag("conflicting_refund");
    const reason = "استرداد نُفذ من لوحة البوابة";
    const values = { reference: confirmed.RefundReference ?? null };
    let refundId: string;
    if (other) {
      refundId = other.id;
      await db`
        update refunds set status = 'completed', source = 'portal', reason = ${reason}, gateway_refund_id = ${ev.refundId}, gateway_refund_reference = ${values.reference},
          claimed_at = null, error = null, accepted_at = now(), completed_at = now()
        where id = ${other.id}
      `;
    } else {
      const [created] = await db<{ id: string }[]>`
        insert into refunds (order_id, payment_id, amount_fils, reason, status, source, gateway_refund_id, gateway_refund_reference, accepted_at, completed_at)
        values (${order.id}, ${payment.id}, ${order.total_fils}, ${reason}, 'completed', 'portal', ${ev.refundId}, ${values.reference}, now(), now())
        returning id
      `;
      refundId = created.id;
    }
    await applyRefundToOrder(db, { order, paymentId: payment.id, refundId, amountFils: order.total_fils, reason, actorId: null, gatewayRefundId: ev.refundId });
    return { state: "completed", mail: "refund_completed", orderId: order.id };
  });
  if (t) await deliver(t);
}

export type RefundQueueRow = {
  id: string;
  order_id: string;
  order_number: string;
  order_is_test: boolean;
  status: RefundStatus;
  amount_fils: number;
  reason: string;
  error: string | null;
  source: "owner" | "portal";
  gateway_refund_id: string | null;
  admin_name: string | null;
  created_at: Date;
  accepted_at: Date | null;
  completed_at: Date | null;
  claim_stale: boolean;
};

const queueSelect = () => sql`
  r.id, r.order_id, o.number as order_number, o.is_test as order_is_test, r.status, r.amount_fils, r.reason, r.error, r.source, r.gateway_refund_id,
  u.full_name as admin_name, r.created_at, r.accepted_at, r.completed_at,
  coalesce(r.claimed_at < now() - make_interval(mins => ${REFUND_SENDING_STALE_MINUTES}), true) as claim_stale
`;

/** قائمة المالك: كل استرداد لم يكتمل بعد، الأحدث أولًا */
export async function openRefunds(opts: { limit?: number } = {}): Promise<RefundQueueRow[]> {
  return sql<RefundQueueRow[]>`
    select ${queueSelect()}
    from refunds r join orders o on o.id = r.order_id left join users u on u.id = r.created_by
    where r.status not in ('completed', 'dismissed')
    order by r.created_at desc limit ${opts.limit ?? 50}
  `;
}

export async function orderRefunds(orderId: string): Promise<RefundQueueRow[]> {
  return sql<RefundQueueRow[]>`
    select ${queueSelect()}
    from refunds r join orders o on o.id = r.order_id left join users u on u.id = r.created_by
    where r.order_id = ${orderId}
    order by r.created_at desc
  `;
}

/** عدد الاستردادات التي تنتظر قرارًا من المالك. requested لا يحتاج شيئًا منه ما دامت البوابة تحسمه، إلا إن طال انتظاره */
export async function refundsNeedingOwnerCount(): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from refunds
    where status in ('unknown', 'not_sent', 'failed', 'recorded')
       or (status = 'sending' and coalesce(claimed_at < now() - make_interval(mins => ${REFUND_SENDING_STALE_MINUTES}), true))
       or (status = 'requested' and coalesce(accepted_at, created_at) < now() - make_interval(hours => ${REFUND_STUCK_HOURS}))
  `;
  return n;
}

/**
 * إغلاق سجل استرداد بلا إرسال، مثل التسوية خارج البوابة. لا يغيّر الطلب.
 * يُسمح به لنتيجة مجهولة حتى لا يعلق السجل إن لم تجب البوابة، بعد أن يراجع المالك قائمة الاستردادات في لوحتها.
 */
export async function dismissRefund(input: { refundId: string; adminId: string; reason: string; ip?: string }): Promise<boolean> {
  return sql.begin(async (db) => {
    const [ref] = await db<{ order_id: string }[]>`select order_id from refunds where id = ${input.refundId}`;
    if (!ref) return false;
    await db`select id from orders where id = ${ref.order_id} for update`;
    const [row] = await db<{ id: string }[]>`
      update refunds set status = 'dismissed', claimed_at = null
      where id = ${input.refundId}
        and (status in ('failed', 'not_sent', 'recorded', 'unknown')
          or (status = 'sending' and coalesce(claimed_at < now() - make_interval(mins => ${REFUND_SENDING_STALE_MINUTES}), true)))
      returning id
    `;
    if (!row) return false;
    await audit({ actorId: input.adminId, action: "order.refund_dismissed", entityType: "order", entityId: ref.order_id, reason: input.reason, metadata: { refundId: row.id }, ip: input.ip ?? null }, db);
    return true;
  });
}
